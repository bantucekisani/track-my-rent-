const express = require("express");
const router = express.Router();

const Subscription = require("../models/Subscription");
const Unit = require("../models/Unit");
const auth = require("../middleware/authMiddleware");

/* =========================================
   UPGRADE PLAN
========================================= */

router.post("/upgrade", auth, async (req, res) => {

  const { plan } = req.body;

  let maxUnits = 2;

  if (plan === "Starter") maxUnits = 10;
  if (plan === "Growth") maxUnits = 50;
  if (plan === "Pro") maxUnits = -1;

  await Subscription.updateOne(
    { user: req.user.id },
    {
      plan,
      maxUnits,
      status: "active",
      startedAt: new Date()
    },
    { upsert: true } // ensures subscription exists
  );

  res.json({ message: "Subscription upgraded" });

});

/* =========================================
   GET SUBSCRIPTION STATUS
========================================= */

router.get("/status", auth, async (req, res) => {

  let subscription = await Subscription.findOne({
    user: req.user.id
  });

  // create free subscription if none exists
  if (!subscription) {
    subscription = await Subscription.create({
      user: req.user.id
    });
  }

  const unitsUsed = await Unit.countDocuments({
 ownerId: req.user.id
  });

  res.json({
    plan: subscription.plan,
    maxUnits: subscription.maxUnits,
    unitsUsed
  });

});

module.exports = router;