TutorialEngine.init({
  tutorialId: "reports",
  startButtonId: "startTutorialBtn",
  steps: [
    {
      id: "reports:open-reports",
      target: '[data-tutorial="open-reports"]',
      title: "Reports Area",
      text: "Use reports to understand rent collection, arrears, and portfolio performance."
    },
    {
      id: "reports:choose-report",
      target: '[data-tutorial="report-type"]',
      title: "Choose Report",
      text: "Pick the report that matches the question you want to answer."
    },
    {
      id: "reports:export-report",
      target: '[data-tutorial="export-report"]',
      title: "Export Report",
      text: "Export the report when you need to share or print the results."
    }
  ]
});
