module.exports = async function generatePropertyPerformanceHTML({
  rows,
  generatedAt
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />

  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      padding: 40px;
      color: #111;
    }

    h2 {
      margin-bottom: 4px;
    }

    .sub {
      font-size: 11px;
      color: #555;
      margin-bottom: 25px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead th {
      border-bottom: 2px solid #000;
      background: #f3f4f6;
      padding: 8px;
      text-align: left;
    }

    tbody td {
      padding: 8px;
      border-bottom: 1px solid #e5e7eb;
    }

    tbody tr:nth-child(even) {
      background: #fafafa;
    }

    .num {
      text-align: right;
      white-space: nowrap;
    }

    .footer {
      position: fixed;
      bottom: 20px;
      left: 40px;
      right: 40px;
      font-size: 10px;
      color: #666;
      text-align: center;
      border-top: 1px solid #ddd;
      padding-top: 6px;
    }
  </style>
</head>

<body>

  <h2>Property Performance Report</h2>
  <div class="sub">Generated on ${generatedAt}</div>

  <table>
    <thead>
      <tr>
        <th>Property</th>
        <th class="num">Units</th>
        <th class="num">Occupied</th>
        <th class="num">Vacant</th>
        <th class="num">Occupancy %</th>
        <th class="num">Collected (R)</th>
        <th class="num">Outstanding (R)</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          r => `
        <tr>
          <td>${r.name}</td>
          <td class="num">${r.units}</td>
          <td class="num">${r.occupied}</td>
          <td class="num">${r.vacant}</td>
          <td class="num">${r.occupancy}%</td>
          <td class="num">R${r.collected}</td>
          <td class="num">R${r.outstanding}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div class="footer">
    Track My Rent · System-generated report
  </div>

</body>
</html>
`;
};
