// Origem do tráfego vs churn — leitura somente-leitura dos 5 CSVs originais.
// Investimento em Ads é um valor SIMULADO digitado pelo usuário — não existe no dataset.

const FILES = {
  accounts: "../data/ravenstack_accounts.csv",
  subscriptions: "../data/ravenstack_subscriptions.csv",
  churn_events: "../data/ravenstack_churn_events.csv",
};

const state = { raw: {} };

const dataStatus = document.getElementById("dataStatus");
const appEl = document.getElementById("app");

function toNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function isTrue(v) { return String(v).trim().toLowerCase() === "true"; }
function fmtMoney(n) { return "$" + Math.round(n).toLocaleString("pt-BR"); }
function monthOf(s) { return s ? String(s).slice(0, 7) : null; }

async function loadAll() {
  dataStatus.textContent = "Carregando os 5 arquivos originais...";
  dataStatus.className = "";
  try {
    for (const [key, path] of Object.entries(FILES)) {
      const res = await fetch(path + "?_=" + Date.now());
      if (!res.ok) throw new Error(`${path} — HTTP ${res.status}`);
      const text = await res.text();
      state.raw[key] = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
    }
    dataStatus.textContent = `Carregado: accounts (${state.raw.accounts.length}) · subscriptions (${state.raw.subscriptions.length}) · churn_events (${state.raw.churn_events.length})`;
    dataStatus.className = "ok";
    appEl.hidden = false;
    runAnalysis();
  } catch (err) {
    dataStatus.textContent = "Erro ao carregar: " + err.message;
    dataStatus.className = "error";
  }
}
document.getElementById("reloadBtn").addEventListener("click", loadAll);

// mesma metodologia usada nas ferramentas anteriores: entrada real (1ª assinatura),
// upgrade/downgrade por delta datado, cancelamento por end_date + churn_flag
function buildAccountFinancials(subs) {
  const byAccount = {};
  subs.forEach((r) => { if (r.account_id && r.start_date) (byAccount[r.account_id] = byAccount[r.account_id] || []).push(r); });

  const result = {}; // account_id -> { totalRevenue, churnValue, isNewNonTrial, monthsInData }
  Object.entries(byAccount).forEach(([acc, rows]) => {
    const sorted = [...rows].sort((a, b) => (a.start_date > b.start_date ? 1 : -1));
    let totalRevenue = 0, churnValue = 0;
    sorted.forEach((r) => {
      totalRevenue += toNum(r.mrr_amount);
      if (r.end_date && isTrue(r.churn_flag)) churnValue += toNum(r.mrr_amount);
    });
    result[acc] = {
      totalRevenue,
      churnValue,
      isNewNonTrial: !isTrue(sorted[0].is_trial),
      entryMonth: monthOf(sorted[0].start_date),
    };
  });
  return result;
}

function segmentByOrigin(accounts, financials) {
  const segments = {};
  accounts.forEach((a) => {
    const origin = a.referral_source || "(vazio)";
    if (!segments[origin]) segments[origin] = { count: 0, revenue: 0, churnValue: 0, newCustomers: 0, accountIds: [] };
    const f = financials[a.account_id] || { totalRevenue: 0, churnValue: 0, isNewNonTrial: false };
    segments[origin].count += 1;
    segments[origin].revenue += f.totalRevenue;
    segments[origin].churnValue += f.churnValue;
    if (f.isNewNonTrial) segments[origin].newCustomers += 1;
    segments[origin].accountIds.push(a.account_id);
  });
  return segments;
}

function datasetMonthSpan(subs) {
  const months = subs.map((r) => monthOf(r.start_date)).filter(Boolean);
  if (!months.length) return 1;
  const sorted = months.sort();
  const [y1, m1] = sorted[0].split("-").map(Number);
  const [y2, m2] = sorted[sorted.length - 1].split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

let originPieChart = null;

function runAnalysis() {
  const accounts = state.raw.accounts || [];
  const subs = state.raw.subscriptions || [];
  const financials = buildAccountFinancials(subs);
  const segments = segmentByOrigin(accounts, financials);
  const months = datasetMonthSpan(subs);

  // ---- tabela por origem ----
  const totalRevenueAll = Object.values(segments).reduce((a, s) => a + s.revenue, 0);
  let html = "<thead><tr><th>Origem</th><th>Contas</th><th>Clientes novos (sem trial)</th><th>Faturamento histórico total</th><th>% do faturamento</th><th>Valor perdido em churn</th></tr></thead><tbody>";
  Object.entries(segments).sort((a, b) => b[1].revenue - a[1].revenue).forEach(([origin, s]) => {
    const pct = totalRevenueAll ? (s.revenue / totalRevenueAll) * 100 : 0;
    html += `<tr><td>${origin}</td><td>${s.count}</td><td>${s.newCustomers}</td><td>${fmtMoney(s.revenue)}</td><td>${pct.toFixed(1)}%</td><td class="neg">${fmtMoney(s.churnValue)}</td></tr>`;
  });
  html += "</tbody>";
  document.getElementById("originTable").innerHTML = html;

  // ---- pizza por origem ----
  const labels = Object.keys(segments);
  const data = labels.map((k) => segments[k].revenue);
  if (originPieChart) originPieChart.destroy();
  originPieChart = new Chart(document.getElementById("originPie"), {
    type: "pie",
    data: { labels, datasets: [{ data, backgroundColor: ["#7ee0c0", "#6ea8fe", "#ffb86e", "#ff8686", "#d4a5ff", "#f6d55c"] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: "#c9d3ea" } } } },
  });

  renderSimulator(segments, months, totalRevenueAll);
  document.getElementById("adSpendInput").oninput = () => renderSimulator(segments, months, totalRevenueAll);
}

function renderSimulator(segments, months, totalRevenueAll) {
  const monthlySpend = toNum(document.getElementById("adSpendInput").value);
  const totalInvestment = monthlySpend * months;

  const ads = segments["ads"] || { count: 0, revenue: 0, newCustomers: 0, churnValue: 0 };
  const organic = segments["organic"] || { count: 0, revenue: 0, newCustomers: 0, churnValue: 0 };

  // Cenário A: dados como estão marcados
  const adsProfit = ads.revenue - totalInvestment;
  const adsCac = ads.newCustomers ? totalInvestment / ads.newCustomers : 0;
  const adsRoi = totalInvestment ? (adsProfit / totalInvestment) * 100 : 0;

  document.getElementById("simKpis").innerHTML = `
    <div class="kpi-card">
      <span class="kpi-label">Investimento simulado total <span class="term-ref">(${months} meses cobertos pelo dataset)</span></span>
      <span class="kpi-value">${fmtMoney(totalInvestment)}</span>
    </div>
    <div class="kpi-card up">
      <span class="kpi-label">Faturamento real do segmento "ads"</span>
      <span class="kpi-value">${fmtMoney(ads.revenue)}</span>
    </div>
    <div class="kpi-card ${adsProfit >= 0 ? "up" : "down"}">
      <span class="kpi-label">Lucro (faturamento − investimento)</span>
      <span class="kpi-value">${fmtMoney(adsProfit)}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">CAC simulado <span class="term-ref">(investimento ÷ clientes novos via ads)</span></span>
      <span class="kpi-value">${fmtMoney(adsCac)}</span>
    </div>
    <div class="kpi-card ${adsRoi >= 0 ? "up" : "down"}">
      <span class="kpi-label">ROI simulado</span>
      <span class="kpi-value">${adsRoi.toFixed(0)}%</span>
    </div>
  `;

  // Cenário B: organic é, na verdade, ads mal atribuído — mesmo investimento
  const mergedRevenue = ads.revenue + organic.revenue;
  const mergedCustomers = ads.newCustomers + organic.newCustomers;
  const mergedProfit = mergedRevenue - totalInvestment;
  const mergedCac = mergedCustomers ? totalInvestment / mergedCustomers : 0;
  const mergedRoi = totalInvestment ? (mergedProfit / totalInvestment) * 100 : 0;

  const rows = [
    ["Faturamento atribuído ao Ads", fmtMoney(ads.revenue), fmtMoney(mergedRevenue)],
    ["Clientes novos atribuídos ao Ads", ads.newCustomers, mergedCustomers],
    ["Investimento simulado (igual nos 2 cenários)", fmtMoney(totalInvestment), fmtMoney(totalInvestment)],
    ["Lucro", fmtMoney(adsProfit), fmtMoney(mergedProfit)],
    ["CAC simulado", fmtMoney(adsCac), fmtMoney(mergedCac)],
    ["ROI simulado", adsRoi.toFixed(0) + "%", mergedRoi.toFixed(0) + "%"],
  ];

  let html = "<thead><tr><th>Métrica</th><th>Cenário A — atribuição como está</th><th>Cenário B — organic é ads mal atribuído</th></tr></thead><tbody>";
  rows.forEach(([label, a, b]) => {
    html += `<tr><td>${label}</td><td>${a}</td><td class="pos">${b}</td></tr>`;
  });
  html += "</tbody>";
  document.getElementById("scenarioTable").innerHTML = html;
}

loadAll();
