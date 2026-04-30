/**
 * Renders an HTML string to a PDF buffer.
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
module.exports = async function renderHTMLToPDF(html) {
  const puppeteer = require("puppeteer");

  const browser = await puppeteer.launch({
    headless: true,
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
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm"
      }
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
};
