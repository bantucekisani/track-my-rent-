// middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  console.error("🔥 ERROR:", err);

  const status = err.statusCode || 500;

  res.status(status).json({
    success: false,
    message: err.message || "Server Error",
  });
};
