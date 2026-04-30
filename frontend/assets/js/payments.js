/* ==========================================================
   PAYMENTS MODULE (LEDGER-BASED)
========================================================== */

let currentUser = null;

let allPayments = [];
let filteredPayments = [];
let allProperties = [];
let currency = "ZAR";
let editingPaymentId = null;

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const PAYMENT_METHOD_LABELS = {
  eft: "EFT",
  cash: "Cash",
  card: "Card",
  other: "Other",
  "bank import": "Bank Import",
  bank_import: "Bank Import"
};

const DEFAULT_REFERENCE_PLACEHOLDER = "Bank ref, slip no...";

function formatMoney(value) {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value, currency);
  }

  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (window.formatAppDate) {
    return window.formatAppDate(value);
  }

  return value ? new Date(value).toLocaleDateString() : "-";
}

function safeText(value, fallback = "-") {
  const text =
    value === undefined || value === null || value === ""
      ? fallback
      : String(value);

  return window.escapeHtml ? window.escapeHtml(text) : text;
}

function formatPaymentMethod(method) {
  const normalized =
    typeof method === "string" && method.trim()
      ? method.trim().toLowerCase()
      : "eft";

  if (PAYMENT_METHOD_LABELS[normalized]) {
    return PAYMENT_METHOD_LABELS[normalized];
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getDisplayReference(payment) {
  return payment?.reference || payment?.tenantReference || "";
}

function toDateInputValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function getEditableMethodValue(method) {
  const normalized =
    typeof method === "string" && method.trim()
      ? method.trim().toLowerCase()
      : "eft";

  if (normalized === "cash") {
    return "Cash";
  }

  if (normalized === "card") {
    return "Card";
  }

  if (normalized === "other") {
    return "Other";
  }

  return "EFT";
}

/* ==========================================================
   INIT
========================================================== */
document.addEventListener("DOMContentLoaded", async () => {

  const stored = localStorage.getItem("user");
  if (!stored) return location.href = "login.html";

  currentUser = JSON.parse(stored);
  if (!currentUser.token) return location.href = "login.html";

  setupMonthSelect();
  setupYearSelect();

  try {

    await Promise.all([
      loadProperties(),
      loadPayments()
    ]);

    bindEvents();
    initPaymentsTutorial();

  } catch (err) {
    console.error("INIT ERROR:", err);
  }

});


/* ==========================================================
   EVENTS
========================================================== */
function bindEvents() {

  document.getElementById("paymentSearch").addEventListener("input", applyFilters);
  document.getElementById("monthFilter").addEventListener("change", applyFilters);
  document.getElementById("yearFilter").addEventListener("change", applyFilters);
  document.getElementById("propertyFilter").addEventListener("change", applyFilters);

  document.getElementById("addPaymentBtn")?.addEventListener("click", openCreatePaymentModal);

  document.getElementById("closePaymentModal")?.addEventListener("click", closeModal);
  document.getElementById("cancelPaymentBtn")?.addEventListener("click", closeModal);

  document.getElementById("paymentForm")?.addEventListener("submit", submitPayment);

}


function closeModal() {
  document.getElementById("paymentModal").classList.remove("show");
  resetPaymentFormState();
}

function resetPaymentFormState() {
  editingPaymentId = null;

  const form = document.getElementById("paymentForm");
  const tenantSelect = document.getElementById("tenantId");
  const amountInput = document.getElementById("amount");
  const tenantRefInput = document.getElementById("tenantRef");
  const methodInput = document.getElementById("method");
  const referenceInput = document.getElementById("reference");
  const notesInput = document.getElementById("notes");
  const paidOnInput = document.getElementById("paidOn");
  const modalTitle = document.getElementById("paymentModalTitle");
  const submitButton = form?.querySelector('button[type="submit"]');

  form?.reset();
  setupPaymentPeriod();

  if (modalTitle) {
    modalTitle.textContent = "Record Payment";
  }

  if (submitButton) {
    submitButton.textContent = "Save Payment";
  }

  if (tenantSelect) {
    tenantSelect.disabled = false;
    tenantSelect.value = "";
  }

  if (amountInput) {
    amountInput.disabled = false;
    amountInput.value = "";
  }

  if (tenantRefInput) {
    tenantRefInput.value = "";
  }

  if (methodInput) {
    methodInput.value = "EFT";
  }

  if (referenceInput) {
    referenceInput.value = "";
    referenceInput.placeholder = DEFAULT_REFERENCE_PLACEHOLDER;
  }

  if (notesInput) {
    notesInput.value = "";
  }

  if (paidOnInput) {
    paidOnInput.value = toDateInputValue(new Date());
  }
}

async function openCreatePaymentModal() {
  resetPaymentFormState();
  await loadTenants();
  document.getElementById("paymentModal").classList.add("show");
}

async function openEditPayment(paymentId) {
  const payment = allPayments.find(entry => entry._id === paymentId);

  if (!payment) {
    notify("Payment not found", "warning");
    return;
  }

  resetPaymentFormState();
  editingPaymentId = paymentId;

  await loadTenants();

  const form = document.getElementById("paymentForm");
  const tenantSelect = document.getElementById("tenantId");
  const amountInput = document.getElementById("amount");
  const tenantRefInput = document.getElementById("tenantRef");
  const methodInput = document.getElementById("method");
  const referenceInput = document.getElementById("reference");
  const notesInput = document.getElementById("notes");
  const paidOnInput = document.getElementById("paidOn");
  const paymentMonth = document.getElementById("paymentMonth");
  const paymentYear = document.getElementById("paymentYear");
  const modalTitle = document.getElementById("paymentModalTitle");
  const submitButton = form?.querySelector('button[type="submit"]');

  if (modalTitle) {
    modalTitle.textContent = "Edit Payment";
  }

  if (submitButton) {
    submitButton.textContent = "Save Changes";
  }

  if (tenantSelect) {
    tenantSelect.value = payment.tenant?._id || "";
    tenantSelect.disabled = true;
  }

  if (amountInput) {
    amountInput.value = Number(payment.amount || 0);
    amountInput.disabled = true;
  }

  if (tenantRefInput) {
    tenantRefInput.value = payment.tenantReference || "";
  }

  if (methodInput) {
    methodInput.value = getEditableMethodValue(payment.method);
  }

  if (referenceInput) {
    referenceInput.value = payment.reference || "";
    if (!payment.reference && payment.tenantReference) {
      referenceInput.placeholder = `Optional bank ref or slip no. Lease ref: ${payment.tenantReference}`;
    }
  }

  if (notesInput) {
    notesInput.value =
      payment.notes && payment.notes !== "Payment received"
        ? payment.notes
        : "";
  }

  if (paidOnInput) {
    paidOnInput.value = toDateInputValue(payment.paidOn);
  }

  if (paymentMonth) {
    paymentMonth.value = String(payment.periodMonth || "");
  }

  if (paymentYear) {
    paymentYear.value = String(payment.periodYear || new Date().getFullYear());
  }

  document.getElementById("paymentModal").classList.add("show");
}


/* ==========================================================
   DROPDOWNS
========================================================== */

function setupMonthSelect() {

  const select = document.getElementById("monthFilter");

  select.innerHTML = `<option value="">All</option>`;

  MONTHS.forEach(m => {
    select.innerHTML += `<option value="${m}">${m}</option>`;
  });

}


function setupYearSelect() {

  const select = document.getElementById("yearFilter");
  const now = new Date().getFullYear();

  select.innerHTML = `<option value="">All</option>`;

  for (let y = now - 2; y <= now + 1; y++) {
    select.innerHTML += `<option value="${y}">${y}</option>`;
  }

}


function setupPaymentPeriod() {

  const monthSel = document.getElementById("paymentMonth");
  const yearSel = document.getElementById("paymentYear");

  monthSel.innerHTML = "";
  yearSel.innerHTML = "";

  MONTHS.forEach((m,i)=>{
    monthSel.innerHTML += `<option value="${i + 1}">${m}</option>`;
  });

  const now = new Date().getFullYear();

  for (let y = now - 1; y <= now + 1; y++) {
    yearSel.innerHTML += `<option value="${y}">${y}</option>`;
  }

}


/* ==========================================================
   LOAD DATA
========================================================== */

async function loadProperties(){

  try {

    const res = await fetch(`${API_URL}/properties`, auth());
    const data = await res.json();

    allProperties = data.properties || [];

    const sel = document.getElementById("propertyFilter");

    sel.innerHTML = `<option value="">All properties</option>`;

    allProperties.forEach(p=>{
      sel.innerHTML += `<option value="${p._id}">${p.name}</option>`;
    });

  } catch(err){
    console.error("LOAD PROPERTIES ERROR:",err);
  }

}


async function loadPayments(){

  try{

    const res = await fetch(`${API_URL}/ledger/payments`, auth());
    const data = await res.json();

    if (window.applyAppPreferences) {
      window.applyAppPreferences({
        currency: data.currency,
        locale: data.locale,
        timezone: data.timezone
      });
    }

    currency =
      data.currency ||
      (window.getAppPreferences ? window.getAppPreferences().currency : "ZAR");

    allPayments = data.payments || [];

    applyFilters();

  } catch(err){

    console.error("LOAD PAYMENTS ERROR:",err);
    renderPayments([]);

  }

}


async function loadTenants(){

  try{

    const res = await fetch(`${API_URL}/tenants`, auth());
    const data = await res.json();

    const sel = document.getElementById("tenantId");

    sel.innerHTML = `<option value="">Select tenant</option>`;

    (data.tenants || []).forEach(t=>{
      sel.innerHTML += `<option value="${t._id}">${t.fullName}</option>`;
    });

  } catch(err){
    console.error("LOAD TENANTS ERROR:",err);
  }

}

async function loadTenantReference() {
  const tenantId = document.getElementById("tenantId")?.value;
  const tenantRefInput = document.getElementById("tenantRef");
  const referenceInput = document.getElementById("reference");

  if (!tenantRefInput || !referenceInput) {
    return;
  }

  tenantRefInput.value = "";
  referenceInput.placeholder = DEFAULT_REFERENCE_PLACEHOLDER;

  if (!tenantId) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/leases/active/${tenantId}`, auth());

    if (!res.ok) {
      throw new Error("No active lease reference found");
    }

    const data = await res.json();
    const leaseReference = data?.lease?.referenceCode || "";

    tenantRefInput.value = leaseReference;

    if (!referenceInput.value.trim() && leaseReference) {
      referenceInput.placeholder = `Optional bank ref or slip no. Lease ref: ${leaseReference}`;
    }

  } catch (err) {
    console.warn("LOAD TENANT REFERENCE ERROR:", err);
  }
}


/* ==========================================================
   FILTERS
========================================================== */

function applyFilters(){

  const search = document.getElementById("paymentSearch").value.toLowerCase();
  const month = document.getElementById("monthFilter").value;
  const year = document.getElementById("yearFilter").value;
  const propertyId = document.getElementById("propertyFilter").value;

  filteredPayments = allPayments.filter(p=>{

    const d = new Date(p.paidOn);

    return (

      (!search ||
        p.tenant?.fullName?.toLowerCase().includes(search) ||
        p.property?.name?.toLowerCase().includes(search) ||
        getDisplayReference(p).toLowerCase().includes(search)
      )

      && (!month || MONTHS[d.getMonth()] === month)

      && (!year || String(d.getFullYear()) === year)

      && (!propertyId || p.property?._id === propertyId)

    );

  });

  renderPayments(filteredPayments);

}


/* ==========================================================
   RENDER TABLE
========================================================== */

function renderPayments(list){

  const tbody = document.getElementById("paymentsTableBody");

  tbody.innerHTML = "";

  if(!list.length){

    tbody.innerHTML =
      `<tr>
        <td colspan="8" class="empty-row">
          <div style="padding:18px 8px;">
            <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">No payments recorded yet.</div>
            <div style="color:#64748b; margin-bottom:12px;">Once tenants start paying rent, you can capture each payment here.</div>
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
              <button class="btn-primary btn-sm" onclick="document.getElementById('addPaymentBtn').click()">Record Payment</button>
              <button class="btn-secondary btn-sm" onclick="window.location.href='tenants.html'">View Tenants</button>
            </div>
          </div>
        </td>
      </tr>`;

    return;
  }

  list.forEach(p=>{

    const periodText =
      p.periodMonth !== undefined && p.periodYear
        ? `${MONTHS[p.periodMonth - 1] || "-"} ${p.periodYear}`
        : "-";

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${safeText(p.tenant?.fullName)}</td>
      <td>
        <div>${safeText(p.property?.name)}</div>
        <div class="muted">${safeText(p.unit?.unitLabel, "")}</div>
      </td>
      <td>${formatMoney(p.amount)}</td>
      <td>${safeText(periodText)}</td>
      <td>${formatDate(p.paidOn)}</td>
      <td>${safeText(formatPaymentMethod(p.method))}</td>
      <td>${safeText(getDisplayReference(p))}</td>
      <td>
        <button
          type="button"
          class="btn-secondary btn-sm"
          onclick="openEditPayment('${p._id}')"
        >
          Edit
        </button>
      </td>
    `;

    tbody.appendChild(row);

  });

}


/* ==========================================================
   SUBMIT PAYMENT
========================================================== */

async function submitPayment(e){

  e.preventDefault();

  const tenantId = document.getElementById("tenantId").value;
  const isEditing = Boolean(editingPaymentId);

  if(!tenantId){
    notify("Please select tenant", "warning");
    return;
  }

  const payload = {
    paidOn: document.getElementById("paidOn").value,
    method: document.getElementById("method").value,
    reference: document.getElementById("reference").value.trim(),
    notes: document.getElementById("notes").value,
    periodMonth: Number(document.getElementById("paymentMonth").value),
    periodYear: Number(document.getElementById("paymentYear").value)
  };

  if (!isEditing) {
    payload.tenantId = tenantId;
    payload.amount = Number(document.getElementById("amount").value);
  }

  try{

    const res = await fetch(
      isEditing
        ? `${API_URL}/ledger/payment/${editingPaymentId}`
        : `${API_URL}/ledger/payment`,
      {
      method: isEditing ? "PUT" : "POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:`Bearer ${currentUser.token}`
      },
      body:JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if(!res.ok) throw new Error(data.message || "Request failed");

    closeModal();

    await loadPayments();
    notify(
      isEditing
        ? "Payment updated successfully"
        : "Payment recorded successfully",
      "success"
    );

  } catch(err){

    console.error("PAYMENT SAVE ERROR:",err);

    notify(err.message || "Failed to save payment", "error");

  }

}


/* ==========================================================
   AUTH HELPER
========================================================== */

function auth(){
  return {
    headers:{
      Authorization:`Bearer ${currentUser.token}`
    }
  };
}


/* ==========================================================
   LOGOUT
========================================================== */

function logout(){
  localStorage.clear();
  location.href="login.html";
}

window.logout = logout;
window.loadTenantReference = loadTenantReference;
window.openEditPayment = openEditPayment;
window.openPaymentTutorialModal = openCreatePaymentModal;
window.closePaymentTutorialModal = closeModal;

function initPaymentsTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("payments", "startTutorialBtn");
}









