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
let damages = [];
let fullLedger = [];
let reversingDamageId = null;

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

/* URL PARAMS */
const params = new URLSearchParams(window.location.search);
const tenantIdParam = params.get("tenantId");

/* DOM */
const tenantSelect = document.getElementById("tenantId");
const tableBody = document.getElementById("damageTableBody");

/* INIT */
document.addEventListener("DOMContentLoaded", () => {
  currentUser = JSON.parse(localStorage.getItem("user"));

  if (!currentUser || !currentUser.token) {
    location.href = "login.html";
    return;
  }

  loadTenants();
  loadDamages();
});

/* LOAD TENANTS */
async function loadTenants() {
  const res = await fetch(`${API_URL}/tenants`, auth());
  const data = await res.json();

  tenantSelect.innerHTML = `<option value="">Select Tenant</option>`;

  data.tenants.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t._id;
    opt.textContent = t.fullName;

    if (t._id === tenantIdParam) opt.selected = true;
    tenantSelect.appendChild(opt);
  });

  if (tenantIdParam) {
    const t = data.tenants.find(x => x._id === tenantIdParam);
    if (t) document.getElementById("tenantName").textContent = t.fullName;
  }
}

/* CHECK IF DAMAGE REVERSED */
function isReversed(damage) {
  return fullLedger.some(e =>
    e.type === "damage_reversal" &&
    e.reference === damage._id
  );
}

/* LOAD DAMAGES */
async function loadDamages() {
  const res = await fetch(`${API_URL}/ledger`, auth());
  const data = await res.json();

  fullLedger = data.ledger || [];

  damages = fullLedger.filter(e => e.type === "damage");

  if (tenantIdParam) {
    damages = damages.filter(
      d => d.tenantId?._id === tenantIdParam || d.tenantId === tenantIdParam
    );
  }

  tableBody.innerHTML = "";

  if (!damages.length) {
    tableBody.innerHTML = `<tr><td colspan="6">No damages recorded</td></tr>`;
    return;
  }

  damages.forEach(d => {
    const reversed = isReversed(d);

    tableBody.innerHTML += `
      <tr class="${reversed ? "row-reversed" : ""}">
        <td>${formatDate(d.date)}</td>
        <td>${d.tenantId?.fullName || "-"}</td>
        <td>${d.description}</td>
        <td>${money(d.debit)}</td>
        <td>
          ${reversed
            ? `<span class="badge-reversed">Reversed</span>`
            : `<span>-</span>`
          }
        </td>
        <td>
          ${
            reversed
              ? ""
              : `<button class="btn-danger btn-sm"
                    onclick="openReverseModal('${d._id}')">
                    Reverse
                 </button>`
          }
        </td>
      </tr>
    `;
  });
}

/* REVERSE FLOW */
function openReverseModal(damageId) {
  reversingDamageId = damageId;
  document.getElementById("reverseReason").value = "";
  document.getElementById("reverseModal").classList.add("open");
}

function closeReverseModal() {
  reversingDamageId = null;
  document.getElementById("reverseModal").classList.remove("open");
}

async function confirmReverse() {
  const reason = document.getElementById("reverseReason").value.trim();
  if (!reason) return notify("Reason required");

  const res = await fetch(`${API_URL}/ledger/damage/reverse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({
      damageEntryId: reversingDamageId,
      reason
    })
  });

  const data = await res.json();

  if (!res.ok) {
    notify(data.message || "Failed to reverse");
    return;
  }

  closeReverseModal();
  loadDamages();
}

/* ADD DAMAGE */
document.getElementById("damageForm").addEventListener("submit", async e => {
  e.preventDefault();

  const payload = {
    tenantId: tenantSelect.value,
    amount: Number(document.getElementById("cost").value),
    description: `${document.getElementById("title").value} - ${document.getElementById("description").value}`
  };

  const res = await fetch(`${API_URL}/ledger/damage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    notify(data.message || "Failed to save");
    return;
  }

  closeDamageModal();
  loadDamages();
});

/* MODALS */
function openDamageModal() {
  document.getElementById("damageModal").classList.add("open");
}

function closeDamageModal() {
  document.getElementById("damageForm").reset();
  document.getElementById("damageModal").classList.remove("open");
}

/* AUTH */
function auth() {
  return { headers: { Authorization: `Bearer ${currentUser.token}` } };
}

