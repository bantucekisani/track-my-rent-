/* ==========================================================
   NOTIFICATIONS MODULE
   - List notifications
   - Filter (search, type, unread/all)
   - Mark read / mark all read
   - Delete
   - Update bell badge
========================================================== */

let currentUser = null;
let allNotifications = [];
let filteredNotifications = [];

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

  initNotificationsPage();
});

function initNotificationsPage() {
  const searchInput = document.getElementById("notifSearch");
  const typeFilter = document.getElementById("notifTypeFilter");
  const unreadFilter = document.getElementById("notifUnreadFilter");
  const markAllReadBtn = document.getElementById("markAllReadBtn");

  // Filters
  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (typeFilter) typeFilter.addEventListener("change", applyFilters);
  if (unreadFilter) unreadFilter.addEventListener("change", loadNotificationsFromServer);

  if (markAllReadBtn) {
    markAllReadBtn.addEventListener("click", markAllRead);
  }

  // Load data
  loadNotificationsFromServer();
  refreshNotifBadge();
}

/* =========================
   LOAD FROM SERVER
========================= */
async function loadNotificationsFromServer() {
  try {
    const unreadFilter = document.getElementById("notifUnreadFilter");
    const unreadOnly = unreadFilter && unreadFilter.value === "unread";

    const params = new URLSearchParams();
    if (unreadOnly) {
      params.append("unreadOnly", "true");
    }
    params.append("limit", "100");

    const res = await fetch(`${API_URL}/notifications?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Error loading notifications:", data);
      renderNotifications([]);
      return;
    }

    allNotifications = data.notifications || [];
    applyFilters();
    refreshNotifBadge();

  } catch (err) {
    console.error("Error loading notifications:", err);
    renderNotifications([]);
  }
}

/* =========================
   FILTER (SEARCH + TYPE)
========================= */
function applyFilters() {
  const search = (document.getElementById("notifSearch")?.value || "")
    .toLowerCase()
    .trim();

  const typeValue = document.getElementById("notifTypeFilter")?.value || "";

  filteredNotifications = allNotifications.filter(n => {
    const title = (n.title || "").toLowerCase();
    const message = (n.message || "").toLowerCase();
    const type = n.type || "";

    const matchesSearch =
      !search || title.includes(search) || message.includes(search);

    const matchesType = !typeValue || type === typeValue;

    return matchesSearch && matchesType;
  });

  renderNotifications(filteredNotifications);
}

/* =========================
   RENDER TABLE
========================= */
function renderNotifications(list) {
  const tbody = document.getElementById("notificationsTableBody");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">
          <div style="padding:18px 8px;">
            <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">No notifications right now.</div>
            <div style="color:#64748b;">You are all caught up. New alerts for payments, leases, and arrears will appear here.</div>
          </div>
        </td>
      </tr>`;
    return;
  }

  list.forEach(n => {
    const tr = document.createElement("tr");

    // Slight highlight if unread
    if (!n.isRead) {
      tr.style.background = "#eef2ff"; // light blue-ish
    }

    const badgeColor = getTypeColor(n.type);
    const typeLabel = (n.type || "other").replace(/_/g, " ");

    const relatedBits = [];
    if (n.propertyId) relatedBits.push("Property");
    if (n.unitId) relatedBits.push("Unit");
    if (n.tenantId) relatedBits.push("Tenant");
    if (n.leaseId) relatedBits.push("Lease");
    const relatedText = relatedBits.join(" / ") || "-";

    let dateStr = "-";
    if (n.createdAt) {
      try {
        const d = new Date(n.createdAt);
        dateStr = d.toLocaleString();
      } catch (e) {
        dateStr = String(n.createdAt);
      }
    }

    tr.innerHTML = `
      <td>
        <span style="
          display:inline-block;
          padding:3px 8px;
          border-radius:999px;
          font-size:0.75rem;
          text-transform:capitalize;
          background:${badgeColor.bg};
          color:${badgeColor.fg};
        ">
          ${typeLabel}
        </span>
      </td>
      <td>
        <div style="font-weight:600;">${n.title || ""}</div>
        <div style="font-size:0.85rem; color:#4b5563; margin-top:2px;">
          ${n.message || ""}
        </div>
      </td>
      <td style="font-size:0.85rem; color:#4b5563;">
        ${relatedText}
      </td>
      <td style="font-size:0.85rem;">${dateStr}</td>
      <td style="font-size:0.85rem;">
        ${n.isRead ? "Read" : "Unread"}
      </td>
      <td>
        <button
          class="btn-secondary btn-sm"
          style="margin-bottom:4px; width:80px;"
          onclick="markOneRead('${n._id}')"
        >
          Mark read
        </button>
        <button
          class="btn-primary btn-sm"
          style="background:#b91c1c; width:80px;"
          onclick="deleteNotification('${n._id}')"
        >
          Delete
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/* =========================
   TYPE COLORS
========================= */
function getTypeColor(type) {
  switch (type) {
    case "late_rent":
      return { bg: "#fee2e2", fg: "#b91c1c" };
    case "payment_full":
      return { bg: "#dcfce7", fg: "#166534" };
    case "payment_partial":
      return { bg: "#fef9c3", fg: "#854d0e" };
    case "payment_over":
      return { bg: "#e0f2fe", fg: "#075985" };
    case "lease_missing":
    case "lease_expiring":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "system":
      return { bg: "#e5e7eb", fg: "#111827" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}

/* =========================
   MARK ONE AS READ
========================= */
async function markOneRead(id) {
  try {
    const res = await fetch(`${API_URL}/notifications/${id}/read`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      notify(data.message || "Could not mark as read");
      return;
    }

    await loadNotificationsFromServer();
  } catch (err) {
    console.error("Error marking read:", err);
    notify("Server error");
  }
}

/* =========================
   MARK ALL AS READ
========================= */
async function markAllRead() {
  if (!(await confirmAction("Mark all notifications as read?"))) return;

  try {
    const res = await fetch(`${API_URL}/notifications/read-all`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      notify(data.message || "Could not mark all as read");
      return;
    }

    await loadNotificationsFromServer();
  } catch (err) {
    console.error("Error marking all read:", err);
    notify("Server error");
  }
}

/* =========================
   DELETE NOTIFICATION
========================= */
async function deleteNotification(id) {
  if (!(await confirmAction("Delete this notification?"))) return;

  try {
    const res = await fetch(`${API_URL}/notifications/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      notify(data.message || "Could not delete");
      return;
    }

    await loadNotificationsFromServer();
  } catch (err) {
    console.error("Error deleting notification:", err);
    notify("Server error");
  }
}

/* =========================
   BADGE + NAV
========================= */
async function refreshNotifBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;

  try {
    const res = await fetch(`${API_URL}/notifications/unread-count`, {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Error loading unread count:", data);
      return;
    }

    const count = data.count || 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-flex" : "none";

  } catch (err) {
    console.error("Error unread count:", err);
  }
}

function goToNotifications() {
  window.location.href = "notifications.html";
}

/* =========================
   LOGOUT
========================= */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}




