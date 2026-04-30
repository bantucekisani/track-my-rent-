const express = require("express");
const auth = require("../middleware/authMiddleware");
const BusinessSettings = require("../models/BusinessSettings");

const router = express.Router();

/* ===============================
   GET BUSINESS SETTINGS
================================ */
router.get("/", auth, async (req, res) => {
  try {
    const settings = await BusinessSettings.findOne({
      ownerId: req.user.id
    });

    res.json({ success: true, settings });
  } catch (err) {
    console.error("Get business settings error:", err);
    res.status(500).json({ message: "Failed to load business settings" });
  }
});

/* ===============================
   CREATE / UPDATE BUSINESS INFO
   (SAFE – DOES NOT TOUCH LOGO)
================================ */
/* ===============================
   CREATE / UPDATE BUSINESS INFO
   (INCLUDING BANK DETAILS)
================================ */
router.post("/", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;

    const payload = {
      
      ownerId,
      businessName: req.body.businessName,
      tradingName: req.body.tradingName,
      email: req.body.email,
      phone: req.body.phone,
      addressLine1: req.body.addressLine1,
      city: req.body.city,
      province: req.body.province,
      registrationNumber: req.body.registrationNumber,
      vatNumber: req.body.vatNumber,

      currency: req.body.currency || "ZAR",
      locale: req.body.locale || "en-ZA",
      // ✅ THIS WAS MISSING
      bank: {
        bankName: req.body.bank?.bankName || "",
        accountName: req.body.bank?.accountName || "",
        accountNumber: req.body.bank?.accountNumber || "",
        branchCode: req.body.bank?.branchCode || "",
        accountType: req.body.bank?.accountType || ""
      }
    };

    const settings = await BusinessSettings.findOneAndUpdate(
      { ownerId },
      { $set: payload },
      { upsert: true, new: true }
    );

    res.json({ success: true, settings });
  } catch (err) {
    console.error("Save business settings error:", err);
    res.status(500).json({ message: "Failed to save business settings" });
  }
});


module.exports = router;
