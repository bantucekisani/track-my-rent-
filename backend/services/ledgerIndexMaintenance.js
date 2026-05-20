const LedgerEntry = require("../models/LedgerEntry");

const RECURRING_EXPENSE_INDEX =
  "ownerId_1_recurringExpenseId_1_propertyId_1_periodYear_1_periodMonth_1";

const RECURRING_EXPENSE_KEY = {
  ownerId: 1,
  recurringExpenseId: 1,
  propertyId: 1,
  periodYear: 1,
  periodMonth: 1
};

const RECURRING_EXPENSE_FILTER = {
  type: "expense",
  recurringExpenseId: { $type: "objectId" }
};

function isRecurringExpenseFilter(filter = {}) {
  return (
    filter.type === RECURRING_EXPENSE_FILTER.type &&
    filter.recurringExpenseId?.$type ===
      RECURRING_EXPENSE_FILTER.recurringExpenseId.$type
  );
}

function isRecurringExpenseKey(key = {}) {
  return JSON.stringify(key) === JSON.stringify(RECURRING_EXPENSE_KEY);
}

async function ensureLedgerIndexes() {
  const collection = LedgerEntry.collection;
  let indexes = [];

  try {
    indexes = await collection.indexes();
  } catch (err) {
    if (err?.codeName !== "NamespaceNotFound") {
      throw err;
    }
  }

  const recurringIndex = indexes.find(index =>
    index.name === RECURRING_EXPENSE_INDEX || isRecurringExpenseKey(index.key)
  );

  if (
    recurringIndex &&
    !isRecurringExpenseFilter(recurringIndex.partialFilterExpression)
  ) {
    await collection.dropIndex(recurringIndex.name);
  }

  await collection.createIndex(RECURRING_EXPENSE_KEY, {
    name: RECURRING_EXPENSE_INDEX,
    unique: true,
    partialFilterExpression: RECURRING_EXPENSE_FILTER
  });
}

module.exports = ensureLedgerIndexes;
