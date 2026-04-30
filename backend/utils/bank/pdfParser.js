const pdfParse = require("pdf-parse");
const fs = require("fs");

async function extractTextFromPDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);

  // If almost no text → scanned PDF
  if (!data.text || data.text.trim().length < 50) {
    throw new Error("SCANNED_PDF");
  }

  return data.text;
}

module.exports = { extractTextFromPDF };
