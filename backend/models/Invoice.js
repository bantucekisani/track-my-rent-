const mongoose = require("mongoose");

/* =========================================================
   INVOICE ITEM
   (STRICTLY LEDGER-BOUND)
========================================================= */
const InvoiceItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "rent",
        "utility",
        "damage",
        "maintenance",
        "late_fee"
      ],
      required: true
    },

    ledgerReferenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LedgerEntry",
      required: true
    },

    description: {
      type: String,
      required: true,
      trim: true
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },

    vatRate: {
      type: Number,
      default: 0,
      min: 0
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

/* =========================================================
   INVOICE HEADER
========================================================= */
const InvoiceSchema = new mongoose.Schema(
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
      ref: "Tenant",
      required: true,
      index: true
    },

    leaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lease",
      index: true
    },

    /* =========================
       GLOBAL CURRENCY
    ========================= */
    currency: {
      type: String,
      uppercase: true,
      trim: true,
      default: "ZAR"
    },

    /* =========================
       INVOICE NUMBER
       (UNIQUE PER OWNER)
    ========================= */
    invoiceNumber: {
      type: String,
      required: true,
      trim: true
    },

    invoiceDate: {
      type: Date,
      required: true
    },

    dueDate: {
      type: Date,
      required: true
    },

    /* =========================
       ACCOUNTING PERIOD
    ========================= */
    periodMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      default: function () {
        return this.invoiceDate
          ? this.invoiceDate.getMonth() + 1
          : new Date().getMonth() + 1;
      }
    },

    periodYear: {
      type: Number,
      required: true,
      min: 2000,
      default: function () {
        return this.invoiceDate
          ? this.invoiceDate.getFullYear()
          : new Date().getFullYear();
      }
    },

    /* =========================
       LEDGER-BOUND ITEMS
    ========================= */
    items: {
      type: [InvoiceItemSchema],
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "Invoice must contain at least one item"
      }
    },

    /* =========================
       PDF STORAGE
    ========================= */
    pdfPath: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

/* =========================================================
   🔥 PRODUCTION INDEXES
========================================================= */

/* =========================================
   UNIQUE PROTECTION
========================================= */

// ✅ ONE invoice per lease per month per owner
InvoiceSchema.index(
  {
    ownerId: 1,
    leaseId: 1,
    periodMonth: 1,
    periodYear: 1
  },
  { unique: true }
);

// ✅ Invoice number unique PER OWNER (NOT global)
InvoiceSchema.index(
  {
    ownerId: 1,
    invoiceNumber: 1
  },
  { unique: true }
);

/* =========================================
   PERFORMANCE INDEXES
========================================= */

// ⚡ Tenant invoice screen
InvoiceSchema.index({
  ownerId: 1,
  tenantId: 1,
  invoiceDate: -1
});

// ⚡ Period reports
InvoiceSchema.index({
  ownerId: 1,
  periodYear: 1,
  periodMonth: 1
});

module.exports = mongoose.model("Invoice", InvoiceSchema);
