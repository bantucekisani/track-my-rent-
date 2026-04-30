const LedgerEntry = require("../models/LedgerEntry");
const Lease = require("../models/Lease");

async function postPaymentToLedger(transaction) {
  if (!transaction.matched || transaction.ledgerPosted) return;

  const lease = await Lease.findById(transaction.leaseId);
  if (!lease) return;

  // Get last ledger balance
  const lastEntry = await LedgerEntry.findOne({
    tenantId: transaction.tenantId
  }).sort({ date: -1 });

  const previousBalance = lastEntry ? lastEntry.balanceAfter : 0;

  const newBalance = previousBalance - transaction.amount;

  const ledgerEntry = await LedgerEntry.create({
    ownerId: transaction.ownerId,
    propertyId: lease.propertyId,
    unitId: lease.unitId,
    tenantId: transaction.tenantId,

    date: transaction.date || new Date(),
    type: "PAYMENT",
    description: `Payment received (${transaction.reference || "Bank"})`,

    debit: 0,
    credit: transaction.amount,
    balanceAfter: newBalance,

    sourceType: "BANK_IMPORT",
    sourceId: transaction._id
  });

  transaction.ledgerPosted = true;
  await transaction.save();

  return ledgerEntry;
}

module.exports = postPaymentToLedger;
