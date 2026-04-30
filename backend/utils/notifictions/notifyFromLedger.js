const Notification = require("../models/Notification");

/**
 * Create notifications based on ledger entry
 */
async function notifyFromLedger({
  ledger,
  totals = null // optional { charged, paid, due }
}) {
  try {
    if (!ledger || !ledger.ownerId) return;

    const base = {
      ownerId: ledger.ownerId,
      tenantId: ledger.tenantId || null,
      leaseId: ledger.leaseId || null,
      propertyId: ledger.propertyId || null,
      unitId: ledger.unitId || null
    };

    /* ===========================
       CHARGES (DEBITS)
    ============================ */
    if (ledger.debit > 0) {
      let type = "system";
      let title = "New charge added";
      let message = ledger.description;

      switch (ledger.type) {
        case "rent":
          type = "rent_charge";
          title = "Rent charged";
          message = `Rent of R${ledger.debit.toFixed(
            2
          )} has been charged.`;
          break;

        case "utility":
          type = "utility_charge";
          title = "Utility charge added";
          message = `Utility charge of R${ledger.debit.toFixed(
            2
          )} has been added.`;
          break;

        case "maintenance":
          type = "maintenance_charge";
          title = "Maintenance charge added";
          message = `Maintenance cost of R${ledger.debit.toFixed(
            2
          )} has been charged.`;
          break;

        case "damage":
          type = "damage_charge";
          title = "Damage charge added";
          message = `Damage cost of R${ledger.debit.toFixed(
            2
          )} has been charged.`;
          break;
      }

      await Notification.create({
        ...base,
        type,
        title,
        message,
        metadata: {
          ledgerId: ledger._id,
          amount: ledger.debit
        }
      });

      return;
    }

    /* ===========================
       PAYMENTS (CREDITS)
    ============================ */
    if (ledger.credit > 0 && totals) {
      let type = "payment_partial";
      let title = "Payment received";
      let message = `Payment of R${ledger.credit.toFixed(
        2
      )} received.`;

      if (totals.due === 0) {
        type = "payment_full";
        title = "Payment completed";
        message = "Account is now fully paid.";
      } else if (totals.paid > totals.charged) {
        type = "payment_over";
        title = "Overpayment received";
        message = "Payment exceeds total charges.";
      }

      await Notification.create({
        ...base,
        type,
        title,
        message,
        metadata: {
          ledgerId: ledger._id,
          paid: totals.paid,
          charged: totals.charged,
          balance: totals.due
        }
      });
    }
  } catch (err) {
    console.error("NOTIFY FROM LEDGER ERROR:", err.message);
  }
}

module.exports = { notifyFromLedger };
