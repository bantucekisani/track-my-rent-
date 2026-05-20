"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInvoiceAllocationMap
} = require("../routes/invoice.routes").__test;

test("invoice allocation applies same-period payments before fallback allocation", () => {
  const leaseId = "lease-1";
  const invoices = [
    {
      leaseId,
      periodMonth: 9,
      periodYear: 2026,
      invoiceDate: new Date("2026-09-01T00:00:00.000Z")
    }
  ];

  const ledgerEntries = [
    {
      leaseId,
      type: "rent",
      periodMonth: 8,
      periodYear: 2026,
      debit: 23000,
      credit: 0
    },
    {
      leaseId,
      type: "rent",
      periodMonth: 9,
      periodYear: 2026,
      debit: 23000,
      credit: 0,
      vatAmount: 3000,
      netAmount: 20000
    },
    {
      leaseId,
      type: "damage",
      periodMonth: 9,
      periodYear: 2026,
      debit: 2300,
      credit: 0,
      vatAmount: 300,
      netAmount: 2000
    },
    {
      _id: "payment-1",
      leaseId,
      type: "payment",
      periodMonth: 9,
      periodYear: 2026,
      date: new Date("2026-09-06T00:00:00.000Z"),
      credit: 25300
    }
  ];

  const allocation = buildInvoiceAllocationMap(invoices, ledgerEntries);

  assert.deepEqual(allocation[`${leaseId}_2026_9`], {
    charged: 25300,
    paid: 25300,
    balance: 0,
    vat: 3300,
    net: 22000
  });
});
