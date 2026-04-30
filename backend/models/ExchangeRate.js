const mongoose = require("mongoose");

const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: {
    type: String,
    required: true
  },
  targetCurrency: {
    type: String,
    required: true
  },
  rate: {
    type: Number,
    required: true
  }
}, { timestamps: true });

exchangeRateSchema.index(
  { baseCurrency: 1, targetCurrency: 1 },
  { unique: true }
);

module.exports = mongoose.model("ExchangeRate", exchangeRateSchema);