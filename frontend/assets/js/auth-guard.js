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
/* =====================================
   AUTH GUARD
===================================== */

function getCurrentUser() {
  const user = localStorage.getItem("user");

  if (!user) return null;

  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
}

/* =====================================
   REQUIRE LOGIN
===================================== */

function requireAuth() {

  const user = getCurrentUser();

  if (!user || !user.token) {

    console.warn("User not logged in");

    window.location.href = "login.html";
    return;
  }

}

/* =====================================
   REQUIRE ADMIN
===================================== */

function requireAdmin() {

  const user = getCurrentUser();

  if (!user || user.role !== "admin") {

    notify("Admin access only");

    window.location.href = "dashboard.html";
    return;
  }

}

/* =====================================
   LOGOUT
===================================== */

function logout() {

  localStorage.removeItem("user");

  window.location.href = "login.html";

}
