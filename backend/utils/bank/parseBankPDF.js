const fs = require("fs");
const pdfParse = require("pdf-parse");
const { exec } = require("child_process");
const Tesseract = require("tesseract.js");
const path = require("path");

/* ===============================
   Extract rows from plain text
================================ */
function extractRowsFromText(text) {
  const lines = text.split("\n");

  const rows = [];

  for (const line of lines) {
    // VERY SIMPLE pattern – refine later per bank
    const amountMatch = line.match(/R?\s?(\d+(\.\d{2})?)/);
    const refMatch = line.match(/[A-Z0-9]{4,}/i);

    if (amountMatch && refMatch) {
      rows.push({
        amount: Number(amountMatch[1]),
        reference: refMatch[0],
        date: new Date()
      });
    }
  }

  return rows;
}

/* ===============================
   OCR SCANNED PDF
================================ */
async function ocrScannedPDF(pdfPath) {
  const imgDir = `${pdfPath}-images`;

  fs.mkdirSync(imgDir, { recursive: true });

  // Convert PDF → images
  await new Promise((resolve, reject) => {
    exec(
      `pdftoppm "${pdfPath}" "${imgDir}/page" -png`,
      err => (err ? reject(err) : resolve())
    );
  });

  const images = fs
    .readdirSync(imgDir)
    .filter(f => f.endsWith(".png"));

  let fullText = "";

  for (const img of images) {
    const result = await Tesseract.recognize(
      path.join(imgDir, img),
      "eng"
    );
    fullText += "\n" + result.data.text;
  }

  return extractRowsFromText(fullText);
}

/* ===============================
   MAIN PARSER
================================ */
async function parseBankPDF(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);

  try {
    const data = await pdfParse(buffer);

    // TEXT PDF
    if (data.text && data.text.trim().length > 50) {
      return extractRowsFromText(data.text);
    }

    // SCANNED PDF → OCR
    return await ocrScannedPDF(pdfPath);

  } catch (err) {
    // Fallback to OCR
    return await ocrScannedPDF(pdfPath);
  }
}

module.exports = { parseBankPDF };
