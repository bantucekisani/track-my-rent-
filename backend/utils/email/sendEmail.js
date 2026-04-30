const nodemailer = require("nodemailer");

function getEmailConfig() {
  const port = Number(process.env.EMAIL_PORT || 587);
  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    const error = new Error("Email is not configured");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  return {
    host,
    port,
    secure: process.env.EMAIL_SECURE
      ? process.env.EMAIL_SECURE === "true"
      : port === 465,
    auth: { user, pass },
    from: process.env.EMAIL_FROM || `"Track My Rent" <${user}>`
  };
}

module.exports = async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments = []
}) {
  const { from, ...transportConfig } = getEmailConfig();
  const transporter = nodemailer.createTransport(transportConfig);

  return transporter.sendMail({
    from,
    to,
    subject,
    text: text || "Please view this email in HTML format.",
    html,
    attachments
  });
};
