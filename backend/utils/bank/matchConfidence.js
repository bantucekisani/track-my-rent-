function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function calculateConfidence({ tenant = {}, lease = {}, reference }) {
  let score = 0;
  const normalizedReference = normalize(reference);

  if (!normalizedReference) {
    return 0;
  }

  // Strong exact identifiers should be enough to auto-post when an active lease exists.
  if (normalize(lease.referenceCode) === normalizedReference) score += 80;
  if (normalize(tenant.phone) === normalizedReference) score += 70;
  if (normalize(tenant.email) === normalizedReference) score += 70;

  const tenantName = normalize(tenant.fullName);

  if (tenantName && tenantName === normalizedReference) {
    score += 70;
  } else if (
    tenantName &&
    (
      tenantName.includes(normalizedReference) ||
      normalizedReference.includes(tenantName)
    )
  ) {
    score += 35;
  }

  if (lease?._id || lease?.referenceCode) score += 20;

  return Math.min(score, 100);
}

module.exports = { calculateConfidence };
