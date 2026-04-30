let growthChartInstance = null;
let revenueChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user || !user.token) {
    window.location.href = "login.html";
    return;
  }

  const identity = document.getElementById("adminIdentity");
  if (identity) {
    identity.textContent = user.fullName || user.email || "Admin";
  }

  document.getElementById("refreshDashboardBtn")?.addEventListener("click", () => {
    loadAdminDashboard(true);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("user");
    window.location.href = "login.html";
  });

  loadAdminDashboard();
});

async function loadAdminDashboard(showRefreshMessage = false) {
  try {
    setStatus("Loading admin dashboard...");

    const [stats, growth] = await Promise.all([
      fetchJson("/admin/stats"),
      fetchJson("/admin/growth")
    ]);

    if (window.applyAppPreferences) {
      window.applyAppPreferences({
        currency: stats.currency,
        locale: stats.locale,
        timezone: stats.timezone
      });
    }

    renderOverview(stats);
    renderPlanCards(stats);
    renderMonthlyGrowth(stats);
    renderHealth(stats);
    renderStatusBreakdown(stats);
    renderCharts(stats, growth);

    setStatus(
      showRefreshMessage
        ? "Admin dashboard refreshed."
        : "Admin dashboard loaded."
    );
  } catch (error) {
    console.error("ADMIN DASHBOARD ERROR:", error);
    setStatus(error.message || "Failed to load admin dashboard.", true);
  }
}

async function fetchJson(path) {
  const user = JSON.parse(localStorage.getItem("user"));

  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.token}`
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("user");
      window.location.href = "login.html";
      throw new Error("Your session expired. Please log in again.");
    }

    if (response.status === 403) {
      window.location.href = "dashboard.html";
      throw new Error("Admin access only.");
    }

    throw new Error(data.message || "Request failed");
  }

  return data;
}

function renderOverview(stats) {
  setText("overviewLandlords", formatNumber(stats.users));
  setText("overviewActiveSubscriptions", formatNumber(stats.activeSubscriptions));
  setText("overviewPaidSubscriptions", formatNumber(stats.paidSubscriptions));
  setText("overviewMRR", formatCurrency(stats.estimatedMonthlyRevenue, stats.currency));
  setText("overviewARR", formatCurrency(stats.projectedAnnualRevenue, stats.currency));
  setText("overviewRevenueRisk", formatCurrency(stats.revenueAtRisk, stats.currency));
  setText("overviewProperties", formatNumber(stats.properties));
  setText("overviewUnits", formatNumber(stats.units));
  setText("overviewTenants", formatNumber(stats.tenants));
  setText("overviewActiveLeases", formatNumber(stats.leases));
}

function renderPlanCards(stats) {
  const planStats = stats.planStats || {};
  const revenueByPlan = stats.revenueByPlan || {};

  setText("planFreeCount", formatNumber(planStats.free));
  setText("planStarterCount", formatNumber(planStats.starter));
  setText("planGrowthCount", formatNumber(planStats.growth));
  setText("planProCount", formatNumber(planStats.pro));

  setText("planStarterRevenue", `${formatCurrency(revenueByPlan.starter, stats.currency)} MRR`);
  setText("planGrowthRevenue", `${formatCurrency(revenueByPlan.growth, stats.currency)} MRR`);
  setText("planProRevenue", `${formatCurrency(revenueByPlan.pro, stats.currency)} MRR`);
}

function renderMonthlyGrowth(stats) {
  setText("growthNewUsers", formatNumber(stats.newUsers));
  setText("growthNewSubscriptions", formatNumber(stats.newSubscriptions));
  setText("growthNewPaidSubscriptions", formatNumber(stats.newPaidSubscriptions));
  setText("growthNewMRR", formatCurrency(stats.newMonthlyRevenue, stats.currency));
  setText("growthNewProperties", formatNumber(stats.newProperties));
  setText("growthNewUnits", formatNumber(stats.newUnits));
  setText("growthNewTenants", formatNumber(stats.newTenants));
  setText("growthChurnedSubscriptions", formatNumber(stats.churnedSubscriptions));
}

function renderHealth(stats) {
  setText("healthFreeSubscriptions", formatNumber(stats.freeSubscriptions));
  setText("healthPastDueSubscriptions", formatNumber(stats.pastDueSubscriptions));
  setText("healthCancelledSubscriptions", formatNumber(stats.cancelledSubscriptions));
  setText("healthExpiredSubscriptions", formatNumber(stats.expiredSubscriptions));
  setText("healthConversionRate", `${formatPercent(stats.paidConversionRate)}%`);
  setText(
    "healthAvgRevenuePerPaid",
    formatCurrency(stats.avgRevenuePerPaidSubscription, stats.currency)
  );
  setText("healthOccupancyRate", `${formatPercent(stats.occupancyRate)}%`);
  setText("healthAvgUnitsPerLandlord", formatDecimal(stats.avgUnitsPerLandlord));
  setText(
    "healthAvgTenantsPerProperty",
    formatDecimal(stats.avgTenantsPerProperty)
  );
}

function renderStatusBreakdown(stats) {
  const status = stats.subscriptionStatus || {};

  setText("statusActiveCount", formatNumber(status.active));
  setText("statusPastDueCount", formatNumber(status.past_due));
  setText("statusCancelledCount", formatNumber(status.cancelled));
  setText("statusExpiredCount", formatNumber(status.expired));
}

function renderCharts(stats, growth) {
  renderGrowthChart(growth);
  renderRevenueChart(stats);
}

function renderGrowthChart(growth) {
  const chartElement = document.getElementById("growthChart");

  if (!chartElement || typeof Chart === "undefined") {
    return;
  }

  if (growthChartInstance) {
    growthChartInstance.destroy();
  }

  growthChartInstance = new Chart(chartElement, {
    type: "line",
    data: {
      labels: growth.labels || [],
      datasets: [
        {
          label: "Landlords",
          data: growth.users || [],
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.14)",
          tension: 0.35,
          fill: true
        },
        {
          label: "Subscriptions",
          data: growth.subscriptions || [],
          borderColor: "#0f766e",
          backgroundColor: "rgba(15, 118, 110, 0.12)",
          tension: 0.35,
          fill: true
        },
        {
          label: "Paid subscriptions",
          data: growth.paidSubscriptions || [],
          borderColor: "#c2410c",
          backgroundColor: "rgba(194, 65, 12, 0.10)",
          tension: 0.35,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom"
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

function renderRevenueChart(stats) {
  const chartElement = document.getElementById("revenueChart");

  if (!chartElement || typeof Chart === "undefined") {
    return;
  }

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  const revenueByPlan = stats.revenueByPlan || {};

  revenueChartInstance = new Chart(chartElement, {
    type: "bar",
    data: {
      labels: ["Starter", "Growth", "Pro", "At Risk"],
      datasets: [
        {
          label: "Estimated revenue",
          data: [
            Number(revenueByPlan.starter || 0),
            Number(revenueByPlan.growth || 0),
            Number(revenueByPlan.pro || 0),
            Number(stats.revenueAtRisk || 0)
          ],
          backgroundColor: [
            "#3b82f6",
            "#10b981",
            "#8b5cf6",
            "#ef4444"
          ],
          borderRadius: 10
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label(context) {
              return formatCurrency(context.parsed.y, stats.currency);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return formatCurrency(value, stats.currency);
            }
          }
        }
      }
    }
  });
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value ?? "0";
  }
}

function setStatus(message, isError = false) {
  const statusElement = document.getElementById("adminStatus");

  if (!statusElement) {
    return;
  }

  statusElement.textContent = message || "";
  statusElement.className = `admin-status${isError ? " error" : ""}`;
}

function formatCurrency(value, currency = "ZAR") {
  if (window.formatAppCurrency) {
    return window.formatAppCurrency(value, currency);
  }

  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function formatNumber(value) {
  if (window.formatAppNumber) {
    return window.formatAppNumber(value);
  }

  return String(Number(value || 0));
}

function formatDecimal(value) {
  if (window.formatAppNumber) {
    return window.formatAppNumber(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  }

  return Number(value || 0).toFixed(1);
}

function formatPercent(value) {
  if (window.formatAppNumber) {
    return window.formatAppNumber(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  }

  return Number(value || 0).toFixed(1);
}
