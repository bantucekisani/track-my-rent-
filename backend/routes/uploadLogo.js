const express = require("express");
const auth = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const BusinessSettings = require("../models/BusinessSettings");

const router = express.Router();

/* ===============================
   MULTER STORAGE
================================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/logos";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `logo_${req.user.id}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage });

/* ===============================
   UPLOAD LOGO (SAFE UPDATE)
================================ */
router.post("/upload-logo", auth, upload.single("logo"), async (req, res) => {
  try {
    const logoUrl = `/uploads/logos/${req.file.filename}`;

    const settings = await BusinessSettings.findOneAndUpdate(
      { ownerId: req.user.id },
      { $set: { logoUrl } }, // 🔥 FIXED
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      logoUrl: settings.logoUrl
    });
  } catch (err) {
    console.error("Logo upload error:", err);
    res.status(500).json({ message: "Logo upload failed" });
  }
});

module.exports = router;
