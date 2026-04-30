const mongoose = require("mongoose");

const tenantBehaviorSignalsSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", unique: true },

  averageDaysLate: Number,
  missedPayments: Number,
  partialPayments: Number,

  maintenanceFrequency: Number,
  damageIncidents: Number,

  churnRisk: Number, // 0–100

  updatedAt: Date
});

module.exports = mongoose.model(
  "TenantBehaviorSignals",
  tenantBehaviorSignalsSchema
);
