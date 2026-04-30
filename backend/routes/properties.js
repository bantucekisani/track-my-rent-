const express = require("express");
const mongoose = require("mongoose");
const Property = require("../models/Property");
const Unit = require("../models/Unit");
const Lease = require("../models/Lease");
const FinancialSettings = require("../models/Financial-Settings");
const auth = require("../middleware/authMiddleware");
const renderHTMLToPDF = require("../utils/pdf/renderHTMLToPDF");
const generateTabularReportHTML =
  require("../utils/pdf/generateTabularReportHTML");

const router = express.Router();

/* ============================
   HELPER: Get Unit Counts (FAST)
============================ */
async function getUnitCounts(ownerId) {
  const counts = await Unit.aggregate([
    {
      $lookup: {
        from: "properties",
        localField: "propertyId",
        foreignField: "_id",
        as: "property"
      }
    },
    { $unwind: "$property" },
    { $match: { "property.ownerId": new mongoose.Types.ObjectId(ownerId) } },
    {
      $group: {
        _id: "$propertyId",
        count: { $sum: 1 }
      }
    }
  ]);

  const map = {};
  counts.forEach(c => {
    map[c._id.toString()] = c.count;
  });

  return map;
}

/* ============================
   EXPORT PROPERTIES (PDF)
============================ */
router.get("/export/pdf", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const settings =
      (await FinancialSettings.findOne({ ownerId }).lean()) || {};
    const locale = settings?.preferences?.locale || "en-ZA";

    const properties = await Property.find({ ownerId }).lean();
    const unitMap = await getUnitCounts(ownerId);
    const propertyIds = properties.map(property => property._id);
    const activeLeaseCounts = propertyIds.length
      ? await Lease.aggregate([
          {
            $match: {
              ownerId: new mongoose.Types.ObjectId(ownerId),
              propertyId: { $in: propertyIds },
              status: "Active"
            }
          },
          {
            $group: {
              _id: "$propertyId",
              occupied: { $sum: 1 }
            }
          }
        ])
      : [];
    const occupiedMap = {};

    activeLeaseCounts.forEach(entry => {
      occupiedMap[String(entry._id)] = entry.occupied;
    });

    const enriched = properties.map(p => ({
      ...p,
      unitCount: unitMap[p._id.toString()] || 0,
      occupiedCount: occupiedMap[p._id.toString()] || 0,
      address: [
        p.addressLine1,
        p.addressLine2,
        p.city,
        p.province,
        p.postalCode,
        p.country
      ].filter(Boolean).join(", ")
    }));
    const totals = enriched.reduce(
      (acc, property) => {
        acc.units += Number(property.unitCount || 0);
        acc.occupied += Number(property.occupiedCount || 0);
        return acc;
      },
      { units: 0, occupied: 0 }
    );
    const html = await generateTabularReportHTML({
      title: "Property Portfolio",
      subtitle: "Buildings, complexes, and houses currently captured in Track My Rent.",
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Properties", value: String(enriched.length) },
        { label: "Units", value: String(totals.units) },
        { label: "Occupied", value: String(totals.occupied) },
        {
          label: "Occupancy",
          value: totals.units
            ? `${((totals.occupied / totals.units) * 100).toFixed(1)}%`
            : "0.0%"
        }
      ],
      columns: ["Property", "Address", "Units", "Occupied", "Vacant"],
      rows: enriched.map(property => {
        const occupied = Number(property.occupiedCount || 0);
        const units = Number(property.unitCount || 0);
        const vacant = Math.max(units - occupied, 0);

        return [
          property.name || "-",
          property.address || "-",
          String(units),
          String(occupied),
          String(vacant)
        ];
      }),
      emptyMessage: "No properties have been added yet."
    });

    const pdf = await renderHTMLToPDF(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=properties.pdf");
    res.setHeader("Content-Length", pdf.length);

    res.end(pdf);

  } catch (err) {
    console.error("PROPERTIES PDF ERROR:", err);
    res.status(500).json({ message: "Failed to export properties PDF" });
  }
});

/* ============================
   EXPORT PROPERTIES (CSV)
============================ */
router.get("/export", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;

    const properties = await Property.find({ ownerId }).lean();
    const unitMap = await getUnitCounts(ownerId);

    const rows = ["Name,Address,Units"];

    for (const p of properties) {
      const address = [
        p.addressLine1,
        p.addressLine2,
        p.city,
        p.province,
        p.postalCode,
        p.country
      ].filter(Boolean).join(" ");

      rows.push(
        `"${p.name}","${address}",${unitMap[p._id.toString()] || 0}`
      );
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=properties.csv");

    res.send(rows.join("\n"));

  } catch (err) {
    console.error("PROPERTY EXPORT ERROR:", err);
    res.status(500).json({ message: "Failed to export properties" });
  }
});

/* ============================
   CREATE PROPERTY
============================ */
router.post("/", auth, async (req, res) => {
  try {
    if (!req.body.name) {
      return res.status(400).json({ message: "Property name required" });
    }

    const property = await Property.create({
      ownerId: req.user.id,
      ...req.body
    });

    res.json({ success: true, property });

  } catch (err) {
    console.error("PROPERTY CREATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================
   LIST PROPERTIES (PAGINATED)
============================ */
router.get("/", auth, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const properties = await Property.find({ ownerId })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const total = await Property.countDocuments({ ownerId });
    const unitMap = await getUnitCounts(ownerId);

    const result = properties.map(p => ({
      ...p,
      unitCount: unitMap[p._id.toString()] || 0
    }));

    res.json({
      success: true,
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
      properties: result
    });

  } catch (err) {
    console.error("PROPERTY LIST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================
   GET SINGLE PROPERTY
============================ */
router.get("/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid property id" });
    }

    const property = await Property.findOne({
      _id: req.params.id,
      ownerId: req.user.id
    }).lean();

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const unitCount = await Unit.countDocuments({
      propertyId: property._id
    });

    res.json({ success: true, property, unitCount });

  } catch (err) {
    console.error("GET PROPERTY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================
   UPDATE PROPERTY
============================ */
router.put("/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid property id" });
    }

    const updated = await Property.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.id },
      req.body,
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Property not found" });
    }

    res.json({ success: true, property: updated });

  } catch (err) {
    console.error("PROPERTY UPDATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================
   DELETE PROPERTY (TRANSACTION SAFE)
============================ */
router.delete("/:id", auth, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    if (!mongoose.isValidObjectId(req.params.id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid property id" });
    }

    const deleted = await Property.findOneAndDelete(
      { _id: req.params.id, ownerId: req.user.id },
      { session }
    );

    if (!deleted) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Property not found" });
    }

    await Unit.deleteMany(
      { propertyId: deleted._id },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("PROPERTY DELETE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
