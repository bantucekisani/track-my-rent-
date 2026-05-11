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

/* =============================
   DOM REFERENCES
============================= */
const tenantSelect = document.getElementById("tenantId");
const utilityType = document.getElementById("utilityType");
const periodInput = document.getElementById("period");
const amountInput = document.getElementById("amount");
const notesInput = document.getElementById("notes");

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

  document
    .getElementById("utilityForm")
    .addEventListener("submit", submitUtility);
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
async function loadTenantContext() {
  if (!tenantIdParam) return;

  try {
    const res = await fetch(`${API_URL}/tenants/${tenantIdParam}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    const data = await res.json();
    if (!res.ok) return;

    const tenantNameEl = document.getElementById("tenantName");
    if (tenantNameEl) {
      tenantNameEl.textContent = data.fullName || "-";
    }

  } catch (err) {
    console.error("Load tenant context error:", err);
  }
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

  const payload = {
    tenantId: tenantSelect.value,
    amount: Number(amountInput.value),
    chargeType,
    subtype,
    periodMonth,
    periodYear,
    description: `${chargeLabel} - ${periodLabel}${notes ? " | " + notes : ""}`
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
      notify(data.message || "Failed to post utility");
      return;
    }

    notify("Charge posted successfully");
    e.target.reset();

  } catch (err) {
    console.error("Post utility error:", err);
    notify("Server error");
  }
}

