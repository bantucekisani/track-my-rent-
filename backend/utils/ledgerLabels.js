function titleCase(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function subtypeLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const labels = {
    body_corporate: "Body Corporate",
    hoa: "HOA",
    levy: "Levy",
    water: "Water",
    electricity: "Electricity",
    refuse: "Refuse",
    maintenance: "Maintenance"
  };

  return labels[normalized] || titleCase(normalized);
}

function appendDescription(label, entry = {}) {
  const description = String(entry.description || "").trim();

  if (!description) {
    return label;
  }

  const labelCore = label
    .replace(/\s+(charge|reversal)$/i, "")
    .toLowerCase();

  if (labelCore && description.toLowerCase().includes(labelCore)) {
    return description;
  }

  return `${label} - ${description}`;
}

function ledgerEntryLabel(entry = {}) {
  const type = String(entry.type || "").toLowerCase();
  const subtype = subtypeLabel(entry.subtype);

  if (type === "rent") return "Monthly Rent";
  if (type === "rent_reversal") return "Rent Reversal";
  if (type === "payment") return "Payment received";
  if (type === "utility") return subtype ? `${subtype} Charge` : "Utility Charge";
  if (type === "utility_reversal") return subtype ? `${subtype} Reversal` : "Utility Reversal";
  if (type === "levy") {
    if (!subtype || subtype === "Levy") return "Levy Charge";
    return `${subtype} Levy Charge`;
  }
  if (type === "levy_reversal") {
    if (!subtype || subtype === "Levy") return "Levy Reversal";
    return `${subtype} Levy Reversal`;
  }
  if (type === "maintenance") return "Maintenance Charge";
  if (type === "maintenance_reversal") return "Maintenance Reversal";
  if (type === "damage") return "Damage Charge";
  if (type === "damage_reversal") return "Damage Reversal";
  if (type === "late_fee") return "Late Fee";
  if (type === "deposit") return "Security Deposit";
  if (type === "expense") return "Expense";

  return titleCase(type) || "Ledger Entry";
}

function describeLedgerEntry(entry = {}) {
  return appendDescription(ledgerEntryLabel(entry), entry) || "-";
}

module.exports = {
  describeLedgerEntry,
  ledgerEntryLabel,
  subtypeLabel,
  titleCase
};
