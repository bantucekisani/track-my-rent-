"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateMonthlyIncomeByProperty,
  calculateProfitLoss,
  calculatePropertyPerformance,
  calculateRentSummary,
  calculateYearlyIncomeTrend,
  filterEntriesByPeriod
} = require("../utils/reportSummaryUtils");

test("filterEntriesByPeriod respects accounting period and property filters", () => {
  const entries = [
    {
      propertyId: "p1",
      periodMonth: 4,
      periodYear: 2026,
      type: "payment",
      credit: 10000
    },
    {
      propertyId: "p1",
      periodMonth: 3,
      periodYear: 2026,
      type: "payment",
      credit: 9000
    },
    {
      propertyId: "p2",
      periodMonth: 4,
      periodYear: 2026,
      type: "payment",
      credit: 7000
    }
  ];

  const filtered = filterEntriesByPeriod(entries, {
    month: 4,
    year: 2026,
    propertyId: "p1"
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].credit, 10000);
});

test("calculateRentSummary totals rent debits and payment credits", () => {
  const summary = calculateRentSummary([
    { type: "rent", debit: 33000 },
    { type: "payment", credit: 10000 },
    { type: "payment", credit: 23000 },
    { type: "deposit", credit: 5000 }
  ]);

  assert.deepEqual(summary, {
    expected: 33000,
    collected: 33000,
    outstanding: 0
  });
});

test("calculateProfitLoss only counts payment income and expense debits", () => {
  const summary = calculateProfitLoss([
    { type: "payment", credit: 60000 },
    { type: "expense", debit: 5000 },
    { type: "maintenance", debit: 2500 },
    { type: "rent", debit: 33000 }
  ]);

  assert.deepEqual(summary, {
    income: 60000,
    expenses: 7500,
    profit: 52500
  });
});

test("calculateMonthlyIncomeByProperty produces rent summaries per property", () => {
  const rows = calculateMonthlyIncomeByProperty(
    [
      { _id: "p1", name: "Alpha" },
      { _id: "p2", name: "Beta" }
    ],
    [
      { propertyId: "p1", type: "rent", debit: 20000 },
      { propertyId: "p1", type: "payment", credit: 15000 },
      { propertyId: "p2", type: "rent", debit: 13000 },
      { propertyId: "p2", type: "payment", credit: 13000 }
    ]
  );

  assert.deepEqual(rows, [
    {
      propertyId: "p1",
      propertyName: "Alpha",
      expected: 20000,
      collected: 15000,
      outstanding: 5000
    },
    {
      propertyId: "p2",
      propertyName: "Beta",
      expected: 13000,
      collected: 13000,
      outstanding: 0
    }
  ]);
});

test("calculatePropertyPerformance combines units, occupancy, and money totals", () => {
  const rows = calculatePropertyPerformance(
    [
      { _id: "p1", name: "Alpha" },
      { _id: "p2", name: "Beta" }
    ],
    [
      { propertyId: "p1" },
      { propertyId: "p1" },
      { propertyId: "p2" }
    ],
    [
      { propertyId: "p1", status: "Active" },
      { propertyId: "p2", status: "Active" }
    ],
    [
      { propertyId: "p1", type: "rent", debit: 20000 },
      { propertyId: "p1", type: "payment", credit: 15000 },
      { propertyId: "p2", type: "rent", debit: 10000 },
      { propertyId: "p2", type: "payment", credit: 10000 }
    ]
  );

  assert.deepEqual(rows, [
    {
      propertyId: "p1",
      propertyName: "Alpha",
      units: 2,
      occupied: 1,
      vacant: 1,
      occupancyPct: 50,
      expected: 20000,
      collected: 15000,
      outstanding: 5000
    },
    {
      propertyId: "p2",
      propertyName: "Beta",
      units: 1,
      occupied: 1,
      vacant: 0,
      occupancyPct: 100,
      expected: 10000,
      collected: 10000,
      outstanding: 0
    }
  ]);
});

test("calculateYearlyIncomeTrend groups profit and loss into all 12 months", () => {
  const months = calculateYearlyIncomeTrend(
    [
      { periodMonth: 1, periodYear: 2026, type: "payment", credit: 20000 },
      { periodMonth: 1, periodYear: 2026, type: "expense", debit: 5000 },
      { periodMonth: 4, periodYear: 2026, type: "payment", credit: 33000 }
    ],
    2026
  );

  assert.equal(months.length, 12);
  assert.deepEqual(months[0], {
    monthIndex: 1,
    income: 20000,
    expenses: 5000,
    profit: 15000
  });
  assert.deepEqual(months[3], {
    monthIndex: 4,
    income: 33000,
    expenses: 0,
    profit: 33000
  });
  assert.deepEqual(months[11], {
    monthIndex: 12,
    income: 0,
    expenses: 0,
    profit: 0
  });
});
