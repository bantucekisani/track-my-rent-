// assets/js/leases.js
let currentUser = null;

let allTenants = [];
let allProperties = [];
let allLeases = [];
let unitsByProperty = {};
let editingLeaseId = null;

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

  setupModal();

await loadAppSettings();

await loadTenants();
await loadProperties();
await loadLeases();
initLeasesTutorial();
});

async function loadAppSettings(){

  try{

    const res = await fetch(`${API_URL}/dashboard/summary`,{
      headers:{
        Authorization:`Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();

    window.APP_CURRENCY = data.currency || "ZAR";
    window.APP_LOCALE = data.locale || "en-ZA";

  }catch(err){

    console.error("Failed to load currency",err);

    window.APP_CURRENCY="ZAR";
    window.APP_LOCALE="en-ZA";

  }

}
function money(value, currency){

  const c = currency || window.APP_CURRENCY || "ZAR";
  const locale = window.APP_LOCALE || "en-ZA";

  return new Intl.NumberFormat(locale,{
    style:"currency",
    currency:c
  }).format(Number(value || 0));

}
/* ========================
   MODAL SETUP
========================= */
function setupModal() {
  const modal = document.getElementById("leaseModal");
  const addBtn = document.getElementById("addLeaseBtn");
  const closeBtn = document.getElementById("closeLeaseModal");
  const cancelBtn = document.getElementById("cancelLeaseBtn");
  const form = document.getElementById("leaseForm");
  const propertySelect = document.getElementById("leasePropertyId");

  addBtn.addEventListener("click", openLeaseTutorialModal);

  closeBtn.addEventListener("click", closeLeaseTutorialModal);
  cancelBtn.addEventListener("click", closeLeaseTutorialModal);

  window.addEventListener("click", e => {
    if (e.target === modal) closeLeaseTutorialModal();
  });

  propertySelect.addEventListener("change", loadUnitsForLease);
  form.addEventListener("submit", saveLease);
}

function openLeaseTutorialModal() {
  const form = document.getElementById("leaseForm");

  editingLeaseId = null;
  document.getElementById("leaseModalTitle").textContent = "Create Lease";
  form?.reset();

  leaseTenantId.disabled = false;
  leasePropertyId.disabled = false;
  leaseUnitId.disabled = false;

  document.getElementById("leaseModal").classList.add("open");
}

function closeLeaseTutorialModal() {
  document.getElementById("leaseModal").classList.remove("open");
}

/* ========================
   LOAD TENANTS
========================= */
async function loadTenants() {
  const res = await fetch(`${API_URL}/tenants`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });
  const data = await res.json();
  allTenants = data.tenants || [];

  const select = document.getElementById("leaseTenantId");
  select.innerHTML = `<option value="">Select tenant</option>`;

  allTenants.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t._id;
    opt.textContent = t.fullName || "(no name)";
    select.appendChild(opt);
  });
}

/* ========================
   LOAD PROPERTIES
========================= */
async function loadProperties() {
  const res = await fetch(`${API_URL}/properties`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });
  const data = await res.json();
  allProperties = data.properties || [];

  const select = document.getElementById("leasePropertyId");
  select.innerHTML = `<option value="">Select property</option>`;

  allProperties.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p._id;
    opt.textContent = p.name || "(no name)";
    select.appendChild(opt);
  });
}

/* ========================
   LOAD UNITS
========================= */
async function loadUnitsForLease() {
  const propertyId = leasePropertyId.value;
  const unitSelect = leaseUnitId;
  unitSelect.innerHTML = `<option value="">Select unit</option>`;
  if (!propertyId) return;

  if (unitsByProperty[propertyId]) {
    fillUnitsDropdown(unitsByProperty[propertyId]);
    return;
  }

  const res = await fetch(`${API_URL}/units/by-property/${propertyId}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });
  const data = await res.json();
  unitsByProperty[propertyId] = data.units || [];
  fillUnitsDropdown(unitsByProperty[propertyId]);
}

function fillUnitsDropdown(units) {
  leaseUnitId.innerHTML = `<option value="">Select unit</option>`;
  units.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u._id;
    opt.textContent = u.unitLabel || "Unit";
    leaseUnitId.appendChild(opt);
  });
}

/* ========================
   LOAD LEASES
========================= */
async function loadLeases() {
  const res = await fetch(`${API_URL}/leases`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });
  const data = await res.json();
  allLeases = data.leases || [];
  renderLeases(allLeases);
}

function renderLeases(list) {
  const tbody = document.getElementById("leaseTableBody");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML =
      `<tr>
        <td colspan="8" class="empty-row">
          <div class="empty-state">
            <strong>No leases yet.</strong>
            <p>Create a lease after you have added a tenant and linked unit.</p>
            <div class="empty-state-actions">
              <button class="btn-primary btn-sm" onclick="document.getElementById('addLeaseBtn').click()">Create Lease</button>
              <button class="btn-secondary btn-sm" onclick="window.location.href='tenants.html?setup=1'">Review Tenants</button>
            </div>
          </div>
        </td>
      </tr>`;
    return;
  }

  list.forEach(l => {
    const startDate = l.leaseStart?.substring(0, 10) || "-";
    const endDate = l.leaseEnd?.substring(0, 10) || "Open";

    const signCell =
      l.status !== "Active"
        ? `<span style="color:#999">-</span>`
        : l.isSigned
          ? `<span style="color:#16a34a;font-weight:600">Signed</span>`
          : l.signToken
            ? `<span style="color:#2563eb;font-weight:600">Email Sent</span>`
            : `<button class="btn-primary btn-sm"
                onclick="sendForSignature('${l._id}')">
                Send for Signature
              </button>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.tenantId?.fullName || "-"}</td>
      <td>${l.propertyId?.name || "-"}<br/>
        <small>${l.unitId?.unitLabel || ""}</small>
      </td>
     <td>${money(l.monthlyRent, l.currency)}</td>
      <td>${startDate} - ${endDate}</td>
      <td style="font-family:monospace;">${l.referenceCode}</td>
      <td>${l.status}</td>
      <td>${signCell}</td>
      <td>
        <button class="btn-secondary btn-sm"
          onclick="editLease('${l._id}')">Edit</button>
        <button class="btn-primary btn-sm"
          style="background:#b91c1c"
          onclick="endLease('${l._id}')">End</button>
        <button class="btn-secondary btn-sm"
          onclick="downloadLeasePDF('${l._id}')">PDF</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ========================
   EMAIL SIGNING
========================= */
async function sendForSignature(leaseId) {
  if (!(await confirmAction("Send lease to tenant for signing?"))) return;

  const res = await fetch(`${API_URL}/leases/${leaseId}/send-sign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${currentUser.token}`
    }
  });

  const data = await res.json();

  if (!res.ok) {
    notify(data.message || "Failed to send signing email", "error");
    return;
  }

  notify("Signing email sent to tenant", "success");
  loadLeases();
}

/* ========================
   SAVE LEASE
========================= */
async function saveLease(e) {
  e.preventDefault();

  const body = {
    tenantId: leaseTenantId.value,
    propertyId: leasePropertyId.value,
    unitId: leaseUnitId.value,
    leaseStart: leaseStart.value,
    leaseEnd: leaseEnd.value,
    monthlyRent: Number(leaseRent.value),
    deposit: Number(leaseDeposit.value) || 0,
    escalationPercent: Number(leaseEscalation.value) || 0,
    paymentDueDay: Number(leaseDueDay.value) || 1
  };

  const url = editingLeaseId
    ? `${API_URL}/leases/${editingLeaseId}`
    : `${API_URL}/leases`;

  const method = editingLeaseId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    notify("Error saving lease", "error");
    return;
  }

  const actionLabel = editingLeaseId ? "Lease updated" : "Lease created";
  document.getElementById("leaseModal").classList.remove("open");
  editingLeaseId = null;
  loadLeases();
  notify(actionLabel, "success");
}

/* ========================
   END LEASE
========================= */
async function endLease(id) {
  if (!(await confirmAction("End this lease?"))) return;

  const res = await fetch(`${API_URL}/leases/${id}/end`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });

  if (!res.ok) {
    notify("Could not end lease", "error");
    return;
  }

  loadLeases();
  notify("Lease ended", "success");
}

/* ========================
   PDF
========================= */
async function downloadLeasePDF(id) {
  try {
    const res = await fetch(`${API_URL}/leases/${id}/pdf`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    if (!res.ok) {
      let message = "Failed to generate lease PDF";

      try {
        const data = await res.json();
        message = data.message || message;
      } catch {}

      notify(message, "error");
      return;
    }

    const blob = await res.blob();

    if (blob.type !== "application/pdf") {
      notify("Server did not return a PDF", "error");
      return;
    }

    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  } catch (err) {
    console.error("LEASE PDF ERROR:", err);
    notify("Lease PDF failed", "error");
  }
}

/* ========================
   LOGOUT
========================= */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

function initLeasesTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("leases", "startTutorialBtn");
}

window.openLeaseTutorialModal = openLeaseTutorialModal;
window.closeLeaseTutorialModal = closeLeaseTutorialModal;











