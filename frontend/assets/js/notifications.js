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
          <div class="notification-empty">
            <strong>No notifications right now.</strong>
            <span>You are all caught up. New alerts for payments, leases, and arrears will appear here.</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  list.forEach(n => {
    const tr = document.createElement("tr");

    if (!n.isRead) {
      tr.classList.add("notification-row-unread");
    }

    const type = n.type || "other";
    const typeLabel = safeText(type.replace(/_/g, " "));

    const relatedBits = [];
    if (n.propertyId) relatedBits.push("Property");
    if (n.unitId) relatedBits.push("Unit");
    if (n.tenantId) relatedBits.push("Tenant");
    if (n.leaseId) relatedBits.push("Lease");
    const relatedText = safeText(relatedBits.join(" / ") || "-");

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
        <span class="notification-type-badge ${safeTypeClass(type)}">
          ${typeLabel}
        </span>
      </td>
      <td>
        <div class="notification-title">${safeText(n.title || "")}</div>
        <div class="notification-message">
          ${safeText(n.message || "")}
        </div>
      </td>
      <td class="notification-related">
        ${relatedText}
      </td>
      <td class="notification-date">${safeText(dateStr)}</td>
      <td>
        <span class="notification-status-badge ${n.isRead ? "read" : "unread"}">
          ${n.isRead ? "Read" : "Unread"}
        </span>
      </td>
      <td>
        <div class="notification-actions">
          <button class="btn-secondary btn-sm" onclick="markOneRead('${n._id}')">
            Mark read
          </button>
          <button class="btn-danger-soft btn-sm" onclick="deleteNotification('${n._id}')">
            Delete
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function safeTypeClass(type) {
  return String(type || "other").replace(/[^a-z0-9_-]/gi, "_");
}

function safeText(value) {
  const text = String(value ?? "");

  return window.escapeHtml ? window.escapeHtml(text) : text;
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

    if (badge.classList.contains("notif-badge")) {
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }

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
  if (window.appLogout) {
    window.appLogout();
    return;
  }

  localStorage.clear();
  window.location.href = "login.html";
}




