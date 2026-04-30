const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");

const mongoose = require("mongoose");

const Maintenance = require("../models/Maintenance");
const LedgerEntry = require("../models/LedgerEntry");
const Lease = require("../models/Lease");
const Settings = require("../models/Financial-Settings");

/* ======================================================
   CREATE DAMAGE (LEDGER + MAINTENANCE RECORD)
====================================================== */
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
      type,
      liability,
      currency: requestCurrency
    } = req.body;

    /* ===============================
       BASIC VALIDATION
    =============================== */

    if (!tenantId || !title || !cost) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        message: "Missing required fields"
      });
    }

    if (!mongoose.isValidObjectId(tenantId)) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        message: "Invalid tenant id"
      });
    }

    const costNumber = Number(cost);

    if (isNaN(costNumber) || costNumber <= 0) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        message: "Invalid damage amount"
      });
    }

    /* ===============================
       FIND ACTIVE LEASE
    =============================== */

    const lease = await Lease.findOne({
      ownerId,
      tenantId,
      status: "Active"
    }).session(session);

    if (!lease) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "Active lease not found"
      });
    }

    /* ===============================
       SETTINGS
    =============================== */

    const settings = await Settings.findOne({ ownerId }).lean();

    let damageCurrency =
      (requestCurrency && requestCurrency.toUpperCase()) ||
      lease.currency ||
      settings?.preferences?.currency ||
      "ZAR";

    const allowedCurrencies = [
      "ZAR","USD","EUR","GBP","AED","AUD","CAD","NZD"
    ];

    if (!allowedCurrencies.includes(damageCurrency)) {
      damageCurrency = lease.currency || "ZAR";
    }

    /* ===============================
       SAFE ROUNDING
    =============================== */

    const safeAmount =
      Math.round(costNumber * 100) / 100;

    const today = new Date();

    const periodMonth = today.getMonth();
    const periodYear = today.getFullYear();

    const liabilityType =
      (liability || "TENANT").toUpperCase();

    /* ===============================
       CREATE MAINTENANCE RECORD
    =============================== */

    const record = await Maintenance.create([{

      tenantId,
      ownerId,
      leaseId: lease._id,
      propertyId: lease.propertyId,
      unitId: lease.unitId,

      title,
      description,

      cost: safeAmount,

      type: type || "damage",

      liability: liabilityType

    }], { session });

    /* ===============================
       POST TO LEDGER (TENANT LIABLE)
    =============================== */

    let ledgerEntry = null;

    if (liabilityType === "TENANT") {

      ledgerEntry = await LedgerEntry.create([{

        ownerId,
        tenantId,
        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,

        currency: damageCurrency,

        date: today,
        periodMonth,
        periodYear,

        type: "damage",

        description: `Damage charge: ${title}`,

        debit: safeAmount,
        credit: 0,

        source: "maintenance",

        reference: record[0]._id.toString(),
        referenceType: "maintenance"

      }], { session });

    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      maintenance: record[0],
      ledgerEntry: ledgerEntry ? ledgerEntry[0] : null
    });

  } catch (err) {

    await session.abortTransaction();
    session.endSession();

    console.error("DAMAGE SAVE ERROR:", err);

    res.status(500).json({
      message: "Server error",
      error: err.message
    });

  }

});

/* ======================================================
   REVERSE DAMAGE (ACCOUNTING SAFE)
====================================================== */
router.post("/reverse", auth, async (req, res) => {

  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const { damageEntryId, reason } = req.body;
    const ownerId = req.user.id;

    if (!damageEntryId) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        message: "Damage entry ID required"
      });
    }

    if (!mongoose.isValidObjectId(damageEntryId)) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        message: "Invalid damage entry ID"
      });
    }

    /* ===============================
       FIND ORIGINAL DAMAGE ENTRY
    =============================== */

    const original = await LedgerEntry.findOne({
      _id: damageEntryId,
      ownerId,
      type: "damage"
    }).session(session);

    if (!original) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "Damage entry not found"
      });
    }

    if (!original.debit || original.debit <= 0) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        message: "Invalid damage entry amount"
      });
    }

    /* ===============================
       PREVENT DOUBLE REVERSAL
    =============================== */

    const alreadyReversed = await LedgerEntry.findOne({
      ownerId,
      reference: original._id.toString(),
      type: "damage_reversal"
    }).session(session);

    if (alreadyReversed) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        message: "Damage already reversed"
      });
    }

    /* ===============================
       CREATE REVERSAL ENTRY
    =============================== */

    const today = new Date();

    const reversal = await LedgerEntry.create([{

      ownerId,

      tenantId: original.tenantId,
      leaseId: original.leaseId,
      propertyId: original.propertyId,
      unitId: original.unitId,

      currency: original.currency,

      date: today,

      /* preserve accounting period */
      periodMonth: original.periodMonth,
      periodYear: original.periodYear,

      type: "damage_reversal",

      description: reason
        ? `Damage reversal: ${reason}`
        : `Reversal of damage ${original._id}`,

      debit: 0,
      credit: original.debit,

      reference: original._id.toString(),
      referenceType: "damage",

      source: "maintenance_reversal"

    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      reversal: reversal[0]
    });

  } catch (err) {

    await session.abortTransaction();
    session.endSession();

    console.error("DAMAGE REVERSAL ERROR:", err);

    res.status(500).json({
      message: "Failed to reverse damage",
      error: err.message
    });

  }

});
module.exports = router;