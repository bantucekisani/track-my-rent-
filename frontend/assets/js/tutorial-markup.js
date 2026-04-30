(function injectTutorialMarkup() {
  if (document.getElementById("tutorialOverlay")) {
    return;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div id="tutorialOverlay" class="tutorial-overlay hidden" aria-hidden="true"></div>
      <div
        id="tutorialTooltip"
        class="tutorial-tooltip hidden"
        role="dialog"
        aria-modal="true"
        aria-hidden="true"
        aria-labelledby="tutorialTitle"
        aria-describedby="tutorialText tutorialMissingNote"
        tabindex="-1"
      >
        <div class="tutorial-tooltip-top">
          <div class="tutorial-progress-meta">
            <div id="tutorialStepCount" class="tutorial-step-count"></div>
            <div class="tutorial-progress-track" aria-hidden="true">
              <div id="tutorialProgressBar" class="tutorial-progress-bar"></div>
            </div>
          </div>
          <button
            id="tutorialClose"
            type="button"
            class="tutorial-icon-btn"
            aria-label="Close tutorial"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <h3 id="tutorialTitle"></h3>
        <p id="tutorialText"></p>
        <p id="tutorialMissingNote" class="tutorial-missing-note hidden"></p>

        <div class="tutorial-actions">
          <button id="tutorialBack" type="button" class="tutorial-btn secondary">Back</button>
          <button id="tutorialNext" type="button" class="tutorial-btn primary">Next</button>
          <button id="tutorialSkip" type="button" class="tutorial-btn ghost">Skip</button>
        </div>
      </div>
    `
  );
})();
