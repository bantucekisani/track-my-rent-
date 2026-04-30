const express = require("express");
const auth = require("../middleware/authMiddleware");

const Invoice = require("../models/Invoice");
const LedgerEntry = require("../models/LedgerEntry");
const Settings = require("../models/Financial-Settings");
const Lease = require("../models/Lease");

const sendInvoiceEmail = require("../utils/email/sendInvoiceEmail");
const generateInvoicePDF = require("../utils/pdf/generateInvoicePDF");
const BusinessSettings = require("../models/BusinessSettings");

const mongoose = require("mongoose");
const router = express.Router();

/* =====================================================
   GET ALL INVOICES
===================================================== */
router.get("/", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    /* =========================
       LOAD SETTINGS
    ========================= */

    const settings = await Settings.findOne({ ownerId }).lean();

    const defaultCurrency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* =========================
       LOAD INVOICES
    ========================= */

    const invoices = await Invoice.find({ ownerId })
      .populate("tenantId", "fullName email")
      .sort({ invoiceDate: -1 })
      .lean();

    const leaseIds = invoices
      .filter(i => i.leaseId)
      .map(i => i.leaseId);

    /* =========================
       LOAD LEDGER ENTRIES
    ========================= */

    const ledgerEntries = await LedgerEntry.find({
      ownerId,
      leaseId: { $in: leaseIds }
    }).lean();

    /* =========================
       GROUP BY LEASE + PERIOD
    ========================= */

    const ledgerMap = {};

    for (const e of ledgerEntries) {

      const key =
        `${e.leaseId}_${e.periodYear}_${e.periodMonth}`;

      if (!ledgerMap[key]) ledgerMap[key] = [];

      ledgerMap[key].push(e);

    }

    const results = [];

    for (const invoice of invoices) {

      if (!invoice.leaseId) continue;

      /* =========================
         LOCK INVOICE CURRENCY
      ========================= */

    const invoiceCurrency = defaultCurrency;
      const key =
        `${invoice.leaseId}_${invoice.periodYear}_${invoice.periodMonth}`;

      const periodEntries = ledgerMap[key] || [];

      /* =========================
         CALCULATE TOTALS
      ========================= */

      let totalCharged = 0;
      let totalPaid = 0;

      for (const entry of periodEntries) {

        if (
          ["rent","utility","damage","late_fee","deposit"]
          .includes(entry.type)
        ) {
          totalCharged += entry.debit || 0;
        }

        if (entry.type === "payment") {
          totalPaid += entry.credit || 0;
        }

      }

      totalCharged = Math.round(totalCharged * 100) / 100;
      totalPaid = Math.round(totalPaid * 100) / 100;

      const balance =
        Math.round(Math.max(totalCharged - totalPaid, 0) * 100) / 100;

      /* =========================
         BUILD RESULT
      ========================= */

      results.push({

  ...invoice,

  currency: invoiceCurrency,

  ledgerCharged: totalCharged,
  ledgerPaid: totalPaid,
  ledgerBalance: balance,

  ledgerStatus:  

          balance <= 0
            ? "PAID"
            : totalPaid > 0
            ? "PARTIAL"
            : "UNPAID"

      });

    }

    /* =========================
       RESPONSE
    ========================= */

    res.json({
      success: true,
      currency: defaultCurrency,
      locale,
      invoices: results
    });

  } catch (err) {

    console.error("INVOICE LIST ERROR:", err);

    res.status(500).json({
      message: "Failed to load invoices"
    });

  }
});
/* =====================================================
   VIEW INVOICE PDF
===================================================== */
router.get("/:id/pdf", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const invoiceId = req.params.id;

    if (!mongoose.isValidObjectId(invoiceId)) {
      return res.status(400).json({
        message: "Invalid invoice id"
      });
    }

    /* ==============================
       LOAD SETTINGS
    ============================== */

    const settings = await Settings.findOne({ ownerId }).lean();

    const defaultCurrency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* ==============================
       LOAD BUSINESS PROFILE
    ============================== */

    const businessSettings =
      await BusinessSettings.findOne({ ownerId }).lean();

    const business = businessSettings
      ? {
          name:
            businessSettings.tradingName ||
            businessSettings.businessName ||
            "",

          address: [
            businessSettings.addressLine1,
            businessSettings.city,
            businessSettings.province
          ]
            .filter(Boolean)
            .join(", "),

          regNumber: businessSettings.registrationNumber,
          vatNumber: businessSettings.vatNumber,
          email: businessSettings.email,
          phone: businessSettings.phone,
          bank: businessSettings.bank || {}
        }
      : {};

    /* ==============================
       LOAD INVOICE
    ============================== */

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      ownerId
    })
      .populate("tenantId", "fullName email address phone leaseStart leaseEnd")
      .lean();

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

   const invoiceCurrency = defaultCurrency;
   

   
    /* ==============================
       LOAD LEDGER ENTRIES
    ============================== */

    const ledgerEntries = await LedgerEntry.find({
      ownerId,
      leaseId: invoice.leaseId,
      periodMonth: invoice.periodMonth,
      periodYear: invoice.periodYear
    })
      .sort({ date: 1, _id: 1 })
      .lean();

    let totalDebit = 0;
    let totalCredit = 0;

    const items = ledgerEntries.map(e => {

      const debit =
        Math.round((e.debit || 0) * 100) / 100;

      const credit =
        Math.round((e.credit || 0) * 100) / 100;

      totalDebit += debit;
      totalCredit += credit;

      const amount = debit - credit;

     return {
  date: new Date(e.date).toLocaleDateString(locale),
  description: e.description || "",
  quantity: 1,
  unitPrice: Math.abs(amount),   // ✅ NUMBER
  vat: null,
  amount: amount                 // ✅ NUMBER
};

    });

    totalDebit =
      Math.round(totalDebit * 100) / 100;

    totalCredit =
      Math.round(totalCredit * 100) / 100;

    const balance =
      Math.round((totalDebit - totalCredit) * 100) / 100;

    /* ==============================
       COMPUTE STATUS
    ============================== */

    const status =
      balance <= 0
        ? "PAID"
        : totalCredit > 0
        ? "PARTIAL"
        : "UNPAID";

    const tenant = invoice.tenantId || {};

   const lease = invoice.leaseId
  ? await Lease.findById(invoice.leaseId)
      .populate("propertyId")
      .lean()
  : null;

    /* ==============================
       GENERATE PDF
    ============================== */

    const pdf = await generateInvoicePDF({

      business,
      invoice,
      tenant,
      lease,

      items,

      status,

      currency: invoiceCurrency,
      locale,
      generatedAt: new Date(),

      totals: {
  charged: totalDebit,
  paid: totalCredit,
  due: balance
}

    });

    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
      "Content-Disposition":
        `inline; filename=invoice-${invoice.invoiceNumber}.pdf`
    });

    return res.end(pdf);

  } catch (err) {

    console.error("INVOICE PDF ERROR:", err);

    res.status(500).json({
      message: "Failed to generate invoice PDF"
    });

  }
});

/* =====================================================
   EMAIL INVOICE
===================================================== */
router.post("/:id/email", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const invoiceId = req.params.id;

    if (!mongoose.isValidObjectId(invoiceId)) {
      return res.status(400).json({
        message: "Invalid invoice id"
      });
    }

    /* ==============================
       LOAD SETTINGS
    ============================== */

    const settings = await Settings.findOne({ ownerId }).lean();

    const defaultCurrency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* ==============================
       LOAD BUSINESS PROFILE
    ============================== */

    const businessSettings =
      await BusinessSettings.findOne({ ownerId }).lean();

    const business = businessSettings
      ? {
          name:
            businessSettings.tradingName ||
            businessSettings.businessName ||
            "",
          address: [
            businessSettings.addressLine1,
            businessSettings.city,
            businessSettings.province
          ]
            .filter(Boolean)
            .join(", "),
          regNumber: businessSettings.registrationNumber,
          vatNumber: businessSettings.vatNumber,
          email: businessSettings.email,
          phone: businessSettings.phone,
          bank: businessSettings.bank || {}
        }
      : {};

    /* ==============================
       LOAD INVOICE
    ============================== */

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      ownerId
    })
      .populate("tenantId", "fullName email address phone leaseStart leaseEnd")
      .lean();

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    if (!invoice?.tenantId?.email) {
      return res.status(400).json({
        message: "Tenant email missing"
      });
    }

    const invoiceCurrency = defaultCurrency;

    /* ==============================
       LOAD LEDGER ENTRIES
    ============================== */

    const ledgerEntries = await LedgerEntry.find({
      ownerId,
      leaseId: invoice.leaseId,
      periodMonth: invoice.periodMonth,
      periodYear: invoice.periodYear
    })
      .sort({ date: 1, _id: 1 })
      .lean();

    let totalDebit = 0;
    let totalCredit = 0;

    const items = ledgerEntries.map(e => {

      const debit =
        Math.round((e.debit || 0) * 100) / 100;

      const credit =
        Math.round((e.credit || 0) * 100) / 100;

      totalDebit += debit;
      totalCredit += credit;

      const amount = debit - credit;

      return {
  date: new Date(e.date).toLocaleDateString(locale),
  description: e.description || "",
  quantity: 1,
  unitPrice: Math.abs(amount),
  vat: null,
  amount: amount
};

    });

    totalDebit =
      Math.round(totalDebit * 100) / 100;

    totalCredit =
      Math.round(totalCredit * 100) / 100;

    const balance =
      Math.round((totalDebit - totalCredit) * 100) / 100;

    /* ==============================
       STATUS
    ============================== */

    const status =
      balance <= 0
        ? "PAID"
        : totalCredit > 0
        ? "PARTIAL"
        : "UNPAID";

    const tenant = invoice.tenantId || {};

    const lease = invoice.leaseId
      ? await Lease.findById(invoice.leaseId)
          .populate("propertyId")
          .lean()
      : null;

    /* ==============================
       GENERATE PDF
    ============================== */

    const pdf = await generateInvoicePDF({
      business,
      invoice,
      tenant,
      lease,
      items,
      status,
      currency: invoiceCurrency,
      locale,
      generatedAt: new Date(),
      totals: {
  charged: totalDebit,
  paid: totalCredit,
  due: balance
}
    });

    /* ==============================
       SEND EMAIL
    ============================== */

    await sendInvoiceEmail({
      to: tenant.email,
      tenantName: tenant.fullName,
      invoiceNumber: invoice.invoiceNumber,
      pdfBuffer: pdf,
      business,
      filename: `invoice-${invoice.invoiceNumber}.pdf`
    });

    res.json({
      success: true,
      message: "Invoice emailed successfully"
    });

  } catch (err) {

    console.error("INVOICE EMAIL ERROR:", err);

    res.status(500).json({
      message: "Failed to email invoice"
    });

  }
});
module.exports = router;
