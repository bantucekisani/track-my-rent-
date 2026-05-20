const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");

const UtilityBill = require("../models/UtilityBill");
const LedgerEntry = require("../models/LedgerEntry");
const Lease = require("../models/Lease");
const Settings = require("../models/Financial-Settings");
const ensureInvoiceForLedger = require("../services/ensureInvoiceForLedger");

const router = express.Router();
const ALLOWED_UTILITY_TYPES = new Set([
  "water",
  "electricity",
  "refuse",
  "sewer",
  "wifi",
  "other"
]);

function normalizeUtilityType(value) {
  const type = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const aliases = {
    electric: "electricity",
    power: "electricity",
    trash: "refuse",
    waste: "refuse",
    wi_fi: "wifi",
    internet: "wifi"
  };

  return aliases[type] || type;
}

function formatPeriod(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/* =====================================================
   POST UTILITY BILL
   POST /api/utilities
===================================================== */
router.post("/", auth, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const ownerId = req.user.id;

    const {
      tenantId,
      amount,
      subtype,
      description,
      currency: requestCurrency,
      periodMonth,
      periodYear
    } = req.body;

    if (!tenantId || !amount || !subtype) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Tenant, amount and subtype required"
      });
    }

    const amountNumber = Number(amount);

    if (isNaN(amountNumber) || amountNumber <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Invalid amount"
      });
    }

    const utilityType = normalizeUtilityType(subtype);

    if (!ALLOWED_UTILITY_TYPES.has(utilityType)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Invalid utility type"
      });
    }

    const lease = await Lease.findOne({
      tenantId,
      ownerId,
      status: "Active"
    }).session(session);

    if (!lease) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "No active lease"
      });
    }

    const settings = await Settings.findOne({ ownerId }).lean();

    let entryCurrency =
      (requestCurrency && requestCurrency.toUpperCase()) ||
      lease.currency ||
      settings?.preferences?.currency ||
      "ZAR";

    if (!/^[A-Z]{3}$/.test(entryCurrency)) {
      entryCurrency = "ZAR";
    }

    const safeAmount =
      Math.round(amountNumber * 100) / 100;

    const today = new Date();

    const finalMonth =
      periodMonth !== undefined
        ? Number(periodMonth)
        : today.getMonth() + 1;

    const finalYear =
      periodYear !== undefined
        ? Number(periodYear)
        : today.getFullYear();

    if (
      !Number.isInteger(finalMonth) ||
      finalMonth < 1 ||
      finalMonth > 12 ||
      !Number.isInteger(finalYear) ||
      finalYear < 2000 ||
      finalYear > 2100
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Invalid billing period"
      });
    }

    /* ===============================
       1️⃣ SAVE UTILITY BILL RECORD
    =============================== */
    const bill = await UtilityBill.create([{
      ownerId,
      tenantId,
      leaseId: lease._id,
      propertyId: lease.propertyId,
      unitId: lease.unitId,
      utilityType,
      description,
      amount: safeAmount,
      currency: entryCurrency,
      period: formatPeriod(finalYear, finalMonth),
      periodMonth: finalMonth,
      periodYear: finalYear,
      status: "Posted"
    }], { session });

    /* ===============================
       2️⃣ POST TO LEDGER
    =============================== */
    const entry = await LedgerEntry.create([{
      ownerId,
      tenantId,
      leaseId: lease._id,
      propertyId: lease.propertyId,
      unitId: lease.unitId,

      currency: entryCurrency,

      date: today,
      periodMonth: finalMonth,
      periodYear: finalYear,

      type: "utility",
      subtype: utilityType,
      description: description || `Utility: ${utilityType}`,

      debit: safeAmount,
      credit: 0,

      source: "utility",
      reference: bill[0]._id.toString()
    }], { session });

    await session.commitTransaction();
    session.endSession();

    let invoice = null;
    try {
      invoice = await ensureInvoiceForLedger(entry[0]);
    } catch (invoiceErr) {
      console.error("UTILITY INVOICE ENSURE ERROR:", invoiceErr);
    }

    res.status(201).json({
      success: true,
      bill: bill[0],
      ledgerEntry: entry[0],
      invoice
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("UTILITY ERROR:", err);
    res.status(500).json({
      message: "Failed to post utility"
    });
  }
});

/* =====================================================
   REVERSE UTILITY
===================================================== */
router.post("/:id/reverse", auth, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const ownerId = req.user.id;

    const original = await LedgerEntry.findOne({
      _id: req.params.id,
      ownerId,
      type: "utility"
    }).session(session);

    if (!original) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "Utility entry not found"
      });
    }

    const reversal = await LedgerEntry.create([{
      ownerId,
      tenantId: original.tenantId,
      leaseId: original.leaseId,
      propertyId: original.propertyId,
      unitId: original.unitId,
      currency: original.currency,

      date: new Date(),
      periodMonth: original.periodMonth,
      periodYear: original.periodYear,

      type: "utility_reversal",
      description: `Utility reversal for ${original._id}`,

      debit: 0,
      credit: original.debit,

      source: "utility_reverse",
      reference: original._id.toString()
    }], { session });

    await session.commitTransaction();
    session.endSession();

    try {
      await ensureInvoiceForLedger(reversal[0]);
    } catch (invoiceErr) {
      console.error("UTILITY REVERSAL INVOICE ENSURE ERROR:", invoiceErr);
    }

    res.json({
      success: true,
      reversal: reversal[0]
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("UTILITY REVERSAL ERROR:", err);
    res.status(500).json({
      message: "Failed to reverse utility"
    });
  }
});

module.exports = router;
