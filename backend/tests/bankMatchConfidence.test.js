"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateConfidence } = require("../utils/bank/matchConfidence");

test("lease reference with active lease is a high-confidence bank match", () => {
  const score = calculateConfidence({
    tenant: {
      fullName: "QA Tenant",
      phone: "0710000000",
      email: "qa@example.test"
    },
    lease: {
      _id: "lease-1",
      referenceCode: "TMR-QA-UNIT-0000"
    },
    reference: "TMR-QA-UNIT-0000"
  });

  assert.equal(score, 100);
});

test("tenant phone with active lease is a high-confidence bank match", () => {
  const score = calculateConfidence({
    tenant: {
      fullName: "QA Tenant",
      phone: "0710000000",
      email: "qa@example.test"
    },
    lease: {
      _id: "lease-1",
      referenceCode: "TMR-QA-UNIT-0000"
    },
    reference: "0710000000"
  });

  assert.equal(score, 90);
});

test("partial tenant name stays pending for manual review", () => {
  const score = calculateConfidence({
    tenant: {
      fullName: "QA Tenant",
      phone: "0710000000",
      email: "qa@example.test"
    },
    lease: {
      _id: "lease-1",
      referenceCode: "TMR-QA-UNIT-0000"
    },
    reference: "QA"
  });

  assert.equal(score, 55);
});
