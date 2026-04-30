const mongoose = require("mongoose");

const LeaseSchema = new mongoose.Schema(
  {
    /* =====================
       OWNERSHIP
    ====================== */
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /* =====================
       RELATIONS
    ====================== */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },

    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true
    },

    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
      index: true
    },

    /* =====================
       LEASE TERMS
    ====================== */
    leaseStart: {
      type: Date,
      required: true
    },

    leaseEnd: {
      type: Date
    },

    monthlyRent: {
      type: Number,
      required: true,
      min: 0
    },

    deposit: {
      type: Number,
      default: 0,
      min: 0
    },

    escalationPercent: {
      type: Number,
      default: 0,
      min: 0
    },

    paymentDueDay: {
      type: Number,
      default: 1,
      min: 1,
      max: 31
    },

    /* =====================
       PAYMENT REFERENCE
    ====================== */
    referenceCode: {
      type: String,
      required: true
    },

    /* =====================
       DIGITAL SIGNATURES
    ====================== */
    tenantSignatureUrl: String,
    landlordSignatureUrl: String,

    signedAt: Date,

    isSigned: {
      type: Boolean,
      default: false
    },

    /* =====================
       EMAIL SIGNING
    ====================== */
    signToken: String,
    signTokenExpires: Date,
    signedByIp: String,
    signedByUserAgent: String,

    /* =====================
       STATUS
    ====================== */
    status: {
      type: String,
      enum: ["Active", "Ended", "Cancelled"],
      default: "Active",
      index: true
    }
  },
  {
    timestamps: true
  }
);

/* =========================
   🔥 PRODUCTION INDEXES
========================= */

// ✅ One reference code per owner
LeaseSchema.index(
  { ownerId: 1, referenceCode: 1 },
  { unique: true }
);

// ✅ Only ONE active lease per unit per owner
LeaseSchema.index(
  { ownerId: 1, unitId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "Active" }
  }
);

// ⚡ Dashboards / reports
LeaseSchema.index({ ownerId: 1, status: 1 });
LeaseSchema.index({ ownerId: 1, tenantId: 1 });

module.exports = mongoose.model("Lease", LeaseSchema);
