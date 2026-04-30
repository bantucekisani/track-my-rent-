const LedgerEntry = require("../models/LedgerEntry");

async function postDamageToLedger(damage) {
  if (damage.ledgerPosted) return;
  if (damage.liability !== "TENANT") return;

  const lastEntry = await LedgerEntry.findOne({
    tenantId: damage.tenantId
  }).sort({ date: -1, createdAt: -1 });

  const previousBalance = lastEntry ? lastEntry.balanceAfter : 0;
  const newBalance = previousBalance + damage.cost;

  const entry = await LedgerEntry.create({
    ownerId: damage.ownerId,
    propertyId: damage.propertyId,
    unitId: damage.unitId,
    tenantId: damage.tenantId,

    date: new Date(),
    type: "DAMAGE",
    description: `Damage: ${damage.title}`,

    debit: damage.cost,
    credit: 0,
    balanceAfter: newBalance,

    sourceType: "MANUAL",
    sourceId: damage._id
  });

  damage.ledgerPosted = true;
  await damage.save();

  return entry;
}

module.exports = postDamageToLedger;
