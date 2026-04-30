const Notification = require("../models/Notification");
const Tenant = require("../models/Tenant");
const sendWhatsApp = require("./whatsappService");

function shouldUseWhatsApp(tenant, forceChannel) {
  if (!tenant) return false;

  const preferredChannel =
    forceChannel || tenant.preferredNotificationChannel || "app";

  const targetNumber = tenant.whatsappNumber || tenant.phone;

  if (!tenant.whatsappOptIn || !targetNumber) {
    return false;
  }

  return preferredChannel === "whatsapp" || preferredChannel === "both";
}

async function createTenantNotification({
  ownerId,
  type = "other",
  title,
  message,
  tenantId = null,
  leaseId = null,
  propertyId = null,
  unitId = null,
  metadata = {},
  whatsappMessage = "",
  channel = null
}) {
  if (!ownerId || !title || !message) {
    return null;
  }

  const tenant = tenantId
    ? await Tenant.findOne({ _id: tenantId, ownerId }).lean()
    : null;

  const useWhatsApp = shouldUseWhatsApp(tenant, channel);

  const notification = await Notification.create({
    ownerId,
    type,
    title: title.trim(),
    message: message.trim(),
    channel: useWhatsApp ? "both" : "app",
    tenantId,
    leaseId,
    propertyId,
    unitId,
    metadata,
    isRead: false,
    deliveryStatus: useWhatsApp ? "pending" : "sent",
    sentAt: useWhatsApp ? null : new Date()
  });

  if (!useWhatsApp) {
    return notification;
  }

  const targetNumber = tenant.whatsappNumber || tenant.phone;
  const whatsappResult = await sendWhatsApp(
    targetNumber,
    whatsappMessage || message
  );

  if (whatsappResult.success) {
    notification.deliveryStatus = "sent";
    notification.providerMessageId = whatsappResult.providerMessageId;
    notification.sentAt = whatsappResult.sentAt || new Date();
    notification.errorMessage = null;
    notification.failedAt = null;
  } else {
    notification.deliveryStatus = "failed";
    notification.failedAt = new Date();
    notification.errorMessage = whatsappResult.error || "WhatsApp send failed";
  }

  await notification.save();

  return notification;
}

module.exports = {
  createTenantNotification
};
