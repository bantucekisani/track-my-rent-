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
      User.countDocuments({ role: "owner" }),
      Property.countDocuments(),
      Unit.countDocuments(),
      Unit.countDocuments({ status: "Occupied" }),
      Unit.countDocuments({ status: "Vacant" }),
      Tenant.countDocuments(),
      Tenant.countDocuments({ status: "active" }),
      Lease.countDocuments({ status: "Active" }),
      User.countDocuments({
        role: "owner",
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

router.get("/growth", auth, requireAdmin, async (req, res) => {
  try {
    const buckets = buildMonthBuckets(6);
    const fromDate = buckets[0].start;

    const [users, properties, units, tenants, subscriptions, paidEvents] =
      await Promise.all([
        User.aggregate([
          {
            $match: {
              role: "owner",
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
