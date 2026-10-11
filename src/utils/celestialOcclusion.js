export function isSegmentOccludedBySphere(origin, target, center, radius) {
  if (!origin || !target || !center || radius <= 0 ||
    !Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z) ||
    !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z) ||
    !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z) ||
    !Number.isFinite(radius)) {
    return false;
  }

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const segmentLength = Math.hypot(dx, dy, dz);
  if (segmentLength <= Number.EPSILON) return false;

  const ox = center.x - origin.x;
  const oy = center.y - origin.y;
  const oz = center.z - origin.z;
  const along = (ox * dx + oy * dy + oz * dz) / segmentLength;
  const centerDistanceSq = ox * ox + oy * oy + oz * oz;
  const perpendicularDistanceSq = centerDistanceSq - along * along;
  const radiusSq = radius * radius;
  if (perpendicularDistanceSq >= radiusSq) return false;

  const halfChord = Math.sqrt(radiusSq - perpendicularDistanceSq);
  const entryDistance = along - halfChord;
  const exitDistance = along + halfChord;
  return exitDistance > 0 && entryDistance < segmentLength;
}
