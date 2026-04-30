const express = require("express");
const auth = require("../middleware/authMiddleware");
const mongoose = require("mongoose");

const Notification = require("../models/Notification");

const router = express.Router();

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