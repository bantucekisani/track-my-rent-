TutorialEngine.init({
  tutorialId: "properties",
  startButtonId: "startTutorialBtn",
  steps: [
    {
      id: "properties:add-property",
      target: '[data-tutorial="add-property"]',
      title: "Add Property",
      text: "Start here to create a new rental property in your portfolio."
    },
    {
      id: "properties:enter-name",
      target: '[data-tutorial="property-name"]',
      title: "Property Name",
      text: "Give the property a clear name so it is easy to identify in the app."
    },
    {
      id: "properties:select-type",
      target: '[data-tutorial="property-type"]',
      title: "Property Type",
      text: "Choose the type that best matches the building you are managing."
    },
    {
      id: "properties:enter-address",
      target: '[data-tutorial="property-address"]',
      title: "Property Address",
      text: "Enter the property address so your records stay organized."
    },
    {
      id: "properties:save-property",
      target: '[data-tutorial="save-property"]',
      title: "Save Property",
      text: "Save the property before adding units, tenants, or lease details."
    }
  ]
});
