// Shape model for rendered bodies.
//
// Every body is drawn from ONE shared unit sphere (see PlanetMeshBuilder). A body whose real form
// departs from a sphere carries an optional `shape` record with its three semi-axes in km:
//
//   shape: { aKm, bKm, cKm }   with  aKm ≥ bKm ≥ cKm  (km)
//
// a and b are the equatorial semi-axes (longest and middle), c is the POLAR semi-axis. The shared
// sphere's +Y is its polar (spin) axis, so the ellipsoid is produced by a NON-UNIFORM scale with c
// on Y, a on X and b on Z. That costs no extra geometry, no extra draw calls and no build time —
// the same 96×96 sphere is merely squashed, and MeshStandardMaterial transforms the normals with
// the inverse-transpose so the shading stays correct. A body without `shape` renders as a sphere
// of radius `radiusKm`.
//
// `radiusKm` is kept as the volume-equivalent (mean) radius — the radius of the sphere with the
// same volume as the ellipsoid — which is the quantity LOD, picking, beacon and label thresholds
// are calibrated against. When both are present they must agree: see tests/verify_body_shapes.js.

// Rendered semi-axes in km, expressed in the shared sphere's own frame (+Y = polar/spin axis).
export function resolveBodyAxesKm(data) {
  if (data && data.shape) {
    const { aKm, bKm, cKm } = data.shape;
    return { x: aKm, y: cKm, z: bKm };
  }
  const r = data ? data.radiusKm : 0;
  return { x: r, y: r, z: r };
}

// Radius of the sphere with the same volume as the triaxial ellipsoid with semi-axes a, b, c.
export function volumeEquivalentRadiusKm(aKm, bKm, cKm) {
  return Math.cbrt(aKm * bKm * cKm);
}

// True when the body declares a non-spherical (triaxial) shape.
export function hasShape(data) {
  return Boolean(data && data.shape);
}
