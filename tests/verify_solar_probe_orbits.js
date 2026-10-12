import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOLAR_SATS } from '../src/utils/celestialFleet.js';
import {
  heliocentricConicEcliptic,
  heliocentricConicThreeJS,
  sampleConicRing,
} from '../src/utils/conicPropagation.js';
import {
  helioEclipticToThreeJS,
  getHeliocentricPosition,
  getPlanetaryElements,
} from '../src/utils/ephemeris.js';
import { AU_KM, AU_UNITS, ORDERED_PLANET_KEYS, PLANETARY_ELEMENTS_J2000 } from '../src/utils/planetaryData.js';
import { dwarfConicElements, getDwarfOrbitPoints } from '../src/utils/smallBodyEphemeris.js';
import { ORDERED_DWARF_KEYS } from '../src/utils/dwarfPlanets.js';
import { DEEP_SPACE_PROBES } from '../src/utils/deepSpaceProbes.js';

// ===========================================================================
// IAU axial-orientation companion suite: orbital *orientation* verification.
//
// The shape of an orbit (a, e) can be perfect while its orientation in space is
// arbitrary — the old solar-probe renderer tilted every ellipse about the scene X axis,
// so all lines of nodes sat at 0 and all perihelia pointed the same way. This suite pins
// the Sun-orbiting probe fleet to the exact NASA/JPL Horizons osculating elements and
// proves the renderer reproduces the real plane (i + ascending node) and line of apsides
// (argument of periapsis) — and cross-checks the whole heliocentric family for the same.
//
// Source (every probe): https://ssd.jpl.nasa.gov/api/horizons.api
//   EPHEM_TYPE=ELEMENTS / VECTORS, REF_PLANE=ECLIPTIC, REF_SYSTEM=J2000,
//   CENTER=500@10 (Sun), OUT_UNITS=KM-S, epoch 2025-Jan-01 00:00 TDB = JD 2460676.5.
// The `hz` field is the Horizons target id used to reproduce each query.
// ===========================================================================

let passed = 0;
const TOTAL = 14;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const DEG = Math.PI / 180;
const EPOCH_JD = 2460676.5;
const EPOCH_DATE = new Date(Date.UTC(2025, 0, 1)); // == JD 2460676.5

// Horizons reference table (see header). `el` is the osculating element set exactly as
// returned; `xyz` is the geometric state vector (ecliptic J2000, km) at the same epoch.
const REFERENCE = [
  {
    id: 43600, name: 'Parker Solar Probe', hz: '-96',
    el: { e: 0.8819207054054172, aKm: 5.811767816454195e7, qKm: 6.862494441144112e6, iDeg: 3.395363945898496, nodeDeg: 76.64956133644479, argPeriDeg: 68.45492876487289, Tp: 2460668.987600884866, nDegPerSec: 4.711032127837081e-5 },
    xyz: [1.858775776891296e7, -4.592213898379867e7, -1.702120358477429e6],
  },
  {
    id: 45167, name: 'Solar Orbiter', hz: '-144',
    el: { e: 0.5305671640643448, aKm: 9.325826994947228e7, qKm: 4.377849413683367e7, iDeg: 4.149079775950933, nodeDeg: 351.2032127168048, argPeriDeg: 274.0020752994180, Tp: 2460764.115809450857, nDegPerSec: 2.317647684583041e-5 },
    xyz: [7.774046516927991e6, 1.420885271760223e8, 1.027237689391142e7],
  },
  {
    id: 23726, name: 'SOHO', hz: '-21',
    el: { e: 0.02098352476518100, aKm: 1.428541506706341e8, qKm: 1.398565670622279e8, iDeg: 0.07833771417070889, nodeDeg: 292.5297292527820, argPeriDeg: 341.8740082540517, Tp: 2460841.132287921384, nDegPerSec: 1.222472657676203e-5 },
    xyz: [-2.599279295831772e7, 1.435002849190543e8, 4.235051786911488e4],
  },
  {
    id: 29510, name: 'STEREO-A', hz: '-234',
    el: { e: 0.006740689714223385, aKm: 1.437365515408558e8, qKm: 1.427676680463264e8, iDeg: 0.1279209872422879, nodeDeg: 212.3840089467320, argPeriDeg: 77.06990736240924, Tp: 2460829.277672221884, nDegPerSec: 1.211232785091081e-5 },
    xyz: [-9.163157765394457e7, 1.119210948594595e8, -3.205898970772922e5],
  },
  {
    id: 57790, name: 'Aditya-L1', hz: '-156',
    el: { e: 0.02792389788764402, aKm: 1.419165554968616e8, qKm: 1.379536920926011e8, iDeg: 0.04893254277251156, nodeDeg: 163.3845376477520, argPeriDeg: 115.3261417741914, Tp: 2460843.547649560962, nDegPerSec: 1.234607346558361e-5 },
    xyz: [-2.639170589509440e7, 1.434702908531299e8, -1.109673300114274e5],
  },
];

// ── vector helpers ─────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

// Ecliptic-frame unit normal of an orbit plane with inclination `i` and ascending node `node`.
const eclipticNormal = (iDeg, nodeDeg) => {
  const i = iDeg * DEG, O = nodeDeg * DEG;
  return unit([Math.sin(i) * Math.sin(O), -Math.sin(i) * Math.cos(O), Math.cos(i)]);
};

// Ecliptic-frame unit vector toward perihelion for (i, node, argument of periapsis).
const perihelionDir = (iDeg, nodeDeg, argPeriDeg) => {
  const i = iDeg * DEG, O = nodeDeg * DEG, w = argPeriDeg * DEG;
  return unit([
    Math.cos(w) * Math.cos(O) - Math.sin(w) * Math.sin(O) * Math.cos(i),
    Math.cos(w) * Math.sin(O) + Math.sin(w) * Math.cos(O) * Math.cos(i),
    Math.sin(w) * Math.sin(i),
  ]);
};

// Best-fit plane normal of a point cloud (largest cross product about the centroid).
function pointsNormal(points) {
  const c = [0, 0, 0];
  for (const p of points) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= points.length; c[1] /= points.length; c[2] /= points.length;
  let best = [0, 0, 1], bestMag = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const n = cross(sub(points[i], c), sub(points[j], c));
      const m = norm(n);
      if (m > bestMag) { bestMag = m; best = n; }
    }
  }
  return unit(best);
}

const relClose = (got, want, tol, label) => {
  const scale = Math.max(Math.abs(want), 1);
  assert.ok(Math.abs(got - want) <= tol * scale, `${label}: got ${got}, want ${want}`);
};

const byId = new Map(SOLAR_SATS.map((s) => [s.id, s]));

console.log('Solar-probe orbit orientation verification (JPL Horizons)');

// ── Suite A: the solar-probe fleet ─────────────────────────────────────────

test('every solar probe carries the exact Horizons osculating elements', () => {
  for (const ref of REFERENCE) {
    const sat = byId.get(ref.id);
    assert.ok(sat, `missing solar sat id ${ref.id}`);
    for (const k of ['e', 'aKm', 'qKm', 'iDeg', 'nodeDeg', 'argPeriDeg', 'Tp', 'nDegPerSec']) {
      assert.equal(sat.elements[k], ref.el[k], `${ref.name}.elements.${k}`);
    }
    assert.equal(sat.epochJd, EPOCH_JD, `${ref.name}.epochJd`);
  }
});

test('the derived display fields agree with the osculating elements', () => {
  for (const sat of SOLAR_SATS) {
    const el = sat.elements;
    relClose(sat.perihelionUnits, (el.qKm / AU_KM) * (AU_KM / 6371), 1e-9, `${sat.name}.perihelionUnits`);
    relClose(sat.aphelionUnits, ((el.aKm * (1 + el.e)) / AU_KM) * (AU_KM / 6371), 1e-9, `${sat.name}.aphelionUnits`);
    relClose(sat.periodMin, 360 / el.nDegPerSec / 60, 1e-9, `${sat.name}.periodMin`);
    assert.equal(sat.incDeg, el.iDeg, `${sat.name}.incDeg`);
    assert.equal(sat.inclination, el.iDeg, `${sat.name}.inclination`);
    assert.equal(sat.eccentricity, el.e, `${sat.name}.eccentricity`);
    assert.ok(el.e > 0 && el.e < 1, `${sat.name} must be on a bound heliocentric conic`);
  }
});

test('the conic propagator reproduces the Horizons position vector at the epoch', () => {
  for (const ref of REFERENCE) {
    const p = heliocentricConicEcliptic(byId.get(ref.id).elements, EPOCH_JD);
    const got = [p.xEcl * AU_KM, p.yEcl * AU_KM, p.zEcl * AU_KM];
    const scale = norm(ref.xyz);
    const err = norm(sub(got, ref.xyz));
    assert.ok(err / scale < 1e-5,
      `${ref.name}: conic position off by ${(err).toFixed(1)} km (${(err / scale).toExponential(2)} of |r|)`);
  }
});

test('the rendered scene position equals the Horizons vector mapped to scene units', () => {
  for (const ref of REFERENCE) {
    const res = heliocentricConicThreeJS(byId.get(ref.id).elements, EPOCH_DATE);
    const expect = helioEclipticToThreeJS(ref.xyz[0] / AU_KM, ref.xyz[1] / AU_KM, ref.xyz[2] / AU_KM);
    const err = norm(sub([res.rel.x, res.rel.y, res.rel.z], [expect.x, expect.y, expect.z]));
    assert.ok(err < 1e-3, `${ref.name}: scene position off by ${err} units`);
  }
});

test('each probe ring lies in the plane of its (inclination, ascending node)', () => {
  for (const ref of REFERENCE) {
    const el = byId.get(ref.id).elements;
    const ring = sampleConicRing(el, 256);
    const n = pointsNormal(ring);
    const want = eclipticNormal(el.iDeg, el.nodeDeg);
    const align = Math.abs(dot(n, want));
    assert.ok(align > 1 - 1e-9,
      `${ref.name}: ring normal misaligned with (i=${el.iDeg}, node=${el.nodeDeg}) by ${((1 - align) * 1e6).toFixed(2)}e-6`);
  }
});

test('each probe ring\'s perihelion points along (node, argument of periapsis)', () => {
  for (const ref of REFERENCE) {
    const el = byId.get(ref.id).elements;
    const ring = sampleConicRing(el, 256);
    // The ring starts at E = 0, which is exactly periapsis.
    const r0 = ring[0];
    const rmin = Math.min(...ring.map(norm));
    const d = dot(unit(r0), perihelionDir(el.iDeg, el.nodeDeg, el.argPeriDeg));
    assert.ok(d > 1 - 1e-9,
      `${ref.name}: ring[0] is not the perihelion direction (dot=${d})`);
    assert.ok(Math.abs(norm(r0) - rmin) < 1e-9 * norm(r0),
      `${ref.name}: ring[0] (${norm(r0)}) is not the closest ring point (${rmin})`);
  }
});

test('the probe sits at periapsis distance q at Tp and matches Horizons |r| at the epoch', () => {
  for (const ref of REFERENCE) {
    const el = byId.get(ref.id).elements;
    const atTp = heliocentricConicEcliptic(el, el.Tp);
    relClose(norm([atTp.xEcl, atTp.yEcl, atTp.zEcl]) * AU_KM, el.qKm, 1e-6, `${ref.name}: r(Tp) vs q`);
    const atEpoch = heliocentricConicEcliptic(el, EPOCH_JD);
    relClose(norm([atEpoch.xEcl, atEpoch.yEcl, atEpoch.zEcl]) * AU_KM, norm(ref.xyz), 1e-5, `${ref.name}: r(epoch)`);
  }
});

test('sampleConicRing closes and stays inside [q, Q]', () => {
  for (const ref of REFERENCE) {
    const el = byId.get(ref.id).elements;
    const ring = sampleConicRing(el, 200);
    assert.equal(ring.length, 201, `${ref.name}: expected steps + 1 points`);
    const closed = norm(sub(ring[0], ring[ring.length - 1]));
    assert.ok(closed < 1e-9, `${ref.name}: ring does not close (gap ${closed})`);
    const qAu = el.qKm / AU_KM;
    const QAu = (el.aKm * (1 + el.e)) / AU_KM;
    for (const p of ring) {
      const r = norm(p);
      assert.ok(r >= qAu * (1 - 1e-9) && r <= QAu * (1 + 1e-9), `${ref.name}: ring point r=${r} outside [q, Q]`);
    }
  }
});

test('the probes no longer share one orientation (old tilt-about-X-axis regression)', () => {
  const normals = SOLAR_SATS.map((s) => eclipticNormal(s.elements.iDeg, s.elements.nodeDeg));
  // Any two distinct probe planes must actually differ — under the old code every ring was
  // tilted about the scene X axis, so the node was forced to 0 for all of them.
  for (let i = 0; i < normals.length; i++) {
    for (let j = i + 1; j < normals.length; j++) {
      const angle = Math.acos(Math.min(1, Math.abs(dot(normals[i], normals[j])))) / DEG;
      assert.ok(angle > 0.05,
        `${SOLAR_SATS[i].name} and ${SOLAR_SATS[j].name} share an orbit plane (${angle.toFixed(3)} deg apart)`);
    }
  }
  // And the ascending node / argument of periapsis must be real, non-zero values.
  for (const s of SOLAR_SATS) {
    assert.ok(Math.abs(Math.sin(s.elements.nodeDeg * DEG)) > 1e-3, `${s.name}: ascending node collapsed to 0`);
    assert.ok(Math.abs(Math.sin(s.elements.argPeriDeg * DEG)) > 1e-3, `${s.name}: argument of periapsis collapsed to 0`);
  }
});

// ── Suite B: the rest of the heliocentric family ───────────────────────────

test('every major planet\'s ephemeris orbit lies in its (I, ascending node) plane', () => {
  for (const id of ORDERED_PLANET_KEYS) {
    const LRate = PLANETARY_ELEMENTS_J2000[id].LRate;
    const periodDays = 360 / (LRate / 36525);
    const pts = [];
    for (let k = 0; k < 96; k++) {
      const date = new Date(EPOCH_DATE.getTime() + (k / 96) * periodDays * 86400000);
      const p = getHeliocentricPosition(id, date);
      pts.push([p.xEcl, p.yEcl, p.zEcl]);
    }
    const n = pointsNormal(pts);
    const mid = getPlanetaryElements(id, new Date(EPOCH_DATE.getTime() + periodDays * 43200000));
    const want = unit([Math.sin(mid.I) * Math.sin(mid.longNode), -Math.sin(mid.I) * Math.cos(mid.longNode), Math.cos(mid.I)]);
    const align = Math.abs(dot(n, want));
    assert.ok(align > 1 - 2e-3, `${id}: orbit normal misaligned with (I, node) (1-dot=${(1 - align).toExponential(2)})`);
  }
});

test('every dwarf planet\'s ring lies in its (i, ascending node) plane', () => {
  for (const id of ORDERED_DWARF_KEYS) {
    const el = dwarfConicElements(id);
    assert.ok(el, `${id}: no conic elements`);
    const n = pointsNormal(sampleConicRing(el, 256));
    const align = Math.abs(dot(n, eclipticNormal(el.iDeg, el.nodeDeg)));
    assert.ok(align > 1 - 1e-9, `${id}: ring normal misaligned with (i, node)`);
  }
});

// The dwarf orbit lines are built by getDwarfOrbitPoints (the render path), which used to call
// sampleConicTrajectory(elements, 0, steps) and returned an empty array — so every dwarf orbit
// line rendered with no geometry. Pin the render path itself, and that the ring actually sweeps
// the real periapsis-to-aphelion span instead of collapsing to a point.
test('every dwarf planet\'s rendered ring is non-degenerate and spans [q, Q]', () => {
  for (const id of ORDERED_DWARF_KEYS) {
    const el = dwarfConicElements(id);
    const pts = getDwarfOrbitPoints(id, { x: 0, y: 0, z: 0 }, 256);
    assert.ok(pts.length > 32, `${id}: rendered ring collapsed to ${pts.length} points`);
    const qAu = el.qKm / AU_KM;
    const QAu = (el.aKm * (1 + el.e)) / AU_KM;
    const rs = pts.map((p) => Math.hypot(p.x, p.y, p.z) / AU_UNITS);
    const rMin = Math.min(...rs);
    const rMax = Math.max(...rs);
    assert.ok(rMax - rMin > qAu * 1e-3, `${id}: ring is degenerate (span ${(rMax - rMin).toExponential(2)} AU)`);
    relClose(rMin, qAu, 1e-3, `${id}: ring periapsis`);
    relClose(rMax, QAu, 1e-3, `${id}: ring aphelion`);
  }
});

test('every deep-space probe\'s trajectory lies in its (i, ascending node) plane', () => {
  for (const probe of DEEP_SPACE_PROBES) {
    const el = probe.elements;
    const pts = sampleConicRing(el, 256);
    const n = pointsNormal(pts);
    const align = Math.abs(dot(n, eclipticNormal(el.iDeg, el.nodeDeg)));
    assert.ok(align > 1 - 1e-6, `${probe.name}: trajectory normal misaligned with (i, node)`);
  }
});

// ── Suite C: renderer wiring ───────────────────────────────────────────────

test('Sun.js drives the probe fleet through the real conic pipeline (no inline tilt)', () => {
  const src = readFileSync(new URL('../src/scene/Sun.js', import.meta.url), 'utf8');
  assert.ok(src.includes('sampleConicRing'), 'Sun.js must build probe rings with sampleConicRing');
  assert.ok(src.includes('heliocentricConicThreeJS'), 'Sun.js must place probes with heliocentricConicThreeJS');
  assert.ok(!/Math\.sin\(item\.incRad\)/.test(src), 'Sun.js still contains the old tilt-about-X-axis position math');
  assert.ok(!/perihelionUnits \+ sat\.aphelionUnits/.test(src), 'Sun.js still synthesises the ellipse from display units');
});

console.log(`\nSolar-probe orbit orientation verification: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
