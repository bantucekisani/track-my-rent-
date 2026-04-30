const mongoose = require("mongoose");

const utilityReadingSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    leaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Lease", required: true },

    utilityType: {
      type: String,
      enum: ["electricity", "water"],
      required: true
    },

    previousReading: { type: Number, required: true },
    currentReading: { type: Number, required: true },

    unitsUsed: { type: Number, required: true },
    ratePerUnit: { type: Number, required: true },
    amount: { type: Number, required: true },

    billingMonth: { type: String },
    billingYear: { type: Number },

    date: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("UtilityReading", utilityReadingSchema);
