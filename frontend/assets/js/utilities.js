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
let currentUser;

/* =============================
   URL CONTEXT
============================= */
const params = new URLSearchParams(window.location.search);
const tenantIdParam = params.get("tenantId");
const unitIdParam = params.get("unitId");

/* =============================
   DOM REFERENCES
============================= */
const tenantSelect = document.getElementById("tenantId");
const utilityType = document.getElementById("utilityType");
const paidBySelect = document.getElementById("paidBy");
const periodInput = document.getElementById("period");
const amountInput = document.getElementById("amount");
const notesInput = document.getElementById("notes");
const recurringMonthlyInput = document.getElementById("recurringMonthly");
const recurringExpenseWrap = document.getElementById("recurringExpenseWrap");

let contextPropertyId = "";
let contextUnitId = unitIdParam || "";
let includedUtilities = [];

/* =============================
   INIT
============================= */
document.addEventListener("DOMContentLoaded", () => {
  currentUser = JSON.parse(localStorage.getItem("user"));
  if (!currentUser || !currentUser.token) {
    location.href = "login.html";
    return;
  }

  loadTenants();
  loadTenantContext();
  periodInput.value = new Date().toISOString().slice(0, 7);
  syncPaidByUi();

  document
    .getElementById("utilityForm")
    .addEventListener("submit", submitUtility);

  tenantSelect.addEventListener("change", () => {
    if (tenantSelect.value) {
      loadTenantContext(tenantSelect.value);
    }
  });

  utilityType.addEventListener("change", syncChargeTypeDefaults);
  paidBySelect.addEventListener("change", syncPaidByUi);
});

/* =============================
   LOAD TENANTS
============================= */
async function loadTenants() {
  try {
    const res = await fetch(`${API_URL}/tenants`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    const data = await res.json();
    tenantSelect.innerHTML = `<option value="">Select tenant</option>`;

    data.tenants.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t._id;
      opt.textContent = t.fullName;

      if (t._id === tenantIdParam) {
        opt.selected = true;
        tenantSelect.disabled = true; // lock if from tenant page
      }

      tenantSelect.appendChild(opt);
    });

  } catch (err) {
    console.error("Load tenants error:", err);
  }
}

/* =============================
   HEADER CONTEXT
============================= */
async function loadTenantContext(tenantId = tenantIdParam || tenantSelect.value) {
  if (!tenantId) return;

  try {
    const res = await fetch(`${API_URL}/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    const data = await res.json();
    if (!res.ok) return;

    const tenant = data.tenant || data;
    const tenantNameEl = document.getElementById("tenantName");
    if (tenantNameEl) {
      tenantNameEl.textContent = tenant.fullName || "-";
    }

    contextPropertyId = tenant.propertyId?._id || tenant.propertyId || "";
    contextUnitId = unitIdParam || tenant.unitId?._id || tenant.unitId || "";
    includedUtilities = [];

    if (contextUnitId) {
      await loadUnitContext(contextUnitId);
    } else {
      syncChargeTypeDefaults();
    }

  } catch (err) {
    console.error("Load tenant context error:", err);
  }
}

async function loadUnitContext(unitId) {
  try {
    const res = await fetch(`${API_URL}/units/${unitId}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    const data = await res.json();
    if (!res.ok || !data.unit) return;

    includedUtilities = Array.isArray(data.unit.utilitiesIncluded)
      ? data.unit.utilitiesIncluded
      : [];
    contextPropertyId = data.unit.propertyId?._id || data.unit.propertyId || contextPropertyId;
    syncChargeTypeDefaults();

  } catch (err) {
    console.error("Load unit context error:", err);
  }
}

function syncPaidByUi() {
  const isOwnerPaid = paidBySelect.value === "OWNER";
  const [chargeType] = String(utilityType.value || "").split(":");
  const canRepeat = chargeType !== "damage";

  recurringExpenseWrap.style.display = isOwnerPaid && canRepeat ? "block" : "none";

  if (!isOwnerPaid || !canRepeat) {
    recurringMonthlyInput.checked = false;
  }
}

function syncChargeTypeDefaults() {
  const [chargeType, subtype] = String(utilityType.value || "").split(":");

  if (chargeType === "expense" || isIncludedUtility(chargeType, subtype)) {
    paidBySelect.value = "OWNER";
  }

  syncPaidByUi();
}

function ownerExpenseCategory(chargeType, subtype) {
  if (chargeType === "utility") return "utilities";
  if (chargeType === "levy") return "levies";
  if (chargeType === "maintenance" || chargeType === "damage") return "maintenance";
  if (chargeType === "expense" && subtype === "rates") return "rates";

  return "admin";
}

function isIncludedUtility(chargeType, subtype) {
  if (chargeType !== "utility") return false;

  const utilityLabel = {
    water: "Water",
    electricity: "Electricity",
    refuse: "Refuse"
  }[subtype];

  return Boolean(utilityLabel && includedUtilities.includes(utilityLabel));
}

function resetChargeForm(form) {
  const selectedTenantId = tenantSelect.value;

  form.reset();

  if (selectedTenantId) {
    tenantSelect.value = selectedTenantId;
  }

  periodInput.value = new Date().toISOString().slice(0, 7);
  syncPaidByUi();
}

/* =============================
   SUBMIT UTILITY (LEDGER)
============================= */
async function submitUtility(e) {
  e.preventDefault();

  if (!tenantSelect.value) {
    notify("Please select a tenant");
    return;
  }

  const [chargeType, subtype] = String(utilityType.value || "").split(":");
  const [periodYear, periodMonth] = String(periodInput.value || "")
    .split("-")
    .map(Number);

  if (!chargeType || !subtype) {
    notify("Please select a charge type");
    return;
  }

  const amount = Number(amountInput.value);

  if (!amount || Number.isNaN(amount) || amount <= 0) {
    notify("Please enter a valid amount");
    return;
  }

  if (
    !Number.isInteger(periodMonth) ||
    periodMonth < 1 ||
    periodMonth > 12 ||
    !Number.isInteger(periodYear)
  ) {
    notify("Please select a valid billing month");
    return;
  }

  const chargeLabel = utilityType.options[utilityType.selectedIndex]?.text || "Charge";
  const periodLabel = periodInput.value;
  const notes = notesInput.value.trim();
  const description = `${chargeLabel} - ${periodLabel}${notes ? " | " + notes : ""}`;
  const recurringDescription = `${chargeLabel}${notes ? " | " + notes : ""}`;

  if (paidBySelect.value === "OWNER") {
    await submitOwnerExpense({
      amount,
      category: ownerExpenseCategory(chargeType, subtype),
      description,
      recurringDescription,
      periodMonth,
      periodYear,
      form: e.target
    });
    return;
  }

  if (chargeType === "expense") {
    paidBySelect.value = "OWNER";
    syncPaidByUi();
    notify("Rates & taxes are owner expenses. Save them as paid by owner.");
    return;
  }

  if (isIncludedUtility(chargeType, subtype)) {
    paidBySelect.value = "OWNER";
    syncPaidByUi();
    notify(`${chargeLabel} is included in this unit's rent. Record it as an owner expense instead.`);
    return;
  }

  const payload = {
    tenantId: tenantSelect.value,
    amount,
    chargeType,
    subtype,
    periodMonth,
    periodYear,
    description
  };

  try {
    const res = await fetch(`${API_URL}/ledger/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      notify(data.message || "Failed to post charge");
      return;
    }

    notify("Charge posted successfully");
    resetChargeForm(e.target);

  } catch (err) {
    console.error("Post charge error:", err);
    notify("Server error");
  }
}

async function submitOwnerExpense({
  amount,
  category,
  description,
  recurringDescription,
  periodMonth,
  periodYear,
  form
}) {
  if (!contextPropertyId && tenantSelect.value) {
    await loadTenantContext(tenantSelect.value);
  }

  if (!contextPropertyId) {
    notify("Select a tenant linked to a property before saving an owner expense");
    return;
  }

  const isRecurring = recurringMonthlyInput.checked;
  const endpoint = isRecurring
    ? `${API_URL}/expenses/recurring`
    : `${API_URL}/ledger/expense`;

  const payload = isRecurring
    ? {
        propertyId: contextPropertyId,
        category,
        amount,
        description: recurringDescription || description,
        startMonth: periodMonth,
        startYear: periodYear
      }
    : {
        propertyId: contextPropertyId,
        category,
        amount,
        description,
        date: `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`
      };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      notify(data.message || "Failed to save owner expense");
      return;
    }

    notify(isRecurring ? "Monthly owner expense saved" : "Owner expense saved");
    resetChargeForm(form);

  } catch (err) {
    console.error("Save owner expense error:", err);
    notify("Server error");
  }
}

