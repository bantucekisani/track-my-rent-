const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },

    type: {
      type: String,
      enum: [
        // Residential
        "house",
        "flat",
        "townhouse",
        "cottage",
        "studio",
        "duplex",
        "residence",
        "room",
        "granny",

        // Multi-unit
        "block",
        "multi_unit",
        "mixed_use",

        // Commercial
        "office",
        "retail",
        "warehouse",
        "industrial",
        "storage",

        // Other
        "other"
      ],
      default: "other"
    },
currency: {
  type: String,
  enum: ["ZAR","USD","EUR","GBP","AUD","CAD","NZD","CHF","SGD","JPY"],
  default: "ZAR"
},
    addressLine1: String,
    addressLine2: String,
    city: String,
    province: String,
    postalCode: String,
    country: { type: String, default: "South Africa" },
    notes: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Property", propertySchema);
