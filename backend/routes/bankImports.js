const express = require("express");
const multer = require("multer");
const fs = require("fs");

const LedgerEntry = require("../models/LedgerEntry");
const Tenant = require("../models/Tenant");
const Lease = require("../models/Lease");
const BankImport = require("../models/BankImport");
const Settings = require("../models/Financial-Settings");

const auth = require("../middleware/authMiddleware");
const { emitLedgerNotification } = require("../services/ledgerNotifications");
const { isDuplicatePayment } = require("../services/ledgerDuplicates");
const { parseBankPDF } = require("../utils/bank/parseBankPDF");
const { calculateConfidence } = require("../utils/bank/matchConfidence");

const router = express.Router();
fs.mkdirSync("uploads/bank", { recursive: true });

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map(value => value.trim());
}

function parseCSVText(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(line => line.trim());

  if (!lines.length) {
    return [];
  }

  const headers = parseCSVLine(lines[0]);

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return row;
  });
}

/* =========================
   MULTER
========================= */
const upload = multer({
  dest: "uploads/bank/",
  limits: { fileSize: 10 * 1024 * 1024 }
});

/* ======================================================
   UPLOAD BANK STATEMENT (CSV / PDF)
====================================================== */
router.post("/upload", auth, upload.single("statement"), async (req, res) => {
  let filePath;

  try {
    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    const ownerId = req.user.id;
    filePath = req.file.path;

    const settings = await Settings.findOne({ ownerId }).lean();
    const defaultCurrency =
      settings?.preferences?.currency || "ZAR";
    const locale =
      settings?.preferences?.locale || "en-ZA";
    const timezone =
      settings?.preferences?.timezone || "Africa/Johannesburg";

    const ext = req.file.originalname.split(".").pop().toLowerCase();

    let rows = [];

    /* ======================
       CSV
    ====================== */
    if (ext === "csv") {
      const csvText = fs.readFileSync(filePath, "utf8");
      rows = parseCSVText(csvText);

      rows = rows.map(r => ({
        amount: Number(r.amount || r.Amount || r.AMOUNT || 0),
        reference: (r.reference || r.Reference || "").trim(),
        date: r.date ? new Date(r.date) : new Date(),
        raw: r
      }));
    }

    /* ======================
       PDF
    ====================== */
    if (ext === "pdf") {
      rows = await parseBankPDF(filePath);
    }

    const matched = [];
    const pending = [];
    const unmatched = [];
    const duplicates = [];

    for (const row of rows) {

      if (!row.amount || row.amount <= 0) {
        unmatched.push({ row, reason: "Invalid amount" });
        continue;
      }

      if (!row.reference) {
        unmatched.push({ row, reason: "Missing reference" });
        continue;
      }

      const safeAmount =
        Math.round(Number(row.amount) * 100) / 100;

      const paymentDate =
        row.date && !isNaN(new Date(row.date))
          ? new Date(row.date)
          : new Date();

      const periodMonth = paymentDate.getMonth() + 1;
      const periodYear = paymentDate.getFullYear();

      /* ======================
         FIND LEASE + TENANT
      ====================== */
      const normalizedReference = String(row.reference || "").trim();
      const safeReferenceRegex = new RegExp(escapeRegex(normalizedReference), "i");

      let lease = await Lease.findOne({
        ownerId,
        referenceCode: normalizedReference,
        status: "Active"
      }).populate("tenantId", "fullName phone email");

      let tenant = lease?.tenantId || null;

      if (!tenant) {
        tenant = await Tenant.findOne({
          ownerId,
          $or: [
            { phone: normalizedReference },
            { email: normalizedReference },
            { fullName: safeReferenceRegex }
          ]
        });
      }

      if (!tenant) {
        unmatched.push({ row, reason: "No tenant match" });
        continue;
      }

      /* ======================
         ACTIVE LEASE
      ====================== */
      if (!lease) {
        lease = await Lease.findOne({
          ownerId,
          tenantId: tenant._id,
          status: "Active"
        });
      }

      if (!lease) {
        pending.push({
          tenant: tenant.fullName,
          amount: safeAmount,
          reference: row.reference,
          reason: "No active lease"
        });
        continue;
      }

      /* ======================
         DUPLICATE CHECK
      ====================== */
      const duplicate = await isDuplicatePayment({
        ownerId,
        tenantId: tenant._id,
        amount: safeAmount,
        date: paymentDate,
        reference: row.reference
      });

      if (duplicate) {
        duplicates.push({
          tenant: tenant.fullName,
          amount: safeAmount,
          reference: row.reference
        });
        continue;
      }

      /* ======================
         CONFIDENCE
      ====================== */
      const confidence = calculateConfidence({
        tenant,
        lease,
        reference: row.reference
      });

      await BankImport.create({
        ownerId,
        raw: row,
        amount: safeAmount,
        currency: defaultCurrency,
        reference: row.reference,
        date: paymentDate,
        tenantId: tenant._id,
        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        confidence,
        status: confidence >= 80 ? "auto_posted" : "pending"
      });

      /* ======================
         AUTO POST TO LEDGER
      ====================== */
      if (confidence >= 80) {

        const entry = await LedgerEntry.create({
          ownerId,
          tenantId: tenant._id,
          leaseId: lease._id,
          propertyId: lease.propertyId,
          unitId: lease.unitId,

          currency: defaultCurrency,

          date: paymentDate,
          periodMonth,
          periodYear,

          type: "payment",
          description: `Bank payment (${row.reference})`,

          debit: 0,
          credit: safeAmount,

          method: "bank_import",
          source: "bank_import",
          reference: row.reference
        });

        await emitLedgerNotification(entry);

        matched.push({
          tenant: tenant.fullName,
          amount: safeAmount,
          reference: row.reference,
          confidence
        });

      } else {

        pending.push({
          tenant: tenant.fullName,
          amount: safeAmount,
          reference: row.reference,
          confidence
        });
      }
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      currency: defaultCurrency,
      locale,
      timezone,
      autoPosted: matched.length,
      pendingReview: pending.length,
      unmatchedCount: unmatched.length,
      duplicatesCount: duplicates.length,
      matched,
      pending,
      unmatched,
      duplicates
    });

  } catch (err) {

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.error("BANK IMPORT ERROR:", err);
    res.status(500).json({ message: "Failed to import bank file" });
  }
});

/* ======================================================
   GET PENDING IMPORTS
====================================================== */
router.get("/pending", auth, async (req, res) => {
  const items = await BankImport.find({
    ownerId: req.user.id,
    status: "pending"
  })
    .populate("tenantId", "fullName")
    .populate("propertyId", "name")
    .populate("unitId", "unitLabel")
    .sort({ createdAt: -1 });

  res.json({ items });
});

/* ======================================================
   APPROVE IMPORT
====================================================== */
router.post("/:id/approve", auth, async (req, res) => {
  const item = await BankImport.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!item) {
    return res.status(404).json({ message: "Not found" });
  }

  const paymentDate = new Date(item.date);

  const entry = await LedgerEntry.create({
    ownerId: item.ownerId,
    tenantId: item.tenantId,
    leaseId: item.leaseId,
    propertyId: item.propertyId,
    unitId: item.unitId,

    currency: item.currency || "ZAR",

    date: paymentDate,
    periodMonth: paymentDate.getMonth() + 1,
    periodYear: paymentDate.getFullYear(),

    type: "payment",
    description: `Bank payment (${item.reference})`,
    debit: 0,
    credit: item.amount,
    method: "bank_import",
    source: "bank_import_review",
    reference: item.reference
  });

  item.status = "approved";
  await item.save();

  await emitLedgerNotification(entry);

  res.json({ success: true });
});

/* ======================================================
   REJECT IMPORT
====================================================== */
router.post("/:id/reject", auth, async (req, res) => {
  await BankImport.updateOne(
    { _id: req.params.id, ownerId: req.user.id },
    { status: "rejected" }
  );

  res.json({ success: true });
});

module.exports = router;
