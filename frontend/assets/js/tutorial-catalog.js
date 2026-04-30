(function registerTutorialCatalog() {
  const definitions = [
    {
      id: "getting-started",
      title: "Getting Started",
      description: "Learn the main landlord workflow from dashboard visibility to daily action areas.",
      page: "dashboard.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "getting-started:dashboard-overview",
          target: '[data-tutorial="dashboard-heading"]',
          title: "Start from the dashboard",
          text: "Use the dashboard as your first-stop landlord view for portfolio size, rent flow, and what needs attention this month."
        },
        {
          id: "getting-started:portfolio-health",
          target: '[data-tutorial="total-properties"]',
          title: "Check portfolio size first",
          text: "Confirm how many properties you manage here before drilling into units, tenants, or leases."
        },
        {
          id: "getting-started:occupancy",
          target: '[data-tutorial="total-units"]',
          title: "Watch occupancy and vacancy",
          text: "Occupied versus vacant units tells you whether your portfolio setup and tenant placement are complete."
        },
        {
          id: "getting-started:cashflow",
          target: "#rentCollected",
          title: "Review cashflow next",
          text: "Compare expected, collected, and outstanding rent so you know whether this month is on track."
        },
        {
          id: "getting-started:arrears",
          target: "#totalRollingArrears",
          title: "Do not miss rolling arrears",
          text: "Use rolling arrears to see whether missed rent is building over multiple periods, not just the current month."
        },
        {
          id: "getting-started:operations-follow-up",
          target: "#recentPaymentsBody",
          title: "Move from overview into action",
          text: "Once something looks off, jump into payments, reports, leases, or tenant records from the operational screens."
        }
      ]
    },
    {
      id: "business-settings",
      title: "Business Settings",
      description: "Set up the business profile used on invoices, statements, and landlord-facing documents.",
      page: "business-settings.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "business-settings:business-name",
          target: '[data-tutorial="business-name"]',
          title: "Start with the legal business name",
          text: "Use the name you want appearing on formal records, tenant-facing documents, and billing output."
        },
        {
          id: "business-settings:trading-name",
          target: '[data-tutorial="trading-name"]',
          title: "Add the trading name tenants recognise",
          text: "If tenants know you by a trading name instead of the legal entity name, keep both records clear here."
        },
        {
          id: "business-settings:business-email",
          target: '[data-tutorial="business-email"]',
          title: "Use a monitored email address",
          text: "This email can appear on invoices and statements, so it should be one you actively watch."
        },
        {
          id: "business-settings:business-phone",
          target: '[data-tutorial="business-phone"]',
          title: "Keep the main tenant contact number current",
          text: "Use the number tenants should rely on for day-to-day property communication."
        },
        {
          id: "business-settings:address-line1",
          target: '[data-tutorial="address-line1"]',
          title: "Complete the business address properly",
          text: "A complete address helps keep invoices, statements, and compliance documents looking credible."
        },
        {
          id: "business-settings:city",
          target: '[data-tutorial="city"]',
          title: "Add city and region details",
          text: "Keep location fields complete so your business profile is ready for exports and tenant documents."
        },
        {
          id: "business-settings:province",
          target: '[data-tutorial="province"]',
          title: "Finish the regional details",
          text: "Province or region information helps complete the business identity used on generated paperwork."
        },
        {
          id: "business-settings:save-profile",
          target: '[data-tutorial="save-business-settings"]',
          title: "Save before moving to the next setup stage",
          text: "Once business details are correct, save them so invoices and statements pull the right landlord identity."
        }
      ]
    },
    {
      id: "properties",
      title: "Properties & Units",
      description: "Add properties, structure your portfolio, and prepare for units, tenants, and leases.",
      page: "properties.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "properties:properties-heading",
          target: '[data-tutorial="properties-heading"]',
          beforeShow: "closePropertyTutorialModal",
          title: "Build the portfolio structure here",
          text: "Set up the physical properties first so units, tenants, leases, and reports all attach to the right places."
        },
        {
          id: "properties:add-property",
          target: '[data-tutorial="add-property"]',
          beforeShow: "closePropertyTutorialModal",
          title: "Add each property from one button",
          text: "Use Add Property whenever you bring a new building, house, or complex into Track My Rent."
        },
        {
          id: "properties:property-name",
          target: '[data-tutorial="property-name"]',
          beforeShow: "openPropertyTutorialModal",
          title: "Use clear property names",
          text: "Name properties in a way that makes sense in invoices, reports, and tenant lookups."
        },
        {
          id: "properties:property-type",
          target: '[data-tutorial="property-type"]',
          beforeShow: "openPropertyTutorialModal",
          title: "Set the property type correctly",
          text: "Property type helps you keep the portfolio organised and easier to understand later."
        },
        {
          id: "properties:property-address",
          target: '[data-tutorial="property-address"]',
          beforeShow: "openPropertyTutorialModal",
          title: "Capture the main address cleanly",
          text: "A complete address makes the rest of the rental data more reliable and easier to audit."
        },
        {
          id: "properties:save-property",
          target: '[data-tutorial="save-property"]',
          beforeShow: "openPropertyTutorialModal",
          title: "Save, then move into units",
          text: "After saving a property, open it to add units so the tenant and lease workflow can begin."
        },
        {
          id: "properties:properties-grid",
          target: "#propertiesGrid",
          beforeShow: "closePropertyTutorialModal",
          title: "Use the portfolio list as your launch point",
          text: "Your saved properties appear here, and this is where you move deeper into unit-level management."
        }
      ]
    },
    {
      id: "units",
      title: "Units",
      description: "Set up unit-level rent, deposit, status, and optional details for each property.",
      page: "units.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "units:units-heading",
          target: '[data-tutorial="units-heading"]',
          beforeShow: "closeUnitTutorialModal",
          title: "Manage one property's units here",
          text: "Use this page to keep the unit mix for a property accurate before assigning tenants or leases."
        },
        {
          id: "units:add-unit",
          target: '[data-tutorial="add-unit"]',
          beforeShow: "closeUnitTutorialModal",
          title: "Add units as separate rentable spaces",
          text: "Create a unit for each room, flat, cottage, or rentable section you want to track independently."
        },
        {
          id: "units:units-grid",
          target: "#unitsGrid",
          beforeShow: "closeUnitTutorialModal",
          title: "Review vacancy and pricing at a glance",
          text: "The unit list helps you spot vacant stock, check default rent, and open units for edits."
        },
        {
          id: "units:unit-label",
          target: '[data-tutorial="unit-label"]',
          beforeShow: "openUnitTutorialModal",
          title: "Use unit labels tenants can recognise",
          text: "Good unit labels make leases, payments, and communication much easier to follow."
        },
        {
          id: "units:default-rent",
          target: '[data-tutorial="unit-default-rent"]',
          beforeShow: "openUnitTutorialModal",
          title: "Set the baseline rent and deposit",
          text: "The default rent and deposit help speed up lease creation and keep pricing consistent."
        },
        {
          id: "units:save-unit",
          target: '[data-tutorial="save-unit"]',
          beforeShow: "openUnitTutorialModal",
          title: "Save the unit before assigning people",
          text: "Once a unit is saved, it is ready to be linked to tenants, leases, and later billing activity."
        }
      ]
    },
    {
      id: "tenants",
      title: "Tenants",
      description: "Create tenant records, link them to units, and keep communication details current.",
      page: "tenants.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "tenants:tenants-heading",
          target: '[data-tutorial="tenants-heading"]',
          beforeShow: "closeTenantTutorialModal",
          title: "Tenant records live here",
          text: "Use this page to create and maintain the people side of your rental workflow."
        },
        {
          id: "tenants:add-tenant",
          target: '[data-tutorial="add-tenant"]',
          beforeShow: "closeTenantTutorialModal",
          title: "Start with the tenant profile",
          text: "Create the tenant record before you finalise lease and payment activity."
        },
        {
          id: "tenants:tenant-search",
          target: '[data-tutorial="tenant-search"]',
          beforeShow: "closeTenantTutorialModal",
          title: "Search by name or phone",
          text: "Use search when you need to find a tenant quickly without scanning the whole table."
        },
        {
          id: "tenants:tenant-status-filter",
          target: '[data-tutorial="tenant-status-filter"]',
          beforeShow: "closeTenantTutorialModal",
          title: "Separate active and moved-out tenants",
          text: "Status filtering helps keep the operational view focused on current occupants."
        },
        {
          id: "tenants:tenant-name",
          target: '[data-tutorial="tenant-name"]',
          beforeShow: "openTenantTutorialModal",
          title: "Capture the personal record cleanly",
          text: "Name and contact details should be accurate before rent, statements, and reminders are sent."
        },
        {
          id: "tenants:tenant-contact",
          target: '[data-tutorial="tenant-contact"]',
          beforeShow: "openTenantTutorialModal",
          title: "Use the best working contact number",
          text: "Reliable contact details matter for reminders, statements, and follow-up when rent is overdue."
        },
        {
          id: "tenants:tenant-whatsapp-optin",
          target: '[data-tutorial="tenant-whatsapp-optin"]',
          beforeShow: "openTenantTutorialModal",
          title: "Record reminder consent properly",
          text: "If you use WhatsApp reminders, make sure tenant consent is stored clearly here."
        },
        {
          id: "tenants:save-tenant",
          target: '[data-tutorial="save-tenant"]',
          beforeShow: "openTenantTutorialModal",
          title: "Save before creating the lease",
          text: "Once the tenant record is saved, you can move to lease creation and start formal rent tracking."
        }
      ]
    },
    {
      id: "leases",
      title: "Leases",
      description: "Create lease agreements, assign rent terms, and prepare the tenant for billing and collections.",
      page: "leases.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "leases:leases-heading",
          target: '[data-tutorial="leases-heading"]',
          beforeShow: "closeLeaseTutorialModal",
          title: "Lease setup connects the workflow",
          text: "Leases are where tenant, property, unit, rent, deposit, and due dates become one working record."
        },
        {
          id: "leases:create-lease",
          target: '[data-tutorial="create-lease"]',
          beforeShow: "closeLeaseTutorialModal",
          title: "Create the lease from here",
          text: "Use Create Lease whenever you need to activate a new tenant-to-unit agreement."
        },
        {
          id: "leases:lease-tenant",
          target: '[data-tutorial="lease-tenant"]',
          beforeShow: "openLeaseTutorialModal",
          title: "Choose the tenant carefully",
          text: "Make sure the selected tenant is the correct person before moving to the property and rent terms."
        },
        {
          id: "leases:lease-property",
          target: '[data-tutorial="lease-property"]',
          beforeShow: "openLeaseTutorialModal",
          title: "Match the right property and unit",
          text: "Property and unit selection must line up with the real occupancy arrangement for accurate billing."
        },
        {
          id: "leases:lease-rent",
          target: '[data-tutorial="lease-rent"]',
          beforeShow: "openLeaseTutorialModal",
          title: "Confirm rent and timing",
          text: "Rent amount, deposit, dates, and due day all feed into future collection and invoice logic."
        },
        {
          id: "leases:save-lease",
          target: '[data-tutorial="save-lease"]',
          beforeShow: "openLeaseTutorialModal",
          title: "Save to make the lease operational",
          text: "Once the lease is saved, the tenant is ready for invoicing, statements, and payment tracking."
        }
      ]
    },
    {
      id: "payments",
      title: "Payments",
      description: "Record rent payments, track references, and keep collection history reliable.",
      page: "payments.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "payments:payments-heading",
          target: '[data-tutorial="payments-heading"]',
          beforeShow: "closePaymentTutorialModal",
          title: "Use payments as your collection ledger",
          text: "This page is where rent receipts become traceable records against the right tenant and period."
        },
        {
          id: "payments:record-payment",
          target: '[data-tutorial="record-payment"]',
          beforeShow: "closePaymentTutorialModal",
          title: "Record every payment from one action",
          text: "Use Record Payment whenever rent or another tracked payment is received."
        },
        {
          id: "payments:payment-search",
          target: '[data-tutorial="payment-search"]',
          beforeShow: "closePaymentTutorialModal",
          title: "Search by tenant, property, or reference",
          text: "Search helps you answer collection questions quickly when reconciling or following up."
        },
        {
          id: "payments:payment-property-filter",
          target: '[data-tutorial="payment-property-filter"]',
          beforeShow: "closePaymentTutorialModal",
          title: "Narrow collections by property",
          text: "Filter by property when you want a building-by-building payment review."
        },
        {
          id: "payments:payment-tenant",
          target: '[data-tutorial="payment-tenant"]',
          beforeShow: "openPaymentTutorialModal",
          title: "Choose the paying tenant first",
          text: "Selecting the right tenant keeps the period, statement history, and reporting accurate."
        },
        {
          id: "payments:save-payment",
          target: '[data-tutorial="save-payment"]',
          beforeShow: "openPaymentTutorialModal",
          title: "Save the payment to update the record",
          text: "Once saved, the payment shows in the collection history, statements, and reports."
        }
      ]
    },
    {
      id: "expenses",
      title: "Expenses",
      description: "Track owner costs by property and category so reporting stays accurate.",
      page: "expenses.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "expenses:expenses-heading",
          target: '[data-tutorial="expenses-heading"]',
          beforeShow: "closeExpenseTutorialModal",
          title: "Capture expense data here",
          text: "Use expenses to keep maintenance, utilities, insurance, and admin costs inside the same operating system."
        },
        {
          id: "expenses:record-expense",
          target: '[data-tutorial="record-expense"]',
          beforeShow: "closeExpenseTutorialModal",
          title: "Record each cost from one action",
          text: "Add expenses as they happen so month-end profit reporting does not depend on memory."
        },
        {
          id: "expenses:expense-search",
          target: '[data-tutorial="expense-search"]',
          beforeShow: "closeExpenseTutorialModal",
          title: "Search descriptions and categories",
          text: "Use search when you need to find a specific cost quickly across the ledger."
        },
        {
          id: "expenses:expense-property-filter",
          target: '[data-tutorial="expense-property-filter"]',
          beforeShow: "closeExpenseTutorialModal",
          title: "Filter by property for cleaner reviews",
          text: "Property filtering helps you isolate one building when reviewing costs and profitability."
        },
        {
          id: "expenses:expense-category-filter",
          target: '[data-tutorial="expense-category-filter"]',
          beforeShow: "closeExpenseTutorialModal",
          title: "Use categories consistently",
          text: "Consistent categorisation makes later reporting and trend analysis much easier."
        },
        {
          id: "expenses:save-expense",
          target: '[data-tutorial="save-expense"]',
          beforeShow: "openExpenseTutorialModal",
          title: "Save each expense into the ledger",
          text: "Once saved, the expense becomes part of the property's financial history and profit calculations."
        }
      ]
    },
    {
      id: "invoices",
      title: "Invoices",
      description: "Review generated invoices, isolate overdue items, and search billing records quickly.",
      page: "invoices.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "invoices:invoices-heading",
          target: '[data-tutorial="invoices-heading"]',
          title: "Invoices show your billing output",
          text: "Use this page to review what has been billed, what is overdue, and what has already been settled."
        },
        {
          id: "invoices:status-filter",
          target: '[data-tutorial="invoice-status-overdue"]',
          title: "Use status chips for billing triage",
          text: "Switch between overdue, unpaid, and paid invoices when you need to focus your follow-up."
        },
        {
          id: "invoices:invoice-search",
          target: '[data-tutorial="invoice-search"]',
          title: "Search invoice numbers and tenants",
          text: "Search helps you pull up a specific billing record without working through the full table."
        },
        {
          id: "invoices:invoice-list",
          target: "#invoiceTableBody",
          title: "Review the invoice table for action items",
          text: "This list shows due dates, billed amounts, paid amounts, and balances so you can act on the right invoices."
        }
      ]
    },
    {
      id: "reports",
      title: "Reports",
      description: "Use filters, charts, exports, and statements to understand portfolio performance.",
      page: "reports.html",
      startButtonId: "startTutorialBtn",
      steps: [
        {
          id: "reports:reports-heading",
          target: '[data-tutorial="reports-heading"]',
          title: "Reports are your month-end review space",
          text: "Use this page to understand rent flow, arrears, profitability, and performance across the portfolio."
        },
        {
          id: "reports:report-month",
          target: '[data-tutorial="report-month"]',
          title: "Start by choosing the accounting period",
          text: "Set the month and year first so every chart, table, and summary is aligned to the same view."
        },
        {
          id: "reports:report-type",
          target: '[data-tutorial="report-type"]',
          title: "Narrow to one property when needed",
          text: "Property filtering helps you compare portfolio-wide trends against a single building or property."
        },
        {
          id: "reports:refresh-reports",
          target: '[data-tutorial="refresh-reports"]',
          title: "Refresh after changing filters",
          text: "Use Refresh to rebuild the charts and tables for the selected reporting context."
        },
        {
          id: "reports:tenant-statement",
          target: "#generateTenantStatementBtn",
          title: "Generate tenant statements from this page",
          text: "Statements help you explain balances, recent charges, and payments to a tenant quickly."
        },
        {
          id: "reports:export-report",
          target: '[data-tutorial="export-report"]',
          title: "Export the result when you need to share it",
          text: "Use CSV or PDF exports whenever you need to archive data, send it to a bookkeeper, or share it with stakeholders."
        }
      ]
    }
  ];

  const catalog = definitions.map(definition => ({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    page: definition.page,
    steps: definition.steps.length
  }));

  const byId = Object.fromEntries(
    definitions.map(definition => [definition.id, definition])
  );

  function cloneSteps(steps) {
    return steps.map(step => ({ ...step }));
  }

  function getTutorialDefinition(tutorialId) {
    const definition = byId[tutorialId];

    if (!definition) {
      return null;
    }

    return {
      ...definition,
      steps: cloneSteps(definition.steps)
    };
  }

  function getTutorialCatalog() {
    return catalog.map(entry => ({ ...entry }));
  }

  function initPageTutorial(tutorialId, startButtonId = "startTutorialBtn") {
    if (typeof window.TutorialEngine === "undefined") {
      return false;
    }

    const definition = getTutorialDefinition(tutorialId);

    if (!definition) {
      return false;
    }

    window.TutorialEngine.init({
      tutorialId: definition.id,
      startButtonId: startButtonId || definition.startButtonId,
      steps: definition.steps
    });

    return true;
  }

  window.TutorialRegistry = {
    getTutorialCatalog,
    getTutorialDefinition,
    initPageTutorial
  };

  window.tutorialCatalog = getTutorialCatalog();
})();
