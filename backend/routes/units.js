const express = require("express");
const mongoose = require("mongoose");

const Property = require("../models/Property");
const Unit = require("../models/Unit");
const Lease = require("../models/Lease");
const Subscription = require("../models/Subscription");

const auth = require("../middleware/authMiddleware");

const router = express.Router();

/* =====================================================
CREATE UNIT
===================================================== */
router.post("/", auth, async (req, res) => {


try {

const subscription = await Subscription.findOne({
  user: req.user.id
});

if (!subscription) {
  return res.status(403).json({
    message: "No active subscription found"
  });
}

// check subscription status
if (subscription.status !== "active") {
  return res.status(403).json({
    message: "Your subscription is inactive. Please renew."
  });
}

// check expiry
if (subscription.expiresAt && new Date() > subscription.expiresAt) {

  subscription.status = "expired";
  await subscription.save();

  return res.status(403).json({
    message: "Subscription expired. Please upgrade."
  });
}

const unitCount = await Unit.countDocuments({
  ownerId: req.user.id
});

// -1 means unlimited (Pro plan)
if (subscription.maxUnits !== -1 && unitCount >= subscription.maxUnits) {
  return res.status(403).json({
    message: "Unit limit reached. Upgrade your plan."
  });
}

const {
  propertyId,
  unitLabel,
  floorLevel,
  bedrooms,
  bathrooms,
  sizeSqm,
  defaultRent,
  defaultDeposit,
  utilitiesIncluded,
  notes
} = req.body;

if (!propertyId || !unitLabel) {
  return res.status(400).json({
    message: "Property ID and unit label required"
  });
}

if (!mongoose.isValidObjectId(propertyId)) {
  return res.status(400).json({
    message: "Invalid property ID"
  });
}

const property = await Property.findOne({
  _id: propertyId,
  ownerId: req.user.id
});

if (!property) {
  return res.status(403).json({
    message: "Unauthorized or property not found"
  });
}

const existing = await Unit.findOne({
  propertyId,
  ownerId: req.user.id,
  unitLabel
});

if (existing) {
  return res.status(400).json({
    message: "Unit label already exists in this property"
  });
}

const rent = Number(defaultRent || 0);
const deposit = Number(defaultDeposit || 0);

if (rent < 0 || deposit < 0) {
  return res.status(400).json({
    message: "Invalid rent or deposit amount"
  });
}

const unit = await Unit.create({
  ownerId: req.user.id,
  propertyId,
  unitLabel,
  floorLevel,
  bedrooms,
  bathrooms,
  sizeSqm,
  defaultRent: Math.round(rent * 100) / 100,
  defaultDeposit: Math.round(deposit * 100) / 100,
  utilitiesIncluded,
  notes
});

res.json({ success: true, unit });


} catch (err) {
console.error("UNIT CREATE ERROR:", err);
res.status(500).json({ message: "Server error" });
}
});

/* =====================================================
GET UNITS BY PROPERTY
===================================================== */
router.get("/by-property/:propertyId", auth, async (req, res) => {
try {


if (!mongoose.isValidObjectId(req.params.propertyId)) {
  return res.status(400).json({
    message: "Invalid property ID"
  });
}

const units = await Unit.find({
  propertyId: req.params.propertyId,
  ownerId: req.user.id
}).sort({ unitLabel: 1 }).lean();

const unitIds = units.map(u => u._id);

const activeLeases = await Lease.find({
  unitId: { $in: unitIds },
  ownerId: req.user.id,
  status: "Active"
}).select("unitId");

const occupiedSet = new Set(
  activeLeases.map(l => l.unitId.toString())
);

const result = units.map(u => ({
  ...u,
  status: occupiedSet.has(u._id.toString())
    ? "Occupied"
    : "Vacant"
}));

res.json({ success: true, units: result });


} catch (err) {
console.error("LIST UNITS ERROR:", err);
res.status(500).json({ message: "Server error" });
}
});

/* =====================================================
GET SINGLE UNIT
===================================================== */
router.get("/:id", auth, async (req, res) => {
try {


if (!mongoose.isValidObjectId(req.params.id)) {
  return res.status(400).json({
    message: "Invalid unit ID"
  });
}

const unit = await Unit.findOne({
  _id: req.params.id,
  ownerId: req.user.id
}).lean();

if (!unit) {
  return res.status(404).json({
    message: "Unit not found"
  });
}

const activeLease = await Lease.findOne({
  unitId: unit._id,
  ownerId: req.user.id,
  status: "Active"
}).lean();

res.json({
  success: true,
  unit,
  occupancy: activeLease ? "Occupied" : "Vacant",
  lease: activeLease || null
});


} catch (err) {
console.error("GET UNIT ERROR:", err);
res.status(500).json({ message: "Server error" });
}
});

/* =====================================================
UPDATE UNIT
===================================================== */
router.put("/:id", auth, async (req, res) => {
try {


if (!mongoose.isValidObjectId(req.params.id)) {
  return res.status(400).json({
    message: "Invalid unit ID"
  });
}

const updated = await Unit.findOneAndUpdate(
  { _id: req.params.id, ownerId: req.user.id },
  req.body,
  { new: true }
).lean();

if (!updated) {
  return res.status(404).json({
    message: "Unit not found"
  });
}

res.json({ success: true, unit: updated });


} catch (err) {
console.error("UNIT UPDATE ERROR:", err);
res.status(500).json({ message: "Server error" });
}
});

/* =====================================================
DELETE UNIT
===================================================== */
router.delete("/:id", auth, async (req, res) => {

const session = await mongoose.startSession();

try {


session.startTransaction();

const activeLease = await Lease.findOne({
  unitId: req.params.id,
  ownerId: req.user.id,
  status: "Active"
}).session(session);

if (activeLease) {
  await session.abortTransaction();
  session.endSession();
  return res.status(400).json({
    message: "Cannot delete unit with active lease"
  });
}

const deleted = await Unit.findOneAndDelete(
  { _id: req.params.id, ownerId: req.user.id },
  { session }
);

if (!deleted) {
  await session.abortTransaction();
  session.endSession();
  return res.status(404).json({
    message: "Unit not found"
  });
}

await session.commitTransaction();
session.endSession();

res.json({ success: true });


} catch (err) {
await session.abortTransaction();
session.endSession();
console.error("UNIT DELETE ERROR:", err);
res.status(500).json({ message: "Server error" });
}
});

module.exports = router;
