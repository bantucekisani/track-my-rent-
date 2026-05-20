const mongoose = require("mongoose");

const utilityBillSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    leaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Lease", required: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },

    utilityType: {
      type: String,
      enum: ["water", "electricity", "refuse", "sewer", "wifi", "other"],
      required: true
    },

    period: { type: String, required: true }, // e.g. "2025-12"
    periodMonth: { type: Number, min: 1, max: 12 },
    periodYear: { type: Number, min: 2000 },

    previousReading: Number,
    currentReading: Number,
    unitsUsed: Number,

    ratePerUnit: Number,
    amount: { type: Number, required: true },
    currency: {
      type: String,
      default: "ZAR",
      uppercase: true,
      trim: true
    },

    description: String,
    notes: String,

    status: {
      type: String,
      enum: ["Posted", "Reversed"],
      default: "Posted"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("UtilityBill", utilityBillSchema);
