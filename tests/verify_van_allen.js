import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  VanAllenBelts,
  buildDipoleShellGeometry,
  R_IONOSPHERE,
  DIPOLE_TILT_DEG,
  DIPOLE_AZIMUTH_DEG,
  INNER_BELT_L,
  OUTER_BELT_L,
} from '../src/scene/VanAllenBelts.js';
import { EARTH_ROTATION_Y_SIGN } from '../src/scene/Earth.js';
import { EARTH_RADIUS_KM } from '../src/utils/astronomy.js';

// =============================================================================
//  VAN ALLEN RADIATION BELTS — ADVERSARIAL VERIFICATION SUITE
//
//  Goal: prove, against independent math and published empirical bounds, that the
//  rendered belts are (a) a correct centred-dipole L-shell construction, (b) in a
//  strict 1:1 scale with the Earth (1 unit = 6371 km), (c) correctly oriented
//  relative to the Earth (9.4 deg dipole tilt about the spin axis), and (d) are
//  actually attached to the scene and visible.
//
//  It ALSO asserts the known simplifications, so nobody can mistake the model for
//  a full IGRF/AP-8 field: the dipole is not offset and there is no South-Atlantic
//  Anomaly. Those are called out explicitly as model limitations, not silently.
// =============================================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

const DEG = 180 / Math.PI;
const R_EARTH_KM = EARTH_RADIUS_KM; // 6371

/** Walk every vertex of a geometry. */
function eachVertex(geo, cb) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    cb(p.getX(i), p.getY(i), p.getZ(i), i);
  }
}

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));

console.log('================================================================');
console.log(' VAN ALLEN BELTS — ADVERSARIAL SCIENTIFIC VERIFICATION');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
console.log('SUITE A: 1:1 scale & Earth clearance');

test('1 scene unit == 6371 km; belts use the same unit as the Earth sphere', () => {
  assert.equal(R_EARTH_KM, 6371);
  // The Earth sphere is radius 1.0 by construction (SUITE 1 of verify_math).
  // Belts are built directly in Earth radii, so their radius IS km / 6371.
  const shell = buildDipoleShellGeometry(OUTER_BELT_L[0], OUTER_BELT_L[1], 16, 8);
  let maxR = 0;
  eachVertex(shell, (x, y, z) => { maxR = Math.max(maxR, Math.hypot(x, y, z)); });
  // Outer equatorial apex must be exactly L_out Earth radii = 6 * 6371 km.
  assert.ok(rel(maxR, OUTER_BELT_L[1]) < 1e-4, `outer apex ${maxR} != L_out ${OUTER_BELT_L[1]}`);
  assert.ok(Math.abs(maxR * R_EARTH_KM - OUTER_BELT_L[1] * R_EARTH_KM) < 2, 'km scale mismatch');
});

test('no belt vertex ever penetrates the solid Earth or the ionosphere (r >= 1.0157 > 1.0)', () => {
  for (const [a, b] of [INNER_BELT_L, OUTER_BELT_L]) {
    const shell = buildDipoleShellGeometry(a, b, 40, 24);
    let minR = Infinity;
    eachVertex(shell, (x, y, z) => { minR = Math.min(minR, Math.hypot(x, y, z)); });
    assert.ok(minR >= R_IONOSPHERE - 1e-6, `min radius ${minR} below ionosphere ${R_IONOSPHERE}`);
    assert.ok(minR > 1.0, `min radius ${minR} intersects the Earth (r=1)`);
  }
});

test('both shells terminate exactly at the ionospheric footpoint r = 1.0157', () => {
  for (const [a, b] of [INNER_BELT_L, OUTER_BELT_L]) {
    const shell = buildDipoleShellGeometry(a, b, 40, 24);
    let minR = Infinity, maxR = -Infinity;
    eachVertex(shell, (x, y, z) => { const r = Math.hypot(x, y, z); minR = Math.min(minR, r); maxR = Math.max(maxR, r); });
    assert.ok(rel(minR, R_IONOSPHERE) < 1e-4, `inner closure ${minR} != ${R_IONOSPHERE}`);
    assert.ok(rel(maxR, b) < 1e-4, `outer apex ${maxR} != ${b}`);
  }
});

// -----------------------------------------------------------------------------
console.log('\nSUITE B: dipole field-line geometry  r = L cos^2(lambda)');

test('every on-shell vertex satisfies the invariant L = r^3 / (x^2 + z^2)', () => {
  for (const [a, b] of [INNER_BELT_L, OUTER_BELT_L]) {
    const shell = buildDipoleShellGeometry(a, b, 48, 32);
    eachVertex(shell, (x, y, z) => {
      const r = Math.hypot(x, y, z);
      const rho2 = x * x + z * z;             // (r cos lambda)^2
      const L = (r * r * r) / rho2;           // analytic invariant of a dipole line
      const onShell = Math.min(Math.abs(L - a), Math.abs(L - b)) < 1e-3;
      const inCap = Math.abs(r - R_IONOSPHERE) < 1e-4 && L > a - 1e-3 && L < b + 1e-3;
      assert.ok(onShell || inCap, `vertex off dipole line: L=${L} (in ${a}..${b}) r=${r}`);
    });
  }
});

test('the equatorial apex is exactly L, and r halves at 45 deg (cos^2 law)', () => {
  const L = 4.0;
  assert.ok(rel(L * Math.cos(0) ** 2, L) < 1e-12);
  assert.ok(rel(L * Math.cos(Math.PI / 4) ** 2, L * 0.5) < 1e-12);
  assert.ok(rel(L * Math.cos(Math.PI / 3) ** 2, L * 0.25) < 1e-12);
  // Reproduce from the real geometry: there must exist an equator vertex at r = L for
  // a shell whose inner/outer L bracket 4.0.
  const shell = buildDipoleShellGeometry(3.1, 6.0, 64, 16);
  let foundEquatorCurve = false;
  eachVertex(shell, (x, y, z) => {
    if (Math.abs(y) < 1e-6 && (rel(Math.hypot(x, y, z), 3.1) < 1e-4 || rel(Math.hypot(x, y, z), 6.0) < 1e-4)) {
      foundEquatorCurve = true;
    }
  });
  assert.ok(foundEquatorCurve, 'no equatorial vertex found on an L boundary');
});

test('shells are exact surfaces of revolution (radius & y invariant in azimuth)', () => {
  const segPhi = 32;
  const shell = buildDipoleShellGeometry(INNER_BELT_L[0], INNER_BELT_L[1], 24, segPhi);
  const count = shell.attributes.position.count;
  assert.equal(count % (segPhi + 1), 0, 'vertex layout is not (ring-major)');
  const nC = count / (segPhi + 1);
  const p = shell.attributes.position;
  for (let c = 0; c < nC; c++) {
    const r0 = Math.hypot(p.getX(c), p.getY(c), p.getZ(c));
    const y0 = p.getY(c);
    for (let ring = 1; ring <= segPhi; ring++) {
      const i = ring * nC + c;
      const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
      assert.ok(rel(r, r0) < 1e-4, `azimuthal radius drift at cross-index ${c}`);
      assert.ok(Math.abs(p.getY(i) - y0) < 1e-5, `azimuthal Y drift at cross-index ${c}`);
    }
  }
});

test('index buffer is a closed, well-formed triangle mesh', () => {
  const segLat = 24, segPhi = 48;
  const shell = buildDipoleShellGeometry(INNER_BELT_L[0], INNER_BELT_L[1], segLat, segPhi);
  const vCount = shell.attributes.position.count;
  const index = shell.index.array;
  assert.ok(index.length > 0 && index.length % 3 === 0, 'index is not a triangle list');
  const nC = (segLat + 1) + 5 + (segLat + 1) + 5;
  assert.equal(index.length, segPhi * nC * 6, 'unexpected index count for a closed shell');
  for (const vi of index) assert.ok(vi >= 0 && vi < vCount, `index ${vi} out of range`);
});

// -----------------------------------------------------------------------------
console.log('\nSUITE C: polar footpoints (loss cone) & auroral oval');

test('footpoint latitude obeys lambda = arccos(sqrt(1.0157 / L))', () => {
  const foot = (L) => Math.acos(Math.sqrt(R_IONOSPHERE / L)) * DEG;
  assert.ok(Math.abs(foot(INNER_BELT_L[0]) - 24.2) < 1.0, `inner-low foot ${foot(INNER_BELT_L[0])}`);
  assert.ok(Math.abs(foot(INNER_BELT_L[1]) - 48.9) < 1.5, `inner-high foot ${foot(INNER_BELT_L[1])}`);
  assert.ok(Math.abs(foot(OUTER_BELT_L[0]) - 55.1) < 1.5, `outer-low foot ${foot(OUTER_BELT_L[0])}`);
  assert.ok(Math.abs(foot(OUTER_BELT_L[1]) - 65.7) < 1.5, `outer-high foot ${foot(OUTER_BELT_L[1])}`);
});

test('outer-belt footpoints land inside the auroral oval (52-67 deg magnetic latitude)', () => {
  const footLow = Math.acos(Math.sqrt(R_IONOSPHERE / OUTER_BELT_L[0])) * DEG;
  const footHigh = Math.acos(Math.sqrt(R_IONOSPHERE / OUTER_BELT_L[1])) * DEG;
  assert.ok(footLow > 52 && footLow < 58, `auroral oval lower edge ${footLow.toFixed(1)}`);
  assert.ok(footHigh > 63 && footHigh < 67, `auroral oval upper edge ${footHigh.toFixed(1)}`);
});

test('the footprint latitude is where the field line meets r=1.0157 in the real geometry', () => {
  const shell = buildDipoleShellGeometry(OUTER_BELT_L[0], OUTER_BELT_L[1], 200, 8);
  // The northernmost vertex on the outer curve must sit at the analytic footpoint.
  let maxLat = 0;
  eachVertex(shell, (x, y, z) => {
    const r = Math.hypot(x, y, z);
    if (Math.abs(r - R_IONOSPHERE) < 1e-4) maxLat = Math.max(maxLat, Math.asin(y / r) * DEG);
  });
  const expected = Math.acos(Math.sqrt(R_IONOSPHERE / OUTER_BELT_L[1])) * DEG;
  assert.ok(Math.abs(maxLat - expected) < 0.5, `geometry footpoint ${maxLat} vs analytic ${expected}`);
});

// -----------------------------------------------------------------------------
console.log('\nSUITE D: empirical extents vs published radiation-belt data');

test('inner proton belt spans ~1.2-2.4 R_E (altitude 1400-8600 km), peak ~L 1.5', () => {
  const loAlt = (INNER_BELT_L[0] - 1) * R_EARTH_KM;
  const hiAlt = (INNER_BELT_L[1] - 1) * R_EARTH_KM;
  assert.ok(INNER_BELT_L[0] >= 1.15 && INNER_BELT_L[0] <= 1.30, `inner inner-edge L=${INNER_BELT_L[0]}`);
  assert.ok(INNER_BELT_L[1] >= 2.20 && INNER_BELT_L[1] <= 2.60, `inner outer-edge L=${INNER_BELT_L[1]}`);
  assert.ok(loAlt > 1200 && loAlt < 1600, `inner start ${loAlt.toFixed(0)} km`);
  assert.ok(hiAlt > 8000 && hiAlt < 9200, `inner end ${hiAlt.toFixed(0)} km`);
  const protonPeakAlt = (1.5 - 1) * R_EARTH_KM; // ~3186 km
  assert.ok(protonPeakAlt > loAlt && protonPeakAlt < hiAlt, 'proton peak must sit inside the inner band');
});

test('outer electron belt spans ~3-6 R_E (altitude 13,400-31,900 km), peak ~L 4-5', () => {
  const loAlt = (OUTER_BELT_L[0] - 1) * R_EARTH_KM;
  const hiAlt = (OUTER_BELT_L[1] - 1) * R_EARTH_KM;
  assert.ok(OUTER_BELT_L[0] >= 2.90 && OUTER_BELT_L[0] <= 3.30, `outer inner-edge L=${OUTER_BELT_L[0]}`);
  assert.ok(OUTER_BELT_L[1] >= 5.50 && OUTER_BELT_L[1] <= 7.00, `outer outer-edge L=${OUTER_BELT_L[1]}`);
  assert.ok(loAlt > 12000 && loAlt < 14500, `outer start ${loAlt.toFixed(0)} km`);
  assert.ok(hiAlt > 31000 && hiAlt < 32000, `outer end ${hiAlt.toFixed(0)} km`);
  for (const L of [4.0, 5.0]) {
    const alt = (L - 1) * R_EARTH_KM;
    assert.ok(alt > loAlt && alt < hiAlt, `electron peak L=${L} must sit inside the outer band`);
  }
});

test('a radiation "slot region" separates the belts (gap > 4500 km)', () => {
  const gapKm = (OUTER_BELT_L[0] - INNER_BELT_L[1]) * R_EARTH_KM;
  assert.ok(gapKm > 4500, `slot gap ${gapKm.toFixed(0)} km too small`);
  assert.ok(INNER_BELT_L[1] < OUTER_BELT_L[0], 'inner belt must not overlap the outer belt');
});

test('the outer belt stays inside the geostationary radius (35,786 km)', () => {
  const outerMaxAltKm = (OUTER_BELT_L[1] - 1) * R_EARTH_KM;
  assert.ok(outerMaxAltKm < 35786, `outer belt (${outerMaxAltKm.toFixed(0)} km) crosses GEO`);
});

// -----------------------------------------------------------------------------
console.log('\nSUITE E: orientation relative to the Earth');

const scene = new THREE.Scene();
const belts = new VanAllenBelts(scene);
const tilt = (DIPOLE_TILT_DEG * Math.PI) / 180;
const az = (DIPOLE_AZIMUTH_DEG * Math.PI) / 180;

test('the dipole axis is tilted exactly 9.4 deg from the Earth spin axis (Y)', () => {
  const axis = new THREE.Vector3(0, 1, 0).applyEuler(belts.group.rotation).normalize();
  const angle = Math.acos(THREE.MathUtils.clamp(axis.dot(new THREE.Vector3(0, 1, 0)), -1, 1)) * DEG;
  assert.ok(Math.abs(angle - DIPOLE_TILT_DEG) < 1e-6, `dipole tilt ${angle} != ${DIPOLE_TILT_DEG}`);
  assert.ok(Math.abs(DIPOLE_TILT_DEG - 9.4) < 1e-9, 'model tilt constant drifted from 9.4 deg (IGRF-13)');
});

test('the tilt direction matches the closed-form Euler solution (azimuth 70 deg)', () => {
  // For Three.js Euler order XYZ with rotation (0, az, tilt) applied to (0,1,0):
  //   axis = ( -cos(az) sin(tilt),  cos(tilt),  sin(az) sin(tilt) )
  const expX = -Math.cos(az) * Math.sin(tilt);
  const expY = Math.cos(tilt);
  const expZ = Math.sin(az) * Math.sin(tilt);
  const axis = new THREE.Vector3(0, 1, 0).applyEuler(belts.group.rotation);
  assert.ok(Math.abs(axis.x - expX) < 1e-6, `axis.x ${axis.x} != ${expX}`);
  assert.ok(Math.abs(axis.y - expY) < 1e-6, `axis.y ${axis.y} != ${expY}`);
  assert.ok(Math.abs(axis.z - expZ) < 1e-6, `axis.z ${axis.z} != ${expZ}`);
  // Tilt is not about the spin axis: there is a real horizontal component = sin(9.4deg).
  assert.ok(Math.abs(Math.hypot(axis.x, axis.z) - Math.sin(tilt)) < 1e-6, 'horizontal tilt component wrong');
});

test('belts are centred on the Earth origin (no dipole offset) — documented simplification', () => {
  const p = belts.innerMesh.geometry.attributes.position;
  let maxAbsY = 0, sumY = 0;
  for (let i = 0; i < p.count; i++) { sumY += p.getY(i); maxAbsY = Math.max(maxAbsY, Math.abs(p.getY(i))); }
  assert.ok(Math.abs(sumY / p.count) < 1e-6, 'shell is not symmetric about the centre');
  // The real geomagnetic dipole is offset ~0.068 R_E (~436 km) toward the SW Pacific,
  // which creates the South Atlantic Anomaly. This model deliberately omits it.
  assert.ok(maxAbsY > 0, 'sanity: shell has polar extent');
});

// -----------------------------------------------------------------------------
console.log('\nSUITE F: render wiring — proof the belts are actually attached & visible');

test('the belt group is parented to the scene and holds inner, outer and field lines', () => {
  assert.equal(belts.group.parent, scene, 'belt group is not attached to the scene');
  assert.equal(belts.group.children.length, 3, 'expected inner + outer + field-line children');
  assert.ok(belts.group.children.includes(belts.innerMesh));
  assert.ok(belts.group.children.includes(belts.outerMesh));
  assert.ok(belts.group.children.includes(belts.fieldLines));
});

test('both belt meshes carry finite, non-empty geometry', () => {
  for (const mesh of [belts.innerMesh, belts.outerMesh]) {
    const p = mesh.geometry.attributes.position;
    assert.ok(p && p.count > 1000, `too few vertices (${p && p.count})`);
    eachVertex(mesh.geometry, (x, y, z) => {
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), 'non-finite vertex');
    });
    assert.ok(mesh.geometry.index, 'mesh has no index buffer');
  }
});

test('belt materials render translucent additive volumes (visible, not depth-occluded)', () => {
  for (const mesh of [belts.innerMesh, belts.outerMesh]) {
    const m = mesh.material;
    assert.equal(m.transparent, true, 'material not transparent');
    assert.equal(m.depthWrite, false, 'depthWrite must be off for additive glow');
    assert.equal(m.blending, THREE.AdditiveBlending, 'expected additive blending');
    assert.equal(m.side, THREE.DoubleSide, 'expected double-sided shell');
    assert.ok(m.uniforms.uOpacity.value > 0 && m.uniforms.uOpacity.value <= 1, 'opacity out of range');
  }
});

test('the group starts hidden and setVisibility() toggles it', () => {
  assert.equal(belts.group.visible, false, 'belts should start hidden');
  belts.setVisibility(true);
  assert.equal(belts.group.visible, true, 'setVisibility(true) did not show the belts');
  belts.setVisibility(false);
  assert.equal(belts.group.visible, false, 'setVisibility(false) did not hide the belts');
});

test('the fragment shader uses a spec-compliant loss-cone smoothstep (edge0 < edge1)', () => {
  const src = belts.innerMesh.material.fragmentShader;
  assert.ok(/1\.0\s*-\s*smoothstep\(\s*0\.40\s*,\s*0\.92/.test(src), 'loss-cone fade not in compliant form');
  assert.ok(!/smoothstep\(\s*0\.92\s*,\s*0\.40/.test(src), 'reversed (undefined) smoothstep present');
  assert.ok(src.includes('logdepthbuf'), 'logarithmic depth include missing');
  // `const` in GLSL ES needs a constant initializer; length() of a varying is not one.
  assert.ok(/float\s+r\s*=\s*length\(vModelPos\)/.test(src), 'r must be a plain float, not const');
  assert.ok(!/\bconst\s+float\s+r\b/.test(src), 'const r is invalid GLSL ES (non-constant initializer)');
});

// -----------------------------------------------------------------------------
console.log('\nSUITE G: co-rotation with the Earth & field-line continuity');

test('the shell co-rotates with Earth (frozen-in field tracks GMST)', () => {
  const coRot = new VanAllenBelts(new THREE.Scene());
  const y0 = coRot.group.rotation.y;
  const gmst = 1.234;
  coRot.update(gmst);
  assert.ok(Math.abs((coRot.group.rotation.y - y0) - EARTH_ROTATION_Y_SIGN * gmst) < 1e-9,
    'rotation.y does not track the Earth spin');
  // Co-rotation must not change the dipole tilt relative to the spin axis.
  const axis = new THREE.Vector3(0, 1, 0).applyEuler(coRot.group.rotation);
  const angle = Math.acos(THREE.MathUtils.clamp(axis.y, -1, 1)) * DEG;
  assert.ok(Math.abs(angle - DIPOLE_TILT_DEG) < 1e-6, 'co-rotation altered the dipole tilt');
  // A zero spin restores the base (Earth-fixed) azimuth.
  coRot.update(0);
  assert.ok(Math.abs(coRot.group.rotation.y - y0) < 1e-9, 'update(0) did not restore the base azimuth');
});

test('field lines are continuous segment pairs (no dashed / cross-loop artifacts)', () => {
  const p = belts.fieldLines.geometry.attributes.position;
  assert.ok(p.count % 2 === 0, 'field-line vertices must come in pairs');

  // Every vertex must sit outside the loss cone.
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
    assert.ok(r >= R_IONOSPHERE - 1e-6, `field-line vertex inside loss cone (r=${r})`);
  }

  // A raw polyline fed to THREE.LineSegments leaves every segment isolated (dashed);
  // a continuous line chains segment end -> next segment start, breaking only between
  // the 16 loops. So the number of contiguous runs must equal the loop count.
  const segments = p.count / 2;
  let runs = 1;
  for (let s = 1; s < segments; s++) {
    const ex = p.getX(2 * s - 1), ey = p.getY(2 * s - 1), ez = p.getZ(2 * s - 1);
    const cx = p.getX(2 * s),     cy = p.getY(2 * s),     cz = p.getZ(2 * s);
    if (Math.hypot(ex - cx, ey - cy, ez - cz) > 1e-9) runs++;
  }
  assert.equal(runs, 16, `expected 16 continuous field-line loops, found ${runs}`);
});

// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(` Van Allen belt tests: ${passed}/${passed + failed} passed`);
console.log('================================================================');

if (failed > 0) process.exit(1);
