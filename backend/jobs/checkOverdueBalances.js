const Ledger = require("../models/LedgerEntry");
const Lease = require("../models/Lease");
const { createNotification } = require("../utils/createNotification");

/**
 * Check overdue balances for ALL active leases
 */
async function checkOverdueBalances() {
  try {
    const activeLeases = await Lease.find({ status: "Active" });

    for (const lease of activeLeases) {
      const ledgerEntries = await Ledger.find({
        leaseId: lease._id
      });

      let totalDebit = 0;
      let totalCredit = 0;

      ledgerEntries.forEach(e => {
        totalDebit += e.debit || 0;
        totalCredit += e.credit || 0;
      });

      const balance = totalDebit - totalCredit;

      if (balance > 0) {
        await createNotification({
          ownerId: lease.ownerId,
          type: "rent_late",
          title: "Outstanding balance",
          message: `Lease has an overdue balance of R${balance.toFixed(2)}`,
          tenantId: lease.tenantId,
          leaseId: lease._id,
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          metadata: {
            balance
          }
        });
      }
    }

    console.log("✅ Overdue balance check completed");
  } catch (err) {
    console.error("❌ Overdue balance check failed:", err.message);
  }
}

module.exports = { checkOverdueBalances };
