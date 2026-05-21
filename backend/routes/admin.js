const express = require("express");

const auth = require("../middleware/authMiddleware");
const Lease = require("../models/Lease");
const Property = require("../models/Property");
const Subscription = require("../models/Subscription");
const Tenant = require("../models/Tenant");
const Unit = require("../models/Unit");
const User = require("../models/User");

const router = express.Router();

const PLAN_PRICES = {
  free: 0,
  starter: 99,
  growth: 199,
  pro: 399
};

const PLAN_KEYS = Object.keys(PLAN_PRICES);
const SUBSCRIPTION_STATUSES = ["active", "past_due", "cancelled", "expired"];

function normalizePlan(plan) {
  const normalized = String(plan || "free").trim().toLowerCase();
  return PLAN_KEYS.includes(normalized) ? normalized : "free";
}

function normalizeStatus(status) {
  const normalized = String(status || "active").trim().toLowerCase();
  return SUBSCRIPTION_STATUSES.includes(normalized) ? normalized : "active";
}

function createCountMap(keys) {
  return keys.reduce((accumulator, key) => {
    accumulator[key] = 0;
    return accumulator;
  }, {});
}

function round(value, digits = 1) {
  return Number(Number(value || 0).toFixed(digits));
}

function startOfCurrentMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function buildMonthBuckets(count = 6, endDate = new Date()) {
  const buckets = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const start = new Date(endDate.getFullYear(), endDate.getMonth() - index, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

    buckets.push({
      key: `${start.getFullYear()}-${start.getMonth() + 1}`,
      label: start.toLocaleDateString("en-ZA", {
        month: "short",
        year: "numeric"
      }),
      start,
      end
    });
  }

  return buckets;
}

function rowsToSeries(rows, buckets) {
  const rowMap = new Map(
    rows.map((row) => [
      `${row._id.year}-${row._id.month}`,
      Number(row.count || 0)
    ])
  );

  return buckets.map((bucket) => rowMap.get(bucket.key) || 0);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatSubscriptionLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function daysBetween(startDate, endDate = new Date()) {
  if (!startDate) {
    return 0;
  }

  const start = new Date(startDate);

  if (Number.isNaN(start.getTime())) {
    return 0;
  }

  const milliseconds = endDate.getTime() - start.getTime();
  return Math.max(0, Math.floor(milliseconds / (1000 * 60 * 60 * 24)));
}

function latestDate(...values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;
}

function getSubscriptionRisk({ subscription, portfolio }) {
  const reasons = [];
  const plan = normalizePlan(subscription?.plan);
  const status = subscription ? normalizeStatus(subscription.status) : "missing";
  const maxUnits = Number(subscription?.maxUnits || 0);
  const units = Number(portfolio?.units || 0);

  if (!subscription) {
    return {
      label: "No subscription",
      tone: "warning",
      reasons: ["No subscription record is linked to this user."]
    };
  }

  if (status === "past_due") {
    reasons.push("Payment is marked past due.");
  }

  if (["cancelled", "expired"].includes(status)) {
    reasons.push(`Subscription is ${formatSubscriptionLabel(status).toLowerCase()}.`);
  }

  if (maxUnits > 0 && units >= maxUnits) {
    reasons.push("Portfolio has reached the current unit limit.");
  }

  if (plan === "free" && units > 0) {
    reasons.push("Active portfolio is still on the free plan.");
  }

  if (["past_due", "cancelled", "expired"].includes(status)) {
    return {
      label: "Needs attention",
      tone: "danger",
      reasons
    };
  }

  if (reasons.length > 0) {
    return {
      label: "Watch",
      tone: "warning",
      reasons
    };
  }

  return {
    label: plan === "free" ? "Free plan" : "Healthy",
    tone: plan === "free" ? "neutral" : "success",
    reasons: [
      plan === "free"
        ? "User is active on the free plan."
        : "Paid subscription is active."
    ]
  };
}

async function requireAdmin(req, res, next) {
  try {
    const admin = await User.findById(req.user.id).select("role");

    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    return next();
  } catch (error) {
    console.error("ADMIN AUTH ERROR:", error);
    return res.status(500).json({ message: "Failed to verify admin access" });
  }
}

router.get("/stats", auth, requireAdmin, async (req, res) => {
  try {
    const startOfMonth = startOfCurrentMonth();

    const [
      users,
      properties,
      units,
      occupiedUnits,
      vacantUnits,
      tenants,
      activeTenants,
      leases,
      newUsers,
      newProperties,
      newUnits,
      newTenants,
      subscriptions
    ] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Unit.countDocuments(),
      Unit.countDocuments({ status: "Occupied" }),
      Unit.countDocuments({ status: "Vacant" }),
      Tenant.countDocuments(),
      Tenant.countDocuments({ status: "active" }),
      Lease.countDocuments({ status: "Active" }),
      User.countDocuments({
        createdAt: { $gte: startOfMonth }
      }),
      Property.countDocuments({
        createdAt: { $gte: startOfMonth }
      }),
      Unit.countDocuments({
        createdAt: { $gte: startOfMonth }
      }),
      Tenant.countDocuments({
        createdAt: { $gte: startOfMonth }
      }),
      Subscription.find()
        .select("plan status createdAt startedAt updatedAt")
        .lean()
    ]);

    const planStats = createCountMap(PLAN_KEYS);
    const allPlanStats = createCountMap(PLAN_KEYS);
    const revenueByPlan = createCountMap(PLAN_KEYS);
    const subscriptionStatus = createCountMap(SUBSCRIPTION_STATUSES);

    let totalSubscriptions = 0;
    let activeSubscriptions = 0;
    let paidSubscriptions = 0;
    let freeSubscriptions = 0;
    let pastDueSubscriptions = 0;
    let cancelledSubscriptions = 0;
    let expiredSubscriptions = 0;
    let newSubscriptions = 0;
    let newPaidSubscriptions = 0;
    let churnedSubscriptions = 0;
    let estimatedMonthlyRevenue = 0;
    let revenueAtRisk = 0;
    let newMonthlyRevenue = 0;

    subscriptions.forEach((subscription) => {
      totalSubscriptions += 1;

      const plan = normalizePlan(subscription.plan);
      const status = normalizeStatus(subscription.status);
      const price = PLAN_PRICES[plan] || 0;
      const createdAt = subscription.createdAt
        ? new Date(subscription.createdAt)
        : null;
      const startedAt = subscription.startedAt
        ? new Date(subscription.startedAt)
        : null;
      const updatedAt = subscription.updatedAt
        ? new Date(subscription.updatedAt)
        : null;

      allPlanStats[plan] += 1;
      subscriptionStatus[status] += 1;

      if (createdAt && createdAt >= startOfMonth) {
        newSubscriptions += 1;
      }

      if (status === "active") {
        activeSubscriptions += 1;
        planStats[plan] += 1;

        if (plan === "free") {
          freeSubscriptions += 1;
        } else {
          paidSubscriptions += 1;
          estimatedMonthlyRevenue += price;
          revenueByPlan[plan] += price;
        }
      }

      if (status === "past_due") {
        pastDueSubscriptions += 1;

        if (plan !== "free") {
          revenueAtRisk += price;
        }
      }

      if (status === "cancelled") {
        cancelledSubscriptions += 1;
      }

      if (status === "expired") {
        expiredSubscriptions += 1;
      }

      if (plan !== "free" && startedAt && startedAt >= startOfMonth) {
        newPaidSubscriptions += 1;
        newMonthlyRevenue += price;
      }

      if (
        updatedAt &&
        updatedAt >= startOfMonth &&
        ["cancelled", "expired"].includes(status)
      ) {
        churnedSubscriptions += 1;
      }
    });

    const avgUnitsPerLandlord = users > 0 ? round(units / users, 1) : 0;
    const avgTenantsPerProperty =
      properties > 0 ? round(tenants / properties, 1) : 0;
    const occupancyRate = units > 0 ? round((occupiedUnits / units) * 100, 1) : 0;
    const paidConversionRate =
      users > 0 ? round((paidSubscriptions / users) * 100, 1) : 0;
    const avgRevenuePerPaidSubscription =
      paidSubscriptions > 0
        ? round(estimatedMonthlyRevenue / paidSubscriptions, 2)
        : 0;

    return res.json({
      currency: "ZAR",

      users,
      properties,
      units,
      occupiedUnits,
      vacantUnits,
      tenants,
      activeTenants,
      leases,

      totalSubscriptions,
      activeSubscriptions,
      paidSubscriptions,
      freeSubscriptions,
      pastDueSubscriptions,
      cancelledSubscriptions,
      expiredSubscriptions,

      newUsers,
      newProperties,
      newUnits,
      newTenants,
      newSubscriptions,
      newPaidSubscriptions,
      churnedSubscriptions,

      estimatedMonthlyRevenue,
      projectedAnnualRevenue: estimatedMonthlyRevenue * 12,
      revenueAtRisk,
      newMonthlyRevenue,
      avgRevenuePerPaidSubscription,
      paidConversionRate,

      avgUnitsPerLandlord,
      avgTenantsPerProperty,
      occupancyRate,

      planStats,
      allPlanStats,
      revenueByPlan,
      subscriptionStatus,
      planPrices: PLAN_PRICES
    });
  } catch (error) {
    console.error("ADMIN STATS ERROR:", error);
    return res.status(500).json({ message: "Failed to load admin stats" });
  }
});

router.get("/users", auth, requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const role = String(req.query.role || "").trim().toLowerCase();
    const planFilter = String(req.query.plan || "").trim().toLowerCase();
    const statusFilter = String(req.query.status || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit || 250), 25), 500);

    const userQuery = {};

    if (["owner", "staff", "admin"].includes(role)) {
      userQuery.role = role;
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      userQuery.$or = [
        { fullName: regex },
        { email: regex },
        { businessName: regex },
        { phone: regex }
      ];
    }

    const users = await User.find(userQuery)
      .select("fullName email phone businessName role createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const userIds = users.map((user) => user._id);
    const [
      subscriptions,
      propertyCounts,
      unitCounts,
      tenantCounts,
      leaseCounts
    ] = await Promise.all([
      Subscription.find({ user: { $in: userIds } })
        .select("user plan status maxUnits currency startedAt expiresAt nextBillingDate createdAt updatedAt")
        .sort({ updatedAt: -1 })
        .lean(),
      Property.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        {
          $group: {
            _id: "$ownerId",
            count: { $sum: 1 },
            latestUpdatedAt: { $max: "$updatedAt" }
          }
        }
      ]),
      Unit.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        {
          $group: {
            _id: "$ownerId",
            count: { $sum: 1 },
            occupied: {
              $sum: { $cond: [{ $eq: ["$status", "Occupied"] }, 1, 0] }
            },
            vacant: {
              $sum: { $cond: [{ $eq: ["$status", "Vacant"] }, 1, 0] }
            },
            maintenance: {
              $sum: { $cond: [{ $eq: ["$status", "Maintenance"] }, 1, 0] }
            },
            latestUpdatedAt: { $max: "$updatedAt" }
          }
        }
      ]),
      Tenant.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        {
          $group: {
            _id: "$ownerId",
            count: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
            },
            highRisk: {
              $sum: { $cond: [{ $eq: ["$riskLevel", "HIGH"] }, 1, 0] }
            },
            latestUpdatedAt: { $max: "$updatedAt" }
          }
        }
      ]),
      Lease.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        {
          $group: {
            _id: "$ownerId",
            count: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] }
            },
            signed: {
              $sum: { $cond: ["$isSigned", 1, 0] }
            },
            latestUpdatedAt: { $max: "$updatedAt" }
          }
        }
      ])
    ]);

    const subscriptionByUser = new Map();

    subscriptions.forEach((subscription) => {
      const key = String(subscription.user);

      if (!subscriptionByUser.has(key)) {
        subscriptionByUser.set(key, subscription);
      }
    });

    const propertyByUser = new Map(
      propertyCounts.map((row) => [String(row._id), row])
    );
    const unitByUser = new Map(unitCounts.map((row) => [String(row._id), row]));
    const tenantByUser = new Map(
      tenantCounts.map((row) => [String(row._id), row])
    );
    const leaseByUser = new Map(
      leaseCounts.map((row) => [String(row._id), row])
    );

    let rows = users.map((user) => {
      const userId = String(user._id);
      const subscription = subscriptionByUser.get(userId);
      const plan = subscription ? normalizePlan(subscription.plan) : "none";
      const status = subscription
        ? normalizeStatus(subscription.status)
        : "no_subscription";
      const planPrice = PLAN_PRICES[plan] || 0;
      const propertyStats = propertyByUser.get(userId) || {};
      const unitStats = unitByUser.get(userId) || {};
      const tenantStats = tenantByUser.get(userId) || {};
      const leaseStats = leaseByUser.get(userId) || {};
      const portfolio = {
        properties: Number(propertyStats.count || 0),
        units: Number(unitStats.count || 0),
        occupiedUnits: Number(unitStats.occupied || 0),
        vacantUnits: Number(unitStats.vacant || 0),
        maintenanceUnits: Number(unitStats.maintenance || 0),
        tenants: Number(tenantStats.count || 0),
        activeTenants: Number(tenantStats.active || 0),
        highRiskTenants: Number(tenantStats.highRisk || 0),
        leases: Number(leaseStats.count || 0),
        activeLeases: Number(leaseStats.active || 0),
        signedLeases: Number(leaseStats.signed || 0)
      };
      const lastActivityAt = latestDate(
        user.updatedAt,
        subscription?.updatedAt,
        propertyStats.latestUpdatedAt,
        unitStats.latestUpdatedAt,
        tenantStats.latestUpdatedAt,
        leaseStats.latestUpdatedAt
      );
      const health = getSubscriptionRisk({ subscription, portfolio });

      return {
        id: userId,
        fullName: user.fullName || "Unnamed user",
        email: user.email || "",
        phone: user.phone || "",
        businessName: user.businessName || "",
        role: user.role || "owner",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        accountAgeDays: daysBetween(user.createdAt),
        lastActivityAt,
        subscription: subscription
          ? {
              id: String(subscription._id),
              plan,
              status,
              maxUnits: Number(subscription.maxUnits || 0),
              currency: subscription.currency || "ZAR",
              startedAt: subscription.startedAt,
              expiresAt: subscription.expiresAt,
              nextBillingDate: subscription.nextBillingDate,
              estimatedMonthlyRevenue:
                status === "active" && plan !== "free" ? planPrice : 0,
              revenueAtRisk:
                status === "past_due" && plan !== "free" ? planPrice : 0
            }
          : null,
        portfolio,
        health
      };
    });

    if (PLAN_KEYS.includes(planFilter)) {
      rows = rows.filter((row) => row.subscription?.plan === planFilter);
    } else if (planFilter === "none") {
      rows = rows.filter((row) => !row.subscription);
    }

    if (
      SUBSCRIPTION_STATUSES.includes(statusFilter) ||
      statusFilter === "no_subscription"
    ) {
      rows = rows.filter((row) => {
        if (statusFilter === "no_subscription") {
          return !row.subscription;
        }

        return row.subscription?.status === statusFilter;
      });
    }

    const summary = rows.reduce(
      (accumulator, row) => {
        accumulator.total += 1;
        accumulator.properties += row.portfolio.properties;
        accumulator.units += row.portfolio.units;
        accumulator.tenants += row.portfolio.tenants;

        if (row.subscription?.plan && row.subscription.plan !== "free") {
          accumulator.paid += 1;
        }

        if (row.health.tone === "danger") {
          accumulator.needsAttention += 1;
        }

        return accumulator;
      },
      {
        total: 0,
        paid: 0,
        needsAttention: 0,
        properties: 0,
        units: 0,
        tenants: 0
      }
    );

    return res.json({
      users: rows,
      summary,
      filters: {
        search,
        role,
        plan: planFilter,
        status: statusFilter
      }
    });
  } catch (error) {
    console.error("ADMIN USERS ERROR:", error);
    return res.status(500).json({ message: "Failed to load admin users" });
  }
});

router.get("/growth", auth, requireAdmin, async (req, res) => {
  try {
    const buckets = buildMonthBuckets(6);
    const fromDate = buckets[0].start;

    const [users, properties, units, tenants, subscriptions, paidEvents] =
      await Promise.all([
        User.aggregate([
          {
            $match: {
              createdAt: { $gte: fromDate }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" }
              },
              count: { $sum: 1 }
            }
          }
        ]),
        Property.aggregate([
          {
            $match: {
              createdAt: { $gte: fromDate }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" }
              },
              count: { $sum: 1 }
            }
          }
        ]),
        Unit.aggregate([
          {
            $match: {
              createdAt: { $gte: fromDate }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" }
              },
              count: { $sum: 1 }
            }
          }
        ]),
        Tenant.aggregate([
          {
            $match: {
              createdAt: { $gte: fromDate }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" }
              },
              count: { $sum: 1 }
            }
          }
        ]),
        Subscription.aggregate([
          {
            $match: {
              createdAt: { $gte: fromDate }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" }
              },
              count: { $sum: 1 }
            }
          }
        ]),
        Subscription.find({
          startedAt: { $gte: fromDate }
        })
          .select("plan startedAt")
          .lean()
      ]);

    const paidSubscriptions = Array(buckets.length).fill(0);
    const revenue = Array(buckets.length).fill(0);

    paidEvents.forEach((subscription) => {
      const plan = normalizePlan(subscription.plan);
      const price = PLAN_PRICES[plan] || 0;

      if (plan === "free" || !subscription.startedAt) {
        return;
      }

      const startedAt = new Date(subscription.startedAt);
      const key = `${startedAt.getFullYear()}-${startedAt.getMonth() + 1}`;
      const bucketIndex = buckets.findIndex((bucket) => bucket.key === key);

      if (bucketIndex === -1) {
        return;
      }

      paidSubscriptions[bucketIndex] += 1;
      revenue[bucketIndex] += price;
    });

    return res.json({
      labels: buckets.map((bucket) => bucket.label),
      users: rowsToSeries(users, buckets),
      properties: rowsToSeries(properties, buckets),
      units: rowsToSeries(units, buckets),
      tenants: rowsToSeries(tenants, buckets),
      subscriptions: rowsToSeries(subscriptions, buckets),
      paidSubscriptions,
      revenue
    });
  } catch (error) {
    console.error("ADMIN GROWTH ERROR:", error);
    return res.status(500).json({ message: "Failed to load growth data" });
  }
});

module.exports = router;
