(function initAppUiHelpers() {
  window.notify = function notify(message, type = "info", duration) {
    if (window.showToast) {
      window.showToast(message, type, duration);
      return;
    }

    window.alert(message);
  };

  window.confirmAction = async function confirmAction(message, options = {}) {
    if (window.showConfirmDialog) {
      return window.showConfirmDialog(message, options);
    }

    return window.confirm(message);
  };

  window.getStoredUser = function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  };

  window.getStoredToken = function getStoredToken() {
    return window.getStoredUser()?.token || "";
  };

  window.appLogout = function appLogout(redirectTo = "login.html") {
    localStorage.clear();
    window.location.href = redirectTo;
  };
})();
