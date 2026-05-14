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
let sentAnnouncements = [];

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
  const announcementForm = document.getElementById("announcementForm");
  const announcementAudience = document.getElementById("announcementAudience");
  const selectAllPropertiesBtn = document.getElementById("selectAllAnnouncementProperties");
  const clearPropertiesBtn = document.getElementById("clearAnnouncementProperties");

  // Filters
  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (typeFilter) typeFilter.addEventListener("change", applyFilters);
  if (unreadFilter) unreadFilter.addEventListener("change", loadNotificationsFromServer);
  if (announcementForm) announcementForm.addEventListener("submit", sendAnnouncement);
  if (announcementAudience) announcementAudience.addEventListener("change", syncAnnouncementAudience);

  if (markAllReadBtn) {
    markAllReadBtn.addEventListener("click", markAllRead);
  }

  if (selectAllPropertiesBtn) {
    selectAllPropertiesBtn.addEventListener("click", () => {
      setAnnouncementPropertySelection(true);
    });
  }

  if (clearPropertiesBtn) {
    clearPropertiesBtn.addEventListener("click", () => {
      setAnnouncementPropertySelection(false);
    });
  }

  // Load data
  syncAnnouncementAudience();
  loadAnnouncementProperties();
  loadAnnouncements();
  loadNotificationsFromServer();
  refreshNotifBadge();
}

async function loadAnnouncementProperties() {
  const propertyList = document.getElementById("announcementPropertyList");
  if (!propertyList) return;

  try {
    const res = await fetch(`${API_URL}/properties?limit=100`, {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to load properties");
    }

    const properties = data.properties || [];

    if (!properties.length) {
      propertyList.innerHTML = `
        <div class="property-checkbox-empty">
          Add properties first, then come back to select them here.
        </div>
      `;
      updateAnnouncementPropertyCount();
      return;
    }

    propertyList.innerHTML = properties
      .map(property => `
        <label class="property-checkbox-option">
          <input
            type="checkbox"
            class="announcement-property-checkbox"
            value="${safeText(property._id)}"
          >
          <span>${safeText(property.name || "Property")}</span>
        </label>
      `)
      .join("");

    propertyList
      .querySelectorAll(".announcement-property-checkbox")
      .forEach(input => {
        input.addEventListener("change", updateAnnouncementPropertyCount);
      });

    updateAnnouncementPropertyCount();

  } catch (err) {
    console.error("Load announcement properties error:", err);
    propertyList.innerHTML = `
      <div class="property-checkbox-empty">
        Could not load properties.
      </div>
    `;
    updateAnnouncementPropertyCount();
  }
}

function syncAnnouncementAudience() {
  const audience = document.getElementById("announcementAudience")?.value || "all";
  const propertyWrap = document.getElementById("announcementPropertyWrap");

  if (propertyWrap) {
    propertyWrap.style.display = audience === "properties" ? "grid" : "none";
  }
}

function getAnnouncementPropertyCheckboxes() {
  return Array.from(document.querySelectorAll(".announcement-property-checkbox"));
}

function getSelectedAnnouncementPropertyIds() {
  return getAnnouncementPropertyCheckboxes()
    .filter(input => input.checked)
    .map(input => input.value)
    .filter(Boolean);
}

function setAnnouncementPropertySelection(isSelected) {
  getAnnouncementPropertyCheckboxes().forEach(input => {
    input.checked = isSelected;
  });
  updateAnnouncementPropertyCount();
}

function updateAnnouncementPropertyCount() {
  const countElement = document.getElementById("announcementPropertyCount");
  const selectedCount = getSelectedAnnouncementPropertyIds().length;

  if (countElement) {
    countElement.textContent =
      `${selectedCount} ${selectedCount === 1 ? "property" : "properties"} selected`;
  }
}

async function sendAnnouncement(e) {
  e.preventDefault();

  const audience = document.getElementById("announcementAudience")?.value || "all";
  const propertyIds = getSelectedAnnouncementPropertyIds();
  const channel = document.getElementById("announcementChannel")?.value || "both";
  const title = document.getElementById("announcementTitle")?.value.trim() || "";
  const message = document.getElementById("announcementMessage")?.value.trim() || "";

  if (!title || !message) {
    notify("Add a title and message before sending", "warning");
    return;
  }

  if (audience === "properties" && !propertyIds.length) {
    notify("Select at least one property for this announcement", "warning");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/notifications/announcements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify({
        audience,
        propertyIds,
        title,
        message,
        channel
      })
    });

    const data = await res.json();
    if (!res.ok) {
      notify(data.message || "Failed to send announcement", "error");
      return;
    }

    notify(
      `Announcement sent to ${data.recipientCount || 0} tenant${data.recipientCount === 1 ? "" : "s"}`,
      data.whatsappFailed ? "warning" : "success"
    );

    e.target.reset();
    syncAnnouncementAudience();
    updateAnnouncementPropertyCount();
    await Promise.all([
      loadAnnouncements(),
      loadNotificationsFromServer()
    ]);

  } catch (err) {
    console.error("Send announcement error:", err);
    notify("Server error", "error");
  }
}

async function loadAnnouncements() {
  try {
    const res = await fetch(`${API_URL}/notifications/announcements`, {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to load announcements");
    }

    sentAnnouncements = data.announcements || [];
    renderAnnouncements();

  } catch (err) {
    console.error("Load announcements error:", err);
    renderAnnouncements([]);
  }
}

function renderAnnouncements(list = sentAnnouncements) {
  const container = document.getElementById("announcementList");
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="notification-empty">
        <strong>No announcements sent yet.</strong>
        <span>Send your first notice above.</span>
      </div>`;
    return;
  }

  container.innerHTML = list.map(announcement => {
    const createdAt = announcement.createdAt
      ? new Date(announcement.createdAt).toLocaleString()
      : "-";
    const failedText = announcement.whatsappFailed
      ? `<span class="announcement-warning">${announcement.whatsappFailed} WhatsApp failed</span>`
      : "";

    return `
      <article class="announcement-item">
        <div>
          <div class="notification-title">${safeText(announcement.title)}</div>
          <div class="notification-message">${safeText(announcement.message)}</div>
          <div class="announcement-meta">
            <span>${safeText(announcement.audienceLabel)}</span>
            <span>${safeText(createdAt)}</span>
            ${failedText}
          </div>
        </div>
        <div class="announcement-count">
          <strong>${Number(announcement.recipientCount || 0)}</strong>
          <span>Recipients</span>
        </div>
      </article>
    `;
  }).join("");
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
    if (n.propertyId?.name) relatedBits.push(n.propertyId.name);
    else if (n.propertyId) relatedBits.push("Property");
    if (n.unitId?.unitLabel) relatedBits.push(`Unit ${n.unitId.unitLabel}`);
    else if (n.unitId) relatedBits.push("Unit");
    if (n.tenantId?.fullName) relatedBits.push(n.tenantId.fullName);
    else if (n.tenantId) relatedBits.push("Tenant");
    if (n.leaseId?.referenceCode) relatedBits.push(n.leaseId.referenceCode);
    else if (n.leaseId) relatedBits.push("Lease");
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

  if (window.escapeHtml) {
    return window.escapeHtml(text);
  }

  return text.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
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




