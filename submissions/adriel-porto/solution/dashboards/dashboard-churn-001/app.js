// Dashboard de leitura de CSV bruto — sem cruzar/interpretar dados, só ler, filtrar e mostrar.

const state = {
  fileName: "",
  columns: [],
  rows: [],
  // por coluna filtrável: Set com os valores atualmente MARCADOS (incluídos)
  filters: {},
  filterableColumns: [],
  dateColumns: [],
};

const palette = [
  "#6ea8fe", "#7ee0c0", "#ffb86e", "#ff8686", "#c792ea",
  "#f6d55c", "#5cd6c0", "#ff9fb2", "#9fd3ff", "#d4a5ff",
];

const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const app = document.getElementById("app");
const filterListEl = document.getElementById("filterList");
const totalRowsEl = document.getElementById("totalRows");
const filteredRowsEl = document.getElementById("filteredRows");
const previewTable = document.getElementById("previewTable");
const pieColumnSel = document.getElementById("pieColumn");
const dateColumnSel = document.getElementById("dateColumn");
const dateGrainSel = document.getElementById("dateGrain");
const dateMetricSel = document.getElementById("dateMetric");
const saveBtn = document.getElementById("saveBtn");
const saveInfo = document.getElementById("saveInfo");
const resetFiltersBtn = document.getElementById("resetFilters");

let pieChart = null;
let lineChart = null;

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.fileName = file.name.replace(/\.csv$/i, "");
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      state.columns = results.meta.fields;
      state.rows = results.data;
      fileInfo.textContent = `${file.name} — ${state.rows.length} linhas, ${state.columns.length} colunas`;
      setupColumns();
      app.hidden = false;
      renderAll();
    },
    error: (err) => {
      fileInfo.textContent = "Erro ao ler o arquivo: " + err.message;
    },
  });
});

function isBooleanLike(values) {
  const set = new Set(values.map((v) => String(v).trim().toLowerCase()).filter((v) => v !== ""));
  set.delete("");
  for (const v of set) {
    if (v !== "true" && v !== "false") return false;
  }
  return set.size > 0;
}

function looksLikeDate(colName, values) {
  if (/date|_at$/i.test(colName)) return true;
  const sample = values.find((v) => v && String(v).trim() !== "");
  return sample ? /^\d{4}-\d{2}-\d{2}/.test(String(sample)) : false;
}

function setupColumns() {
  state.filters = {};
  state.filterableColumns = [];
  state.dateColumns = [];

  const colValues = {};
  state.columns.forEach((col) => {
    colValues[col] = state.rows.map((r) => r[col]);
  });

  state.columns.forEach((col) => {
    const values = colValues[col];
    const uniques = Array.from(new Set(values.map((v) => (v === undefined || v === null ? "" : String(v)))));

    if (looksLikeDate(col, values)) {
      state.dateColumns.push(col);
      return; // não vira filtro de checkbox
    }

    // coluna filtrável: poucas variações e não é claramente um ID único
    if (uniques.length > 1 && uniques.length <= 20 && uniques.length < state.rows.length * 0.5) {
      state.filterableColumns.push(col);
      state.filters[col] = new Set(uniques); // tudo marcado por padrão
    }
  });

  buildFilterUI();
  buildColumnSelectors();
}

function buildFilterUI() {
  filterListEl.innerHTML = "";
  state.filterableColumns.forEach((col) => {
    const details = document.createElement("details");
    details.className = "filter-group";
    details.open = false;

    const summary = document.createElement("summary");
    summary.textContent = col;
    details.appendChild(summary);

    const uniques = Array.from(
      new Set(state.rows.map((r) => (r[col] === undefined || r[col] === null ? "" : String(r[col]))))
    ).sort();

    uniques.forEach((val) => {
      const label = document.createElement("label");
      label.className = "filter-value";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.filters[col].has(val);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.filters[col].add(val);
        else state.filters[col].delete(val);
        renderAll();
      });

      const span = document.createElement("span");
      span.textContent = val === "" ? "(vazio)" : val;

      label.appendChild(checkbox);
      label.appendChild(span);
      details.appendChild(label);
    });

    filterListEl.appendChild(details);
  });
}

resetFiltersBtn.addEventListener("click", () => {
  state.filterableColumns.forEach((col) => {
    const uniques = Array.from(
      new Set(state.rows.map((r) => (r[col] === undefined || r[col] === null ? "" : String(r[col]))))
    );
    state.filters[col] = new Set(uniques);
  });
  buildFilterUI();
  renderAll();
});

function buildColumnSelectors() {
  pieColumnSel.innerHTML = "";
  state.filterableColumns.forEach((col) => {
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    pieColumnSel.appendChild(opt);
  });

  dateColumnSel.innerHTML = "";
  state.dateColumns.forEach((col) => {
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    dateColumnSel.appendChild(opt);
  });
}

[pieColumnSel, dateColumnSel, dateGrainSel, dateMetricSel].forEach((el) =>
  el.addEventListener("change", renderAll)
);

function getFilteredRows() {
  return state.rows.filter((row) => {
    return state.filterableColumns.every((col) => {
      const val = row[col] === undefined || row[col] === null ? "" : String(row[col]);
      return state.filters[col].has(val);
    });
  });
}

function renderAll() {
  const filtered = getFilteredRows();
  totalRowsEl.textContent = state.rows.length;
  filteredRowsEl.textContent = filtered.length;
  renderPreview(filtered);
  renderPie(filtered);
  renderLine(filtered);
}

function renderPreview(filtered) {
  const cols = state.columns;
  const rowsToShow = filtered.slice(0, 50);

  let html = "<thead><tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
  rowsToShow.forEach((row) => {
    html += "<tr>" + cols.map((c) => `<td>${row[c] ?? ""}</td>`).join("") + "</tr>";
  });
  html += "</tbody>";
  previewTable.innerHTML = html;
}

function renderPie(filtered) {
  const col = pieColumnSel.value;
  if (!col) return;
  const counts = {};
  filtered.forEach((row) => {
    const val = row[col] === undefined || row[col] === null || row[col] === "" ? "(vazio)" : String(row[col]);
    counts[val] = (counts[val] || 0) + 1;
  });
  const labels = Object.keys(counts);
  const data = Object.values(counts);

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById("pieChart"), {
    type: "pie",
    data: {
      labels,
      datasets: [{ data, backgroundColor: labels.map((_, i) => palette[i % palette.length]) }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: "#c9d3ea" } } },
    },
  });
}

function extractPeriod(dateStr, grain) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return grain === "year" ? m[1] : `${m[1]}-${m[2]}`;
}

function renderLine(filtered) {
  const col = dateColumnSel.value;
  if (!col) return;
  const grain = dateGrainSel.value;
  const metric = dateMetricSel.value;

  const buckets = {};
  filtered.forEach((row) => {
    const period = extractPeriod(row[col], grain);
    if (!period) return;
    if (!buckets[period]) buckets[period] = { count: 0, sumMrr: 0 };
    buckets[period].count += 1;
    const mrr = parseFloat(row["mrr_amount"]);
    if (!isNaN(mrr)) buckets[period].sumMrr += mrr;
  });

  const periods = Object.keys(buckets).sort();
  const data = periods.map((p) => (metric === "sum_mrr" ? buckets[p].sumMrr : buckets[p].count));

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(document.getElementById("lineChart"), {
    type: "line",
    data: {
      labels: periods,
      datasets: [
        {
          label: metric === "sum_mrr" ? "Soma de mrr_amount" : "Contagem de linhas",
          data,
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

saveBtn.addEventListener("click", () => {
  const filtered = getFilteredRows();
  const csv = Papa.unparse({ fields: state.columns, data: filtered });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const outName = `${state.fileName}_filtrado_${stamp}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  saveInfo.textContent = `Salvo como "${outName}" (${filtered.length} linhas) — o arquivo anterior não foi alterado.`;
});
