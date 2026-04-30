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
document.addEventListener("DOMContentLoaded", () => {
  const stored = localStorage.getItem("user");
  if (!stored) {
    window.location.href = "login.html";
    return;
  }
});

const uploadForm = document.getElementById("uploadForm");
const uploadStatus = document.getElementById("uploadStatus");
const tableBody = document.getElementById("importTableBody");

const autoPostedEl = document.getElementById("autoPostedCount");
const pendingEl = document.getElementById("pendingCount");
const unmatchedEl = document.getElementById("unmatchedCount");

function formatMoney(value) {
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

function safeText(value, fallback = "-") {
  const text =
    value === undefined || value === null || value === ""
      ? fallback
      : String(value);

  return window.escapeHtml ? window.escapeHtml(text) : text;
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fileInput = document.getElementById("bankFile");
  if (!fileInput.files.length) {
    notify("Please select a CSV or PDF file");
    return;
  }

  uploadStatus.textContent = "Uploading and processing...";
  uploadStatus.style.color = "#555";

  const formData = new FormData();

  // ðŸ”´ MUST MATCH multer.single("statement")
  formData.append("statement", fileInput.files[0]);

  try {
    const res = await fetch(`${API_URL}/bank-import/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${JSON.parse(localStorage.getItem("user")).token}`
      },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      uploadStatus.textContent = data.message || "Upload failed";
      uploadStatus.style.color = "red";
      return;
    }

    // ======================
    // SUMMARY COUNTS
    // ======================
    autoPostedEl.textContent = data.autoPosted || 0;
    pendingEl.textContent = data.pendingReview || 0;
    unmatchedEl.textContent =
      typeof data.unmatchedCount === "number"
        ? data.unmatchedCount
        : Array.isArray(data.unmatched)
        ? data.unmatched.length
        : 0;

    if (window.applyAppPreferences) {
      window.applyAppPreferences({
        currency: data.currency,
        locale: data.locale,
        timezone: data.timezone
      });
    }

    uploadStatus.textContent =
      `Auto-posted ${data.autoPosted}, Pending ${data.pendingReview}, Unmatched ${data.unmatched}`;
    uploadStatus.style.color = "green";

    // ======================
    // COMBINE ALL ROWS
    // ======================
    const rows = [
      ...(data.matched || []).map(r => ({
        ...r,
        status: "AUTO POSTED"
      })),
      ...(data.pending || []).map(r => ({
        ...r,
        status: "PENDING"
      })),
      ...(data.unmatched || []).map(r => ({
        ...r,
        status: "UNMATCHED"
      })),
      ...(data.duplicates || []).map(r => ({
        ...r,
        status: "DUPLICATE"
      }))
    ];

    renderTable(rows);

  } catch (err) {
    console.error(err);
    uploadStatus.textContent = "Server error during upload";
    uploadStatus.style.color = "red";
  }
});

function renderTable(rows) {
  if (!rows.length) {
    tableBody.innerHTML =
      `<tr><td colspan="6" class="empty-row">No transactions found</td></tr>`;
    return;
  }

  tableBody.innerHTML = rows.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${safeText(r.tenant)}</td>
      <td>${safeText(r.reference)}</td>
      <td>${formatMoney(r.amount)}</td>
      <td>
        <span class="badge ${badgeClass(r.status)}">
          ${safeText(r.status)}
        </span>
      </td>
      <td>
        ${r.status === "PENDING"
          ? `<button class="btn-sm" onclick="approveImport('${r._id || ""}')">Approve</button>`
          : "-"}
      </td>
    </tr>
  `).join("");
}

function badgeClass(status) {
  if (status === "AUTO POSTED") return "success";
  if (status === "PENDING") return "warning";
  if (status === "DUPLICATE") return "warning";
  return "danger";
}

/* ======================
   APPROVE PENDING
====================== */
async function approveImport(id) {
  if (!id) return;

  const res = await fetch(`${API_URL}/bank-import/${id}/approve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JSON.parse(localStorage.getItem("user")).token}`
    }
  });

  if (!res.ok) {
    notify("Failed to approve payment");
    return;
  }

  notify("Payment approved and posted to ledger");
  location.reload();
}

/* ======================
   LOGOUT
====================== */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

window.approveImport = approveImport;

