const mongoose = require("mongoose");

const RecurringExpenseSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },

  category: {
    type: String,
    enum: ["utilities", "rates", "insurance", "cleaning", "admin"],
    required: true
  },

  description: String,

  amount: { type: Number, required: true },

  frequency: {
    type: String,
    enum: ["monthly"],
    default: "monthly"
  },

  startMonth: { type: Number, required: true }, // 0–11
  startYear: { type: Number, required: true },

  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("RecurringExpense", RecurringExpenseSchema);
