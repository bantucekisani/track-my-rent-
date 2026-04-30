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
document.addEventListener("DOMContentLoaded", () => {
  currentUser = JSON.parse(localStorage.getItem("user"));

  if (!currentUser || !currentUser.token) {
    location.href = "login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  tenantId = params.get("tenantId");

  if (!tenantId) {
    notify("Tenant context missing");
    return;
  }

  loadTenant();
  loadMaintenance();
});

/* =========================
   LOAD TENANT
========================= */
async function loadTenant() {
  const res = await fetch(`${API_URL}/tenants/${tenantId}`, {
    headers: {
      Authorization: `Bearer ${currentUser.token}`
    }
  });

  const data = await res.json();
  if (res.ok) {
    tenantNameEl.textContent = data.tenant.fullName;
  }
}

/* =========================
   LOAD MAINTENANCE
========================= */
async function loadMaintenance() {
  const res = await fetch(
    `${API_URL}/maintenance?tenantId=${tenantId}`,
    {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    }
  );

  const data = await res.json();
  tableBody.innerHTML = "";

  if (!res.ok || !data.maintenance.length) {
    tableBody.innerHTML =
      `<tr><td colspan="5">No maintenance jobs</td></tr>`;
    return;
  }

  data.maintenance.forEach(m => {
    tableBody.innerHTML += `
      <tr>
        <td>${formatDate(m.date)}</td>
        <td>${m.category}</td>
        <td>${m.description}</td>
        <td>${money(m.cost)}</td>
        <td>${m.status}</td>
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
      tenantId,
      category: document.getElementById("category").value,
      description: document.getElementById("description").value,
      cost: Number(document.getElementById("cost").value)
    };

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

