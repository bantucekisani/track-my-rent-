document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("tutorialGrid");
  const token = getStoredUserToken();
  const resumeBtn = document.getElementById("resumeTutorialBtn");
  const resetBtn = document.getElementById("resetOnboardingBtn");
  const catalog = window.TutorialRegistry?.getTutorialCatalog?.() || window.tutorialCatalog || [];

  if (!grid || !Array.isArray(catalog) || !token) {
    return;
  }

  function getCompletedCount(progress, tutorialId) {
    if (!progress || !Array.isArray(progress.completedSteps)) {
      return 0;
    }

    return progress.completedSteps.filter(step =>
      step.startsWith(`${tutorialId}:`)
    ).length;
  }

  async function getTutorialState() {
    const res = await fetch(`${API_URL}/tutorials/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error("Failed to load tutorial state");
    }

    const data = await res.json();
    return data.tutorials || {};
  }

  function renderTutorials(progress) {
    const completedTutorials = progress.completedTutorials || [];
    bindTopActions(progress);

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

        await fetch(`${API_URL}/tutorials/me`, {
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

        await fetch(`${API_URL}/tutorials/me`, {
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
        notify("Tutorial progress reset", "success");
      });
    });
  }

  function bindTopActions(progress) {
    if (resumeBtn && !resumeBtn.dataset.bound) {
      resumeBtn.addEventListener("click", async () => {
        const current = await getTutorialState();
        const tutorialId = current.lastTutorial || "getting-started";
        const tutorial = catalog.find(item => item.id === tutorialId)
          || catalog[0];

        window.location.href = `${tutorial.page}?tutorial=${tutorial.id}&autostart=1`;
      });
      resumeBtn.dataset.bound = "true";
    }

    if (resetBtn && !resetBtn.dataset.bound) {
      resetBtn.addEventListener("click", async () => {
        await fetch(`${API_URL}/tutorials/reset`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        });

        await loadTutorials();
        notify("Onboarding reset. You can start again from the top.", "success");
      });
      resetBtn.dataset.bound = "true";
    }

    if (resumeBtn) {
      resumeBtn.textContent = progress.lastTutorial
        ? "Resume Last Tutorial"
        : "Start Tutorials";
    }
  }

  async function loadTutorials() {
    try {
      const progress = await getTutorialState();
      renderTutorials(progress);
    } catch (err) {
      console.error("Failed to load tutorials:", err);
      renderTutorials({});
      notify("Could not load tutorial progress", "error");
    }
  }

  loadTutorials();
});

function getStoredUserToken() {
  try {
    const user = JSON.parse(localStorage.getItem("user"));
    return user?.token || null;
  } catch {
    return null;
  }
}

function notify(message, type = "info") {
  if (typeof showToast === "function") {
    showToast(message, type);
  }
}
