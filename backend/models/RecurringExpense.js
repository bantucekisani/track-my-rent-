const mongoose = require("mongoose");

const RecurringExpenseSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },

  category: {
    type: String,
    enum: ["maintenance", "utilities", "levies", "rates", "insurance", "cleaning", "admin"],
    required: true
  },

  description: String,

  amount: { type: Number, required: true },

  currency: {
    type: String,
    uppercase: true,
    trim: true,
    default: "ZAR"
  },

  frequency: {
    type: String,
    enum: ["monthly"],
    default: "monthly"
  },

  startMonth: { type: Number, required: true, min: 1, max: 12 },
  startYear: { type: Number, required: true, min: 2000, max: 2100 },

  active: { type: Boolean, default: true }
}, { timestamps: true });

RecurringExpenseSchema.index({
  ownerId: 1,
  propertyId: 1,
  category: 1,
  description: 1,
  active: 1
});

module.exports = mongoose.model("RecurringExpense", RecurringExpenseSchema);
