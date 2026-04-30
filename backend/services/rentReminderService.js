const Lease = require("../models/Lease");
const { createTenantNotification } = require("./notificationService");

async function sendRentReminders() {
  try {
    const today = new Date();
    const day = today.getDate();

    const leases = await Lease.find({
      status: "Active"
    }).populate("tenantId");

    for (const lease of leases) {
      if (lease.paymentDueDay !== day) {
        continue;
      }

      const tenant = lease.tenantId;

      if (!tenant || !(tenant.whatsappNumber || tenant.phone)) {
        continue;
      }

      const rentAmount =
        lease.monthlyRent != null ? lease.monthlyRent : lease.rentAmount;

      const whatsappMessage =
`Hello ${tenant.fullName},
This is a reminder that your rent of R${Number(rentAmount || 0).toFixed(2)} is due today.
Please ignore this message if you have already paid.

Track My Rent`;

      await createTenantNotification({
        ownerId: lease.ownerId,
        type: "rent_charge",
        title: "Rent due today",
        message: `${tenant.fullName}'s rent is due today.`,
        tenantId: tenant._id,
        leaseId: lease._id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        metadata: {
          dueDay: lease.paymentDueDay,
          monthlyRent: rentAmount
        },
        whatsappMessage
      });
    }
  } catch (error) {
    console.error("RENT REMINDER ERROR:", error);
  }
}

module.exports = sendRentReminders;
