const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");

const Property = require("../models/Property");
const Unit = require("../models/Unit");
const Tenant = require("../models/Tenant");
const Lease = require("../models/Lease");
const LedgerEntry = require("../models/LedgerEntry");
const Settings = require("../models/Financial-Settings");
const router = express.Router();
const { convert } = require("../services/currencyService");
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/* =========================================================
   HELPER: GET MONTH RANGE
========================================================= */
function getMonthRange(year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/* =========================================================
   DASHBOARD SUMMARY
========================================================= */
router.get("/summary", auth, async (req, res) => {
  try {

    /* -------------------------------
       SAFETY
    -------------------------------- */
    if (!req.user?.id) {
      return res.status(401).json({ success: false });
    }

  const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const propertyId =
      req.query.propertyId && mongoose.Types.ObjectId.isValid(req.query.propertyId)
        ? new mongoose.Types.ObjectId(req.query.propertyId)
        : null;
    /* -------------------------------
       DATE HANDLING
    -------------------------------- */
    const now = new Date();

    const month =
  req.query.month !== undefined
    ? Number(req.query.month)
    : now.getMonth() + 1;

    const year =
      req.query.year !== undefined
        ? Number(req.query.year)
        : now.getFullYear();

    /* -------------------------------
       LOAD SETTINGS
    -------------------------------- */
    const settings = await Settings.findOne({ ownerId });

   const baseCurrency =
  settings?.currency ||
  settings?.financial?.currency ||
  settings?.preferences?.currency ||
  "ZAR";

    /* -------------------------------
       BASIC COUNTS
    -------------------------------- */

    const [
      totalProperties,
      totalUnits,
      totalTenants,
      occupiedUnits
    ] = await Promise.all([
      Property.countDocuments({ ownerId }),
      Unit.countDocuments({ ownerId }),
      Tenant.countDocuments({ ownerId }),
      Lease.countDocuments({ ownerId, status: "Active" })
    ]);

    const vacantUnits = Math.max(0, totalUnits - occupiedUnits);

    /* -------------------------------
       MONTH RENT PERFORMANCE
    -------------------------------- */

    const monthLedgerQuery = {
      ownerId,
      periodMonth: month,
      periodYear: year,
      type: { $in: ["rent", "payment"] }
    };

    if (propertyId) {
      monthLedgerQuery.propertyId = propertyId;
    }

    const monthLedger = await LedgerEntry.find(monthLedgerQuery);

    let expectedThisMonth = 0;
    let collectedThisMonth = 0;

    for (const entry of monthLedger) {

      const entryCurrency = entry.currency || "ZAR";

      if (entry.type === "rent") {

        let converted = 0;

try {
  converted = await convert(
    entry.debit || 0,
    entryCurrency,
    baseCurrency
  );
} catch {
  converted = entry.debit || 0;
}

        expectedThisMonth += converted;
      }

      if (entry.type === "payment") {

        const converted = await convert(
          entry.credit || 0,
          entryCurrency,
          baseCurrency
        );

        collectedThisMonth += converted;
      }
    }

    const outstandingThisMonth = Math.max(
      0,
      expectedThisMonth - collectedThisMonth
    );

    /* -------------------------------
       VAT COLLECTED
    -------------------------------- */

    const vatAgg = await LedgerEntry.aggregate([
      {
        $match: {
          ownerId,
          periodMonth: month,
          periodYear: year
        }
      },
      {
        $group: {
          _id: null,
          totalVat: {
            $sum: { $ifNull: ["$vatAmount", 0] }
          }
        }
      }
    ]);

    const vatCollectedThisMonth =
  Number(vatAgg?.[0]?.totalVat || 0);

    /* -------------------------------
       ARREARS
    -------------------------------- */

    const arrearsAgg = await LedgerEntry.aggregate([
      {
        $match: {
          ownerId,
          tenantId: { $ne: null },
          type: {
            $in: [
              "rent",
              "utility",
              "damage",
              "payment",
              "damage_reversal",
              "late_fee"
            ]
          }
        }
      },
      {
        $group: {
          _id: "$tenantId",
          balance: {
            $sum: {
              $subtract: [
                { $ifNull: ["$debit", 0] },
                { $ifNull: ["$credit", 0] }
              ]
            }
          }
        }
      },
      {
        $match: { balance: { $gt: 0 } }
      }
    ]);

    const lateTenantsCount = arrearsAgg.length;

    let totalOutstanding = 0;

    for (const tenant of arrearsAgg) {

      const converted = await convert(
        tenant.balance,
        "ZAR",
        baseCurrency
      );

      totalOutstanding += converted;
    }

    /* -------------------------------
       RESPONSE
    -------------------------------- */

    res.json({
  success: true,
  currency: baseCurrency,
  locale: settings?.preferences?.locale || "en-ZA",

  period: {
    month: monthNames[month - 1],
    year
  },

  totals: {
    totalProperties,
    totalUnits,
    occupiedUnits,
    vacantUnits,
    totalTenants
  },

  rent: {
    expectedThisMonth: Number(expectedThisMonth.toFixed(2)),
    collectedThisMonth: Number(collectedThisMonth.toFixed(2)),
    outstandingThisMonth: Number(outstandingThisMonth.toFixed(2))
  },

  vat: {
    collectedThisMonth: Number(
      (vatCollectedThisMonth || 0).toFixed(2)
    )
  },

  arrears: {
    lateTenantsCount,
    totalOutstanding: Number(totalOutstanding.toFixed(2))
  }

});

  } catch (err) {

    console.error("DASHBOARD SUMMARY ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }
});

/* =========================================================
   INCOME TREND (LAST 6 MONTHS)
========================================================= */
router.get("/income-trend", auth, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false });
    }

const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const now = new Date();
    const trend = [];

    for (let i = 5; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

      const entries = await LedgerEntry.find({
        ownerId,
        date: { $gte: from, $lte: to },
        type: { $in: ["rent", "payment"] }
      });

      const expected = entries
        .filter(e => e.type === "rent")
        .reduce((s, e) => s + (e.debit || 0), 0);

      const collected = entries
        .filter(e => e.type === "payment")
        .reduce((s, e) => s + (e.credit || 0), 0);

      trend.push({
        label: `${monthNames[from.getMonth()]} ${from.getFullYear()}`,
        expected,
        collected
      });
    }

    res.json({ success: true, trend });

  } catch (err) {
    console.error("INCOME TREND ERROR:", err);
    res.status(500).json({ success: false });
  }
});
router.get("/arrears", auth, async (req, res) => {
  try {

const ownerId = new mongoose.Types.ObjectId(req.user.id);

    const balances = await LedgerEntry.aggregate([
      {
        $match: {
          ownerId,
          tenantId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$tenantId",
          balance: {
            $sum: {
              $subtract: [
                { $ifNull: ["$debit", 0] },
                { $ifNull: ["$credit", 0] }
              ]
            }
          }
        }
      },
      {
        $match: { balance: { $gt: 0.01 } } // small tolerance
      },
      {
        $lookup: {
          from: "tenants",
          localField: "_id",
          foreignField: "_id",
          as: "tenant"
        }
      },
      { $unwind: "$tenant" }
    ]);

    const totalOutstanding = balances.reduce(
      (sum, t) => sum + t.balance,
      0
    );

    res.json({
      count: balances.length,
      totalOutstanding,
      arrears: balances.map(b => ({
        tenantId: b._id,
        tenantName: b.tenant.fullName,
        outstanding: Number(b.balance.toFixed(2))
      }))
    });

  } catch (err) {
    console.error("ARREARS REPORT ERROR:", err);
    res.status(500).json({ message: "Failed to load arrears" });
  }
});
router.get("/overdue-summary", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;

    // Load financial settings
    const settings = await Settings.findOne({ ownerId });

    if (!settings) {
      return res.json({
        officiallyOverdue: 0,
        enteringArrearsSoon: 0,
        lateFeesThisMonth: 0,
        totalOverdueAmount: 0
      });
    }

    const {
      defaultRentDueDay = 1,
      gracePeriodDays = 0
    } = settings.financial || {};

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    // Load active leases
    const leases = await Lease.find({
      ownerId,
      status: "Active"
    }).select("_id");

    if (!leases.length) {
      return res.json({
        officiallyOverdue: 0,
        enteringArrearsSoon: 0,
        lateFeesThisMonth: 0,
        totalOverdueAmount: 0
      });
    }

    const leaseIds = leases.map(l => l._id);

    // Batch fetch ALL current month ledger entries
    const monthEntries = await LedgerEntry.find({
      ownerId,
      leaseId: { $in: leaseIds },
      periodMonth: month,
      periodYear: year
    }).select("leaseId debit credit");

    // Calculate balances per lease
    const balancesByLease = {};

    for (const entry of monthEntries) {
      const key = entry.leaseId.toString();
      if (!balancesByLease[key]) balancesByLease[key] = 0;

      balancesByLease[key] +=
        (entry.debit || 0) - (entry.credit || 0);
    }

    let officiallyOverdue = 0;
    let enteringArrearsSoon = 0;
    let totalOverdueAmount = 0;

    // Safe due day calculation (prevents 31-Feb bug)
    const maxDay = new Date(year, month, 0).getDate();
    const safeDueDay = Math.min(defaultRentDueDay, maxDay);

    const dueDate = new Date(year, month - 1, safeDueDay);
    const finalDueDate = new Date(dueDate);
    finalDueDate.setDate(finalDueDate.getDate() + gracePeriodDays);

    for (const lease of leases) {
      const balance =
        balancesByLease[lease._id.toString()] || 0;

      if (balance <= 0) continue;

      const timeDiff =
        finalDueDate.getTime() - today.getTime();

      const daysDiff =
        timeDiff / (1000 * 60 * 60 * 24);

      if (today > finalDueDate) {
        officiallyOverdue++;
        totalOverdueAmount += balance;
      } else if (daysDiff <= 2 && daysDiff >= 0) {
        enteringArrearsSoon++;
      }
    }

    // Late fee revenue this month
    const lateFees = await LedgerEntry.aggregate([
      {
        $match: {
          ownerId,
          type: "late_fee",
          periodMonth: month,
          periodYear: year
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$debit" }
        }
      }
    ]);

    res.json({
      officiallyOverdue,
      enteringArrearsSoon,
      lateFeesThisMonth: lateFees[0]?.total || 0,
      totalOverdueAmount: Number(totalOverdueAmount.toFixed(2))
    });

  } catch (err) {
    console.error("OVERDUE SUMMARY ERROR:", err);
    res.status(500).json({ message: "Failed to load summary" });
  }
});  

router.get("/dashboard/rent-status", auth, async (req, res) => {
  try {

    const leases = await Lease.find({ owner: req.user.id });

    let paid = 0;
    let partial = 0;
    let unpaid = 0;

    for (const lease of leases) {

      const rent = lease.rentAmount;

      const payments = await Payment.find({
        lease: lease._id,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      });

      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

      if (totalPaid >= rent) paid++;
      else if (totalPaid > 0) partial++;
      else unpaid++;

    }

    res.json({
      paid,
      partial,
      unpaid,
      total: leases.length
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
module.exports = router;
