const LedgerEntry = require("../models/LedgerEntry");

async function isDuplicatePayment({
  ownerId,
  tenantId,
  amount,
  date,
  reference
}) {
  const start = new Date(date);
  start.setDate(start.getDate() - 1);

  const end = new Date(date);
  end.setDate(end.getDate() + 1);

  const existing = await LedgerEntry.findOne({
    ownerId,
    tenantId,
    credit: amount,
    date: { $gte: start, $lte: end },
    $or: [
      { reference },
      { description: new RegExp(reference, "i") }
    ]
  });

  return !!existing;
}

module.exports = { isDuplicatePayment };
