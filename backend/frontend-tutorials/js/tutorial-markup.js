(function injectTutorialMarkup() {
  if (document.getElementById("tutorialOverlay")) {
    return;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div id="tutorialOverlay" class="tutorial-overlay hidden"></div>
      <div id="tutorialTooltip" class="tutorial-tooltip hidden">
        <div id="tutorialStepCount" class="tutorial-step-count"></div>
        <h3 id="tutorialTitle"></h3>
        <p id="tutorialText"></p>
        <div class="tutorial-actions">
          <button id="tutorialBack" type="button" class="tutorial-btn secondary">Back</button>
          <button id="tutorialNext" type="button" class="tutorial-btn primary">Next</button>
          <button id="tutorialSkip" type="button" class="tutorial-btn ghost">Skip</button>
        </div>
      </div>
    `
  );
})();
