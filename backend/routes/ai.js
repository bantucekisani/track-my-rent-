const express = require("express");
const auth = require("../middleware/authMiddleware");
const Tenant = require("../models/Tenant");
const LedgerEntry = require("../models/LedgerEntry");
const { askAI } = require("../services/aiService");

const router = express.Router();

/* =========================================
   AI HELPER – ASK (MONTH-AWARE)
========================================= */
router.post("/ask", auth, async (req, res) => {
  try {
    const { question, year, month } = req.body;
    const ownerId = req.user.id;

    if (!question) {
      return res.status(400).json({ message: "Question required" });
    }

    // 🔐 Default to CURRENT month if not provided
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? now.getMonth(); // 0–11

    const start = new Date(targetYear, targetMonth, 1);
    const end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    /* ============================
       LOAD TENANTS
    ============================ */
    const tenants = await Tenant.find({ ownerId })
      .select("fullName status")
      .lean();

    /* ============================
       LOAD LEDGER (MONTH ONLY)
    ============================ */
    const ledger = await LedgerEntry.find({
      ownerId,
      date: { $gte: start, $lte: end }
    }).lean();

    /* ============================
       CALCULATE PER-TENANT BALANCE
    ============================ */
    const tenantMap = {};

    ledger.forEach(e => {
      const id = String(e.tenantId);
      if (!tenantMap[id]) {
        tenantMap[id] = { charged: 0, paid: 0 };
      }
      tenantMap[id].charged += e.debit || 0;
      tenantMap[id].paid += e.credit || 0;
    });

    /* ============================
       BUILD AI CONTEXT (FACTUAL)
    ============================ */
    const context = `
MONTH: ${start.toLocaleString("default", { month: "long" })} ${targetYear}

TENANT RENT STATUS:
${tenants.map(t => {
  const data = tenantMap[t._id] || { charged: 0, paid: 0 };
  const balance = data.charged - data.paid;

  return `• ${t.fullName}
  - Rent Charged: R${data.charged}
  - Rent Paid: R${data.paid}
  - Balance: R${balance} ${balance > 0 ? "(Arrears)" : balance < 0 ? "(Credit)" : "(Settled)"}`;
}).join("\n")}

TOTALS:
- Total Rent Charged: R${ledger.reduce((s, e) => s + (e.debit || 0), 0)}
- Total Rent Collected: R${ledger.reduce((s, e) => s + (e.credit || 0), 0)}
`;

    // 🤖 Ask AI to EXPLAIN (not calculate)
    const answer = await askAI(context, question);

    res.json({ success: true, answer });

  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ message: "AI error" });
  }
});

module.exports = router;
