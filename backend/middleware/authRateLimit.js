const buckets = new Map();

function getKey(req, scope) {
  const ip =
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown";

  const email = (req.body?.email || "").trim().toLowerCase();
  return `${scope}:${ip}:${email}`;
}

function clearExpired(now) {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

module.exports = function authRateLimit({
  scope,
  windowMs = 15 * 60 * 1000,
  max = 5
}) {
  return (req, res, next) => {
    const now = Date.now();
    clearExpired(now);

    const key = getKey(req, scope);
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      return next();
    }

    if (current.count >= max) {
      const retryAfter = Math.max(
        1,
        Math.ceil((current.resetAt - now) / 1000)
      );

      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        message: "Too many attempts. Please try again shortly."
      });
    }

    current.count += 1;
    buckets.set(key, current);
    next();
  };
};
