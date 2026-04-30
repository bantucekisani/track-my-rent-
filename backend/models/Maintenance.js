const mongoose = require("mongoose");

const maintenanceSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
  leaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Lease", required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },

  type: {
    type: String,
    enum: ["maintenance", "damage"],
    default: "maintenance"
  },

  title: { type: String, required: true },
  description: String,

  liability: {
    type: String,
    enum: ["TENANT", "LANDLORD"],
    default: "LANDLORD"
  },

  cost: { type: Number, required: true },

  status: {
    type: String,
    enum: ["reported", "approved", "resolved"],
    default: "reported"
  }

}, { timestamps: true });

module.exports = mongoose.model("Maintenance", maintenanceSchema);
