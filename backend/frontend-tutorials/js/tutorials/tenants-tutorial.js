TutorialEngine.init({
  tutorialId: "tenants",
  startButtonId: "startTutorialBtn",
  steps: [
    {
      id: "tenants:add-tenant",
      target: '[data-tutorial="add-tenant"]',
      title: "Add Tenant",
      text: "Create a tenant profile before linking them to a lease."
    },
    {
      id: "tenants:enter-name",
      target: '[data-tutorial="tenant-name"]',
      title: "Tenant Name",
      text: "Enter the tenant's full name so records and documents are accurate."
    },
    {
      id: "tenants:enter-contact",
      target: '[data-tutorial="tenant-contact"]',
      title: "Contact Details",
      text: "Add the tenant's phone number or email for easy communication."
    },
    {
      id: "tenants:save-tenant",
      target: '[data-tutorial="save-tenant"]',
      title: "Save Tenant",
      text: "Save the tenant profile so you can attach it to a property and lease."
    }
  ]
});
