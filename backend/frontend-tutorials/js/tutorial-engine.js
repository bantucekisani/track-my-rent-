const TutorialEngine = (() => {
  const state = {
    tutorialId: "",
    steps: [],
    currentStepIndex: 0,
    completedSteps: [],
    token: localStorage.getItem("token"),
    apiBase: "http://127.0.0.1:5000/api"
  };

  const elements = {
    overlay: null,
    tooltip: null,
    title: null,
    text: null,
    stepCount: null,
    backBtn: null,
    nextBtn: null,
    skipBtn: null
  };

  function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      tutorial: params.get("tutorial"),
      autostart: params.get("autostart")
    };
  }

  function clearHighlight() {
    document
      .querySelectorAll(".tutorial-highlight")
      .forEach(el => el.classList.remove("tutorial-highlight"));
  }

  function positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    const tooltipWidth = 340;
    const gap = 16;

    let top = rect.top + window.scrollY;
    let left = rect.right + window.scrollX + gap;

    if (left + tooltipWidth > window.scrollX + window.innerWidth - 12) {
      left = rect.left + window.scrollX - tooltipWidth - gap;
    }

    if (left < 12) {
      left = 12;
    }

    elements.tooltip.style.top = `${top}px`;
    elements.tooltip.style.left = `${left}px`;
  }

  function bindElements() {
    elements.overlay = document.getElementById("tutorialOverlay");
    elements.tooltip = document.getElementById("tutorialTooltip");
    elements.title = document.getElementById("tutorialTitle");
    elements.text = document.getElementById("tutorialText");
    elements.stepCount = document.getElementById("tutorialStepCount");
    elements.backBtn = document.getElementById("tutorialBack");
    elements.nextBtn = document.getElementById("tutorialNext");
    elements.skipBtn = document.getElementById("tutorialSkip");
  }

  async function fetchState() {
    try {
      const res = await fetch(`${state.apiBase}/tutorials/me`, {
        headers: {
          Authorization: `Bearer ${state.token}`
        }
      });

      const data = await res.json();
      return data.tutorials || null;
    } catch (err) {
      console.error("Failed to load tutorial state:", err);
      return null;
    }
  }

  async function saveProgress(isCompleted = false, dismissed = false) {
    const step = state.steps[state.currentStepIndex];

    try {
      const tutorialState = await fetchState();
      const existingCompletedSteps = Array.isArray(tutorialState?.completedSteps)
        ? tutorialState.completedSteps
        : [];

      const mergedCompletedSteps = [
        ...new Set([...existingCompletedSteps, ...state.completedSteps])
      ];

      await fetch(`${state.apiBase}/tutorials/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.token}`
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
        await fetch(`${state.apiBase}/tutorials/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.token}`
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

  function close() {
    clearHighlight();
    elements.overlay.classList.add("hidden");
    elements.tooltip.classList.add("hidden");
  }

  function renderStep() {
    clearHighlight();

    const step = state.steps[state.currentStepIndex];
    const target = document.querySelector(step.target);

    if (!step || !target) {
      return;
    }

    target.classList.add("tutorial-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });

    elements.title.textContent = step.title;
    elements.text.textContent = step.text;
    elements.stepCount.textContent =
      `Step ${state.currentStepIndex + 1} of ${state.steps.length}`;

    elements.overlay.classList.remove("hidden");
    elements.tooltip.classList.remove("hidden");

    setTimeout(() => positionTooltip(target), 250);

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

    renderStep();
    await saveProgress(false, false);
  }

  function bindEvents() {
    elements.backBtn.addEventListener("click", () => {
      if (state.currentStepIndex > 0) {
        state.currentStepIndex--;
        renderStep();
      }
    });

    elements.nextBtn.addEventListener("click", async () => {
      const step = state.steps[state.currentStepIndex];

      if (!state.completedSteps.includes(step.id)) {
        state.completedSteps.push(step.id);
      }

      if (state.currentStepIndex === state.steps.length - 1) {
        await saveProgress(true, false);
        close();
        return;
      }

      state.currentStepIndex++;
      renderStep();
      await saveProgress(false, false);
    });

    elements.skipBtn.addEventListener("click", async () => {
      await saveProgress(false, true);
      close();
    });

    window.addEventListener("resize", () => {
      const step = state.steps[state.currentStepIndex];
      const target = step && document.querySelector(step.target);

      if (target && !elements.tooltip.classList.contains("hidden")) {
        positionTooltip(target);
      }
    });
  }

  async function start() {
    state.currentStepIndex = 0;
    state.completedSteps = [];
    renderStep();
    await saveProgress(false, false);
  }

  async function init(config) {
    state.tutorialId = config.tutorialId;
    state.steps = config.steps;

    if (config.apiBase) {
      state.apiBase = config.apiBase;
    }

    if (config.token) {
      state.token = config.token;
    }

    bindElements();
    bindEvents();

    if (config.startButtonId) {
      const startBtn = document.getElementById(config.startButtonId);

      if (startBtn) {
        startBtn.addEventListener("click", start);
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
