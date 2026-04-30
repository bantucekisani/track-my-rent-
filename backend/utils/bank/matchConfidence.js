function calculateConfidence({ tenant, lease, reference }) {
  let score = 0;

  // Strong matches
  if (tenant.referenceCode === reference) score += 60;
  if (tenant.phone === reference) score += 40;
  if (tenant.email === reference) score += 40;

  // Name fuzzy match
  if (
    tenant.fullName &&
    reference &&
    tenant.fullName.toLowerCase().includes(reference.toLowerCase())
  ) {
    score += 25;
  }

  // Lease exists
  if (lease) score += 20;

  return Math.min(score, 100);
}

module.exports = { calculateConfidence };
