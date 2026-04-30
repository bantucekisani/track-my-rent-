const LedgerEntry = require("../models/LedgerEntry");

/**
 * Get current balance (arrears) for a tenant
 * Balance = SUM(debit - credit)
 */
async function getTenantBalance(ownerId, tenantId) {
  const result = await LedgerEntry.aggregate([
    { $match: { ownerId, tenantId } },
    {
      $group: {
        _id: null,
        balance: {
          $sum: {
            $subtract: [
              { $ifNull: ["$debit", 0] },
              { $ifNull: ["$credit", 0] }
            ]
          }
        }
      }
    }
  ]);

  return result[0]?.balance || 0;
}

/**
 * Get arrears broken down by type (rent, utilities, damages)
 */
async function getTenantArrearsBreakdown(ownerId, tenantId) {
  const entries = await LedgerEntry.aggregate([
    { $match: { ownerId, tenantId } },
    {
      $group: {
        _id: "$type",
        totalDebit: { $sum: { $ifNull: ["$debit", 0] } },
        totalCredit: { $sum: { $ifNull: ["$credit", 0] } }
      }
    },
    {
      $project: {
        type: "$_id",
        balance: { $subtract: ["$totalDebit", "$totalCredit"] }
      }
    },
    { $match: { balance: { $gt: 0 } } }
  ]);

  return entries;
}

/**
 * Get arrears aging (30/60/90+ days)
 * Based only on outstanding debits
 */
async function getArrearsAging(ownerId, tenantId) {
  const now = new Date();

  const entries = await LedgerEntry.find({
    ownerId,
    tenantId,
    debit: { $gt: 0 }
  });

  let aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

  for (const e of entries) {
    const days = Math.floor((now - e.date) / (1000 * 60 * 60 * 24));

    if (days <= 30) aging["0-30"] += e.debit;
    else if (days <= 60) aging["31-60"] += e.debit;
    else if (days <= 90) aging["61-90"] += e.debit;
    else aging["90+"] += e.debit;
  }

  return aging;
}

/**
 * Get all tenants in arrears for a property
 */
async function getPropertyArrears(ownerId, propertyId) {
  const results = await LedgerEntry.aggregate([
    { $match: { ownerId, propertyId } },
    {
      $group: {
        _id: "$tenantId",
        balance: {
          $sum: {
            $subtract: [
              { $ifNull: ["$debit", 0] },
              { $ifNull: ["$credit", 0] }
            ]
          }
        }
      }
    },
    { $match: { balance: { $gt: 0 } } }
  ]);

  return results;
}

module.exports = {
  getTenantBalance,
  getTenantArrearsBreakdown,
  getArrearsAging,
  getPropertyArrears
};