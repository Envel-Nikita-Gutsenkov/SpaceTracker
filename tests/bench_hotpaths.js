// Headless micro-benchmarks for the per-frame hot paths.
//
// These run the same pure functions the render loop calls, in Node, and report real
// milliseconds. That turns "this feels slow" into numbers: how long one full planetary update
// costs, how long a 720-step orbit rebuild costs, how long propagating the whole constellation
// costs. Run with `npm run bench`.
//
// It measures main-thread JS cost only — GPU work (texture uploads, draw calls) is not visible
// here. For the live per-subsystem breakdown in the real app, use `?perf=1`.

import { getGMST, getSunPositionECI, getMoonPositionECI } from '../src/utils/astronomy.js';
import { getPlanetPositionThreeJS, getOrbitTrajectoryPoints } from '../src/utils/ephemeris.js';
import { solveKeplerElliptic } from '../src/utils/keplerEquation.js';
import { ORDERED_PLANET_KEYS } from '../src/utils/planetaryData.js';
import * as satellite from 'satellite.js';

const DATE = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const SUN = getSunPositionECI(DATE);

// A representative low-Earth-orbit TLE (ISS) — enough to exercise the propagator's cost.
const TLE1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  30290-3 0  9993';
const TLE2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49815300 10000';

function bench(name, iterations, fn) {
  // Warm up the JIT before timing.
  const warm = Math.min(iterations, 2000);
  for (let i = 0; i < warm; i++) fn(i);

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn(i);
  const ns = Number(process.hrtime.bigint() - t0);

  const totalMs = ns / 1e6;
  return { name, iterations, totalMs, perOpMs: totalMs / iterations };
}

const results = [];

console.log('================================================================');
console.log(' HOT-PATH MICRO-BENCHMARKS  (main-thread JS cost, Node)');
console.log('================================================================\n');

// --- Per-frame ephemeris -----------------------------------------------------
results.push(bench('getGMST', 200_000, () => getGMST(DATE)));
results.push(bench('getSunPositionECI', 200_000, () => getSunPositionECI(DATE)));
results.push(bench('getMoonPositionECI', 100_000, () => getMoonPositionECI(DATE)));

// --- One full planetary update (all planets, as PlanetarySystem.update does) --
results.push(bench('planetary update (all planets)', 20_000, () => {
  for (const key of ORDERED_PLANET_KEYS) {
    if (key === 'earth') continue;
    getPlanetPositionThreeJS(key, DATE, SUN);
  }
}));

// --- One orbit-line rebuild (PlanetarySystem recomputes these at 720 steps) ---
results.push(bench('orbit rebuild (jupiter, 720 steps)', 500, () =>
  getOrbitTrajectoryPoints('jupiter', DATE, SUN, 720)));
results.push(bench('orbit rebuild (mars, 720 steps)', 500, () =>
  getOrbitTrajectoryPoints('mars', DATE, SUN, 720)));

// --- Kepler solver -----------------------------------------------------------
results.push(bench('solveKeplerElliptic', 500_000, (i) =>
  solveKeplerElliptic((i % 628) / 100, 0.7)));

// --- Constellation propagation (what SatelliteManager.update does per frame) --
const satrec = satellite.twoline2satrec(TLE1, TLE2);
results.push(bench('propagate x 10 000 sats', 20, () => {
  for (let i = 0; i < 10_000; i++) satellite.propagate(satrec, DATE);
}));

// -----------------------------------------------------------------------------
results.sort((a, b) => b.totalMs - a.totalMs);

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log(
  pad('scenario', 34) + padL('iters', 9) + padL('total ms', 12) +
  padL('per op ms', 12) + padL('per op us', 12)
);
console.log('-'.repeat(79));
for (const r of results) {
  console.log(
    pad(r.name, 34) +
    padL(r.iterations.toLocaleString('en-US'), 9) +
    padL(r.totalMs.toFixed(1), 12) +
    padL(r.perOpMs.toFixed(4), 12) +
    padL((r.perOpMs * 1000).toFixed(2), 12)
  );
}

// A 16.7 ms frame budget: flag any single scenario that already blows it.
console.log('\nFrame-budget check (16.7 ms @ 60 fps):');
let worst = 0;
for (const r of results) {
  if (r.perOpMs > worst) worst = r.perOpMs;
  const verdict = r.perOpMs > 16.7 ? 'OVER BUDGET' : 'ok';
  console.log(`  ${pad(r.name, 34)} ${r.perOpMs.toFixed(4)} ms  ${verdict}`);
}
console.log(`\nWorst single scenario: ${worst.toFixed(4)} ms`);
