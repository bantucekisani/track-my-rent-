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
let tenantId;

const tableBody = document.getElementById("maintenanceTableBody");
const tenantNameEl = document.getElementById("tenantName");
const tenantSelect = document.getElementById("tenantId");

function money(value) {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value);
  }

  return `ZAR ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (window.formatAppDate) {
    return window.formatAppDate(value);
  }

  return value ? new Date(value).toLocaleDateString() : "-";
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  currentUser = JSON.parse(localStorage.getItem("user"));

  if (!currentUser || !currentUser.token) {
    location.href = "login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  tenantId = params.get("tenantId");

  await loadTenants();
  loadTenant();
  loadMaintenance();
});

async function loadTenants() {
  const res = await fetch(`${API_URL}/tenants`, {
    headers: {
      Authorization: `Bearer ${currentUser.token}`
    }
  });

  const data = await res.json();
  const tenants = data.tenants || [];

  tenantSelect.innerHTML = `<option value="">Select tenant</option>`;

  tenants.forEach(t => {
    const option = document.createElement("option");
    option.value = t._id;
    option.textContent = t.fullName;

    if (t._id === tenantId) {
      option.selected = true;
      tenantSelect.disabled = true;
    }

    tenantSelect.appendChild(option);
  });
}

/* =========================
   LOAD TENANT
========================= */
async function loadTenant() {
  if (!tenantId) {
    tenantNameEl.textContent = "All";
    return;
  }

  const res = await fetch(`${API_URL}/tenants/${tenantId}`, {
    headers: {
      Authorization: `Bearer ${currentUser.token}`
    }
  });

  const data = await res.json();
  if (res.ok) {
    tenantNameEl.textContent = data.tenant?.fullName || data.fullName || "-";
  }
}

/* =========================
   LOAD MAINTENANCE
========================= */
async function loadMaintenance() {
  const url = tenantId
    ? `${API_URL}/maintenance?tenantId=${tenantId}`
    : `${API_URL}/maintenance`;

  const res = await fetch(
    url,
    {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    }
  );

  const data = await res.json();
  const rows = data.maintenance || data.records || [];
  tableBody.innerHTML = "";

  if (!res.ok || !rows.length) {
    tableBody.innerHTML =
      `<tr><td colspan="6">No maintenance jobs</td></tr>`;
    return;
  }

  rows.forEach(m => {
    const tenantName =
      m.tenantId?.fullName ||
      tenantNameEl.textContent ||
      "-";
    const liability =
      m.liability === "TENANT" ? "Tenant charge" : "Landlord expense";

    tableBody.innerHTML += `
      <tr>
        <td>${formatDate(m.createdAt || m.date)}</td>
        <td>${tenantName}</td>
        <td>${m.title || m.description || "-"}</td>
        <td>${money(m.cost)}</td>
        <td>${liability} / ${m.status || "-"}</td>
        <td></td>
      </tr>
    `;
  });
}

/* =========================
   ADD MAINTENANCE
========================= */
document
  .getElementById("maintenanceForm")
  .addEventListener("submit", async e => {
    e.preventDefault();

    const payload = {
      tenantId: tenantSelect.value || tenantId,
      title: document.getElementById("title").value.trim(),
      description: document.getElementById("description").value.trim(),
      cost: Number(document.getElementById("cost").value),
      liability: document.getElementById("liability").value
    };

    if (!payload.tenantId) {
      notify("Please select a tenant");
      return;
    }

    const res = await fetch(`${API_URL}/maintenance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      notify("Failed to save maintenance");
      return;
    }

    closeMaintenanceModal();
    loadMaintenance();
  });

/* =========================
   MODAL CONTROLS
========================= */
function openMaintenanceModal() {
  document.getElementById("maintenanceModal").classList.add("open");
}

function closeMaintenanceModal() {
  document.getElementById("maintenanceForm").reset();
  document.getElementById("maintenanceModal").classList.remove("open");
}

