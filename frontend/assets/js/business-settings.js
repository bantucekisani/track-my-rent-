
document.addEventListener("DOMContentLoaded", () => {
  if (typeof API_URL === "undefined") {
    console.error("API_URL is not defined");
    return;
  }

  const form = document.getElementById("settingsForm");

  if (!form) {
    console.error("settingsForm not found in DOM");
    return;
  }

  loadSettings();
  form.addEventListener("submit", saveSettings);
  initBusinessSettingsTutorial();
});

/* ==========================================
   LOAD SETTINGS
========================================== */
async function loadSettings() {
  try {
    const res = await fetch(`${API_URL}/business-settings`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    });

    if (!res.ok) return;

    const data = await res.json();
    if (!data.settings) return;

    const s = data.settings;

    // Business info
    businessName.value = s.businessName || "";
    tradingName.value = s.tradingName || "";
    email.value = s.email || "";
    phone.value = s.phone || "";
    addressLine1.value = s.addressLine1 || "";
    city.value = s.city || "";
    province.value = s.province || "";
    registrationNumber.value = s.registrationNumber || "";
    vatNumber.value = s.vatNumber || "";

    // Banking info
    bankName.value = s.bank?.bankName || "";
    accountName.value = s.bank?.accountName || "";
    accountNumber.value = s.bank?.accountNumber || "";
    branchCode.value = s.bank?.branchCode || "";
    accountType.value = s.bank?.accountType || "";

    // Logo preview
    if (s.logoUrl) {
      document.getElementById("logoPreview").innerHTML =
        `<img src="${API_URL.replace("/api", "")}${s.logoUrl}" />`;
    }

  } catch (err) {
    console.error("Load settings error:", err);
  }
}

/* ==========================================
   SAVE SETTINGS
========================================== */
async function saveSettings(e) {
  e.preventDefault();

  const payload = {
    businessName: businessName.value.trim(),
    tradingName: tradingName.value.trim(),
    email: email.value.trim(),
    phone: phone.value.trim(),
    addressLine1: addressLine1.value.trim(),
    city: city.value.trim(),
    province: province.value.trim(),
    registrationNumber: registrationNumber.value.trim(),
    vatNumber: vatNumber.value.trim(),

    // Banking details
    bank: {
      bankName: bankName.value.trim(),
      accountName: accountName.value.trim(),
      accountNumber: accountNumber.value.trim(),
      branchCode: branchCode.value.trim(),
      accountType: accountType.value.trim()
    }
  };

  try {
    const res = await fetch(`${API_URL}/business-settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      notify("Failed to save business settings", "error");
      return;
    }

    notify("Business settings saved successfully", "success");

  } catch (err) {
    console.error("Save settings error:", err);
  }
}

/* ==========================================
   LOGO UPLOAD
========================================== */
async function uploadLogo() {
  const input = document.getElementById("logoInput");

  if (!input.files.length) {
    notify("Please select a logo file", "warning");
    return;
  }

  const formData = new FormData();
  formData.append("logo", input.files[0]);

  try {
    const res = await fetch(`${API_URL}/upload-logo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`
      },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      notify(data.message || "Logo upload failed", "error");
      return;
    }

    document.getElementById("logoPreview").innerHTML =
      `<img src="${API_URL.replace("/api", "")}${data.logoUrl}" />`;

    notify("Logo uploaded successfully", "success");

  } catch (err) {
    console.error("Logo upload error:", err);
  }
}

document.getElementById("saveBankBtn")
  ?.addEventListener("click", () => {
    saveSettings(new Event("submit"));
  });

/* ==========================================
   AUTH HELPER
========================================== */
function getToken() {
  return window.getStoredToken ? window.getStoredToken() : "";
}

window.uploadLogo = uploadLogo;

function initBusinessSettingsTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("business-settings", "startTutorialBtn");
}






