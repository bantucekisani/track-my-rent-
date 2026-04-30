const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    fullName: { type: String, required: true },
    idNumber: { type: String },
    phone: { type: String, required: true },
    email: { type: String },
    whatsappNumber: { type: String },
    whatsappOptIn: { type: Boolean, default: false },
    preferredNotificationChannel: {
      type: String,
      enum: ["app", "whatsapp", "both"],
      default: "app"
    },

    nationality: String,

    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true
    },

    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true
    },

    rentAmount: { type: Number, required: true },
    depositAmount: { type: Number },

    leaseStart: { type: Date, required: true },
    leaseEnd: { type: Date },
riskLevel: {
  type: String,
  enum: ["LOW", "MEDIUM", "HIGH"],
  default: "LOW"
},

    status: {
      type: String,
      enum: ["active", "moved_out"],
      default: "active"
    },

    employerName: String,
    employerPhone: String,

    emergencyName: String,
    emergencyPhone: String,

    documents: {
      idDocument: String,
      proofOfIncome: String,
      leaseAgreement: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tenant", tenantSchema);
