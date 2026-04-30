const mongoose = require("mongoose");

const BankImportSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  raw: Object, // original CSV / PDF row

  amount: Number,
  currency: {
    type: String,
    trim: true,
    uppercase: true,
    default: "ZAR"
  },
  reference: String,
  date: Date,

  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  leaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Lease" },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },

  confidence: Number, // 0–100
  status: {
    type: String,
    enum: ["pending", "auto_posted", "approved", "rejected"],
    default: "pending"
  },

  createdAt: { type: Date, default: Date.now }
});

BankImportSchema.index({
  ownerId: 1,
  status: 1,
  createdAt: -1
});

module.exports = mongoose.model("BankImport", BankImportSchema);
