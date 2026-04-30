const mongoose = require("mongoose");

const utilityChargeSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },

  utilityType: String,
  period: String, // "2025-09"

  usage: Number,
  rate: Number,
  amount: { type: Number, required: true },

  ledgerPosted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("UtilityCharge", utilityChargeSchema);
