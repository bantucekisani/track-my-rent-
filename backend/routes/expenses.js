const express = require("express");
const auth = require("../middleware/authMiddleware");

const LedgerEntry = require("../models/LedgerEntry");
const Settings = require("../models/Financial-Settings");
const Property = require("../models/Property");
const RecurringExpense = require("../models/RecurringExpense");
const {
  createRecurringExpenseEntry
} = require("../services/recurringExpenseScheduler");

const mongoose = require("mongoose");

const router = express.Router();

function normalizeExpenseCategory(value) {
  const category = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases = {
    levy: "levies",
    body_corporate_levy: "levies",
    hoa_levy: "levies",
    rates_taxes: "rates",
    rates_and_taxes: "rates",
    tax: "rates",
    taxes: "rates"
  };
  const normalized = aliases[category] || category;
  const allowed = new Set([
    "maintenance",
    "levies",
    "utilities",
    "insurance",
    "cleaning",
    "admin",
    "rates"
  ]);

  return allowed.has(normalized) ? normalized : "";
}

function inferExpenseCategory(entry = {}) {
  const savedCategory = normalizeExpenseCategory(entry.subtype);

  if (savedCategory) {
    return savedCategory;
  }

  const text = String(entry.description || "").toLowerCase();

  if (/lev(y|ies)|body corporate|homeowners association|\bhoa\b/.test(text)) return "levies";
  if (/\brates?\b|\btax(es)?\b/.test(text)) return "rates";
  if (/repair|maintenance|fix|plumb|electric/.test(text)) return "maintenance";
  if (/water|electricity|utility|utilities/.test(text)) return "utilities";
  if (/insurance|insure/.test(text)) return "insurance";
  if (/clean|cleaning/.test(text)) return "cleaning";

  return "admin";
}

/* =====================================================
   CREATE OR UPDATE MONTHLY OWNER EXPENSE
===================================================== */
router.post("/recurring", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const {
      propertyId,
      category,
      amount,
      description,
      startMonth,
      startYear,
      currency: requestCurrency
    } = req.body;

    const expenseCategory = normalizeExpenseCategory(category);
    const amountNumber = Number(amount);
    const monthNumber = Number(startMonth);
    const yearNumber = Number(startYear);

    if (!expenseCategory) {
      return res.status(400).json({
        message: "Invalid recurring expense category"
      });
    }

    if (!amountNumber || isNaN(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        message: "Invalid recurring expense amount"
      });
    }

    if (!mongoose.isValidObjectId(propertyId)) {
      return res.status(400).json({
        message: "Please select a valid property for this recurring expense"
      });
    }

    if (
      !Number.isInteger(monthNumber) ||
      monthNumber < 1 ||
      monthNumber > 12 ||
      !Number.isInteger(yearNumber) ||
      yearNumber < 2000 ||
      yearNumber > 2100
    ) {
      return res.status(400).json({
        message: "Please select a valid start month"
      });
    }

    const property = await Property.findOne({
      _id: propertyId,
      ownerId
    });

    if (!property) {
      return res.status(404).json({
        message: "Property not found"
      });
    }

    const settings = await Settings.findOne({ ownerId }).lean();
    const allowedCurrencies = [
      "ZAR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "NZD"
    ];

    let expenseCurrency =
      (requestCurrency && requestCurrency.toUpperCase()) ||
      settings?.preferences?.currency ||
      "ZAR";

    if (!allowedCurrencies.includes(expenseCurrency)) {
      expenseCurrency = settings?.preferences?.currency || "ZAR";
    }

    const safeAmount = Math.round(amountNumber * 100) / 100;
    const savedDescription =
      String(description || expenseCategory || "Owner expense").trim();

    const recurringExpense = await RecurringExpense.findOneAndUpdate(
      {
        ownerId,
        propertyId,
        category: expenseCategory,
        description: savedDescription,
        active: true
      },
      {
        $set: {
          amount: safeAmount,
          currency: expenseCurrency,
          frequency: "monthly",
          startMonth: monthNumber,
          startYear: yearNumber
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    const entry = await createRecurringExpenseEntry(
      recurringExpense,
      yearNumber,
      monthNumber
    );

    res.status(201).json({
      success: true,
      recurringExpense,
      entry
    });

  } catch (err) {
    console.error("CREATE RECURRING EXPENSE ERROR:", err);
    res.status(500).json({
      message: "Failed to save recurring expense"
    });
  }
});

/* =====================================================
   CREATE EXPENSE (LEDGER DRIVEN + GLOBAL SAFE)
===================================================== */
router.post("/", auth, async (req, res) => {
  try {

    const ownerId = req.user.id;

    const {
      propertyId,
      category,
      amount,
      description,
      date,
      currency: requestCurrency
    } = req.body;
    const expenseCategory = normalizeExpenseCategory(category) || "admin";

    /* ===============================
       VALIDATION
    =============================== */

    const amountNumber = Number(amount);

    if (!amountNumber || isNaN(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        message: "Invalid expense amount"
      });
    }

    if (propertyId && !mongoose.isValidObjectId(propertyId)) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    if (expenseCategory !== "admin" && !propertyId) {
      return res.status(400).json({
        message: "Please select a property for this expense category"
      });
    }

    /* ===============================
       VALIDATE PROPERTY (OPTIONAL)
    =============================== */

    if (propertyId) {
      const property = await Property.findOne({
        _id: propertyId,
        ownerId
      });

      if (!property) {
        return res.status(404).json({
          message: "Property not found"
        });
      }
    }

    /* ===============================
       SETTINGS (CURRENCY + LOCALE)
    =============================== */

    const settings = await Settings.findOne({ ownerId }).lean();

    let expenseCurrency =
      (requestCurrency && requestCurrency.toUpperCase()) ||
      settings?.preferences?.currency ||
      "ZAR";

    const allowedCurrencies = [
      "ZAR","USD","EUR","GBP","AED","AUD","CAD","NZD"
    ];

    if (!allowedCurrencies.includes(expenseCurrency)) {
      expenseCurrency = settings?.preferences?.currency || "ZAR";
    }

    /* ===============================
       DATE + PERIOD SAFE
    =============================== */

    const entryDate = date ? new Date(date) : new Date();

    if (isNaN(entryDate.getTime())) {
      return res.status(400).json({
        message: "Invalid expense date"
      });
    }

    const periodMonth = entryDate.getMonth() + 1;
    const periodYear = entryDate.getFullYear();

    /* ===============================
       SAFE ROUNDING
    =============================== */

    const safeAmount =
      Math.round(amountNumber * 100) / 100;

    /* ===============================
       CREATE LEDGER ENTRY
    =============================== */

    const entry = await LedgerEntry.create({

      ownerId,

      propertyId: propertyId || null,

      type: "expense",
      subtype: expenseCategory,

      description:
        description ||
        expenseCategory ||
        "Expense",

      currency: expenseCurrency,

      date: entryDate,

      periodMonth,
      periodYear,

      debit: safeAmount,   // expense increases cost
      credit: 0,

      source: "manual"

    });

    res.json({
      success: true,
      entry
    });

  } catch (err) {

    console.error("CREATE EXPENSE ERROR:", err);

    res.status(500).json({
      message: "Failed to save expense"
    });

  }
});


/* =====================================================
   LIST EXPENSES (LEDGER DRIVEN)
===================================================== */
router.get("/", auth, async (req, res) => {
  try {

    const ownerId = req.user.id;

    const settings = await Settings.findOne({ ownerId }).lean();

    const locale =
      settings?.preferences?.locale || "en-ZA";

    const expenses = await LedgerEntry.find({
      ownerId,
      type: "expense"
    })
      .sort({ date: -1, _id: -1 })
      .lean();

    const formatted = expenses.map(e => {

      const formatter = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: e.currency || "ZAR"
      });

      return {

        ...e,
        subtype: inferExpenseCategory(e),

        formattedAmount:
          formatter.format(e.debit || 0),

        formattedDate:
          new Date(e.date).toLocaleDateString(locale)

      };

    });

    res.json({
      success: true,
      count: formatted.length,
      expenses: formatted
    });

  } catch (err) {

    console.error("LIST EXPENSE ERROR:", err);

    res.status(500).json({
      message: "Failed to load expenses"
    });

  }
});

module.exports = router;
