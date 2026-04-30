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
let currentUser = null;

/* ===============================
   DOM READY
================================ */
document.addEventListener("DOMContentLoaded", () => {

  const stored = localStorage.getItem("user");
  if (!stored) {
    window.location.href = "login.html";
    return;
  }

  currentUser = JSON.parse(stored);

  loadSettings();

  document
    .getElementById("financialSettingsForm")
    .addEventListener("submit", saveFinancialSettings);

  document
    .getElementById("vatEnabled")
    .addEventListener("change", toggleVatOptions);
});


/* ===============================
   LOAD SETTINGS
================================ */
async function loadSettings() {
  try {

    const res = await fetch(`${API_URL}/financial-settings`, {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    const data = await res.json();
    const s = data.settings;

    if (!s) return;

    /* ================= VAT ================= */

    document.getElementById("vatEnabled").checked =
      s.financial?.vatEnabled || false;

    document.getElementById("vatPercent").value =
      s.financial?.vatPercent || 15;

    document.getElementById("vatMode").value =
      s.financial?.vatMode || "exclusive";

    toggleVatOptions();


    /* ================= GLOBAL PREFERENCES ================= */

    document.getElementById("currencySelect").value =
      s.preferences?.currency || "ZAR";

    document.getElementById("localeSelect").value =
      s.preferences?.locale || "en-ZA";

    document.getElementById("timezoneSelect").value =
      s.preferences?.timezone || "Africa/Johannesburg";

    if (window.applyAppPreferences) {
      window.applyAppPreferences(s.preferences || {});
    }

  } catch (err) {
    console.error("LOAD SETTINGS ERROR:", err);
  }
}


/* ===============================
   SAVE SETTINGS
================================ */
async function saveFinancialSettings(e) {

  e.preventDefault();

  const body = {

    financial: {

      vatEnabled: document.getElementById("vatEnabled").checked,

      vatPercent: Number(
        document.getElementById("vatPercent").value
      ),

      vatMode: document.getElementById("vatMode").value
    },

    preferences: {

      currency: document.getElementById("currencySelect").value,

      locale: document.getElementById("localeSelect").value,

      timezone: document.getElementById("timezoneSelect").value
    }
  };

  try {

    const res = await fetch(`${API_URL}/financial-settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      notify(data.message || "Failed to save settings");
      return;
    }

    /* ================= APPLY GLOBALLY ================= */

    if (window.applyAppPreferences) {
      window.applyAppPreferences(body.preferences);
    }

    notify("Financial settings saved successfully");

  } catch (err) {

    console.error("SAVE SETTINGS ERROR:", err);
    notify("Server error");

  }
}


/* ===============================
   VAT TOGGLE
================================ */
function toggleVatOptions() {

  const checkbox = document.getElementById("vatEnabled");
  const vatOptions = document.getElementById("vatOptions");

  vatOptions.classList.toggle("hidden", !checkbox.checked);

}
