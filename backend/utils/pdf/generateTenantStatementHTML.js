const path = require("path");
const ejs = require("ejs");
const puppeteer = require("puppeteer");

module.exports = async function generateTenantStatementHTML(data) {
  const templatePath = path.join(
    __dirname,
    "templates",
    "tenant-statement.ejs"
  );

  const html = await ejs.renderFile(templatePath, data);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.setContent(html, {
    waitUntil: "networkidle0"
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

  await browser.close();

  return pdf;
};