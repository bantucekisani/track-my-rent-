const Invoice = require("../models/Invoice");
const LedgerEntry = require("../models/LedgerEntry");

async function allocatePayment(req, res) {
  const { paymentId } = req.params;
  const ownerId = req.user.id;

  const payment = await LedgerEntry.findOne({
    _id: paymentId,
    ownerId,
    type: "payment"
  });

  if (!payment) {
    return res.status(404).json({ message: "Payment not found" });
  }

  let remaining = payment.credit;

  const invoices = await Invoice.find({
    ownerId,
    tenantId: payment.tenantId,
    leaseId: payment.leaseId,
    status: { $in: ["UNPAID", "PARTIAL", "OVERDUE"] }
  }).sort({ invoiceDate: 1 });

  for (const invoice of invoices) {
    if (remaining <= 0) break;

    const apply = Math.min(invoice.balanceDue, remaining);

    invoice.amountPaid += apply;
    invoice.balanceDue -= apply;
    remaining -= apply;

    invoice.status =
      invoice.balanceDue <= 0 ? "PAID" : "PARTIAL";

    await invoice.save();
  }

  res.json({
    message: "Payment allocated to invoices",
    unallocatedAmount: remaining
  });
}

module.exports = { allocatePayment };
