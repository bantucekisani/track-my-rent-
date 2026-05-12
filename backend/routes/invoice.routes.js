const express = require("express");
const auth = require("../middleware/authMiddleware");

const Invoice = require("../models/Invoice");
const LedgerEntry = require("../models/LedgerEntry");
const Settings = require("../models/Financial-Settings");
const Lease = require("../models/Lease");

const sendInvoiceEmail = require("../utils/email/sendInvoiceEmail");
const generateInvoicePDF = require("../utils/pdf/generateInvoicePDF");
const BusinessSettings = require("../models/BusinessSettings");
const { ledgerEntryLabel } = require("../utils/ledgerLabels");

const mongoose = require("mongoose");
const router = express.Router();

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isChargeEntry(entry) {
  return [
    "rent",
    "rent_reversal",
    "utility",
    "utility_reversal",
    "damage",
    "damage_reversal",
    "maintenance",
    "maintenance_reversal",
    "levy",
    "levy_reversal",
    "late_fee",
    "deposit"
  ].includes(entry.type);
}

function invoiceChargeAmount(entry) {
  return roundMoney(Number(entry.debit || 0) - Number(entry.credit || 0));
}

function invoiceChargeLabel(entry) {
  return ledgerEntryLabel(entry) || "Tenant Charge";
}

function mapInvoiceItem(entry, locale) {
  const amount = invoiceChargeAmount(entry);

  return {
    date: new Date(entry.date).toLocaleDateString(locale),
    typeLabel: invoiceChargeLabel(entry),
    description: entry.description || "",
    quantity: 1,
    unitPrice: Math.abs(amount),
    vat: null,
    amount
  };
}

function periodValue({ periodYear, periodMonth } = {}) {
  return Number(periodYear || 0) * 100 + Number(periodMonth || 0);
}

function formatEntryPeriod(entry, locale) {
  const month = Number(entry.periodMonth);
  const year = Number(entry.periodYear);

  if (!Number.isInteger(month) || month < 1 || month > 12 || !year) {
    return "";
  }

  return new Date(year, month - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric"
  });
}

function isSameInvoicePeriod(entry, invoice) {
  return (
    Number(entry.periodMonth) === Number(invoice.periodMonth) &&
    Number(entry.periodYear) === Number(invoice.periodYear)
  );
}

function compareLedgerEntries(a, b) {
  const periodDiff = periodValue(a) - periodValue(b);
  if (periodDiff) return periodDiff;

  const dateDiff = new Date(a.date) - new Date(b.date);
  if (dateDiff) return dateDiff;

  return String(a._id).localeCompare(String(b._id));
}

function calculateRemainingChargeRows(ledgerEntries) {
  let creditPool = 0;
  const remainingRows = [];

  const ordered = (ledgerEntries || [])
    .filter(entry => isChargeEntry(entry) || entry.type === "payment")
    .sort(compareLedgerEntries);

  for (const entry of ordered) {
    if (entry.type === "payment") {
      creditPool = roundMoney(creditPool + Number(entry.credit || 0));
      continue;
    }

    const amount = invoiceChargeAmount(entry);

    if (amount <= 0) {
      creditPool = roundMoney(creditPool + Math.abs(amount));
      continue;
    }

    const applied = Math.min(creditPool, amount);
    creditPool = roundMoney(creditPool - applied);

    remainingRows.push({
      entry,
      originalAmount: amount,
      remainingAmount: roundMoney(amount - applied)
    });
  }

  return remainingRows;
}

async function buildInvoicePdfItemsAndTotals(ownerId, invoice, locale) {
  const leaseLedgerEntries = await LedgerEntry.find({
    ownerId,
    leaseId: invoice.leaseId
  })
    .sort({ periodYear: 1, periodMonth: 1, date: 1, _id: 1 })
    .lean();

  const invoicePeriod = periodValue(invoice);

  const priorOutstandingItems = calculateRemainingChargeRows(leaseLedgerEntries)
    .filter(row => (
      row.remainingAmount > 0.01 &&
      periodValue(row.entry) < invoicePeriod
    ))
    .map(row => {
      const item = mapInvoiceItem(row.entry, locale);
      const periodLabel = formatEntryPeriod(row.entry, locale);

      return {
        ...item,
        typeLabel: `Brought Forward - ${item.typeLabel}`,
        description: [periodLabel, item.description]
          .filter(Boolean)
          .join(" | "),
        unitPrice: row.remainingAmount,
        amount: row.remainingAmount
      };
    });

  const currentItems = leaseLedgerEntries
    .filter(entry => isSameInvoicePeriod(entry, invoice))
    .filter(isChargeEntry)
    .map(entry => mapInvoiceItem(entry, locale));

  const allocatedTotals =
    await getAllocatedInvoiceTotals(ownerId, invoice);

  const priorOutstanding = priorOutstandingItems.reduce(
    (sum, item) => roundMoney(sum + Number(item.amount || 0)),
    0
  );

  const items = [...priorOutstandingItems, ...currentItems];

  if (allocatedTotals.paid > 0) {
    items.push({
      date: "-",
      typeLabel: "Payment",
      description: "Payments allocated to this invoice",
      quantity: 1,
      unitPrice: allocatedTotals.paid,
      vat: null,
      amount: -allocatedTotals.paid
    });
  }

  return {
    items,
    allocatedTotals,
    totals: {
      charged: roundMoney(priorOutstanding + allocatedTotals.charged),
      paid: allocatedTotals.paid,
      due: roundMoney(priorOutstanding + allocatedTotals.balance)
    }
  };
}

function buildInvoiceAllocationMap(invoices, ledgerEntries) {
  const invoicesByLease = new Map();

  for (const invoice of invoices) {
    if (!invoice.leaseId) continue;

    const leaseKey = invoice.leaseId.toString();
    const periodKey = `${leaseKey}_${invoice.periodYear}_${invoice.periodMonth}`;

    if (!invoicesByLease.has(leaseKey)) {
      invoicesByLease.set(leaseKey, new Map());
    }

    invoicesByLease.get(leaseKey).set(periodKey, {
      charged: 0,
      paid: 0,
      invoiceDate: invoice.invoiceDate,
      periodMonth: invoice.periodMonth,
      periodYear: invoice.periodYear
    });
  }

  for (const entry of ledgerEntries) {
    if (!entry.leaseId || !isChargeEntry(entry)) continue;

    const leaseKey = entry.leaseId.toString();
    const periodKey = `${leaseKey}_${entry.periodYear}_${entry.periodMonth}`;
    const leaseInvoices = invoicesByLease.get(leaseKey);
    const invoiceTotals = leaseInvoices?.get(periodKey);

    if (invoiceTotals) {
      invoiceTotals.charged = roundMoney(
        invoiceTotals.charged + invoiceChargeAmount(entry)
      );
    }
  }

  for (const [leaseKey, leaseInvoices] of invoicesByLease.entries()) {
    const payments = ledgerEntries
      .filter(entry => entry.leaseId?.toString() === leaseKey && entry.type === "payment")
      .sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff) return dateDiff;
        return String(a._id).localeCompare(String(b._id));
      });

    const orderedInvoices = [...leaseInvoices.values()]
      .sort((a, b) => {
        if (a.invoiceDate && b.invoiceDate) {
          const dateDiff = new Date(a.invoiceDate) - new Date(b.invoiceDate);
          if (dateDiff) return dateDiff;
        }

        const yearDiff = Number(a.periodYear || 0) - Number(b.periodYear || 0);
        if (yearDiff) return yearDiff;
        return Number(a.periodMonth || 0) - Number(b.periodMonth || 0);
      });

    for (const payment of payments) {
      let remaining = roundMoney(payment.credit || 0);

      for (const invoiceTotals of orderedInvoices) {
        if (remaining <= 0) break;

        const due = roundMoney(invoiceTotals.charged - invoiceTotals.paid);
        if (due <= 0) continue;

        const applied = Math.min(due, remaining);
        invoiceTotals.paid = roundMoney(invoiceTotals.paid + applied);
        remaining = roundMoney(remaining - applied);
      }
    }
  }

  const allocationMap = {};

  for (const [leaseKey, leaseInvoices] of invoicesByLease.entries()) {
    for (const [periodKey, totals] of leaseInvoices.entries()) {
      allocationMap[periodKey] = {
        charged: roundMoney(totals.charged),
        paid: roundMoney(totals.paid),
        balance: roundMoney(Math.max(totals.charged - totals.paid, 0))
      };
    }
  }

  return allocationMap;
}

async function getAllocatedInvoiceTotals(ownerId, invoice) {
  if (!invoice?.leaseId) {
    return { charged: 0, paid: 0, balance: 0 };
  }

  const leaseInvoices = await Invoice.find({
    ownerId,
    leaseId: invoice.leaseId
  }).lean();

  const leaseLedgerEntries = await LedgerEntry.find({
    ownerId,
    leaseId: invoice.leaseId
  }).lean();

  const allocationMap =
    buildInvoiceAllocationMap(leaseInvoices, leaseLedgerEntries);

  const key =
    `${invoice.leaseId}_${invoice.periodYear}_${invoice.periodMonth}`;

  return allocationMap[key] || { charged: 0, paid: 0, balance: 0 };
}

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

    const allocationMap =
      buildInvoiceAllocationMap(invoices, ledgerEntries);

    const results = [];

    for (const invoice of invoices) {

      if (!invoice.leaseId) continue;

      /* =========================
         LOCK INVOICE CURRENCY
      ========================= */

    const invoiceCurrency = defaultCurrency;
      const key =
        `${invoice.leaseId}_${invoice.periodYear}_${invoice.periodMonth}`;

      const totals = allocationMap[key] || {
        charged: 0,
        paid: 0,
        balance: 0
      };

      const totalCharged = totals.charged;
      const totalPaid = totals.paid;
      const balance = totals.balance;

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

    const {
      items,
      allocatedTotals,
      totals
    } = await buildInvoicePdfItemsAndTotals(ownerId, invoice, locale);

    /* ==============================
       COMPUTE STATUS
    ============================== */

    const status =
      totals.due <= 0
        ? "PAID"
        : allocatedTotals.paid > 0
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

      totals

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

    const {
      items,
      allocatedTotals,
      totals
    } = await buildInvoicePdfItemsAndTotals(ownerId, invoice, locale);

    /* ==============================
       STATUS
    ============================== */

    const status =
      totals.due <= 0
        ? "PAID"
        : allocatedTotals.paid > 0
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
      totals
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
