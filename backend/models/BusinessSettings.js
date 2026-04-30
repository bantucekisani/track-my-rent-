const mongoose = require("mongoose");

const businessSettingsSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true
    },

    /* =========================
       BUSINESS INFO
    ========================= */
    businessName: { type: String },
    tradingName: { type: String },
    email: { type: String },
    phone: { type: String },

    addressLine1: { type: String },
    city: { type: String },
    province: { type: String },

    registrationNumber: { type: String },
    vatNumber: { type: String },

    logoUrl: { type: String },

    /* =========================
       ✅ BANKING DETAILS (NEW)
    ========================= */
    bank: {
      bankName: { type: String },
      accountName: { type: String },
      accountNumber: { type: String },
      branchCode: { type: String },
      accountType: { type: String }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "BusinessSettings",
  businessSettingsSchema
);
