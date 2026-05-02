const mongoose = require("mongoose");

const ExpenseSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property"
  },

  category: {
    type: String,
    enum: ["maintenance", "utilities", "rates", "insurance", "cleaning", "admin"],
    required: true
  },

  description: {
    type: String
  },

  amount: {
    type: Number,
    required: true
  },

  date: {
    type: Date,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Expense", ExpenseSchema);
