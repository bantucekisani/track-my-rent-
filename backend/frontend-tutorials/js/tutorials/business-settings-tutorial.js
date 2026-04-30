TutorialEngine.init({
  tutorialId: "business-settings",
  startButtonId: "startTutorialBtn",
  steps: [
    {
      id: "business-settings:enter-business-name",
      target: '[data-tutorial="business-name"]',
      title: "Business Name",
      text: "Enter the main business name used on your records and business documents."
    },
    {
      id: "business-settings:enter-trading-name",
      target: '[data-tutorial="trading-name"]',
      title: "Trading Name",
      text: "Use the name that tenants and customers know your business by."
    },
    {
      id: "business-settings:enter-email",
      target: '[data-tutorial="business-email"]',
      title: "Business Email",
      text: "This email can appear on invoices, statements, and business communication."
    },
    {
      id: "business-settings:enter-phone",
      target: '[data-tutorial="business-phone"]',
      title: "Business Phone",
      text: "Add the main contact number your tenants can use to reach you."
    },
    {
      id: "business-settings:enter-address-line1",
      target: '[data-tutorial="address-line1"]',
      title: "Address Line 1",
      text: "Start with the main street address for your business."
    },
    {
      id: "business-settings:enter-city",
      target: '[data-tutorial="city"]',
      title: "City",
      text: "Add the city where your business operates."
    },
    {
      id: "business-settings:enter-province",
      target: '[data-tutorial="province"]',
      title: "Province",
      text: "Set the province so your business details are complete."
    },
    {
      id: "business-settings:save-profile",
      target: '[data-tutorial="save-business-settings"]',
      title: "Save Changes",
      text: "Save your settings so Track My Rent can use these details across invoices and statements."
    }
  ]
});
