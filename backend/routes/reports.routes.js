const express = require("express");
const auth = require("../middleware/authMiddleware");
const mongoose = require("mongoose");
/* =======================
   MODELS
======================= */
const LedgerEntry = require("../models/LedgerEntry");
const Tenant = require("../models/Tenant");
const Lease = require("../models/Lease");
const Property = require("../models/Property");
const Unit = require("../models/Unit");
const BusinessSettings = require("../models/BusinessSettings");
const FinancialSettings = require("../models/Financial-Settings");
/* =======================
   UTILS
======================= */
const sendEmail = require("../utils/email/sendEmail");
const generateTenantStatementHTML = require("../utils/pdf/generateTenantStatementHTML"); 
const renderHTMLToPDF = require("../utils/pdf/renderHTMLToPDF");
const generatePropertyPerformanceHTML =
  require("../utils/pdf/generatePropertyPerformanceHTML");
const generateTabularReportHTML =
  require("../utils/pdf/generateTabularReportHTML");
const {
  calculateMonthlyIncomeByProperty,
  calculateProfitLoss,
  calculatePropertyPerformance,
  calculateRentSummary,
  calculateYearlyIncomeTrend,
  filterEntriesByPeriod
} = require("../utils/reportSummaryUtils");


const router = express.Router();

function parseMonthYear(month, year) {
  const monthNum = Number(month);
  const yearNum = Number(year);

  if (
    !Number.isInteger(monthNum) ||
    !Number.isInteger(yearNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return null;
  }

  return { monthNum, yearNum };
}

function parseOptionalPropertyId(propertyId) {
  if (!propertyId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    return null;
  }

  return new mongoose.Types.ObjectId(propertyId);
}

async function loadFinancialPreferences(ownerId) {
  const settings =
    (await FinancialSettings.findOne({ ownerId }).lean()) || {};

  return {
    currency: settings?.preferences?.currency || "ZAR",
    locale: settings?.preferences?.locale || "en-ZA"
  };
}

function formatCurrency(locale, currency, value) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(Number(value || 0));
}

function formatMonthLabel(year, month, locale, monthStyle = "long") {
  return new Date(year, month - 1, 1).toLocaleString(locale, {
    month: monthStyle,
    year: "numeric"
  });
}

function formatPaymentMethod(method) {
  const value = String(method || "eft").trim().toLowerCase();

  if (!value) {
    return "EFT";
  }

  const labels = {
    eft: "EFT",
    cash: "Cash",
    card: "Card",
    debit_order: "Debit Order",
    debitorder: "Debit Order",
    other: "Other"
  };

  if (labels[value]) {
    return labels[value];
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadScopedProperty(ownerId, propertyId) {
  if (!propertyId) {
    return null;
  }

  return Property.findOne({
    _id: propertyId,
    ownerId
  }).lean();
}

async function sendTabularPdfReport(res, {
  title,
  subtitle,
  generatedAt,
  summaryItems,
  columns,
  rows,
  filename,
  emptyMessage
}) {
  const html = await generateTabularReportHTML({
    title,
    subtitle,
    generatedAt,
    summaryItems,
    columns,
    rows,
    emptyMessage
  });
  const pdf = await renderHTMLToPDF(html);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${filename}`
  );
  res.end(pdf);
}

async function loadPeriodLedgerEntries(ownerId, { month, year, propertyId, types }) {
  const query = {
    ownerId,
    periodMonth: month,
    periodYear: year
  };

  if (Array.isArray(types) && types.length) {
    query.type = { $in: types };
  }

  if (propertyId) {
    query.propertyId = propertyId;
  }

  return LedgerEntry.find(query).lean();
}

async function buildArrearsReportData(ownerId) {
  const settings =
    (await FinancialSettings.findOne({ ownerId }).lean()) || {};

  const currencyDefault =
    settings?.preferences?.currency || "ZAR";

  const locale =
    settings?.preferences?.locale || "en-ZA";

  const balances = await LedgerEntry.aggregate([
    {
      $match: {
        ownerId,
        tenantId: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: {
          tenantId: "$tenantId",
          currency: { $ifNull: ["$currency", currencyDefault] }
        },
        totalExpected: {
          $sum: {
            $cond: [
              { $gt: ["$debit", 0] },
              { $ifNull: ["$debit", 0] },
              0
            ]
          }
        },
        totalPaid: {
          $sum: {
            $cond: [
              { $gt: ["$credit", 0] },
              { $ifNull: ["$credit", 0] },
              0
            ]
          }
        }
      }
    },
    {
      $addFields: {
        balance: {
          $subtract: ["$totalExpected", "$totalPaid"]
        }
      }
    },
    {
      $match: { balance: { $gt: 0.01 } }
    },
    {
      $lookup: {
        from: "tenants",
        localField: "_id.tenantId",
        foreignField: "_id",
        as: "tenant"
      }
    },
    { $unwind: "$tenant" },
    {
      $lookup: {
        from: "leases",
        let: { tenantId: "$_id.tenantId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$tenantId", "$$tenantId"] },
              status: "Active"
            }
          },
          { $limit: 1 }
        ],
        as: "lease"
      }
    },
    {
      $unwind: {
        path: "$lease",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: "properties",
        localField: "lease.propertyId",
        foreignField: "_id",
        as: "property"
      }
    },
    {
      $lookup: {
        from: "units",
        localField: "lease.unitId",
        foreignField: "_id",
        as: "unit"
      }
    },
    {
      $addFields: {
        propertyName: {
          $ifNull: [{ $arrayElemAt: ["$property.name", 0] }, "-"]
        },
        unitLabel: {
          $ifNull: [{ $arrayElemAt: ["$unit.unitLabel", 0] }, "-"]
        }
      }
    }
  ]);

  const totalsByCurrency = {};

  balances.forEach(balance => {
    const currency = balance._id.currency || currencyDefault;

    if (!totalsByCurrency[currency]) {
      totalsByCurrency[currency] = 0;
    }

    totalsByCurrency[currency] += Number(balance.balance || 0);
  });

  Object.keys(totalsByCurrency).forEach(currency => {
    totalsByCurrency[currency] =
      Number(totalsByCurrency[currency].toFixed(2));
  });

  const arrears = balances.map(balance => ({
    tenantId: balance._id.tenantId,
    currency: balance._id.currency || currencyDefault,
    tenantName: balance.tenant?.fullName || "-",
    tenantPhone: balance.tenant?.phone || "",
    tenantWhatsapp: balance.tenant?.whatsappNumber || "",
    whatsappOptIn: Boolean(balance.tenant?.whatsappOptIn),
    property: balance.propertyName || "-",
    unit: balance.unitLabel || "-",
    expected: Number((balance.totalExpected || 0).toFixed(2)),
    paid: Number((balance.totalPaid || 0).toFixed(2)),
    outstanding: Number((balance.balance || 0).toFixed(2))
  }));

  return {
    count: balances.length,
    currency: currencyDefault,
    locale,
    totalsByCurrency,
    arrears
  };
}

async function buildTenantStatementData({ tenantId, year, month, ownerId }) {
  try {

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const yearNum = Number(year);
    const monthNum = Number(month);

    if (
      isNaN(yearNum) ||
      isNaN(monthNum) ||
      monthNum < 1 ||
      monthNum > 12
    ) {
      throw new Error("Invalid month or year");
    }



    /* =========================
       TENANT
    ========================= */

    const tenant = await Tenant.findOne({
      _id: tenantObjectId,
      ownerId: ownerObjectId
    }).lean();

    if (!tenant) throw new Error("Tenant not found");

    /* =========================
       FINANCIAL SETTINGS
    ========================= */

    const settings =
      (await FinancialSettings.findOne({
        ownerId: ownerObjectId
      }).lean()) || {};

    const currency =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency
    });

    /* =========================
       OPENING BALANCE
    ========================= */

    const openingAgg = await LedgerEntry.aggregate([
      {
        $match: {
          ownerId: ownerObjectId,
          tenantId: tenantObjectId,
          $or: [
            { periodYear: { $lt: yearNum } },
            {
              periodYear: yearNum,
           periodMonth: { $lt: monthNum }
            }
          ]
        }
      },
      {
        $group: {
          _id: null,
          balance: {
            $sum: {
              $subtract: [
                { $ifNull: ["$debit", 0] },
                { $ifNull: ["$credit", 0] }
              ]
            }
          }
        }
      }
    ]);

    let runningBalance =
      Number(openingAgg[0]?.balance || 0);

    runningBalance =
      Math.round(runningBalance * 100) / 100;

    /* =========================
       CURRENT MONTH ENTRIES
    ========================= */

    const entries = await LedgerEntry.find({
      ownerId: ownerObjectId,
      tenantId: tenantObjectId,
      periodYear: yearNum,
      periodMonth: monthNum
    })
      .sort({ date: 1, _id: 1 }) // stable order
      .lean();

    const rows = [
      {
        period: "Opening Balance",
        description: "Balance brought forward",
        debit: 0,
        credit: 0,
        balance: runningBalance
      }
    ];

    entries.forEach(e => {

      const debit =
        Math.round(Number(e.debit || 0) * 100) / 100;

      const credit =
        Math.round(Number(e.credit || 0) * 100) / 100;

      runningBalance += debit - credit;

      runningBalance =
        Math.round(runningBalance * 100) / 100;

      rows.push({
        period: `${yearNum}-${String(monthNum).padStart(2, "0")}`,
        description: e.description || "",
        debit,
        credit,
        balance: runningBalance
      });

    });

    /* =========================
       SUMMARY
    ========================= */

    const totalCharged = entries.reduce(
      (sum, e) => sum + Number(e.debit || 0),
      0
    );

    const totalPaid = entries.reduce(
      (sum, e) => sum + Number(e.credit || 0),
      0
    );

    const summary = {
      totalCharged: Math.round(totalCharged * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      balance: runningBalance
    };

    /* =========================
       LEASE + PROPERTY
    ========================= */

    const lease = await Lease.findOne({
      tenantId: tenantObjectId,
      ownerId: ownerObjectId,
      status: "Active"
    })
      .populate("propertyId unitId")
      .lean();

    let rentalAddress = null;

    if (lease?.propertyId) {
      rentalAddress =
        lease.propertyId.address ||
        lease.propertyId.name ||
        null;
    }

    /* =========================
       BUSINESS SETTINGS
    ========================= */

    const business =
      (await BusinessSettings.findOne({
        ownerId: ownerObjectId
      }).lean()) || {};

    /* =========================
       RETURN
    ========================= */

    return {
      tenant,
      lease,
      business,
      rentalAddress,
      rows,
      summary,
      locale,
      currency,
      formatter,
      year: yearNum,
      month: monthNum
    };

  } catch (err) {

    console.error("BUILD TENANT STATEMENT DATA ERROR:", err);

    throw err;

  }
}

router.get("/monthly-income", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const parsed = parseMonthYear(req.query.month, req.query.year);

    if (!parsed) {
      return res.status(400).json({
        message: "Valid month (1-12) and year required"
      });
    }

    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    const { currency, locale } = await loadFinancialPreferences(ownerId);
    const propertyQuery = { ownerId };

    if (propertyId) {
      propertyQuery._id = propertyId;
    }

    const properties = await Property.find(propertyQuery).lean();
    const propertyIds = properties.map(property => property._id);

    const ledger = propertyIds.length
      ? await LedgerEntry.find({
          ownerId,
          propertyId: { $in: propertyIds },
          periodMonth: parsed.monthNum,
          periodYear: parsed.yearNum,
          type: { $in: ["rent", "payment"] }
        }).lean()
      : [];

    const rows = calculateMonthlyIncomeByProperty(properties, ledger);

    res.json({
      success: true,
      currency,
      locale,
      month: parsed.monthNum,
      year: parsed.yearNum,
      rows
    });
  } catch (err) {
    console.error("MONTHLY INCOME REPORT ERROR:", err);
    res.status(500).json({
      message: "Failed to load monthly income"
    });
  }
});

router.get("/monthly-income/pdf", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const parsed = parseMonthYear(req.query.month, req.query.year);

    if (!parsed) {
      return res.status(400).json({
        message: "Valid month (1-12) and year required"
      });
    }

    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    const { currency, locale } = await loadFinancialPreferences(ownerId);
    const scopedProperty = await loadScopedProperty(ownerId, propertyId);

    if (propertyId && !scopedProperty) {
      return res.status(404).json({
        message: "Property not found"
      });
    }

    const propertyQuery = { ownerId };

    if (propertyId) {
      propertyQuery._id = propertyId;
    }

    const properties = await Property.find(propertyQuery).lean();
    const propertyIds = properties.map(property => property._id);

    const ledger = propertyIds.length
      ? await LedgerEntry.find({
          ownerId,
          propertyId: { $in: propertyIds },
          periodMonth: parsed.monthNum,
          periodYear: parsed.yearNum,
          type: { $in: ["rent", "payment"] }
        }).lean()
      : [];

    const rows = calculateMonthlyIncomeByProperty(properties, ledger);

    const totals = rows.reduce(
      (acc, row) => {
        acc.expected += Number(row.expected || 0);
        acc.collected += Number(row.collected || 0);
        acc.outstanding += Number(row.outstanding || 0);
        return acc;
      },
      { expected: 0, collected: 0, outstanding: 0 }
    );

    await sendTabularPdfReport(res, {
      title: "Monthly Income by Property",
      subtitle:
        `${formatMonthLabel(parsed.yearNum, parsed.monthNum, locale)} · ` +
        `${scopedProperty?.name || "All properties"}`,
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Properties covered", value: String(rows.length) },
        { label: "Expected", value: formatCurrency(locale, currency, totals.expected) },
        { label: "Collected", value: formatCurrency(locale, currency, totals.collected) },
        { label: "Outstanding", value: formatCurrency(locale, currency, totals.outstanding) }
      ],
      columns: ["Property", "Expected", "Collected", "Outstanding"],
      rows: rows.map(row => [
        row.propertyName,
        formatCurrency(locale, currency, row.expected),
        formatCurrency(locale, currency, row.collected),
        formatCurrency(locale, currency, row.outstanding)
      ]),
      filename:
        `monthly-income-${parsed.yearNum}-${String(parsed.monthNum).padStart(2, "0")}.pdf`,
      emptyMessage: "No monthly income data for the selected filters."
    });
  } catch (err) {
    console.error("MONTHLY INCOME PDF ERROR:", err);
    res.status(500).json({
      message: "Failed to export report"
    });
  }
});

router.get("/property-performance", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const parsed = parseMonthYear(req.query.month, req.query.year);

    if (!parsed) {
      return res.status(400).json({
        message: "Valid month (1-12) and year required"
      });
    }

    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    const { currency, locale } = await loadFinancialPreferences(ownerId);
    const propertyQuery = { ownerId };

    if (propertyId) {
      propertyQuery._id = propertyId;
    }

    const properties = await Property.find(propertyQuery).lean();
    const propertyIds = properties.map(property => property._id);

    const [units, leases, ledger] = propertyIds.length
      ? await Promise.all([
          Unit.find({
            propertyId: { $in: propertyIds }
          }).lean(),
          Lease.find({
            ownerId,
            propertyId: { $in: propertyIds },
            status: "Active"
          }).lean(),
          LedgerEntry.find({
            ownerId,
            propertyId: { $in: propertyIds },
            periodMonth: parsed.monthNum,
            periodYear: parsed.yearNum,
            type: { $in: ["rent", "payment"] }
          }).lean()
        ])
      : [[], [], []];

    const rows = calculatePropertyPerformance(
      properties,
      units,
      leases,
      ledger
    );

    res.json({
      success: true,
      currency,
      locale,
      month: parsed.monthNum,
      year: parsed.yearNum,
      rows
    });
  } catch (err) {
    console.error("PROPERTY PERFORMANCE REPORT ERROR:", err);
    res.status(500).json({
      message: "Failed to load property performance"
    });
  }
});
/* =====================================================
   EMAIL TENANT STATEMENT
===================================================== */
router.post(
  "/tenant-statement/:tenantId/:year/:month/email",
  auth,
  async (req, res) => {
    try {

      const ownerId = new mongoose.Types.ObjectId(req.user.id);
      const tenantId = new mongoose.Types.ObjectId(req.params.tenantId);

      const yearNum = Number(req.params.year);
      const monthNum = Number(req.params.month);

      if (!mongoose.isValidObjectId(tenantId)) {
        return res.status(400).json({
          message: "Invalid tenant id"
        });
      }

     

      /* =========================
         LOAD TENANT
      ========================= */

      const tenant = await Tenant.findOne({
        _id: tenantId,
        ownerId
      }).lean();

      if (!tenant) {
        return res.status(404).json({
          message: "Tenant not found"
        });
      }

      if (!tenant.email) {
        return res.status(400).json({
          message: "Tenant email missing"
        });
      }

      /* =========================
         BUILD STATEMENT DATA
      ========================= */

      const data = await buildTenantStatementData({
        tenantId,
        year: yearNum,
        month: monthNum,
        ownerId
      });

      /* =========================
         GENERATE PDF
      ========================= */

      const pdfBuffer = await generateTenantStatementHTML({
        ...data,

        generatedAt: new Date().toLocaleDateString(data.locale),

        referenceNumber:
          `TS-${tenantId.toString().slice(-5)}-${yearNum}${String(monthNum).padStart(2,"0")}`,

        logoUrl: data.business?.logoUrl
          ? `${req.protocol}://${req.get("host")}${data.business.logoUrl}`
          : null
      });

      /* =========================
         MONTH LABEL
      ========================= */

      const label = new Date(yearNum, monthNum - 1).toLocaleString(
        data.locale,
        {
          month: "long",
          year: "numeric"
        }
      );

      /* =========================
         SEND EMAIL
      ========================= */

      await sendEmail({

        to: tenant.email,

        subject: `Tenant Statement - ${label}`,

        text:
          `Please find your tenant statement for ${label} attached.`,

        attachments: [
          {
            filename:
              `tenant-statement-${yearNum}-${String(monthNum).padStart(2,"0")}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf"
          }
        ]

      });

      res.json({
        success: true,
        message: "Statement emailed successfully"
      });

    } catch (err) {

      console.error("STATEMENT EMAIL ERROR:");
      console.error(err);

      res.status(500).json({
        message: err.message || "Failed to email statement"
      });

    }
  }
);
/* =====================================================
   PREVIEW TENANT STATEMENT (GET VERSION)
===================================================== */
/* =====================================================
   PREVIEW TENANT STATEMENT
===================================================== */

router.get(
  "/tenant-statement/:tenantId/:year/:month",
  auth,
  async (req, res) => {
    try {

      const ownerId = new mongoose.Types.ObjectId(req.user.id);
      const tenantId = req.params.tenantId;

      if (!mongoose.isValidObjectId(tenantId)) {
        return res.status(400).json({
          message: "Invalid tenant id"
        });
      }

      const yearNum = Number(req.params.year);
      const monthNum = Number(req.params.month);

      if (
        isNaN(yearNum) ||
        isNaN(monthNum) ||
        monthNum < 1 ||
        monthNum > 12
      ) {
        return res.status(400).json({
          message: "Invalid month or year"
        });
      }

      const data = await buildTenantStatementData({
        tenantId,
        year: yearNum,
        month: monthNum,
        ownerId
      });

      res.json({
        success: true,
        ...data
      });

    } catch (err) {

      console.error("STATEMENT PREVIEW ERROR:", err);

      res.status(500).json({
        message: "Failed to load statement preview"
      });

    }
  }
);


/* =====================================================
   DOWNLOAD TENANT STATEMENT PDF
===================================================== */

router.get(
  "/tenant-statement/:tenantId/:year/:month/pdf",
  auth,
  async (req, res) => {
    try {

      const ownerId = new mongoose.Types.ObjectId(req.user.id);
      const tenantId = req.params.tenantId;

      if (!mongoose.isValidObjectId(tenantId)) {
        return res.status(400).json({
          message: "Invalid tenant id"
        });
      }

      const yearNum = Number(req.params.year);
      const monthNum = Number(req.params.month);

      if (
        isNaN(yearNum) ||
        isNaN(monthNum) ||
        monthNum < 1 ||
        monthNum > 12
      ) {
        return res.status(400).json({
          message: "Invalid month or year"
        });
      }

      const data = await buildTenantStatementData({
        tenantId,
        year: yearNum,
        month: monthNum,
        ownerId
      });

      const pdfBuffer = await generateTenantStatementHTML({
        ...data,

        generatedAt: new Date().toLocaleDateString(data.locale),

        referenceNumber:
          `TS-${tenantId.slice(-5)}-${yearNum}${String(monthNum).padStart(2,"0")}`,

        logoUrl: data.business?.logoUrl
          ? `${req.protocol}://${req.get("host")}${data.business.logoUrl}`
          : null
      });

      res.setHeader("Content-Type", "application/pdf");

      res.setHeader(
        "Content-Disposition",
        `inline; filename=tenant-statement-${yearNum}-${String(monthNum).padStart(2,"0")}.pdf`
       );

      res.end(pdfBuffer);

    } catch (err) {

      console.error("TENANT PDF ERROR:", err);

      res.status(500).json({
        message: "Failed to generate PDF"
      });

    }
  }
);
/* =====================================================
   PROPERTY PERFORMANCE PDF (FIXED)
===================================================== */
router.get("/property-performance/pdf", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    const parsed = parseMonthYear(req.query.month, req.query.year);

    if (!parsed) {
      return res.status(400).json({
        message: "Valid month (1-12) and year required"
      });
    }
    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

  
    /* =========================
       LOAD FINANCIAL SETTINGS
    ========================= */

    const { currency, locale } = await loadFinancialPreferences(ownerId);

    /* =========================
       FETCH EVERYTHING
    ========================= */

    const propertyQuery = { ownerId };

    if (propertyId) {
      propertyQuery._id = propertyId;
    }

    const properties = await Property.find(propertyQuery).lean();
    const propertyIds = properties.map(p => p._id);

    const [units, leases, ledger] = propertyIds.length
      ? await Promise.all([
          Unit.find({
            propertyId: { $in: propertyIds }
          }).lean(),
          Lease.find({
            ownerId,
            propertyId: { $in: propertyIds },
            status: "Active"
          }).lean(),
          LedgerEntry.find({
            ownerId,
            propertyId: { $in: propertyIds },
            periodMonth: parsed.monthNum,
            periodYear: parsed.yearNum,
            type: { $in: ["rent", "payment"] }
          }).lean()
        ])
      : [[], [], []];

    const rows = calculatePropertyPerformance(
      properties,
      units,
      leases,
      ledger
    ).map(row => ({
      name: row.propertyName,
      units: row.units,
      occupied: row.occupied,
      vacant: row.vacant,
      occupancy: row.occupancyPct,
      expected: row.expected,
      collected: row.collected,
      outstanding: row.outstanding
    }));

    /* =========================
       GENERATE HTML
    ========================= */

    const html = await generatePropertyPerformanceHTML({
      rows,
      currency,
      locale,
      generatedAt: new Date().toLocaleDateString(locale)
    });

    const pdf = await renderHTMLToPDF(html);

    /* =========================
       RESPONSE
    ========================= */

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=property-performance.pdf"
    );

    res.end(pdf);

  } catch (err) {
    console.error("PROPERTY PERFORMANCE PDF ERROR:", err);
    res.status(500).json({
      message: "Failed to export report"
    });
  }
});
/* =====================================================
   profi-loss
===================================================== */
router.get("/profit-loss", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const parsed = parseMonthYear(req.query.month, req.query.year);

    if (!parsed) {
      return res.status(400).json({
        message: "Invalid month or year"
      });
    }
    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    /* =========================
       LOAD FINANCIAL SETTINGS
    ========================= */

    const { currency, locale } = await loadFinancialPreferences(ownerId);
    const entries = await loadPeriodLedgerEntries(ownerId, {
      month: parsed.monthNum,
      year: parsed.yearNum,
      propertyId,
      types: ["payment", "expense", "maintenance"]
    });
    const summary = calculateProfitLoss(entries);

    res.json({
      currency,
      locale,

      income: summary.income,
      expenses: summary.expenses,
      profit: summary.profit
    });

  } catch (err) {
    console.error("PROFIT & LOSS ERROR:", err);
    res.status(500).json({
      message: "Failed to calculate profit & loss"
    });
  }
});  

router.get("/profit-loss/monthly", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    const { year } = req.query;

    const yearNum =
      year ? Number(year) : new Date().getFullYear();

    if (isNaN(yearNum)) {
      return res.status(400).json({
        message: "Invalid year"
      });
    }
    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    /* =========================
       LOAD FINANCIAL SETTINGS
    ========================= */

    const { currency, locale } = await loadFinancialPreferences(ownerId);
    const query = {
      ownerId,
      periodYear: yearNum,
      type: { $in: ["payment", "expense", "maintenance"] }
    };

    if (propertyId) {
      query.propertyId = propertyId;
    }

    const entries = await LedgerEntry.find(query).lean();
    const months = calculateYearlyIncomeTrend(entries, yearNum).map(month => ({
      ...month,
      label: new Date(yearNum, month.monthIndex - 1).toLocaleString(locale, {
        month: "short",
        year: "numeric"
      })
    }));

    res.json({
      year: yearNum,
      currency,
      locale,
      months
    });

  } catch (err) {
    console.error("MONTHLY P&L ERROR:", err);
    res.status(500).json({
      message: "Failed to load monthly P&L"
    });
  }
});

router.get("/yearly-income-trend/pdf", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const yearNum =
      req.query.year ? Number(req.query.year) : new Date().getFullYear();

    if (isNaN(yearNum)) {
      return res.status(400).json({
        message: "Invalid year"
      });
    }

    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    const { currency, locale } = await loadFinancialPreferences(ownerId);
    const scopedProperty = await loadScopedProperty(ownerId, propertyId);

    if (propertyId && !scopedProperty) {
      return res.status(404).json({
        message: "Property not found"
      });
    }

    const query = {
      ownerId,
      periodYear: yearNum,
      type: { $in: ["payment", "expense", "maintenance"] }
    };

    if (propertyId) {
      query.propertyId = propertyId;
    }

    const entries = await LedgerEntry.find(query).lean();
    const months = calculateYearlyIncomeTrend(entries, yearNum).map(month => ({
      ...month,
      label: formatMonthLabel(yearNum, month.monthIndex, locale, "short")
    }));

    const totalCollected = months.reduce(
      (sum, month) => sum + Number(month.income || 0),
      0
    );
    const averageCollected = months.length
      ? totalCollected / months.length
      : 0;
    const bestMonth =
      months.reduce((best, month) => (
        Number(month.income || 0) > Number(best.income || 0) ? month : best
      ), months[0]) || null;

    await sendTabularPdfReport(res, {
      title: "Yearly Income Trend",
      subtitle: `${yearNum} · ${scopedProperty?.name || "All properties"}`,
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Year", value: String(yearNum) },
        { label: "Total collected", value: formatCurrency(locale, currency, totalCollected) },
        { label: "Average month", value: formatCurrency(locale, currency, averageCollected) },
        {
          label: "Best month",
          value: bestMonth
            ? `${bestMonth.label} · ${formatCurrency(locale, currency, bestMonth.income)}`
            : "-"
        }
      ],
      columns: ["Month", "Collected"],
      rows: months.map(month => [
        month.label,
        formatCurrency(locale, currency, month.income)
      ]),
      filename: `yearly-income-trend-${yearNum}.pdf`,
      emptyMessage: "No yearly income data for the selected filters."
    });
  } catch (err) {
    console.error("YEARLY INCOME TREND PDF ERROR:", err);
    res.status(500).json({
      message: "Failed to export report"
    });
  }
});

router.get("/payment-history/pdf", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const parsed = parseMonthYear(req.query.month, req.query.year);

    if (!parsed) {
      return res.status(400).json({
        message: "Valid month (1-12) and year required"
      });
    }

    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    const { currency, locale } = await loadFinancialPreferences(ownerId);
    const scopedProperty = await loadScopedProperty(ownerId, propertyId);

    if (propertyId && !scopedProperty) {
      return res.status(404).json({
        message: "Property not found"
      });
    }

    const search = String(req.query.search || "").trim().toLowerCase();
    const query = {
      ownerId,
      periodMonth: parsed.monthNum,
      periodYear: parsed.yearNum,
      type: "payment"
    };

    if (propertyId) {
      query.propertyId = propertyId;
    }

    const payments = await LedgerEntry.find(query)
      .populate("tenantId", "fullName")
      .populate("propertyId", "name")
      .populate("unitId", "unitLabel")
      .sort({ date: -1, _id: -1 })
      .lean();

    const rows = payments
      .filter(entry => {
        if (!search) {
          return true;
        }

        const haystack = [
          entry.tenantId?.fullName,
          entry.propertyId?.name,
          entry.unitId?.unitLabel,
          entry.reference,
          entry.description,
          entry.method
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      })
      .map(entry => ({
        tenantName: entry.tenantId?.fullName || "-",
        propertyUnit:
          [entry.propertyId?.name, entry.unitId?.unitLabel]
            .filter(Boolean)
            .join(" / ") || "-",
        amount: Number(entry.credit || 0),
        period: formatMonthLabel(
          entry.periodYear || parsed.yearNum,
          entry.periodMonth || parsed.monthNum,
          locale
        ),
        paidOn: new Date(entry.date).toLocaleDateString(locale),
        method: formatPaymentMethod(entry.method),
        reference: entry.reference || "-"
      }));

    const totalCollected = rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    await sendTabularPdfReport(res, {
      title: "Payment History",
      subtitle:
        `${formatMonthLabel(parsed.yearNum, parsed.monthNum, locale)} · ` +
        `${scopedProperty?.name || "All properties"}` +
        (search ? ` · Search: ${search}` : ""),
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Payments", value: String(rows.length) },
        { label: "Collected", value: formatCurrency(locale, currency, totalCollected) },
        { label: "Scope", value: scopedProperty?.name || "All properties" },
        { label: "Search filter", value: search || "None" }
      ],
      columns: ["Tenant", "Property / Unit", "Amount", "Period", "Paid On", "Method", "Reference"],
      rows: rows.map(row => [
        row.tenantName,
        row.propertyUnit,
        formatCurrency(locale, currency, row.amount),
        row.period,
        row.paidOn,
        row.method,
        row.reference
      ]),
      filename:
        `payment-history-${parsed.yearNum}-${String(parsed.monthNum).padStart(2, "0")}.pdf`,
      emptyMessage: "No payment history data for the selected filters."
    });
  } catch (err) {
    console.error("PAYMENT HISTORY PDF ERROR:", err);
    res.status(500).json({
      message: "Failed to export report"
    });
  }
});

router.get("/profit-loss/monthly/pdf", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const yearNum =
      req.query.year ? Number(req.query.year) : new Date().getFullYear();

    if (isNaN(yearNum)) {
      return res.status(400).json({
        message: "Invalid year"
      });
    }

    const propertyId = parseOptionalPropertyId(req.query.propertyId);

    if (req.query.propertyId && !propertyId) {
      return res.status(400).json({
        message: "Invalid property id"
      });
    }

    const { currency, locale } = await loadFinancialPreferences(ownerId);
    const scopedProperty = await loadScopedProperty(ownerId, propertyId);

    if (propertyId && !scopedProperty) {
      return res.status(404).json({
        message: "Property not found"
      });
    }

    const query = {
      ownerId,
      periodYear: yearNum,
      type: { $in: ["payment", "expense", "maintenance"] }
    };

    if (propertyId) {
      query.propertyId = propertyId;
    }

    const entries = await LedgerEntry.find(query).lean();
    const months = calculateYearlyIncomeTrend(entries, yearNum).map(month => ({
      ...month,
      label: formatMonthLabel(yearNum, month.monthIndex, locale, "short")
    }));

    const totals = months.reduce(
      (acc, month) => {
        acc.income += Number(month.income || 0);
        acc.expenses += Number(month.expenses || 0);
        acc.profit += Number(month.profit || 0);
        return acc;
      },
      { income: 0, expenses: 0, profit: 0 }
    );

    await sendTabularPdfReport(res, {
      title: "Monthly Profit & Loss",
      subtitle: `${yearNum} · ${scopedProperty?.name || "All properties"}`,
      generatedAt: new Date().toLocaleDateString(locale),
      summaryItems: [
        { label: "Total income", value: formatCurrency(locale, currency, totals.income) },
        { label: "Total expenses", value: formatCurrency(locale, currency, totals.expenses) },
        { label: "Net profit", value: formatCurrency(locale, currency, totals.profit) },
        { label: "Year", value: String(yearNum) }
      ],
      columns: ["Month", "Income", "Expenses", "Profit"],
      rows: months.map(month => [
        month.label,
        formatCurrency(locale, currency, month.income),
        formatCurrency(locale, currency, month.expenses),
        formatCurrency(locale, currency, month.profit)
      ]),
      filename: `monthly-profit-loss-${yearNum}.pdf`,
      emptyMessage: "No monthly profit and loss data for the selected filters."
    });
  } catch (err) {
    console.error("MONTHLY PROFIT & LOSS PDF ERROR:", err);
    res.status(500).json({
      message: "Failed to export report"
    });
  }
});
/* ======================================================
   ARREARS REPORT (LEDGER-BASED, ROLLING)
====================================================== */
router.get("/arrears", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);

    /* =========================
       LOAD FINANCIAL SETTINGS
    ========================= */

    const settings =
      (await FinancialSettings.findOne({ ownerId }).lean()) || {};

    const currencyDefault =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* =========================
       AGGREGATE LEDGER
    ========================= */

    const balances = await LedgerEntry.aggregate([

      {
        $match: {
          ownerId,
          tenantId: { $exists: true, $ne: null }
        }
      },

      {
        $group: {
          _id: {
            tenantId: "$tenantId",
            currency: { $ifNull: ["$currency", currencyDefault] }
          },

          totalExpected: {
            $sum: {
              $cond: [
                { $gt: ["$debit", 0] },
                { $ifNull: ["$debit", 0] },
                0
              ]
            }
          },

          totalPaid: {
            $sum: {
              $cond: [
                { $gt: ["$credit", 0] },
                { $ifNull: ["$credit", 0] },
                0
              ]
            }
          }
        }
      },

      {
        $addFields: {
          balance: {
            $subtract: ["$totalExpected", "$totalPaid"]
          }
        }
      },

      {
        $match: { balance: { $gt: 0.01 } }
      },

      /* =========================
         TENANT JOIN
      ========================= */

      {
        $lookup: {
          from: "tenants",
          localField: "_id.tenantId",
          foreignField: "_id",
          as: "tenant"
        }
      },

      { $unwind: "$tenant" },

      /* =========================
         ACTIVE LEASE
      ========================= */

      {
        $lookup: {
          from: "leases",
          let: { tenantId: "$_id.tenantId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$tenantId", "$$tenantId"] },
                status: "Active"
              }
            },
            { $limit: 1 }
          ],
          as: "lease"
        }
      },

      {
        $unwind: {
          path: "$lease",
          preserveNullAndEmptyArrays: true
        }
      },

      /* =========================
         PROPERTY + UNIT
      ========================= */

      {
        $lookup: {
          from: "properties",
          localField: "lease.propertyId",
          foreignField: "_id",
          as: "property"
        }
      },

      {
        $lookup: {
          from: "units",
          localField: "lease.unitId",
          foreignField: "_id",
          as: "unit"
        }
      },

      {
        $addFields: {
          propertyName: {
            $ifNull: [{ $arrayElemAt: ["$property.name", 0] }, "-"]
          },
          unitLabel: {
            $ifNull: [{ $arrayElemAt: ["$unit.unitLabel", 0] }, "-"]
          }
        }
      }

    ]);

    /* =========================
       CALCULATE TOTALS PER CURRENCY
    ========================= */

    const totalsByCurrency = {};

    balances.forEach(b => {

      const c = b._id.currency || currencyDefault;

      if (!totalsByCurrency[c]) totalsByCurrency[c] = 0;

      totalsByCurrency[c] += Number(b.balance || 0);

    });

    Object.keys(totalsByCurrency).forEach(c => {
      totalsByCurrency[c] =
        Number(totalsByCurrency[c].toFixed(2));
    });

    /* =========================
       RESPONSE
    ========================= */

    res.json({

      count: balances.length,

      currency: currencyDefault,
      locale,

      totalsByCurrency,

      arrears: balances.map(b => ({

        tenantId: b._id.tenantId,

        currency: b._id.currency || currencyDefault,

        tenantName: b.tenant?.fullName || "-",

        property: b.propertyName || "-",

        unit: b.unitLabel || "-",

        expected: Number((b.totalExpected || 0).toFixed(2)),

        paid: Number((b.totalPaid || 0).toFixed(2)),

        outstanding: Number((b.balance || 0).toFixed(2))

      }))

    });

  } catch (err) {

    console.error("ARREARS REPORT ERROR:", err);

    res.status(500).json({
      message: "Failed to load arrears"
    });

  }
});

router.get("/arrears/pdf", auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const data = await buildArrearsReportData(ownerId);
    const currencyEntries = Object.entries(data.totalsByCurrency || {});
    const defaultTotal =
      data.totalsByCurrency?.[data.currency] ??
      data.arrears.reduce(
        (sum, row) => sum + Number(row.outstanding || 0),
        0
      );
    const totalLabel = currencyEntries.length > 1
      ? currencyEntries
          .map(([currency, amount]) =>
            formatCurrency(data.locale, currency, amount)
          )
          .join(" | ")
      : formatCurrency(data.locale, data.currency, defaultTotal);
    const rows = [...data.arrears].sort(
      (a, b) => Number(b.outstanding || 0) - Number(a.outstanding || 0)
    );

    await sendTabularPdfReport(res, {
      title: "Rent Arrears",
      subtitle:
        "Rolling tenant balances where total charges are greater than payments received.",
      generatedAt: new Date().toLocaleDateString(data.locale),
      summaryItems: [
        { label: "Tenants in arrears", value: String(data.count) },
        { label: "Total outstanding", value: totalLabel },
        { label: "Currencies", value: String(Math.max(currencyEntries.length, 1)) },
        { label: "Scope", value: "All active balances" }
      ],
      columns: [
        "Tenant",
        "Property / Unit",
        "Expected",
        "Paid",
        "Outstanding",
        "Currency"
      ],
      rows: rows.map(row => [
        row.tenantName,
        [row.property, row.unit].filter(Boolean).join(" / ") || "-",
        formatCurrency(data.locale, row.currency, row.expected),
        formatCurrency(data.locale, row.currency, row.paid),
        formatCurrency(data.locale, row.currency, row.outstanding),
        row.currency
      ]),
      filename: "rent-arrears.pdf",
      emptyMessage: "No tenants are currently in arrears."
    });
  } catch (err) {
    console.error("ARREARS PDF ERROR:", err);
    res.status(500).json({
      message: "Failed to export arrears PDF"
    });
  }
});
/* ======================================================
   ARREARS AGEING REPORT (LEDGER-BASED)
====================================================== */
router.get("/arrears-ageing", auth, async (req, res) => {
  try {

    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const today = new Date();

    /* =========================
       LOAD FINANCIAL SETTINGS
    ========================= */

    const settings =
      (await FinancialSettings.findOne({ ownerId }).lean()) || {};

    const currencyDefault =
      settings?.preferences?.currency || "ZAR";

    const locale =
      settings?.preferences?.locale || "en-ZA";

    /* =========================
       STEP 1: GET ALL DEBITS
    ========================= */

    const debits = await LedgerEntry.aggregate([
      {
        $match: {
          ownerId,
          tenantId: { $exists: true, $ne: null },
          debit: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: {
            tenantId: "$tenantId",
            currency: { $ifNull: ["$currency", currencyDefault] }
          },
          totalDebit: { $sum: { $ifNull: ["$debit", 0] } },
          oldestDebitDate: { $min: "$date" }
        }
      }
    ]);

    /* =========================
       STEP 2: GET ALL CREDITS
    ========================= */

    const credits = await LedgerEntry.aggregate([
      {
        $match: {
          ownerId,
          tenantId: { $exists: true, $ne: null },
          credit: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: {
            tenantId: "$tenantId",
            currency: { $ifNull: ["$currency", currencyDefault] }
          },
          totalCredit: { $sum: { $ifNull: ["$credit", 0] } }
        }
      }
    ]);

    /* =========================
       STEP 3: MAP CREDITS
    ========================= */

    const creditMap = {};

    credits.forEach(c => {

      const key = `${c._id.tenantId}_${c._id.currency}`;

      creditMap[key] = Number(c.totalCredit || 0);

    });

    /* =========================
       STEP 4: BUILD AGEING LIST
    ========================= */

    const ageingList = [];

    for (const d of debits) {

      const key = `${d._id.tenantId}_${d._id.currency}`;

      const paid = creditMap[key] || 0;

      const totalDebit = Number(d.totalDebit || 0);

      const balance = totalDebit - paid;

      if (balance <= 0) continue;

      const days = Math.floor(
        (today - new Date(d.oldestDebitDate)) / 86400000
      );

      ageingList.push({

        tenantId: d._id.tenantId,

        currency: d._id.currency || currencyDefault,

        balance: Number(balance.toFixed(2)),

        daysOutstanding: days,

        bucket:
          days <= 30
            ? "0–30"
            : days <= 60
            ? "31–60"
            : days <= 90
            ? "61–90"
            : "90+"

      });

    }

    /* =========================
       STEP 5: JOIN TENANT DATA
    ========================= */

    const tenantIds = ageingList.map(a => a.tenantId);

    const tenants = await Tenant.find({
      _id: { $in: tenantIds }
    }).select("fullName");

    const tenantMap = {};

    tenants.forEach(t => {

      tenantMap[t._id.toString()] = t.fullName;

    });

    const final = ageingList.map(a => ({

      ...a,

      tenantName: tenantMap[a.tenantId.toString()] || "-"

    }));

    /* =========================
       RESPONSE
    ========================= */

    res.json({

      success: true,

      currency: currencyDefault,

      locale,

      count: final.length,

      arrears: final

    });

  } catch (err) {

    console.error("ARREARS AGEING ERROR:", err);

    res.status(500).json({
      message: "Failed to load arrears ageing"
    });

  }
});

module.exports = router;

