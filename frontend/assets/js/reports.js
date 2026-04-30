/* ==========================================================
   REPORTS MODULE â€“ LEDGER BASED (FINAL)
   Works with reports.html + /api/ledger
========================================================== */

let currentUser = null;

let allProperties = [];
let allTenants = [];
let allLeases = [];
let allLedger = [];

let monthlyIncomeData = [];
let yearlySummaryData = [];
let paymentHistoryData = [];
let monthlyProfitLossData = [];
let propertyPerformanceData = [];
let tenantStatementData = [];
let arrearsData = [];

let monthlyIncomeChart = null;
let yearlySummaryChart = null;

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
]; 


/* ==========================================================
   AUTH + INIT
========================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  const stored = localStorage.getItem("user");
  if (!stored) return window.location.href = "login.html";

  currentUser = JSON.parse(stored);
  if (!currentUser.token) return window.location.href = "login.html";

  setupMonthSelect(document.getElementById("reportMonth"));
  setupYearSelect(document.getElementById("reportYear"));

  await loadAppSettings();

await Promise.all([
  loadProperties(),
  loadTenants(),
  loadLeases(),
  loadLedger()
  
]);

  bindEvents();
  await buildAllReports(); // ðŸ”´ must be awaited
});  

function money(value){
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value);
  }

  return `ZAR ${Number(value || 0).toFixed(2)}`;
}

async function loadAppSettings() {

  try {

    const res = await fetch(`${API_URL}/dashboard/summary`, auth());
    const data = await res.json();

    if (window.applyAppPreferences) {
      window.applyAppPreferences({
        currency: data.currency,
        locale: data.locale,
        timezone: data.timezone
      });
    } else {
      window.APP_CURRENCY = data.currency || "ZAR";
      window.APP_LOCALE = data.locale || "en-ZA";
    }

  } catch (err) {

    console.error("Failed to load currency", err);

    if (window.applyAppPreferences) {
      window.applyAppPreferences({
        currency: "ZAR",
        locale: "en-ZA",
        timezone: "Africa/Johannesburg"
      });
    } else {
      window.APP_CURRENCY = "ZAR";
      window.APP_LOCALE = "en-ZA";
    }

  }

}
/* ==========================================================
   DROPDOWNS
========================================================== */
function setupMonthSelect(selectEl) {
  const now = new Date();
  selectEl.innerHTML = "";
  MONTHS.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (i === now.getMonth()) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function setupYearSelect(selectEl) {
  const year = new Date().getFullYear();
  selectEl.innerHTML = "";
  for (let y = year - 2; y <= year + 1; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === year) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

/* ==========================================================
   LOADERS
========================================================== */
async function loadProperties() {
  const res = await fetch(`${API_URL}/properties`, auth());
  const data = await res.json();
  allProperties = data.properties || [];

  const sel = document.getElementById("reportProperty");
  sel.innerHTML = `<option value="">All properties</option>`;
  allProperties.forEach(p =>
    sel.innerHTML += `<option value="${p._id}">${p.name}</option>`
  );
}

async function loadTenants() {
  const res = await fetch(`${API_URL}/tenants`, auth());
  const data = await res.json();
  allTenants = data.tenants || [];

  const sel = document.getElementById("reportTenant");
  sel.innerHTML = `<option value="">Select tenant</option>`;
  allTenants.forEach(t =>
    sel.innerHTML += `<option value="${t._id}">${t.fullName}</option>`
  );
}

async function loadLeases() {
  const res = await fetch(`${API_URL}/leases`, auth());
  const data = await res.json();
  allLeases = data.leases || [];
}

async function loadLedger() {
  const res = await fetch(`${API_URL}/ledger`, auth());
  const data = await res.json();
  allLedger = data.ledger || [];
}

/* ==========================================================
   EVENTS
========================================================== */
function bindEvents() {
  document.getElementById("refreshReportsBtn").onclick = buildAllReports;
  document.getElementById("paymentHistorySearch").oninput = buildPaymentHistory;
  document.getElementById("generateTenantStatementBtn").onclick = generateTenantStatement;

  document.getElementById("exportPLCsv").onclick = exportMonthlyProfitLossCSV;
  document.getElementById("exportPLPdf").onclick = exportMonthlyProfitLossPDF;
  document.getElementById("exportMonthlyIncomeBtn").onclick = exportMonthlyIncomeCSV;
  document.getElementById("exportMonthlyIncomePdfBtn").onclick = exportMonthlyIncomePDF;
  document.getElementById("exportYearlySummaryBtn").onclick = exportYearlySummaryCSV;
  document.getElementById("exportYearlySummaryPdfBtn").onclick = exportYearlySummaryPDF;
  document.getElementById("exportPaymentHistoryBtn").onclick = exportPaymentHistoryCSV;
  document.getElementById("exportPaymentHistoryPdfBtn").onclick = exportPaymentHistoryPDF;
  document.getElementById("exportPropertyPerformanceBtn").onclick = exportPropertyPerformanceCSV;
  document.getElementById("exportTenantStatementBtn").onclick = exportTenantStatementCSV;
  document.getElementById("exportArrearsBtn").onclick = exportArrearsCSV;
}




/* ==========================================================
   LEDGER FILTER (DATE CORRECT)
========================================================== */
function ledgerFilter(monthName, year) {
  const monthIndex = MONTHS.indexOf(monthName) + 1;
  return allLedger.filter(e => {
    const entryDate = new Date(e.date);

    const entryMonth =
  e.periodMonth !== undefined
    ? e.periodMonth
    : entryDate.getMonth() + 1;

    const entryYear =
      e.periodYear !== undefined
        ? e.periodYear
        : entryDate.getFullYear();

    if (year !== undefined && entryYear !== year) return false;
    if (monthName && entryMonth !== monthIndex) return false;

    return true;
  });
}

async function loadArrearsFromAPI() {
  const res = await fetch(`${API_URL}/reports/arrears`, auth());
  const data = await res.json();

  document.getElementById("repArrearsCount").textContent = data.count;
  const formatter = new Intl.NumberFormat(
  window.APP_LOCALE || "en-ZA",
  {
    style: "currency",
    currency: window.APP_CURRENCY || "ZAR"
  }
);

document.getElementById("arrearsTotal").textContent =
  formatter.format(getArrearsTotal(data));
}

async function fetchApiJson(url) {
  const res = await fetch(url, auth());
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}


/* ==========================================================
   TOP SUMMARY
========================================================== */
async function buildTopSummary(month, year, propertyId) {

  const monthIndex = MONTHS.indexOf(month) + 1;

  try {

    const params = new URLSearchParams({
      month: String(monthIndex),
      year: String(year)
    });

    if (propertyId) {
      params.set("propertyId", propertyId);
    }

    const res = await fetch(
      `${API_URL}/dashboard/summary?${params.toString()}`,
      auth()
    );

    if (!res.ok) {
      throw new Error("Summary request failed");
    }

    const data = await res.json();

    if (!data?.success) {
      throw new Error("Summary payload missing");
    }

    document.getElementById("repRentExpected").textContent =
      money(data.rent?.expectedThisMonth || 0);

    document.getElementById("repRentCollected").textContent =
      money(data.rent?.collectedThisMonth || 0);

    document.getElementById("repRentOutstanding").textContent =
      money(data.rent?.outstandingThisMonth || 0);

    return;

  } catch (err) {

    console.warn("Falling back to local reports summary:", err);

  }

  const entries = ledgerFilter(month, year)
    .filter(e => !propertyId || idOf(e.propertyId) === propertyId);

  let rentExpected = 0;
  let rentCollected = 0;

  entries.forEach(e => {

    const debit = Number(e.debit || 0);
    const credit = Number(e.credit || 0);

    if (e.type === "rent") {
      rentExpected += debit;
    }

    if (e.type === "payment") {
      rentCollected += credit;
    }

  });

  const outstanding = Math.max(rentExpected - rentCollected, 0);

  document.getElementById("repRentExpected").textContent =
    money(rentExpected);

  document.getElementById("repRentCollected").textContent =
    money(rentCollected);

  document.getElementById("repRentOutstanding").textContent =
    money(outstanding);

}
/* ==========================================================
   A) MONTHLY INCOME BY PROPERTY
========================================================== */
async function buildMonthlyIncome(month, year, propertyId) {

  try {
    const params = new URLSearchParams({
      month: String(MONTHS.indexOf(month) + 1),
      year: String(year)
    });

    if (propertyId) {
      params.set("propertyId", propertyId);
    }

    const data = await fetchApiJson(
      `${API_URL}/reports/monthly-income?${params.toString()}`
    );

    monthlyIncomeData = data.rows || [];

  } catch (err) {
    console.warn("Falling back to local monthly income report:", err);

    monthlyIncomeData = [];

    allProperties.forEach(p => {

      if (propertyId && p._id !== propertyId) return;

      const entries = ledgerFilter(month, year)
        .filter(e => idOf(e.propertyId) === p._id);

      const expected = entries
        .filter(e => e.type === "rent")
        .reduce((s,e)=>s + Number(e.debit || 0),0);

      const collected = entries
        .filter(e => e.type === "payment")
        .reduce((s,e)=>s + Number(e.credit || 0),0);

      const outstanding = Math.max(expected - collected, 0);

      monthlyIncomeData.push({
        propertyName: p.name,
        expected,
        collected,
        outstanding
      });

    });
  }

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  });

  render("monthlyIncomeBody", monthlyIncomeData, r => `
    <td>${r.propertyName}</td>
    <td>${formatter.format(Number(r.expected || 0))}</td>
    <td>${formatter.format(Number(r.collected || 0))}</td>
    <td>${formatter.format(Number(r.outstanding || 0))}</td>
  `);

  drawMonthlyChart(
    monthlyIncomeData.map(r => r.propertyName),
    monthlyIncomeData.map(r => Number(r.expected || 0)),
    monthlyIncomeData.map(r => Number(r.collected || 0))
  );
}
/* ==========================================================
   E) YEARLY SUMMARY
========================================================== */
async function buildYearlySummary(year, propertyId) {

  try {
    const params = new URLSearchParams({
      year: String(year)
    });

    if (propertyId) {
      params.set("propertyId", propertyId);
    }

    const data = await fetchApiJson(
      `${API_URL}/reports/profit-loss/monthly?${params.toString()}`
    );

    yearlySummaryData = (data.months || []).map(entry => ({
      month: entry.label || MONTHS[(entry.monthIndex || 1) - 1],
      collected: Number(entry.income || 0)
    }));

  } catch (err) {
    console.warn("Falling back to local yearly summary:", err);

    yearlySummaryData = MONTHS.map(m => {

      const total = ledgerFilter(m, year)
        .filter(e => !propertyId || idOf(e.propertyId) === propertyId)
        .reduce((s,e)=>{
          if (e.type === "payment") {
            return s + Number(e.credit || 0);
          }
          return s;
        },0);

      return {
        month: m,
        collected: total
      };

    });
  }

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  });

  render("yearlySummaryBody", yearlySummaryData, r => `
    <td>${r.month}</td>
    <td>${formatter.format(Number(r.collected || 0))}</td>
  `);

  drawYearlyChart(
    yearlySummaryData.map(r => r.month),
    yearlySummaryData.map(r => Number(r.collected || 0))
  );
}

/* ==========================================================
   B) PAYMENT HISTORY
========================================================== */
function buildPaymentHistory() {

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";
  const { monthName, year, propertyId, search } = getSelectedReportContext();
  const fallbackPeriodLabel = `${monthName} ${year}`;

  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  });

  paymentHistoryData = ledgerFilter(monthName, year)
    .filter(e => e.type === "payment")
    .filter(e => !propertyId || idOf(e.propertyId) === propertyId)
    .filter(e => {
      const haystack = [
        e.tenant?.fullName,
        e.property?.name,
        e.unit?.unitLabel,
        e.reference,
        e.description,
        e.method
      ]
        .join(" ")
        .toLowerCase();

      return !search || haystack.includes(search.toLowerCase());
    })
    .map(e => {
      const period =
        e.periodMonth && e.periodYear
          ? `${MONTHS[e.periodMonth - 1] || monthName} ${e.periodYear}`
          : fallbackPeriodLabel;

      return {
        tenantName: e.tenant?.fullName || "-",
        propertyUnit: [e.property?.name, e.unit?.unitLabel]
          .filter(Boolean)
          .join(" / ") || "-",
        amount: Number(e.credit || 0),
        period,
        paidOn: fmt(e.date),
        method: formatPaymentMethod(e.method),
        reference: e.reference || "-"
      };
    });

  render("paymentHistoryBody", paymentHistoryData, row => `
    <td>${row.tenantName}</td>
    <td>${row.propertyUnit}</td>
    <td>${formatter.format(row.amount)}</td>
    <td>${row.period}</td>
    <td>${row.paidOn}</td>
    <td>${row.method}</td>
    <td>${row.reference}</td>
  `);

}
/* ==========================================================
   C) PROPERTY PERFORMANCE
========================================================== */
async function buildPropertyPerformance(month, year, propertyId) {

  try {
    const params = new URLSearchParams({
      month: String(MONTHS.indexOf(month) + 1),
      year: String(year)
    });

    if (propertyId) {
      params.set("propertyId", propertyId);
    }

    const data = await fetchApiJson(
      `${API_URL}/reports/property-performance?${params.toString()}`
    );

    propertyPerformanceData = data.rows || [];

  } catch (err) {
    console.warn("Falling back to local property performance:", err);

    propertyPerformanceData = [];

    const monthEntries = ledgerFilter(month, year);

    allProperties.forEach(p => {

      if (propertyId && p._id !== propertyId) return;

      const units = Number(p.unitCount || 0);

      const occupied = allLeases
        .filter(l => idOf(l.propertyId) === p._id && l.status === "Active")
        .length;

      const entries = monthEntries
        .filter(e => idOf(e.propertyId) === p._id);

      const expected = entries
        .filter(e => e.type === "rent")
        .reduce((s,e)=>s + Number(e.debit || 0),0);

      const collected = entries
        .filter(e => e.type === "payment")
        .reduce((s,e)=>s + Number(e.credit || 0),0);

      const outstanding = Math.max(expected - collected, 0);

      propertyPerformanceData.push({
        propertyName: p.name,
        units,
        occupied,
        vacant: Math.max(units - occupied, 0),
        occupancyPct: units
          ? (occupied / units) * 100
          : 0,
        collected,
        outstanding
      });

    });
  }

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  });

  render("propertyPerformanceBody", propertyPerformanceData, r => `
    <td>${r.propertyName}</td>
    <td>${r.units}</td>
    <td>${r.occupied}</td>
    <td>${r.vacant}</td>
    <td>${Number(r.occupancyPct || 0).toFixed(1)}%</td>
    <td>${formatter.format(Number(r.collected || 0))}</td>
    <td>${formatter.format(Number(r.outstanding || 0))}</td>
  `);
}
/* ==========================================================
   D) TENANT STATEMENT
========================================================== */
async function generateTenantStatement() {

  const tenantId = document.getElementById("reportTenant").value;
  if (!tenantId) return;

  const month = document.getElementById("reportMonth").value;
  const year = Number(document.getElementById("reportYear").value);
  const monthIndex = MONTHS.indexOf(month) + 1;
  const tbody = document.getElementById("tenantStatementBody");
  const summaryEl = document.getElementById("tenantStatementSummary");

  if (tbody) {
    tbody.innerHTML =
      `<tr><td colspan="5" class="empty-row">Loading...</td></tr>`;
  }

  try {
    const data = await fetchApiJson(
      `${API_URL}/reports/tenant-statement/${tenantId}/${year}/${monthIndex}`
    );

    tenantStatementData = (data.rows || []).map(row => ({
      Date: row.period,
      Description: row.description || "",
      Debit: money(row.debit || 0),
      Credit: money(row.credit || 0),
      RunningBalance: money(row.balance || 0)
    }));

    render("tenantStatementBody", tenantStatementData, r => `
      <td>${r.Date}</td>
      <td>${r.Description}</td>
      <td>${r.Debit}</td>
      <td>${r.Credit}</td>
      <td>${r.RunningBalance}</td>
    `);

    if (summaryEl && data.summary) {
      summaryEl.textContent =
        `Total charged ${money(data.summary.totalCharged || 0)} | ` +
        `Total paid ${money(data.summary.totalPaid || 0)} | ` +
        `Balance ${money(data.summary.balance || 0)}`;
    }

    return;

  } catch (err) {
    console.warn("Falling back to local tenant statement:", err);
  }

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";
  const formatter = new Intl.NumberFormat(locale,{
    style:"currency",
    currency
  });

  let balance = 0;

  tenantStatementData = ledgerFilter(month, year)
    .filter(e => idOf(e.tenantId) === tenantId)
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .map(e => {

      const debit = Number(e.debit || 0);
      const credit = Number(e.credit || 0);

      balance += debit - credit;

      return {
        Date: fmt(e.date),
        Description: e.description || "",
        Debit: formatter.format(debit),
        Credit: formatter.format(credit),
        RunningBalance: formatter.format(balance)
      };

    });

  render("tenantStatementBody", tenantStatementData, r => `
    <td>${r.Date}</td>
    <td>${r.Description}</td>
    <td>${r.Debit}</td>
    <td>${r.Credit}</td>
    <td>${r.RunningBalance}</td>
  `);

}

/* ==========================================================
   F) ARREARS
========================================================== */
async function renderArrearsFromAPI(){

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";

  const formatter = new Intl.NumberFormat(locale,{
    style:"currency",
    currency
  });

  const res = await fetch(`${API_URL}/reports/arrears`, auth());
  const data = await res.json();

  arrearsData = data.arrears || [];

  render("arrearsTableBody", arrearsData, r => `
    <td>${r.tenantName}</td>
    <td>${r.property} / ${r.unit}</td>
    <td>${formatter.format(Number(r.expected || 0))}</td>
    <td>${formatter.format(Number(r.paid || 0))}</td>
    <td>${formatter.format(Number(r.outstanding || 0))}</td>
  `);

  const totalOutstanding = getArrearsTotal(data);
  const count = Number(data.count || 0);

  document.getElementById("repArrearsCount").textContent = count;

  document.getElementById("arrearsTotal").textContent =
    formatter.format(totalOutstanding);

  const rollingEl = document.getElementById("repTotalRollingArrears");

  if (rollingEl) {
    rollingEl.textContent = formatter.format(totalOutstanding);
  }

}

function getArrearsTotal(data) {

  if (Number.isFinite(Number(data?.totalOutstanding))) {
    return Number(data.totalOutstanding);
  }

  const totalsByCurrency = data?.totalsByCurrency;
  const preferredCurrency = data?.currency || window.APP_CURRENCY || "ZAR";

  if (
    totalsByCurrency &&
    Number.isFinite(Number(totalsByCurrency[preferredCurrency]))
  ) {
    return Number(totalsByCurrency[preferredCurrency]);
  }

  if (totalsByCurrency && typeof totalsByCurrency === "object") {
    return Object.values(totalsByCurrency).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    );
  }

  return Number(data?.arrears?.reduce(
    (sum, entry) => sum + Number(entry.outstanding || 0),
    0
  ) || 0);

}
/* ==========================================================
   CHARTS
========================================================== */
function drawMonthlyChart(labels, expected, collected) {
  const ctx = document.getElementById("monthlyIncomeChart");
  if (monthlyIncomeChart) monthlyIncomeChart.destroy();

  monthlyIncomeChart = new Chart(ctx,{
    type:"bar",
    data:{ labels,
      datasets:[
        { label:"Expected", data:expected },
        { label:"Collected", data:collected }
      ]
    },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

function drawYearlyChart(labels, collected) {
  const ctx = document.getElementById("yearlySummaryChart");
  if (yearlySummaryChart) yearlySummaryChart.destroy();

  yearlySummaryChart = new Chart(ctx,{
    type:"line",
    data:{ labels,
      datasets:[{ label:"Collected", data:collected, tension:0.3 }]
    },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

/* ==========================================================
   HELPERS + EXPORTS
========================================================== */
function idOf(v){ return typeof v==="object" ? v?._id : v; }
function nameById(arr,id){ return arr.find(x=>x._id===id)?.name || arr.find(x=>x._id===id)?.fullName || "-"; }
function fmt(d){
  if (window.formatAppDate) {
    return window.formatAppDate(d);
  }

  return d ? new Date(d).toLocaleDateString() : "-";
}
function auth(){ return { headers:{ Authorization:`Bearer ${currentUser.token}` }}; }

function getSelectedReportContext() {
  const monthName =
    document.getElementById("reportMonth")?.value ||
    MONTHS[new Date().getMonth()];
  const month = MONTHS.indexOf(monthName) + 1;
  const year = Number(
    document.getElementById("reportYear")?.value || new Date().getFullYear()
  );
  const propertyId = document.getElementById("reportProperty")?.value || "";
  const search =
    document.getElementById("paymentHistorySearch")?.value.trim() || "";

  const propertyName = propertyId
    ? allProperties.find(property => property._id === propertyId)?.name ||
      "selected-property"
    : "all-properties";

  return {
    monthName,
    month,
    year,
    propertyId,
    propertyName,
    search
  };
}

function buildReportParams({
  includeMonth = true,
  includeProperty = true,
  includeSearch = false
} = {}) {
  const context = getSelectedReportContext();
  const params = new URLSearchParams();

  if (includeMonth) {
    params.set("month", String(context.month));
  }

  params.set("year", String(context.year));

  if (includeProperty && context.propertyId) {
    params.set("propertyId", context.propertyId);
  }

  if (includeSearch && context.search) {
    params.set("search", context.search);
  }

  return params;
}

function filePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
}

function buildMonthlyFilename(prefix) {
  const context = getSelectedReportContext();
  const parts = [
    prefix,
    String(context.year),
    String(context.month).padStart(2, "0")
  ];

  if (context.propertyId) {
    parts.push(filePart(context.propertyName));
  }

  return `${parts.join("-")}.pdf`;
}

function buildYearlyFilename(prefix) {
  const context = getSelectedReportContext();
  const parts = [prefix, String(context.year)];

  if (context.propertyId) {
    parts.push(filePart(context.propertyName));
  }

  return `${parts.join("-")}.pdf`;
}

function formatPaymentMethod(method) {
  const value = String(method || "eft").trim().toLowerCase();

  if (!value) {
    return "EFT";
  }

  const labels = {
    eft: "EFT",
    cash: "Cash",
    card: "Card",
    debit_order: "Debit Order",
    debitorder: "Debit Order",
    other: "Other"
  };

  if (labels[value]) {
    return labels[value];
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function render(id, data, rowFn) {

  const tb = document.getElementById(id);
  if (!tb) return;

  if (!data.length) {
    tb.innerHTML =
      `<tr><td colspan="10" class="empty-row">No data</td></tr>`;
    return;
  }

  tb.innerHTML = data
    .map(r => `<tr>${rowFn(r)}</tr>`)
    .join("");

}

function downloadCSV(name, data) {

  if (!data.length) {
    notify("No data");
    return;
  }

  const headers = Object.keys(data[0]);

  const rows = data.map(obj =>
    headers.map(h => `"${String(obj[h]).replace(/"/g,'""')}"`).join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}



/* CSV exports */
function exportMonthlyProfitLossCSV() {
  downloadCSV("monthly-profit-loss.csv", monthlyProfitLossData);
}
function exportMonthlyIncomeCSV(){ downloadCSV("monthly-income.csv",monthlyIncomeData); }
function exportYearlySummaryCSV(){ downloadCSV("yearly-summary.csv",yearlySummaryData); }
function exportPaymentHistoryCSV(){ downloadCSV("payment-history.csv",paymentHistoryData); }
function exportPropertyPerformanceCSV(){ downloadCSV("property-performance.csv",propertyPerformanceData); }
function exportTenantStatementCSV() {
  if (!tenantStatementData.length) {
    notify("No data");
    return;
  }

  downloadCSV("tenant-statement.csv", tenantStatementData);
}


function exportArrearsCSV(){ downloadCSV("arrears.csv",arrearsData); }

function exportMonthlyIncomePDF() {
  const params = buildReportParams();
  downloadPDF(
    `/reports/monthly-income/pdf?${params.toString()}`,
    buildMonthlyFilename("monthly-income")
  );
}

function exportYearlySummaryPDF() {
  const params = buildReportParams({ includeMonth: false });
  downloadPDF(
    `/reports/yearly-income-trend/pdf?${params.toString()}`,
    buildYearlyFilename("yearly-income-trend")
  );
}

function exportPaymentHistoryPDF() {
  const params = buildReportParams({ includeSearch: true });
  downloadPDF(
    `/reports/payment-history/pdf?${params.toString()}`,
    buildMonthlyFilename("payment-history")
  );
}

function exportMonthlyProfitLossPDF() {
  const params = buildReportParams({ includeMonth: false });
  downloadPDF(
    `/reports/profit-loss/monthly/pdf?${params.toString()}`,
    buildYearlyFilename("monthly-profit-loss")
  );
}

/* LOGOUT */
function logout(){ localStorage.clear(); location.href="login.html"; }
window.logout=logout;

/* tenant statement pdf */
async function exportTenantStatementPDF() {
  const tenantId = document.getElementById("reportTenant").value;
  const year = Number(document.getElementById("reportYear").value);
  const monthName = document.getElementById("reportMonth").value;

  const monthIndex = MONTHS.indexOf(monthName);
if (monthIndex < 0) return;
const month = monthIndex + 1;

  if (!tenantId) {
    notify("Please select a tenant first");
    return;
  }

  const res = await fetch(
    `${API_URL}/reports/tenant-statement/${tenantId}/${year}/${month}/pdf`,
    {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    }
  );

  if (!res.ok) {
    notify("Failed to generate PDF");
    return;
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
}
async function emailTenantStatement() {
  const tenantId = document.getElementById("reportTenant").value;
  const year = Number(document.getElementById("reportYear").value);
  const monthName = document.getElementById("reportMonth").value;

  const monthIndex = MONTHS.indexOf(monthName);
  const month = monthIndex + 1; // âœ… FIX: convert to 1â€“12

  if (!tenantId) {
    notify("Please select a tenant first");
    return;
  }

  const res = await fetch(
    `${API_URL}/reports/tenant-statement/${tenantId}/${year}/${month}/email`,
    {
      method: "POST",
      headers: auth().headers
    }
  );

  const data = await res.json();

  if (!res.ok) {
    notify(data.message || "Failed to email statement");
    return;
  }

  notify(data.message);
}
function exportPropertyPerformancePDF() {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user || !user.token) {
    notify("Session expired. Please login again.");
    return;
  }

  const monthName = document.getElementById("reportMonth").value;
  const year = document.getElementById("reportYear").value;
  const month = MONTHS.indexOf(monthName) + 1;
  const propertyId = document.getElementById("reportProperty").value;
  const params = new URLSearchParams({
    month: String(month),
    year: String(year)
  });

  if (propertyId) {
    params.set("propertyId", propertyId);
  }

  fetch(
    `${API_URL}/reports/property-performance/pdf?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${user.token}`
      }
    }
  )
    .then(res => {
      if (!res.ok) throw new Error("Not authorized");
      return res.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
    })
    .catch(err => {
      console.error(err);
      notify("Failed to export PDF");
    });
}


async function buildProfitLoss(month, year, propertyId) {

  try {
    const params = new URLSearchParams({
      month: String(MONTHS.indexOf(month) + 1),
      year: String(year)
    });

    if (propertyId) {
      params.set("propertyId", propertyId);
    }

    const data = await fetchApiJson(
      `${API_URL}/reports/profit-loss?${params.toString()}`
    );

    document.getElementById("plIncome").textContent =
      money(data.income || 0);

    document.getElementById("plExpenses").textContent =
      money(data.expenses || 0);

    document.getElementById("plProfit").textContent =
      money(data.profit || 0);

    return;

  } catch (err) {
    console.warn("Falling back to local profit and loss:", err);
  }

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";

  const formatter = new Intl.NumberFormat(locale,{
    style:"currency",
    currency
  });

  const entries = ledgerFilter(month, year)
    .filter(e => !propertyId || idOf(e.propertyId) === propertyId);

  let income = 0;
  let expenses = 0;

  entries.forEach(e => {

    if (e.type === "payment") {
      income += Number(e.credit || 0);
    }

    if (e.type === "expense") {
      expenses += Number(e.debit || 0);
    }

  });

  const profit = income - expenses;

  document.getElementById("plIncome").textContent =
    formatter.format(income);

  document.getElementById("plExpenses").textContent =
    formatter.format(expenses);

  document.getElementById("plProfit").textContent =
    formatter.format(profit);
}

async function buildMonthlyProfitLoss(year, propertyId) {

  const tbody = document.getElementById("plTableBody");
  if (!tbody) return;

  const formatter = new Intl.NumberFormat(
    window.APP_LOCALE || "en-ZA",
    {
      style: "currency",
      currency: window.APP_CURRENCY || "ZAR"
    }
  );

  monthlyProfitLossData = [];

  try {
    const params = new URLSearchParams({
      year: String(year)
    });

    if (propertyId) {
      params.set("propertyId", propertyId);
    }

    const data = await fetchApiJson(
      `${API_URL}/reports/profit-loss/monthly?${params.toString()}`
    );

    monthlyProfitLossData = (data.months || []).map(entry => ({
      month: entry.label,
      income: Number(entry.income || 0),
      expenses: Number(entry.expenses || 0),
      profit: Number(entry.profit || 0)
    }));

  } catch (err) {
    console.warn("Falling back to local monthly profit and loss:", err);

    monthlyProfitLossData = [];

    MONTHS.forEach(monthName => {

      const entries = ledgerFilter(monthName, year)
        .filter(e => !propertyId || idOf(e.propertyId) === propertyId);

      let income = 0;
      let expenses = 0;

      entries.forEach(e => {

        if (e.type === "payment") {
          income += Number(e.credit || 0);
        }

        if (e.type === "expense") {
          expenses += Number(e.debit || 0);
        }

      });

      const profit = income - expenses;

      monthlyProfitLossData.push({
        month: monthName,
        income,
        expenses,
        profit
      });

    });
  }

  if (!monthlyProfitLossData.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="empty-row">No data</td></tr>`;
    return;
  }

  tbody.innerHTML = monthlyProfitLossData
    .map(row => `
      <tr>
        <td>${row.month}</td>
        <td>${formatter.format(row.income)}</td>
        <td>${formatter.format(row.expenses)}</td>
        <td><strong>${formatter.format(row.profit)}</strong></td>
      </tr>
    `)
    .join("");
}

/* ==========================================================
   UTILITIES REPORT
========================================================== */


let utilitiesReportData = [];

function buildUtilitiesReport(month, year, propertyId) {

  utilitiesReportData = [];

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";

  const formatter = new Intl.NumberFormat(locale,{
    style:"currency",
    currency
  });

  const utilities = allLedger.filter(e => {

    if (e.type !== "utility") return false;

   if (e.periodMonth !== MONTHS.indexOf(month) + 1) return false;

    if (e.periodYear !== year) return false;

    if (propertyId && idOf(e.propertyId) !== propertyId) return false;

    return true;

  });

  let totalOutstanding = 0;

  utilities.forEach(u => {

    const billed = Number(u.debit || 0);

    // utilities unpaid until allocated
    const paid = 0;

    const outstanding = billed - paid;

    totalOutstanding += outstanding;

    utilitiesReportData.push({

      month,

      property: nameById(allProperties, u.propertyId),

      tenant: nameById(allTenants, u.tenantId),

      utility: u.utilityType || u.description || "Utility",

      billed,
      paid,
      outstanding,

      status: outstanding > 0 ? "Outstanding" : "Paid"

    });

  });

  render("utilitiesReportBody", utilitiesReportData, r => `
    <td>${r.month}</td>
    <td>${r.property}</td>
    <td>${r.tenant}</td>
    <td>${r.utility}</td>
    <td>${formatter.format(r.billed)}</td>
    <td>${formatter.format(r.paid)}</td>
    <td>${formatter.format(r.outstanding)}</td>
    <td>
      <span class="${r.outstanding > 0 ? 'badge danger' : 'badge success'}">
        ${r.status}
      </span>
    </td>
  `);

  document.getElementById("utilitiesOutstandingTotal").textContent =
    formatter.format(totalOutstanding);

}
/* ==========================================================
   DAMAGES REPORT
========================================================== */
let damageReportData = [];

function buildDamageReport(month, year, propertyId) {

  damageReportData = [];

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";

  const formatter = new Intl.NumberFormat(locale,{
    style:"currency",
    currency
  });

  const damageMap = {};

  allLedger.forEach(e => {

    if (!["damage","damage_reversal"].includes(e.type)) return;

    const d = new Date(e.date);

    if (MONTHS[d.getMonth()] !== month) return;

    if (d.getFullYear() !== year) return;

    if (propertyId && idOf(e.propertyId) !== propertyId) return;

    const key = [
      idOf(e.tenantId),
      idOf(e.propertyId),
      e.description || "Damage"
    ].join("|");

    if (!damageMap[key]) {

      damageMap[key] = {

        date: fmt(e.date),

        tenant: nameById(allTenants, idOf(e.tenantId)),

        property: nameById(allProperties, idOf(e.propertyId)),

        description: e.description || "Damage",

        damage: 0,

        reversed: 0

      };

    }

    if (e.type === "damage") {
      damageMap[key].damage += Number(e.debit || 0);
    }

    if (e.type === "damage_reversal") {
      damageMap[key].reversed += Number(e.credit || 0);
    }

  });

  let totalOutstanding = 0;

  Object.values(damageMap).forEach(r => {

    const outstanding = r.damage - r.reversed;

    totalOutstanding += Math.max(outstanding,0);

    damageReportData.push({

      date: r.date,

      tenant: r.tenant,

      property: r.property,

      description: r.description,

      damage: r.damage,

      reversed: r.reversed,

      outstanding,

      status: outstanding > 0 ? "Outstanding" : "Cleared"

    });

  });

  render("damageReportBody", damageReportData, r => `
    <td>${r.date}</td>
    <td>${r.tenant}</td>
    <td>${r.property}</td>
    <td>${r.description}</td>
    <td>${formatter.format(r.damage)}</td>
    <td>${formatter.format(r.reversed)}</td>
    <td>${formatter.format(r.outstanding)}</td>
    <td>
      <span class="${r.outstanding > 0 ? 'badge danger' : 'badge success'}">
        ${r.status}
      </span>
    </td>
  `);

  document.getElementById("damageOutstandingTotal").textContent =
    formatter.format(totalOutstanding);

}
/* ============================
   PDF DOWNLOAD HELPER
============================ */
async function downloadPDF(endpoint, filename) {

  const user = JSON.parse(localStorage.getItem("user"));

  if (!user?.token) {
    notify("Session expired. Please log in again.");
    return;
  }

  try {

    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${user.token}`
      }
    });

    if (!res.ok) {

      let message = "Failed to generate PDF";

      try {
        const err = await res.json();
        message = err.message || message;
      } catch {}

      throw new Error(message);
    }

    const blob = await res.blob();

    /* ensure PDF */
    if (blob.type !== "application/pdf") {
      throw new Error("Server did not return a PDF");
    }

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();

    a.remove();
    window.URL.revokeObjectURL(url);

  } catch (err) {

    console.error("PDF DOWNLOAD ERROR:", err);
    notify(err.message || "PDF export failed");

  }

}


/* ==========================================================
   EXPORT ALL DATA (CSV)
========================================================== */

async function exportTenantsCSV() {
  exportFromAPI("/tenants/export", "tenants.csv");
}

async function exportPropertiesCSV() {
  exportFromAPI("/properties/export", "properties.csv");
}

async function exportPaymentsCSV() {
  exportFromAPI("/ledger/export/payments", "payments.csv");
}

async function exportLeasesCSV() {
  exportFromAPI("/leases/export", "leases.csv");
}

async function exportFromAPI(endpoint, filename) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: auth().headers
  });

  if (!res.ok) {
    notify("Export failed");
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
/* ==========================================================
   AUTO MONTHLY EXPENSE CHARGE (STEP 1)
   Mirrors rent auto-charge logic
========================================================== */
async function chargeRentIfNeeded() {

  try {

    const user = JSON.parse(localStorage.getItem("user"));

    if (!user?.token) {
      notify("Session expired. Please log in again.");
      return;
    }

    const monthName = document.getElementById("reportMonth").value;
    const year = Number(document.getElementById("reportYear").value);

   const month = MONTHS.indexOf(monthName) + 1;

if (month < 1 || isNaN(year)) {
  console.warn("Invalid month or year");
  return;
}

    if (month < 0 || isNaN(year)) {
      console.warn("Invalid month or year");
      return;
    }

    const res = await fetch(`${API_URL}/ledger/charge-rent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`
      },
      body: JSON.stringify({ year, month })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Charge rent failed:", data);
      notify(data.message || "Failed to charge rent");
      return;
    }

    console.log("Rent charge result:", data);

    if (data.created !== undefined) {
      console.log(`${data.created} rent entries created`);
    }

  } catch (err) {

    console.error("CHARGE RENT ERROR:", err);
    notify("Failed to charge rent");

  }

}  

/* ==========================================================
   CORE BUILD (RENT-FIRST SAFE)
========================================================== */
async function buildAllReports() {
  const month = document.getElementById("reportMonth").value;
  const year = Number(document.getElementById("reportYear").value);
  const propertyId = document.getElementById("reportProperty").value;

  // âœ… STEP 1: Ensure rent + expenses exist
  await chargeRentIfNeeded();


  // âœ… STEP 2: Reload ledger AFTER auto charges
  await loadLedger();

  // âœ… STEP 3: Build reports
  await buildTopSummary(month, year, propertyId);
  await buildProfitLoss(month, year, propertyId);

  await renderArrearsFromAPI();

  if (document.getElementById("plTableBody")) {
    await buildMonthlyProfitLoss(year, propertyId);
  }

  buildUtilitiesReport(month, year, propertyId);
  await buildMonthlyIncome(month, year, propertyId);
  await buildYearlySummary(year, propertyId);
  buildPaymentHistory();
  await buildPropertyPerformance(month, year, propertyId);
  buildDamageReport(month, year, propertyId);
}

// ðŸ‘‡ REQUIRED for onclick=""
window.emailTenantStatement = emailTenantStatement;

window.exportTenantStatementPDF = exportTenantStatementPDF;

window.exportPropertyPerformancePDF=exportPropertyPerformancePDF;
window.exportPropertyHistoryPDF = exportPaymentHistoryPDF;
/* ============================
   PDF EXPORT FUNCTIONS (GLOBAL)
============================ */

window.exportTenantsPDF = function () {
  downloadPDF("/tenants/export/pdf", "tenants.pdf");
};

window.exportPropertiesPDF = function () {
  downloadPDF("/properties/export/pdf", "properties.pdf");
};

function initReportsTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("reports", "startTutorialBtn");
}

document.addEventListener("DOMContentLoaded", () => {
  initReportsTutorial();
});





