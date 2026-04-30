const LedgerEntry = require("../models/LedgerEntry");
const Tenant = require("../models/Tenant");
const Notification = require("../models/Notification");
const { createTenantNotification } = require("./notificationService");

async function emitLedgerNotification(entry) {
  if (!entry?.tenantId) return;

  try {
    /* =========================
       LOAD TENANT NAME
    ========================= */
    const tenant = await Tenant.findById(entry.tenantId).select("fullName");
    const tenantName = tenant?.fullName || "Tenant";

    /* =========================
       CALCULATE CURRENT BALANCE
    ========================= */
    const ledger = await LedgerEntry.find({
      ownerId: entry.ownerId,
      tenantId: entry.tenantId
    }).sort({ date: 1 });

    let balance = 0;
    ledger.forEach(e => {
      balance += (e.debit || 0) - (e.credit || 0);
    });

    /* =========================
       PAYMENT NOTIFICATIONS
    ========================= */
    if (entry.type === "payment") {

      // FULLY PAID (use safe float comparison)
      if (Math.abs(balance) < 0.01) {
        await createTenantNotification({
          ownerId: entry.ownerId,
          type: "payment_full",
          title: "Full rent payment received",
          message: `${tenantName} has fully paid the outstanding rent.`,
          tenantId: entry.tenantId,
          leaseId: entry.leaseId,
          propertyId: entry.propertyId,
          unitId: entry.unitId,
          metadata: {
            amount: entry.credit || 0,
            balance
          },
          whatsappMessage:
            `Hello ${tenantName}, we have received your payment of ` +
            `R${Number(entry.credit || 0).toFixed(2)}. Thank you.`
        });

      // PARTIAL PAYMENT
      } else if (balance > 0) {
        await createTenantNotification({
          ownerId: entry.ownerId,
          type: "payment_partial",
          title: "Partial rent payment",
          message: `${tenantName} made a partial payment. Balance still outstanding.`,
          tenantId: entry.tenantId,
          leaseId: entry.leaseId,
          propertyId: entry.propertyId,
          unitId: entry.unitId,
          metadata: { balance },
          whatsappMessage:
            `Hello ${tenantName}, we have received your payment of ` +
            `R${Number(entry.credit || 0).toFixed(2)}. ` +
            `There is still an outstanding balance of ` +
            `R${Number(balance).toFixed(2)} on your account.`
        });

      // OVERPAYMENT
      } else {
        await createTenantNotification({
          ownerId: entry.ownerId,
          type: "payment_over",
          title: "Overpayment received",
          message: `${tenantName} paid more than the required amount.`,
          tenantId: entry.tenantId,
          leaseId: entry.leaseId,
          propertyId: entry.propertyId,
          unitId: entry.unitId,
          metadata: { balance },
          whatsappMessage:
            `Hello ${tenantName}, we have received your payment of ` +
            `R${Number(entry.credit || 0).toFixed(2)}. ` +
            `Your account now has a credit balance.`
        });
      }
    }

    /* =========================
       RENT CHARGE NOTIFICATION
    ========================= */
    if (entry.type === "rent") {
      await Notification.create({
        ownerId: entry.ownerId,
        type: "rent_late",
        title: "Rent charged",
        message: `Rent has been charged to ${tenantName}.`,
        tenantId: entry.tenantId,
        leaseId: entry.leaseId,
        propertyId: entry.propertyId,
        unitId: entry.unitId,
        isRead: false,
        createdAt: new Date()
      });
    }

  } catch (err) {
    console.error("LEDGER NOTIFICATION ERROR:", err);
  }
}

module.exports = { emitLedgerNotification };
