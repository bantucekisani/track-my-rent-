const mongoose = require("mongoose");

const damageSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },

  title: { type: String, required: true },
  description: String,

  reportedDate: { type: Date, default: Date.now },

  liability: {
    type: String,
    enum: ["TENANT", "LANDLORD"],
    required: true
  },

  cost: { type: Number, required: true },

  status: {
    type: String,
    enum: ["REPORTED", "APPROVED", "RESOLVED"],
    default: "REPORTED"
  },

  ledgerPosted: { type: Boolean, default: false },

  notes: String
}, { timestamps: true });

module.exports = mongoose.model("Damage", damageSchema);
