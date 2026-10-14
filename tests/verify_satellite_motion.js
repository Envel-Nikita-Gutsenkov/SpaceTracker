import assert from 'node:assert/strict';
import {
  eciVelocityToScene,
  extrapolationDt,
  MAX_EXTRAPOLATION_SEC,
} from '../src/utils/satelliteMotion.js';
import { eciToThreeJS, EARTH_RADIUS_KM } from '../src/utils/astronomy.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const TOTAL = 7;

console.log('Satellite motion extrapolation tests');

// The velocity frame change must match the position frame change exactly, otherwise the
// extrapolated point drifts off the sampled trajectory.
test('eciVelocityToScene uses the same axis permutation and scale as eciToThreeJS', () => {
  const vx = 1.1, vy = -2.2, vz = 3.3;
  const v = eciVelocityToScene(vx, vy, vz);
  assert.equal(v.x, vx / EARTH_RADIUS_KM);
  assert.equal(v.y, vz / EARTH_RADIUS_KM);
  assert.equal(v.z, -vy / EARTH_RADIUS_KM);
});

test('the frame change commutes with motion, so the extrapolated point stays on the trajectory', () => {
  const p = { x: 1000, y: -2000, z: 3000 };
  const v = { x: 7.5, y: -1.2, z: 0.3 };
  const t = 0.7;
  const pEnd = { x: p.x + v.x * t, y: p.y + v.y * t, z: p.z + v.z * t };

  const s0 = eciToThreeJS(p.x, p.y, p.z);
  const s1 = eciToThreeJS(pEnd.x, pEnd.y, pEnd.z);
  const sv = eciVelocityToScene(v.x, v.y, v.z);

  assert.ok(Math.abs(s0.x + sv.x * t - s1.x) < 1e-9, 'x mismatch');
  assert.ok(Math.abs(s0.y + sv.y * t - s1.y) < 1e-9, 'y mismatch');
  assert.ok(Math.abs(s0.z + sv.z * t - s1.z) < 1e-9, 'z mismatch');
});

test('extrapolationDt returns the elapsed seconds for a normal forward step', () => {
  assert.equal(extrapolationDt(1000, 1500), 0.5);
  assert.equal(extrapolationDt(0, 250), 0.25);
});

test('extrapolationDt clamps rewinds to 0 and oversized steps to the maximum', () => {
  assert.equal(extrapolationDt(2000, 1000), 0, 'a rewind must not move backwards');
  assert.equal(extrapolationDt(0, 1000 * (MAX_EXTRAPOLATION_SEC + 5)), MAX_EXTRAPOLATION_SEC);
});

test('extrapolationDt is safe for non-finite inputs', () => {
  assert.equal(extrapolationDt(NaN, 1000), 0);
  assert.equal(extrapolationDt(1000, NaN), 0);
  assert.equal(extrapolationDt(undefined, 1000), 0);
  assert.equal(extrapolationDt(1000, Infinity), 0);
});

test('extrapolation cuts the per-frame position jump far below snapping', () => {
  // A LEO-like circular orbit in scene units: radius r, angular rate w per simulation-second.
  const r = 1.1;                    // ~700 km altitude (Earth radii = 1)
  const period = 5400;              // s, ~90 min
  const w = (2 * Math.PI) / period;
  const posAt = (t) => ({ x: r * Math.cos(w * t), y: r * Math.sin(w * t) });
  const velAt = (t) => ({ x: -r * w * Math.sin(w * t), y: r * w * Math.cos(w * t) });

  const fps = 60;
  const frameDt = 1 / fps;
  const sampleInterval = 1.0;       // worker tick interval at 1x time scale

  let sampleTime = 0;
  let snapPrev = null;
  let extPrev = null;
  let snapMax = 0;
  let extMax = 0;

  for (let f = 0; f <= 120; f++) {
    const t = f * frameDt;
    // Advance the worker sample at tick boundaries.
    while (t - sampleTime >= sampleInterval) sampleTime += sampleInterval;
    const sample = posAt(sampleTime);
    const vel = velAt(sampleTime);

    const snapped = sample; // what the renderer showed before: hold until the next tick
    const dt = extrapolationDt(sampleTime * 1000, t * 1000, MAX_EXTRAPOLATION_SEC);
    const extrap = { x: sample.x + vel.x * dt, y: sample.y + vel.y * dt };

    if (snapPrev) snapMax = Math.max(snapMax, Math.hypot(snapped.x - snapPrev.x, snapped.y - snapPrev.y));
    if (extPrev) extMax = Math.max(extMax, Math.hypot(extrap.x - extPrev.x, extrap.y - extPrev.y));

    snapPrev = snapped;
    extPrev = extrap;
  }

  assert.ok(snapMax > 0, 'the snapped path must exhibit a visible jump');
  assert.ok(extMax < snapMax * 0.2,
    `extrapolated per-frame jump ${extMax.toExponential(3)} should be far below snapped ${snapMax.toExponential(3)}`);
});

test('the extrapolation clock advances when worker data lands, so the point never snaps backwards', () => {
  // Circular LEO-like orbit in scene units (Earth radius = 1).
  const r = 1.1;
  const period = 5400;
  const w = (2 * Math.PI) / period;
  const posAt = (t) => ({ x: r * Math.cos(w * t), y: r * Math.sin(w * t) });
  const velAt = (t) => ({ x: -r * w * Math.sin(w * t), y: r * w * Math.cos(w * t) });
  const angleOf = (p) => Math.atan2(p.y, p.x);

  const fps = 60;
  const frameDt = 1 / fps;
  const tickInterval = 1.0; // worker is asked once per simulated second
  const latency = 0.12;     // replies land this long after the request

  // Simulate the render loop and return the largest backwards (negative along-track) step.
  // `clockAtRequest` reproduces the buggy scheme that reset the extrapolation clock the moment a
  // tick fired, while the position buffer was still one tick stale.
  function maxBackwardStep(clockAtRequest) {
    let master = posAt(0);
    let masterVel = velAt(0);
    let sampleClock = 0;
    let pendingReq = -1;
    let nextTick = 0;
    let prevAngle = angleOf(master);
    let maxBack = 0;

    for (let f = 0; f <= fps * 3; f++) {
      const t = f * frameDt;

      if (t >= nextTick) {
        pendingReq = nextTick;
        if (clockAtRequest) sampleClock = pendingReq; // buggy: clock jumped at request time
        nextTick += tickInterval;
      }
      if (pendingReq >= 0 && t >= pendingReq + latency) {
        master = posAt(pendingReq);
        masterVel = velAt(pendingReq);
        if (!clockAtRequest) sampleClock = pendingReq; // fixed: clock advances when data lands
        pendingReq = -1;
      }

      const dt = extrapolationDt(sampleClock * 1000, t * 1000, MAX_EXTRAPOLATION_SEC);
      const p = { x: master.x + masterVel.x * dt, y: master.y + masterVel.y * dt };

      let d = angleOf(p) - prevAngle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (d < 0) maxBack = Math.max(maxBack, -d);
      prevAngle = angleOf(p);
    }
    return maxBack;
  }

  const perTick = w * tickInterval; // radians of along-track motion per worker tick
  const buggy = maxBackwardStep(true);
  const fixed = maxBackwardStep(false);

  assert.ok(buggy > perTick * 0.5,
    `the old request-time clock should snap a visible distance backwards (got ${buggy}, tick=${perTick})`);
  assert.ok(fixed < perTick * 0.02,
    `the landed-data clock must not move backwards (got ${fixed}, tick=${perTick})`);
});

console.log(`\nSatellite motion extrapolation tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
