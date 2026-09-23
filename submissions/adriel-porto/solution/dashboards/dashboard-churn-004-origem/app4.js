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
  const scopedTickets = (state.raw.support_tickets || []).filter((t) => scopedIds.has(t.account_id));
  const scopedSubIds = new Set(scopedSubs.map((s) => s.subscription_id));
  const scopedUsage = (state.raw.feature_usage || []).filter((u) => scopedSubIds.has(u.subscription_id));

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
  renderChurnOrigin(scopedAccounts, scopedSubs, scopedChurnEvents, scopedTickets, scopedUsage);
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

// ---------- aba "Origem do Churn" — reproduz o relatório em PDF, ao vivo, pelo filtro atual ----------
// Metodologia própria desta aba (diferente do funil de faturamento acima, que rastreia
// evento a evento linha por linha): aqui cada churn_event é ligado à subscription cancelada
// (churn_flag=true) da MESMA conta cuja end_date fica mais perto da churn_date — é o mesmo
// método usado no relatório em PDF, pra dar pra comparar número com número.

function fmtPct(n, digits) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toFixed(digits === undefined ? 1 : digits) + "%";
}

function safeDiv(a, b) {
  return b ? a / b : null;
}

function avgOf(arr) {
  const nums = arr.filter((v) => v !== null && v !== undefined && !isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

// ---- 2. integridade dos joins (sempre sobre os arquivos inteiros carregados) ----

function computeJoinIntegrity() {
  const accounts = state.raw.accounts || [];
  const subs = state.raw.subscriptions || [];
  const usage = state.raw.feature_usage || [];
  const tickets = state.raw.support_tickets || [];
  const churns = state.raw.churn_events || [];

  function matchRate(childRows, childKey, parentRows, parentKey) {
    const childKeys = new Set(childRows.map((r) => r[childKey]).filter((v) => v !== undefined && v !== null && v !== ""));
    const parentKeys = new Set(parentRows.map((r) => r[parentKey]).filter((v) => v !== undefined && v !== null && v !== ""));
    let matched = 0;
    childKeys.forEach((k) => { if (parentKeys.has(k)) matched += 1; });
    return { distinct: childKeys.size, matched, orphans: childKeys.size - matched };
  }

  function countDuplicates(rows, key) {
    const seen = new Set();
    let dups = 0;
    rows.forEach((r) => {
      const v = r[key];
      if (v === undefined || v === null || v === "") return;
      if (seen.has(v)) dups += 1; else seen.add(v);
    });
    return dups;
  }

  return {
    checks: [
      { label: "subscriptions.account_id → accounts.account_id", ...matchRate(subs, "account_id", accounts, "account_id") },
      { label: "feature_usage.subscription_id → subscriptions.subscription_id", ...matchRate(usage, "subscription_id", subs, "subscription_id") },
      { label: "support_tickets.account_id → accounts.account_id", ...matchRate(tickets, "account_id", accounts, "account_id") },
      { label: "churn_events.account_id → accounts.account_id", ...matchRate(churns, "account_id", accounts, "account_id") },
    ],
    pkDuplicates: {
      subscription_id: countDuplicates(subs, "subscription_id"),
      "accounts.account_id": countDuplicates(accounts, "account_id"),
      churn_event_id: countDuplicates(churns, "churn_event_id"),
    },
    counts: {
      accounts: accounts.length, subscriptions: subs.length, feature_usage: usage.length,
      support_tickets: tickets.length, churn_events: churns.length,
    },
  };
}

function renderJoinIntegrity() {
  const data = computeJoinIntegrity();
  let html = "<thead><tr><th>Ligação (FK → PK)</th><th>Chaves distintas</th><th>Casadas</th><th>Órfãs</th><th>Status</th></tr></thead><tbody>";
  data.checks.forEach((c) => {
    const pct = safeDiv(c.matched, c.distinct);
    const ok = c.orphans === 0;
    html += `<tr><td>${c.label}</td><td>${c.distinct}</td><td>${c.matched}</td><td>${c.orphans}</td>
      <td><span class="badge ${ok ? "info" : "warn"}">${pct === null ? "—" : fmtPct(pct * 100, 1)} ${ok ? "OK" : "ÓRFÃOS!"}</span></td></tr>`;
  });
  html += "</tbody>";
  document.getElementById("originJoinTable").innerHTML = html;

  const dupParts = Object.entries(data.pkDuplicates).map(([k, v]) => `${k}: ${v}`).join(" · ");
  const anyDup = Object.values(data.pkDuplicates).some((v) => v > 0);
  document.getElementById("originJoinNotes").innerHTML = `
    <div class="callout-box ${anyDup ? "warn" : "good"}">
      <b>Chaves primárias duplicadas —</b> ${dupParts}. ${anyDup ? "Tem duplicata: revise a fonte antes de confiar nos totais." : "Nenhuma duplicata — pode confiar nos totais abaixo."}
      Arquivos carregados agora: accounts (${data.counts.accounts}), subscriptions (${data.counts.subscriptions}), feature_usage (${data.counts.feature_usage}), support_tickets (${data.counts.support_tickets}), churn_events (${data.counts.churn_events}).
    </div>`;
}

// ---- ligar cada churn_event à subscription cancelada mais próxima da mesma conta ----

function matchChurnToSubscription(churnEvents, subs) {
  const churnedByAccount = {};
  subs.forEach((s) => {
    if (!isTrue(s.churn_flag)) return;
    (churnedByAccount[s.account_id] = churnedByAccount[s.account_id] || []).push(s);
  });

  return churnEvents.map((ev) => {
    const cands = churnedByAccount[ev.account_id] || [];
    let best = null, bestDist = Infinity;
    cands.forEach((s) => {
      if (!s.end_date || !ev.churn_date) return;
      const dist = Math.abs(new Date(s.end_date) - new Date(ev.churn_date));
      if (!isNaN(dist) && dist < bestDist) { bestDist = dist; best = s; }
    });
    if (!best) return { ...ev, matched: false, mrr_amount: 0, arr_amount: 0 };
    return { ...ev, matched: true, mrr_amount: toNum(best.mrr_amount), arr_amount: toNum(best.arr_amount) };
  });
}

// ---- agrupamentos genéricos ----

function groupBy(rows, keyFn) {
  const m = {};
  rows.forEach((r) => {
    const k = keyFn(r);
    (m[k] = m[k] || []).push(r);
  });
  return m;
}

function breakdownByAccountField(matchedEvents, accountsById, field) {
  const groups = {};
  matchedEvents.forEach((ev) => {
    const acc = accountsById[ev.account_id];
    const key = acc ? (acc[field] || "(vazio)") : "(conta desconhecida)";
    if (!groups[key]) groups[key] = { key, eventos: 0, arrPerdido: 0 };
    groups[key].eventos += 1;
    groups[key].arrPerdido += ev.arr_amount || 0;
  });
  const total = Object.values(groups).reduce((a, g) => a + g.arrPerdido, 0);
  return Object.values(groups)
    .map((g) => ({ ...g, pctArr: safeDiv(g.arrPerdido, total), arrMedio: safeDiv(g.arrPerdido, g.eventos) }))
    .sort((a, b) => b.arrPerdido - a.arrPerdido);
}

function churnRateByAccountField(accounts, field) {
  const groups = {};
  accounts.forEach((a) => {
    const key = a[field] || "(vazio)";
    if (!groups[key]) groups[key] = { key, total: 0, churned: 0 };
    groups[key].total += 1;
    if (isTrue(a.churn_flag)) groups[key].churned += 1;
  });
  return Object.values(groups)
    .map((g) => ({ ...g, rate: safeDiv(g.churned, g.total) }))
    .sort((a, b) => (b.rate || 0) - (a.rate || 0));
}

// ---- tendência trimestral, bruta e normalizada pela base ativa naquele trimestre ----

function monthNum(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 12 + (parseInt(m[2], 10) - 1);
}

function quarterLabel(mn) {
  const year = Math.floor(mn / 12);
  const q = Math.floor((mn % 12) / 3) + 1;
  return `${year} Q${q}`;
}

function computeQuarterlyTrend(subs, churns) {
  const monthNums = [];
  subs.forEach((s) => { const mn = monthNum(s.start_date); if (mn !== null) monthNums.push(mn); });
  churns.forEach((c) => { const mn = monthNum(c.churn_date); if (mn !== null) monthNums.push(mn); });
  if (!monthNums.length) return [];

  const minMn = Math.min(...monthNums), maxMn = Math.max(...monthNums);
  const minQStart = minMn - (minMn % 3);
  const maxQStart = maxMn - (maxMn % 3);

  const rows = [];
  for (let qStart = minQStart; qStart <= maxQStart; qStart += 3) {
    const qEnd = qStart + 2;
    const activeCount = subs.filter((s) => {
      const sMn = monthNum(s.start_date);
      if (sMn === null || sMn > qEnd) return false;
      const eMn = s.end_date ? monthNum(s.end_date) : Infinity;
      return eMn === null ? true : eMn >= qStart;
    }).length;
    const churnCount = churns.filter((c) => {
      const mn = monthNum(c.churn_date);
      return mn !== null && mn >= qStart && mn <= qEnd;
    }).length;
    rows.push({ label: quarterLabel(qStart), activeCount, churnCount, rate: safeDiv(churnCount, activeCount) });
  }
  return rows;
}

// ---- função central: monta tudo que a aba precisa, a partir da população já filtrada ----

function computeChurnOrigin(scopedAccounts, scopedSubs, scopedChurnEvents, scopedTickets, scopedUsage) {
  const accountsById = {};
  scopedAccounts.forEach((a) => { accountsById[a.account_id] = a; });

  const matched = matchChurnToSubscription(scopedChurnEvents, scopedSubs);
  const matchedOnly = matched.filter((e) => e.matched);
  const matchRate = safeDiv(matchedOnly.length, matched.length);

  const arrPerdido = matchedOnly.reduce((a, e) => a + e.arr_amount, 0);
  const mrrPerdido = matchedOnly.reduce((a, e) => a + e.mrr_amount, 0);
  const arrAtivo = scopedSubs.filter((s) => !isTrue(s.churn_flag)).reduce((a, s) => a + toNum(s.arr_amount), 0);
  const contasComChurn = scopedAccounts.filter((a) => isTrue(a.churn_flag)).length;
  const taxaChurnContas = safeDiv(contasComChurn, scopedAccounts.length);
  const reembolsoTotal = scopedChurnEvents.reduce((a, e) => a + toNum(e.refund_amount_usd), 0);

  // por reason_code
  const reasonGroups = {};
  matched.forEach((ev) => {
    const key = ev.reason_code || "(vazio)";
    if (!reasonGroups[key]) reasonGroups[key] = { key, eventos: 0, arrPerdido: 0 };
    reasonGroups[key].eventos += 1;
    if (ev.matched) reasonGroups[key].arrPerdido += ev.arr_amount;
  });
  const totalReasonArr = Object.values(reasonGroups).reduce((a, g) => a + g.arrPerdido, 0);
  const byReason = Object.values(reasonGroups)
    .map((g) => ({ ...g, pctArr: safeDiv(g.arrPerdido, totalReasonArr) }))
    .sort((a, b) => b.arrPerdido - a.arrPerdido);

  const byIndustry = breakdownByAccountField(matched, accountsById, "industry");
  const byPlanTier = breakdownByAccountField(matched, accountsById, "plan_tier");
  const byReferral = breakdownByAccountField(matched, accountsById, "referral_source");
  const byCountry = breakdownByAccountField(matched, accountsById, "country");

  const churnRateIndustry = churnRateByAccountField(scopedAccounts, "industry");
  const churnRatePlanTier = churnRateByAccountField(scopedAccounts, "plan_tier");
  const churnRateReferral = churnRateByAccountField(scopedAccounts, "referral_source");
  const churnRateCountry = churnRateByAccountField(scopedAccounts, "country");

  // precedentes
  const nEv = scopedChurnEvents.length || 1;
  const precedentes = {
    upgrade: safeDiv(scopedChurnEvents.filter((e) => isTrue(e.preceding_upgrade_flag)).length, scopedChurnEvents.length),
    downgrade: safeDiv(scopedChurnEvents.filter((e) => isTrue(e.preceding_downgrade_flag)).length, scopedChurnEvents.length),
    reativacao: safeDiv(scopedChurnEvents.filter((e) => isTrue(e.is_reactivation)).length, scopedChurnEvents.length),
  };

  // suporte: agrega por conta, depois compara grupos churn_flag true/false (só contas com >=1 ticket)
  const ticketsByAccount = groupBy(scopedTickets, (t) => t.account_id);
  const ticketStatsByAccount = Object.entries(ticketsByAccount).map(([accId, rows]) => {
    const sats = rows.map((r) => toNum(r.satisfaction_score)).filter((v, i) => rows[i].satisfaction_score !== "" && rows[i].satisfaction_score !== undefined);
    return {
      account_id: accId,
      n: rows.length,
      avgSat: avgOf(rows.map((r) => (r.satisfaction_score === "" || r.satisfaction_score === undefined ? null : toNum(r.satisfaction_score)))),
      pctEsc: avgOf(rows.map((r) => (isTrue(r.escalation_flag) ? 1 : 0))),
      avgRes: avgOf(rows.map((r) => (r.resolution_time_hours === "" || r.resolution_time_hours === undefined ? null : toNum(r.resolution_time_hours)))),
      churn_flag: isTrue((accountsById[accId] || {}).churn_flag),
    };
  });
  function supportGroup(flag) {
    // "contas" conta TODAS as contas do grupo (mesmo sem ticket nenhum) — só as médias
    // são tiradas das que têm pelo menos 1 ticket, igual ao .mean() do pandas ignorando NaN.
    const totalContas = scopedAccounts.filter((a) => isTrue(a.churn_flag) === flag).length;
    const g = ticketStatsByAccount.filter((s) => s.churn_flag === flag);
    return {
      contas: totalContas,
      ticketsPorConta: avgOf(g.map((s) => s.n)),
      satisfacao: avgOf(g.map((s) => s.avgSat)),
      pctEscalonamento: avgOf(g.map((s) => s.pctEsc)),
      resolucaoH: avgOf(g.map((s) => s.avgRes)),
    };
  }
  const suporteComparacao = { ativas: supportGroup(false), canceladas: supportGroup(true) };

  // uso do produto: agrega por subscription_id, compara churn_flag da própria subscription
  const usageBySub = groupBy(scopedUsage, (u) => u.subscription_id);
  const subsById = {};
  scopedSubs.forEach((s) => { subsById[s.subscription_id] = s; });
  const usageStatsBySub = Object.entries(usageBySub).map(([subId, rows]) => ({
    subscription_id: subId,
    totalUsage: rows.reduce((a, r) => a + toNum(r.usage_count), 0),
    avgDuration: avgOf(rows.map((r) => toNum(r.usage_duration_secs))),
    totalErrors: rows.reduce((a, r) => a + toNum(r.error_count), 0),
    nEventos: rows.length,
    churn_flag: isTrue((subsById[subId] || {}).churn_flag),
  }));
  function usageGroup(flag) {
    // "assinaturas" conta TODAS as assinaturas do grupo (mesmo sem uso registrado) — só as
    // médias são tiradas das que têm pelo menos 1 evento de uso, igual ao pandas.
    const totalSubs = scopedSubs.filter((s) => isTrue(s.churn_flag) === flag).length;
    const g = usageStatsBySub.filter((s) => s.churn_flag === flag);
    return {
      assinaturas: totalSubs,
      usoMedio: avgOf(g.map((s) => s.totalUsage)),
      duracaoMedia: avgOf(g.map((s) => s.avgDuration)),
      errosMedio: avgOf(g.map((s) => s.totalErrors)),
      eventosMedio: avgOf(g.map((s) => s.nEventos)),
    };
  }
  const usoComparacao = { ativas: usageGroup(false), canceladas: usageGroup(true) };

  const tendencia = computeQuarterlyTrend(scopedSubs, scopedChurnEvents);

  return {
    matchRate, arrPerdido, mrrPerdido, arrAtivo, contasComChurn, taxaChurnContas, reembolsoTotal,
    totalEventos: scopedChurnEvents.length,
    byReason, byIndustry, byPlanTier, byReferral, byCountry,
    churnRateIndustry, churnRatePlanTier, churnRateReferral, churnRateCountry,
    precedentes, suporteComparacao, usoComparacao, tendencia,
  };
}

// ---- render de cada bloco da aba ----

function renderOriginBars(containerId, rows, valueKey, labelFn, colorClass) {
  const el = document.getElementById(containerId);
  if (!rows.length) { el.innerHTML = '<p class="hint">Sem dados suficientes no filtro atual.</p>'; return; }
  const max = Math.max(...rows.map((r) => r[valueKey] || 0));
  el.innerHTML = rows.map((r) => `
    <div class="origin-bar-row">
      <div class="origin-bar-label">${r.key}</div>
      <div class="origin-bar-track"><div class="origin-bar-fill ${colorClass || ""}" style="width:${max ? ((r[valueKey] || 0) / max * 100).toFixed(1) : 0}%"></div></div>
      <div class="origin-bar-val">${labelFn(r)}</div>
    </div>`).join("");
}

function renderBreakdownTable(elId, rows, churnRateRows) {
  const rateByKey = {};
  (churnRateRows || []).forEach((r) => { rateByKey[r.key] = r.rate; });
  let html = "<thead><tr><th></th><th>Eventos</th><th>ARR perdido</th><th>% do total</th><th>ARR médio/evento</th><th>Taxa de churn de contas</th></tr></thead><tbody>";
  rows.forEach((r) => {
    html += `<tr><td>${r.key}</td><td>${r.eventos}</td><td class="neg">${fmtMoney(r.arrPerdido)}</td><td>${fmtPct((r.pctArr || 0) * 100)}</td><td>${r.arrMedio === null ? "—" : fmtMoney(r.arrMedio)}</td><td>${fmtPct((rateByKey[r.key] || 0) * 100)}</td></tr>`;
  });
  html += "</tbody>";
  document.getElementById(elId).innerHTML = html;
}

function renderChurnOrigin(scopedAccounts, scopedSubs, scopedChurnEvents, scopedTickets, scopedUsage) {
  if (!document.getElementById("tab-origem")) return;
  if (!scopedAccounts.length) {
    document.getElementById("originExecSummary").innerHTML = '<p class="hint">Nenhuma conta no filtro atual.</p>';
    return;
  }

  const d = computeChurnOrigin(scopedAccounts, scopedSubs, scopedChurnEvents, scopedTickets, scopedUsage);

  // 1. sumário executivo dinâmico
  const summaryBits = [];
  if (d.byReason.length) {
    const pcts = d.byReason.map((r) => (r.pctArr || 0) * 100);
    const range = Math.max(...pcts) - Math.min(...pcts);
    summaryBits.push(`<div class="callout-box ${range < 15 ? "good" : "insight"}">
      <b>${range < 15 ? "Motivo espalhado, não concentrado." : "Há um motivo dominante."}</b>
      Entre os ${d.byReason.length} motivos declarados, a fatia de ARR perdido vai de ${fmtPct(Math.min(...pcts))} a ${fmtPct(Math.max(...pcts))}
      (maior: <span class="origin-highlight">${d.byReason[0].key}</span>).</div>`);
  }
  if (d.byIndustry.length > 1 && d.churnRateIndustry.length > 1) {
    const maxAvg = [...d.byIndustry].sort((a, b) => (b.arrMedio || 0) - (a.arrMedio || 0))[0];
    const maxRate = d.churnRateIndustry[0];
    if (maxAvg && maxRate && maxAvg.key !== maxRate.key) {
      summaryBits.push(`<div class="callout-box insight"><b>${maxRate.key}</b> tem a maior taxa de churn de contas (${fmtPct((maxRate.rate || 0) * 100)}), mas quem perde o maior ticket médio por evento é <b>${maxAvg.key}</b> (${fmtMoney(maxAvg.arrMedio)}/evento) — são dois problemas diferentes: volume num setor, concentração de risco no outro.</div>`);
    }
  }
  if (d.churnRateReferral.length > 1) {
    const top = d.churnRateReferral[0];
    const bottom = d.churnRateReferral[d.churnRateReferral.length - 1];
    if (top.rate && bottom.rate) {
      summaryBits.push(`<div class="callout-box insight"><b>Canal "${top.key}"</b> cancela a ${(top.rate / bottom.rate).toFixed(1)}x a taxa do canal "${bottom.key}"</b> (${fmtPct(top.rate * 100)} vs ${fmtPct(bottom.rate * 100)}).</div>`);
    }
  }
  if (d.tendencia.length >= 4) {
    const usable = d.tendencia.filter((t) => t.activeCount >= 50); // ignora trimestres com base muito pequena/ruidosa
    if (usable.length >= 2) {
      const rates = usable.map((t) => t.rate * 100);
      const min = Math.min(...rates), max = Math.max(...rates);
      const variacao = max - min;
      summaryBits.push(`<div class="callout-box good"><b>Taxa de churn trimestral normalizada pela base ativa</b> oscila entre ${fmtPct(min)} e ${fmtPct(max)} nos trimestres com base suficiente (≥50 assinaturas ativas) — variação de ${fmtPct(variacao)}. Compare com os números <i>brutos</i> na tabela da seção 6: se a sensação era de "explosão", normalmente é só efeito de crescimento da base.</div>`);
    }
  }
  document.getElementById("originExecSummary").innerHTML = summaryBits.join("") || '<p class="hint">Dados insuficientes no filtro atual pra gerar o sumário.</p>';

  // 2. integridade dos joins (global, não depende do filtro)
  renderJoinIntegrity();

  // 3. panorama financeiro
  document.getElementById("originFinanceKpis").innerHTML = `
    <div class="kpi-card down"><span class="kpi-label">ARR perdido (eventos casados)</span><span class="kpi-value">${fmtMoney(d.arrPerdido)}</span><span class="kpi-sub">${fmtPct((d.matchRate || 0) * 100)} dos ${d.totalEventos} eventos casados a uma subscription</span></div>
    <div class="kpi-card up"><span class="kpi-label">ARR ativo hoje</span><span class="kpi-value">${fmtMoney(d.arrAtivo)}</span></div>
    <div class="kpi-card ${d.arrAtivo ? "down" : ""}"><span class="kpi-label">Perdido / ativo</span><span class="kpi-value">${d.arrAtivo ? fmtPct((d.arrPerdido / d.arrAtivo) * 100) : "—"}</span></div>
    <div class="kpi-card down"><span class="kpi-label">Taxa de churn de contas</span><span class="kpi-value">${fmtPct((d.taxaChurnContas || 0) * 100)}</span><span class="kpi-sub">${d.contasComChurn} de ${scopedAccounts.length} contas</span></div>
    <div class="kpi-card"><span class="kpi-label">Reembolsos no filtro</span><span class="kpi-value">${fmtMoney(d.reembolsoTotal)}</span></div>
  `;
  renderOriginBars("originReasonBars", d.byReason, "arrPerdido", (r) => `${fmtPct((r.pctArr || 0) * 100)} · ${fmtMoney(r.arrPerdido)}`);

  // 4. onde o dinheiro sai
  renderBreakdownTable("originIndustryTable", d.byIndustry, d.churnRateIndustry);
  renderBreakdownTable("originPlanTable", d.byPlanTier, d.churnRatePlanTier);
  renderOriginBars("originReferralBars", d.churnRateReferral, "rate", (r) => fmtPct((r.rate || 0) * 100), "orange");
  renderBreakdownTable("originCountryTable", d.byCountry, d.churnRateCountry);

  // 5. sinais de comportamento
  document.getElementById("originPrecedentsTable").innerHTML = `
    <thead><tr><th>Padrão</th><th>% dos eventos de churn</th></tr></thead>
    <tbody>
      <tr><td>Teve um <b>upgrade</b> pouco antes de cancelar</td><td>${fmtPct((d.precedentes.upgrade || 0) * 100)}</td></tr>
      <tr><td>Teve um <b>downgrade</b> pouco antes de cancelar</td><td>${fmtPct((d.precedentes.downgrade || 0) * 100)}</td></tr>
      <tr><td>É uma <b>reativação</b> (já tinha cancelado antes)</td><td>${fmtPct((d.precedentes.reativacao || 0) * 100)}</td></tr>
    </tbody>`;

  const sc = d.suporteComparacao;
  document.getElementById("originSupportTable").innerHTML = `
    <thead><tr><th></th><th>Contas</th><th>Tickets/conta</th><th>Satisfação média (1–5)</th><th>% escalados</th><th>Resolução média (h)</th></tr></thead>
    <tbody>
      <tr><td>Contas ativas</td><td>${sc.ativas.contas}</td><td>${sc.ativas.ticketsPorConta === null ? "—" : sc.ativas.ticketsPorConta.toFixed(2)}</td><td>${sc.ativas.satisfacao === null ? "—" : sc.ativas.satisfacao.toFixed(2)}</td><td>${fmtPct((sc.ativas.pctEscalonamento || 0) * 100)}</td><td>${sc.ativas.resolucaoH === null ? "—" : sc.ativas.resolucaoH.toFixed(1) + "h"}</td></tr>
      <tr><td>Contas que cancelaram</td><td>${sc.canceladas.contas}</td><td>${sc.canceladas.ticketsPorConta === null ? "—" : sc.canceladas.ticketsPorConta.toFixed(2)}</td><td>${sc.canceladas.satisfacao === null ? "—" : sc.canceladas.satisfacao.toFixed(2)}</td><td>${fmtPct((sc.canceladas.pctEscalonamento || 0) * 100)}</td><td>${sc.canceladas.resolucaoH === null ? "—" : sc.canceladas.resolucaoH.toFixed(1) + "h"}</td></tr>
    </tbody>`;

  const uc = d.usoComparacao;
  document.getElementById("originUsageTable").innerHTML = `
    <thead><tr><th></th><th>Assinaturas</th><th>Uso médio total</th><th>Duração média (s)</th><th>Erros médios</th><th>Eventos médios</th></tr></thead>
    <tbody>
      <tr><td>Ativas</td><td>${uc.ativas.assinaturas}</td><td>${uc.ativas.usoMedio === null ? "—" : uc.ativas.usoMedio.toFixed(1)}</td><td>${uc.ativas.duracaoMedia === null ? "—" : Math.round(uc.ativas.duracaoMedia)}</td><td>${uc.ativas.errosMedio === null ? "—" : uc.ativas.errosMedio.toFixed(2)}</td><td>${uc.ativas.eventosMedio === null ? "—" : uc.ativas.eventosMedio.toFixed(2)}</td></tr>
      <tr><td>Canceladas</td><td>${uc.canceladas.assinaturas}</td><td>${uc.canceladas.usoMedio === null ? "—" : uc.canceladas.usoMedio.toFixed(1)}</td><td>${uc.canceladas.duracaoMedia === null ? "—" : Math.round(uc.canceladas.duracaoMedia)}</td><td>${uc.canceladas.errosMedio === null ? "—" : uc.canceladas.errosMedio.toFixed(2)}</td><td>${uc.canceladas.eventosMedio === null ? "—" : uc.canceladas.eventosMedio.toFixed(2)}</td></tr>
    </tbody>`;

  // 6. tendência
  let trendHtml = "<thead><tr><th>Trimestre</th><th>Eventos de churn</th><th>Assinaturas ativas no período</th><th>Taxa normalizada</th></tr></thead><tbody>";
  d.tendencia.forEach((t) => {
    const noisy = t.activeCount < 50;
    trendHtml += `<tr><td>${t.label}</td><td>${t.churnCount}</td><td>${t.activeCount}</td><td>${fmtPct((t.rate || 0) * 100)}${noisy ? " *" : ""}</td></tr>`;
  });
  trendHtml += "</tbody>";
  document.getElementById("originTrendTable").innerHTML = trendHtml;

  // 7. conclusão (recalculada a partir dos mesmos achados do sumário)
  document.getElementById("originConclusion").innerHTML = `
    <div class="callout-box">Esta aba usa a MESMA metodologia do relatório em PDF entregue antes (churn_event ligado à subscription cancelada mais próxima por data), aplicada ao recorte atual do filtro/funil. Se os números aqui baterem com os do PDF quando o filtro estiver em "todas as 500 contas", a conta está correta. Mude o filtro pra ver como cada achado se comporta em cada fatia da base — é a forma de conferir, na prática, tudo que foi dito no relatório.</div>`;
}

// ---------- início ----------

loadAllFromDisk();
