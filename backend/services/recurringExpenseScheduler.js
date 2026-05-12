const cron = require("node-cron");

const LedgerEntry = require("../models/LedgerEntry");
const RecurringExpense = require("../models/RecurringExpense");

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleString("en-ZA", {
    month: "long",
    year: "numeric"
  });
}

function periodKey(year, month) {
  return Number(year) * 100 + Number(month);
}

function nextMonth(year, month) {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }

  return { year, month: month + 1 };
}

async function createRecurringExpenseEntry(recurringExpense, year, month) {
  const amount = Math.round(Number(recurringExpense.amount || 0) * 100) / 100;

  if (!amount || amount <= 0) {
    return null;
  }

  const baseDescription =
    String(recurringExpense.description || recurringExpense.category || "Owner expense").trim();
  const entryDate = new Date(year, month - 1, 1);

  return LedgerEntry.findOneAndUpdate(
    {
      ownerId: recurringExpense.ownerId,
      recurringExpenseId: recurringExpense._id,
      propertyId: recurringExpense.propertyId,
      type: "expense",
      periodYear: year,
      periodMonth: month
    },
    {
      $setOnInsert: {
        ownerId: recurringExpense.ownerId,
        recurringExpenseId: recurringExpense._id,
        propertyId: recurringExpense.propertyId,
        type: "expense",
        subtype: recurringExpense.category,
        description: `${baseDescription} - ${monthLabel(year, month)}`,
        currency: recurringExpense.currency || "ZAR",
        date: entryDate,
        periodYear: year,
        periodMonth: month,
        debit: amount,
        credit: 0,
        source: "recurring-expense"
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
}

async function runRecurringExpensesUntilCurrent() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentKey = periodKey(currentYear, currentMonth);

  const recurringExpenses = await RecurringExpense.find({
    active: true,
    frequency: "monthly"
  });

  for (const recurringExpense of recurringExpenses) {
    let year = Number(recurringExpense.startYear);
    let month = Number(recurringExpense.startMonth);
    let safety = 0;

    while (periodKey(year, month) <= currentKey && safety < 240) {
      await createRecurringExpenseEntry(recurringExpense, year, month);
      ({ year, month } = nextMonth(year, month));
      safety += 1;
    }
  }
}

function startRecurringExpenseScheduler() {
  runRecurringExpensesUntilCurrent().catch(err => {
    console.error("RECURRING EXPENSE STARTUP ERROR:", err);
  });

  cron.schedule("10 0 1 * *", () => {
    runRecurringExpensesUntilCurrent().catch(err => {
      console.error("RECURRING EXPENSE SCHEDULER ERROR:", err);
    });
  });
}

module.exports = startRecurringExpenseScheduler;
module.exports.createRecurringExpenseEntry = createRecurringExpenseEntry;
module.exports.runRecurringExpensesUntilCurrent = runRecurringExpensesUntilCurrent;
