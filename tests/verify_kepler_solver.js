import assert from 'node:assert/strict';
import { solveKeplerElliptic } from '../src/utils/keplerEquation.js';
import { solveEllipticKepler } from '../src/utils/conicPropagation.js';
import { PLANETARY_ORBITERS } from '../src/utils/planetaryFleet.js';
import { PLANETARY_ELEMENTS_J2000 } from '../src/utils/planetaryData.js';
import { EARTH_RADIUS_KM } from '../src/utils/astronomy.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const TOTAL = 5;

// Eccentricities spanning a circular orbit through the real high-e orbiters
// (Akatsuki e=0.963, Juno e=0.975) up to near-parabolic.
const ECCENTRICITIES = [0, 0.1, 0.5, 0.8, 0.9, 0.963, 0.975, 0.99, 0.999];

const TWO_PI = 2 * Math.PI;

function normalize(M) {
  let m = M % TWO_PI;
  if (m < -Math.PI) m += TWO_PI;
  else if (m > Math.PI) m -= TWO_PI;
  return m;
}

console.log('Kepler solver regression tests');

// Regression: the old solver seeded Newton with E0 = pi for e >= 0.8, which lands on
// the wrong branch at M ~ ±pi, overshoots to E ~ 0 (where f' = 1 - e cos E -> 0), and
// explodes on the next step. On screen this made Juno / Akatsuki jump hundreds of scene
// units between frames — the "superluminal satellite" report.
test('residual M = E - e sin E is ~zero across a dense sweep for every e in [0, 1)', () => {
  const steps = 20001;
  const dM = TWO_PI / (steps - 1);
  for (const e of ECCENTRICITIES) {
    for (let i = 0; i < steps; i++) {
      const M = -Math.PI + dM * i;
      const E = solveKeplerElliptic(M, e);
      const residual = E - e * Math.sin(E) - normalize(M);
      assert.ok(Number.isFinite(E), `e=${e} M=${M.toFixed(6)} produced non-finite E`);
      assert.ok(Math.abs(residual) < 1e-9, `e=${e} M=${M.toFixed(6)} residual=${residual}`);
    }
  }
});

test('solution is continuous across the sweep (no branch jumps)', () => {
  const steps = 20001;
  const dM = TWO_PI / (steps - 1);
  for (const e of ECCENTRICITIES) {
    // |dE/dM| = 1 / (1 - e cos E) <= 1 / (1 - e), so the mean-value theorem bounds any
    // adjacent-sample increment by dM / (1 - e). We allow 2x that plus a numerical floor,
    // which still catches the O(1)+ jumps the old seed produced.
    const bound = (2 * dM) / (1 - e) + 1e-9;
    let prev = solveKeplerElliptic(-Math.PI, e);
    for (let i = 1; i < steps; i++) {
      const M = -Math.PI + dM * i;
      const E = solveKeplerElliptic(M, e);
      const dE = Math.abs(E - prev);
      assert.ok(dE < bound, `e=${e} M=${M.toFixed(6)} dE=${dE.toExponential(3)} > ${bound.toExponential(3)}`);
      prev = E;
    }
  }
});

test('high-eccentricity solves near M = ±pi land on the correct branch', () => {
  const nearPi = [
    Math.PI, Math.PI - 1e-9, Math.PI - 1e-3, Math.PI - 1e-1,
    -Math.PI, -Math.PI + 1e-9, -Math.PI + 1e-3, -Math.PI + 1e-1,
  ];
  for (const e of [0.9, 0.963, 0.975, 0.99, 0.999]) {
    for (const M of nearPi) {
      const E = solveKeplerElliptic(M, e);
      assert.ok(Number.isFinite(E), `e=${e} M=${M} produced non-finite E`);
      const residual = E - e * Math.sin(E) - normalize(M);
      assert.ok(Math.abs(residual) < 1e-9, `e=${e} M=${M} residual=${residual}`);
      // The root near M = ±pi is close to ±pi (E -> -M branch stays far from 0), so a
      // result clustered around 0 is the signature of the old divergence.
      assert.ok(Math.abs(E) > Math.PI - e - 1e-3, `e=${e} M=${M} E=${E} overshot to the wrong root`);
    }
  }
});

test('conicPropagation.solveEllipticKepler delegates to the shared solver', () => {
  for (const e of ECCENTRICITIES) {
    for (const M of [-3, -1, 0, 0.7, 2.5, 6, Math.PI]) {
      assert.equal(solveEllipticKepler(M, e), solveKeplerElliptic(M, e),
        `delegation mismatch at e=${e} M=${M}`);
    }
  }
});

test('PlanetFleet high-e orbiters move continuously over a full period', () => {
  // Mirror PlanetFleet._localPosition's math (scene-free) for the two highly eccentric
  // orbiters whose per-frame jumps were the visible bug, and confirm the position never
  // jumps by a large fraction of the orbit between adjacent frames.
  const highs = PLANETARY_ORBITERS.filter((s) => {
    const p = PLANETARY_ELEMENTS_J2000[s.parentPlanetId];
    if (!p) return false;
    const rp = p.radiusKm + (s.periapsisKm ?? s.altKm ?? 0);
    const ra = p.radiusKm + (s.apoapsisKm ?? s.periapsisKm ?? s.altKm ?? 0);
    return (ra - rp) / (ra + rp) >= 0.9;
  });
  assert.ok(highs.length >= 2, 'expected at least Juno and Akatsuki to be high-e');

  const DEG2RAD = Math.PI / 180;
  for (const sat of highs) {
    const p = PLANETARY_ELEMENTS_J2000[sat.parentPlanetId];
    const rp = (p.radiusKm + (sat.periapsisKm ?? sat.altKm ?? 0)) / EARTH_RADIUS_KM;
    const ra = (p.radiusKm + (sat.apoapsisKm ?? sat.periapsisKm ?? sat.altKm ?? 0)) / EARTH_RADIUS_KM;
    const a = (rp + ra) / 2;
    const e = (ra - rp) / (ra + rp);
    const b = a * Math.sqrt(Math.max(0, 1 - e * e));
    const incRad = (sat.incDeg ?? 0) * DEG2RAD;
    const raanRad = (sat.raanDeg ?? 0) * DEG2RAD;

    const steps = 2000;
    let prev = null;
    let maxStep = 0;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const M = TWO_PI * frac;
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
        const step = Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z);
        maxStep = Math.max(maxStep, step);
      }
      prev = pos;
    }
    assert.ok(maxStep < a * 0.25,
      `${sat.name}: per-frame jump ${maxStep.toFixed(4)} u is a large fraction of a=${a.toFixed(3)} u`);
  }
});

console.log(`\nKepler solver regression tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
