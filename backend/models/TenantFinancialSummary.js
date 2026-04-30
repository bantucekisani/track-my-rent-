const mongoose = require("mongoose");

const tenantFinancialSummarySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", unique: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },

  currentBalance: Number,
  rentArrears: Number,
  utilityArrears: Number,
  damageArrears: Number,

  averagePaymentDelayDays: Number,
  latePaymentCount: Number,

  lastPaymentDate: Date,
  lastPaymentAmount: Number,

  riskScore: Number, // 0–100 (future AI input)

  updatedAt: Date
});

module.exports = mongoose.model(
  "TenantFinancialSummary",
  tenantFinancialSummarySchema
);
