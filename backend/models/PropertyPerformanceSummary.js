const mongoose = require("mongoose");

const propertyPerformanceSummarySchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", unique: true },

  totalUnits: Number,
  occupiedUnits: Number,
  vacancyRate: Number,

  totalRentExpected: Number,
  totalCollected: Number,
  totalArrears: Number,

  utilityRecoveryRate: Number,
  maintenanceCost: Number,

  netIncome: Number,

  updatedAt: Date
});

module.exports = mongoose.model(
  "PropertyPerformanceSummary",
  propertyPerformanceSummarySchema
);
