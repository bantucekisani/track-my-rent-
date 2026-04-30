const mongoose = require("mongoose");

const LedgerEntrySchema = new mongoose.Schema(
  {
    /* =========================
       MULTI-TENANT OWNER
    ========================= */
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant"
    },

    leaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lease"
    },

    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property"
    },

    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit"
    },

    recurringExpenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecurringExpense"
    },

    /* =========================
       ACCOUNTING DATE
    ========================= */
    date: {
      type: Date,
      required: true
    },

    periodMonth: {
      type: Number, // 0–11
      required: true,
      min: 1,
      max: 12
    },

    periodYear: {
      type: Number,
      required: true,
      min: 2000
    },

    /* =========================
       TRANSACTION TYPE
    ========================= */
    type: {
      type: String,
      enum: [
        "rent",
        "rent_reversal",
        "payment",
        "utility",
        "damage",
        "damage_reversal",
        "expense",
        "late_fee",
        "deposit"  ,
      ],
      required: true
    },

    /* =========================
       ACCOUNTING VALUES
    ========================= */
    debit: {
      type: Number,
      default: 0,
      min: 0
    },

    credit: {
      type: Number,
      default: 0,
      min: 0
    },

    vatAmount: {
      type: Number,
      default: 0,
      min: 0
    },

    netAmount: {
      type: Number,
      default: 0,
      min: 0
    },

    /* =========================
       CURRENCY (GLOBAL SAFE)
    ========================= */
    currency: {
      type: String,
      uppercase: true,
      trim: true,
      default: "ZAR"
    },

    /* =========================
       META
    ========================= */
    reference: {
      type: String,
      trim: true,
      default: ""
    },

    method: {
      type: String,
      trim: true,
      lowercase: true,
      default: "eft"
    },

    description: {
      type: String,
      trim: true
    },

    source: {
      type: String, // manual | auto | import
      trim: true
    }
  },
  { timestamps: true }
);

/* =========================================================
   🔥 PRODUCTION INDEXES
========================================================= */

/* =========================================
   UNIQUE PROTECTIONS
========================================= */

// ✅ ONE rent per lease per month
LedgerEntrySchema.index(
  { ownerId: 1, leaseId: 1, type: 1, periodYear: 1, periodMonth: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "rent" }
  }
);

// ✅ ONE recurring expense per property per month
LedgerEntrySchema.index(
  {
    ownerId: 1,
    recurringExpenseId: 1,
    propertyId: 1,
    periodYear: 1,
    periodMonth: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      type: "expense",
      recurringExpenseId: { $exists: true }
    }
  }
);

// ✅ Prevent duplicate payment imports
LedgerEntrySchema.index(
  { ownerId: 1, type: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "payment",
      reference: { $ne: "" }
    }
  }
);

/* =========================================
   PERFORMANCE INDEXES
========================================= */

// ⚡ Dashboard & payment screens
LedgerEntrySchema.index({
  ownerId: 1,
  type: 1,
  date: -1,
  _id: -1
});

// ⚡ Tenant ledger performance (stable sort support)
LedgerEntrySchema.index({
  ownerId: 1,
  tenantId: 1,
  date: 1,
  _id: 1
});

// ⚡ Accounting period reports (VAT / monthly summaries)
LedgerEntrySchema.index({
  ownerId: 1,
  periodYear: 1,
  periodMonth: 1
});

// ⚡ Lease-level queries
LedgerEntrySchema.index({
  ownerId: 1,
  leaseId: 1
});

module.exports = mongoose.model("LedgerEntry", LedgerEntrySchema);
