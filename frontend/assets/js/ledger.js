/* =========================================================
   LEDGER PAGE SCRIPT
   File: assets/js/ledger.js
========================================================= */

let currentUser = null;
let tenantId = null;

function money(value) {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value);
  }

  return `ZAR ${Number(value || 0).toFixed(2)}`;
}

function safeText(value, fallback = "-") {
  const text =
    value === undefined || value === null || value === ""
      ? fallback
      : String(value);

  return window.escapeHtml ? window.escapeHtml(text) : text;
}

/* =========================================================
   INIT
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const stored = localStorage.getItem("user");
  if (!stored) {
    window.location.href = "login.html";
    return;
  }

  currentUser = JSON.parse(stored);
  if (!currentUser.token) {
    window.location.href = "login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  tenantId = params.get("tenantId");

  if (!tenantId) {
    window.location.href = "tenants.html";
    return;
  }

  loadTenant();
  loadTenantLedger();
});

/* =========================================================
   LOAD TENANT DETAILS
========================================================= */
async function loadTenant() {
  try {
    const res = await fetch(`${API_URL}/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    if (!res.ok) return;

    const data = await res.json();
    const tenant = data?.tenant;
    if (!tenant) return;

    if (window.applyAppPreferences) {
      window.applyAppPreferences({
        currency: data.currency,
        locale: data.locale,
        timezone: data.timezone
      });
    }

    setText("tenantName", tenant.fullName || "Tenant Ledger");
    setText("tenantProperty", tenant.propertyId?.name || "-");
    setText("tenantUnit", tenant.unitId?.unitLabel || "-");
    setText("tenantRent", money(tenant.rentAmount || 0));
    setText("tenantDeposit", money(tenant.depositAmount || 0));

  } catch (err) {
    console.error("Error loading tenant:", err);
  }
}

/* =========================================================
   LOAD TENANT LEDGER (✅ FIXED ENDPOINT)
========================================================= */
async function loadTenantLedger() {
  try {
    const res = await fetch(
      `${API_URL}/ledger?tenantId=${tenantId}`,
      {
        headers: { Authorization: `Bearer ${currentUser.token}` }
      }
    );

    const data = await res.json();
    if (!res.ok || !data.ledger) return;

    renderLedger(data.ledger);

  } catch (err) {
    console.error("Error loading tenant ledger:", err);
  }
}

/* =========================================================
   RENDER LEDGER (✅ CORRECT RUNNING BALANCE)
========================================================= */
function renderLedger(entries) {
  const tbody = document.getElementById("ledgerBody");
  tbody.innerHTML = "";

  if (!entries.length) {
    tbody.innerHTML =
      `<tr><td colspan="5">No transactions found.</td></tr>`;
    return;
  }

  // Sort oldest → newest
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = 0;

  entries.forEach(entry => {
    const debit = Number(entry.debit || 0);
    const credit = Number(entry.credit || 0);

    runningBalance += debit - credit;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(entry.date)}</td>
      <td>${safeText(entry.description)}</td>
      <td>${debit ? money(debit) : "-"}</td>
      <td>${credit ? money(credit) : "-"}</td>
      <td style="font-weight:600;color:${runningBalance > 0 ? "#b91c1c" : "#166534"}">
        ${money(runningBalance)}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/* =========================================================
   HELPERS
========================================================= */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatDate(d) {
  if (!d) return "-";

  if (window.formatAppDate) {
    return window.formatAppDate(d);
  }

  return new Date(d).toLocaleDateString();
}
