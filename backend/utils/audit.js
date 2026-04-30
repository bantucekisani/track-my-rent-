const AuditLog = require("../models/AuditLog");

async function logAudit({
  ownerId,
  userId,
  action,
  entityType,
  entityId,
  before,
  after,
  req
}) {
  await AuditLog.create({
    ownerId,
    userId,
    action,
    entityType,
    entityId,
    before,
    after,
    ipAddress: req?.ip,
    userAgent: req?.headers["user-agent"]
  });
}

module.exports = logAudit;
