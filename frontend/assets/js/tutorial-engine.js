const TutorialEngine = (() => {
  const state = {
    tutorialId: "",
    steps: [],
    currentStepIndex: 0,
    completedSteps: [],
    token: null,
    apiBase: null,
    listenersBound: false,
    activeTarget: null,
    lastFocusedElement: null
  };

  const elements = {
    overlay: null,
    tooltip: null,
    title: null,
    text: null,
    stepCount: null,
    progressBar: null,
    backBtn: null,
    nextBtn: null,
    skipBtn: null,
    closeBtn: null,
    missingNote: null
  };

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  }

  function getToken() {
    return state.token || getStoredUser()?.token || null;
  }

  function getApiBase() {
    return state.apiBase || window.API_URL || "";
  }

  function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      tutorial: params.get("tutorial"),
      autostart: params.get("autostart")
    };
  }

  function isOpen() {
    return Boolean(elements.tooltip && !elements.tooltip.classList.contains("hidden"));
  }

  function getFocusableElements() {
    if (!elements.tooltip) {
      return [];
    }

    return Array.from(
      elements.tooltip.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function trapFocus(event) {
    const focusable = getFocusableElements();

    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function clearHighlight() {
    state.activeTarget = null;

    document
      .querySelectorAll(".tutorial-highlight")
      .forEach(el => el.classList.remove("tutorial-highlight"));
  }

  function getStepTarget(step) {
    if (!step?.target) {
      return null;
    }

    const target = document.querySelector(step.target);

    if (!target) {
      return null;
    }

    return target.getClientRects().length ? target : null;
  }

  function centerTooltip() {
    elements.tooltip.classList.add("tutorial-tooltip-centered");
    elements.tooltip.style.top = "50%";
    elements.tooltip.style.left = "50%";
  }

  function positionTooltip(target) {
    if (!target) {
      centerTooltip();
      return;
    }

    const rect = target.getBoundingClientRect();
    const tooltipWidth = Math.min(360, window.innerWidth - 24);
    const tooltipHeight = elements.tooltip.offsetHeight || 260;
    const gap = 18;

    let top = rect.top;
    let left = rect.right + gap;

    elements.tooltip.classList.remove("tutorial-tooltip-centered");

    if (left + tooltipWidth > window.innerWidth - 12) {
      left = rect.left - tooltipWidth - gap;
    }

    if (left < 12) {
      left = rect.left;
    }

    if (left + tooltipWidth > window.innerWidth - 12 || left < 12) {
      left = Math.max(12, Math.min(rect.left, window.innerWidth - tooltipWidth - 12));
      top = rect.bottom + gap;
    }

    if (top + tooltipHeight > window.innerHeight - 12) {
      top = rect.top - tooltipHeight - gap;
    }

    if (top < 12) {
      top = Math.max(12, Math.min(rect.top, window.innerHeight - tooltipHeight - 12));
    }

    elements.tooltip.style.top = `${top}px`;
    elements.tooltip.style.left = `${left}px`;
  }

  async function waitForLayout() {
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  async function runBeforeShow(step) {
    const actions = Array.isArray(step?.beforeShow)
      ? step.beforeShow
      : step?.beforeShow
        ? [step.beforeShow]
        : [];

    for (const action of actions) {
      let handler = null;

      if (typeof action === "function") {
        handler = action;
      } else if (typeof action === "string" && typeof window[action] === "function") {
        handler = window[action];
      }

      if (!handler) {
        continue;
      }

      try {
        const result = handler(step, state);

        if (result && typeof result.then === "function") {
          await result;
        }
      } catch (error) {
        console.warn("Tutorial step action failed:", action, error);
      }
    }

    await waitForLayout();
  }

  function bindElements() {
    elements.overlay = document.getElementById("tutorialOverlay");
    elements.tooltip = document.getElementById("tutorialTooltip");
    elements.title = document.getElementById("tutorialTitle");
    elements.text = document.getElementById("tutorialText");
    elements.stepCount = document.getElementById("tutorialStepCount");
    elements.progressBar = document.getElementById("tutorialProgressBar");
    elements.backBtn = document.getElementById("tutorialBack");
    elements.nextBtn = document.getElementById("tutorialNext");
    elements.skipBtn = document.getElementById("tutorialSkip");
    elements.closeBtn = document.getElementById("tutorialClose");
    elements.missingNote = document.getElementById("tutorialMissingNote");
  }

  async function fetchState() {
    const token = getToken();

    if (!token) {
      return null;
    }

    try {
      const res = await fetch(`${getApiBase()}/tutorials/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      return data.tutorials || null;
    } catch (err) {
      console.error("Failed to load tutorial state:", err);
      return null;
    }
  }

  async function saveProgress(isCompleted = false, dismissed = false) {
    const step = state.steps[state.currentStepIndex];
    const token = getToken();

    if (!step || !token) {
      return;
    }

    try {
      const tutorialState = await fetchState();
      const existingCompletedSteps = Array.isArray(tutorialState?.completedSteps)
        ? tutorialState.completedSteps
        : [];

      const mergedCompletedSteps = [
        ...new Set([...existingCompletedSteps, ...state.completedSteps])
      ];

      await fetch(`${getApiBase()}/tutorials/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          lastTutorial: state.tutorialId,
          lastStep: step.id,
          completedSteps: mergedCompletedSteps,
          dismissed,
          onboardingCompleted: isCompleted
        })
      });

      if (isCompleted) {
        await fetch(`${getApiBase()}/tutorials/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            tutorialId: state.tutorialId
          })
        });
      }
    } catch (err) {
      console.error("Tutorial progress save failed:", err);
    }
  }

  function setOpenState(open) {
    if (!elements.overlay || !elements.tooltip) {
      return;
    }

    elements.overlay.classList.toggle("hidden", !open);
    elements.tooltip.classList.toggle("hidden", !open);
    elements.overlay.setAttribute("aria-hidden", String(!open));
    elements.tooltip.setAttribute("aria-hidden", String(!open));
  }

  function close() {
    clearHighlight();
    setOpenState(false);
    elements.tooltip.classList.remove("tutorial-tooltip-centered");
    elements.tooltip.style.top = "";
    elements.tooltip.style.left = "";

    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === "function") {
      state.lastFocusedElement.focus();
    }
  }

  async function renderStep() {
    clearHighlight();

    const step = state.steps[state.currentStepIndex];

    if (!step) {
      close();
      return;
    }

    await runBeforeShow(step);

    const target = getStepTarget(step);
    state.activeTarget = target;

    elements.title.textContent = step.title;
    elements.text.textContent = step.text;
    elements.stepCount.textContent =
      `Step ${state.currentStepIndex + 1} of ${state.steps.length}`;
    elements.progressBar.style.width =
      `${((state.currentStepIndex + 1) / state.steps.length) * 100}%`;

    if (target) {
      target.classList.add("tutorial-highlight");
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      elements.missingNote.textContent = "";
      elements.missingNote.classList.add("hidden");
    } else {
      elements.missingNote.textContent =
        "This item is not visible on the current page state, so the guide is continuing in overview mode.";
      elements.missingNote.classList.remove("hidden");
    }

    setOpenState(true);

    setTimeout(() => {
      positionTooltip(target);
      elements.tooltip.focus();
    }, 180);

    elements.backBtn.disabled = state.currentStepIndex === 0;
    elements.nextBtn.textContent =
      state.currentStepIndex === state.steps.length - 1 ? "Finish" : "Next";
  }

  async function maybeAutoStart() {
    const { tutorial, autostart } = getQueryParams();

    if (tutorial !== state.tutorialId || autostart !== "1") {
      return;
    }

    const tutorialState = await fetchState();

    if (!tutorialState) {
      return;
    }

    if ((tutorialState.completedTutorials || []).includes(state.tutorialId)) {
      return;
    }

    if (tutorialState.dismissed) {
      return;
    }

    const savedStepId =
      tutorialState.lastTutorial === state.tutorialId
        ? tutorialState.lastStep
        : null;

    const savedIndex = state.steps.findIndex(step => step.id === savedStepId);

    state.currentStepIndex = savedIndex >= 0 ? savedIndex : 0;
    state.completedSteps = Array.isArray(tutorialState.completedSteps)
      ? tutorialState.completedSteps.filter(step =>
          step.startsWith(`${state.tutorialId}:`)
        )
      : [];
    state.lastFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    renderStep();
    await saveProgress(false, false);
  }

  async function goNext() {
    const step = state.steps[state.currentStepIndex];

    if (step && !state.completedSteps.includes(step.id)) {
      state.completedSteps.push(step.id);
    }

    if (state.currentStepIndex === state.steps.length - 1) {
      await saveProgress(true, false);
      close();
      return;
    }

    state.currentStepIndex += 1;
    await renderStep();
    await saveProgress(false, false);
  }

  async function goBack() {
    if (state.currentStepIndex > 0) {
      state.currentStepIndex -= 1;
      await renderStep();
    }
  }

  async function dismissTutorial() {
    await saveProgress(false, true);
    close();
  }

  function handleKeydown(event) {
    if (!isOpen()) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      dismissTutorial();
      return;
    }

    if (event.key === "Tab") {
      trapFocus(event);
      return;
    }

    const focusInsideTooltip = elements.tooltip.contains(document.activeElement);

    if (!focusInsideTooltip && document.activeElement !== document.body) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
    }
  }

  function bindEvents() {
    if (state.listenersBound) {
      return;
    }

    elements.backBtn.addEventListener("click", goBack);
    elements.nextBtn.addEventListener("click", goNext);
    elements.skipBtn.addEventListener("click", dismissTutorial);
    elements.closeBtn.addEventListener("click", dismissTutorial);

    window.addEventListener("resize", () => {
      if (isOpen()) {
        positionTooltip(state.activeTarget);
      }
    });

    window.addEventListener("keydown", handleKeydown);

    state.listenersBound = true;
  }

  async function start() {
    state.currentStepIndex = 0;
    state.completedSteps = [];
    state.lastFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    await renderStep();
    await saveProgress(false, false);
  }

  async function init(config) {
    state.tutorialId = config.tutorialId;
    state.steps = Array.isArray(config.steps) ? config.steps : [];
    state.apiBase = config.apiBase || window.API_URL;
    state.token = config.token || null;

    if (!state.steps.length) {
      return;
    }

    bindElements();
    bindEvents();

    if (config.startButtonId) {
      const startBtn = document.getElementById(config.startButtonId);

      if (startBtn && !startBtn.dataset.tutorialBound) {
        startBtn.addEventListener("click", () => {
          state.lastFocusedElement = startBtn;
          start();
        });
        startBtn.dataset.tutorialBound = "true";
      }
    }

    await maybeAutoStart();
  }

  return {
    init,
    start,
    close
  };
})();

window.TutorialEngine = TutorialEngine;
