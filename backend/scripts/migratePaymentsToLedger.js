require("dotenv").config();
const mongoose = require("mongoose");

const Payment = require("../models/Payment");
const LedgerEntry = require("../models/LedgerEntry");

async function migratePayments() {
  console.log("⏳ Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const payments = await Payment.find({});
  console.log(`📄 Payments found: ${payments.length}`);

  for (const p of payments) {
    // 🔐 prevent duplicates
    const exists = await LedgerEntry.findOne({
      leaseId: p.leaseId,
      description: `Rent payment (${p.month} ${p.year})`
    });
    if (exists) continue;

    // 🧮 calculate running balance BEFORE this payment
    const previous = await LedgerEntry.find({
      leaseId: p.leaseId
    }).sort({ date: 1 });

    let balance = 0;
    for (const e of previous) {
      balance += (e.debit || 0) - (e.credit || 0);
    }

    const newBalance = balance - p.amount;

    await LedgerEntry.create({
      ownerId: p.ownerId,
      tenantId: p.tenantId,
      leaseId: p.leaseId,
      propertyId: p.propertyId,
      unitId: p.unitId,

      date: p.paidOn || p.createdAt,
      description: `Rent payment (${p.month} ${p.year})`,

      type: "payment",
      debit: 0,
      credit: p.amount,

      balanceAfter: newBalance
    });
  }

  console.log("✅ PAYMENTS MIGRATION COMPLETE");
  process.exit();
}

migratePayments().catch(err => {
  console.error("❌ PAYMENT MIGRATION FAILED:", err);
  process.exit(1);
});
