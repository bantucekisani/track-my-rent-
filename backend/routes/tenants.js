const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");

const Tenant = require("../models/Tenant");
const LedgerEntry = require("../models/LedgerEntry");
const Lease = require("../models/Lease");
const Maintenance = require("../models/Maintenance");
const FinancialSettings = require("../models/Financial-Settings");

const renderHTMLToPDF = require("../utils/pdf/renderHTMLToPDF");
const generateTabularReportHTML =
  require("../utils/pdf/generateTabularReportHTML");

const router = express.Router();

function describeLedgerEntry(entry) {
  let label = entry.description || "";

  if (entry.type === "rent") label = "Monthly Rent";
  if (entry.type === "payment") label = "Payment received";
  if (entry.type === "utility") {
    label = `${String(entry.subtype || "Utility").toUpperCase()} charge`;
  }
  if (entry.type === "damage") label = "Damage charge";
  if (entry.type === "damage_reversal") label = "Damage reversal";
  if (entry.type === "expense") label = entry.description || "Expense";

  return label || "-";
}

function describePaymentMethod(entry) {
  const normalized =
    typeof entry?.method === "string" && entry.method.trim()
      ? entry.method.trim().toLowerCase()
      : typeof entry?.source === "string" && entry.source.trim()
      ? entry.source.trim().toLowerCase()
      : "eft";

  const labels = {
    eft: "EFT",
    cash: "Cash",
    card: "Card",
    other: "Other",
    bank_import: "Bank Import",
    "bank import": "Bank Import",
    bank_import_review: "Bank Import",
    "bank import review": "Bank Import"
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function describePaymentPeriod(locale, entry) {
  if (entry?.periodMonth && entry?.periodYear) {
    const periodDate = new Date(
      Number(entry.periodYear),
      Number(entry.periodMonth) - 1,
      1
    );

    if (!Number.isNaN(periodDate.getTime())) {
      return periodDate.toLocaleDateString(locale, {
        month: "long",
        year: "numeric"
      });
    }
  }

  return describeLedgerEntry(entry);
}

function describePaymentReference(entry, lease) {
  return entry?.reference || lease?.referenceCode || "-";
}

function formatMoney(locale, currency, value) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(Number(value || 0));
}

function safeFilenamePart(value) {
  return String(value || "tenant")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tenant";
}

/* =====================================================
   EXPORT TENANTS (PDF)
===================================================== */
router.get("/export/pdf", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const settings =
      (await FinancialSettings.findOne({ ownerId }).lean()) || {};
    const locale = settings?.preferences?.locale || "en-ZA";
    const tenants = await Tenant.find({ ownerId })
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .lean();
    const activeLeaseCount = await Lease.countDocuments({
      ownerId,
      status: "Active"
    });
    const propertyCount = new Set(
      tenants.map(tenant => tenant.propertyId?.name).filter(Boolean)
    ).size;
    const contactReadyCount = tenants.filter(
      tenant => tenant.email || tenant.phone
    ).length;
    const html = await generateTabularReportHTML({
      title: "Tenant Directory",
      subtitle: "Current tenant records with contact details and assigned properties.",
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Tenants", value: String(tenants.length) },
        { label: "Active leases", value: String(activeLeaseCount) },
        { label: "Properties covered", value: String(propertyCount) },
        { label: "Contact ready", value: String(contactReadyCount) }
      ],
      columns: ["Tenant", "Email", "Phone", "Property", "Unit"],
      rows: tenants.map(tenant => [
        tenant.fullName || "-",
        tenant.email || "-",
        tenant.phone || tenant.whatsappNumber || "-",
        tenant.propertyId?.name || "-",
        tenant.unitId?.unitLabel || "-"
      ]),
      emptyMessage: "No tenants have been added yet."
    });

    const pdf = await renderHTMLToPDF(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=tenants.pdf");
    res.setHeader("Content-Length", pdf.length);
    res.end(pdf);

  } catch (err) {
    console.error("TENANTS PDF ERROR:", err);
    res.status(500).json({ message: "Failed to export tenants PDF" });
  }
});

/* =====================================================
   EXPORT TENANTS (CSV)
===================================================== */
router.get("/export", auth, async (req, res) => {
  try {
    const tenants = await Tenant.find({ ownerId: req.user.id }).lean();

    const rows = [
      "Full Name,Email,Phone",
      ...tenants.map(t =>
        `"${t.fullName}","${t.email || ""}","${t.phone || ""}"`
      )
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=tenants.csv");
    res.send(rows.join("\n"));

  } catch (err) {
    console.error("TENANT EXPORT ERROR:", err);
    res.status(500).json({ message: "Failed to export tenants" });
  }
});

/* =====================================================
   CREATE TENANT
===================================================== */
router.post("/", auth, async (req, res) => {
  try {
    const tenant = await Tenant.create({
      ...req.body,
      ownerId: req.user.id
    });

    res.json({ success: true, tenant });

  } catch (err) {
    console.error("CREATE TENANT ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   LIST TENANTS (PAGINATED)
===================================================== */
router.get("/", auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const tenants = await Tenant.find({ ownerId: req.user.id })
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const total = await Tenant.countDocuments({ ownerId: req.user.id });

    res.json({
      success: true,
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
      tenants
    });

  } catch (err) {
    console.error("LIST TENANTS ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   GET TENANT PROFILE (AGGREGATED + FAST)
===================================================== */
router.get("/:id/profile", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant id"
      });
    }

    const tenantId = new mongoose.Types.ObjectId(req.params.id);
    const ownerId = req.user.id;

    const tenant = await Tenant.findOne({
      _id: tenantId,
      ownerId
    })
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

    const lease = await Lease.findOne({
      tenantId,
      ownerId,
      status: "Active"
    }).lean();

    /* 🔥 FAST BALANCE CALCULATION */
    const balanceAgg = await LedgerEntry.aggregate([
      { $match: { tenantId, ownerId } },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: "$debit" },
          totalCredit: { $sum: "$credit" }
        }
      }
    ]);

    const totalDebit = balanceAgg[0]?.totalDebit || 0;
    const totalCredit = balanceAgg[0]?.totalCredit || 0;
    const balance = totalDebit - totalCredit;

    const recentLedger = await LedgerEntry.find({
      tenantId,
      ownerId
    })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    const maintenance = await Maintenance.find({
      tenantId,
      ownerId
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      tenant,
      lease,
      balance,
      recentLedger,
      maintenance
    });

  } catch (err) {
    console.error("TENANT PROFILE ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

router.get("/:id/statement/pdf", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant id"
      });
    }

    const tenantId = new mongoose.Types.ObjectId(req.params.id);
    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    const tenant = await Tenant.findOne({
      _id: tenantId,
      ownerId
    })
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

    const lease = await Lease.findOne({
      tenantId,
      ownerId,
      status: "Active"
    }).lean();

    const settings =
      (await FinancialSettings.findOne({ ownerId }).lean()) || {};

    const currency = settings?.preferences?.currency || "ZAR";
    const locale = settings?.preferences?.locale || "en-ZA";

    const ledgerEntries = await LedgerEntry.find({
      tenantId,
      ownerId
    })
      .sort({ date: 1, _id: 1 })
      .lean();

    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const rows = ledgerEntries.map(entry => {
      const debit = Number(entry.debit || 0);
      const credit = Number(entry.credit || 0);

      totalDebit += debit;
      totalCredit += credit;
      runningBalance += debit - credit;

      return [
        new Date(entry.date).toLocaleDateString(locale),
        describeLedgerEntry(entry),
        formatMoney(locale, currency, debit),
        formatMoney(locale, currency, credit),
        formatMoney(locale, currency, runningBalance)
      ];
    });

    const subtitleParts = [
      tenant.fullName,
      tenant.propertyId?.name,
      tenant.unitId?.unitLabel ? `Unit ${tenant.unitId.unitLabel}` : "",
      lease?.referenceCode ? `Lease ${lease.referenceCode}` : ""
    ].filter(Boolean);

    const html = await generateTabularReportHTML({
      title: "Tenant Statement",
      subtitle: subtitleParts.join(" · "),
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Entries", value: String(ledgerEntries.length) },
        { label: "Total debits", value: formatMoney(locale, currency, totalDebit) },
        { label: "Total credits", value: formatMoney(locale, currency, totalCredit) },
        {
          label: "Closing balance",
          value: formatMoney(locale, currency, totalDebit - totalCredit)
        }
      ],
      columns: ["Date", "Description", "Debit", "Credit", "Balance"],
      rows,
      emptyMessage: "No tenant ledger entries found yet."
    });

    const pdf = await renderHTMLToPDF(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=tenant-statement-${safeFilenamePart(tenant.fullName)}.pdf`
    );
    res.setHeader("Content-Length", pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error("TENANT STATEMENT PDF ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate tenant statement PDF"
    });
  }
});

router.get("/:id/payments/pdf", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant id"
      });
    }

    const tenantId = new mongoose.Types.ObjectId(req.params.id);
    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    const tenant = await Tenant.findOne({
      _id: tenantId,
      ownerId
    })
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

    const lease = await Lease.findOne({
      tenantId,
      ownerId,
      status: "Active"
    }).lean();

    const settings =
      (await FinancialSettings.findOne({ ownerId }).lean()) || {};

    const currency = settings?.preferences?.currency || "ZAR";
    const locale = settings?.preferences?.locale || "en-ZA";

    const paymentEntries = await LedgerEntry.find({
      tenantId,
      ownerId,
      type: "payment"
    })
      .sort({ date: -1, _id: -1 })
      .lean();

    const totalReceived = paymentEntries.reduce(
      (sum, entry) => sum + Number(entry.credit || 0),
      0
    );

    const html = await generateTabularReportHTML({
      title: "Payment History",
      subtitle: [
        tenant.fullName,
        tenant.propertyId?.name,
        tenant.unitId?.unitLabel ? `Unit ${tenant.unitId.unitLabel}` : "",
        lease?.referenceCode ? `Lease ${lease.referenceCode}` : ""
      ].filter(Boolean).join(" · "),
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Payments", value: String(paymentEntries.length) },
        {
          label: "Total received",
          value: formatMoney(locale, currency, totalReceived)
        },
        {
          label: "Latest payment",
          value: paymentEntries[0]
            ? new Date(paymentEntries[0].date).toLocaleDateString(locale)
            : "-"
        },
        {
          label: "Default reference",
          value: lease?.referenceCode || "-"
        }
      ],
      columns: ["Date", "Period", "Amount", "Method", "Reference"],
      rows: paymentEntries.map(entry => [
        new Date(entry.date).toLocaleDateString(locale),
        describePaymentPeriod(locale, entry),
        formatMoney(locale, currency, entry.credit || 0),
        describePaymentMethod(entry),
        describePaymentReference(entry, lease)
      ]),
      emptyMessage: "No tenant payments have been recorded yet."
    });

    const pdf = await renderHTMLToPDF(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=payment-history-${safeFilenamePart(tenant.fullName)}.pdf`
    );
    res.setHeader("Content-Length", pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error("TENANT PAYMENT HISTORY PDF ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate payment history PDF"
    });
  }
});

/* =====================================================
   GET SINGLE TENANT
===================================================== */
router.get("/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant id"
      });
    }

    const tenant = await Tenant.findOne({
      _id: req.params.id,
      ownerId: req.user.id
    })
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

    res.json({ success: true, tenant });

  } catch (err) {
    console.error("GET TENANT ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   UPDATE TENANT
===================================================== */
router.put("/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant id"
      });
    }

    const tenant = await Tenant.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.id },
      req.body,
      { new: true }
    ).lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

    res.json({ success: true, tenant });

  } catch (err) {
    console.error("UPDATE TENANT ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   DELETE TENANT (SAFE)
===================================================== */
router.delete("/:id", auth, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    if (!mongoose.isValidObjectId(req.params.id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid tenant id" });
    }

    const deleted = await Tenant.findOneAndDelete(
      { _id: req.params.id, ownerId: req.user.id },
      { session }
    );

    if (!deleted) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Tenant not found" });
    }

    await LedgerEntry.deleteMany({ tenantId: deleted._id }, { session });
    await Lease.deleteMany({ tenantId: deleted._id }, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("DELETE TENANT ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
