const express = require("express");
const auth = require("../middleware/authMiddleware");
const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const Property = require("../models/Property");
const Tenant = require("../models/Tenant");
const { createTenantNotification } = require("../services/notificationService");

const router = express.Router();

function normalizeAnnouncementChannel(value) {
  const channel = String(value || "both").trim().toLowerCase();
  return ["app", "whatsapp", "both"].includes(channel) ? channel : "both";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function notificationObjectId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  if (value.toString) return value.toString();
  return "";
}

function describeAnnouncementAudience(notification) {
  const audience = notification?.metadata?.audience || "all";

  if (audience === "property") {
    return notification?.propertyId?.name || "Selected property";
  }

  if (audience === "properties") {
    return "Selected properties";
  }

  if (audience === "tenant") {
    return notification?.tenantId?.fullName || "Selected tenant";
  }

  return "All active tenants";
}

/* ==========================================
   GET NOTIFICATIONS
   GET /api/notifications?unreadOnly=true&page=1&limit=20
========================================== */
router.get("/", auth, async (req, res) => {

  try {

    const { unreadOnly, page = 1, limit = 20 } = req.query;

    const ownerId = req.user.id;

    const filter = { ownerId };

    if (unreadOnly === "true") {
      filter.isRead = false;
    }

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate("tenantId", "fullName")
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .populate("leaseId", "referenceCode")
      .lean();

    const total = await Notification.countDocuments(filter);

    const unreadCount = await Notification.countDocuments({
      ownerId,
      isRead: false
    });

    res.json({
      success: true,
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
      unreadCount,
      notifications
    });

  } catch (err) {

    console.error("LIST NOTIFICATIONS ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

/* ==========================================
   CREATE ANNOUNCEMENT
   POST /api/notifications/announcements
========================================== */
router.post("/announcements", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const {
      audience = "all",
      propertyId,
      propertyIds,
      tenantId,
      title,
      message,
      channel
    } = req.body;

    const announcementTitle = cleanText(title, 120);
    const announcementMessage = cleanText(message, 2000);
    const targetAudience = ["all", "property", "properties", "tenant"].includes(audience)
      ? audience
      : "all";
    const deliveryChannel = normalizeAnnouncementChannel(channel);

    if (!announcementTitle || !announcementMessage) {
      return res.status(400).json({
        success: false,
        message: "Announcement title and message are required"
      });
    }

    const tenantFilter = {
      ownerId,
      status: "active"
    };

    if (targetAudience === "property") {
      if (!mongoose.isValidObjectId(propertyId)) {
        return res.status(400).json({
          success: false,
          message: "Please select a valid property"
        });
      }

      const property = await Property.findOne({
        _id: propertyId,
        ownerId
      }).lean();

      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found"
        });
      }

      tenantFilter.propertyId = propertyId;
    }

    if (targetAudience === "properties") {
      const selectedPropertyIds = Array.from(new Set(
        Array.isArray(propertyIds)
          ? propertyIds.filter(id => mongoose.isValidObjectId(id))
          : []
      ));

      if (!selectedPropertyIds.length) {
        return res.status(400).json({
          success: false,
          message: "Please select at least one valid property"
        });
      }

      const ownedCount = await Property.countDocuments({
        _id: { $in: selectedPropertyIds },
        ownerId
      });

      if (ownedCount !== selectedPropertyIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more selected properties could not be found"
        });
      }

      tenantFilter.propertyId = { $in: selectedPropertyIds };
    }

    if (targetAudience === "tenant") {
      if (!mongoose.isValidObjectId(tenantId)) {
        return res.status(400).json({
          success: false,
          message: "Please select a valid tenant"
        });
      }

      tenantFilter._id = tenantId;
    }

    const tenants = await Tenant.find(tenantFilter)
      .select("fullName phone whatsappNumber whatsappOptIn preferredNotificationChannel propertyId unitId")
      .lean();

    if (!tenants.length) {
      return res.status(400).json({
        success: false,
        message: "No active tenants match that audience"
      });
    }

    const announcementId = new mongoose.Types.ObjectId().toString();
    const notifications = [];

    for (const tenant of tenants) {
      const notification = await createTenantNotification({
        ownerId,
        type: "announcement",
        title: announcementTitle,
        message: announcementMessage,
        tenantId: tenant._id,
        propertyId: tenant.propertyId,
        unitId: tenant.unitId,
        channel: deliveryChannel,
        whatsappMessage: `${announcementTitle}\n\n${announcementMessage}`,
        metadata: {
          announcementId,
          audience: targetAudience,
          targetPropertyId: targetAudience === "property" ? propertyId : null,
          targetPropertyIds: targetAudience === "properties" ? tenantFilter.propertyId.$in : [],
          targetTenantId: targetAudience === "tenant" ? tenantId : null
        }
      });

      if (notification) {
        notifications.push(notification);
      }
    }

    const whatsappFailed = notifications.filter(
      notification => notification.deliveryStatus === "failed"
    ).length;

    res.status(201).json({
      success: true,
      announcementId,
      recipientCount: notifications.length,
      whatsappFailed,
      channel: deliveryChannel
    });

  } catch (err) {
    console.error("CREATE ANNOUNCEMENT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send announcement"
    });
  }
});

/* ==========================================
   LIST ANNOUNCEMENT GROUPS
========================================== */
router.get("/announcements", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;

    const notifications = await Notification.find({
      ownerId,
      type: "announcement"
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("tenantId", "fullName")
      .populate("propertyId", "name")
      .lean();

    const grouped = new Map();

    notifications.forEach(notification => {
      const key =
        notificationObjectId(notification.metadata?.announcementId) ||
        String(notification._id);

      if (!grouped.has(key)) {
        grouped.set(key, {
          announcementId: key,
          title: notification.title,
          message: notification.message,
          audience: notification.metadata?.audience || "all",
          audienceLabel: describeAnnouncementAudience(notification),
          createdAt: notification.createdAt,
          channel: notification.channel,
          recipientCount: 0,
          unreadCount: 0,
          whatsappFailed: 0
        });
      }

      const group = grouped.get(key);
      group.recipientCount += 1;
      if (!notification.isRead) group.unreadCount += 1;
      if (notification.deliveryStatus === "failed") group.whatsappFailed += 1;
    });

    res.json({
      success: true,
      announcements: Array.from(grouped.values()).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
    });

  } catch (err) {
    console.error("LIST ANNOUNCEMENTS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load announcements"
    });
  }
});

/* ==========================================
   TENANT ANNOUNCEMENT THREADS
========================================== */
router.get("/tenant/:tenantId/announcements", auth, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const ownerId = req.user.id;

    if (!mongoose.isValidObjectId(tenantId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant id"
      });
    }

    const tenant = await Tenant.findOne({
      _id: tenantId,
      ownerId
    }).lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

    const announcements = await Notification.find({
      ownerId,
      tenantId,
      type: "announcement"
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const announcementIds = announcements
      .map(notification =>
        notificationObjectId(notification.metadata?.announcementId) ||
        String(notification._id)
      )
      .filter(Boolean);

    const replies = announcementIds.length
      ? await Notification.find({
          ownerId,
          tenantId,
          type: "tenant_reply",
          "metadata.announcementId": { $in: announcementIds }
        })
          .sort({ createdAt: 1 })
          .lean()
      : [];

    const repliesByAnnouncement = replies.reduce((acc, reply) => {
      const key = notificationObjectId(reply.metadata?.announcementId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(reply);
      return acc;
    }, {});

    res.json({
      success: true,
      announcements: announcements.map(notification => {
        const announcementId =
          notificationObjectId(notification.metadata?.announcementId) ||
          String(notification._id);

        return {
          ...notification,
          announcementId,
          replies: repliesByAnnouncement[announcementId] || []
        };
      })
    });

  } catch (err) {
    console.error("TENANT ANNOUNCEMENTS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load tenant announcements"
    });
  }
});

/* ==========================================
   RECORD TENANT REPLY
========================================== */
router.post("/announcements/:notificationId/replies", auth, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const ownerId = req.user.id;
    const replyMessage = cleanText(req.body.message, 2000);

    if (!mongoose.isValidObjectId(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid announcement id"
      });
    }

    if (!replyMessage) {
      return res.status(400).json({
        success: false,
        message: "Reply message is required"
      });
    }

    const announcement = await Notification.findOne({
      _id: notificationId,
      ownerId,
      type: "announcement"
    })
      .populate("tenantId", "fullName")
      .lean();

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found"
      });
    }

    const announcementId =
      notificationObjectId(announcement.metadata?.announcementId) ||
      String(announcement._id);
    const tenantName = announcement.tenantId?.fullName || "Tenant";

    const reply = await Notification.create({
      ownerId,
      type: "tenant_reply",
      title: `Reply from ${tenantName}`,
      message: replyMessage,
      channel: "app",
      tenantId: announcement.tenantId?._id || announcement.tenantId,
      propertyId: announcement.propertyId,
      unitId: announcement.unitId,
      isRead: false,
      deliveryStatus: "sent",
      sentAt: new Date(),
      metadata: {
        announcementId,
        announcementNotificationId: announcement._id,
        announcementTitle: announcement.title
      }
    });

    res.status(201).json({
      success: true,
      reply
    });

  } catch (err) {
    console.error("CREATE ANNOUNCEMENT REPLY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to save reply"
    });
  }
});


/* ==========================================
   UNREAD COUNT
========================================== */
router.get("/unread-count", auth, async (req, res) => {

  try {

    const count = await Notification.countDocuments({
      ownerId: req.user.id,
      isRead: false
    });

    res.json({
      success: true,
      count
    });

  } catch (err) {

    console.error("UNREAD COUNT ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});


/* ==========================================
   MARK ALL AS READ
========================================== */
router.patch("/read-all", auth, async (req, res) => {

  try {

    const result = await Notification.updateMany(
      {
        ownerId: req.user.id,
        isRead: false
      },
      {
        $set: { isRead: true }
      }
    );

    res.json({
      success: true,
      modified: result.modifiedCount
    });

  } catch (err) {

    console.error("MARK ALL READ ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});


/* ==========================================
   MARK ONE AS READ
========================================== */
router.patch("/:id/read", auth, async (req, res) => {

  try {

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID"
      });
    }

    const updated = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        ownerId: req.user.id
      },
      {
        $set: { isRead: true }
      },
      {
        new: true
      }
    ).lean();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    res.json({
      success: true,
      notification: updated
    });

  } catch (err) {

    console.error("MARK NOTIFICATION READ ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});


/* ==========================================
   DELETE ONE
========================================== */
router.delete("/:id", auth, async (req, res) => {

  try {

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID"
      });
    }

    const deleted = await Notification.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.user.id
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    res.json({
      success: true
    });

  } catch (err) {

    console.error("DELETE NOTIFICATION ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});


/* ==========================================
   DELETE ALL READ
========================================== */
router.delete("/clear-read/all", auth, async (req, res) => {

  try {

    const result = await Notification.deleteMany({
      ownerId: req.user.id,
      isRead: true
    });

    res.json({
      success: true,
      deleted: result.deletedCount
    });

  } catch (err) {

    console.error("CLEAR READ ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

module.exports = router;
