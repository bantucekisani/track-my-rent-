let currentUser;
let propertyId;
let editingUnitId = null;

function money(value) {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value);
  }

  return `ZAR ${Number(value || 0).toFixed(2)}`;
}

document.addEventListener("DOMContentLoaded", initUnitsPage);

function initUnitsPage() {
  currentUser = JSON.parse(localStorage.getItem("user"));
  if (!currentUser) return location.href = "login.html";

  propertyId = new URLSearchParams(window.location.search).get("property");
  if (!propertyId) return location.href = "properties.html";

  document.getElementById("addUnitBtn").onclick = openAddUnitModal;
  document.getElementById("closeUnitModal").onclick = closeUnitModalFn;
  document.getElementById("cancelUnitBtn").onclick = closeUnitModalFn;
  document.getElementById("unitForm").onsubmit = saveUnit;

  loadProperty();
  loadUnits();
  initUnitsTutorial();
}

/* PROPERTY */
async function loadProperty() {
  const res = await fetch(`${API_URL}/properties/${propertyId}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });
  const data = await res.json();
  if (data.property) {
    document.getElementById("propertyName").textContent =
      `Units - ${data.property.name}`;
  }
}

/* UNITS */
async function loadUnits() {
  const res = await fetch(`${API_URL}/units/by-property/${propertyId}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });
  const data = await res.json();

  const grid = document.getElementById("unitsGrid");
  grid.innerHTML = "";

  if (!data.units?.length) {
    grid.innerHTML = `
      <div class="card">
        <h3>No units yet.</h3>
        <p>Add your first unit for this property so you can attach tenants and leases.</p>
        <div class="card-actions">
          <button class="btn-primary" onclick="openAddUnitModal()">Add Unit</button>
          <button class="btn-secondary" onclick="window.location.href='tutorials.html'">View Tutorial</button>
        </div>
      </div>`;
    return;
  }

  data.units.forEach(unit => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <h3>${unit.unitLabel}</h3>
      <p><strong>Rent:</strong> ${money(unit.defaultRent || 0)}</p>
      <p><strong>Status:</strong> ${unit.status}</p>

      ${
        unit.bedrooms || unit.bathrooms || unit.sizeSqm
          ? `<p><strong>Details:</strong>
              ${unit.bedrooms || 0} bed /
              ${unit.bathrooms || 0} bath /
              ${unit.sizeSqm || 0} sqm
            </p>`
          : ""
      }

      ${
        unit.utilitiesIncluded?.length
          ? `<p><strong>Utilities:</strong> ${unit.utilitiesIncluded.join(", ")}</p>`
          : ""
      }

      <div class="card-actions">
        <button class="btn-secondary" onclick="editUnit('${unit._id}')">Edit</button>
        <button class="btn-danger" onclick="deleteUnit('${unit._id}')">Delete</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

/* MODAL */
function openAddUnitModal() {
  editingUnitId = null;
  document.getElementById("unitForm").reset();
  document.getElementById("unitModalTitle").textContent = "Add Unit";
  document.getElementById("unitModal").style.display = "flex";
}

function closeUnitModalFn() {
  document.getElementById("unitModal").style.display = "none";
}

/* SAVE */
async function saveUnit(e) {
  e.preventDefault();

  const utilities = [...document.querySelectorAll(".checkbox-group input:checked")]
    .map(cb => cb.value);

  const body = {
    propertyId,
    unitLabel: unitLabel.value.trim(),
    defaultRent: +defaultRent.value || 0,
    defaultDeposit: +defaultDeposit.value || 0,
    bedrooms: +bedrooms.value || 0,
    bathrooms: +bathrooms.value || 0,
    sizeSqm: +sizeSqm.value || 0,
    floorLevel: floorLevel.value.trim(),
    status: status.value,
    utilitiesIncluded: utilities,
    notes: notes.value.trim()
  };

  const res = await fetch(
    editingUnitId ? `${API_URL}/units/${editingUnitId}` : `${API_URL}/units`,
    {
      method: editingUnitId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(body)
    }
  );

  if (!res.ok) return notify("Save failed");
  closeUnitModalFn();
  loadUnits();
}

/* EDIT */
async function editUnit(id) {
  const res = await fetch(`${API_URL}/units/${id}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });
  const unit = (await res.json()).unit;

  editingUnitId = id;
  unitLabel.value = unit.unitLabel;
  defaultRent.value = unit.defaultRent || 0;
  defaultDeposit.value = unit.defaultDeposit || 0;
  bedrooms.value = unit.bedrooms || 0;
  bathrooms.value = unit.bathrooms || 0;
  sizeSqm.value = unit.sizeSqm || 0;
  floorLevel.value = unit.floorLevel || "";
  status.value = unit.status;
  notes.value = unit.notes || "";

  document.querySelectorAll(".checkbox-group input")
    .forEach(cb => cb.checked = unit.utilitiesIncluded?.includes(cb.value));

  unitModalTitle.textContent = "Edit Unit";
  unitModal.style.display = "flex";
}

/* DELETE */
async function deleteUnit(id) {
  if (!(await confirmAction("Delete this unit permanently?"))) return;

  await fetch(`${API_URL}/units/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });

  loadUnits();
}

window.editUnit = editUnit;
window.deleteUnit = deleteUnit;
window.openUnitTutorialModal = openAddUnitModal;
window.closeUnitTutorialModal = closeUnitModalFn;

function initUnitsTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("units", "startTutorialBtn");
}




