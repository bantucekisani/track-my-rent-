"use strict";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = async function generateTabularReportHTML({
  title,
  subtitle = "",
  generatedAt = "",
  summaryItems = [],
  columns = [],
  rows = [],
  emptyMessage = "No data available for the selected filters.",
  footerNote = "Track My Rent · System-generated report"
}) {
  const summaryMarkup = summaryItems.length
    ? `
      <section class="summary-grid">
        ${summaryItems
          .map(
            item => `
              <article class="summary-card">
                <span class="summary-label">${escapeHtml(item.label)}</span>
                <strong class="summary-value">${escapeHtml(item.value)}</strong>
              </article>
            `
          )
          .join("")}
      </section>
    `
    : "";

  const tableRows = rows.length
    ? rows
        .map(
          row => `
            <tr>
              ${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="${Math.max(columns.length, 1)}" class="empty">${escapeHtml(emptyMessage)}</td>
      </tr>
    `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    :root {
      color-scheme: light;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #14213d;
      margin: 0;
      padding: 32px 36px;
      background: #ffffff;
    }

    .heading {
      margin-bottom: 18px;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 24px;
      line-height: 1.2;
      color: #0f172a;
    }

    .subtitle {
      margin: 0;
      font-size: 12px;
      color: #475569;
      line-height: 1.5;
    }

    .generated-at {
      margin-top: 8px;
      font-size: 11px;
      color: #64748b;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin: 20px 0 22px;
    }

    .summary-card {
      border: 1px solid #dbe4f0;
      background: #f8fbff;
      border-radius: 12px;
      padding: 12px 14px;
    }

    .summary-label {
      display: block;
      margin-bottom: 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
    }

    .summary-value {
      display: block;
      font-size: 16px;
      line-height: 1.3;
      color: #0f172a;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      overflow: hidden;
      border-radius: 14px;
    }

    thead th {
      padding: 10px 12px;
      background: #e9f1ff;
      border-bottom: 1px solid #cdd9ee;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: left;
      color: #27406d;
    }

    tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid #e6edf7;
      vertical-align: top;
      color: #0f172a;
    }

    tbody tr:nth-child(even) td {
      background: #f8fbff;
    }

    .empty {
      text-align: center;
      color: #64748b;
      font-style: italic;
      padding: 18px 12px;
    }

    .footer {
      margin-top: 18px;
      font-size: 10px;
      color: #64748b;
      text-align: center;
      border-top: 1px solid #dbe4f0;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <header class="heading">
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
    <div class="generated-at">Generated on ${escapeHtml(generatedAt)}</div>
  </header>

  ${summaryMarkup}

  <table>
    <thead>
      <tr>
        ${columns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="footer">${escapeHtml(footerNote)}</div>
</body>
</html>
`;
};
