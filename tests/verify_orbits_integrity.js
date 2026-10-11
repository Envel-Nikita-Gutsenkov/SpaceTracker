// Behavioral verification of ORBITAL CORRECTNESS across every body class.
//
// For each class (planets, dwarf planets, moons, artificial planetary orbiters and the
// interstellar probes) this suite checks three invariants:
//   1. Every computed radius stays inside the analytic periapsis/apoapsis bounds.
//   2. Mean motions / speeds are consistent with the relevant gravitational parameter
//      (vis-viva for planets, Kepler's third law for dwarfs/moons, v_infinity for probes).
//   3. Positions are CONTINUOUS under a dense sweep of date/time. The historical Kepler
//      bug ("seed E0 = pi for e >= 0.8") produced |dE| up to 1e15 and position jumps of
//      hundreds of scene units between adjacent frames; because every step bound here is a
//      rigorous upper bound on the true arc length (chord <= arc <= v_max * dt, with a 2x
//      margin) any branch jump is caught without flagging legitimate periapsis motion.
//
// Run: node tests/verify_orbits_integrity.js

import assert from 'node:assert/strict';
import { getHeliocentricPosition, getPlanetaryElements } from '../src/utils/ephemeris.js';
import {
  ORDERED_PLANET_KEYS,
  PLANETARY_ELEMENTS_J2000,
  AU_KM,
  GM_SUN_KM3_S2,
  G_KM3_KG_S2,
  getBodyGM,
} from '../src/utils/planetaryData.js';
import { getDwarfPositionThreeJS, getMoonOffsetThreeJS } from '../src/utils/smallBodyEphemeris.js';
import { DWARF_PLANETS, ORDERED_DWARF_KEYS } from '../src/utils/dwarfPlanets.js';
import { MOONS, ORDERED_MOON_KEYS } from '../src/utils/moons.js';
import { PLANETARY_ORBITERS } from '../src/utils/planetaryFleet.js';
import { DEEP_SPACE_PROBES } from '../src/utils/deepSpaceProbes.js';
import { heliocentricConicEcliptic, solveEllipticKepler } from '../src/utils/conicPropagation.js';
import { EARTH_RADIUS_KM } from '../src/utils/astronomy.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const TOTAL = 12;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;
const SECONDS_PER_DAY = 86400;
const MS_PER_DAY = 86400000;
const JD_UNIX_EPOCH = 2440587.5;

// Dense date sweep used by the range checks (every 3 days over 15 years), plus two
// historical/future extremes to exercise the secular element rates far from J2000.
const SWEEP_DATES = [];
for (let t = Date.UTC(2020, 0, 1); t <= Date.UTC(2035, 0, 1); t += 3 * MS_PER_DAY) {
  SWEEP_DATES.push(new Date(t));
}
const EXTREME_DATES = [new Date(Date.UTC(1900, 0, 1)), new Date(Date.UTC(2100, 0, 1))];
const RANGE_DATES = [...SWEEP_DATES, ...EXTREME_DATES];

// The two-body gravitational parameter of a parent body. getBodyGM (planetaryData.js) only
// resolves the classical planets; the dwarf planets are resolved from their tabulated mass.
function parentGM(bodyId) {
  const gm = getBodyGM(bodyId);
  if (gm > 0) return gm;
  const dwarf = DWARF_PLANETS[bodyId];
  return dwarf && dwarf.massKg ? G_KM3_KG_S2 * dwarf.massKg : 0;
}

// For a bound orbit, v_max = v_periapsis = sqrt(mu (1+e) / (a (1-e))). Used as the rigorous
// upper bound for the per-step arc length in the continuity sweeps.
function periapsisSpeed(uKm, e, aKm) {
  return Math.sqrt((uKm * (1 + e)) / (aKm * (1 - e)));
}

console.log('Orbital integrity verification tests');

// ---------------------------------------------------------------------------
// 1. Planets — range + vis-viva bounds over 1900..2100
// ---------------------------------------------------------------------------
test('planets: rAu within [a(1-e), a(1+e)] and speed within vis-viva bounds', () => {
  for (const key of ORDERED_PLANET_KEYS) {
    for (const date of RANGE_DATES) {
      const el = getPlanetaryElements(key, date);
      const p = getHeliocentricPosition(key, date);
      assert.ok(p && Number.isFinite(p.rAu), `${key} @ ${date.toISOString()}: non-finite rAu`);
      assert.ok(Number.isFinite(p.speedKmS), `${key} @ ${date.toISOString()}: non-finite speed`);

      const rMin = el.a * (1 - el.e);
      const rMax = el.a * (1 + el.e);
      const rTol = 1e-9 * el.a;
      assert.ok(p.rAu >= rMin - rTol && p.rAu <= rMax + rTol,
        `${key} @ ${date.toISOString()}: r=${p.rAu} AU outside [${rMin}, ${rMax}]`);

      const aKm = el.a * AU_KM;
      const vPeri = Math.sqrt(GM_SUN_KM3_S2 * (2 / (rMin * AU_KM) - 1 / aKm));
      const vApo = Math.sqrt(GM_SUN_KM3_S2 * (2 / (rMax * AU_KM) - 1 / aKm));
      const vTol = 1e-6 * vPeri;
      assert.ok(p.speedKmS >= vApo - vTol && p.speedKmS <= vPeri + vTol,
        `${key} @ ${date.toISOString()}: speed=${p.speedKmS} km/s outside [${vApo}, ${vPeri}]`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Planets — continuity over the dense sweep
// ---------------------------------------------------------------------------
test('planets: heliocentric position is continuous (no Kepler branch jumps)', () => {
  const dtSec = 3 * SECONDS_PER_DAY;
  for (const key of ORDERED_PLANET_KEYS) {
    const el0 = getPlanetaryElements(key, SWEEP_DATES[0]);
    const vMax = periapsisSpeed(GM_SUN_KM3_S2, el0.e, el0.a * AU_KM);
    const boundKm = 2 * vMax * dtSec + 1; // chord <= v_max * dt, with a 2x margin
    let prev = null;
    for (const date of SWEEP_DATES) {
      const p = getHeliocentricPosition(key, date);
      const v = { x: p.xEcl * AU_KM, y: p.yEcl * AU_KM, z: p.zEcl * AU_KM };
      if (prev) {
        const jump = Math.hypot(v.x - prev.x, v.y - prev.y, v.z - prev.z);
        assert.ok(jump <= boundKm,
          `${key} @ ${date.toISOString()}: jump ${jump.toExponential(3)} km > bound ${boundKm.toExponential(3)} km`);
      }
      prev = v;
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Dwarf planets — range over 1900..2100
// ---------------------------------------------------------------------------
test('dwarfs: rAu within [aAU(1-e), aAU(1+e)] and finite over 1900..2100', () => {
  for (const key of ORDERED_DWARF_KEYS) {
    const el = DWARF_PLANETS[key].elements;
    const rMin = el.aAU * (1 - el.e);
    const rMax = el.aAU * (1 + el.e);
    const rTol = 1e-9 * el.aAU;
    for (const date of RANGE_DATES) {
      const p = getDwarfPositionThreeJS(key, date, { x: 0, y: 0, z: 0 });
      assert.ok(p && Number.isFinite(p.rAu), `${key} @ ${date.toISOString()}: non-finite rAu`);
      assert.ok(Number.isFinite(p.relSun.x) && Number.isFinite(p.relSun.y) && Number.isFinite(p.relSun.z),
        `${key} @ ${date.toISOString()}: non-finite scene position`);
      assert.ok(p.rAu >= rMin - rTol && p.rAu <= rMax + rTol,
        `${key} @ ${date.toISOString()}: r=${p.rAu} AU outside [${rMin}, ${rMax}]`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Dwarf planets — Kepler's third law (Sun GM)
// ---------------------------------------------------------------------------
test('dwarfs: tabulated mean motion matches Kepler 3rd law (Sun GM) within 1%', () => {
  for (const key of ORDERED_DWARF_KEYS) {
    const el = DWARF_PLANETS[key].elements;
    const aKm = el.aAU * AU_KM;
    const nDeg = Math.sqrt(GM_SUN_KM3_S2 / (aKm * aKm * aKm)) * RAD2DEG * SECONDS_PER_DAY;
    const ratio = nDeg / el.nDegPerDay;
    assert.ok(Math.abs(ratio - 1) < 0.01,
      `${key}: n=${el.nDegPerDay} deg/day vs Kepler ${nDeg.toExponential(6)} (ratio ${ratio.toFixed(5)})`);
  }
});

// ---------------------------------------------------------------------------
// 5. Dwarf planets — continuity over a full orbit (perihelion is in the sweep)
// ---------------------------------------------------------------------------
test('dwarfs: scene position is continuous over a full orbit', () => {
  const steps = 4000;
  for (const key of ORDERED_DWARF_KEYS) {
    const el = DWARF_PLANETS[key].elements;
    const periodDays = 360 / el.nDegPerDay;
    const dtSec = (periodDays * SECONDS_PER_DAY) / steps;
    const vMax = periapsisSpeed(GM_SUN_KM3_S2, el.e, el.aAU * AU_KM);
    const boundUnits = (2 * vMax * dtSec) / EARTH_RADIUS_KM + 1e-6;
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      // Sweep uniformly in mean anomaly from perihelion (Tp): M = 2*pi*i/steps.
      const jd = el.Tp + periodDays * (i / steps);
      const p = getDwarfPositionThreeJS(key, jd, { x: 0, y: 0, z: 0 });
      const v = { x: p.relSun.x, y: p.relSun.y, z: p.relSun.z };
      if (prev) {
        const jump = Math.hypot(v.x - prev.x, v.y - prev.y, v.z - prev.z);
        assert.ok(jump <= boundUnits,
          `${key} @ sample ${i}: jump ${jump.toExponential(3)} u > bound ${boundUnits.toExponential(3)} u`);
      }
      prev = v;
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Moons — parent-relative range over 1900..2100
// ---------------------------------------------------------------------------
test('moons: |offset|*EarthRadius within [aKm(1-e), aKm(1+e)] over 1900..2100', () => {
  for (const key of ORDERED_MOON_KEYS) {
    const el = MOONS[key].elements;
    const rMin = el.aKm * (1 - el.e);
    const rMax = el.aKm * (1 + el.e);
    const rTol = 1e-6 * el.aKm;
    for (const date of RANGE_DATES) {
      const off = getMoonOffsetThreeJS(key, date);
      assert.ok(off && Number.isFinite(off.x) && Number.isFinite(off.y) && Number.isFinite(off.z),
        `${key} @ ${date.toISOString()}: non-finite offset`);
      const rKm = Math.hypot(off.x, off.y, off.z) * EARTH_RADIUS_KM;
      assert.ok(rKm >= rMin - rTol && rKm <= rMax + rTol,
        `${key} @ ${date.toISOString()}: r=${rKm.toFixed(3)} km outside [${rMin}, ${rMax}]`);
    }
  }
});

// ---------------------------------------------------------------------------
// 7. Moons — Kepler's third law in the two-body (parent + satellite) GM
// ---------------------------------------------------------------------------
test('moons: tabulated mean motion matches Kepler 3rd law (parent-system GM) within 1.5%', () => {
  for (const key of ORDERED_MOON_KEYS) {
    const moon = MOONS[key];
    const el = moon.elements;
    // The relative orbit follows Kepler's third law with mu = G(M_parent + M_satellite);
    // for the compact binaries (Pluto-Charon, Orcus-Vanth, Salacia-Actaea) the satellite
    // mass is a non-negligible fraction of the total and must be included.
    const mu = parentGM(moon.parentId) + G_KM3_KG_S2 * (moon.massKg || 0);
    assert.ok(mu > 0, `${key}: parent "${moon.parentId}" has no resolvable GM`);
    const nDeg = Math.sqrt(mu / (el.aKm * el.aKm * el.aKm)) * RAD2DEG * SECONDS_PER_DAY;
    const ratio = nDeg / el.nDegPerDay;
    // The largest residual is Haumea's moons (~0.9%): their elements come from Proudfoot et al.
    // (2024) non-Keplerian fits, whereas this app integrates a pure two-body conic and so omits
    // Haumea's quadrupole (J2) term. Every other moon agrees to <0.2%.
    assert.ok(Math.abs(ratio - 1) < 0.015,
      `${key}: n=${el.nDegPerDay} deg/day vs Kepler ${nDeg.toExponential(6)} (ratio ${ratio.toFixed(5)})`);
  }
});

// ---------------------------------------------------------------------------
// 8. Moons — continuity over a full orbit
// ---------------------------------------------------------------------------
test('moons: offset is continuous over a full orbit', () => {
  const steps = 3000;
  for (const key of ORDERED_MOON_KEYS) {
    const moon = MOONS[key];
    const el = moon.elements;
    const mu = parentGM(moon.parentId) + G_KM3_KG_S2 * (moon.massKg || 0);
    const periodDays = 360 / el.nDegPerDay;
    const dtSec = (periodDays * SECONDS_PER_DAY) / steps;
    const vMax = periapsisSpeed(mu, el.e, el.aKm);
    const boundUnits = (2 * vMax * dtSec) / EARTH_RADIUS_KM + 1e-6;
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const jd = el.epochJD + periodDays * (i / steps);
      const off = getMoonOffsetThreeJS(key, new Date((jd - JD_UNIX_EPOCH) * MS_PER_DAY));
      if (prev) {
        const jump = Math.hypot(off.x - prev.x, off.y - prev.y, off.z - prev.z);
        assert.ok(jump <= boundUnits,
          `${key} @ sample ${i}: jump ${jump.toExponential(3)} u > bound ${boundUnits.toExponential(3)} u`);
      }
      prev = off;
    }
  }
});

// ---------------------------------------------------------------------------
// 9. Orbiters — replicate PlanetFleet._localPosition, radius within [rp, ra]
// ---------------------------------------------------------------------------
test('orbiters: Keplerian radius stays within [rp, ra] over a full period', () => {
  for (const sat of PLANETARY_ORBITERS) {
    const planet = PLANETARY_ELEMENTS_J2000[sat.parentPlanetId];
    const rp = (planet.radiusKm + sat.periapsisKm) / EARTH_RADIUS_KM;
    const ra = (planet.radiusKm + sat.apoapsisKm) / EARTH_RADIUS_KM;
    const a = (rp + ra) / 2;
    const e = (ra - rp) / (ra + rp);
    const b = a * Math.sqrt(Math.max(0, 1 - e * e));
    const incRad = (sat.incDeg ?? 0) * DEG2RAD;
    const raanRad = (sat.raanDeg ?? 0) * DEG2RAD;

    const steps = 2000;
    for (let i = 0; i <= steps; i++) {
      const M = TWO_PI * (i / steps);
      const E = solveEllipticKepler(M, e);
      const xp = a * (Math.cos(E) - e);
      const yp = b * Math.sin(E);
      const x1 = xp;
      const y1 = yp * Math.sin(incRad);
      const z1 = yp * Math.cos(incRad);
      const x = x1 * Math.cos(raanRad) - z1 * Math.sin(raanRad);
      const y = y1;
      const z = x1 * Math.sin(raanRad) + z1 * Math.cos(raanRad);
      const r = Math.hypot(x, y, z);
      const rTol = 1e-9 * a;
      assert.ok(Number.isFinite(r), `${sat.name}: non-finite radius`);
      assert.ok(r >= rp - rTol && r <= ra + rTol,
        `${sat.name}: r=${r.toFixed(6)} u outside [${rp.toFixed(6)}, ${ra.toFixed(6)}] u`);
    }
  }
});

// ---------------------------------------------------------------------------
// 10. Orbiters — continuity over a full period
// ---------------------------------------------------------------------------
test('orbiters: local position is continuous over a full period', () => {
  const steps = 2000;
  for (const sat of PLANETARY_ORBITERS) {
    const planet = PLANETARY_ELEMENTS_J2000[sat.parentPlanetId];
    const rp = (planet.radiusKm + sat.periapsisKm) / EARTH_RADIUS_KM;
    const ra = (planet.radiusKm + sat.apoapsisKm) / EARTH_RADIUS_KM;
    const a = (rp + ra) / 2;
    const e = (ra - rp) / (ra + rp);
    const b = a * Math.sqrt(Math.max(0, 1 - e * e));
    const incRad = (sat.incDeg ?? 0) * DEG2RAD;
    const raanRad = (sat.raanDeg ?? 0) * DEG2RAD;
    const vMax = periapsisSpeed(getBodyGM(sat.parentPlanetId), e, a * EARTH_RADIUS_KM);
    const dtSec = (sat.periodMin * 60) / steps;
    const boundKm = 2 * vMax * dtSec + 1e-6;

    let prev = null;
    for (let i = 0; i <= steps; i++) {
      // Exact PlanetFleet._localPosition argument: M = 2*pi*((frac) + phaseOffset).
      const M = TWO_PI * (((i / steps) + (sat.phaseOffset ?? 0)) % 1.0);
      const E = solveEllipticKepler(M, e);
      const xp = a * (Math.cos(E) - e);
      const yp = b * Math.sin(E);
      const x1 = xp;
      const y1 = yp * Math.sin(incRad);
      const z1 = yp * Math.cos(incRad);
      const pos = {
        x: x1 * Math.cos(raanRad) - z1 * Math.sin(raanRad),
        y: y1,
        z: x1 * Math.sin(raanRad) + z1 * Math.cos(raanRad),
      };
      if (prev) {
        const jump = Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z) * EARTH_RADIUS_KM;
        assert.ok(jump <= boundKm,
          `${sat.name} @ sample ${i}: jump ${jump.toExponential(3)} km > bound ${boundKm.toExponential(3)} km`);
      }
      prev = pos;
    }
  }
});

// ---------------------------------------------------------------------------
// 11. Deep-space probes — hyperbolic excess speed
// ---------------------------------------------------------------------------
test('probes: vInfinityKmS equals sqrt(GM_SUN / |a|) (hyperbolic-excess speed) within 0.5%', () => {
  for (const p of DEEP_SPACE_PROBES) {
    const vInf = Math.sqrt(GM_SUN_KM3_S2 / Math.abs(p.elements.aKm));
    const ratio = vInf / p.vInfinityKmS;
    assert.ok(Number.isFinite(vInf), `${p.id}: non-finite hyperbolic excess speed`);
    // vInfinityKmS is the asymptotic speed v∞ = sqrt(GM_SUN/|a|) on the unbound heliocentric
    // conic; it must not be confused with the (larger) current speed speedKmS at the epoch.
    assert.ok(Math.abs(ratio - 1) < 0.005,
      `${p.id}: sqrt(GM/|a|)=${vInf.toFixed(4)} km/s vs vInfinity=${p.vInfinityKmS} (ratio ${ratio.toFixed(5)})`);
    assert.ok(p.speedKmS > p.vInfinityKmS,
      `${p.id}: current speed ${p.speedKmS} must exceed asymptotic v∞ ${p.vInfinityKmS}`);
  }
});

// ---------------------------------------------------------------------------
// 12. Deep-space probes — finite, monotonically receding conic distance
// ---------------------------------------------------------------------------
test('probes: conic distance is finite and recedes monotonically over the next year', () => {
  const jd0 = 2460676.5; // 2025-Jan-01 00:00 TDB
  for (const p of DEEP_SPACE_PROBES) {
    let prev = heliocentricConicEcliptic(p.elements, jd0).rAu;
    assert.ok(Number.isFinite(prev) && prev > 0, `${p.id}: non-finite perihelion-epoch distance`);
    for (let day = 5; day <= 370; day += 5) {
      const r = heliocentricConicEcliptic(p.elements, jd0 + day).rAu;
      assert.ok(Number.isFinite(r), `${p.id}: non-finite r at +${day} d`);
      assert.ok(r > prev, `${p.id}: did not recede at +${day} d (${prev.toFixed(6)} -> ${r.toFixed(6)} AU)`);
      prev = r;
    }
  }
});

console.log(`\nOrbital integrity tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
