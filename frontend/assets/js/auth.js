document.addEventListener("DOMContentLoaded", () => {
  const registerForm = document.getElementById("registerForm");
  const loginForm = document.getElementById("loginForm");
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  const resetPasswordForm = document.getElementById("resetPasswordForm");
  const normalizeEmail = value => value.trim().toLowerCase();

  function getPostLoginDestination(user) {
    if (user?.role === "admin") {
      return "admin-dashboard.html";
    }

    const tutorials = user?.tutorials || {};
    const onboardingCompleted = tutorials.onboardingCompleted === true;

    return onboardingCompleted
      ? "dashboard.html"
      : "tutorials.html";
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async e => {
      e.preventDefault();

      const fullName = document.getElementById("fullName")?.value.trim() || "";
      const email = normalizeEmail(document.getElementById("email")?.value || "");
      const password = document.getElementById("password")?.value || "";
      const phone = document.getElementById("phone")?.value.trim() || "";
      const businessName =
        document.getElementById("businessName")?.value.trim() || "";

      if (password.length < 8) {
        showMessage("Password must be at least 8 characters long", "error");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            fullName,
            email,
            password,
            phone,
            businessName
          })
        });

        const data = await res.json();

        if (!res.ok) {
          showMessage(data.message || "Registration failed", "error");
          return;
        }

        const userSession = {
          token: data.token,
          ...data.user
        };

        localStorage.setItem("user", JSON.stringify(userSession));
        showMessage("Account created successfully!", "success");
        window.location.href = getPostLoginDestination(userSession);
      } catch (err) {
        console.error(err);
        showMessage("Server error", "error");
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async e => {
      e.preventDefault();

      const email = normalizeEmail(document.getElementById("email").value);
      const password = document.getElementById("password").value;

      try {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
        });

        const data = await res.json();

        if (!res.ok) {
          showMessage(data.message || "Invalid login", "error");
          return;
        }

        const userSession = {
          token: data.token,
          ...data.user
        };

        localStorage.setItem("user", JSON.stringify(userSession));
        window.location.href = getPostLoginDestination(userSession);
      } catch (err) {
        console.error(err);
        showMessage("Server error", "error");
      }
    });
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async e => {
      e.preventDefault();

      const email = normalizeEmail(document.getElementById("email").value);

      try {
        const res = await fetch(`${API_URL}/auth/forgot-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (!res.ok) {
          showMessage(data.message || "Failed to send reset link", "error");
          return;
        }

        showMessage(
          data.message ||
          "If that email exists, a password reset link has been sent.",
          "success"
        );
        window.location.href = "login.html";
      } catch (err) {
        console.error(err);
        showMessage("Server error", "error");
      }
    });
  }

  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async e => {
      e.preventDefault();

      const password = document.getElementById("password").value;
      const confirmPassword = document.getElementById("confirmPassword").value;
      const token = new URLSearchParams(window.location.search).get("token");

      if (!token) {
        showMessage("Reset link is invalid or incomplete", "error");
        return;
      }

      if (password.length < 8) {
        showMessage("Password must be at least 8 characters long", "error");
        return;
      }

      if (password !== confirmPassword) {
        showMessage("Passwords do not match", "error");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/auth/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            token,
            password
          })
        });

        const data = await res.json();

        if (!res.ok) {
          showMessage(data.message || "Failed to reset password", "error");
          return;
        }

        showMessage("Password reset successfully. Please log in.", "success");
        window.location.href = "login.html";
      } catch (err) {
        console.error(err);
        showMessage("Server error", "error");
      }
    });
  }
});

function showMessage(message, type = "info") {
  if (typeof showToast === "function") {
    showToast(message, type);
    return;
  }

  alert(message);
}
