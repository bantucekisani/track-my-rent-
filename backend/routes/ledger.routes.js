const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");

const LedgerEntry = require("../models/LedgerEntry");

const Lease = require("../models/Lease");



const { emitLedgerNotification } = require("../services/ledgerNotifications");

const ensureInvoiceForLedger = require("../services/ensureInvoiceForLedger");
const Settings = require("../models/Financial-Settings");
const mongoose = require("mongoose");
const renderHTMLToPDF = require("../utils/pdf/renderHTMLToPDF");
const generateTabularReportHTML =
  require("../utils/pdf/generateTabularReportHTML");

function formatMoney(locale, currency, value) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(Number(value || 0));
}

function formatPaymentMethod(method, source) {
  const value = String(method || source || "eft").trim().toLowerCase();
  const labels = {
    eft: "EFT",
    cash: "Cash",
    card: "Card",
    debit_order: "Debit Order",
    debitorder: "Debit Order",
    bank_import: "Bank Import",
    "bank import": "Bank Import",
    other: "Other"
  };

  if (labels[value]) {
    return labels[value];
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "EFT";
}

function formatPaymentPeriod(locale, entry) {
  const month = Number(entry.periodMonth);
  const year = Number(entry.periodYear);

  if (month >= 1 && month <= 12 && year) {
    return new Date(year, month - 1, 1).toLocaleDateString(locale, {
      month: "long",
      year: "numeric"
    });
  }

  return "-";
}

function csvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function loadPaymentExportData(ownerId) {
  const settings = await Settings.findOne({ ownerId }).lean();
  const currency = settings?.preferences?.currency || "ZAR";
  const locale = settings?.preferences?.locale || "en-ZA";

  const payments = await LedgerEntry.find({
    ownerId,
    type: "payment"
  })
    .sort({ date: -1, _id: -1 })
    .populate("tenantId", "fullName")
    .populate("leaseId", "referenceCode")
    .populate("propertyId", "name")
    .populate("unitId", "unitLabel")
    .lean();

  const rows = payments.map(payment => ({
    paidOn: payment.date
      ? new Date(payment.date).toLocaleDateString(locale)
      : "-",
    tenant: payment.tenantId?.fullName || "-",
    propertyUnit:
      [payment.propertyId?.name, payment.unitId?.unitLabel]
        .filter(Boolean)
        .join(" / ") || "-",
    amount: Number(payment.credit || 0),
    period: formatPaymentPeriod(locale, payment),
    method: formatPaymentMethod(payment.method, payment.source),
    reference:
      payment.reference ||
      payment.leaseId?.referenceCode ||
      "-"
  }));

  return {
    currency,
    locale,
    rows,
    totalCollected: rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    )
  };
}

/* =========================================================
   RECORD PAYMENT → FIFO SAFE ALLOCATION (GLOBAL SAFE)
========================================================= */
router.post("/payment", auth, async (req, res) => {
  try {
    const {
      tenantId,
      amount,
      paidOn,
      method,
      reference,
      notes,
      periodMonth,
      periodYear
    } = req.body;

    if (!tenantId || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        message: "Tenant and valid amount required"
      });
    }

    const ownerId = req.user.id;
    const paymentAmount = Number(amount);

    /* ===============================
       GET ACTIVE LEASE
    =============================== */
    const lease = await Lease.findOne({
      ownerId,
      tenantId,
      status: "Active"
    });

    if (!lease) {
      return res.status(400).json({
        message: "No active lease"
      });
    }

    /* ===============================
       LOAD SETTINGS (Currency + Rules)
    =============================== */
  const settings = await Settings.findOne({ ownerId }).lean();

    const currency =
      settings?.preferences?.currency || "ZAR";

    const allowPartial =
      settings?.financial?.payment?.allowPartialPayments ?? true;

    /* ===============================
       CALCULATE CURRENT BALANCE
    =============================== */
    const balanceAgg = await LedgerEntry.aggregate([
      {
        $match: { ownerId, tenantId }
      },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: { $ifNull: ["$debit", 0] } },
          totalCredit: { $sum: { $ifNull: ["$credit", 0] } }
        }
      }
    ]);

    const totalDebit = balanceAgg[0]?.totalDebit || 0;
    const totalCredit = balanceAgg[0]?.totalCredit || 0;

const outstanding = Math.max(totalDebit - totalCredit, 0);

    /* ===============================
       VALIDATE PARTIAL PAYMENTS
    =============================== */
    if (!allowPartial && paymentAmount < outstanding) {
      return res.status(400).json({
        message:
          "Partial payments are disabled in financial settings"
      });
    }

    /* ===============================
       PREVENT MASSIVE OVERPAYMENT
    =============================== */
    if (paymentAmount > outstanding + 0.01) {
      console.warn("Overpayment detected");
      // You can allow it or clamp it
      // For now we allow it (credit balance)
    }

    /* ===============================
       CREATE PAYMENT ENTRY
    =============================== */

    const entryDate = paidOn
      ? new Date(paidOn)
      : new Date();

    if (isNaN(entryDate.getTime())) {
      return res.status(400).json({
        message: "Invalid payment date"
      });
    }

    const selectedPeriodMonth =
      periodMonth !== undefined && periodMonth !== null
        ? Number(periodMonth)
        : entryDate.getMonth() + 1;

    const selectedPeriodYear =
      periodYear !== undefined && periodYear !== null
        ? Number(periodYear)
        : entryDate.getFullYear();

    if (
      !Number.isInteger(selectedPeriodMonth) ||
      selectedPeriodMonth < 1 ||
      selectedPeriodMonth > 12
    ) {
      return res.status(400).json({
        message: "Accounting month must be between 1 and 12"
      });
    }

    if (
      !Number.isInteger(selectedPeriodYear) ||
      selectedPeriodYear < 2000 ||
      selectedPeriodYear > 2100
    ) {
      return res.status(400).json({
        message: "Accounting year is invalid"
      });
    }

    const normalizedMethod =
      typeof method === "string" && method.trim()
        ? method.trim().toLowerCase()
        : "eft";

    const entry = await LedgerEntry.create({
      ownerId,
      currency, // ✅ GLOBAL SAFE
      tenantId,
      leaseId: lease._id,
      propertyId: lease.propertyId,
      unitId: lease.unitId,
      date: entryDate,
      periodMonth: selectedPeriodMonth,
      periodYear: selectedPeriodYear,
      type: "payment",
      debit: 0,
      credit: Math.round(paymentAmount * 100) / 100, // ✅ proper rounding
      description: notes || "Payment received",
      reference: reference || "",
      method: normalizedMethod,
      source: "manual"
    });

    await ensureInvoiceForLedger(entry);
    await emitLedgerNotification(entry);

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      currency,
      entry
    });

  } catch (err) {
    console.error("PAYMENT ERROR:", err);
    res.status(500).json({
      message: "Failed to record payment"
    });
  }
});

router.put("/payment/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid payment id"
      });
    }

    const ownerId = req.user.id;
    const {
      paidOn,
      method,
      reference,
      notes,
      periodMonth,
      periodYear
    } = req.body;

    const payment = await LedgerEntry.findOne({
      _id: req.params.id,
      ownerId,
      type: "payment"
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found"
      });
    }

    const entryDate = paidOn
      ? new Date(paidOn)
      : payment.date;

    if (!entryDate || isNaN(entryDate.getTime())) {
      return res.status(400).json({
        message: "Invalid payment date"
      });
    }

    const selectedPeriodMonth =
      periodMonth !== undefined && periodMonth !== null
        ? Number(periodMonth)
        : payment.periodMonth;

    const selectedPeriodYear =
      periodYear !== undefined && periodYear !== null
        ? Number(periodYear)
        : payment.periodYear;

    if (
      !Number.isInteger(selectedPeriodMonth) ||
      selectedPeriodMonth < 1 ||
      selectedPeriodMonth > 12
    ) {
      return res.status(400).json({
        message: "Accounting month must be between 1 and 12"
      });
    }

    if (
      !Number.isInteger(selectedPeriodYear) ||
      selectedPeriodYear < 2000 ||
      selectedPeriodYear > 2100
    ) {
      return res.status(400).json({
        message: "Accounting year is invalid"
      });
    }

    const normalizedMethod =
      typeof method === "string" && method.trim()
        ? method.trim().toLowerCase()
        : payment.method || "eft";

    payment.date = entryDate;
    payment.periodMonth = selectedPeriodMonth;
    payment.periodYear = selectedPeriodYear;
    payment.method = normalizedMethod;
    payment.reference =
      typeof reference === "string"
        ? reference.trim()
        : payment.reference || "";
    payment.description =
      typeof notes === "string" && notes.trim()
        ? notes.trim()
        : "Payment received";

    await payment.save();

    res.json({
      success: true,
      message: "Payment updated successfully",
      entry: payment
    });
  } catch (err) {
    console.error("PAYMENT UPDATE ERROR:", err);

    if (err?.code === 11000) {
      return res.status(400).json({
        message: "That payment reference already exists"
      });
    }

    res.status(500).json({
      message: "Failed to update payment"
    });
  }
});


/* =========================================================
   CHARGE RENT (DEBIT) + ENSURE INVOICE
   month = 0–11 ONLY
========================================================= */
router.post("/damage", auth, async (req, res) => {
  try {
    const { tenantId, amount, description, date } = req.body;
     const ownerId = new mongoose.Types.ObjectId(req.user.id);

    /* ===============================
       VALIDATION
    =============================== */
    if (!tenantId || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        message: "Tenant and valid amount required"
      });
    }

    /* ===============================
       GET ACTIVE LEASE
    =============================== */
    const lease = await Lease.findOne({
      tenantId,
      ownerId,
      status: "Active"
    });

    if (!lease) {
      return res.status(400).json({
        message: "No active lease"
      });
    }

    /* ===============================
       LOAD SETTINGS (VAT + CURRENCY)
    =============================== */
const settings = await Settings.findOne({ ownerId }).lean();

    const currency =
      settings?.preferences?.currency || "ZAR";

    const vatEnabled =
      settings?.financial?.vatEnabled || false;

    const vatPercent =
      settings?.financial?.vatPercent || 0;

    const vatMode =
      settings?.financial?.vatMode || "exclusive";

    const entryDate = date
      ? new Date(date)
      : new Date();

    /* ===============================
       VAT CALCULATION
    =============================== */

    let originalAmount = Number(amount);
    let debitAmount = originalAmount;
    let vatAmount = 0;
    let netAmount = originalAmount;

    if (vatEnabled && vatPercent > 0) {

      if (vatMode === "exclusive") {
        vatAmount =
          (originalAmount * vatPercent) / 100;

        debitAmount =
          originalAmount + vatAmount;
      }

      if (vatMode === "inclusive") {
        vatAmount =
          (originalAmount * vatPercent) /
          (100 + vatPercent);

        netAmount =
          originalAmount - vatAmount;

        debitAmount = originalAmount;
      }
    }

    /* ===============================
       SAFE ROUNDING
    =============================== */
    debitAmount =
      Math.round(debitAmount * 100) / 100;

    vatAmount =
      Math.round(vatAmount * 100) / 100;

    netAmount =
      Math.round(netAmount * 100) / 100;

    /* ===============================
       CREATE LEDGER ENTRY
    =============================== */

    const entry = await LedgerEntry.create({
      ownerId,
      currency, // ✅ GLOBAL SAFE
      tenantId,
      leaseId: lease._id,
      propertyId: lease.propertyId,
      unitId: lease.unitId || null,
      date: entryDate,
      periodMonth: entryDate.getMonth() + 1,
      periodYear: entryDate.getFullYear(),
      type: "damage",
      description: description || "Tenant damage",
      debit: debitAmount,
      credit: 0,
      vatAmount,
      netAmount,
      source: "manual"
    });

    await ensureInvoiceForLedger(entry);
    await emitLedgerNotification(entry);

    res.status(201).json({
      success: true,
      currency,
      entry
    });

  } catch (err) {
    console.error("DAMAGE ERROR:", err);
    res.status(500).json({
      message: "Failed to record damage"
    });
  }
});
/* =========================================================
   REVERSE DAMAGE (LEDGER CREDIT)
========================================================= */
router.post("/damage/reverse", auth, async (req, res) => {
  try {
    const { damageEntryId, reason } = req.body;
     const ownerId = new mongoose.Types.ObjectId(req.user.id);

    if (!damageEntryId) {
      return res.status(400).json({
        message: "Damage entry ID required"
      });
    }

    /* ===============================
       FIND ORIGINAL DAMAGE ENTRY
    =============================== */
    const original = await LedgerEntry.findOne({
      _id: damageEntryId,
      ownerId,
      type: "damage"
    });

    if (!original) {
      return res.status(404).json({
        message: "Damage entry not found"
      });
    }

    /* ===============================
       PREVENT DOUBLE REVERSAL
    =============================== */
    const alreadyReversed = await LedgerEntry.findOne({
      ownerId,
      type: "damage_reversal",
      reference: original._id.toString()
    });

    if (alreadyReversed) {
      return res.status(400).json({
        message: "Damage already reversed"
      });
    }

    /* ===============================
       CREATE REVERSAL ENTRY
       (Mirror original safely)
    =============================== */

    const reversal = await LedgerEntry.create({
      ownerId,
      currency: original.currency, // ✅ COPY CURRENCY
      tenantId: original.tenantId,
      leaseId: original.leaseId,
      propertyId: original.propertyId,
      unitId: original.unitId,
      date: new Date(),
    periodMonth: new Date().getMonth() + 1,
      periodYear: new Date().getFullYear(),
      type: "damage_reversal",
      description: reason
        ? `Damage reversal: ${reason}`
        : `Damage reversal for entry ${original._id}`,
      debit: 0,
      credit: original.debit, // reverse debit
      vatAmount: original.vatAmount || 0, // ✅ preserve VAT
      netAmount: original.netAmount || original.debit,
      reference: original._id.toString(),
      source: "manual"
    });

    await ensureInvoiceForLedger(reversal);
    await emitLedgerNotification(reversal);

    res.status(201).json({
      success: true,
      currency: original.currency,
      reversal
    });

  } catch (err) {
    console.error("DAMAGE REVERSAL ERROR:", err);
    res.status(500).json({
      message: "Failed to reverse damage"
    });
  }
});

router.post("/expense", auth, async (req, res) => {
  try {
    const { propertyId, amount, description, date } = req.body;
     const ownerId = new mongoose.Types.ObjectId(req.user.id);

    /* ===============================
       VALIDATION
    =============================== */
    if (!amount || Number(amount) <= 0 || !date) {
      return res.status(400).json({
        message: "Valid amount and date required"
      });
    }

    const d = new Date(date);

    if (isNaN(d.getTime())) {
      return res.status(400).json({
        message: "Invalid date format"
      });
    }

    /* ===============================
       LOAD SETTINGS (Currency)
    =============================== */
  const settings = await Settings.findOne({ ownerId }).lean();

    const currency =
      settings?.preferences?.currency || "ZAR";

    /* ===============================
       SAFE ROUNDING
    =============================== */
    const debitAmount =
      Math.round(Number(amount) * 100) / 100;

    /* ===============================
       CREATE LEDGER ENTRY
    =============================== */

    const entry = await LedgerEntry.create({
      ownerId,
      currency, // ✅ GLOBAL SAFE
      propertyId: propertyId || null,

      date: d,
      periodMonth: d.getMonth() + 1,
      periodYear: d.getFullYear(),

      type: "expense",
      debit: debitAmount,
      credit: 0,

      description: description || "Expense",
      source: "manual"
    });

    res.status(201).json({
      success: true,
      currency,
      entry
    });

  } catch (err) {
    console.error("EXPENSE ERROR:", err);
    res.status(500).json({
      message: "Failed to record expense"
    });
  }
});


router.get("/", auth, async (req, res) => {
  try {
    /* ===============================
       FORCE ObjectId (CRITICAL)
    =============================== */
    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    const ledger = await LedgerEntry.find({
      ownerId
    })
      .populate("tenantId", "fullName")
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .sort({ date: -1, _id: -1 })
      .lean();

    res.json({
      success: true,
      ledger: ledger.map(entry => ({
        ...entry,
        tenant: entry.tenantId
          ? { fullName: entry.tenantId.fullName }
          : null,
        property: entry.propertyId
          ? { name: entry.propertyId.name }
          : null,
        unit: entry.unitId
          ? { unitLabel: entry.unitId.unitLabel }
          : null
      }))
    });

  } catch (err) {
    console.error("LEDGER LOAD ERROR:", err);
    res.status(500).json({ message: "Failed to load ledger" });
  }
});  

router.get("/export/payments", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const { currency, locale, rows } = await loadPaymentExportData(ownerId);

    const csvRows = [
      "Paid On,Tenant,Property / Unit,Amount,Period,Method,Reference",
      ...rows.map(row => [
        row.paidOn,
        row.tenant,
        row.propertyUnit,
        formatMoney(locale, currency, row.amount),
        row.period,
        row.method,
        row.reference
      ].map(csvValue).join(","))
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=payments.csv");
    res.send(csvRows.join("\n"));
  } catch (err) {
    console.error("PAYMENTS CSV EXPORT ERROR:", err);
    res.status(500).json({
      message: "Failed to export payments"
    });
  }
});

router.get("/export/payments/pdf", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const { currency, locale, rows, totalCollected } =
      await loadPaymentExportData(ownerId);

    const paymentMethods = new Set(
      rows.map(row => row.method).filter(Boolean)
    ).size;

    const html = await generateTabularReportHTML({
      title: "Payments Register",
      subtitle:
        "All recorded rent payments, references, methods, and accounting periods.",
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Payments", value: String(rows.length) },
        { label: "Total collected", value: formatMoney(locale, currency, totalCollected) },
        { label: "Payment methods", value: String(paymentMethods) },
        { label: "Scope", value: "All data" }
      ],
      columns: [
        "Paid On",
        "Tenant",
        "Property / Unit",
        "Amount",
        "Period",
        "Method",
        "Reference"
      ],
      rows: rows.map(row => [
        row.paidOn,
        row.tenant,
        row.propertyUnit,
        formatMoney(locale, currency, row.amount),
        row.period,
        row.method,
        row.reference
      ]),
      emptyMessage: "No payments have been recorded yet."
    });

    const pdf = await renderHTMLToPDF(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=payments.pdf");
    res.setHeader("Content-Length", pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error("PAYMENTS PDF EXPORT ERROR:", err);
    res.status(500).json({
      message: "Failed to export payments PDF"
    });
  }
});

router.get("/expenses", auth, async (req, res) => {
  try {
  const ownerId = new mongoose.Types.ObjectId(req.user.id);

const settings = await Settings.findOne({ ownerId }).lean();

    const currency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* ===============================
       SAFE PAGINATION
    =============================== */
    const { page, limit } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(
      Math.max(parseInt(limit, 10) || 50, 1),
      200
    );

    const skip = (pageNum - 1) * limitNum;

    const totalCount = await LedgerEntry.countDocuments({
      ownerId,
      type: "expense"
    });

    const totalPages = Math.ceil(totalCount / limitNum);

    const expenses = await LedgerEntry.find({
      ownerId,
      type: "expense"
    })
      .populate("propertyId", "name")
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      success: true,
      currency,
      locale,

      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: totalCount,
        totalPages
      },

      expenses
    });

  } catch (err) {
    console.error("LOAD EXPENSES ERROR:", err);
    res.status(500).json({
      message: "Failed to load expenses"
    });
  }
});


router.get("/payments", auth, async (req, res) => {
  try {
    /* ===============================
       FORCE ObjectId (CRITICAL FIX)
    =============================== */
    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    /* ===============================
       LOAD SETTINGS (Currency + Locale)
    =============================== */
    const settings = await Settings.findOne({ ownerId }).lean();

    const currency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* ===============================
       OPTIONAL MONTH/YEAR FILTER
       (Important for Reports page)
    =============================== */
    const { month, year, page, limit } = req.query;

    const filter = {
      ownerId,
      type: "payment"
    };

    if (
      month !== undefined &&
      year !== undefined &&
      !isNaN(Number(month)) &&
      !isNaN(Number(year))
    ) {
      filter.periodMonth = Number(month);
      filter.periodYear = Number(year);
    }

    /* ===============================
       SAFE PAGINATION
    =============================== */
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(
      Math.max(parseInt(limit, 10) || 50, 1),
      200
    );

    const skip = (pageNum - 1) * limitNum;

    /* ===============================
       TOTAL COUNT
    =============================== */
    const totalCount = await LedgerEntry.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    /* ===============================
       LOAD PAYMENTS + POPULATE
    =============================== */
    const payments = await LedgerEntry.find(filter)
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("tenantId", "fullName")
      .populate("leaseId", "referenceCode")
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .lean();

    /* ===============================
       FORMAT RESPONSE
    =============================== */
    res.json({
      success: true,
      currency,
      locale,

      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: totalCount,
        totalPages
      },

      payments: payments.map(p => ({
        _id: p._id,
        currency: p.currency || currency,
        amount: p.credit || 0,
        paidOn: p.date,
        periodMonth: p.periodMonth,
        periodYear: p.periodYear,
        notes: p.description || "",

        tenant: p.tenantId
          ? {
              _id: p.tenantId._id,
              fullName: p.tenantId.fullName
            }
          : null,

        property: p.propertyId
          ? {
              _id: p.propertyId._id,
              name: p.propertyId.name
            }
          : null,

        unit: p.unitId
          ? {
              _id: p.unitId._id,
              unitLabel: p.unitId.unitLabel
            }
          : null,

        source: p.source || "",
        reference: p.reference || "",
        tenantReference: p.leaseId?.referenceCode || "",
        method: p.method || (p.source === "bank_import" ? "bank import" : "eft")
      }))
    });

  } catch (err) {
    console.error("PAYMENTS LOAD ERROR:", err);
    res.status(500).json({
      message: "Failed to load payments"
    });
  }
});
/* =========================================================
   MANUAL RENT CHARGE (SAFE – NO DUPLICATES)
   month = 0–11
========================================================= */

router.post("/charge-rent", auth, async (req, res) => {
  try {
    const { year, month } = req.body;
   const ownerId = new mongoose.Types.ObjectId(req.user.id);

    /* ===============================
       VALIDATION
    =============================== */
    if (
      year === undefined ||
      month === undefined ||
     month < 1 || month > 12
    ) {
      return res.status(400).json({
        message: "Valid year and month (0–11) required"
      });
    }

    /* ===============================
       LOAD SETTINGS
    =============================== */
   const settings = await Settings.findOne({ ownerId }).lean();

    const currency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    const vatEnabled = settings?.financial?.vatEnabled || false;
    const vatPercent = settings?.financial?.vatPercent || 0;
    const vatMode = settings?.financial?.vatMode || "exclusive";

    /* ===============================
       LOAD ACTIVE LEASES
    =============================== */
    const leases = await Lease.find({
      ownerId,
      status: "Active"
    });

const periodStart = new Date(year, month - 1, 1);
    let created = 0;

    for (const lease of leases) {

      if (!lease.monthlyRent || Number(lease.monthlyRent) <= 0)
        continue;

      // Prevent duplicate rent
      const existing = await LedgerEntry.findOne({
        ownerId,
        leaseId: lease._id,
        type: "rent",
        periodMonth: month,
        periodYear: year
      });

      if (existing) continue;

      /* ===============================
         VAT CALCULATION
      =============================== */

      let originalRent = Number(lease.monthlyRent);
      let debitAmount = originalRent;
      let vatAmount = 0;
      let netAmount = originalRent;

      if (vatEnabled && vatPercent > 0) {

        if (vatMode === "exclusive") {
          vatAmount = (originalRent * vatPercent) / 100;
          debitAmount = originalRent + vatAmount;
        }

        if (vatMode === "inclusive") {
          vatAmount = (originalRent * vatPercent) / (100 + vatPercent);
          netAmount = originalRent - vatAmount;
          debitAmount = originalRent;
        }
      }

      // Proper rounding
      debitAmount = Math.round(debitAmount * 100) / 100;
      vatAmount = Math.round(vatAmount * 100) / 100;
      netAmount = Math.round(netAmount * 100) / 100;

      /* ===============================
         CREATE LEDGER ENTRY
      =============================== */

      const rentEntry = await LedgerEntry.create({
        ownerId,
        currency, // ✅ GLOBAL SAFE
        tenantId: lease.tenantId,
        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        date: periodStart,
        periodMonth: month,
        periodYear: year,
        type: "rent",
        description: `Rent – ${periodStart.toLocaleString(locale, {
          month: "long",
          year: "numeric"
        })}`,
        debit: debitAmount,
        credit: 0,
        vatAmount,
        netAmount,
        source: "manual-trigger"
      });

      await ensureInvoiceForLedger(rentEntry);
      await emitLedgerNotification(rentEntry);

      created++;
    }

    res.json({
      success: true,
      currency,
      created,
      message: `${created} rent entries created`
    });

  } catch (err) {
    console.error("MANUAL RENT CHARGE ERROR:", err);
    res.status(500).json({
      message: "Failed to charge rent"
    });
  }
});

router.get("/vat-summary", auth, async (req, res) => {
  try {
     const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const { year } = req.query;

    /* ===============================
       VALIDATION
    =============================== */
    if (!year || isNaN(Number(year))) {
      return res.status(400).json({
        message: "Valid year required"
      });
    }

    /* ===============================
       LOAD SETTINGS (Currency + Locale)
    =============================== */
    const settings = await Settings.findOne({ ownerId }).lean();

    const currency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* ===============================
       AGGREGATE VAT
    =============================== */
    const vatAgg = await LedgerEntry.aggregate([
      {
        $match: {
          ownerId,
          periodYear: Number(year)
        }
      },
      {
        $group: {
          _id: "$periodMonth",
          totalVat: { $sum: { $ifNull: ["$vatAmount", 0] } }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    /* ===============================
       ENSURE ALL 12 MONTHS EXIST
    =============================== */
    const vatByMonth = Array.from({ length: 12 }, (_, m) => {
      const found = vatAgg.find(v => v._id === m);
      return {
        month: m,
        totalVat: found
          ? Math.round(found.totalVat * 100) / 100
          : 0
      };
    });

    res.json({
      success: true,
      year: Number(year),
      currency,
      locale,
      vat: vatByMonth
    });

  } catch (err) {
    console.error("VAT SUMMARY ERROR:", err);
    res.status(500).json({
      message: "Failed to load VAT summary"
    });
  }
});

router.get("/tenant/:tenantId", auth, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    if (!tenantId) {
      return res.status(400).json({
        message: "Tenant ID required"
      });
    }

    /* ===============================
       LOAD SETTINGS (Currency + Locale)
    =============================== */
 const settings = await Settings.findOne({ ownerId }).lean();

    const currency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* ===============================
       SAFE PAGINATION
    =============================== */
    const { page, limit } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(
      Math.max(parseInt(limit, 10) || 200, 1),
      500
    );

    const skip = (pageNum - 1) * limitNum;

    /* ===============================
       TOTAL RECORDS
    =============================== */
    const totalCount = await LedgerEntry.countDocuments({
      ownerId,
      tenantId
    });

    /* ===============================
       LOAD PAGE ENTRIES FIRST
    =============================== */
    const entries = await LedgerEntry.find({
      ownerId,
      tenantId
    })
      .sort({ date: 1, _id: 1 }) // 🔥 stable sort
      .skip(skip)
      .limit(limitNum)
      .lean();

    /* ===============================
       CALCULATE OPENING BALANCE
       (everything BEFORE first entry date)
    =============================== */

    let runningBalance = 0;

    if (entries.length > 0) {
      const firstEntry = entries[0];

      const previousAgg = await LedgerEntry.aggregate([
        {
          $match: {
            ownerId,
            tenantId,
            $or: [
              { date: { $lt: firstEntry.date } },
              {
                date: firstEntry.date,
                _id: { $lt: firstEntry._id }
              }
            ]
          }
        },
        {
          $group: {
            _id: null,
            debit: { $sum: { $ifNull: ["$debit", 0] } },
            credit: { $sum: { $ifNull: ["$credit", 0] } }
          }
        }
      ]);

      runningBalance =
        (previousAgg[0]?.debit || 0) -
        (previousAgg[0]?.credit || 0);

      runningBalance =
        Math.round(runningBalance * 100) / 100;
    }

    /* ===============================
       APPLY RUNNING BALANCE TO PAGE
    =============================== */

    const ledger = entries.map(e => {
      runningBalance +=
        (Number(e.debit) || 0) -
        (Number(e.credit) || 0);

      runningBalance =
        Math.round(runningBalance * 100) / 100;

      return {
        ...e,
        currency: e.currency || currency,
        balance: runningBalance
      };
    });

    /* ===============================
       RESPONSE
    =============================== */

    res.json({
      success: true,
      currency,
      locale,

      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      },

      ledger
    });

  } catch (err) {
    console.error("TENANT LEDGER ERROR:", err);
    res.status(500).json({
      message: "Failed to load tenant ledger"
    });
  }
});

router.get("/rent-status", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    /* ===============================
       LOAD ACTIVE LEASES
    =============================== */

    const leases = await Lease.find({
      ownerId,
      status: "Active"
    });

    if (!leases.length) {
      return res.json({
        paid: 0,
        partial: 0,
        unpaid: 0,
        total: 0
      });
    }

    const leaseIds = leases.map(l => l._id);

    /* ===============================
       LOAD CURRENT MONTH LEDGER
    =============================== */

    const entries = await LedgerEntry.find({
      ownerId,
      leaseId: { $in: leaseIds },
      periodMonth: month,
      periodYear: year,
      type: { $in: ["rent", "payment"] }
    });

    /* ===============================
       CALCULATE BALANCE PER LEASE
    =============================== */

    const balances = {};

    for (const e of entries) {

      const key = e.leaseId.toString();

      if (!balances[key]) balances[key] = 0;

      balances[key] += (e.debit || 0) - (e.credit || 0);
    }

    let paid = 0;
    let partial = 0;
    let unpaid = 0;

    for (const lease of leases) {

      const balance = balances[lease._id.toString()] || 0;

      if (balance <= 0) {
        paid++;
      } else if (balance < lease.monthlyRent) {
        partial++;
      } else {
        unpaid++;
      }
    }

    res.json({
      paid,
      partial,
      unpaid,
      total: leases.length
    });

  } catch (err) {
    console.error("RENT STATUS ERROR:", err);
    res.status(500).json({
      message: "Failed to load rent status"
    });
  }
});
module.exports = router;


