// utils/logger.js
module.exports = (req, res, next) => {
  console.log(
    `${req.method} ${req.originalUrl}  |  User: ${req.user?.id || "Guest"}`
  );
  next();
};
