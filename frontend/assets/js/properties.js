let currentUser = null;

let editingPropertyId = null;

/* =====================================================
   INIT
===================================================== */
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

  initPropertiesPage();
  initPropertiesTutorial();
});

function initPropertiesPage() {
  const addBtn = document.getElementById("addPropertyBtn");
  const modal = document.getElementById("propertyModal");
  const closeBtn = document.getElementById("closePropertyModal");
  const cancelBtn = document.getElementById("cancelPropertyBtn");
  const form = document.getElementById("addPropertyForm");

  addBtn.addEventListener("click", openPropertyTutorialModal);

  closeBtn.addEventListener("click", closePropertyTutorialModal);

  cancelBtn.addEventListener("click", () => {
    editingPropertyId = null;
    closePropertyTutorialModal();
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      editingPropertyId = null;
      closePropertyTutorialModal();
    }
  });

  form.addEventListener("submit", handlePropertySubmit);

  loadProperties();
}

/* =====================================================
   RESET FORM
===================================================== */
function resetPropertyForm() {
  editingPropertyId = null;
  document.getElementById("propertyModalTitle").textContent = "Add Property";
  document.getElementById("addPropertyForm").reset();
}

function openPropertyTutorialModal() {
  editingPropertyId = null;
  resetPropertyForm();
  document.getElementById("propertyModal").classList.add("open");
}

function closePropertyTutorialModal() {
  document.getElementById("propertyModal").classList.remove("open");
}

/* =====================================================
   LOAD PROPERTIES
===================================================== */
async function loadProperties() {
  try {
    const res = await fetch(`${API_URL}/properties`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    const data = await res.json();
    const grid = document.getElementById("propertiesGrid");

    if (!res.ok) {
      grid.innerHTML = `
        <div class="card">
          <div class="card-label">We could not load your properties.</div>
          <div class="card-sub">Try again now, or open tutorials while we reconnect.</div>
          <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn-primary btn-sm" onclick="loadProperties()">Retry</button>
            <button class="btn-secondary btn-sm" onclick="window.location.href='tutorials.html'">Open Tutorials</button>
          </div>
        </div>`;
      return;
    }

    grid.innerHTML = "";

    if (!data.properties || !data.properties.length) {
      grid.innerHTML = `
        <div class="card empty-state-card">
          <div class="empty-state">
            <strong>No properties yet.</strong>
            <p>Start by adding your first property so you can create units, tenants, and leases.</p>
            <div class="empty-state-actions">
            <button class="btn-primary btn-sm" onclick="document.getElementById('addPropertyBtn').click()">Add Property</button>
            <button class="btn-secondary btn-sm" onclick="window.location.href='dashboard.html'">Back to Dashboard</button>
            </div>
          </div>
        </div>`;
      return;
    }

    data.properties.forEach(p => {
      const card = document.createElement("div");
      card.className = "card property-card";

      const address = [p.addressLine1, p.city]
        .filter(Boolean)
        .join(", ");

      card.innerHTML = `
        <div class="card-label">${p.type?.toUpperCase() || "PROPERTY"}</div>
        <div class="card-value" style="font-size:1.3rem;">
          ${p.name}
        </div>
        <div class="card-sub">
          ${address || "No address captured"}
        </div>

        <div class="card-sub" style="margin-top:6px;">
          Units: <strong>${p.unitCount || 0}</strong>
        </div>

        <div class="property-card-actions">
          <button class="btn-secondary btn-sm"
            onclick="editProperty('${p._id}')">
            Edit
          </button>

          <button class="btn-danger btn-sm"
            onclick="deleteProperty('${p._id}')">
            Delete
          </button>

          <button class="btn-primary btn-sm"
            onclick="openUnits('${p._id}')">
            View Units
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

  } catch (err) {
    console.error("Error loading properties:", err);
  }
}

/* =====================================================
   OPEN UNITS
===================================================== */
function openUnits(id) {
  window.location.href = `units.html?property=${id}`;
}

/* =====================================================
   SUBMIT (ADD OR EDIT)
===================================================== */
async function handlePropertySubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("propertyModal");

  const body = {
    name: document.getElementById("name")?.value.trim() || "",
    type: document.getElementById("propertyType")?.value.trim() || "other",
    addressLine1: document.getElementById("addressLine1")?.value.trim() || "",
    addressLine2: document.getElementById("addressLine2")?.value.trim() || "",
    city: document.getElementById("city")?.value.trim() || "",
    province: document.getElementById("province")?.value.trim() || "",
    postalCode: document.getElementById("postalCode")?.value.trim() || "",
    country: document.getElementById("country")?.value.trim() || "South Africa",
    notes: document.getElementById("notes")?.value.trim() || ""
  };

  let url = `${API_URL}/properties`;
  let method = "POST";

  if (editingPropertyId) {
    url = `${API_URL}/properties/${editingPropertyId}`;
    method = "PUT";
  }

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      notify(data.message || "Could not save property", "error");
      return;
    }

    notify(editingPropertyId ? "Property updated" : "Property added", "success");

    editingPropertyId = null;
    modal.classList.remove("open");
    loadProperties();

  } catch (err) {
    console.error("Error saving property:", err);
    notify("Server error saving property", "error");
  }
}

/* =====================================================
   EDIT PROPERTY
===================================================== */
async function editProperty(id) {
  editingPropertyId = id;

  try {
    const res = await fetch(`${API_URL}/properties/${id}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    const data = await res.json();

    if (!res.ok) {
      notify("Could not load property details", "error");
      return;
    }

    const p = data.property;

    document.getElementById("propertyModalTitle").textContent = "Edit Property";

    document.getElementById("name").value = p.name || "";
    document.getElementById("propertyType").value = p.type || "other";
    document.getElementById("addressLine1").value = p.addressLine1 || "";
    document.getElementById("addressLine2").value = p.addressLine2 || "";
    document.getElementById("city").value = p.city || "";
    document.getElementById("province").value = p.province || "";
    document.getElementById("postalCode").value = p.postalCode || "";
    document.getElementById("country").value = p.country || "South Africa";
    document.getElementById("notes").value = p.notes || "";

    document.getElementById("propertyModal").classList.add("open");

  } catch (err) {
    console.error("Error loading property:", err);
  }
}

/* =====================================================
   DELETE PROPERTY
===================================================== */
async function deleteProperty(id) {
  if (!(await confirmAction("Are you sure you want to delete this property?")))
    return;

  try {
    const res = await fetch(`${API_URL}/properties/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    const data = await res.json();

    if (!res.ok) {
      notify(data.message || "Could not delete property", "error");
      return;
    }

    notify("Property deleted", "success");
    loadProperties();

  } catch (err) {
    console.error("Error deleting property:", err);
    notify("Server error deleting property", "error");
  }
}

/* =====================================================
   LOGOUT
===================================================== */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

function initPropertiesTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("properties", "startTutorialBtn");
}

window.openPropertyTutorialModal = openPropertyTutorialModal;
window.closePropertyTutorialModal = closePropertyTutorialModal;









