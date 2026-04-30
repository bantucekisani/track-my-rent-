const LedgerEntry = require("../models/LedgerEntry");

async function deductFromDeposit({ tenantId, unitId, propertyId, ownerId, amount, reason }) {
  const lastEntry = await LedgerEntry.findOne({ tenantId })
    .sort({ date: -1, createdAt: -1 });

  const previousBalance = lastEntry ? lastEntry.balanceAfter : 0;
  const newBalance = previousBalance + amount;

  const entry = await LedgerEntry.create({
    ownerId,
    propertyId,
    unitId,
    tenantId,

    date: new Date(),
    type: "DEPOSIT",
    description: `Deposit deduction: ${reason}`,

    debit: amount,
    credit: 0,
    balanceAfter: newBalance,

    sourceType: "SYSTEM"
  });

  return entry;
}

module.exports = deductFromDeposit;
