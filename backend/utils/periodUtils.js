/**
 * Month index MUST be 0–11
 * This is the single source of truth for month ranges
 */
function getMonthRange(year, monthIndex) {
  if (
    typeof year !== "number" ||
    typeof monthIndex !== "number" ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    throw new Error("Invalid month range: month must be 0–11");
  }

  const start = new Date(year, monthIndex, 1, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59);

  return { start, end };
}

module.exports = { getMonthRange };
