const cron = require("node-cron");
const Lease = require("../models/Lease");
const LedgerEntry = require("../models/LedgerEntry");
const ensureInvoiceForLedger = require("../services/ensureInvoiceForLedger");

/* =========================================================
   CHARGE RENT FOR SPECIFIC MONTH (SAFE – NO DUPLICATES)
========================================================= */
async function chargeRentForMonth(lease, year, month) {
  const exists = await LedgerEntry.findOne({
    ownerId: lease.ownerId,
    leaseId: lease._id,
    type: "rent",
    periodMonth: month,
    periodYear: year
  });

  if (exists) return false;

  const periodStart = new Date(year, month - 1, 1);

  const entry = await LedgerEntry.create({
    ownerId: lease.ownerId,
    tenantId: lease.tenantId,
    leaseId: lease._id,
    propertyId: lease.propertyId,
    unitId: lease.unitId,

    date: periodStart,
    periodMonth: month,
    periodYear: year,

    type: "rent",
    description: `Rent – ${periodStart.toLocaleString("default", {
      month: "long",
      year: "numeric"
    })}`,

    debit: lease.monthlyRent,
    credit: 0,
    source: "auto-catchup"
  });

  await ensureInvoiceForLedger(entry);

  console.log(
    `✔ Rent charged for ${lease._id} → ${month + 1}/${year}`
  );

  return true;
}

/* =========================================================
   CATCH-UP RENT GENERATOR
========================================================= */
async function runCatchUp() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const leases = await Lease.find({ status: "Active" });

  for (const lease of leases) {

    // Find last rent entry for this lease
    const lastRent = await LedgerEntry.findOne({
      leaseId: lease._id,
      type: "rent"
    })
      .sort({ periodYear: -1, periodMonth: -1 })
      .lean();

    let startYear, startMonth;

    if (!lastRent) {
      // First rent ever → start from lease start date
      const leaseStart = new Date(lease.startDate);
      startYear = leaseStart.getFullYear();
      startMonth = leaseStart.getMonth() + 1;
    } else {
      startYear = lastRent.periodYear;
      startMonth = lastRent.periodMonth + 1;

      if (startMonth > 12) {
        startMonth = 1;
        startYear++;
      }
    }

    // Generate all missing months up to current
    while (
      startYear < currentYear ||
      (startYear === currentYear && startMonth <= currentMonth)
    ) {
      await chargeRentForMonth(lease, startYear, startMonth);

      startMonth++;

      if (startMonth > 12) {
        startMonth = 1;
        startYear++;
      }
    }
  }
}

/* =========================================================
   EXPORT SCHEDULER
========================================================= */
module.exports = function startRentScheduler() {

  // 🔥 RUN ON SERVER START
  (async () => {
    console.log("🔄 Running rent catch-up check...");
    await runCatchUp();
  })().catch(console.error);

  // 🔥 RUN 1ST OF EVERY MONTH
  cron.schedule("5 0 1 * *", async () => {
    try {
      console.log("📅 Running scheduled rent catch-up...");
      await runCatchUp();
    } catch (err) {
      console.error("AUTO RENT ERROR:", err);
    }
  });
};
