const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    /* ======================================================
       FINANCIAL SETTINGS
    ====================================================== */
    financial: {

      /* -----------------------------
         RENT RULES
      ----------------------------- */
      rent: {
        dueDay: { type: Number, default: 1, min: 1, max: 31 },
        gracePeriodDays: { type: Number, default: 0, min: 0 },
        prorateFirstMonth: { type: Boolean, default: true }
      },

      /* -----------------------------
         LATE FEE RULES
      ----------------------------- */
      lateFees: {
        enabled: { type: Boolean, default: true },

        type: {
          type: String,
          enum: ["flat", "percent"],
          default: "percent"
        },

        flatAmount: { type: Number, default: 0, min: 0 },
        percent: { type: Number, default: 0, min: 0 },

        base: {
          type: String,
          enum: ["rent_only", "full_balance"],
          default: "rent_only"
        },

        frequency: {
          type: String,
          enum: ["once", "daily", "weekly"],
          default: "once"
        }
      },

      /* -----------------------------
         PAYMENT RULES
      ----------------------------- */
      payment: {
        allocation: {
          type: String,
          enum: [
            "oldest_first",
            "rent_first",
            "late_fee_first",
            "utilities_first"
          ],
          default: "oldest_first"
        },

        allowPartialPayments: {
          type: Boolean,
          default: true
        }
      },

      /* -----------------------------
         INTEREST RULES
      ----------------------------- */
      interestOnArrearsPercent: {
        type: Number,
        default: 0,
        min: 0
      },

      /* -----------------------------
         ACCOUNTING MODE
      ----------------------------- */
      accountingMode: {
        type: String,
        enum: ["cash", "accrual"],
        default: "cash"
      }
    },

    /* ======================================================
       INVOICE SETTINGS
    ====================================================== */
    invoice: {
      prefix: { type: String, default: "INV-" },
      nextNumber: { type: Number, default: 1001 },

      autoGenerateOnLeaseStart: { type: Boolean, default: true },
      autoGenerateMonthly: { type: Boolean, default: true },

      autoSendEmail: { type: Boolean, default: false },

      footerText: { type: String, default: "" },
      paymentInstructions: { type: String, default: "" }
    },

    /* ======================================================
       UTILITY SETTINGS
    ====================================================== */
    utilities: {
      types: {
        type: [String],
        default: ["water", "electricity", "sewer", "refuse"]
      },

      markupPercent: { type: Number, default: 0, min: 0 },

      autoAllocateToTenants: { type: Boolean, default: true }
    },

    /* ======================================================
       SYSTEM PREFERENCES (GLOBAL READY)
    ====================================================== */
    preferences: {

      /* -----------------------------
         CURRENCY (GLOBAL SUPPORT)
      ----------------------------- */
      currency: {
        type: String,
        enum: [
          "ZAR",
          "USD",
          "EUR",
          "GBP",
          "AUD",
          "CAD",
          "NZD",
          "CHF",
          "SGD",
          "JPY"
        ],
        default: "ZAR"
      },

      /* -----------------------------
         LOCALE (For formatting)
         Example:
         en-ZA = South Africa
         en-US = USA
         en-GB = UK
         de-DE = Germany
      ----------------------------- */
      locale: {
        type: String,
        default: "en-ZA"
      },

      timezone: {
        type: String,
        default: "Africa/Johannesburg"
      },

      dateFormat: {
        type: String,
        enum: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"],
        default: "DD/MM/YYYY"
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);