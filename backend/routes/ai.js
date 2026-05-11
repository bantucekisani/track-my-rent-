const express = require("express");
const auth = require("../middleware/authMiddleware");
const Tenant = require("../models/Tenant");
const LedgerEntry = require("../models/LedgerEntry");
const { askAI } = require("../services/aiService");
const { describeLedgerEntry } = require("../utils/ledgerLabels");

const router = express.Router();

const REVERSAL_TYPES = new Set([
  "rent_reversal",
  "utility_reversal",
  "damage_reversal",
  "maintenance_reversal",
  "levy_reversal"
]);

function money(value) {
  return Number(value || 0).toFixed(2);
}

function monthName(monthNumber) {
  return new Date(2026, Number(monthNumber || 1) - 1, 1)
    .toLocaleString("default", { month: "long" });
}

function normalizeMonth(value, fallback) {
  const month = Number(value);

  if (Number.isInteger(month) && month >= 1 && month <= 12) {
    return month;
  }

  return fallback;
}

function normalizeYear(value, fallback) {
  const year = Number(value);

  if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
    return year;
  }

  return fallback;
}

function createTenantSummary() {
  return {
    totalDebits: 0,
    totalPayments: 0,
    totalReversalCredits: 0,
    balance: 0,
    breakdown: {},
    recent: []
  };
}

function addLedgerEntry(summary, entry) {
  const type = entry.type || "unknown";
  const debit = Number(entry.debit || 0);
  const credit = Number(entry.credit || 0);

  summary.totalDebits += debit;
  summary.balance += debit - credit;

  if (type === "payment") {
    summary.totalPayments += credit;
  } else if (REVERSAL_TYPES.has(type)) {
    summary.totalReversalCredits += credit;
  }

  if (!summary.breakdown[type]) {
    summary.breakdown[type] = { debit: 0, credit: 0, count: 0 };
  }

  summary.breakdown[type].debit += debit;
  summary.breakdown[type].credit += credit;
  summary.breakdown[type].count += 1;
  summary.recent.push(entry);
}

function formatBreakdown(breakdown = {}) {
  const rows = Object.entries(breakdown)
    .filter(([, totals]) => totals.debit || totals.credit)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, totals]) => {
      const parts = [];
      if (totals.debit) parts.push(`debit R${money(totals.debit)}`);
      if (totals.credit) parts.push(`credit R${money(totals.credit)}`);
      return `${type}: ${parts.join(", ")}`;
    });

  return rows.length ? rows.join("; ") : "No activity";
}

function formatRecentEntries(entries = []) {
  return entries
    .slice(-6)
    .map(entry => {
      const date = entry.date
        ? new Date(entry.date).toISOString().slice(0, 10)
        : `${entry.periodYear}-${String(entry.periodMonth || "").padStart(2, "0")}`;
      const amount =
        Number(entry.debit || 0) > 0
          ? `debit R${money(entry.debit)}`
          : `credit R${money(entry.credit)}`;

      return `${date} | ${describeLedgerEntry(entry)} | ${amount}`;
    })
    .join("\n    ");
}

/* =========================================
   AI HELPER - ASK (LEDGER-AWARE)
========================================= */
router.post("/ask", auth, async (req, res) => {
  try {
    const { question, year, month } = req.body;
    const ownerId = req.user.id;

    if (!question) {
      return res.status(400).json({ message: "Question required" });
    }

    const now = new Date();
    const targetYear = normalizeYear(year, now.getFullYear());
    const targetMonth = normalizeMonth(month, now.getMonth() + 1);

    const tenants = await Tenant.find({ ownerId })
      .select("fullName status")
      .lean();

    const ledger = await LedgerEntry.find({
      ownerId,
      tenantId: { $exists: true, $ne: null }
    })
      .select("tenantId leaseId propertyId unitId date periodMonth periodYear type subtype description debit credit")
      .sort({ periodYear: 1, periodMonth: 1, date: 1, _id: 1 })
      .lean();

    const accountMap = {};
    const periodMap = {};

    ledger.forEach(entry => {
      const id = String(entry.tenantId);
      if (!accountMap[id]) accountMap[id] = createTenantSummary();
      addLedgerEntry(accountMap[id], entry);

      if (
        Number(entry.periodYear) === targetYear &&
        Number(entry.periodMonth) === targetMonth
      ) {
        if (!periodMap[id]) periodMap[id] = createTenantSummary();
        addLedgerEntry(periodMap[id], entry);
      }
    });

    const portfolioDebits = ledger.reduce(
      (sum, entry) => sum + Number(entry.debit || 0),
      0
    );
    const portfolioCredits = ledger.reduce(
      (sum, entry) => sum + Number(entry.credit || 0),
      0
    );

    const context = `
CURRENT ACCOUNTING PERIOD: ${monthName(targetMonth)} ${targetYear}

RULES FOR ANSWERING:
- Use all ledger types, not rent only.
- Levies are tenant charges when type = "levy". Include them in balances and arrears.
- Utility, levy, maintenance, damage, deposit, and late_fee debits increase what the tenant owes.
- Payments and reversal credits reduce what the tenant owes.
- Account balance = all debits minus all credits.

TENANT ACCOUNT STATUS:
${tenants.map(t => {
  const account = accountMap[String(t._id)] || createTenantSummary();
  const period = periodMap[String(t._id)] || createTenantSummary();
  const accountBalance = account.balance;
  const periodBalance = period.balance;

  return `- ${t.fullName} (${t.status || "active"})
  Current period debits: R${money(period.totalDebits)}
  Current period payments: R${money(period.totalPayments)}
  Current period reversals/credits: R${money(period.totalReversalCredits)}
  Current period movement: R${money(periodBalance)} ${periodBalance > 0 ? "(Owes)" : periodBalance < 0 ? "(Credit movement)" : "(No movement due)"}
  Current period breakdown: ${formatBreakdown(period.breakdown)}
  Account total debits: R${money(account.totalDebits)}
  Account total payments: R${money(account.totalPayments)}
  Account total reversals/credits: R${money(account.totalReversalCredits)}
  Account balance: R${money(accountBalance)} ${accountBalance > 0 ? "(Arrears)" : accountBalance < 0 ? "(Credit)" : "(Settled)"}
  Account breakdown: ${formatBreakdown(account.breakdown)}
  Recent entries:
    ${formatRecentEntries(account.recent) || "No ledger entries"}`;
}).join("\n")}

TOTALS:
- Portfolio debits: R${money(portfolioDebits)}
- Portfolio credits: R${money(portfolioCredits)}
- Portfolio balance: R${money(portfolioDebits - portfolioCredits)}
`;

    const answer = await askAI(context, question);

    res.json({ success: true, answer });

  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ message: "AI error" });
  }
});

module.exports = router;
