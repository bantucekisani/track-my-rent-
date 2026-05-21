"use strict";

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function idOf(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "object") {
    if (value._id) {
      return String(value._id);
    }

    if (typeof value.toString === "function") {
      return String(value.toString());
    }
  }

  return String(value);
}

function matchesProperty(entry, propertyId) {
  if (!propertyId) {
    return true;
  }

  return idOf(entry.propertyId) === idOf(propertyId);
}

function entryPeriodMonth(entry) {
  if (entry?.periodMonth !== undefined && entry?.periodMonth !== null) {
    return Number(entry.periodMonth);
  }

  if (entry?.date) {
    return new Date(entry.date).getMonth() + 1;
  }

  return null;
}

function entryPeriodYear(entry) {
  if (entry?.periodYear !== undefined && entry?.periodYear !== null) {
    return Number(entry.periodYear);
  }

  if (entry?.date) {
    return new Date(entry.date).getFullYear();
  }

  return null;
}

function filterEntriesByPeriod(entries, { month, year, propertyId } = {}) {
  return (entries || []).filter(entry => {
    if (month !== undefined && entryPeriodMonth(entry) !== Number(month)) {
      return false;
    }

    if (year !== undefined && entryPeriodYear(entry) !== Number(year)) {
      return false;
    }

    return matchesProperty(entry, propertyId);
  });
}

function calculateRentSummary(entries) {
  const totalsByAccount = new Map();

  function getAccountTotals(entry) {
    const key =
      idOf(entry.tenantId) ||
      idOf(entry.leaseId) ||
      idOf(entry.propertyId) ||
      "unassigned";

    if (!totalsByAccount.has(key)) {
      totalsByAccount.set(key, {
        rent: 0,
        payments: 0
      });
    }

    return totalsByAccount.get(key);
  }

  (entries || []).forEach(entry => {
    if (entry.type === "rent" || entry.type === "rent_reversal") {
      getAccountTotals(entry).rent +=
        toNumber(entry.debit) - toNumber(entry.credit);
    }

    if (entry.type === "payment") {
      getAccountTotals(entry).payments += toNumber(entry.credit);
    }
  });

  let expected = 0;
  let collected = 0;
  let outstanding = 0;
  let cashReceived = 0;
  let credits = 0;

  totalsByAccount.forEach(totals => {
    const rent = Math.max(toNumber(totals.rent), 0);
    const payments = Math.max(toNumber(totals.payments), 0);

    expected += rent;
    collected += Math.min(rent, payments);
    outstanding += Math.max(rent - payments, 0);
    cashReceived += payments;
    credits += Math.max(payments - rent, 0);
  });

  return {
    expected: roundMoney(expected),
    collected: roundMoney(collected),
    outstanding: roundMoney(outstanding),
    cashReceived: roundMoney(cashReceived),
    credits: roundMoney(credits)
  };
}

function calculateProfitLoss(entries) {
  let income = 0;
  let expenses = 0;

  (entries || []).forEach(entry => {
    if (entry.type === "payment") {
      income += toNumber(entry.credit);
    }

    if (
      entry.type === "expense" ||
      (entry.type === "maintenance" && !entry.tenantId)
    ) {
      expenses += toNumber(entry.debit);
    }
  });

  return {
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    profit: roundMoney(income - expenses)
  };
}

function calculateMonthlyIncomeByProperty(properties, entries) {
  return (properties || []).map(property => {
    const propertyEntries = (entries || []).filter(
      entry => idOf(entry.propertyId) === idOf(property._id)
    );
    const summary = calculateRentSummary(propertyEntries);

    return {
      propertyId: idOf(property._id),
      propertyName: property.name || "-",
      expected: summary.expected,
      collected: summary.collected,
      outstanding: summary.outstanding
    };
  });
}

function calculateYearlyIncomeTrend(entries, year) {
  const months = [];

  for (let month = 1; month <= 12; month += 1) {
    const filtered = filterEntriesByPeriod(entries, { month, year });
    const summary = calculateProfitLoss(filtered);

    months.push({
      monthIndex: month,
      income: summary.income,
      expenses: summary.expenses,
      profit: summary.profit
    });
  }

  return months;
}

function calculatePropertyPerformance(properties, units, leases, entries) {
  const unitsByProperty = new Map();
  const leasesByProperty = new Map();

  (units || []).forEach(unit => {
    const key = idOf(unit.propertyId);
    unitsByProperty.set(key, (unitsByProperty.get(key) || 0) + 1);
  });

  (leases || []).forEach(lease => {
    const key = idOf(lease.propertyId);
    leasesByProperty.set(key, (leasesByProperty.get(key) || 0) + 1);
  });

  return (properties || []).map(property => {
    const propertyEntries = (entries || []).filter(
      entry => idOf(entry.propertyId) === idOf(property._id)
    );
    const summary = calculateRentSummary(propertyEntries);
    const totalUnits = unitsByProperty.get(idOf(property._id)) || 0;
    const occupied = leasesByProperty.get(idOf(property._id)) || 0;
    const vacant = Math.max(totalUnits - occupied, 0);

    return {
      propertyId: idOf(property._id),
      propertyName: property.name || "-",
      units: totalUnits,
      occupied,
      vacant,
      occupancyPct: totalUnits
        ? Number(((occupied / totalUnits) * 100).toFixed(1))
        : 0,
      expected: summary.expected,
      collected: summary.collected,
      outstanding: summary.outstanding
    };
  });
}

module.exports = {
  calculateMonthlyIncomeByProperty,
  calculateProfitLoss,
  calculatePropertyPerformance,
  calculateRentSummary,
  calculateYearlyIncomeTrend,
  filterEntriesByPeriod,
  idOf,
  roundMoney
};
