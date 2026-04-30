const path = require("path");
const fs = require("fs");
const ejs = require("ejs");
const renderHTMLToPDF = require("./renderHTMLToPDF");

module.exports = async function generateInvoicePDF(data) {
  const templatePath = path.resolve(
    __dirname,
    "templates",
    "invoice.ejs"
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Invoice template not found: ${templatePath}`);
  }

  const html = await ejs.renderFile(templatePath, data);
  return renderHTMLToPDF(html);
};
