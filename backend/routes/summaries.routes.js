const express = require("express");
const router = express.Router();
const LedgerEntry = require("../models/LedgerEntry");
const auth = require("../middleware/authMiddleware");

router.get("/cashflow", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { year, currency } = req.query;

    const match = { ownerId };

    if (year) {
      match.periodYear = Number(year);
    }

    if (currency) {
      match.currency = currency.toUpperCase();
    }

    const results = await LedgerEntry.aggregate([
      { $match: match },

      {
        $group: {
          _id: {
            year: "$periodYear",
            month: "$periodMonth"
          },

          rentBilled: {
            $sum: {
              $cond: [{ $eq: ["$type", "rent"] }, "$debit", 0]
            }
          },

          rentCollected: {
            $sum: {
              $cond: [{ $eq: ["$type", "payment"] }, "$credit", 0]
            }
          },

          expenses: {
            $sum: {
              $cond: [{ $eq: ["$type", "expense"] }, "$debit", 0]
            }
          }
        }
      },

      {
        $addFields: {
          netCash: {
            $subtract: ["$rentCollected", "$expenses"]
          }
        }
      },

      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1
        }
      }
    ]);

    const formatted = results.map(r => ({
      period: `${r._id.year}-${String(r._id.month + 1).padStart(2, "0")}`,
      rentBilled: r.rentBilled || 0,
      rentCollected: r.rentCollected || 0,
      expenses: r.expenses || 0,
      netCash: r.netCash || 0
    }));

    res.json({
      success: true,
      currency: currency || "ALL",
      data: formatted
    });

  } catch (err) {
    console.error("Cashflow summary error:", err);
    res.status(500).json({ message: "Failed to load cashflow summary" });
  }
});

module.exports = router;