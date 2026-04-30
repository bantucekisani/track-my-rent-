const PDFDocument = require("pdfkit");
require("pdfkit-table");

const LedgerEntry = require("../../models/LedgerEntry");
const Tenant = require("../../models/Tenant");
const Lease = require("../../models/Lease");
const BusinessSettings = require("../../models/BusinessSettings");
const { drawBusinessHeader, drawFooter } = require("./pdfLayout");

function formatCurrency(amount) {
  return `R${(amount || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

module.exports = async function generateTenantStatementPDF({
  res,
  ownerId,
  tenantId,
  year
}) {
  const business = await BusinessSettings.findOne({ ownerId });
  const tenant = await Tenant.findOne({ _id: tenantId, ownerId });
  const lease = await Lease.findOne({
    tenantId,
    ownerId,
    status: "Active"
  }).populate("propertyId unitId");

  const entries = await LedgerEntry.find({
    ownerId,
    tenantId,
    date: {
      $gte: new Date(year, 0, 1),
      $lte: new Date(year, 11, 31)
    }
  }).sort({ date: 1 });

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="tenant-statement-${tenant.fullName}-${year}.pdf"`
  );

  /* ================= HEADER ================= */
  drawBusinessHeader(doc, business, {
    title: "TENANT STATEMENT",
    year
  });

  doc.moveDown();
  doc.font("Helvetica").fontSize(10).fillColor("#111827");
  doc.text(`Tenant: ${tenant.fullName}`);
  doc.text(`Property: ${lease.propertyId?.name || "-"}`);
  doc.text(`Unit: ${lease.unitId?.unitLabel || "-"}`);
  doc.moveDown(1.5);

  /* ================= TABLE DATA ================= */
  let runningBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const datas = entries.map(e => {
    const debit = e.debit || 0;
    const credit = e.credit || 0;

    runningBalance += debit - credit;
    totalDebit += debit;
    totalCredit += credit;

    return {
      period: e.date.toLocaleDateString("en-ZA", {
        month: "long",
        year: "numeric"
      }),
      description: e.description,
      debit: formatCurrency(debit),
      credit: formatCurrency(credit),
      balance: formatCurrency(runningBalance)
    };
  });

  await doc.table(
    {
      headers: [
        { label: "Period", property: "period", width: 100 },
        { label: "Description", property: "description", width: 200 },
        { label: "Debit", property: "debit", width: 80, align: "right" },
        { label: "Credit", property: "credit", width: 80, align: "right" },
        { label: "Balance", property: "balance", width: 90, align: "right" }
      ],
      datas
    },
    {
      prepareHeader: () =>
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827"),
      prepareRow: (row, i) => {
        doc.font("Helvetica").fontSize(9).fillColor("#374151");
        if (i % 2 === 0) {
          doc.rect(doc.x, doc.y, doc.page.width - 100, 20)
            .fill("#f9fafb")
            .stroke("#e5e7eb");
          doc.fillColor("#374151");
        }
      },
      padding: 6,
      headerBackground: "#e5e7eb",
      divider: {
        header: { disabled: false, width: 1, opacity: 0.6 },
        horizontal: { disabled: false, width: 0.5, opacity: 0.3 }
      }
    }
  );

  /* ================= SUMMARY ================= */
  doc.moveDown(1.5);

  const left = 320;
  const width = 240;
  const top = doc.y;

  doc.rect(left, top, width, 100).fill("#f3f4f6").stroke("#d1d5db");

  doc.fillColor("black").font("Helvetica-Bold").fontSize(12);
  doc.text("Summary", left + 10, top + 12);

  doc.font("Helvetica").fontSize(10).fillColor("#374151");
  doc.text("Total Charged:", left + 10, top + 36);
  doc.text(formatCurrency(totalDebit), left + width - 10, top + 36, {
    align: "right"
  });

  doc.text("Total Paid:", left + 10, top + 54);
  doc.text(formatCurrency(totalCredit), left + width - 10, top + 54, {
    align: "right"
  });

  doc.font("Helvetica-Bold").fillColor("#111827");
  doc.text("Closing Balance:", left + 10, top + 74);
  doc.text(formatCurrency(runningBalance), left + width - 10, top + 74, {
    align: "right"
  });

  /* ================= FOOTER ================= */
  drawFooter(doc);
  doc.end();
};
