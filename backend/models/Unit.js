const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true
    },

    unitLabel: {
      type: String,
      required: true,
      trim: true
    },

    floorLevel: String,
    bedrooms: Number,
    bathrooms: Number,
    sizeSqm: Number,

    status: {
      type: String,
      enum: ["Vacant", "Occupied", "Reserved", "Maintenance"],
      default: "Vacant"
    },

    defaultRent: {
      type: Number,
      default: 0
    },

    defaultDeposit: {
      type: Number,
      default: 0
    },

    marketRent: Number,

    utilitiesIncluded: {
      type: [String],
      enum: ["Water", "Electricity", "Refuse", "WiFi"],
      default: []
    },

    notes: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Unit", unitSchema);
