module.exports = async function sendInvoiceEmail({
  to,
  tenantName,
  invoiceNumber,
  pdfBuffer,
  business
}) {
  const nodemailer = (await import("nodemailer")).default;

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === "true", // false for 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
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
