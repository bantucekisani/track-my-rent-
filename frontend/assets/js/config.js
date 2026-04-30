// =====================================================
// Track My Rent – Frontend API Config (SAFE & PORTABLE)
// =====================================================

// Resolve an API base that works for both local static servers and
// same-origin production deployments.
function resolveApiUrl() {
  const { protocol, hostname, port, origin } = window.location;
  const isLocalHost =
    hostname === "localhost" || hostname === "127.0.0.1";
  const isStaticDevPort = isLocalHost && port && port !== "5000";

  if (isStaticDevPort) {
    return `${protocol}//${hostname}:5000/api`;
  }

  return `${origin}/api`;
}

window.API_URL = resolveApiUrl();

const APP_PREFERENCES_KEY = "appPreferences";
const DEFAULT_APP_PREFERENCES = {
  currency: "ZAR",
  locale: "en-ZA",
  timezone: "Africa/Johannesburg"
};

function normalizeAppPreferences(preferences = {}) {
  return {
    currency:
      typeof preferences.currency === "string" && preferences.currency
        ? preferences.currency
        : DEFAULT_APP_PREFERENCES.currency,
    locale:
      typeof preferences.locale === "string" && preferences.locale
        ? preferences.locale
        : DEFAULT_APP_PREFERENCES.locale,
    timezone:
      typeof preferences.timezone === "string" && preferences.timezone
        ? preferences.timezone
        : DEFAULT_APP_PREFERENCES.timezone
  };
}

function readStoredAppPreferences() {
  try {
    const raw = localStorage.getItem(APP_PREFERENCES_KEY);

    if (!raw) {
      return { ...DEFAULT_APP_PREFERENCES };
    }

    return normalizeAppPreferences(JSON.parse(raw));
  } catch (error) {
    return { ...DEFAULT_APP_PREFERENCES };
  }
}

function getAppPreferences() {
  return normalizeAppPreferences({
    currency: window.APP_CURRENCY,
    locale: window.APP_LOCALE,
    timezone: window.APP_TIMEZONE
  });
}

function applyAppPreferences(preferences = {}) {
  const current = normalizeAppPreferences({
    ...readStoredAppPreferences(),
    currency: window.APP_CURRENCY,
    locale: window.APP_LOCALE,
    timezone: window.APP_TIMEZONE
  });
  const next = normalizeAppPreferences({ ...current, ...preferences });

  window.APP_CURRENCY = next.currency;
  window.APP_LOCALE = next.locale;
  window.APP_TIMEZONE = next.timezone;

  try {
    localStorage.setItem(APP_PREFERENCES_KEY, JSON.stringify(next));
  } catch (error) {
    // Ignore storage failures and continue with in-memory preferences.
  }

  return next;
}

function formatAppCurrency(value, currencyOverride) {
  const preferences = getAppPreferences();
  const currency = currencyOverride || preferences.currency;
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat(preferences.locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (error) {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatAppNumber(value, options = {}) {
  const preferences = getAppPreferences();
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat(preferences.locale, options).format(amount);
  } catch (error) {
    return String(amount);
  }
}

function formatAppDate(value, options = {}) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const preferences = getAppPreferences();
  const hasExplicitDateOptions = [
    "dateStyle",
    "year",
    "month",
    "day",
    "weekday"
  ].some(option => Object.prototype.hasOwnProperty.call(options, option));

  try {
    return new Intl.DateTimeFormat(preferences.locale, {
      timeZone: preferences.timezone,
      ...(hasExplicitDateOptions
        ? {}
        : {
            year: "numeric",
            month: "short",
            day: "2-digit"
          }),
      ...options
    }).format(date);
  } catch (error) {
    return date.toLocaleDateString();
  }
}

function formatAppDateTime(value, options = {}) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const preferences = getAppPreferences();

  try {
    return new Intl.DateTimeFormat(preferences.locale, {
      timeZone: preferences.timezone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...options
    }).format(date);
  } catch (error) {
    return date.toLocaleString();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

applyAppPreferences(readStoredAppPreferences());

window.getAppPreferences = getAppPreferences;
window.applyAppPreferences = applyAppPreferences;
window.formatAppCurrency = formatAppCurrency;
window.formatAppNumber = formatAppNumber;
window.formatAppDate = formatAppDate;
window.formatAppDateTime = formatAppDateTime;
window.escapeHtml = escapeHtml;

// Optional override (ONLY if needed)
// window.API_OVERRIDE = "http://example.com:5000/api";

if (window.API_OVERRIDE) {
  console.warn("⚠ Using API override:", window.API_OVERRIDE);
}

// Central auth header helper
function authHeader() {
  const user = JSON.parse(localStorage.getItem("user"));
  return user && user.token
    ? { Authorization: `Bearer ${user.token}` }
    : {};
}

// Standard fetch helper (optional but recommended)
async function apiFetch(url, options = {}) {
  const res = await fetch(`${window.API_OVERRIDE || API_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "API request failed");
  }

  return res.json();
}
