const mongoose = require("mongoose");

const cashflowSummarySchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  period: String, // "2025-09"

  rentBilled: Number,
  rentCollected: Number,

  utilitiesBilled: Number,
  utilitiesCollected: Number,

  damagesBilled: Number,

  netCashflow: Number,

  updatedAt: Date
});

module.exports = mongoose.model("CashflowSummary", cashflowSummarySchema);
