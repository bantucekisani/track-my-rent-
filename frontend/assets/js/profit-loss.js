/* ==========================================================
   PROFIT & LOSS – LEDGER BASED (ACCOUNTING SAFE)
========================================================== */

let currentUser = null;
let allLedger = [];

function money(value) {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value);
  }

  return `ZAR ${Number(value || 0).toFixed(2)}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const stored = localStorage.getItem("user");
  if (!stored) return location.href = "login.html";

  currentUser = JSON.parse(stored);
  if (!currentUser.token) return location.href = "login.html";

  await loadLedger();
  setupYearDropdown();

  document.getElementById("plForm").addEventListener("submit", generatePL);
  document.getElementById("plYear").addEventListener("change", buildMonthlyPL);
});

/* ==========================================================
   LOAD LEDGER
========================================================== */
async function loadLedger() {
  const res = await fetch(`${API_URL}/ledger`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });

  const data = await res.json();

  if (window.applyAppPreferences) {
    window.applyAppPreferences({
      currency: data.currency,
      locale: data.locale,
      timezone: data.timezone
    });
  }

  allLedger = data.ledger || [];
}

/* ==========================================================
   DATE RANGE PROFIT & LOSS
========================================================== */
function generatePL(e) {
  e.preventDefault();

  const start = new Date(document.getElementById("startDate").value);
  const end = new Date(document.getElementById("endDate").value);
  end.setHours(23, 59, 59, 999);

  let income = 0;
  let expenses = 0;

  allLedger.forEach(e => {
    if (!e.date) return;
    const d = new Date(e.date);
    if (d < start || d > end) return;

    // 💰 INCOME (LANDLORD)
    if (e.type === "payment") {
      income += e.credit || 0;
    }

    // 💸 EXPENSES (LANDLORD)
    if (e.type === "expense") {
      expenses += e.debit || 0;
    }
  });

  const profit = income - expenses;

  document.getElementById("plIncome").textContent = money(income);
  document.getElementById("plExpenses").textContent = money(expenses);
  document.getElementById("plProfit").textContent = money(profit);

  document.getElementById("plResults").style.display = "block";
}

/* ==========================================================
   MONTHLY BREAKDOWN
========================================================== */
function setupYearDropdown() {
  const yearSel = document.getElementById("plYear");
  const now = new Date().getFullYear();

  yearSel.innerHTML = `<option value="">Select year</option>`;
  for (let y = now - 2; y <= now + 1; y++) {
    yearSel.innerHTML += `<option value="${y}">${y}</option>`;
  }
}

function buildMonthlyPL() {
  const year = Number(document.getElementById("plYear").value);
  if (!year) return;

  const tbody = document.getElementById("monthlyPlBody");
  tbody.innerHTML = "";

  const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  MONTHS.forEach((monthName, monthIndex) => {
    let income = 0;
    let expenses = 0;

    allLedger.forEach(e => {
      if (!e.date) return;
      const d = new Date(e.date);

      if (d.getFullYear() !== year) return;
      if (d.getMonth() !== monthIndex) return;

      if (e.type === "payment") {
        income += e.credit || 0;
      }

      if (e.type === "expense") {
        expenses += e.debit || 0;
      }
    });

    const profit = income - expenses;

    tbody.innerHTML += `
      <tr>
        <td>${monthName}</td>
        <td>${money(income)}</td>
        <td>${money(expenses)}</td>
        <td><strong>${money(profit)}</strong></td>
      </tr>
    `;
  });
}
