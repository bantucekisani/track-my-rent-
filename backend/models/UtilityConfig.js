const mongoose = require("mongoose");

const utilityConfigSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },

  utilityType: {
    type: String,
    enum: ["ELECTRICITY", "WATER", "REFUSE", "SEWER", "HOA"],
    required: true
  },

  billingMethod: {
    type: String,
    enum: ["INCLUDED", "FIXED", "METERED"],
    required: true
  },

  fixedAmount: Number,      // if FIXED
  ratePerUnit: Number,      // if METERED (R/kWh, R/kL)

  meterType: {
    type: String,
    enum: ["PREPAID", "POSTPAID", "SHARED"],
    default: "POSTPAID"
  },

  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("UtilityConfig", utilityConfigSchema);
