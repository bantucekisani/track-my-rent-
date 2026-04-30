const LedgerEntry = require("../models/LedgerEntry");

async function postUtilityChargeToLedger(charge) {
  if (charge.ledgerPosted) return;

  const lastEntry = await LedgerEntry.findOne({
    tenantId: charge.tenantId
  }).sort({ date: -1 });

  const previousBalance = lastEntry ? lastEntry.balanceAfter : 0;
  const newBalance = previousBalance + charge.amount;

  const entry = await LedgerEntry.create({
    ownerId: charge.ownerId,
    propertyId: charge.propertyId,
    unitId: charge.unitId,
    tenantId: charge.tenantId,

    date: new Date(`${charge.period}-01`),
    type: charge.utilityType,
    description: `${charge.utilityType} – ${charge.period}`,

    debit: charge.amount,
    credit: 0,
    balanceAfter: newBalance,

    sourceType: "SYSTEM",
    sourceId: charge._id
  });

  charge.ledgerPosted = true;
  await charge.save();

  return entry;
}

module.exports = postUtilityChargeToLedger;
