function notify(message, type = "info") {
  if (window.showToast) {
    window.showToast(message, type);
    return;
  }

  window.alert(message);
}

function confirmAction(message) {
  return window.confirm(message);
}
/* ==========================================================
   TENANT PROFILE PAGE (LEDGER-BASED)
========================================================== */

let currentUser = null;
let tenantId = null;

let tenant = null;
let lease = null;
let ledger = [];
let payments = [];
let maintenance = [];
let damages = [];
let utilities = [];
let internalNote = "";

const PAYMENT_METHOD_LABELS = {
  eft: "EFT",
  cash: "Cash",
  card: "Card",
  other: "Other",
  bank_import: "Bank Import",
  "bank import": "Bank Import",
  bank_import_review: "Bank Import",
  "bank import review": "Bank Import"
};

function money(value) {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value);
  }

  return `ZAR ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value, options = {}) {
  if (window.formatAppDate) {
    return window.formatAppDate(value, options);
  }

  return value ? new Date(value).toLocaleDateString() : "-";
}

function safeText(value, fallback = "-") {
  const text =
    value === undefined || value === null || value === ""
      ? fallback
      : String(value);

  return window.escapeHtml ? window.escapeHtml(text) : text;
}

function formatPaymentMethod(method, source = "") {
  const normalized =
    typeof method === "string" && method.trim()
      ? method.trim().toLowerCase()
      : typeof source === "string" && source.trim()
      ? source.trim().toLowerCase()
      : "eft";

  if (PAYMENT_METHOD_LABELS[normalized]) {
    return PAYMENT_METHOD_LABELS[normalized];
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatAccountingPeriod(entry) {
  if (entry?.periodMonth && entry?.periodYear) {
    const periodDate = new Date(Number(entry.periodYear), Number(entry.periodMonth) - 1, 1);

    if (!Number.isNaN(periodDate.getTime())) {
      return periodDate.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
      });
    }
  }

  return entry?.description || "Payment received";
}

function getPaymentReference(entry) {
  return entry?.reference || lease?.referenceCode || "-";
}

function filePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tenant";
}

function normalizeWhatsAppNumber(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0")) {
    digits = `27${digits.slice(1)}`;
  }

  return digits;
}

function getRollingBalance() {
  return ledger.reduce(
    (sum, entry) =>
      sum + Number(entry.debit || 0) - Number(entry.credit || 0),
    0
  );
}

function buildTenantWhatsAppReminderUrl() {
  const phone = tenant?.whatsappNumber || tenant?.phone || "";
  const normalizedPhone = normalizeWhatsAppNumber(phone);

  if (!normalizedPhone) {
    return "";
  }

  const balance = Math.max(getRollingBalance(), 0);
  const propertyUnit = [
    tenant?.propertyId?.name,
    tenant?.unitId?.unitLabel
  ]
    .filter(Boolean)
    .join(" / ");
  const amountText = balance > 0 ? money(balance) : "your rent account";
  const message = [
    `Hi ${tenant?.fullName || "there"},`,
    "this is a rent reminder from Track My Rent.",
    balance > 0
      ? `Our records show ${amountText} outstanding${propertyUnit ? ` for ${propertyUnit}` : ""}.`
      : `Please remember to keep ${amountText} up to date${propertyUnit ? ` for ${propertyUnit}` : ""}.`,
    "Please contact us if you have already paid. Thank you."
  ].join(" ");

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

async function fetchTenantStatementPdfBlob() {
  const res = await fetch(`${API_URL}/tenants/${tenantId}/statement/pdf`, {
    headers: {
      Authorization: `Bearer ${currentUser.token}`
    }
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Failed to generate tenant statement PDF");
  }

  const blob = await res.blob();

  if (blob.type !== "application/pdf") {
    throw new Error("Server did not return a PDF");
  }

  return blob;
}

async function sharePdfBlob(blob, filename, shareText) {
  const file = new File([blob], filename, { type: "application/pdf" });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title: filename.replace(/-/g, " ").replace(/\.pdf$/i, ""),
      text: shareText,
      files: [file]
    });
    return;
  }

  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(shareText).catch(() => {});
  }

  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 60_000);

  notify("Statement opened. Share text copied where supported.");
}

/* ==========================================================
   INIT
========================================================== */
document.addEventListener("DOMContentLoaded", () => {
  const stored = localStorage.getItem("user");
  if (!stored) {
    window.location.href = "login.html";
    return;
  }

  currentUser = JSON.parse(stored);
  if (!currentUser.token) {
    window.location.href = "login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  tenantId = params.get("id");

  if (!tenantId) {
    notify("Tenant not specified");
    window.location.href = "tenants.html";
    return;
  }

  loadTenantProfile();
});

/* ==========================================================
   LOAD PROFILE DATA
========================================================== */
async function loadTenantProfile() {
  try {
    const res = await fetch(`${API_URL}/tenants/${tenantId}/profile`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error("Failed to load tenant");

    if (window.applyAppPreferences) {
      window.applyAppPreferences({
        currency: data.currency,
        locale: data.locale,
        timezone: data.timezone
      });
    }

    tenant = data.tenant;
    lease = data.lease || null;

    // Keep ledger entries in chronological order
    ledger = (data.recentLedger || []).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    maintenance = data.maintenance || [];
    internalNote = data.internalNote || "";

    renderTenantInfo();
    renderLeaseSummary();
    renderFinancialSnapshot();
    renderPayments();
    renderMaintenance();
    renderDamages();
    renderUtilities();
    renderInternalNotes();

  } catch (err) {
    console.error("Tenant profile error:", err);
    notify("Failed to load tenant profile");
  }
}

/* ==========================================================
   BASIC INFO
========================================================== */
function renderTenantInfo() {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "-";
  };

  setText("tenantName", tenant?.fullName);
  setText("tenantIdNumber", tenant?.idNumber);
  setText("tenantPhone", tenant?.phone);
  setText("tenantEmail", tenant?.email);
  setText("tenantWhatsapp", tenant?.whatsappNumber || tenant?.phone);
  setText(
    "tenantNotificationChannel",
    tenant?.whatsappOptIn
      ? (tenant?.preferredNotificationChannel || "app")
      : "app only"
  );
  setText("tenantProperty", tenant?.propertyId?.name);
  setText("tenantUnit", tenant?.unitId?.unitLabel);
  setText("tenantLeaseRef", lease?.referenceCode);

  // Only update status badge if it exists in HTML
  const statusEl = document.getElementById("tenantStatus");

  if (statusEl) {
    if (lease?.status === "Active") {
      statusEl.textContent = "Active";
      statusEl.className = "status-badge status-active";
    } else {
      statusEl.textContent = "Inactive";
      statusEl.className = "status-badge status-inactive";
    }
  }
}

/* ==========================================================
   LEASE SUMMARY
========================================================== */
function renderLeaseSummary() {
  if (!lease) return;

  document.getElementById("monthlyRent").textContent =
    money(lease.monthlyRent || 0);

  document.getElementById("depositAmount").textContent =
    money(lease.deposit || 0);

  const start = lease.leaseStart ? new Date(lease.leaseStart) : null;
  const end = lease.leaseEnd ? new Date(lease.leaseEnd) : null;

  const periodEl = document.getElementById("leasePeriod");

  if (start && end) {
    periodEl.textContent =
      `${formatDate(start)} -> ${formatDate(end)}`;
  } else if (start) {
    periodEl.textContent =
      `${formatDate(start)} -> Ongoing`;
  } else {
    periodEl.textContent = "-";
  }
}

/* ==========================================================
   FINANCIAL SNAPSHOT (LEDGER)
========================================================== */
function renderFinancialSnapshot() {
  if (!ledger.length) return;

  const now = new Date();
  const currentYear = now.getFullYear();

  let totalDebit = 0;
  let totalCredit = 0;
  let ytdDebit = 0;
  let ytdCredit = 0;

  ledger.forEach(e => {
    const debit = Number(e.debit || 0);
    const credit = Number(e.credit || 0);

    totalDebit += debit;
    totalCredit += credit;

    const entryYear = new Date(e.date).getFullYear();
    if (entryYear === currentYear) {
      ytdDebit += debit;
      ytdCredit += credit;
    }
  });

  const outstandingYTD = Math.max(ytdDebit - ytdCredit, 0);
  const rollingBalance = Math.max(totalDebit - totalCredit, 0);

  document.getElementById("expectedYTD").textContent =
    money(ytdDebit);

  document.getElementById("paidYTD").textContent =
    money(ytdCredit);

  document.getElementById("outstandingAmount").textContent =
    money(outstandingYTD);

  document.getElementById("rollingBalance").textContent =
    money(rollingBalance);

  const lastPayment = ledger
    .filter(e => e.credit > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  document.getElementById("lastPaymentDate").textContent =
    lastPayment
      ? formatDate(lastPayment.date)
      : "-";

 updateRiskBadge(rollingBalance);
renderArrearsAgeing();
}
function updateRiskBadge(balance) {
  const badge = document.getElementById("tenantRiskBadge");
  if (!badge) return;

  let risk = "LOW";
  let className = "risk-low";

  if (balance > 0 && balance <= (lease?.monthlyRent || 0) * 2) {
    risk = "MEDIUM";
    className = "risk-medium";
  }

  if (balance > (lease?.monthlyRent || 0) * 2) {
    risk = "HIGH";
    className = "risk-high";
  }

  badge.textContent = `${risk} RISK`;
  badge.className = `status-badge ${className}`;
}
function renderArrearsAgeing() {
  if (!ledger.length) return;

  const today = new Date();

  // Clone ledger so we don't mutate original
  const entries = ledger
    .map(e => ({
      ...e,
      debit: Number(e.debit || 0),
      credit: Number(e.credit || 0),
      remaining: Number(e.debit || 0)
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Apply credits FIFO
  entries.forEach(entry => {
    if (entry.credit > 0) {
      let creditLeft = entry.credit;

      for (let d of entries) {
        if (d.remaining > 0 && creditLeft > 0) {
          const applied = Math.min(d.remaining, creditLeft);
          d.remaining -= applied;
          creditLeft -= applied;
        }
      }
    }
  });

  let age30 = 0;
  let age60 = 0;
  let age90 = 0;
  let ageOver90 = 0;

  entries.forEach(entry => {
    if (entry.remaining > 0) {
      const entryDate = new Date(entry.date);
      const daysOld = Math.floor(
        (today - entryDate) / (1000 * 60 * 60 * 24)
      );

      if (daysOld <= 30) age30 += entry.remaining;
      else if (daysOld <= 60) age60 += entry.remaining;
      else if (daysOld <= 90) age90 += entry.remaining;
      else ageOver90 += entry.remaining;
    }
  });

  document.getElementById("age30").textContent = money(age30);
  document.getElementById("age60").textContent = money(age60);
  document.getElementById("age90").textContent = money(age90);
  document.getElementById("ageOver90").textContent = money(ageOver90);
}  
/* ==========================================================
   PAYMENT HISTORY
========================================================== */
function renderPayments() {
  const tbody = document.getElementById("paymentHistoryBody");
  tbody.innerHTML = "";

  const paymentEntries = ledger
    .filter(e => e.credit > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!paymentEntries.length) {
    tbody.innerHTML =
      `<tr><td colspan="5" class="empty-row">No payments</td></tr>`;
    return;
  }

  paymentEntries.forEach(p => {
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(p.date)}</td>
        <td>${safeText(formatAccountingPeriod(p))}</td>
        <td>${money(Number(p.credit || 0))}</td>
        <td>${safeText(formatPaymentMethod(p.method, p.source))}</td>
        <td>${safeText(getPaymentReference(p))}</td>
      </tr>
    `;
  });
}


/* ==========================================================
   TENANT STATEMENT
========================================================== */
function generateStatement() {
  if (!ledger.length) return;

  const tbody = document.getElementById("tenantStatementBody");
  const summary = document.getElementById("statementSummary");
  tbody.innerHTML = "";

  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

   ledger.forEach(e => {
    const debit = Number(e.debit || 0);
    const credit = Number(e.credit || 0);

    balance += debit - credit;
    totalDebit += debit;
    totalCredit += credit;

    let label = e.description || "";

    // Make labels cleaner
    if (e.type === "rent") label = "Monthly Rent";
    if (e.type === "payment") label = "Payment received";
    if (e.type === "utility")
      label = `${(e.subtype || "Utility").toUpperCase()} charge`;
    if (e.type === "damage") label = "Damage charge";
    if (e.type === "damage_reversal") label = "Damage reversal";

    tbody.innerHTML += `
      <tr>
        <td>${formatDate(e.date)}</td>
        <td>${safeText(label)}</td>
        <td>${money(debit)}</td>
        <td>${money(credit)}</td>
        <td>${money(balance)}</td>
      </tr>
    `;
  });

  summary.textContent =
    `Total Debits: ${money(totalDebit)} | ` +
    `Total Credits: ${money(totalCredit)} | ` +
    `Closing Balance: ${money(balance)}`;
}

/* ==========================================================
   MAINTENANCE
========================================================== */
function renderMaintenance() {
  const tbody = document.getElementById("maintenanceBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!maintenance.length) {
    tbody.innerHTML =
      `<tr><td colspan="3" class="empty-row">No maintenance</td></tr>`;
    return;
  }

  maintenance.forEach(m => {
    const issue =
      m.issue ||
      m.title ||
      m.description ||
      "Maintenance reported";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(m.createdAt)}</td>
      <td>${safeText(issue)}</td>
      <td>${safeText(m.status)}</td>
    `;
    tbody.appendChild(tr);
  });
}


/* ==========================================================
   DAMAGES
========================================================== */
function renderDamages() {
  const tbody = document.getElementById("damagesBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const damageEntries = ledger.filter(
    e => e.type === "damage" || e.type === "damage_reversal"
  );

  if (!damageEntries.length) {
    tbody.innerHTML =
      `<tr><td colspan="3" class="empty-row">No damages</td></tr>`;
    return;
  }

  damageEntries.forEach(d => {
    const isReversal = d.type === "damage_reversal";
    const amount = Number(isReversal ? d.credit : d.debit);

    tbody.innerHTML += `
      <tr>
        <td>${formatDate(d.date)}</td>
        <td>
          ${safeText(`${isReversal ? "Reversal: " : ""}${d.description || "Tenant damage"}`)}
        </td>
        <td>
          ${isReversal ? "-" : ""}${money(amount)}
        </td>
      </tr>
    `;
  });
}


/* ==========================================================
   UTILITIES
========================================================== */
function renderUtilities() {
  const tbody = document.getElementById("utilitiesBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const utilityEntries = ledger.filter(e => e.type === "utility");

  if (!utilityEntries.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="empty-row">No utilities</td></tr>`;
    return;
  }

  utilityEntries.forEach(u => {
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(u.date, { year: "numeric", month: "short" })}</td>
        <td>${safeText(u.subtype)}</td>
        <td>${money(Number(u.debit || 0))}</td>
        <td>${safeText(u.description)}</td>
      </tr>
    `;
  });
}



/* ==========================================================
   INTERNAL NOTES
========================================================== */
function renderInternalNotes() {
  const textarea = document.getElementById("tenantNotes");
  if (textarea) textarea.value = internalNote;
}

async function saveTenantNotes() {
  const content = document.getElementById("tenantNotes").value;

  await fetch(`${API_URL}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ tenantId, content })
  });

  notify("Notes saved");
}
window.saveTenantNotes = saveTenantNotes;

function sendWhatsAppReminder() {
  if (!tenant) {
    notify("Tenant not loaded yet", "warning");
    return;
  }

  if (!tenant.whatsappOptIn) {
    const proceed = confirmAction(
      "This tenant has not been marked as opted in for WhatsApp reminders. Continue anyway?"
    );

    if (!proceed) {
      return;
    }
  }

  const url = buildTenantWhatsAppReminderUrl();

  if (!url) {
    notify("No WhatsApp or phone number is saved for this tenant", "warning");
    return;
  }

  window.open(url, "_blank", "noopener");
}

function exportStatementCSV() {
  if (!ledger.length) {
    notify("No statement data to export", "warning");
    return;
  }

  let balance = 0;
  const rows = ledger.map(entry => {
    const debit = Number(entry.debit || 0);
    const credit = Number(entry.credit || 0);

    balance += debit - credit;

    return {
      Date: formatDate(entry.date),
      Description: describeLedgerEntryForProfile(entry),
      Debit: debit.toFixed(2),
      Credit: credit.toFixed(2),
      Balance: balance.toFixed(2)
    };
  });

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(row =>
      headers
        .map(header => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `tenant-statement-${filePart(tenant?.fullName)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function describeLedgerEntryForProfile(entry) {
  if (entry.type === "rent") return "Monthly Rent";
  if (entry.type === "payment") return "Payment received";
  if (entry.type === "utility") return `${(entry.subtype || "Utility").toUpperCase()} charge`;
  if (entry.type === "damage") return "Damage charge";
  if (entry.type === "damage_reversal") return "Damage reversal";

  return entry.description || "-";
}

async function exportTenantStatementPDF() {
  if (!tenantId) {
    notify("Tenant not specified");
    return;
  }

  try {
    const blob = await fetchTenantStatementPdfBlob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, "_blank");

    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 60_000);
  } catch (err) {
    console.error("TENANT PROFILE PDF ERROR:", err);
    notify(err.message || "PDF export failed");
  }
}

async function shareTenantStatement() {
  if (!tenantId) {
    notify("Tenant not specified");
    return;
  }

  try {
    const blob = await fetchTenantStatementPdfBlob();
    const filename = `tenant-statement-${filePart(tenant?.fullName)}.pdf`;
    const shareText = `Tenant statement for ${tenant?.fullName || "tenant"}.`;

    await sharePdfBlob(blob, filename, shareText);
  } catch (err) {
    console.error("TENANT STATEMENT SHARE ERROR:", err);
    notify(err.message || "Failed to share statement");
  }
}

async function exportPaymentHistoryPDF() {
  if (!tenantId) {
    notify("Tenant not specified");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/tenants/${tenantId}/payments/pdf`, {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    if (!res.ok) {
      let message = "Failed to generate payment history PDF";

      try {
        const data = await res.json();
        message = data.message || message;
      } catch {}

      notify(message);
      return;
    }

    const blob = await res.blob();

    if (blob.type !== "application/pdf") {
      notify("Server did not return a PDF");
      return;
    }

    const url = window.URL.createObjectURL(blob);
    window.open(url, "_blank");

    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 60_000);
  } catch (err) {
    console.error("PAYMENT HISTORY PDF ERROR:", err);
    notify("Payment history PDF export failed");
  }
}



/* ==========================================================
   LOGOUT
========================================================== */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}
window.logout = logout;
window.sendWhatsAppReminder = sendWhatsAppReminder;
window.exportStatementCSV = exportStatementCSV;
window.exportTenantStatementPDF = exportTenantStatementPDF;
window.shareTenantStatement = shareTenantStatement;
window.exportPaymentHistoryPDF = exportPaymentHistoryPDF;



