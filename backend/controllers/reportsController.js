const Payment = require("../models/Payment");
const Charge = require("../models/Charge"); // if you store rent charges

async function buildTenantStatementData(tenant, business) {
  const charges = await Charge.find({ tenantId: tenant._id });
  const payments = await Payment.find({ tenantId: tenant._id });

  let balance = 0;
  let totalCharged = 0;
  let totalPaid = 0;

  const rows = [];

  charges.forEach(c => {
    balance += c.amount;
    totalCharged += c.amount;

    rows.push({
      period: `${c.month} ${c.year}`,
      description: "Rent charged",
      debit: `R${c.amount.toFixed(2)}`,
      credit: "R0.00",
      balance: `R${balance.toFixed(2)}`
    });
  });

  payments.forEach(p => {
    balance -= p.amount;
    totalPaid += p.amount;

    rows.push({
      period: `${p.month} ${p.year}`,
      description: "Rent payment",
      debit: "R0.00",
      credit: `R${p.amount.toFixed(2)}`,
      balance: `R${balance.toFixed(2)}`
    });
  });

  return {
    business,
    tenant: { fullName: tenant.fullName },
    year: new Date().getFullYear(),
    generatedAt: new Date().toLocaleDateString("en-ZA"),
    rows,
    summary: {
      totalCharged: `R${totalCharged.toFixed(2)}`,
      totalPaid: `R${totalPaid.toFixed(2)}`,
      balance: `R${balance.toFixed(2)}`
    }
  };
}

module.exports = buildTenantStatementData;
