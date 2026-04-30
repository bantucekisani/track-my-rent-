const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    /* =========================
       OWNER
    ========================= */
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /* =========================
       NOTIFICATION TYPE
    ========================= */
    type: {
      type: String,
      enum: [
        // 🏠 RENT
        "rent_charge",
        "rent_late",

        // 💧 UTILITIES
        "utility_charge",

        // 🛠 MAINTENANCE
        "maintenance_charge",

        // 💥 DAMAGES
        "damage_charge",

        // 💰 PAYMENTS
        "payment_full",
        "payment_partial",
        "payment_over",

        // 📄 LEASE
        "lease_missing",
        "lease_expiring",

        // ⚙ SYSTEM
        "system",
        "other"
      ],
      required: true,
      default: "system",
      index: true
    },

    /* =========================
       CONTENT
    ========================= */
    title: {
      type: String,
      required: true,
      trim: true
    },

    message: {
      type: String,
      required: true,
      trim: true
    },

    channel: {
      type: String,
      enum: ["app", "whatsapp", "both"],
      default: "app"
    },

    /* =========================
       RELATIONS
    ========================= */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null
    },

    leaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lease",
      default: null
    },

    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      default: null
    },

    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      default: null
    },

    /* =========================
       STATUS
    ========================= */
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },

    deliveryStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "delivered"],
      default: "sent"
    },

    providerMessageId: {
      type: String,
      default: null
    },

    sentAt: {
      type: Date,
      default: null
    },

    failedAt: {
      type: Date,
      default: null
    },

    errorMessage: {
      type: String,
      default: null
    },

    /* =========================
       EXTRA INFO
    ========================= */
    metadata: {
      type: Object,
      default: {}
    }
  },
  {
    timestamps: true // adds createdAt + updatedAt automatically
  }
);

/* =========================
   INDEXES FOR PERFORMANCE
========================= */
notificationSchema.index({ ownerId: 1, isRead: 1 });
notificationSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
