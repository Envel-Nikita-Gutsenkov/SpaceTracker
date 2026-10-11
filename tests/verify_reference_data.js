import assert from 'node:assert/strict';

// Reference-data regression suite. It pins values transcribed from authoritative sources and,
// crucially, checks the *runtime output of the code* against the same sources -- not just the
// stored constants. Everything here is offline: the SBDB / Proudfoot numbers are checked in.
//
// Sources
//   * JPL Small-Body Database (SBDB) API, full-prec, epoch JD 2461200.5:
//       https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=<name>&phys-par=1&full-prec=1
//   * Proudfoot et al. (2024) PSJ 5:69, "Beyond Point Masses. III" (Haumea system orbit fit,
//     HST-only, Table 2) -- the mass and the Hi'iaka/Namaka elements come from the same fit.
//   * JPL Horizons osculating elements for the interstellar probes (ecliptic J2000, Sun).

import { DWARF_PLANETS } from '../src/utils/dwarfPlanets.js';
import { DEEP_SPACE_PROBES } from '../src/utils/deepSpaceProbes.js';
import { MOONS } from '../src/utils/moons.js';
import { AU_KM, GM_SUN_KM3_S2, G_KM3_KG_S2 } from '../src/utils/planetaryData.js';
import { EARTH_RADIUS_KM } from '../src/utils/astronomy.js';
import { getDwarfPositionThreeJS, getMoonOffsetThreeJS, dwarfConicElements } from '../src/utils/smallBodyEphemeris.js';
import { heliocentricConicEcliptic } from '../src/utils/conicPropagation.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

let TOTAL = 0;

console.log('Reference-data verification (JPL SBDB / Proudfoot 2024 pinned offline)');

const SUN_SCENE = { x: 0, y: 0, z: 0 };
const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);

function assertClose(actual, expected, tolRel, label) {
  const rel = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(rel < tolRel,
    `${label}: got ${actual}, expected ${expected} (rel err ${(rel * 100).toFixed(6)}%)`);
}

// ---------------------------------------------------------------------------
// 1. SBDB osculating elements, pinned verbatim (full precision).
// ---------------------------------------------------------------------------
const SBDB = {
  ceres: { a: 2.765552595034094, e: 0.07969229514816586, i: 10.58802780183462,
           node: 80.24862682043221, peri: 73.29421453021587, tp: 2461599.841466614066,
           n: 0.21430445064843, q: 2.545159361382861 },
  orcus: { a: 39.37686537914865, e: 0.2205240628250881, i: 20.55681019612,
           node: 268.4053519455824, peri: 73.56848606705262, tp: 2504046.134962433665,
           n: 0.003988800931399829, q: 30.69331904442224 },
  haumea: { a: 43.06029023650952, e: 0.1944430148898797, i: 28.20847393040364,
            node: 121.7860561329425, peri: 240.6905472508661, tp: 2500416.599615282750,
            n: 0.003488097731816818, q: 34.68751758088936 },
};

TOTAL++;
test('dwarf-planet orbital elements match the pinned JPL SBDB solution exactly', () => {
  for (const [id, ref] of Object.entries(SBDB)) {
    const el = DWARF_PLANETS[id].elements;
    assert.equal(el.epochJD, 2461200.5, `${id}: SBDB epoch must be JD 2461200.5`);
    assertClose(el.aAU, ref.a, 1e-12, `${id}.aAU`);
    assertClose(el.e, ref.e, 1e-12, `${id}.e`);
    assertClose(el.iDeg, ref.i, 1e-12, `${id}.iDeg`);
    assertClose(el.nodeDeg, ref.node, 1e-12, `${id}.nodeDeg`);
    assertClose(el.argPeriDeg, ref.peri, 1e-12, `${id}.argPeriDeg`);
    assertClose(el.Tp, ref.tp, 1e-12, `${id}.Tp`);
    assertClose(el.nDegPerDay, ref.n, 1e-12, `${id}.nDegPerDay`);
  }
});

// ---------------------------------------------------------------------------
// 2. Runtime output vs SBDB: at Tp the heliocentric distance of the code must equal q.
// ---------------------------------------------------------------------------
TOTAL++;
test('computed heliocentric distance at perihelion equals the SBDB q', () => {
  for (const [id, ref] of Object.entries(SBDB)) {
    // Propagate the code's own conic elements to Tp and read the heliocentric distance: at
    // periapsis it must reproduce q = a(1-e) from SBDB. (JD is fed directly to avoid the
    // sub-millisecond loss of the JD->Date round-trip.)
    const el = dwarfConicElements(id);
    const state = heliocentricConicEcliptic(el, el.Tp);
    assert.ok(Number.isFinite(state.rAu), `${id}: non-finite runtime position`);
    assertClose(state.rAu, ref.q, 1e-9, `${id} runtime r(Tp) vs SBDB q`);
    assertClose(ref.q, ref.a * (1 - ref.e), 1e-9, `${id} SBDB q vs a(1-e)`);

    // The scene-position helper (Date-based) must agree with the scalar distance.
    const pos = getDwarfPositionThreeJS(id, jdToDate(el.Tp), SUN_SCENE);
    assert.ok(pos && Number.isFinite(pos.rAu), `${id}: non-finite scene position`);
    assertClose(pos.rAu, ref.q, 1e-4, `${id} scene r(Tp) vs SBDB q`);
  }
});

// ---------------------------------------------------------------------------
// 3. Haumea mass: pinned to the modern dynamical value and consistent with its moons.
// ---------------------------------------------------------------------------
TOTAL++;
test('Haumea mass is the Proudfoot 2024 dynamical value (3.95244e21 kg)', () => {
  assert.equal(DWARF_PLANETS.haumea.massKg, 3.95244e21,
    'Haumea mass must use the Proudfoot et al. 2024 HST-only fit, not the superseded RB09 value');
});

const GM_HAUMEA = G_KM3_KG_S2 * DWARF_PLANETS.haumea.massKg;

TOTAL++;
test("Haumea GM reproduces the Hi'iaka and Namaka mean motions within 1%", () => {
  // The moons come from the same non-Keplerian fit, so a pure two-body check leaves a residual
  // of up to ~1% from Haumea's J2 oblateness -- which this app does not model. This guards the
  // stored mass against drifting back to an incompatible value.
  for (const id of ['hiiaka', 'namaka']) {
    const el = MOONS[id].elements;
    const mu = GM_HAUMEA + G_KM3_KG_S2 * (MOONS[id].massKg || 0);
    const nDeg = Math.sqrt(mu / (el.aKm ** 3)) * (180 / Math.PI) * 86400;
    assertClose(nDeg, el.nDegPerDay, 0.01, `${id}: two-body n from Haumea mass`);
  }
});

TOTAL++;
test("runtime moon offsets stay inside each moon's [a(1-e), a(1+e)] band", () => {
  for (const id of ['hiiaka', 'namaka']) {
    const el = MOONS[id].elements;
    // Sample several epochs across a full orbit; the produced offset length (km) must never
    // leave the physical periapsis/apapsis window.
    for (let k = 0; k <= 12; k++) {
      const jd = el.epochJD + (k / 12) * el.periodDays;
      const off = getMoonOffsetThreeJS(id, jdToDate(jd));
      assert.ok(off, `${id}: null offset at jd ${jd}`);
      const rKm = Math.hypot(off.x, off.y, off.z) * EARTH_RADIUS_KM;
      const rp = el.aKm * (1 - el.e);
      const ra = el.aKm * (1 + el.e);
      assert.ok(rKm > rp * 0.999 && rKm < ra * 1.001,
        `${id}: runtime r=${rKm.toFixed(1)} km outside [${rp.toFixed(1)}, ${ra.toFixed(1)}]`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Interstellar probes: asymptotic speed v∞ = sqrt(GM_SUN/|a|), pinned.
// ---------------------------------------------------------------------------
const V_INF = {
  'voyager-1': 16.6,
  'voyager-2': 14.85,
  'pioneer-10': 11.32,
  'pioneer-11': 10.43,
  'new-horizons': 12.53,
};

TOTAL++;
test('probe vInfinityKmS matches the pinned asymptotic speeds', () => {
  for (const p of DEEP_SPACE_PROBES) {
    assert.equal(p.vInfinityKmS, V_INF[p.id], `${p.id}: v∞ must equal the pinned value`);
    assertClose(p.vInfinityKmS, Math.sqrt(GM_SUN_KM3_S2 / Math.abs(p.elements.aKm)), 5e-3,
      `${p.id}: v∞ vs sqrt(GM/|a|)`);
  }
});

TOTAL++;
test('runtime current speed of each probe exceeds its asymptotic v∞', () => {
  // On an unbound conic the speed at finite r is strictly greater than the r->infinity limit.
  for (const p of DEEP_SPACE_PROBES) {
    const state = heliocentricConicEcliptic(p.elements, p.epochJd);
    const rKm = state.rAu * AU_KM;
    const vNow = Math.sqrt(Math.max(0, GM_SUN_KM3_S2 * (2 / rKm - 1 / p.elements.aKm)));
    assert.ok(Number.isFinite(vNow) && vNow > 0, `${p.id}: non-finite current speed`);
    assert.ok(vNow > p.vInfinityKmS,
      `${p.id}: current ${vNow.toFixed(3)} km/s must exceed v∞ ${p.vInfinityKmS}`);
  }
});

console.log(`\nReference-data tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
