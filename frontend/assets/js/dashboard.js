/* ======================================================
   DASHBOARD - LEDGER BASED (PRODUCTION)
====================================================== */

let currentUser = null;

let incomeChart = null;
let occupancyChart = null;

let dashboardLoaded = false;
let dashboardLoading = false;
let latestDashboardSummary = null;
let latestRentStatus = null;

const DASHBOARD_CACHE_KEY = "dashboardCache";
const SETUP_GUARD_DISMISSED_KEY = "setupGuardDismissed";
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
  latestDashboardSummary = data;
  renderDashboardAttention();

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

  const summaryArrearsAmount = Number(data.arrears?.totalOutstanding || 0);
  const summaryArrearsTenants = Number(data.arrears?.lateTenantsCount || 0);

  setText("arrearsTenants", summaryArrearsTenants);
  setText("totalRollingArrears", formatMoney(summaryArrearsAmount));
  setText("arrearsAmount", formatMoney(summaryArrearsAmount));
  setText(
    "arrearsInsight",
    summaryArrearsAmount > 0
      ? `${summaryArrearsTenants} tenant${summaryArrearsTenants === 1 ? "" : "s"} need follow-up.`
      : "No tenant arrears are showing right now."
  );

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
    latestRentStatus = data;
    renderDashboardAttention();

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
    setText(
      "arrearsInsight",
      totalOutstanding > 0
        ? `${tenantCount} tenant${tenantCount === 1 ? "" : "s"} need follow-up.`
        : "No tenant arrears are showing right now."
    );

    if (latestDashboardSummary) {
      latestDashboardSummary.arrears = {
        ...(latestDashboardSummary.arrears || {}),
        lateTenantsCount: tenantCount,
        totalOutstanding
      };
      renderDashboardAttention();
    }

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

function getSetupGuideSteps(data) {
  const totals = data?.totals || {};
  const firstPropertyId = totals.firstPropertyId
    ? String(totals.firstPropertyId)
    : "";
  const unitHref = firstPropertyId
    ? `units.html?property=${encodeURIComponent(firstPropertyId)}&setup=1`
    : "properties.html?setup=1";

  return [
    {
      key: "property",
      title: "Create a property",
      text: "Start with the building, house, or rooming property you manage.",
      href: "properties.html?setup=1",
      action: "Add property",
      done: Number(totals.totalProperties || 0) > 0
    },
    {
      key: "units",
      title: "Add units to the property",
      text: "Create each rentable room, flat, cottage, or unit before assigning people.",
      href: unitHref,
      action: "Add units",
      done: Number(totals.totalUnits || 0) > 0
    },
    {
      key: "tenant",
      title: "Add a tenant",
      text: "Capture the tenant profile and contact details before creating a lease.",
      href: "tenants.html?setup=1",
      action: "Add tenant",
      done: Number(totals.totalTenants || 0) > 0
    },
    {
      key: "lease",
      title: "Create the lease",
      text: "Link tenant, property, unit, rent amount, deposit, and due dates.",
      href: "leases.html?setup=1",
      action: "Create lease",
      done: Number(totals.totalActiveLeases || totals.occupiedUnits || 0) > 0
    },
    {
      key: "payment",
      title: "Record the first payment",
      text: "Once money is received, record it so statements and arrears stay accurate.",
      href: "payments.html?setup=1",
      action: "Record payment",
      done:
        Number(totals.totalPayments || 0) > 0 ||
        Number(data?.rent?.collectedThisMonth || 0) > 0
    },
    {
      key: "reports",
      title: "Review reports",
      text: "Use reports and PDF exports once the core rental workflow is alive.",
      href: "reports.html?setup=1",
      action: "Open reports",
      done: false,
      finalStep: true
    }
  ];
}

function renderSetupGuardBubble(nextStep, complete) {
  const bubble = document.getElementById("setupGuardBubble");

  if (!bubble) {
    return;
  }

  if (complete || !nextStep) {
    bubble.classList.add("hidden");
    bubble.innerHTML = "";
    return;
  }

  const dismissedStep = localStorage.getItem(SETUP_GUARD_DISMISSED_KEY);
  const dismissed = dismissedStep === nextStep.key;

  if (dismissed) {
    bubble.classList.add("hidden");
    bubble.innerHTML = "";
    return;
  }

  bubble.dataset.stepKey = nextStep.key;

  bubble.innerHTML = `
    <button
      class="setup-guard-close"
      type="button"
      aria-label="Hide setup guide"
      onclick="dismissSetupGuard()"
    >&times;</button>
    <span class="setup-guard-kicker">Next setup step</span>
    <strong>${safeText(nextStep.title)}</strong>
    <p>${safeText(nextStep.text)}</p>
    <a href="${nextStep.href}">${safeText(nextStep.action)}</a>
  `;

  bubble.classList.remove("hidden");
}

function updateDashboardQuickstart(data) {
  const quickstart = document.getElementById("dashboardQuickstart");
  const stepsHost = document.getElementById("dashboardQuickstartSteps");

  if (!quickstart || !stepsHost) {
    return;
  }

  const steps = getSetupGuideSteps(data);
  const actionableSteps = steps.filter(step => !step.finalStep);
  const complete = actionableSteps.every(step => step.done);
  const nextStep =
    steps.find(step => !step.done && !step.finalStep) ||
    steps.find(step => step.finalStep);

  if (complete) {
    quickstart.classList.add("hidden");
    stepsHost.innerHTML = "";
    renderSetupGuardBubble(null, true);
    return;
  }

  stepsHost.innerHTML = steps.map((step, index) => {
    const isNext = nextStep?.key === step.key;
    const stateLabel = step.done ? "Done" : isNext ? "Next" : "Locked";
    const stepClass = [
      "quickstart-step",
      step.done ? "is-done" : "",
      isNext ? "is-next" : "",
      !step.done && !isNext ? "is-locked" : ""
    ].filter(Boolean).join(" ");

    return `
      <article class="${stepClass}">
        <span class="quickstart-step-status">${stateLabel}</span>
        <strong>${index + 1}. ${safeText(step.title)}</strong>
        <p>${safeText(step.text)}</p>
        ${
          step.done
            ? `<span class="quickstart-complete">Completed</span>`
            : isNext
              ? `<a href="${step.href}">${safeText(step.action)}</a>`
              : `<span class="quickstart-wait">Complete the previous step first</span>`
        }
      </article>
    `;
  }).join("");

  renderSetupGuardBubble(nextStep, complete);
  quickstart.classList.remove("hidden");
}

function getNextSetupStep(data) {
  return getSetupGuideSteps(data).find(step => !step.done && !step.finalStep);
}

function getAttentionItems(summary, rentStatus) {
  if (!summary) {
    return [];
  }

  const totals = summary.totals || {};
  const rent = summary.rent || {};
  const arrears = summary.arrears || {};
  const items = [];
  const setupStep = getNextSetupStep(summary);
  const outstandingThisMonth = Number(rent.outstandingThisMonth || 0);
  const arrearsAmount = Number(arrears.totalOutstanding || 0);
  const arrearsTenants = Number(arrears.lateTenantsCount || 0);
  const unpaidCount = Number(rentStatus?.unpaid || 0);
  const partialCount = Number(rentStatus?.partial || 0);
  const vacantUnits = Number(totals.vacantUnits || 0);

  if (setupStep) {
    items.push({
      tone: "setup",
      label: "Setup",
      title: setupStep.title,
      text: setupStep.text,
      href: setupStep.href,
      action: setupStep.action
    });
  }

  if (arrearsAmount > 0 || arrearsTenants > 0) {
    items.push({
      tone: "danger",
      label: "Arrears",
      title: `${arrearsTenants || "Some"} tenant${arrearsTenants === 1 ? "" : "s"} need follow-up`,
      text: `${formatMoney(arrearsAmount)} is outstanding across previous periods.`,
      href: "reports.html#arrears",
      action: "View arrears"
    });
  }

  if (outstandingThisMonth > 0) {
    items.push({
      tone: "warning",
      label: "This month",
      title: "Rent still outstanding",
      text: `${formatMoney(outstandingThisMonth)} is not collected for the current month yet.`,
      href: "payments.html",
      action: "Record payments"
    });
  }

  if (unpaidCount > 0 || partialCount > 0) {
    items.push({
      tone: "warning",
      label: "Collection",
      title: "Check unpaid and partial tenants",
      text: `${unpaidCount} unpaid and ${partialCount} partially paid for this month.`,
      href: "reports.html",
      action: "Review rent status"
    });
  }

  if (!setupStep && vacantUnits > 0) {
    items.push({
      tone: "neutral",
      label: "Vacancy",
      title: "Vacant units available",
      text: `${vacantUnits} unit${vacantUnits === 1 ? "" : "s"} are vacant. Check if they should be leased.`,
      href: "properties.html",
      action: "View units"
    });
  }

  if (!items.length) {
    items.push({
      tone: "success",
      label: "Clear",
      title: "Nothing urgent for today",
      text: "Setup, arrears, and this month's rent position look calm right now.",
      href: "reports.html",
      action: "Open reports"
    });
  }

  return items.slice(0, 4);
}

function renderDashboardAttention() {
  const host = document.getElementById("attentionItems");
  const summaryEl = document.getElementById("attentionSummary");

  if (!host || !summaryEl || !latestDashboardSummary) {
    return;
  }

  const items = getAttentionItems(latestDashboardSummary, latestRentStatus);
  const urgentCount = items.filter(item => ["danger", "warning", "setup"].includes(item.tone)).length;

  summaryEl.textContent =
    urgentCount > 0
      ? `${urgentCount} action${urgentCount === 1 ? "" : "s"} deserve attention before month-end.`
      : "No urgent actions are showing right now.";

  host.innerHTML = items.map(item => `
    <article class="attention-item attention-${item.tone}">
      <span class="attention-status">${safeText(item.label)}</span>
      <strong>${safeText(item.title)}</strong>
      <p>${safeText(item.text)}</p>
      <a href="${item.href}">${safeText(item.action)}</a>
    </article>
  `).join("");
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
            <div class="empty-state">
              <strong>No recent payments yet.</strong>
              <p>Record your first tenant payment to start building cashflow history.</p>
              <div class="empty-state-actions">
                <a class="primary-link" href="payments.html">Record Payment</a>
                <a class="secondary-link" href="tenants.html?setup=1">View Tenants</a>
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

function dismissSetupGuard() {
  const bubble = document.getElementById("setupGuardBubble");
  const stepKey = bubble?.dataset.stepKey || "dismissed";

  localStorage.setItem(SETUP_GUARD_DISMISSED_KEY, stepKey);

  if (bubble) {
    bubble.classList.add("hidden");
  }
}

/* ======================================================
   LOGOUT
====================================================== */

function logout() {

  localStorage.clear();
  redirectLogin();

}

window.logout = logout;
window.dismissSetupGuard = dismissSetupGuard;

function initDashboardTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("getting-started", "startTutorialBtn");
}









