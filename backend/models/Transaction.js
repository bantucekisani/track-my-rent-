const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  date: Date,
  description: String,
  reference: String,
  amount: Number,

  matched: { type: Boolean, default: false },

  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  leaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Lease" },

  matchScore: Number, // 0 - 100 confidence score
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);
