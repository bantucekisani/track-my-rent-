let currentUser = null;

document.addEventListener("DOMContentLoaded", () => {
  const stored = localStorage.getItem("user");

  if (!stored) {
    window.location.href = "login.html";
    return;
  }

  currentUser = JSON.parse(stored);

  if (!currentUser?.token) {
    window.location.href = "login.html";
    return;
  }

  document.querySelectorAll("[data-plan-button]").forEach(button => {
    button.addEventListener("click", () => upgradePlan(button.dataset.planButton));
  });

  loadSubscription();
});

async function loadSubscription() {
  try {
    const res = await fetch(`${API_URL}/subscription/status`, {
      headers: {
        Authorization: `Bearer ${currentUser.token}`
      }
    });

    if (!res.ok) {
      throw new Error("Subscription status failed");
    }

    const data = await res.json();
    const plan = data.plan || "Free";
    const planLower = plan.toLowerCase();
    const limit = Number(data.maxUnits);

    setText("currentPlanLabel", plan);
    setText("unitsUsedLabel", String(data.unitsUsed ?? 0));
    setText("unitLimitLabel", limit === -1 ? "Unlimited" : String(limit || 2));

    document.querySelectorAll("[data-plan-card]").forEach(card => {
      const cardPlan = card.dataset.planCard.toLowerCase();
      const button = card.querySelector("[data-plan-button]");
      const isCurrent = cardPlan === planLower;

      card.classList.toggle("current", isCurrent);

      if (!button) return;

      if (isCurrent || cardPlan === "free") {
        button.textContent = isCurrent ? "Current Plan" : "Included";
        button.disabled = true;
        button.classList.add("btn-secondary");
        button.classList.remove("btn-primary");
      } else {
        button.textContent = "Upgrade";
        button.disabled = false;
        button.classList.add("btn-primary");
        button.classList.remove("btn-secondary");
      }
    });
  } catch (err) {
    console.error("SUBSCRIPTION STATUS ERROR:", err);
    notify("Could not load subscription status", "warning");
  }
}

async function upgradePlan(plan) {
  if (!plan || plan === "Free") {
    return;
  }

  const proceed = window.confirmAction
    ? await window.confirmAction(`Upgrade to ${plan} plan?`)
    : window.confirm(`Upgrade to ${plan} plan?`);

  if (!proceed) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/subscription/upgrade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify({ plan })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Upgrade failed");
    }

    notify("Subscription updated", "success");
    await loadSubscription();
  } catch (err) {
    console.error("SUBSCRIPTION UPGRADE ERROR:", err);
    notify(err.message || "Upgrade failed", "error");
  }
}

function setText(id, value) {
  const el = document.getElementById(id);

  if (el) {
    el.textContent = value;
  }
}

function logout() {
  if (window.appLogout) {
    window.appLogout();
    return;
  }

  localStorage.clear();
  window.location.href = "login.html";
}

window.logout = logout;
