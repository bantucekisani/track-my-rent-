const Invoice = require("../models/Invoice");

const INVOICE_LEDGER_TYPES = new Set([
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
]);

async function ensureInvoiceForLedger(entry) {
  if (!entry.leaseId || !entry.ownerId || !entry.tenantId) return null;
  if (!INVOICE_LEDGER_TYPES.has(entry.type)) return null;

  const date = new Date(entry.date);
  const month =
    Number(entry.periodMonth) || date.getMonth() + 1;
  const year =
    Number(entry.periodYear) || date.getFullYear();

  const invoice = await Invoice.findOneAndUpdate(
    {
      ownerId: entry.ownerId,
      leaseId: entry.leaseId,
      periodMonth: month,
      periodYear: year
    },
    {
      $setOnInsert: {
        ownerId: entry.ownerId,
        tenantId: entry.tenantId,
        leaseId: entry.leaseId,
        invoiceNumber: `INV-${year}-${Date.now()}`,
        invoiceDate: new Date(year, month - 1, 1),
        dueDate: new Date(year, month - 1, 8),
        periodMonth: month,
        periodYear: year,
        items: []
      }
    },
    { upsert: true, new: true }
  );

  return invoice;
}

module.exports = ensureInvoiceForLedger;
