require("dotenv").config();
const mongoose = require("mongoose");

const Lease = require("../models/Lease");
const Tenant = require("../models/Tenant");
const Unit = require("../models/Unit");

/* =========================
   SAME HELPERS YOU ALREADY USE
========================= */
function makeTenantShort(fullName = "") {
  const parts = fullName.trim().split(/\s+/);
  return (
    (parts[0]?.[0] || "") +
    (parts[parts.length - 1] || "").substring(0, 6)
  )
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

function cleanUnitLabel(label = "") {
  return label.replace(/unit|room/gi, "").trim().toUpperCase() || "UNIT";
}

function getLast4(phone = "") {
  const digits = (phone.match(/\d/g) || []).join("");
  return digits.slice(-4) || "0000";
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  const leases = await Lease.find({
    $or: [{ referenceCode: { $exists: false } }, { referenceCode: "" }]
  });

  console.log(`Found ${leases.length} leases to fix`);

  for (const lease of leases) {
    const tenant = await Tenant.findById(lease.tenantId);
    const unit = await Unit.findById(lease.unitId);

    if (!tenant || !unit) continue;

    lease.referenceCode = `TMR-${makeTenantShort(
      tenant.fullName
    )}-${cleanUnitLabel(unit.unitLabel)}-${getLast4(tenant.phone)}`;

    await lease.save();
    console.log(`✔ Updated lease ${lease._id}: ${lease.referenceCode}`);
  }

  console.log("Done");
  process.exit();
}

run();
