const path = require("path");
const fs = require("fs");
const ejs = require("ejs");

module.exports = async function generateInvoicePDF(data) {
  const puppeteer = require("puppeteer"); // ⚠ use require, NOT dynamic import

  const templatePath = path.resolve(
    __dirname,
    "templates",
    "invoice.ejs"
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Invoice template not found: ${templatePath}`);
  }

  const html = await ejs.renderFile(templatePath, data);

  const browser = await puppeteer.launch({
    headless: true,   // ✅ IMPORTANT (not "new")
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "domcontentloaded",  // ✅ safer than networkidle0
      timeout: 30000
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm"
      }
    });

    return pdf;

  } finally {
    await browser.close();
  }
};