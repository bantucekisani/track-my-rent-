const Notification = require("../models/Notification");

async function createNotification({
  ownerId,
  type = "other",
  title,
  message,
  tenantId = null,
  leaseId = null,
  propertyId = null,
  unitId = null,
  metadata = {}
}) {
  try {
    if (!ownerId || !title || !message) return;

    await Notification.create({
      ownerId,
      type,
      title: title.trim(),
      message: message.trim(),
      tenantId,
      leaseId,
      propertyId,
      unitId,
      metadata,
      isRead: false
    });
  } catch (err) {
    console.error("NOTIFICATION CREATE ERROR:", err.message);
  }
}

module.exports = { createNotification };
