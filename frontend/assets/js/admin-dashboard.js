let growthChartInstance = null;
let revenueChartInstance = null;
let adminUsers = [];
let selectedAdminUserId = null;

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

  ["adminUserSearch", "adminUserRoleFilter", "adminUserPlanFilter", "adminUserStatusFilter"]
    .forEach((id) => {
      document.getElementById(id)?.addEventListener("input", () => {
        renderAdminUsers();
      });
      document.getElementById(id)?.addEventListener("change", () => {
        renderAdminUsers();
      });
    });

  document.getElementById("clearUserFiltersBtn")?.addEventListener("click", () => {
    setFilterValue("adminUserSearch", "");
    setFilterValue("adminUserRoleFilter", "");
    setFilterValue("adminUserPlanFilter", "");
    setFilterValue("adminUserStatusFilter", "");
    renderAdminUsers();
  });

  loadAdminDashboard();
});

async function loadAdminDashboard(showRefreshMessage = false) {
  try {
    setStatus("Loading admin dashboard...");

    const [stats, growth, userPayload] = await Promise.all([
      fetchJson("/admin/stats"),
      fetchJson("/admin/growth"),
      fetchJson("/admin/users")
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
    adminUsers = Array.isArray(userPayload.users) ? userPayload.users : [];
    selectedAdminUserId = selectedAdminUserId || adminUsers[0]?.id || null;
    renderAdminUsers();

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

function renderAdminUsers() {
  const tableBody = document.getElementById("adminUsersTableBody");

  if (!tableBody) {
    return;
  }

  const filteredUsers = getFilteredAdminUsers();

  if (
    filteredUsers.length > 0 &&
    !filteredUsers.some((user) => user.id === selectedAdminUserId)
  ) {
    selectedAdminUserId = filteredUsers[0].id;
  }

  if (filteredUsers.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table-cell">No users match these filters.</td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = filteredUsers
      .map((user) => renderAdminUserRow(user))
      .join("");
  }

  tableBody.querySelectorAll("[data-admin-user-id]").forEach((element) => {
    element.addEventListener("click", () => {
      selectedAdminUserId = element.dataset.adminUserId;
      renderAdminUsers();
    });
  });

  renderUserSummary(filteredUsers);
  renderSelectedUserDetail(filteredUsers);
}

function getFilteredAdminUsers() {
  const search = getFilterValue("adminUserSearch").toLowerCase();
  const role = getFilterValue("adminUserRoleFilter");
  const plan = getFilterValue("adminUserPlanFilter");
  const status = getFilterValue("adminUserStatusFilter");

  return adminUsers.filter((user) => {
    const subscription = user.subscription || {};
    const searchable = [
      user.fullName,
      user.email,
      user.businessName,
      user.phone
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (search && !searchable.includes(search)) {
      return false;
    }

    if (role && user.role !== role) {
      return false;
    }

    if (plan) {
      if (plan === "none" && user.subscription) {
        return false;
      }

      if (plan !== "none" && subscription.plan !== plan) {
        return false;
      }
    }

    if (status) {
      if (status === "no_subscription" && user.subscription) {
        return false;
      }

      if (status !== "no_subscription" && subscription.status !== status) {
        return false;
      }
    }

    return true;
  });
}

function renderAdminUserRow(user) {
  const subscription = user.subscription || {};
  const plan = subscription.plan || "none";
  const status = subscription.status || "no_subscription";
  const healthTone = user.health?.tone || "neutral";
  const isSelected = user.id === selectedAdminUserId;
  const portfolioSummary = [
    `${formatNumber(user.portfolio?.properties)} properties`,
    `${formatNumber(user.portfolio?.units)} units`,
    `${formatNumber(user.portfolio?.tenants)} tenants`
  ].join(" / ");

  return `
    <tr class="${isSelected ? "selected" : ""}" data-admin-user-id="${escapeAdminHtml(user.id)}">
      <td>
        <button type="button" class="user-name-button" data-admin-user-id="${escapeAdminHtml(user.id)}">
          <strong>${escapeAdminHtml(user.fullName)}</strong>
          <span>${escapeAdminHtml(user.email)}</span>
          ${
            user.businessName
              ? `<small>${escapeAdminHtml(user.businessName)}</small>`
              : ""
          }
        </button>
      </td>
      <td><span class="plan-badge plan-${escapeAdminHtml(plan)}">${formatTitle(plan)}</span></td>
      <td><span class="subscription-badge status-${escapeAdminHtml(status)}">${formatTitle(status)}</span></td>
      <td>${escapeAdminHtml(portfolioSummary)}</td>
      <td>${formatAdminDate(user.lastActivityAt)}</td>
      <td><span class="health-badge ${escapeAdminHtml(healthTone)}">${escapeAdminHtml(user.health?.label || "Unknown")}</span></td>
      <td>
        <button type="button" class="table-action-btn" data-admin-user-id="${escapeAdminHtml(user.id)}">View</button>
      </td>
    </tr>
  `;
}

function renderUserSummary(users) {
  const summary = users.reduce(
    (accumulator, user) => {
      accumulator.total += 1;
      accumulator.units += Number(user.portfolio?.units || 0);

      if (user.subscription?.plan && user.subscription.plan !== "free") {
        accumulator.paid += 1;
      }

      if (["danger", "warning"].includes(user.health?.tone)) {
        accumulator.needsAttention += 1;
      }

      return accumulator;
    },
    { total: 0, paid: 0, needsAttention: 0, units: 0 }
  );

  setText("userSummaryTotal", formatNumber(summary.total));
  setText("userSummaryPaid", formatNumber(summary.paid));
  setText("userSummaryAttention", formatNumber(summary.needsAttention));
  setText("userSummaryPortfolio", formatNumber(summary.units));
}

function renderSelectedUserDetail(users) {
  const detail = document.getElementById("adminUserDetail");

  if (!detail) {
    return;
  }

  const selectedUser =
    users.find((user) => user.id === selectedAdminUserId) || users[0] || null;

  if (!selectedUser) {
    detail.innerHTML = `<p class="empty-detail">Select a user to review account details.</p>`;
    return;
  }

  selectedAdminUserId = selectedUser.id;

  const subscription = selectedUser.subscription;
  const portfolio = selectedUser.portfolio || {};
  const reasons = selectedUser.health?.reasons || [];

  detail.innerHTML = `
    <div class="user-detail-header">
      <div>
        <p class="admin-eyebrow">Selected user</p>
        <h2>${escapeAdminHtml(selectedUser.fullName)}</h2>
        <p>${escapeAdminHtml(selectedUser.email)}</p>
      </div>
      <span class="health-badge ${escapeAdminHtml(selectedUser.health?.tone || "neutral")}">
        ${escapeAdminHtml(selectedUser.health?.label || "Unknown")}
      </span>
    </div>

    <dl class="detail-list">
      <div><dt>Business</dt><dd>${escapeAdminHtml(selectedUser.businessName || "-")}</dd></div>
      <div><dt>Phone</dt><dd>${escapeAdminHtml(selectedUser.phone || "-")}</dd></div>
      <div><dt>Role</dt><dd>${formatTitle(selectedUser.role)}</dd></div>
      <div><dt>Joined</dt><dd>${formatAdminDate(selectedUser.createdAt)}</dd></div>
      <div><dt>Last activity</dt><dd>${formatAdminDate(selectedUser.lastActivityAt)}</dd></div>
      <div><dt>Account age</dt><dd>${formatNumber(selectedUser.accountAgeDays)} days</dd></div>
    </dl>

    <div class="detail-section">
      <h3>Subscription</h3>
      <dl class="detail-list">
        <div><dt>Plan</dt><dd>${formatTitle(subscription?.plan || "none")}</dd></div>
        <div><dt>Status</dt><dd>${formatTitle(subscription?.status || "no_subscription")}</dd></div>
        <div><dt>Monthly value</dt><dd>${formatCurrency(subscription?.estimatedMonthlyRevenue || 0, subscription?.currency || "ZAR")}</dd></div>
        <div><dt>Revenue at risk</dt><dd>${formatCurrency(subscription?.revenueAtRisk || 0, subscription?.currency || "ZAR")}</dd></div>
        <div><dt>Unit limit</dt><dd>${formatNumber(subscription?.maxUnits || 0)}</dd></div>
        <div><dt>Next billing</dt><dd>${formatAdminDate(subscription?.nextBillingDate)}</dd></div>
      </dl>
    </div>

    <div class="detail-section">
      <h3>Portfolio</h3>
      <div class="detail-metric-grid">
        <span><strong>${formatNumber(portfolio.properties)}</strong> Properties</span>
        <span><strong>${formatNumber(portfolio.units)}</strong> Units</span>
        <span><strong>${formatNumber(portfolio.occupiedUnits)}</strong> Occupied</span>
        <span><strong>${formatNumber(portfolio.tenants)}</strong> Tenants</span>
        <span><strong>${formatNumber(portfolio.activeLeases)}</strong> Active leases</span>
        <span><strong>${formatNumber(portfolio.highRiskTenants)}</strong> High-risk tenants</span>
      </div>
    </div>

    <div class="detail-section">
      <h3>Admin signals</h3>
      <ul class="detail-reasons">
        ${reasons.map((reason) => `<li>${escapeAdminHtml(reason)}</li>`).join("")}
      </ul>
    </div>
  `;
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

function getFilterValue(id) {
  return String(document.getElementById(id)?.value || "").trim();
}

function setFilterValue(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.value = value;
  }
}

function formatAdminDate(value) {
  if (window.formatAppDate) {
    return window.formatAppDate(value);
  }

  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString();
}

function formatTitle(value) {
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function escapeAdminHtml(value) {
  if (window.escapeHtml) {
    return window.escapeHtml(value);
  }

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
