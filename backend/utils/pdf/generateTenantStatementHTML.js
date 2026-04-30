const path = require("path");
const ejs = require("ejs");
const renderHTMLToPDF = require("./renderHTMLToPDF");

module.exports = async function generateTenantStatementHTML(data) {
  const templatePath = path.join(
    __dirname,
    "templates",
    "tenant-statement.ejs"
  );

  const html = await ejs.renderFile(templatePath, data);
  return renderHTMLToPDF(html);
};
