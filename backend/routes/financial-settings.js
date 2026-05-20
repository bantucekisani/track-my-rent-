const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const Settings = require("../models/Financial-Settings");

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/* =========================================
   GET FINANCIAL SETTINGS
========================================= */
router.get("/", auth, async (req, res) => {
  try {
    let settings = await Settings.findOne({
      ownerId: req.user.id
    });

    if (!settings) {
      settings = await Settings.create({
        ownerId: req.user.id
      });
    }

    res.json({ settings });

  } catch (err) {
    console.error("LOAD FINANCIAL SETTINGS ERROR:", err);
    res.status(500).json({
      message: "Error loading financial settings"
    });
  }
});


/* =========================================
   UPDATE FINANCIAL SETTINGS (Unified)
========================================= */
router.put("/", auth, async (req, res) => {
  try {
    const { financial, preferences } = req.body;

    if (!financial) {
      return res.status(400).json({
        message: "Financial settings data required"
      });
    }

    const {
      defaultLateFeeAmount,
      defaultLateFeePercent,
      gracePeriodDays,
      defaultRentDueDay,
      vatEnabled,
      vatPercent,
      vatMode
    } = financial;

    // ❗ Prevent both flat and percent late fee
    if (
      Number(defaultLateFeeAmount) > 0 &&
      Number(defaultLateFeePercent) > 0
    ) {
      return res.status(400).json({
        message:
          "Cannot use both flat and percentage late fee"
      });
    }

    const updateData = {
      $set: {
        "financial.defaultLateFeeAmount":
          Math.max(parseNumber(defaultLateFeeAmount, 0), 0),
        "financial.defaultLateFeePercent":
          Math.max(parseNumber(defaultLateFeePercent, 0), 0),
        "financial.gracePeriodDays":
          Math.max(parseNumber(gracePeriodDays, 0), 0),
        "financial.defaultRentDueDay":
          clamp(parseNumber(defaultRentDueDay, 1), 1, 31),
        "financial.vatEnabled": Boolean(vatEnabled),
        "financial.vatPercent": clamp(parseNumber(vatPercent, 0), 0, 100),
        "financial.vatMode": vatMode === "inclusive" ? "inclusive" : "exclusive"
      }
    };

    // 🔥 Handle preferences if provided
    if (preferences) {
      updateData.$set.preferences = {
        currency: preferences.currency || "ZAR",
        locale: preferences.locale || "en-ZA",
        timezone:
          preferences.timezone || "Africa/Johannesburg"
      };
    }

    const updated = await Settings.findOneAndUpdate(
      { ownerId: req.user.id },
      updateData,
      {
        new: true,
        upsert: true
      }
    );

    res.json({
      success: true,
      settings: updated
    });

  } catch (err) {
    console.error("SAVE FINANCIAL SETTINGS ERROR:", err);
    res.status(500).json({
      message: "Error saving financial settings"
    });
  }
});

module.exports = router;
