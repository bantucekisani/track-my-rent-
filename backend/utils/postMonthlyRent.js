const LedgerEntry = require("../models/LedgerEntry");
const Lease = require("../models/Lease");

async function postMonthlyRent(lease, period) {
  // period format: "YYYY-MM"
  if (lease.lastRentPostedFor === period) return;

  // Get last ledger balance
  const lastEntry = await LedgerEntry.findOne({
    tenantId: lease.tenantId
  }).sort({ date: -1 });

  const previousBalance = lastEntry ? lastEntry.balanceAfter : 0;

  const rentAmount = lease.rentAmount; // assumes you already have this
  const newBalance = previousBalance + rentAmount;

  const ledgerEntry = await LedgerEntry.create({
    ownerId: lease.ownerId,
    propertyId: lease.propertyId,
    unitId: lease.unitId,
    tenantId: lease.tenantId,

    date: new Date(`${period}-01`),
    type: "RENT",
    description: `Monthly rent – ${period}`,

    debit: rentAmount,
    credit: 0,
    balanceAfter: newBalance,

    sourceType: "SYSTEM",
    sourceId: lease._id
  });

  lease.lastRentPostedFor = period;
  await lease.save();

  return ledgerEntry;
}

module.exports = postMonthlyRent;
