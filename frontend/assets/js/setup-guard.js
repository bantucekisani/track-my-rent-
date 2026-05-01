(function initSetupGuard() {
  const DISMISSED_KEY = "setupGuardDismissed";
  const PAGE_NAME = window.location.pathname.split("/").pop() || "dashboard.html";
  const SETUP_PAGES = new Set([
    "properties.html",
    "units.html",
    "tenants.html",
    "leases.html",
    "payments.html"
  ]);

  if (!SETUP_PAGES.has(PAGE_NAME)) {
    return;
  }

  function safeText(value) {
    return window.escapeHtml ? window.escapeHtml(value) : String(value ?? "");
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch (error) {
      return null;
    }
  }

  function withSetupParam(url) {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}setup=1`;
  }

  function getSetupSteps(data) {
    const totals = data?.totals || {};
    const firstPropertyId = totals.firstPropertyId
      ? String(totals.firstPropertyId)
      : "";
    const unitHref = firstPropertyId
      ? `units.html?property=${encodeURIComponent(firstPropertyId)}`
      : "properties.html";

    return [
      {
        key: "property",
        title: "Create a property",
        text: "Start here: add the building, house, rooming property, or flat you manage.",
        href: withSetupParam("properties.html"),
        action: "Add property",
        page: "properties.html",
        target: "#addPropertyBtn",
        done: Number(totals.totalProperties || 0) > 0
      },
      {
        key: "units",
        title: "Add units to that property",
        text: "Next, add each rentable room, flat, cottage, or unit before assigning tenants.",
        href: withSetupParam(unitHref),
        action: "Add unit",
        page: "units.html",
        target: "#addUnitBtn",
        done: Number(totals.totalUnits || 0) > 0
      },
      {
        key: "tenant",
        title: "Add a tenant",
        text: "Create the tenant profile after property and unit structure is ready.",
        href: withSetupParam("tenants.html"),
        action: "Add tenant",
        page: "tenants.html",
        target: "#addTenantBtn",
        done: Number(totals.totalTenants || 0) > 0
      },
      {
        key: "lease",
        title: "Create the lease",
        text: "Link the tenant to the correct property and unit, then set rent and due dates.",
        href: withSetupParam("leases.html"),
        action: "Create lease",
        page: "leases.html",
        target: "#addLeaseBtn",
        done: Number(totals.totalActiveLeases || totals.occupiedUnits || 0) > 0
      },
      {
        key: "payment",
        title: "Record the first payment",
        text: "Once rent is received, record it so statements, arrears, and reports stay accurate.",
        href: withSetupParam("payments.html"),
        action: "Record payment",
        page: "payments.html",
        target: "#addPaymentBtn",
        done:
          Number(totals.totalPayments || 0) > 0 ||
          Number(data?.rent?.collectedThisMonth || 0) > 0
      }
    ];
  }

  function getOrCreateBubble() {
    let bubble = document.getElementById("setupGuardBubble");

    if (!bubble) {
      bubble = document.createElement("aside");
      bubble.id = "setupGuardBubble";
      bubble.className = "setup-guard-bubble hidden";
      bubble.setAttribute("aria-live", "polite");
      document.body.appendChild(bubble);
    }

    return bubble;
  }

  function clearTargetHighlight() {
    document
      .querySelectorAll(".setup-guard-target")
      .forEach(element => element.classList.remove("setup-guard-target"));
  }

  function renderBubble(step, stepNumber, totalSteps) {
    const bubble = getOrCreateBubble();
    const forcedOpen = new URLSearchParams(window.location.search).get("setup") === "1";
    const dismissedStep = localStorage.getItem(DISMISSED_KEY);

    if (!forcedOpen && dismissedStep === step.key) {
      bubble.classList.add("hidden");
      bubble.innerHTML = "";
      return;
    }

    const target = PAGE_NAME === step.page ? document.querySelector(step.target) : null;
    const actionMarkup = target
      ? `<button class="setup-guard-action" type="button" data-setup-action>${safeText(step.action)}</button>`
      : `<a class="setup-guard-action" href="${step.href}">${safeText(step.action)}</a>`;

    clearTargetHighlight();

    if (target) {
      target.classList.add("setup-guard-target");
    }

    bubble.dataset.stepKey = step.key;
    bubble.innerHTML = `
      <button
        class="setup-guard-close"
        type="button"
        aria-label="Hide setup guide"
        data-setup-dismiss
      >&times;</button>
      <span class="setup-guard-kicker">Step ${stepNumber} of ${totalSteps}</span>
      <strong>${safeText(step.title)}</strong>
      <p>${safeText(step.text)}</p>
      ${actionMarkup}
    `;

    bubble.classList.remove("hidden");

    bubble.querySelector("[data-setup-dismiss]")?.addEventListener("click", () => {
      localStorage.setItem(DISMISSED_KEY, step.key);
      clearTargetHighlight();
      bubble.classList.add("hidden");
    });

    bubble.querySelector("[data-setup-action]")?.addEventListener("click", () => {
      target?.click();
    });
  }

  async function start() {
    const user = getStoredUser();

    if (!user?.token || !window.API_URL) {
      return;
    }

    try {
      const res = await fetch(`${window.API_URL}/dashboard/summary`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const steps = getSetupSteps(data);
      const nextStep = steps.find(step => !step.done);

      if (!nextStep) {
        clearTargetHighlight();
        getOrCreateBubble().classList.add("hidden");
        return;
      }

      renderBubble(nextStep, steps.findIndex(step => step.key === nextStep.key) + 1, steps.length);
    } catch (error) {
      console.error("Setup guide failed to load", error);
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
