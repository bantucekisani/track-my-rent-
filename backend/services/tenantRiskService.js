const LedgerEntry = require("../models/LedgerEntry");
const Tenant = require("../models/Tenant");
const Lease = require("../models/Lease");

/**
 * Update tenant risk level based on arrears
 * LOW     = no arrears
 * MEDIUM  = arrears up to 2x monthly rent
 * HIGH    = arrears more than 2x monthly rent
 */
async function updateTenantRisk(ownerId, tenantId) {

  // 1️⃣ Get total balance using aggregation (single source of truth)
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

  const balance = result[0]?.balance || 0;

  // 2️⃣ Get lease to determine monthly rent
  const lease = await Lease.findOne({
    ownerId,
    tenantId,
    status: "Active"
  });

  const monthlyRent = lease?.monthlyRent || 0;

  let risk = "LOW";

  if (balance > 0 && monthlyRent > 0) {
    if (balance <= monthlyRent * 2) {
      risk = "MEDIUM";
    } else {
      risk = "HIGH";
    }
  }

  // 3️⃣ Update tenant safely
  await Tenant.findOneAndUpdate(
    { _id: tenantId, ownerId },
    { riskLevel: risk }
  );

  return { balance, risk };
}

module.exports = { updateTenantRisk };