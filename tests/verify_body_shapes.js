import assert from 'node:assert/strict';
import { ALL_BODIES, getBodyData } from '../src/utils/smallBodies.js';
import { resolveBodyAxesKm, volumeEquivalentRadiusKm, hasShape } from '../src/utils/bodyShape.js';
import { EARTH_RADIUS_KM } from '../src/utils/astronomy.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const TOTAL = 6;

// Bodies that render as a triaxial ellipsoid, with the semi-axes (km) they must carry.
// a = longest equatorial, b = middle equatorial, c = polar. Sources: JPL SBDB `extent`
// (Ceres), Proudfoot et al. (2026) PSJ arXiv:2605.28636 (Haumea), Wikipedia occultation
// shape models (Quaoar, Achlys), the JPL Planetary Fact Sheet (giant planets, equatorial/
// polar radii), and Wikipedia/JPL dimensions for the irregular moons (half the full axes).
const EXPECTED_SHAPES = {
  // dwarf planets
  haumea:   [1061, 844, 514],
  ceres:    [482.2, 482.1, 445.9],
  quaoar:   [583.3, 555.3, 510.0],
  achlys:   [470, 383, 245],
  // oblate gas/ice giants
  jupiter:  [71492, 71492, 66854],
  saturn:   [60268, 60268, 54364],
  uranus:   [25559, 25559, 24973],
  neptune:  [24764, 24764, 24341],
  // irregular moons
  phobos:     [12.95, 11.30, 9.16],
  deimos:     [8.04, 5.89, 5.11],
  metis:      [30, 20, 17],
  adrastea:   [10, 8, 7],
  amalthea:   [126, 73, 63],
  thebe:      [58, 49, 42],
  mimas:      [206.6, 195.73, 190.47],
  enceladus:  [256.21, 251.39, 248.63],
  tethys:     [538.39, 528.37, 526.24],
  pan:        [17.3, 14.1, 10.5],
  atlas:      [20.4, 17.7, 9.3],
  prometheus: [68.5, 40.5, 28.1],
  pandora:    [51.5, 39.5, 31.5],
  janus:      [101.7, 92.9, 74.5],
  epimetheus: [64.8, 58.1, 53.5],
  helene:     [22.6, 19.6, 13.3],
  hyperion:   [180.9, 129, 102],
  iapetus:    [746.7, 745.7, 712.1],
  miranda:    [240.4, 234.2, 232.9],
  thalassa:   [54, 50, 26],
  despina:    [90, 74, 64],
  larissa:    [108, 102, 84],
  styx:       [8, 4.5, 4],
  nix:        [24.9, 16.6, 15.55],
  kerberos:   [9.5, 5, 4.5],
  hydra:      [25.45, 18.05, 15.45],
  hiiaka:     [240, 180, 143],
};

console.log('Body shapes verification');

test('only the intended bodies declare a `shape` (no accidental spheres/skips)', () => {
  const declared = Object.keys(ALL_BODIES)
    .filter((id) => hasShape(getBodyData(id)))
    .sort();
  assert.deepEqual(declared, Object.keys(EXPECTED_SHAPES).sort(),
    'the set of bodies with a `shape` changed — update EXPECTED_SHAPES to match the data');
});

test('declared shapes carry the exact tabulated semi-axes', () => {
  for (const [id, [a, b, c]] of Object.entries(EXPECTED_SHAPES)) {
    const s = getBodyData(id).shape;
    assert.ok(s, `${id}: missing shape`);
    assert.equal(s.aKm, a, `${id}.shape.aKm`);
    assert.equal(s.bKm, b, `${id}.shape.bKm`);
    assert.equal(s.cKm, c, `${id}.shape.cKm`);
  }
});

test('every declared shape is a valid triaxial ellipsoid (a >= b >= c > 0)', () => {
  for (const id of Object.keys(EXPECTED_SHAPES)) {
    const { aKm, bKm, cKm } = getBodyData(id).shape;
    assert.ok(Number.isFinite(aKm) && aKm > 0, `${id}: bad aKm`);
    assert.ok(Number.isFinite(bKm) && bKm > 0 && bKm <= aKm, `${id}: bKm must be in (0, aKm]`);
    assert.ok(Number.isFinite(cKm) && cKm > 0 && cKm <= bKm, `${id}: cKm must be in (0, bKm]`);
  }
});

test('shape volume is consistent with radiusKm (declared radius is volume-equivalent)', () => {
  for (const id of Object.keys(EXPECTED_SHAPES)) {
    const { aKm, bKm, cKm } = getBodyData(id).shape;
    const r = getBodyData(id).radiusKm;
    const volR = volumeEquivalentRadiusKm(aKm, bKm, cKm);
    const diff = Math.abs(volR - r) / r;
    assert.ok(diff <= 0.05,
      `${id}: cbrt(a*b*c)=${volR.toFixed(2)} km vs radiusKm=${r} km (${(diff * 100).toFixed(2)}% — shape and radius disagree)`);
  }
});

test('resolveBodyAxesKm puts the equatorial axes on X/Z and the polar axis on Y', () => {
  // shape present: a -> X, c -> Y (spin axis), b -> Z.
  assert.deepEqual(
    resolveBodyAxesKm({ radiusKm: 10, shape: { aKm: 3, bKm: 2, cKm: 1 } }),
    { x: 3, y: 1, z: 2 },
  );
  // no shape: uniform sphere of radiusKm on all axes (i.e. the old `scale.setScalar`).
  assert.deepEqual(resolveBodyAxesKm({ radiusKm: 7 }), { x: 7, y: 7, z: 7 });
  assert.equal(resolveBodyAxesKm(null).x, 0);
  // The scale the renderer applies must be non-uniform exactly when a shape exists.
  const shaped = resolveBodyAxesKm(getBodyData('haumea'));
  assert.ok(Math.abs(shaped.x / EARTH_RADIUS_KM - shaped.z / EARTH_RADIUS_KM) > 0,
    'Haumea must receive a non-uniform scene scale');
});

test('Haumea is strongly triaxial with its short polar axis on Y', () => {
  const axes = resolveBodyAxesKm(getBodyData('haumea'));
  // Jacobi ellipsoid: the long axis is ~2x the minor axis.
  assert.ok(axes.x / axes.y > 2.0, `Haumea a/c = ${(axes.x / axes.y).toFixed(2)} must exceed 2`);
  assert.ok(axes.y < axes.z && axes.z < axes.x, `expected Y < Z < X, got ${JSON.stringify(axes)}`);
});

console.log(`\nBody shapes verification: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
