TutorialEngine.init({
  tutorialId: "payments",
  startButtonId: "startTutorialBtn",
  steps: [
    {
      id: "payments:open-payments",
      target: '[data-tutorial="open-payments"]',
      title: "Payments Area",
      text: "This section helps you track incoming rent and other tenant payments."
    },
    {
      id: "payments:record-payment",
      target: '[data-tutorial="record-payment"]',
      title: "Record Payment",
      text: "Use this action to capture a tenant payment against the correct lease."
    },
    {
      id: "payments:select-tenant",
      target: '[data-tutorial="payment-tenant"]',
      title: "Choose Tenant",
      text: "Select the tenant or lease receiving the payment."
    },
    {
      id: "payments:save-payment",
      target: '[data-tutorial="save-payment"]',
      title: "Save Payment",
      text: "Save the payment so the tenant balance and dashboard update correctly."
    }
  ]
});
