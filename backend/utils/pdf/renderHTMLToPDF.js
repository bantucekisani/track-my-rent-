/**
 * Renders HTML string to PDF buffer
 * @param {string} html
 * @returns {Buffer}
 */
module.exports = async function renderHTMLToPDF(html) {
  // ✅ Node 24 compatible Puppeteer import
  const puppeteer = (await import("puppeteer")).default;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    const pdfBuffer = await page.pdf({
  format: "A4",
  printBackground: true,

  displayHeaderFooter: true,

  headerTemplate: `<div></div>`,

  footerTemplate: `
    <div style="
      width: 100%;
      font-size: 10px;
      padding: 5px 0;
      text-align: center;
      color: #555;
    ">
      Page <span class="pageNumber"></span> of 
      <span class="totalPages"></span>
    </div>
  `,

  margin: {
    top: "20mm",
    right: "15mm",
    bottom: "25mm",
    left: "15mm"
  }
});
    return pdfBuffer;
  } finally {
    await browser.close();
  }
};
