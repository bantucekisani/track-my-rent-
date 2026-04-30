const Lease = require("../models/Lease");
const LedgerEntry = require("../models/LedgerEntry");
const Notification = require("../models/Notification");
const Tenant = require("../models/Tenant");
const { createTenantNotification } = require("./notificationService");

/* =========================
   LATE RENT DETECTION
========================= */
async function detectLateRent() {
  const today = new Date();

  const leases = await Lease.find({ status: "Active" });

  for (const lease of leases) {

    const dueDate = new Date(today.getFullYear(), today.getMonth(), 5); 
    // rent due on 5th

    if (today <= dueDate) continue;

    const ledger = await LedgerEntry.find({
      leaseId: lease._id,
      periodMonth: today.getMonth(),
      periodYear: today.getFullYear()
    });

    let balance = 0;
    ledger.forEach(e => {
      balance += (e.debit || 0) - (e.credit || 0);
    });

    if (balance > 0) {
      const exists = await Notification.findOne({
        leaseId: lease._id,
        type: "rent_late",
        createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) }
      });

      if (!exists) {
        const tenant = await Tenant.findById(lease.tenantId).lean();
        const whatsappMessage = tenant
          ? `Hello ${tenant.fullName}, our records show that rent for this month is still outstanding. Please make payment as soon as possible or contact us if there is an issue.\n\nTrack My Rent`
          : "";

        await createTenantNotification({
          ownerId: lease.ownerId,
          type: "rent_late",
          title: "Late rent detected",
          message: "Tenant has unpaid rent after due date.",
          tenantId: lease.tenantId,
          leaseId: lease._id,
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          metadata: {
            balance
          },
          whatsappMessage
        });
      }
    }
  }
}

/* =========================
   LEASE EXPIRY
========================= */
async function detectLeaseExpiry() {
  const today = new Date();
  const in30Days = new Date();
  in30Days.setDate(today.getDate() + 30);

  const leases = await Lease.find({
    status: "Active",
    endDate: { $lte: in30Days }
  });

  for (const lease of leases) {
    const exists = await Notification.findOne({
      leaseId: lease._id,
      type: "lease_expiring"
    });

    if (!exists) {
      await Notification.create({
        ownerId: lease.ownerId,
        type: "lease_expiring",
        title: "Lease expiring soon",
        message: "Lease will expire within 30 days.",
        tenantId: lease.tenantId,
        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId
      });
    }
  }
}

/* =========================
   MISSING LEASE
========================= */
async function detectMissingLease() {
  const tenants = await Tenant.find();

  for (const tenant of tenants) {
    const lease = await Lease.findOne({
      tenantId: tenant._id,
      status: "Active"
    });

    if (!lease) {
      const exists = await Notification.findOne({
        tenantId: tenant._id,
        type: "lease_missing"
      });

      if (!exists) {
        await Notification.create({
          ownerId: tenant.ownerId,
          type: "lease_missing",
          title: "Missing lease",
          message: "Tenant has no active lease.",
          tenantId: tenant._id
        });
      }
    }
  }
}

module.exports = {
  detectLateRent,
  detectLeaseExpiry,
  detectMissingLease
};
