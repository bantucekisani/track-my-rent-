const LedgerEntry = require("../models/LedgerEntry");

/**
 * Count tenants currently in arrears
 * Arrears = total debit - total credit > 0
 */
async function countTenantsInArrears(ownerId) {
  const results = await LedgerEntry.aggregate([
    { $match: { ownerId } },
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
    { $match: { balance: { $gt: 0.01 } } }
  ]);

  return results.length;
}

module.exports = { countTenantsInArrears };