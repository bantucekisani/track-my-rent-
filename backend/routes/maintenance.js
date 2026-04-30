const express = require("express");
const auth = require("../middleware/authMiddleware");

const mongoose = require("mongoose");

const Maintenance = require("../models/Maintenance");
const Lease = require("../models/Lease");
const LedgerEntry = require("../models/LedgerEntry");
const Settings = require("../models/Financial-Settings");

const router = express.Router();

/* =====================================================
   1. REPORT MAINTENANCE / DAMAGE
   POST /api/maintenance
===================================================== */
router.post("/", auth, async (req, res) => {

  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const ownerId = req.user.id;

    const {
      tenantId,
      title,
      description,
      cost,
      liability = "LANDLORD",
      currency: requestCurrency
    } = req.body;

    /* ===============================
       VALIDATION
    =============================== */

    if (!tenantId || !title || !cost) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    if (!mongoose.isValidObjectId(tenantId)) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Invalid tenant ID"
      });
    }

    const costNumber = Number(cost);

    if (isNaN(costNumber) || costNumber <= 0) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Invalid cost amount"
      });
    }

    if (!["TENANT", "LANDLORD"].includes(liability)) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Invalid liability type"
      });
    }

    /* ===============================
       FIND ACTIVE LEASE
    =============================== */

    const lease = await Lease.findOne({
      tenantId,
      ownerId,
      status: "Active"
    }).session(session);

    if (!lease) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "No active lease found"
      });
    }

    /* ===============================
       LOAD SETTINGS
    =============================== */

    const settings = await Settings
      .findOne({ ownerId })
      .lean();

    let entryCurrency =
      (requestCurrency && requestCurrency.toUpperCase()) ||
      lease.currency ||
      settings?.preferences?.currency ||
      "ZAR";

    if (!/^[A-Z]{3}$/.test(entryCurrency)) {
      entryCurrency = "ZAR";
    }

    /* ===============================
       SAFE AMOUNT
    =============================== */

    const safeAmount =
      Math.round(costNumber * 100) / 100;

    const today = new Date();

    const periodMonth = today.getMonth();
    const periodYear = today.getFullYear();

    /* ===============================
       CREATE MAINTENANCE RECORD
    =============================== */

    const maintenance = await Maintenance.create([{

      ownerId,
      tenantId,

      leaseId: lease._id,
      propertyId: lease.propertyId,
      unitId: lease.unitId,

      title,
      description,

      cost: safeAmount,

      liability,
      status: "Logged"

    }], { session });

    /* ===============================
       POST LEDGER ENTRY
    =============================== */

    let ledgerEntry;

    if (liability === "TENANT") {

      ledgerEntry = await LedgerEntry.create([{

        ownerId,
        tenantId,

        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,

        currency: entryCurrency,

        date: today,
        periodMonth,
        periodYear,

        type: "damage",

        description: `Damage charge: ${title}`,

        debit: safeAmount,
        credit: 0,

        source: "maintenance",
        reference: maintenance[0]._id.toString()

      }], { session });

    } else {

      ledgerEntry = await LedgerEntry.create([{

        ownerId,

        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,

        currency: entryCurrency,

        date: today,
        periodMonth,
        periodYear,

        type: "expense",

        description: `Maintenance expense: ${title}`,

        debit: safeAmount,
        credit: 0,

        source: "maintenance",
        reference: maintenance[0]._id.toString()

      }], { session });

    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      maintenance: maintenance[0],
      ledgerEntry: ledgerEntry[0]
    });

  } catch (err) {

    await session.abortTransaction();
    session.endSession();

    console.error("MAINTENANCE CREATE ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });

  }

});

/* =====================================================
   2. LIST ALL MAINTENANCE
===================================================== */
router.get("/", auth, async (req, res) => {

  try {

    const records = await Maintenance.find({
      ownerId: req.user.id
    })
      .populate("tenantId", "fullName")
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      records
    });

  } catch (err) {

    console.error("MAINTENANCE LIST ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

/* =====================================================
   3. UPDATE MAINTENANCE STATUS
===================================================== */
router.put("/:id", auth, async (req, res) => {

  try {

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record ID"
      });
    }

    const record = await Maintenance.findOneAndUpdate(
      {
        _id: req.params.id,
        ownerId: req.user.id
      },
      req.body,
      { new: true }
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found"
      });
    }

    res.json({
      success: true,
      record
    });

  } catch (err) {

    console.error("MAINTENANCE UPDATE ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

module.exports = router;