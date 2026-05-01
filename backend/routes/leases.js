const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");

const Lease = require("../models/Lease");
const Tenant = require("../models/Tenant");
const Property = require("../models/Property");
const Unit = require("../models/Unit");
const LedgerEntry = require("../models/LedgerEntry");
const BusinessSettings = require("../models/BusinessSettings");
const Invoice = require("../models/Invoice");

const path = require("path");
const ejs = require("ejs");
const renderHTMLToPDF = require("../utils/pdf/renderHTMLToPDF");
const generateTabularReportHTML =
  require("../utils/pdf/generateTabularReportHTML");

const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/email/sendEmail");
const Settings = require("../models/Financial-Settings");
const mongoose = require("mongoose");

function getFrontendUrl(req) {
  const configuredUrl = process.env.FRONTEND_URL;
  const requestUrl = req ? `${req.protocol}://${req.get("host")}` : null;

  return (configuredUrl || requestUrl || "https://trackmyrent.co.za").replace(/\/+$/, "");
}

function getSignSecret() {
  return process.env.SIGN_SECRET || process.env.JWT_SECRET;
}

/* =========================
   CONSTANTS
========================= */
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

/* =========================
   HELPERS
========================= */
function makeTenantShort(fullName = "") {
  if (!fullName) return "TENANT";
  const parts = fullName.trim().split(/\s+/);
  return (parts[0][0] + parts.at(-1).substring(0, 6))
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

function cleanUnitLabel(label = "") {
  return label.replace(/unit|room/gi, "").trim().toUpperCase() || "UNIT";
}

function getLast4(phone = "") {
  const digits = (phone.match(/\d/g) || []).join("");
  return digits.slice(-4) || "0000";
}

function buildReferenceCode(name, unit, phone) {
  return `TMR-${makeTenantShort(name)}-${cleanUnitLabel(unit)}-${getLast4(phone)}`;
}

function formatMoney(locale, currency, value) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(Number(value || 0));
}

function formatDate(locale, value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(locale);
}

function csvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function loadLeaseExportData(ownerId) {
  const settings = await Settings.findOne({ ownerId }).lean();
  const currency = settings?.preferences?.currency || "ZAR";
  const locale = settings?.preferences?.locale || "en-ZA";

  const leases = await Lease.find({ ownerId })
    .populate("tenantId", "fullName")
    .populate("propertyId", "name")
    .populate("unitId", "unitLabel")
    .sort({ leaseStart: -1, _id: -1 })
    .lean();

  const rows = leases.map(lease => ({
    tenant: lease.tenantId?.fullName || "-",
    propertyUnit:
      [lease.propertyId?.name, lease.unitId?.unitLabel]
        .filter(Boolean)
        .join(" / ") || "-",
    startDate: formatDate(locale, lease.leaseStart),
    endDate: formatDate(locale, lease.leaseEnd),
    monthlyRent: Number(lease.monthlyRent || 0),
    deposit: Number(lease.deposit || 0),
    status: lease.status || "-",
    reference: lease.referenceCode || "-"
  }));

  return {
    currency,
    locale,
    rows,
    totals: rows.reduce(
      (acc, row) => {
        acc.monthlyRent += row.monthlyRent;
        acc.deposit += row.deposit;
        if (row.status === "Active") {
          acc.active += 1;
        }
        return acc;
      },
      { monthlyRent: 0, deposit: 0, active: 0 }
    )
  };
}

/* ======================================================
   GET ACTIVE LEASE BY TENANT (MUST BE FIRST)
====================================================== */
router.get("/active/:tenantId", auth, async (req, res) => {
  const lease = await Lease.findOne({
    ownerId: req.user.id,
    tenantId: req.params.tenantId,
    status: "Active"
  }).populate("tenantId propertyId unitId");

  if (!lease) {
    return res.status(404).json({ message: "No active lease found" });
  }

  res.json({ lease });
});

/* ======================================================
   EXPORT LEASES (CSV)
====================================================== */
router.get("/export", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { currency, locale, rows } = await loadLeaseExportData(ownerId);

    const csvRows = [
      "Tenant,Property / Unit,Start Date,End Date,Monthly Rent,Deposit,Status,Reference",
      ...rows.map(row => [
        row.tenant,
        row.propertyUnit,
        row.startDate,
        row.endDate,
        formatMoney(locale, currency, row.monthlyRent),
        formatMoney(locale, currency, row.deposit),
        row.status,
        row.reference
      ].map(csvValue).join(","))
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=leases.csv");
    res.send(csvRows.join("\n"));
  } catch (err) {
    console.error("LEASES CSV EXPORT ERROR:", err);
    res.status(500).json({
      message: "Failed to export leases"
    });
  }
});

/* ======================================================
   EXPORT LEASES (PDF)
====================================================== */
router.get("/export/pdf", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { currency, locale, rows, totals } =
      await loadLeaseExportData(ownerId);

    const endedCount = rows.filter(row => row.status === "Ended").length;
    const cancelledCount = rows.filter(row => row.status === "Cancelled").length;

    const html = await generateTabularReportHTML({
      title: "Lease Register",
      subtitle:
        "All lease agreements with rental values, dates, status, and payment references.",
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Leases", value: String(rows.length) },
        { label: "Active", value: String(totals.active) },
        { label: "Ended / Cancelled", value: String(endedCount + cancelledCount) },
        { label: "Monthly rent", value: formatMoney(locale, currency, totals.monthlyRent) }
      ],
      columns: [
        "Tenant",
        "Property / Unit",
        "Start",
        "End",
        "Monthly Rent",
        "Deposit",
        "Status",
        "Reference"
      ],
      rows: rows.map(row => [
        row.tenant,
        row.propertyUnit,
        row.startDate,
        row.endDate,
        formatMoney(locale, currency, row.monthlyRent),
        formatMoney(locale, currency, row.deposit),
        row.status,
        row.reference
      ]),
      emptyMessage: "No leases have been created yet."
    });

    const pdf = await renderHTMLToPDF(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=leases.pdf");
    res.setHeader("Content-Length", pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error("LEASES PDF EXPORT ERROR:", err);
    res.status(500).json({
      message: "Failed to export leases PDF"
    });
  }
});

/* ======================================================
   EXPORT LEASE PDF
====================================================== */
router.get("/:id/pdf", auth, async (req, res) => {
  try {

    const ownerId = req.user.id;

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid lease id"
      });
    }

    /* ===============================
       LOAD LEASE
    =============================== */

    const lease = await Lease.findOne({
      _id: req.params.id,
      ownerId
    })
      .populate("tenantId propertyId unitId")
      .lean();

    if (!lease) {
      return res.status(404).json({
        message: "Lease not found"
      });
    }

    lease.startDate = lease.leaseStart || null;
    lease.endDate = lease.leaseEnd || null;

    /* ===============================
       SETTINGS
    =============================== */

    const settings = await Settings.findOne({ ownerId }).lean();

    const currency = lease.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency
    });

    /* ===============================
       BUSINESS PROFILE
    =============================== */

    const business =
      (await BusinessSettings.findOne({ ownerId }).lean()) || {};

    /* ===============================
       FORMAT DATA
    =============================== */

    lease.formattedMonthlyRent =
      formatter.format(lease.monthlyRent || 0);

    lease.formattedDeposit =
      formatter.format(lease.deposit || 0);

    lease.formattedStartDate = lease.startDate
      ? new Date(lease.startDate).toLocaleDateString(locale)
      : "-";

    lease.formattedEndDate = lease.endDate
      ? new Date(lease.endDate).toLocaleDateString(locale)
      : "-";

    /* ===============================
       RENDER TEMPLATE
    =============================== */

    const templatePath = path.join(
      __dirname,
      "../utils/pdf/templates",
      "lease.ejs"
    );

    const html = await ejs.renderFile(templatePath, {
      lease,
      business,
      currency,
      locale,
      generatedAt: new Date()
    });

    const pdf = await renderHTMLToPDF(html);

    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
      "Content-Disposition": `inline; filename=lease-${lease.referenceCode}.pdf`
    });

    return res.end(pdf);

  } catch (err) {

    console.error("LEASE PDF ERROR:", err);

    return res.status(500).json({
      message: "Failed to generate lease PDF"
    });

  }
});
/* ======================================================
   CREATE LEASE
====================================================== */
router.post("/", auth, async (req, res) => {

  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const ownerId = req.user.id;

    const {
      tenantId,
      propertyId,
      unitId,
      leaseStart,
      leaseEnd,
      monthlyRent,
      deposit,
      escalationPercent,
      paymentDueDay,
      currency: requestCurrency
    } = req.body;

    /* ===============================
       VALIDATE IDS
    =============================== */

    if (
      !mongoose.isValidObjectId(tenantId) ||
      !mongoose.isValidObjectId(propertyId) ||
      !mongoose.isValidObjectId(unitId)
    ) {
      return res.status(400).json({ message: "Invalid ID supplied" });
    }

    if (!leaseStart || monthlyRent == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const startDate = new Date(leaseStart);

    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "Invalid lease start date" });
    }

    let endDate = null;

    if (leaseEnd) {
      endDate = new Date(leaseEnd);

      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ message: "Invalid lease end date" });
      }

      if (endDate <= startDate) {
        return res.status(400).json({
          message: "Lease end must be after start date"
        });
      }
    }

    const rentNumber = Number(monthlyRent);
    const depositNumber = Number(deposit || 0);

    if (isNaN(rentNumber) || rentNumber <= 0) {
      return res.status(400).json({ message: "Invalid monthly rent amount" });
    }

    if (isNaN(depositNumber) || depositNumber < 0) {
      return res.status(400).json({ message: "Invalid deposit amount" });
    }

    /* ===============================
       FETCH RECORDS
    =============================== */

    const [tenant, property, unit, settings] = await Promise.all([
      Tenant.findOne({ _id: tenantId, ownerId }).session(session),
      Property.findOne({ _id: propertyId, ownerId }).session(session),
      Unit.findOne({ _id: unitId, ownerId }).session(session),
      Settings.findOne({ ownerId }).lean()
    ]);

    if (!tenant || !property || !unit) {
      return res.status(404).json({
        message: "Invalid tenant / property / unit"
      });
    }

    /* ===============================
       OCCUPANCY CHECK
    =============================== */

    const occupied = await Lease.findOne({
      unitId,
      ownerId,
      status: "Active"
    }).session(session);

    if (occupied) {
      return res.status(400).json({ message: "Unit already occupied" });
    }

    /* ===============================
       LOCK CURRENCY
    =============================== */

    let leaseCurrency =
      (requestCurrency && requestCurrency.toUpperCase()) ||
      settings?.preferences?.currency ||
      "ZAR";

    const allowedCurrencies = [
      "ZAR","USD","EUR","GBP","AED","AUD","CAD","NZD"
    ];

    if (!allowedCurrencies.includes(leaseCurrency)) {
      leaseCurrency = settings?.preferences?.currency || "ZAR";
    }

    /* ===============================
       SAFE MONEY ROUNDING
    =============================== */

    const safeMonthlyRent =
      Math.round(rentNumber * 100) / 100;

    const safeDeposit =
      Math.round(depositNumber * 100) / 100;

    /* ===============================
       REFERENCE CODE
    =============================== */

    const referenceCode = buildReferenceCode(
      tenant.fullName,
      unit.unitLabel,
      tenant.phone
    );

    /* ===============================
       CREATE LEASE
    =============================== */

    const lease = await Lease.create([{
      ownerId,
      tenantId,
      propertyId,
      unitId,
      leaseStart: startDate,
      leaseEnd: endDate,
      monthlyRent: safeMonthlyRent,
      deposit: safeDeposit,
      escalationPercent,
      paymentDueDay,
      referenceCode,
      currency: leaseCurrency,
      status: "Active",
      isSigned: false
    }], { session });

    const leaseDoc = lease[0];

    /* ===============================
       RENT LEDGER ENTRY
    =============================== */

    await LedgerEntry.create([{
      ownerId,
      tenantId,
      leaseId: leaseDoc._id,
      propertyId,
      unitId,
      currency: leaseCurrency,
      date: new Date(startDate.getFullYear(), startDate.getMonth(), 1),
      periodMonth: startDate.getMonth() + 1,
      periodYear: startDate.getFullYear(),
      type: "rent",
      description: `Rent charged (${MONTHS[startDate.getMonth()]} ${startDate.getFullYear()})`,
      debit: safeMonthlyRent,
      credit: 0,
      source: "lease-create"
    }], { session });

    /* ===============================
       DEPOSIT LEDGER ENTRY
    =============================== */

    if (safeDeposit > 0) {
      await LedgerEntry.create([{
        ownerId,
        tenantId,
        leaseId: leaseDoc._id,
        propertyId,
        unitId,
        currency: leaseCurrency,
        date: startDate,
        periodMonth: startDate.getMonth() + 1,
        periodYear: startDate.getFullYear(),
        type: "deposit",
        description: "Security deposit charged",
        debit: safeDeposit,
        credit: 0,
        source: "lease-create"
      }], { session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      lease: leaseDoc
    });

  } catch (err) {

    await session.abortTransaction();
    session.endSession();

    console.error("LEASE CREATE ERROR:", err);

    res.status(500).json({
      message: "Server error"
    });

  }

});
/* ======================================================
   GET LEASES
====================================================== */
router.get("/", auth, async (req, res) => {
  const leases = await Lease.find({ ownerId: req.user.id })
    .populate("tenantId propertyId unitId")
    .sort({ leaseStart: -1 });

  res.json({ success: true, leases });
});

/* ======================================================
   UPDATE LEASE (LOCKED IF SIGNED)
====================================================== */
router.patch("/:id", auth, async (req, res) => {
  const lease = await Lease.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!lease) return res.status(404).json({ message: "Lease not found" });
  if (lease.isSigned)
    return res.status(403).json({ message: "Lease is signed and locked" });

  const allowedUpdates = [
  "leaseEnd",
  "escalationPercent",
  "paymentDueDay"
];

for (const key of allowedUpdates) {
  if (req.body[key] !== undefined) {
    lease[key] = req.body[key];
  }
}
  await lease.save();

  res.json({ success: true, lease });
});

/* ======================================================
   CANCEL LEASE (ACCOUNTING-CORRECT)
====================================================== */
router.delete("/:id", auth, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const ownerId = req.user.id;

    const lease = await Lease.findOne(
      { _id: req.params.id, ownerId },
      null,
      { session }
    );

    if (!lease) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Lease not found" });
    }

    if (lease.status === "Cancelled") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Lease already cancelled" });
    }

    /* ===============================
       PREVENT DOUBLE REVERSAL
    =============================== */
    const alreadyReversed = await LedgerEntry.findOne(
      {
        ownerId,
        leaseId: lease._id,
        type: "rent_reversal"
      },
      null,
      { session }
    );

    if (alreadyReversed) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Lease already reversed"
      });
    }

    /* ===============================
       FETCH RENT ENTRIES
    =============================== */
    const rentEntries = await LedgerEntry.find(
      {
        ownerId,
        leaseId: lease._id,
        type: "rent"
      },
      null,
      { session }
    );

    /* ===============================
       CREATE REVERSALS
    =============================== */
    for (const entry of rentEntries) {
      const originalDate = new Date(entry.date);

      await LedgerEntry.create(
        [{
          ownerId: entry.ownerId,
          tenantId: entry.tenantId,
          leaseId: entry.leaseId,
          propertyId: entry.propertyId,
          unitId: entry.unitId,
          currency: entry.currency,
          date: new Date(),
          periodMonth: originalDate.getMonth() + 1,
          periodYear: originalDate.getFullYear(),
          type: "rent_reversal",
          description: "Rent reversal – lease cancelled",
          debit: 0,
          credit: entry.debit,
          reference: entry._id.toString(),
          source: "auto"
        }],
        { session }
      );
    }

    /* ===============================
       CANCEL OPEN INVOICES
    =============================== */
    await Invoice.updateMany(
      {
        ownerId,
        leaseId: lease._id,
        status: { $in: ["UNPAID", "PARTIAL", "OVERDUE"] }
      },
      {
        $set: {
          status: "CANCELLED",
          balanceDue: 0
        }
      },
      { session }
    );

    /* ===============================
       UPDATE LEASE
    =============================== */
    lease.status = "Cancelled";
    lease.cancelledAt = new Date();
    await lease.save({ session });

    /* ===============================
       UPDATE TENANT
    =============================== */
    await Tenant.findByIdAndUpdate(
      lease.tenantId,
      { status: "moved_out" },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Lease cancelled and rent reversed successfully"
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("LEASE CANCEL ERROR:", err);
    res.status(500).json({
      message: "Failed to cancel lease"
    });
  }
});
/* ======================================================
   SIGN LEASE (EMAIL TOKEN)
====================================================== */
router.post("/sign", async (req, res) => {
  try {
    const { token, signature } = req.body;

    if (!token || !signature) {
      return res.status(400).json({ message: "Invalid signing request" });
    }

    const signSecret = getSignSecret();

    if (!signSecret) {
      return res.status(503).json({ message: "Lease signing is not configured" });
    }

    const payload = jwt.verify(token, signSecret);
    const lease = await Lease.findById(payload.leaseId);

    if (!lease) return res.status(404).json({ message: "Lease not found" });
    if (lease.isSigned)
      return res.status(400).json({ message: "Lease already signed" });

    lease.tenantSignatureUrl = signature;
    lease.isSigned = true;
    lease.signedAt = new Date();
    lease.signToken = null;
    lease.signTokenExpires = null;
    lease.signedByIp = req.ip;
    lease.signedByUserAgent = req.headers["user-agent"];

    await lease.save();
    res.json({ success: true });

  } catch (err) {
    console.error("LEASE TOKEN SIGN ERROR:", err);
    res.status(500).json({ message: "Failed to sign lease" });
  }
});
/* ======================================================
   END LEASE
====================================================== */
router.patch("/:id/end", auth, async (req, res) => {
  const lease = await Lease.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user.id },
    { status: "Ended", leaseEnd: new Date() },
    { new: true }
  );

  if (!lease) return res.status(404).json({ message: "Lease not found" });

  await Tenant.findByIdAndUpdate(lease.tenantId, {
    status: "moved_out"
  });

  res.json({ success: true, lease });
});
/* ======================================================
   SEND LEASE FOR SIGNING
====================================================== */
router.post("/:id/send-sign", auth, async (req, res) => {
  try {
    const lease = await Lease.findOne({
      _id: req.params.id,
      ownerId: req.user.id
    }).populate("tenantId");

    if (!lease) return res.status(404).json({ message: "Lease not found" });
    if (lease.isSigned)
      return res.status(400).json({ message: "Lease already signed" });
    if (!lease.tenantId?.email)
      return res.status(400).json({ message: "Tenant email address is missing" });

    const signSecret = getSignSecret();

    if (!signSecret) {
      return res.status(503).json({ message: "Lease signing is not configured" });
    }

    const token = jwt.sign(
      { leaseId: lease._id },
      signSecret,
      { expiresIn: "7d" }
    );

    lease.signToken = token;
    lease.signTokenExpires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await lease.save();

    const signUrl = `${getFrontendUrl(req)}/sign-lease.html?token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: lease.tenantId.email,
      subject: "Lease Agreement - Signature Required",
      text: `Hi ${lease.tenantId.fullName},\n\nPlease sign your lease:\n${signUrl}`,
      html: `<p>Please sign your lease: <a href="${signUrl}">Sign Lease</a></p>`
    });

    res.json({ success: true, message: "Signing email sent" });

  } catch (err) {
    console.error("SEND SIGN EMAIL ERROR:", err);
    const statusCode = err.code === "EMAIL_NOT_CONFIGURED" ? 503 : 500;
    res.status(statusCode).json({ message: "Failed to send signing email" });
  }
});

module.exports = router;
