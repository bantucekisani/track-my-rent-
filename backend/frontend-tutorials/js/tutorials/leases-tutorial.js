TutorialEngine.init({
  tutorialId: "leases",
  startButtonId: "startTutorialBtn",
  steps: [
    {
      id: "leases:create-lease",
      target: '[data-tutorial="create-lease"]',
      title: "Create Lease",
      text: "Start here to create a lease for a tenant and unit."
    },
    {
      id: "leases:select-property",
      target: '[data-tutorial="lease-property"]',
      title: "Select Property",
      text: "Choose the property or unit that this lease belongs to."
    },
    {
      id: "leases:select-tenant",
      target: '[data-tutorial="lease-tenant"]',
      title: "Assign Tenant",
      text: "Pick the tenant who will be attached to this lease."
    },
    {
      id: "leases:set-rent",
      target: '[data-tutorial="lease-rent"]',
      title: "Set Rent",
      text: "Enter the rental amount and key lease terms."
    },
    {
      id: "leases:save-lease",
      target: '[data-tutorial="save-lease"]',
      title: "Save Lease",
      text: "Save the lease so rent tracking and payment workflows can begin."
    }
  ]
});
