const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments = []   // 👈 allow attachments
}) {
  return transporter.sendMail({
    from: `"Track My Rent" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: text || "Please view this email in HTML format.",
    html,
    attachments      // 👈 pass them to nodemailer
  });
};