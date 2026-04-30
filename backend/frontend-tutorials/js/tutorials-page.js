(function tutorialsPage() {
  const API_BASE = "http://127.0.0.1:5000/api";
  const token = localStorage.getItem("token");
  const grid = document.getElementById("tutorialGrid");

  if (!grid || !Array.isArray(window.tutorialCatalog || tutorialCatalog)) {
    return;
  }

  const catalog = window.tutorialCatalog || tutorialCatalog;

  function getCompletedCount(progress, tutorialId) {
    if (!progress || !Array.isArray(progress.completedSteps)) {
      return 0;
    }

    return progress.completedSteps.filter(step =>
      step.startsWith(`${tutorialId}:`)
    ).length;
  }

  async function getTutorialState() {
    const res = await fetch(`${API_BASE}/tutorials/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();
    return data.tutorials || {};
  }

  function renderTutorials(progress) {
    const completedTutorials = progress.completedTutorials || [];

    grid.innerHTML = catalog.map(tutorial => {
      const done = completedTutorials.includes(tutorial.id);
      const completedCount = getCompletedCount(progress, tutorial.id);
      const progressText = done
        ? "Completed"
        : `${completedCount}/${tutorial.steps} steps completed`;

      return `
        <article class="tutorial-card">
          <h3>${tutorial.title}</h3>
          <p>${tutorial.description}</p>
          <div class="tutorial-progress">${progressText}</div>
          <div class="tutorial-card-actions">
            <button class="start-btn" data-start="${tutorial.id}" data-page="${tutorial.page}">
              ${done ? "Replay" : "Start"}
            </button>
            <button class="reset-btn" data-reset="${tutorial.id}">
              Reset
            </button>
          </div>
        </article>
      `;
    }).join("");

    bindButtons();
  }

  function bindButtons() {
    document.querySelectorAll("[data-start]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const tutorialId = btn.dataset.start;
        const page = btn.dataset.page;

        await fetch(`${API_BASE}/tutorials/me`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            lastTutorial: tutorialId,
            dismissed: false
          })
        });

        window.location.href = `${page}?tutorial=${tutorialId}&autostart=1`;
      });
    });

    document.querySelectorAll("[data-reset]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const tutorialId = btn.dataset.reset;
        const progress = await getTutorialState();

        const updatedCompletedTutorials = (progress.completedTutorials || [])
          .filter(id => id !== tutorialId);

        const updatedCompletedSteps = (progress.completedSteps || [])
          .filter(step => !step.startsWith(`${tutorialId}:`));

        await fetch(`${API_BASE}/tutorials/me`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            completedTutorials: updatedCompletedTutorials,
            completedSteps: updatedCompletedSteps,
            lastTutorial: tutorialId,
            lastStep: `${tutorialId}:welcome`,
            onboardingCompleted: false,
            dismissed: false
          })
        });

        await loadTutorials();
      });
    });
  }

  async function loadTutorials() {
    try {
      const progress = await getTutorialState();
      renderTutorials(progress);
    } catch (err) {
      console.error("Failed to load tutorials:", err);
      renderTutorials({});
    }
  }

  loadTutorials();
})();
