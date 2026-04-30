const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  action: { type: String, required: true }, 
  // CREATE, UPDATE, DELETE, POST_LEDGER, REVERSE_LEDGER

  entityType: String, 
  // TENANT, LEASE, LEDGER, PAYMENT, DAMAGE, UTILITY

  entityId: mongoose.Schema.Types.ObjectId,

  before: Object, // snapshot (optional)
  after: Object,  // snapshot (optional)

  ipAddress: String,
  userAgent: String,

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
