require("dotenv").config();
const mongoose = require("mongoose");

const Lease = require("../models/Lease");
const Payment = require("../models/Payment");
const LedgerEntry = require("../models/LedgerEntry");

(async () => {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // ❌ SAFETY CHECK
    const existing = await LedgerEntry.countDocuments();
    if (existing > 0) {
      console.log("❌ Ledger already has data. Migration aborted.");
      process.exit(0);
    }

    console.log("📄 Migrating leases → ledger (DEBITS)");

    const leases = await Lease.find({ status: "Active" });
    console.log(`Leases found: ${leases.length}`);

    for (const lease of leases) {
      let balance = 0;

      // 1️⃣ Monthly rent charge (DEBIT)
      balance += lease.monthlyRent;

      await LedgerEntry.create({
        ownerId: lease.ownerId,
        tenantId: lease.tenantId,
        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,

        date: lease.startDate || new Date(),
        description: "Opening rent charge",
        type: "rent",

        debit: lease.monthlyRent,
        credit: 0,
        balanceAfter: balance
      });

      // 2️⃣ Payments for this lease
      const payments = await Payment.find({
        leaseId: lease._id
      }).sort({ paidOn: 1 });

      for (const payment of payments) {
        balance -= payment.amount;

        await LedgerEntry.create({
          ownerId: payment.ownerId,
          tenantId: payment.tenantId,
          leaseId: payment.leaseId,
          propertyId: payment.propertyId,
          unitId: payment.unitId,

          date: payment.paidOn || new Date(),
          description: `Rent payment (${payment.month} ${payment.year})`,
          type: "payment",

          debit: 0,
          credit: payment.amount,
          balanceAfter: balance
        });
      }
    }

    console.log("✅ MIGRATION COMPLETE");
    console.log("👉 Ledger is now the source of truth");
    process.exit(0);

  } catch (err) {
    console.error("❌ MIGRATION FAILED:", err);
    process.exit(1);
  }
})();
