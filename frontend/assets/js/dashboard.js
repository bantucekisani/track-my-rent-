/* ======================================================
   DASHBOARD - LEDGER BASED (PRODUCTION)
====================================================== */

let currentUser = null;

let incomeChart = null;
let occupancyChart = null;

let dashboardLoaded = false;
let dashboardLoading = false;

const DASHBOARD_CACHE_KEY = "dashboardCache";
const user = JSON.parse(localStorage.getItem("user"));

if (!user || !user.token) {
    window.location.href = "login.html";
}

/* ======================================================
   INIT + AUTH
====================================================== */

document.addEventListener("DOMContentLoaded", () => {

  try {

    const stored = localStorage.getItem("user");

    if (!stored) return redirectLogin();

    currentUser = JSON.parse(stored);

    if (!currentUser?.token) return redirectLogin();

    /* auth-guard protection if present */
    if (typeof requireAuth === "function") {
      requireAuth();
    }

    setDashboardLoadingState(true);
    clearDashboardCache();

    loadDashboard();
    loadSubscription();
    loadTutorialPrompt();
    initDashboardTutorial();

    /* Admin analytics only if admin */
    if (currentUser.role === "admin") {

      if (typeof loadAdminDashboard === "function")
        loadAdminDashboard();

      if (typeof loadGrowthCharts === "function")
        loadGrowthCharts();
    }

  } catch (err) {

    console.error("Auth error:", err);
    redirectLogin();

  }

});

function hide(id){

const el = document.getElementById(id);

if(!el) return;

el.style.display = "none";

}



function goToPricing(){
window.location.href = "pricing.html";
}

function redirectLogin() {

  localStorage.clear();
  window.location.href = "login.html";

}


/* ======================================================
   DASHBOARD CORE
====================================================== */

async function loadDashboard(){

if(dashboardLoading) return;

dashboardLoading = true;

try{

const controller = new AbortController();

setTimeout(()=>controller.abort(),8000);

const params = new URLSearchParams({ _: String(Date.now()) });

const res = await fetch(`${API_URL}/dashboard/summary?${params.toString()}`,{
headers: {
...authHeader(),
"Cache-Control": "no-cache"
},
cache: "no-store",
signal:controller.signal
});

if(!res.ok) throw new Error("Dashboard summary failed");

const data = await res.json();

dashboardLoaded = true;
dashboardLoading = false;
setDashboardLoadingState(false);

/* render immediately */
cacheDashboard(data);
paintDashboard(data);

/* load widgets after render */
function loadWidgets(){

loadIncomeChart();
loadRecentPaymentsFast();
loadDashboardArrears();
loadRentStatus();

}

if("requestIdleCallback" in window){
requestIdleCallback(loadWidgets);
}else{
setTimeout(loadWidgets,200);
}

}catch(err){

dashboardLoading = false;
setDashboardLoadingState(false);
console.error("Dashboard load error:",err);
notify("We could not refresh the dashboard right now.", "warning");

}

}


/* ======================================================
   PAINT DASHBOARD
====================================================== */

function paintDashboard(data) {

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
  updateDashboardQuickstart(data);

  setText("totalProperties", data.totals.totalProperties);
  setText("totalUnits", data.totals.totalUnits);
  setText("occupiedUnits", data.totals.occupiedUnits);
  setText("vacantUnits", data.totals.vacantUnits);
  setText("totalTenants", data.totals.totalTenants);

  const expected = Number(data.rent?.expectedThisMonth ?? 0);
  const collected = Number(data.rent?.collectedThisMonth ?? 0);
  const outstanding = Number(data.rent?.outstandingThisMonth ?? 0);

  setText("rentExpected", formatMoney(expected));
  setText("rentCollected", formatMoney(collected));
  setText("rentOutstanding", formatMoney(outstanding));

  setText(
    "vatCollected",
    formatMoney(data.vat?.collectedThisMonth || 0)
  );

  drawOccupancyChart(
    data.totals.occupiedUnits,
    data.totals.vacantUnits
  );

}


/* ======================================================
   RENT STATUS
====================================================== */

async function loadRentStatus() {

  try {

    const res = await fetch(`${API_URL}/ledger/rent-status`, {
      headers: authHeader()
    });

    if (!res.ok) return;

    const data = await res.json();

    setText("rentPaidCount", data.paid);
    setText("rentPartialCount", data.partial);
    setText("rentUnpaidCount", data.unpaid);
    setText("rentTotalCount", data.total);

  } catch (err) {

    console.error("RENT STATUS ERROR:", err);

  }

}


/* ======================================================
   ARREARS
====================================================== */

async function loadDashboardArrears() {

  try {

    const res = await fetch(`${API_URL}/reports/arrears`, {
      headers: authHeader()
    });

    if (!res.ok) return;

    const data = await res.json();

    const totalOutstanding = getArrearsTotal(data);
    const tenantCount = Number(data.count || 0);

    setText("totalRollingArrears", formatMoney(totalOutstanding));
    setText("totalArrearsTenants", tenantCount);

    setText("arrearsTenants", tenantCount);
    setText("arrearsAmount", formatMoney(totalOutstanding));

    const rollingEl = document.getElementById("totalRollingArrears");

    if (rollingEl) {

      rollingEl.style.color =
        totalOutstanding > 0 ? "#dc2626" : "#16a34a";

    }

  } catch (err) {

    console.error("Dashboard arrears error:", err);

  }

}


function setDashboardLoadingState(isLoading) {
  const content = document.querySelector(".content");

  if (!content) {
    return;
  }

  content.classList.toggle("dashboard-loading", isLoading);
}

function updateDashboardQuickstart(data) {
  const quickstart = document.getElementById("dashboardQuickstart");
  const stepsHost = document.getElementById("dashboardQuickstartSteps");

  if (!quickstart || !stepsHost) {
    return;
  }

  const totals = data?.totals || {};
  const needsQuickstart =
    Number(totals.totalProperties || 0) === 0 ||
    Number(totals.totalTenants || 0) === 0 ||
    Number(totals.totalUnits || 0) === 0;

  if (!needsQuickstart) {
    quickstart.classList.add("hidden");
    stepsHost.innerHTML = "";
    return;
  }

  const steps = [
    {
      title: "1. Business Profile",
      text: "Add the identity details that appear on invoices and statements.",
      href: "business-settings.html?tutorial=business-settings&autostart=1",
      action: "Set up profile"
    },
    {
      title: "2. Property",
      text: "Create your first property so the rest of the workflow has somewhere to start.",
      href: "properties.html?tutorial=properties&autostart=1",
      action: "Add property"
    },
    {
      title: "3. Tenant",
      text: "Capture the tenant before you create leases or record payments.",
      href: "tenants.html?tutorial=tenants&autostart=1",
      action: "Add tenant"
    },
    {
      title: "4. Lease",
      text: "Link the tenant to a property or unit and define the rent terms.",
      href: "leases.html?tutorial=leases&autostart=1",
      action: "Create lease"
    }
  ];

  stepsHost.innerHTML = steps.map(step => `
    <article class="quickstart-step">
      <strong>${step.title}</strong>
      <p>${step.text}</p>
      <a href="${step.href}">${step.action}</a>
    </article>
  `).join("");

  quickstart.classList.remove("hidden");
}
async function loadTutorialPrompt() {
  try {
    const res = await fetch(`${API_URL}/tutorials/me`, {
      headers: authHeader()
    });

    if (!res.ok) {
      return;
    }

    const data = await res.json();
    const tutorials = data.tutorials || {};
    const onboardingCompleted = tutorials.onboardingCompleted === true;
    const dismissed = tutorials.dismissed === true;
    const banner = document.getElementById("dashboardOnboarding");

    if (!banner) {
      return;
    }

    if (!onboardingCompleted && !dismissed) {
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  } catch (err) {
    console.error("Tutorial prompt error:", err);
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


/* ======================================================
   RECENT PAYMENTS
====================================================== */

async function loadRecentPaymentsFast() {

  try {

    const res = await fetch(
      `${API_URL}/ledger/payments?limit=5`,
      { headers: authHeader() }
    );

    if (!res.ok) return;

    const { payments } = await res.json();

    const tbody = document.getElementById("recentPaymentsBody");

    if (!payments?.length) {

      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-row">
            <div style="padding:18px 8px;">
              <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">No recent payments yet.</div>
              <div style="color:#64748b; margin-bottom:12px;">Record your first tenant payment to start building cashflow history.</div>
              <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <a class="primary-link" href="payments.html">Record Payment</a>
                <a class="secondary-link" href="tenants.html">View Tenants</a>
              </div>
            </div>
          </td>
        </tr>`;

      return;

    }

    tbody.innerHTML = payments.map(p => `
      <tr>
        <td>${safeText(p.tenant?.fullName)}</td>
        <td>${safeText(p.property?.name)}</td>
        <td>${formatMoney(p.amount)}</td>
        <td>${fmtDate(p.paidOn)}</td>
        <td>PAID</td>
      </tr>
    `).join("");

  } catch (err) {

    console.error("Recent payments error:", err);

  }

}


/* ======================================================
   INCOME TREND CHART
====================================================== */

async function loadIncomeChart() {

  try {

    const res = await fetch(
      `${API_URL}/dashboard/income-trend`,
      { headers: authHeader() }
    );

    if (!res.ok) return;

    const { trend } = await res.json();

    const ctx = document.getElementById("incomeChart");

    if (!ctx) return;

    if (incomeChart) incomeChart.destroy();

    incomeChart = new Chart(ctx, {

      type: "line",

      data: {
        labels: trend.map(t => t.label),

        datasets: [
          {
            label: "Expected",
            data: trend.map(t => t.expected),
            borderColor: "#94a3b8",
            borderWidth: 2,
            tension: 0.4
          },
          {
            label: "Collected",
            data: trend.map(t => t.collected),
            borderColor: "#22c55e",
            borderWidth: 3,
            tension: 0.4
          }
        ]
      },

      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => formatMoney(v)
            }
          }
        }
      }

    });

  } catch (err) {

    console.error("Income chart error:", err);

  }

}



/* ======================================================
   OCCUPANCY CHART
====================================================== */

function drawOccupancyChart(occupied, vacant) {

  const ctx = document.getElementById("occupancyChart");

  if (!ctx) return;

  if (occupancyChart) occupancyChart.destroy();

  occupancyChart = new Chart(ctx, {

    type: "doughnut",

    data: {
      labels: ["Occupied", "Vacant"],
      datasets: [{
        data: [occupied, vacant],
        backgroundColor: ["#22c55e", "#e5e7eb"]
      }]
    },

    options: {
      cutout: "70%",
      responsive: true
    }

  });

}


/* ======================================================
   CACHE
====================================================== */

function cacheDashboard() {
  clearDashboardCache();
}


function clearDashboardCache() {
  localStorage.removeItem(DASHBOARD_CACHE_KEY);
}


/* ======================================================
   HELPERS
====================================================== */

function authHeader() {

  if (!currentUser?.token) {
    redirectLogin();
    return {};
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${currentUser.token}`
  };

}


function setText(id, value) {

  const el = document.getElementById(id);

  if (el) el.textContent = value ?? 0;

}

function safeText(value, fallback = "-") {

  const text =
    value === undefined || value === null || value === ""
      ? fallback
      : String(value);

  return window.escapeHtml ? window.escapeHtml(text) : text;

}


function formatMoney(amount) {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(amount);
  }

  return `ZAR ${Number(amount ?? 0).toFixed(2)}`;

}

async function loadSubscription(){

try{

const res = await fetch(`${API_URL}/subscription/status`,{
headers:{
Authorization:`Bearer ${currentUser.token}`
}
});

if(!res.ok) return;

const data = await res.json();

/* safer UI updates */
setText("subPlan", data.plan);
setText("unitsUsed", data.unitsUsed);
setText(
"unitsLimit",
data.maxUnits === -1 ? "Unlimited" : data.maxUnits
);

const plan = (data.plan || "free").toLowerCase();

/* FREE PLAN */
if(plan === "free"){

hide("menuReports");
hide("menuBankImport");
hide("menuAI");
hide("menuNotifications");
hide("menuInvoices");

}

/* STARTER PLAN */
if(plan === "starter"){

hide("menuReports");
hide("menuBankImport");
hide("menuAI");

}

}catch(err){

console.error("Subscription load error", err);

}

}


function fmtDate(d) {

  if (window.formatAppDate) {
    return window.formatAppDate(d);
  }

  return d
    ? new Date(d).toLocaleDateString()
    : "-";

}


function showUpgradeModal(){
document.getElementById("upgradeModal").classList.remove("hidden");
}

function closeUpgrade(){
document.getElementById("upgradeModal").classList.add("hidden");
}

async function upgradePlan(plan){

const user = JSON.parse(localStorage.getItem("user"));

await fetch(`${API_URL}/subscription/upgrade`,{
method:"POST",
headers:{
"Content-Type":"application/json",
Authorization:`Bearer ${user.token}`
},
body:JSON.stringify({plan})
});

notify("Plan upgraded!", "success");

location.reload();

}   

function showFeatureLock(plan){

const modal = document.getElementById("featureLockModal");
const text = document.getElementById("upgradeText");

if(!modal || !text) return;

text.textContent = `This feature requires the ${plan} plan.`;

modal.classList.remove("hidden");

}

function closeFeatureLock(){

document.getElementById("featureLockModal")
.classList.add("hidden");

}

/* ======================================================
   LOGOUT
====================================================== */

function logout() {

  localStorage.clear();
  redirectLogin();

}

window.logout = logout;

function initDashboardTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("getting-started", "startTutorialBtn");
}









