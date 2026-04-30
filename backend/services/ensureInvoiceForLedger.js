const Invoice = require("../models/Invoice");

async function ensureInvoiceForLedger(entry) {
  if (!entry.leaseId || !entry.ownerId) return null;

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
