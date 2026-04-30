const sendEmail = require("./sendEmail");

module.exports = async function sendInvoiceEmail({
  to,
  tenantName,
  invoiceNumber,
  pdfBuffer,
  business
}) {
  await sendEmail({
    to,
    subject: `Invoice ${invoiceNumber}`,
    text: `Dear ${tenantName}, please find your invoice attached.`,
    attachments: [
      {
        filename: `Invoice-${invoiceNumber}.pdf`,
        content: pdfBuffer
      }
    ]
  });
};
