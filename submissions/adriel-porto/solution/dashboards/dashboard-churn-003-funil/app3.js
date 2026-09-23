// Diagnóstico de Cancelamentos (Churn) — leitura sempre somente-leitura dos 5 CSVs originais.
// Nada aqui grava de volta nos arquivos. Todo cálculo é derivado em memória.

if (window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
  Chart.defaults.set("plugins.datalabels", { display: false });
}

const FILES = {
  accounts: "../data/ravenstack_accounts.csv",
  subscriptions: "../data/ravenstack_subscriptions.csv",
  feature_usage: "../data/ravenstack_feature_usage.csv",
  support_tickets: "../data/ravenstack_support_tickets.csv",
  churn_events: "../data/ravenstack_churn_events.csv",
};

const state = {
  raw: {},       // { accounts: [...rows], subscriptions: [...], ... }
  rawText: {},   // texto original exato de cada CSV, pra download fiel
  columns: {},   // colunas de cada tabela
  loaded: false,
  activeTab: "sumario",
  includeTrialInNewCustomers: false,
  derived: null, // resultado dos cálculos (bridge, ranking, qualidade)

  // funil progressivo: cada estágio salvo filtra a população do estágio anterior
  funnelStages: [],           // [{ label, accountIds: Set, summary: {...} }]
  editorCategorical: {},      // { coluna: Set(valores marcados) } — categorias, pode marcar vários
  editorBoolean: {},          // { coluna: 'all' | 'true' | 'false' } — nunca os dois ao mesmo tempo
  categoricalColumns: [],
  booleanColumns: [],

  singleAccountId: null,      // quando marcado, ignora os outros filtros e mostra só essa conta
};

const CATEGORICAL_FILTER_CANDIDATES = ["industry", "country", "referral_source", "plan_tier"];
const BOOLEAN_FILTER_CANDIDATES = ["is_trial", "churn_flag"];

// segmentos que apareceram na análise de churn por quantidade x valor
const FILTER_PRESETS = [
  { label: "Direto + Basic", boolean: { is_trial: "false" }, categorical: { plan_tier: ["Basic"] } },
  { label: "Direto + Pro", boolean: { is_trial: "false" }, categorical: { plan_tier: ["Pro"] } },
  { label: "Direto + Enterprise", boolean: { is_trial: "false" }, categorical: { plan_tier: ["Enterprise"] } },
  { label: "Trial + Basic", boolean: { is_trial: "true" }, categorical: { plan_tier: ["Basic"] } },
  { label: "Trial + Pro", boolean: { is_trial: "true" }, categorical: { plan_tier: ["Pro"] } },
  { label: "Trial + Enterprise", boolean: { is_trial: "true" }, categorical: { plan_tier: ["Enterprise"] } },
];

const FRIENDLY_COLUMN_LABEL = {
  industry: "Setor",
  country: "País",
  referral_source: "Canal de aquisição",
  plan_tier: "Plano",
  is_trial: "Em teste gratuito",
  churn_flag: "Já cancelou alguma vez",
};

const dataStatus = document.getElementById("dataStatus");
const tabsNav = document.getElementById("tabs");
const appEl = document.getElementById("app");

// ---------- carregar / limpar / importar manualmente ----------

async function loadAllFromDisk() {
  dataStatus.textContent = "Carregando os 5 arquivos originais...";
  dataStatus.className = "";
  try {
    for (const [key, path] of Object.entries(FILES)) {
      const res = await fetch(path + "?_=" + Date.now());
      if (!res.ok) throw new Error(`${path} — HTTP ${res.status}`);
      const text = await res.text();
      state.rawText[key] = text;
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      state.raw[key] = parsed.data;
      state.columns[key] = parsed.meta.fields;
    }
    state.loaded = true;
    dataStatus.textContent = `Carregado: ${Object.entries(state.raw).map(([k, v]) => `${k} (${v.length})`).join(" · ")}`;
    dataStatus.className = "ok";
    tabsNav.hidden = false;
    appEl.hidden = false;
    state.funnelStages = [];
    setupAccountFilters();
    buildAccountSearchList();
    renderFunnel();
    runAnalysis();
  } catch (err) {
    dataStatus.textContent = "Erro ao carregar os arquivos: " + err.message;
    dataStatus.className = "error";
  }
}

document.getElementById("reloadBtn").addEventListener("click", loadAllFromDisk);

document.getElementById("clearBtn").addEventListener("click", () => {
  state.raw = {};
  state.rawText = {};
  state.columns = {};
  state.loaded = false;
  state.derived = null;
  state.funnelStages = [];
  tabsNav.hidden = true;
  appEl.hidden = true;
  document.getElementById("funnelBox").hidden = true;
  document.getElementById("accountFiltersBox").hidden = true;
  dataStatus.textContent = "Dados removidos. Clique em \"Recarregar arquivos originais\" ou importe manualmente.";
  dataStatus.className = "";
});

document.getElementById("manualFile").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const file of files) {
    const key = Object.keys(FILES).find((k) => file.name.includes(k)) ||
      file.name.replace(/\.csv$/i, "");
    const text = await file.text();
    state.rawText[key] = text;
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    state.raw[key] = parsed.data;
    state.columns[key] = parsed.meta.fields;
  }
  state.loaded = Object.keys(state.raw).length > 0;
  dataStatus.textContent = `Importado manualmente: ${Object.keys(state.raw).join(", ")}`;
  dataStatus.className = "ok";
  tabsNav.hidden = false;
  appEl.hidden = false;
  state.funnelStages = [];
  setupAccountFilters();
  buildAccountSearchList();
  renderFunnel();
  runAnalysis();
});

// ---------- filtros por conta (refazem o cálculo inteiro) ----------

function setupAccountFilters() {
  const accounts = state.raw.accounts || [];
  state.categoricalColumns = [];
  state.booleanColumns = [];
  if (!accounts.length) return;

  CATEGORICAL_FILTER_CANDIDATES.forEach((col) => {
    if (!(col in accounts[0])) return;
    const uniques = Array.from(new Set(accounts.map((a) => (a[col] === undefined || a[col] === null ? "" : String(a[col])))));
    if (uniques.length > 1 && uniques.length <= 20) state.categoricalColumns.push(col);
  });
  BOOLEAN_FILTER_CANDIDATES.forEach((col) => {
    if (col in accounts[0]) state.booleanColumns.push(col);
  });

  resetEditor();
  buildPresetButtons();
  document.getElementById("accountFiltersBox").hidden = false;
  document.getElementById("funnelBox").hidden = false;
}

function resetEditor() {
  const accounts = state.raw.accounts || [];
  state.editorCategorical = {};
  state.categoricalColumns.forEach((col) => {
    const uniques = Array.from(new Set(accounts.map((a) => (a[col] === undefined || a[col] === null ? "" : String(a[col])))));
    state.editorCategorical[col] = new Set(uniques);
  });
  state.editorBoolean = {};
  state.booleanColumns.forEach((col) => { state.editorBoolean[col] = "all"; });
  buildAccountFilterUI();
  buildBooleanFilterUI();
}

function buildPresetButtons() {
  const el = document.getElementById("presetButtons");
  el.innerHTML = "";
  FILTER_PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.textContent = preset.label;
    btn.addEventListener("click", () => applyPreset(preset));
    el.appendChild(btn);
  });
}

function applyPreset(preset) {
  const accounts = state.raw.accounts || [];
  state.categoricalColumns.forEach((col) => {
    if (preset.categorical && preset.categorical[col]) {
      state.editorCategorical[col] = new Set(preset.categorical[col]);
    } else {
      const uniques = Array.from(new Set(accounts.map((a) => (a[col] === undefined || a[col] === null ? "" : String(a[col])))));
      state.editorCategorical[col] = new Set(uniques);
    }
  });
  state.booleanColumns.forEach((col) => {
    state.editorBoolean[col] = (preset.boolean && preset.boolean[col]) || "all";
  });
  state.singleAccountId = null;
  document.getElementById("singleAccountInput").value = "";
  state.lastFilterLabel = preset.label;
  buildAccountFilterUI();
  buildBooleanFilterUI();
  runAnalysis();
}

// ---------- editor de filtro: categorias (checkbox) e verdadeiro/falso (Todos/Sim/Não) ----------

function buildBooleanFilterUI() {
  const el = document.getElementById("booleanFilterList");
  el.innerHTML = "";

  state.booleanColumns.forEach((col) => {
    const box = document.createElement("div");
    box.style.minWidth = "170px";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;font-size:13px;margin-bottom:6px;color:var(--accent);";
    title.innerHTML = `${FRIENDLY_COLUMN_LABEL[col] || col} <span class="term-ref">(${col})</span>`;
    box.appendChild(title);

    const group = document.createElement("div");
    group.className = "bool-toggle-group";

    [["all", "Todos"], ["true", "Sim"], ["false", "Não"]].forEach(([value, label]) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.classList.toggle("active", state.editorBoolean[col] === value);
      btn.addEventListener("click", () => {
        state.editorBoolean[col] = value;
        state.lastFilterLabel = null;
        buildBooleanFilterUI();
        runAnalysis();
      });
      group.appendChild(btn);
    });

    box.appendChild(group);
    el.appendChild(box);
  });
}

function buildAccountFilterUI() {
  const el = document.getElementById("accountFilterList");
  el.innerHTML = "";
  const accounts = state.raw.accounts || [];

  state.categoricalColumns.forEach((col) => {
    const box = document.createElement("div");
    box.style.minWidth = "170px";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;font-size:13px;margin-bottom:6px;color:var(--accent);";
    title.innerHTML = `${FRIENDLY_COLUMN_LABEL[col] || col} <span class="term-ref">(${col})</span>`;
    box.appendChild(title);

    const uniques = Array.from(new Set(accounts.map((a) => (a[col] === undefined || a[col] === null ? "" : String(a[col]))))).sort();
    uniques.forEach((val) => {
      const label = document.createElement("label");
      label.className = "filter-value";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.editorCategorical[col].has(val);
      cb.addEventListener("change", () => {
        if (cb.checked) state.editorCategorical[col].add(val);
        else state.editorCategorical[col].delete(val);
        state.lastFilterLabel = null;
        runAnalysis();
      });

      const span = document.createElement("span");
      span.textContent = val === "" ? "(vazio)" : val;

      label.appendChild(cb);
      label.appendChild(span);
      box.appendChild(label);
    });
    el.appendChild(box);
  });
}

document.getElementById("resetAccountFilters").addEventListener("click", () => {
  resetEditor();
  state.lastFilterLabel = "Sem filtro adicional";
  runAnalysis();
});

// ---------- funil: a população "base" é a última coluna salva (ou as 500 contas) ----------

function getFunnelBaseAccountIds() {
  const accounts = state.raw.accounts || [];
  if (state.funnelStages.length) return state.funnelStages[state.funnelStages.length - 1].accountIds;
  return new Set(accounts.map((a) => a.account_id));
}

// aplica o editor (categorias + booleanos) em cima da população base do funil
function getScopedAccountIds() {
  const accounts = state.raw.accounts || [];

  if (state.singleAccountId) {
    return new Set([state.singleAccountId]);
  }

  const base = getFunnelBaseAccountIds();
  const byId = {};
  accounts.forEach((a) => { byId[a.account_id] = a; });

  const ids = new Set();
  base.forEach((accId) => {
    const a = byId[accId];
    if (!a) return;

    const passCategorical = state.categoricalColumns.every((col) => {
      const val = a[col] === undefined || a[col] === null ? "" : String(a[col]);
      return state.editorCategorical[col].has(val);
    });
    const passBoolean = state.booleanColumns.every((col) => {
      const mode = state.editorBoolean[col];
      if (mode === "all") return true;
      const val = String(a[col]).trim().toLowerCase();
      return mode === "true" ? val === "true" : val === "false";
    });

    if (passCategorical && passBoolean) ids.add(accId);
  });
  return ids;
}

function describeCurrentEditorFilter() {
  const parts = [];
  state.booleanColumns.forEach((col) => {
    const mode = state.editorBoolean[col];
    if (mode !== "all") parts.push(`${FRIENDLY_COLUMN_LABEL[col] || col}=${mode === "true" ? "Sim" : "Não"}`);
  });
  state.categoricalColumns.forEach((col) => {
    const accounts = state.raw.accounts || [];
    const totalUniques = new Set(accounts.map((a) => (a[col] === undefined || a[col] === null ? "" : String(a[col])))).size;
    const marked = state.editorCategorical[col];
    if (marked.size < totalUniques) parts.push(`${FRIENDLY_COLUMN_LABEL[col] || col}=${Array.from(marked).join("/")}`);
  });
  return parts.length ? parts.join(", ") : "Sem filtro adicional";
}

// ---------- salvar / desfazer / reiniciar colunas do funil ----------

function computeStageSummary(accountIds) {
  const accounts = (state.raw.accounts || []).filter((a) => accountIds.has(a.account_id));
  const subs = (state.raw.subscriptions || []).filter((s) => accountIds.has(s.account_id));
  const { events } = buildRevenueEvents(subs);
  const currentStatus = computeCurrentStatus(subs);
  const churnRank = rankChurnByValue(events, accounts, subs);
  return {
    total: accounts.length,
    active: currentStatus.active,
    canceled: currentStatus.canceled,
    mrr: currentStatus.currentMrr,
    churnValue: churnRank.totalChurned,
  };
}

document.getElementById("saveFunnelStage").addEventListener("click", () => {
  const ids = getScopedAccountIds();
  const label = state.lastFilterLabel || describeCurrentEditorFilter();
  state.funnelStages.push({
    label,
    accountIds: ids,
    summary: computeStageSummary(ids),
  });
  state.singleAccountId = null;
  document.getElementById("singleAccountInput").value = "";
  state.lastFilterLabel = null;
  resetEditor();
  renderFunnel();
  runAnalysis();
});

document.getElementById("undoFunnelStage").addEventListener("click", () => {
  state.funnelStages.pop();
  resetEditor();
  renderFunnel();
  runAnalysis();
});

document.getElementById("resetFunnel").addEventListener("click", () => {
  state.funnelStages = [];
  resetEditor();
  renderFunnel();
  runAnalysis();
});

function renderFunnel() {
  const el = document.getElementById("funnelColumns");
  const totalAccounts = (state.raw.accounts || []).length;

  const stage0 = document.createElement("div");
  stage0.className = "funnel-col";
  stage0.innerHTML = `
    <div class="funnel-step">Ponto de partida</div>
    <div class="funnel-label">Todas as contas</div>
    <div class="funnel-row"><span>Contas</span><span>${totalAccounts}</span></div>
  `;
  el.innerHTML = "";
  el.appendChild(stage0);

  state.funnelStages.forEach((stage, idx) => {
    const s = stage.summary;
    const col = document.createElement("div");
    col.className = "funnel-col";
    col.innerHTML = `
      <div class="funnel-step">Coluna ${idx + 1}</div>
      <div class="funnel-label">${stage.label}</div>
      <div class="funnel-row"><span>Contas</span><span>${s.total} (${totalAccounts ? ((s.total / totalAccounts) * 100).toFixed(0) : 0}%)</span></div>
      <div class="funnel-row"><span>Ativas</span><span>${s.active}</span></div>
      <div class="funnel-row"><span>Canceladas</span><span>${s.canceled}</span></div>
      <div class="funnel-row"><span>MRR atual</span><span>${fmtMoney(s.mrr)}</span></div>
      <div class="funnel-row"><span>Valor perdido em churn</span><span>${fmtMoney(s.churnValue)}</span></div>
    `;
    el.appendChild(col);
  });
}

// ---------- filtro de cliente único ----------

function accountSearchLabel(a) {
  return `${a.account_name} (${a.account_id})`;
}

function buildAccountSearchList() {
  const accounts = state.raw.accounts || [];
  const listEl = document.getElementById("accountSearchList");
  listEl.innerHTML = accounts.map((a) => `<option value="${accountSearchLabel(a)}"></option>`).join("");
}

const singleAccountInput = document.getElementById("singleAccountInput");

singleAccountInput.addEventListener("input", () => {
  const typed = singleAccountInput.value.trim();
  const accounts = state.raw.accounts || [];
  const match = accounts.find((a) => accountSearchLabel(a) === typed);
  state.singleAccountId = match ? match.account_id : null;
  if (typed && !match) return; // ainda digitando, não recalcula com texto incompleto
  runAnalysis();
});

document.getElementById("clearSingleAccount").addEventListener("click", () => {
  singleAccountInput.value = "";
  state.singleAccountId = null;
  runAnalysis();
});

// ---------- abas ----------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    state.activeTab = btn.dataset.tab;
  });
});

// ---------- helpers ----------

function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function isTrue(v) {
  return String(v).trim().toLowerCase() === "true";
}

function monthOf(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString("pt-BR");
}

// ---------- núcleo do cálculo ----------
// Metodologia (mesma regra pra todo o dashboard):
// por conta, ordena as assinaturas por start_date.
// 1ª linha = entrada (trial se is_trial=true, senão "nova" com pagamento real).
// da 2ª em diante: aumento de mrr vs linha anterior = expansão; queda = contração — datado no start_date daquela linha.
// linha com end_date preenchido + churn_flag=true = cancelamento, datado no end_date, perde o mrr cheio daquela linha.

function buildRevenueEvents(subs) {
  const byAccount = {};
  subs.forEach((row) => {
    if (!row.account_id) return;
    (byAccount[row.account_id] = byAccount[row.account_id] || []).push(row);
  });

  const events = []; // {account_id, date, type, amount, plan}
  const qualityIssues = [];

  Object.entries(byAccount).forEach(([accId, rows]) => {
    const withDate = rows.filter((r) => r.start_date);
    const withoutDate = rows.filter((r) => !r.start_date);
    withoutDate.forEach((r) =>
      qualityIssues.push({ type: "start_date ausente", account_id: accId, detail: `subscription_id ${r.subscription_id || "?"}` })
    );

    const sorted = withDate.sort((a, b) => (a.start_date > b.start_date ? 1 : -1));

    let prevMrr = null;
    let activeNoEnd = 0;

    sorted.forEach((row, idx) => {
      const mrr = toNum(row.mrr_amount);
      const trial = isTrue(row.is_trial);

      if (mrr < 0) {
        qualityIssues.push({ type: "mrr_amount negativo", account_id: accId, detail: `subscription_id ${row.subscription_id}: ${row.mrr_amount}` });
      }
      if (row.end_date && row.end_date < row.start_date) {
        qualityIssues.push({ type: "end_date antes de start_date", account_id: accId, detail: `subscription_id ${row.subscription_id}` });
      }
      if (isTrue(row.churn_flag) && !row.end_date) {
        qualityIssues.push({ type: "churn_flag=true sem end_date", account_id: accId, detail: `subscription_id ${row.subscription_id}` });
      }
      if (!row.end_date) activeNoEnd += 1;

      if (idx === 0) {
        events.push({
          account_id: accId,
          date: row.start_date,
          type: trial ? "trial_entry" : "new",
          amount: mrr,
          plan: row.plan_tier,
        });
      } else {
        const delta = mrr - prevMrr;
        if (delta > 0) {
          events.push({ account_id: accId, date: row.start_date, type: "expansion", amount: delta, plan: row.plan_tier });
        } else if (delta < 0) {
          events.push({ account_id: accId, date: row.start_date, type: "contraction", amount: delta, plan: row.plan_tier });
        }
      }

      if (row.end_date && isTrue(row.churn_flag)) {
        events.push({ account_id: accId, date: row.end_date, type: "churned", amount: -mrr, plan: row.plan_tier });
      }

      prevMrr = mrr;
    });

    if (activeNoEnd > 1) {
      qualityIssues.push({
        type: "múltiplas assinaturas ativas simultâneas (sem end_date)",
        account_id: accId,
        detail: `${activeNoEnd} linhas sem end_date nessa conta`,
      });
    }
  });

  return { events, qualityIssues };
}

function crossCheckAccounts(accounts, subs, churns) {
  const accountIds = new Set(accounts.map((a) => a.account_id));
  const subAccountIds = new Set(subs.map((s) => s.account_id));

  const issues = [];

  const orphanSubs = new Set([...subAccountIds].filter((id) => !accountIds.has(id)));
  orphanSubs.forEach((id) =>
    issues.push({ type: "subscription com account_id inexistente em accounts", account_id: id, detail: "" })
  );

  const accountsNoSub = [...accountIds].filter((id) => !subAccountIds.has(id));
  accountsNoSub.forEach((id) =>
    issues.push({ type: "conta em accounts sem nenhuma assinatura", account_id: id, detail: "" })
  );

  churns.forEach((c) => {
    if (c.account_id && !accountIds.has(c.account_id)) {
      issues.push({ type: "churn_event com account_id inexistente em accounts", account_id: c.account_id, detail: `churn_event_id ${c.churn_event_id}` });
    }
  });

  return issues;
}

function aggregateMonthlyBridge(events) {
  const months = {};
  events.forEach((ev) => {
    if (ev.type === "trial_entry") return; // trial não entra no bridge de receita
    const m = monthOf(ev.date);
    if (!m) return;
    if (!months[m]) months[m] = { new: 0, expansion: 0, contraction: 0, churned: 0, newCount: 0, churnedCount: 0 };
    if (ev.type === "new") { months[m].new += ev.amount; months[m].newCount += 1; }
    if (ev.type === "expansion") months[m].expansion += ev.amount;
    if (ev.type === "contraction") months[m].contraction += ev.amount;
    if (ev.type === "churned") { months[m].churned += ev.amount; months[m].churnedCount += 1; }
  });
  const sortedMonths = Object.keys(months).sort();
  let running = 0;
  const table = sortedMonths.map((m) => {
    const d = months[m];
    const net = d.new + d.expansion + d.contraction + d.churned;
    running += net;
    return { month: m, ...d, net, total: running };
  });
  return table;
}

function aggregateNewCustomers(events, includeTrial) {
  const months = {};
  events.forEach((ev) => {
    const isEntry = ev.type === "new" || (includeTrial && ev.type === "trial_entry");
    if (!isEntry) return;
    const m = monthOf(ev.date);
    if (!m) return;
    if (!months[m]) months[m] = { count: 0, byPlan: {} };
    months[m].count += 1;
    const plan = ev.plan || "(sem plano)";
    months[m].byPlan[plan] = (months[m].byPlan[plan] || 0) + 1;
  });
  const sortedMonths = Object.keys(months).sort();
  return sortedMonths.map((m) => ({ month: m, ...months[m] }));
}

function rankChurnByValue(events, accounts, subs) {
  const byAccount = {};
  events.filter((e) => e.type === "churned").forEach((ev) => {
    byAccount[ev.account_id] = (byAccount[ev.account_id] || 0) + Math.abs(ev.amount);
  });
  const accountsById = {};
  accounts.forEach((a) => (accountsById[a.account_id] = a));

  const totalChurned = Object.values(byAccount).reduce((a, b) => a + b, 0);
  const totalHistoricalRevenue = subs.reduce((a, r) => a + toNum(r.mrr_amount), 0);

  const rows = Object.entries(byAccount)
    .map(([accId, value]) => ({
      account_id: accId,
      account_name: accountsById[accId]?.account_name || "(desconhecida)",
      industry: accountsById[accId]?.industry || "",
      value_lost: value,
      pct_of_total_churn: totalChurned ? (value / totalChurned) * 100 : 0,
    }))
    .sort((a, b) => b.value_lost - a.value_lost);

  return { rows, totalChurned, totalHistoricalRevenue };
}

function fillMonthRange(start, end) {
  const months = [];
  let [y, mo] = start.split("-").map(Number);
  const [ey, emo] = end.split("-").map(Number);
  while (y < ey || (y === ey && mo <= emo)) {
    months.push(`${y}-${String(mo).padStart(2, "0")}`);
    mo += 1;
    if (mo > 12) { mo = 1; y += 1; }
  }
  return months;
}

// Faturamento total do mês = soma do mrr de todas as contas ativas naquele mês.
// "Novo" = contas cujo primeiro mês de vida é esse mês. "Recorrente" = o resto.
// Novo + Recorrente = Total sempre, por construção (serve de conferência).
function computeRevenueSplit(subs, events) {
  const byAccount = {};
  subs.forEach((r) => {
    if (r.account_id && r.start_date) (byAccount[r.account_id] = byAccount[r.account_id] || []).push(r);
  });

  const entryMonth = {};
  events.forEach((e) => {
    if (e.type === "new" || e.type === "trial_entry") entryMonth[e.account_id] = monthOf(e.date);
  });

  const allMonths = new Set();
  subs.forEach((r) => {
    const m1 = monthOf(r.start_date);
    if (m1) allMonths.add(m1);
    const m2 = monthOf(r.end_date);
    if (m2) allMonths.add(m2);
  });
  const monthsList = Array.from(allMonths).sort();
  if (!monthsList.length) return [];
  const lastMonth = monthsList[monthsList.length - 1];
  const filled = fillMonthRange(monthsList[0], lastMonth);

  return filled.map((m) => {
    let total = 0, novo = 0, recorrente = 0, count = 0;
    Object.entries(byAccount).forEach(([acc, rows]) => {
      const candidates = rows.filter((r) => {
        const start = monthOf(r.start_date);
        const end = r.end_date ? monthOf(r.end_date) : lastMonth;
        return start && start <= m && m <= end;
      });
      if (!candidates.length) return;
      candidates.sort((a, b) => (a.start_date > b.start_date ? -1 : 1));
      const mrr = toNum(candidates[0].mrr_amount);
      total += mrr;
      count += 1;
      if (entryMonth[acc] === m) novo += mrr;
      else recorrente += mrr;
    });
    return { month: m, total, novo, recorrente, count };
  });
}

// Status atual da conta = olhar a assinatura MAIS RECENTE dela (por start_date).
// Se essa última linha terminou em cancelamento, a conta está cancelada agora.
// (Bug corrigido: antes eu checava "tem alguma linha cobrindo o último mês", e como
// as contas têm em média 10 linhas sobrepostas, quase todas passavam nesse teste —
// dava 0 conta cancelada, o que não era real, só uma falha na regra.)
function computeCurrentStatus(subs) {
  const byAccount = {};
  subs.forEach((r) => {
    if (r.account_id && r.start_date) (byAccount[r.account_id] = byAccount[r.account_id] || []).push(r);
  });

  let active = 0, canceled = 0, currentMrr = 0;
  Object.values(byAccount).forEach((rows) => {
    const latest = [...rows].sort((a, b) => (a.start_date > b.start_date ? -1 : 1))[0];
    if (latest.end_date && isTrue(latest.churn_flag)) {
      canceled += 1;
    } else {
      active += 1;
      currentMrr += toNum(latest.mrr_amount);
    }
  });
  return { active, canceled, currentMrr };
}

// ---------- render: retrato atual (pizza + totais do filtro) ----------

let statusPieChart = null;

function renderSnapshot(scopedAccounts, revenueSplit, currentStatus) {
  const totalAccounts = scopedAccounts.length;
  const activeAccounts = currentStatus.active;
  const canceledAccounts = currentStatus.canceled;

  document.getElementById("snapshotKpis").innerHTML = `
    <div class="kpi-card">
      <span class="kpi-label">Total de contas no filtro atual</span>
      <span class="kpi-value">${totalAccounts}</span>
    </div>
    <div class="kpi-card up">
      <span class="kpi-label">Contas ativas agora</span>
      <span class="kpi-value">${activeAccounts}</span>
    </div>
    <div class="kpi-card down">
      <span class="kpi-label">Contas canceladas</span>
      <span class="kpi-value">${canceledAccounts}</span>
    </div>
    <div class="kpi-card up">
      <span class="kpi-label">Faturamento mensal recorrente atual <span class="term-ref">(MRR)</span></span>
      <span class="kpi-value">${fmtMoney(currentStatus.currentMrr)}</span>
    </div>
  `;

  if (statusPieChart) statusPieChart.destroy();
  statusPieChart = new Chart(document.getElementById("statusPieChart"), {
    type: "pie",
    data: {
      labels: ["Ativas", "Canceladas"],
      datasets: [{ data: [activeAccounts, canceledAccounts], backgroundColor: ["#7ee0c0", "#ff8686"] }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#c9d3ea" } },
        datalabels: {
          display: true,
          color: "#0b1120",
          font: { weight: "700", size: 13 },
          formatter: (value) => {
            const pct = totalAccounts ? ((value / totalAccounts) * 100).toFixed(0) : 0;
            return `${value}\n(${pct}%)`;
          },
        },
      },
    },
  });
}

function renderRevenueSplitTable() {
  const rows = state.derived.revenueSplit || [];
  let html = "<thead><tr><th>Mês</th><th>Total</th><th>Novo</th><th>Recorrente</th><th>Confere</th></tr></thead><tbody>";
  rows.forEach((r) => {
    const check = Math.round(r.novo + r.recorrente) === Math.round(r.total) ? "✅" : "⚠️";
    html += `<tr><td>${r.month}</td><td>${fmtMoney(r.total)}</td><td class="pos">${fmtMoney(r.novo)}</td><td>${fmtMoney(r.recorrente)}</td><td>${check}</td></tr>`;
  });
  html += "</tbody>";
  document.getElementById("revenueSplitTable").innerHTML = html;
}

function runAnalysis() {
  if (!state.raw.subscriptions) return;

  const scopedIds = getScopedAccountIds();
  const allAccounts = state.raw.accounts || [];
  const scopedAccounts = allAccounts.filter((a) => scopedIds.has(a.account_id));
  const scopedSubs = (state.raw.subscriptions || []).filter((s) => scopedIds.has(s.account_id));
  const scopedChurnEvents = (state.raw.churn_events || []).filter((c) => scopedIds.has(c.account_id));

  const summaryEl = document.getElementById("filterSummary");
  if (summaryEl) {
    summaryEl.textContent = state.singleAccountId
      ? `Mostrando só a conta ${state.singleAccountId} (outros filtros ignorados).`
      : `Analisando ${scopedAccounts.length} de ${allAccounts.length} contas.`;
  }

  const { events, qualityIssues: subIssues } = buildRevenueEvents(scopedSubs);
  const crossIssues = crossCheckAccounts(scopedAccounts, scopedSubs, scopedChurnEvents);
  const bridge = aggregateMonthlyBridge(events);
  const newCustomers = aggregateNewCustomers(events, state.includeTrialInNewCustomers);
  const churnRank = rankChurnByValue(events, scopedAccounts, scopedSubs);
  const revenueSplit = computeRevenueSplit(scopedSubs, events);
  const currentStatus = computeCurrentStatus(scopedSubs);

  state.derived = {
    events,
    bridge,
    newCustomers,
    churnRank,
    revenueSplit,
    currentStatus,
    qualityIssues: [...subIssues, ...crossIssues],
  };

  renderSnapshot(scopedAccounts, revenueSplit, currentStatus);
  renderSummary();
  renderTrendChart();
  renderBridge();
  renderRevenueSplitTable();
  renderNewCustomers();
  renderChurnRank();
  renderQuality();
  renderRawTab();
}

// ---------- render: sumário ----------

let mrrTrendChart = null;

function renderSummary() {
  const { bridge, churnRank } = state.derived;
  if (!bridge.length) return;

  const byChurnCount = [...bridge].sort((a, b) => b.churnedCount - a.churnedCount);
  const byNewCount = [...bridge].sort((a, b) => b.newCount - a.newCount);
  const byNet = [...bridge].sort((a, b) => b.net - a.net);
  const byTotal = [...bridge].sort((a, b) => b.total - a.total);

  const kpis = [
    { label: "Mês com mais cancelamentos", value: byChurnCount[0]?.month, sub: `${byChurnCount[0]?.churnedCount || 0} cancelamentos`, cls: "down" },
    { label: "Mês com menos cancelamentos", value: byChurnCount[byChurnCount.length - 1]?.month, sub: `${byChurnCount[byChurnCount.length - 1]?.churnedCount || 0} cancelamentos`, cls: "up" },
    { label: "Mês com mais vendas (entrada real)", value: byNewCount[0]?.month, sub: `${byNewCount[0]?.newCount || 0} clientes novos`, cls: "up" },
    { label: "Mês com menos vendas", value: byNewCount[byNewCount.length - 1]?.month, sub: `${byNewCount[byNewCount.length - 1]?.newCount || 0} clientes novos`, cls: "down" },
    { label: "Mês com maior saldo novo (net)", value: byNet[0]?.month, sub: fmtMoney(byNet[0]?.net || 0), cls: "up" },
    { label: "Mês com menor saldo novo (net)", value: byNet[byNet.length - 1]?.month, sub: fmtMoney(byNet[byNet.length - 1]?.net || 0), cls: "down" },
    { label: "Mês com maior faturamento recorrente acumulado (MRR)", value: byTotal[0]?.month, sub: fmtMoney(byTotal[0]?.total || 0), cls: "up" },
    { label: "% da receita histórica perdida em cancelamentos (churn)", value: churnRank.totalHistoricalRevenue ? ((churnRank.totalChurned / churnRank.totalHistoricalRevenue) * 100).toFixed(1) + "%" : "—", sub: fmtMoney(churnRank.totalChurned) + " perdidos", cls: "down" },
  ];

  document.getElementById("kpiGrid").innerHTML = kpis
    .map(
      (k) => `<div class="kpi-card ${k.cls}">
        <span class="kpi-label">${k.label}</span>
        <span class="kpi-value">${k.value ?? "—"}</span>
        <span class="kpi-sub">${k.sub ?? ""}</span>
      </div>`
    )
    .join("");

  if (mrrTrendChart) mrrTrendChart.destroy();
  mrrTrendChart = new Chart(document.getElementById("mrrTrendChart"), {
    type: "line",
    data: {
      labels: bridge.map((b) => b.month),
      datasets: [
        {
          label: "MRR total acumulado",
          data: bridge.map((b) => b.total),
          borderColor: "#7ee0c0",
          backgroundColor: "rgba(126,224,192,0.15)",
          fill: true,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#93a0bd" }, grid: { color: "#2a3550" } },
        y: { ticks: { color: "#93a0bd" }, grid: { color: "#2a3550" } },
      },
      plugins: { legend: { labels: { color: "#c9d3ea" } } },
    },
  });
}

// ---------- render: linha do tempo interativa (estilo "Trends") ----------

let trendChart = null;

const TREND_SERIES = [
  { key: "new", label: "Novo", color: "#7ee0c0" },
  { key: "expansion", label: "Expansão (upgrade)", color: "#6ea8fe" },
  { key: "contraction", label: "Contração (downgrade)", color: "#ffb86e" },
  { key: "churned", label: "Cancelado", color: "#ff8686" },
  { key: "net", label: "Saldo do mês (net)", color: "#d4a5ff" },
];

function renderTrendChart() {
  const { bridge } = state.derived;
  const labels = bridge.map((b) => b.month);

  const datasets = TREND_SERIES.map((s) => ({
    key: s.key,
    label: s.label,
    data: bridge.map((b) => b[s.key]),
    borderColor: s.color,
    backgroundColor: s.color,
    pointBackgroundColor: s.color,
    pointRadius: 3,
    pointHoverRadius: 6,
    borderWidth: 2,
    tension: 0.25,
    fill: false,
  }));

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: "#93a0bd" }, grid: { color: "#2a3550" } },
        y: { ticks: { color: "#93a0bd", callback: (v) => fmtMoney(v) }, grid: { color: "#2a3550" } },
      },
    },
  });

  renderTrendLegend(datasets);
}

function renderTrendLegend(datasets) {
  const el = document.getElementById("trendLegend");
  el.innerHTML = "";
  datasets.forEach((ds, idx) => {
    const total = ds.data.reduce((a, b) => a + b, 0);
    const chip = document.createElement("div");
    chip.className = "legend-chip";
    chip.innerHTML = `<span class="dot" style="background:${ds.borderColor}"></span>
      <span class="chip-label">${ds.label}</span>
      <span class="chip-value">${fmtMoney(total)}</span>`;
    chip.addEventListener("click", () => {
      const meta = trendChart.getDatasetMeta(idx);
      meta.hidden = meta.hidden === null ? !trendChart.data.datasets[idx].hidden : !meta.hidden;
      chip.classList.toggle("hidden-series", meta.hidden);

      // total do chip passa a refletir só os meses visíveis (todos, aqui — mas reagimos ao clique pra já deixar pronto quando entrar filtro de período)
      trendChart.update();
    });
    el.appendChild(chip);
  });
}

// ---------- render: faturamento (bridge) ----------

let bridgeChart = null;

function renderBridge() {
  const { bridge } = state.derived;

  if (bridgeChart) bridgeChart.destroy();
  bridgeChart = new Chart(document.getElementById("bridgeChart"), {
    type: "bar",
    data: {
      labels: bridge.map((b) => b.month),
      datasets: [
        { label: "Novo", data: bridge.map((b) => b.new), backgroundColor: "#7ee0c0" },
        { label: "Expansão (upgrade)", data: bridge.map((b) => b.expansion), backgroundColor: "#6ea8fe" },
        { label: "Contração (downgrade)", data: bridge.map((b) => b.contraction), backgroundColor: "#ffb86e" },
        { label: "Cancelado", data: bridge.map((b) => b.churned), backgroundColor: "#ff8686" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: "#93a0bd" }, grid: { color: "#2a3550" } },
        y: { stacked: true, ticks: { color: "#93a0bd" }, grid: { color: "#2a3550" } },
      },
      plugins: { legend: { labels: { color: "#c9d3ea" } } },
    },
  });

  const cols = ["month", "new", "expansion", "contraction", "churned", "net", "total"];
  const labels = { month: "Mês", new: "Novo", expansion: "Expansão", contraction: "Contração", churned: "Cancelado", net: "Saldo", total: "Faturamento total (MRR)" };
  let html = "<thead><tr>" + cols.map((c) => `<th>${labels[c]}</th>`).join("") + "</tr></thead><tbody>";
  bridge.forEach((row) => {
    html += "<tr>" + cols
      .map((c) => {
        if (c === "month") return `<td>${row.month}</td>`;
        const v = row[c];
        const cls = c === "net" ? (v >= 0 ? "pos" : "neg") : "";
        return `<td class="${cls}">${fmtMoney(v)}</td>`;
      })
      .join("") + "</tr>";
  });
  html += "</tbody>";
  document.getElementById("bridgeTable").innerHTML = html;
}

// ---------- render: novos clientes ----------

let newCustomersChart = null;

document.getElementById("includeTrial").addEventListener("change", (e) => {
  state.includeTrialInNewCustomers = e.target.checked;
  if (state.raw.subscriptions) {
    const { events } = buildRevenueEvents();
    state.derived.newCustomers = aggregateNewCustomers(events, state.includeTrialInNewCustomers);
    renderNewCustomers();
  }
});

function renderNewCustomers() {
  const { newCustomers } = state.derived;

  if (newCustomersChart) newCustomersChart.destroy();
  newCustomersChart = new Chart(document.getElementById("newCustomersChart"), {
    type: "bar",
    data: {
      labels: newCustomers.map((n) => n.month),
      datasets: [{ label: "Novos clientes", data: newCustomers.map((n) => n.count), backgroundColor: "#6ea8fe" }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#93a0bd" }, grid: { color: "#2a3550" } },
        y: { ticks: { color: "#93a0bd" }, grid: { color: "#2a3550" } },
      },
      plugins: { legend: { labels: { color: "#c9d3ea" } } },
    },
  });

  const allPlans = Array.from(new Set(newCustomers.flatMap((n) => Object.keys(n.byPlan))));
  let html = "<thead><tr><th>Mês</th><th>Total</th>" + allPlans.map((p) => `<th>${p}</th>`).join("") + "</tr></thead><tbody>";
  newCustomers.forEach((n) => {
    html += `<tr><td>${n.month}</td><td>${n.count}</td>` + allPlans.map((p) => `<td>${n.byPlan[p] || 0}</td>`).join("") + "</tr>";
  });
  html += "</tbody>";
  document.getElementById("newCustomersTable").innerHTML = html;
}

// ---------- render: cancelamentos por valor ----------

function renderChurnRank() {
  const { churnRank } = state.derived;

  document.getElementById("churnValueKpis").innerHTML = `
    <div class="kpi-card down">
      <span class="kpi-label">Total perdido em cancelamentos <span class="term-ref">(churn)</span></span>
      <span class="kpi-value">${fmtMoney(churnRank.totalChurned)}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Contas que já cancelaram</span>
      <span class="kpi-value">${churnRank.rows.length}</span>
    </div>
    <div class="kpi-card down">
      <span class="kpi-label">% da receita histórica</span>
      <span class="kpi-value">${churnRank.totalHistoricalRevenue ? ((churnRank.totalChurned / churnRank.totalHistoricalRevenue) * 100).toFixed(1) : "0"}%</span>
    </div>
  `;

  let cumulative = 0;
  let html = "<thead><tr><th>#</th><th>Conta</th><th>Indústria</th><th>account_id</th><th>Valor perdido</th><th>% do total</th><th>% acumulado</th></tr></thead><tbody>";
  churnRank.rows.slice(0, 50).forEach((r, i) => {
    cumulative += r.pct_of_total_churn;
    html += `<tr><td>${i + 1}</td><td>${r.account_name}</td><td>${r.industry}</td><td>${r.account_id}</td><td class="neg">${fmtMoney(r.value_lost)}</td><td>${r.pct_of_total_churn.toFixed(1)}%</td><td>${cumulative.toFixed(1)}%</td></tr>`;
  });
  html += "</tbody>";
  document.getElementById("churnRankTable").innerHTML = html;
}

// ---------- render: qualidade de dados ----------

function renderQuality() {
  const { qualityIssues } = state.derived;

  const byType = {};
  qualityIssues.forEach((i) => (byType[i.type] = (byType[i.type] || 0) + 1));
  const distinctAccounts = new Set(qualityIssues.map((i) => i.account_id)).size;

  document.getElementById("qualityKpis").innerHTML = `
    <div class="kpi-card down">
      <span class="kpi-label">Total de ocorrências</span>
      <span class="kpi-value">${qualityIssues.length}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Contas afetadas</span>
      <span class="kpi-value">${distinctAccounts}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Tipos de ocorrência</span>
      <span class="kpi-value">${Object.keys(byType).length}</span>
    </div>
  `;

  let html = "<thead><tr><th>Tipo</th><th>account_id</th><th>Detalhe</th></tr></thead><tbody>";
  qualityIssues.slice(0, 500).forEach((i) => {
    html += `<tr><td><span class="badge warn">${i.type}</span></td><td>${i.account_id}</td><td>${i.detail || ""}</td></tr>`;
  });
  html += "</tbody>";
  document.getElementById("qualityTable").innerHTML = html;
  if (qualityIssues.length > 500) {
    document.getElementById("qualityTable").innerHTML += `<tfoot><tr><td colspan="3">... e mais ${qualityIssues.length - 500} ocorrências não mostradas aqui.</td></tr></tfoot>`;
  }
}

// ---------- render: dados brutos sem filtro ----------

document.getElementById("rawTableSelect").addEventListener("change", renderRawTab);

function renderRawTab() {
  const key = document.getElementById("rawTableSelect").value;
  const rows = state.raw[key] || [];
  const cols = state.columns[key] || [];
  const rowsToShow = rows.slice(0, 200);

  let html = "<thead><tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
  rowsToShow.forEach((row) => {
    html += "<tr>" + cols.map((c) => `<td>${row[c] ?? ""}</td>`).join("") + "</tr>";
  });
  html += "</tbody>";
  document.getElementById("rawTable").innerHTML = html;
}

// ---------- downloads ----------

document.getElementById("downloadRawBtn").addEventListener("click", () => {
  const key = document.getElementById("rawTableSelect").value || "subscriptions";
  const text = state.rawText[key];
  if (!text) {
    alert("Vá na aba \"Dados brutos sem filtro\" e escolha qual tabela baixar.");
    return;
  }
  downloadText(text, `${key}_original.csv`);
});

document.getElementById("downloadFilteredBtn").addEventListener("click", () => {
  if (!state.derived) return;
  let csv, name;
  if (state.activeTab === "faturamento") {
    csv = Papa.unparse(state.derived.bridge);
    name = "faturamento_mensal_calculado.csv";
  } else if (state.activeTab === "novos") {
    csv = Papa.unparse(state.derived.newCustomers.map((n) => ({ month: n.month, count: n.count, ...n.byPlan })));
    name = "novos_clientes_por_mes.csv";
  } else if (state.activeTab === "cancelamentos") {
    csv = Papa.unparse(state.derived.churnRank.rows);
    name = "cancelamentos_por_valor.csv";
  } else if (state.activeTab === "qualidade") {
    csv = Papa.unparse(state.derived.qualityIssues);
    name = "avisos_qualidade_dados.csv";
  } else {
    csv = Papa.unparse(state.derived.bridge);
    name = "faturamento_mensal_calculado.csv";
  }
  downloadText(csv, name);
});

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- início ----------

loadAllFromDisk();
