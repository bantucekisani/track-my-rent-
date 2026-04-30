// utils/email.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", 
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

exports.sendEmail = async (to, subject, html) => {
  return transporter.sendMail({
    from: `"Track My Rent" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });
};
