const mongoose = require("mongoose");

const bankTransactionSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: "BankImportBatch", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    date: { type: Date, required: true },
    amount: { type: Number, required: true }, // positive = incoming
    description: String,
    reference: String,
    rawData: Object,

    matchedTenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    matchedPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    matchConfidence: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["unmatched", "suggested", "matched", "ignored"],
      default: "unmatched"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("BankTransaction", bankTransactionSchema);
