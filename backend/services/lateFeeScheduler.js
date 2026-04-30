const cron = require("node-cron");
const mongoose = require("mongoose");

const Lease = require("../models/Lease");
const LedgerEntry = require("../models/LedgerEntry");
const Settings = require("../models/Financial-Settings");

async function runLateFeeCheck() {
  console.log("🔄 Running automatic late fee check...");

  const owners = await Settings.find({});

  for (const ownerSettings of owners) {
    const ownerId = ownerSettings.ownerId;

    const {
      defaultRentDueDay = 1,
      gracePeriodDays = 0,
      defaultLateFeeAmount = 0,
      defaultLateFeePercent = 0
    } = ownerSettings.financial || {};

    if (!defaultLateFeeAmount && !defaultLateFeePercent) continue;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    const maxDay = new Date(year, month, 0).getDate();
    const safeDueDay = Math.min(defaultRentDueDay, maxDay);

    const dueDate = new Date(year, month - 1, safeDueDay);
    dueDate.setDate(dueDate.getDate() + gracePeriodDays);

    if (today <= dueDate) continue;

    const leases = await Lease.find({
      ownerId,
      status: "Active"
    });

    for (const lease of leases) {

      const entries = await LedgerEntry.find({
        ownerId,
        leaseId: lease._id,
        periodMonth: month,
        periodYear: year
      });

      let balance = 0;
      entries.forEach(e => {
        balance += (e.debit || 0) - (e.credit || 0);
      });

      if (balance <= 0) continue;

      const existingLateFee = await LedgerEntry.findOne({
        ownerId,
        leaseId: lease._id,
        type: "late_fee",
        periodMonth: month,
        periodYear: year
      });

      if (existingLateFee) continue;

      let lateFeeAmount = 0;

      if (defaultLateFeeAmount > 0) {
        lateFeeAmount = defaultLateFeeAmount;
      } else if (defaultLateFeePercent > 0) {
        lateFeeAmount = (balance * defaultLateFeePercent) / 100;
      }

      if (lateFeeAmount <= 0) continue;

      await LedgerEntry.create({
        ownerId,
        tenantId: lease.tenantId,
        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        date: new Date(),
        periodMonth: month,
        periodYear: year,
        type: "late_fee",
        description: `Auto late fee ${month + 1}/${year}`,
        debit: Math.round(lateFeeAmount),
        credit: 0,
        source: "auto"
      });

      console.log(`💰 Late fee applied to lease ${lease._id}`);
    }
  }
}

function startLateFeeScheduler() {
  cron.schedule("0 1 * * *", async () => {
    await runLateFeeCheck();
  });

  console.log("✅ Late fee scheduler started (runs daily at 1 AM)");
}

module.exports = startLateFeeScheduler;
