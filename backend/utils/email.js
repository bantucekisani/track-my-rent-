const sendEmail = require("./email/sendEmail");

exports.sendEmail = async (to, subject, html) => {
  return sendEmail({ to, subject, html });
};
