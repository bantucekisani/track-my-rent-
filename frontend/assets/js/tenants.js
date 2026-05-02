/* =========================================================
   TENANTS PAGE SCRIPT
   File: assets/js/tenants.js
========================================================= */

let currentUser = null;

let allTenants = [];
let filteredTenants = [];
let allProperties = [];
let unitsByProperty = {};
let editingTenantId = null;

/* =========================
   AUTH + INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
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

loadAppSettings();
initTenantsPage();
initTenantsTutorial();
});

/* =========================
   PAGE SETUP
========================= */
function initTenantsPage() {
  const addBtn = document.getElementById("addTenantBtn");
  const modal = document.getElementById("tenantModal");
  const closeBtn = document.getElementById("closeTenantModal");
  const cancelBtn = document.getElementById("cancelTenantBtn");
  const form = document.getElementById("tenantForm");
  const searchInput = document.getElementById("tenantSearch");
  const statusFilter = document.getElementById("statusFilter");
  const propertySelect = document.getElementById("tenantPropertyId");

  addBtn.addEventListener("click", openTenantTutorialModal);

  closeBtn.addEventListener("click", closeTenantTutorialModal);
  cancelBtn.addEventListener("click", closeTenantTutorialModal);

  window.addEventListener("click", (e) => {
    if (e.target === modal) closeTenantTutorialModal();
  });

  form.addEventListener("submit", handleTenantSubmit);
  searchInput.addEventListener("input", applyFilters);
  statusFilter.addEventListener("change", applyFilters);
  propertySelect.addEventListener("change", onPropertyChange);

  loadProperties();
  loadTenants();
}

function openTenantTutorialModal() {
  const form = document.getElementById("tenantForm");

  editingTenantId = null;
  form?.reset();
  document.getElementById("tenantModalTitle").textContent = "Add Tenant";
  document.getElementById("status").value = "active";
  document.getElementById("preferredNotificationChannel").value = "app";
  document.getElementById("whatsappOptIn").checked = false;
  document.getElementById("tenantUnitId").innerHTML =
    `<option value="">Select unit</option>`;
  document.getElementById("tenantModal").classList.add("open");
}

function closeTenantTutorialModal() {
  document.getElementById("tenantModal").classList.remove("open");
}


function loadAppSettings() {
  if (window.getAppPreferences && window.applyAppPreferences) {
    window.applyAppPreferences(window.getAppPreferences());
  }

  if (window.refreshAppPreferencesFromSummary) {
    window.refreshAppPreferencesFromSummary({
      headers: { Authorization: `Bearer ${currentUser.token}` }
    }).catch(err => console.warn("Failed to refresh tenant preferences:", err));
    return;
  }

  window.APP_CURRENCY = window.APP_CURRENCY || "ZAR";
  window.APP_LOCALE = window.APP_LOCALE || "en-ZA";
}
/* =========================
   LOAD PROPERTIES
========================= */
async function loadProperties() {
  try {
    const res = await fetch(`${API_URL}/properties`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });
    const data = await res.json();
    if (!res.ok) return;

    allProperties = data.properties || [];
    const select = document.getElementById("tenantPropertyId");
    select.innerHTML = `<option value="">Select property</option>`;

    allProperties.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p._id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Load properties error:", err);
  }
}

/* =========================
   LOAD UNITS BY PROPERTY
========================= */
async function onPropertyChange() {
  const propertyId = document.getElementById("tenantPropertyId").value;
  const unitSelect = document.getElementById("tenantUnitId");
  unitSelect.innerHTML = `<option value="">Select unit</option>`;

  if (!propertyId) return;

  if (unitsByProperty[propertyId]) {
    fillUnitSelect(unitsByProperty[propertyId]);
    return;
  }

  try {
    const res = await fetch(`${API_URL}/units/by-property/${propertyId}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });
    const data = await res.json();
    if (!res.ok) return;

    unitsByProperty[propertyId] = data.units || [];
    fillUnitSelect(unitsByProperty[propertyId]);
  } catch (err) {
    console.error("Load units error:", err);
  }
}

function fillUnitSelect(units) {
  const unitSelect = document.getElementById("tenantUnitId");
  unitSelect.innerHTML = `<option value="">Select unit</option>`;

  units.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u._id;
    opt.textContent = u.unitLabel || "Unit";
    unitSelect.appendChild(opt);
  });
}

/* =========================
   LOAD TENANTS
========================= */
async function loadTenants() {
  try {
    const res = await fetch(`${API_URL}/tenants`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });
    const data = await res.json();
    if (!res.ok) return renderTenants([]);

    allTenants = data.tenants || [];
    filteredTenants = [...allTenants];
    renderTenants(filteredTenants);
  } catch (err) {
    console.error("Load tenants error:", err);
    renderTenants([]);
  }
}

/* =========================
   FILTER TENANTS
========================= */
function applyFilters() {
  const search = document.getElementById("tenantSearch").value.toLowerCase();
  const status = document.getElementById("statusFilter").value;

  filteredTenants = allTenants.filter(t => {
    const matchesSearch =
      !search ||
      (t.fullName || "").toLowerCase().includes(search) ||
      (t.phone || "").toLowerCase().includes(search);

    const matchesStatus =
      !status || (t.status || "active") === status;

    return matchesSearch && matchesStatus;
  });

  renderTenants(filteredTenants);
}

/* =========================
   RENDER TENANTS TABLE
========================= */
function renderTenants(list) {
  const tbody = document.getElementById("tenantTableBody");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">
          <div class="empty-state">
            <strong>No tenants yet.</strong>
            <p>Add your first tenant once you have a property or unit ready.</p>
            <div class="empty-state-actions">
              <button class="btn-primary btn-sm" onclick="document.getElementById('addTenantBtn').click()">Add Tenant</button>
              <button class="btn-secondary btn-sm" onclick="window.location.href='properties.html?setup=1'">Go to Properties</button>
            </div>
          </div>
        </td>
      </tr>`;
    return;
  }

  list.forEach(t => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${t.fullName || "-"}</td>
      <td>${t.phone || "-"}</td>
      <td>
        ${t.propertyId?.name || "-"}<br>
        <small>${t.unitId?.unitLabel || "-"}</small>
      </td>
      <td>${formatMoney(t.rentAmount || 0)}</td>
      <td>${t.status === "moved_out" ? "Moved Out" : "Active"}</td>
      <td>
       <button class="btn-secondary btn-sm"
    onclick="openTenantProfile('${t._id}')">
    Profile
  </button>
        <button class="btn-secondary btn-sm" onclick="editTenant('${t._id}')">Edit</button>
        <button class="btn-secondary btn-sm" onclick="openLedger('${t._id}')">Ledger</button>
         <button class="btn-secondary btn-sm"
    onclick="openUtilities('${t._id}', '${t.unitId?._id || ""}')">
    Utilities
  </button>
        <button class="btn-secondary btn-sm" onclick="openMaintenance('${t._id}')">Maintenance</button>
        <button class="btn-danger btn-sm" onclick="openDamage('${t._id}')">Damage</button>
        <button class="btn-primary btn-sm" style="background:#b91c1c"
          onclick="removeTenant('${t._id}')">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================
   ADD / EDIT TENANT
========================= */
async function handleTenantSubmit(e) {
  e.preventDefault();

  const body = {
    fullName: fullName.value.trim(),
    idNumber: idNumber.value.trim(),
    phone: phone.value.trim(),
    email: email.value.trim(),
    whatsappNumber: whatsappNumber.value.trim(),
    whatsappOptIn: whatsappOptIn.checked,
    preferredNotificationChannel: preferredNotificationChannel.value,
    nationality: nationality.value.trim(),
    propertyId: tenantPropertyId.value,
    unitId: tenantUnitId.value,
    rentAmount: Number(rentAmount.value),
    depositAmount: Number(depositAmount.value || 0),
    leaseStart: leaseStart.value,
    leaseEnd: leaseEnd.value || null,
    employerName: employerName.value.trim(),
    employerPhone: employerPhone.value.trim(),
    emergencyName: emergencyName.value.trim(),
    emergencyPhone: emergencyPhone.value.trim(),
    status: status.value
  };

  const url = editingTenantId
    ? `${API_URL}/tenants/${editingTenantId}`
    : `${API_URL}/tenants`;

  const method = editingTenantId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    notify("Failed to save tenant", "error");
    return;
  }

  tenantModal.classList.remove("open");
  editingTenantId = null;
  loadTenants();
  notify("Tenant saved successfully", "success");
}

/* =========================
   EDIT TENANT
========================= */
async function editTenant(id) {
  const t = allTenants.find(x => x._id === id);
  if (!t) return;

  editingTenantId = id;
  tenantModal.classList.add("open");
  tenantModalTitle.textContent = "Edit Tenant";

  fullName.value = t.fullName || "";
  idNumber.value = t.idNumber || "";
  phone.value = t.phone || "";
  email.value = t.email || "";
  whatsappNumber.value = t.whatsappNumber || "";
  whatsappOptIn.checked = Boolean(t.whatsappOptIn);
  preferredNotificationChannel.value = t.preferredNotificationChannel || "app";
  nationality.value = t.nationality || "";
  rentAmount.value = t.rentAmount || "";
  depositAmount.value = t.depositAmount || "";
  leaseStart.value = t.leaseStart?.substring(0, 10) || "";
  leaseEnd.value = t.leaseEnd?.substring(0, 10) || "";
  employerName.value = t.employerName || "";
  employerPhone.value = t.employerPhone || "";
  emergencyName.value = t.emergencyName || "";
  emergencyPhone.value = t.emergencyPhone || "";
  status.value = t.status || "active";
  tenantPropertyId.value = t.propertyId?._id || "";

  await onPropertyChange();

  tenantUnitId.value = t.unitId?._id || "";
}

/* =========================
   DELETE TENANT
========================= */
async function removeTenant(id) {
  if (!(await confirmAction("Remove this tenant?"))) return;

  const res = await fetch(`${API_URL}/tenants/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });

  if (!res.ok) {
    notify("Failed to remove tenant", "error");
    return;
  }

  loadTenants();
  notify("Tenant removed", "success");
}

/* =========================
   NAVIGATION
========================= */
function openLedger(tenantId) {
  window.location.href = `ledger.html?tenantId=${tenantId}`;
}

function openMaintenance(tenantId) {
  window.location.href = `maintenance.html?tenantId=${tenantId}`;
}

function openDamage(tenantId) {
  window.location.href = `damages.html?tenantId=${tenantId}`;
}

/* =========================
   LOGOUT
========================= */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}
window.openUtilities = function (tenantId, unitId) {
  if (!unitId) {
    notify("This tenant is not linked to a unit.", "warning");
    return;
  }

  window.location.href = `utilities.html?tenantId=${tenantId}&unitId=${unitId}`;
};  
function openLedger(tenantId) {
  window.location.href = `ledger.html?tenantId=${tenantId}`;
}

function openMaintenance(tenantId) {
  window.location.href = `maintenance.html?tenantId=${tenantId}`;
}

function openDamage(tenantId) {
  window.location.href = `damages.html?tenantId=${tenantId}`;
}

window.openUtilities = function (tenantId, unitId) {
  if (!unitId) {
    notify("This tenant is not linked to a unit.", "warning");
    return;
  }
  window.location.href = `utilities.html?tenantId=${tenantId}&unitId=${unitId}`;
};

/* Add this */
window.openTenantProfile = function (tenantId) {
  window.location.href = `tenant-profile.html?id=${tenantId}`;
};

function formatMoney(amount) {

  const currency = window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2
    }).format(Number(amount || 0));

  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }

}

function initTenantsTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("tenants", "startTutorialBtn");
}

window.openTenantTutorialModal = openTenantTutorialModal;
window.closeTenantTutorialModal = closeTenantTutorialModal;











