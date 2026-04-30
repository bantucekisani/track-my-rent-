const ExchangeRate = require("../models/ExchangeRate");

async function convert(amount, fromCurrency, toCurrency) {

  if (!amount) return 0;

  if (fromCurrency === toCurrency) return amount;

  const rateDoc = await ExchangeRate.findOne({
    baseCurrency: fromCurrency,
    targetCurrency: toCurrency
  });

  // 🔴 If rate missing → do NOT crash dashboard
  if (!rateDoc) {

    console.warn(
      `Missing FX rate ${fromCurrency} → ${toCurrency}`
    );

    return amount; // fallback without conversion
  }

  return amount * rateDoc.rate;
}

module.exports = { convert };