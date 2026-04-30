function notify(message, type = "info") {
  if (window.showToast) {
    window.showToast(message, type);
    return;
  }

  window.alert(message);
}

function confirmAction(message) {
  return window.confirm(message);
}
// =====================================================
// Track My Rent - Expenses Module (LEDGER BASED - FIXED)
// =====================================================

let currentUser = null;
let allExpenses = [];
let allProperties = [];

function money(value) {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value);
  }

  return `ZAR ${Number(value || 0).toFixed(2)}`;
}

/* =============================
   INIT
============================= */
document.addEventListener("DOMContentLoaded", async () => {
  const stored = localStorage.getItem("user");
  if (!stored) return (window.location.href = "login.html");

  currentUser = JSON.parse(stored);
  if (!currentUser.token) return (window.location.href = "login.html");

  bindEvents();
  await loadProperties();
  await loadExpenses();
  initExpensesTutorial();
});

/* =============================
   LOAD PROPERTIES
============================= */
async function loadProperties() {
  const res = await fetch(`${API_URL}/properties`, auth());
  const data = await res.json();

  allProperties = data.properties || [];

  const propertyFilter = document.getElementById("propertyFilter");
  const expenseProperty = document.getElementById("expenseProperty");

  propertyFilter.innerHTML = `<option value="">All</option>`;
  expenseProperty.innerHTML = `<option value="">None (Admin)</option>`;

  allProperties.forEach(p => {
    propertyFilter.innerHTML += `<option value="${p._id}">${p.name}</option>`;
    expenseProperty.innerHTML += `<option value="${p._id}">${p.name}</option>`;
  });
}

/* =============================
   LOAD EXPENSES
============================= */
async function loadExpenses() {
  const res = await fetch(`${API_URL}/ledger`, auth());
  const data = await res.json();

  allExpenses = (data.ledger || []).filter(e => e.type === "expense");
  applyFilters();
}

/* =============================
   FILTERING (FIXED)
============================= */
function applyFilters() {
  const search = document.getElementById("searchExpense").value.toLowerCase();
  const propertyId = document.getElementById("propertyFilter").value;
  const category = document.getElementById("categoryFilter").value;

  let filtered = [...allExpenses];

  if (search) {
    filtered = filtered.filter(e =>
      (e.description || "").toLowerCase().includes(search) ||
      (e.subtype || "").toLowerCase().includes(search)
    );
  }

  if (propertyId) {
    filtered = filtered.filter(
      e => e.propertyId && e.propertyId._id === propertyId
    );
  }

  if (category) {
    filtered = filtered.filter(e => e.subtype === category);
  }

  renderExpenses(filtered);
}

/* =============================
   RENDER TABLE (FIXED)
============================= */
function renderExpenses(list) {
  const tbody = document.getElementById("expensesTableBody");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML =
      `<tr><td colspan="5" class="empty-row">No expenses found</td></tr>`;
    return;
  }

  list.forEach(e => {
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(e.date)}</td>
        <td>${e.propertyId?.name || "-"}</td>
        <td>${e.subtype || "-"}</td>
        <td>${e.description || "-"}</td>
        <td style="color:#b91c1c;font-weight:600">
          -${money(Number(e.debit || 0))}
        </td>
      </tr>
    `;
  });
}

/* =============================
   EVENTS
============================= */
function bindEvents() {
  document.getElementById("addExpenseBtn").onclick = openModal;
  document.getElementById("closeExpenseModal").onclick = closeModal;
  document.getElementById("cancelExpense").onclick = closeModal;
  document.getElementById("expenseForm").onsubmit = submitExpense;

  document.getElementById("searchExpense").oninput = applyFilters;
  document.getElementById("propertyFilter").onchange = applyFilters;
  document.getElementById("categoryFilter").onchange = applyFilters;
}

/* =============================
   MODAL
============================= */
function openModal() {
  document.getElementById("expenseForm").reset();
  document.getElementById("expenseProperty").disabled = false;
  document.getElementById("expenseModal").classList.add("show");
}

function closeModal() {
  document.getElementById("expenseModal").classList.remove("show");
}

/* =============================
   SAVE EXPENSE
============================= */
async function submitExpense(e) {
  e.preventDefault();

  const propertyId = expenseProperty.value || null;
  const category = expenseCategory.value;

  // Enforce property unless admin
  if (category !== "admin" && !propertyId) {
    notify("Please select a property for this expense");
    return;
  }

  const payload = {
    propertyId,
    category,
    amount: Number(expenseAmount.value),
    description: expenseDescription.value,
    date: expenseDate.value
  };

  const res = await fetch(`${API_URL}/ledger/expense`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    notify("Failed to save expense");
    return;
  }

  closeModal();
  await loadExpenses();
}

/* =============================
   HELPERS
============================= */
function auth() {
  return { headers: { Authorization: `Bearer ${currentUser.token}` } };
}

function formatDate(d) {
  if (window.formatAppDate) {
    return window.formatAppDate(d);
  }

  return d ? new Date(d).toLocaleDateString() : "-";
}

/* =============================
   CATEGORY TO PROPERTY RULE
============================= */
const expenseProperty = document.getElementById("expenseProperty");
const expenseCategory = document.getElementById("expenseCategory");

expenseCategory.addEventListener("change", () => {
  if (expenseCategory.value === "admin") {
    expenseProperty.value = "";
    expenseProperty.disabled = true;
  } else {
    expenseProperty.disabled = false;
  }
});

function initExpensesTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("expenses", "startTutorialBtn");
}

window.openExpenseTutorialModal = openModal;
window.closeExpenseTutorialModal = closeModal;

