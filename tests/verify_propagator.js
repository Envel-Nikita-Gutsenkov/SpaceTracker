import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';

// Behavioral coverage for the Web Worker propagator. The module registers itself on the
// global `self.onmessage`, so we install a fake worker scope before importing it, then drive
// it exactly as the main thread does (init -> ready, propagate -> positions) and check the
// real two-line-element propagation math and the Earth-radius/Three.js axis conversion.

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

let TOTAL = 0;

console.log('Satellite propagator worker verification tests');

const posted = [];
globalThis.self = {
  postMessage: (msg, transfer) => { posted.push({ msg, transfer }); },
  onmessage: null,
};

await import('../src/workers/propagator.worker.js');

function last(type) {
  for (let i = posted.length - 1; i >= 0; i--) {
    if (posted[i].msg.type === type) return posted[i];
  }
  return null;
}
function reset() { posted.length = 0; }

// A real ISS TLE (epoch 2024-001.5). The second is malformed on purpose.
const ISS_TLE_1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9005';
const ISS_TLE_2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537';
const BAD_TLE_1 = '1 THIS IS NOT A TLE';
const BAD_TLE_2 = '2 NEITHER IS THIS';

// ---------------------------------------------------------------------------
// 1. init / ready
// ---------------------------------------------------------------------------
TOTAL++;
test('init reports a ready count for the satellites it accepted', () => {
  reset();
  globalThis.self.onmessage({ data: { type: 'init', data: [
    { id: 25544, tle1: ISS_TLE_1, tle2: ISS_TLE_2 },
  ] } });
  const ready = last('ready');
  assert.ok(ready, 'worker must post a ready message');
  assert.equal(ready.msg.count, 1);
});

TOTAL++;
test('a malformed TLE is not fatal and still occupies its slot', () => {
  reset();
  // The worker must survive a bad record (rec.error) instead of throwing, keeping the id.
  globalThis.self.onmessage({ data: { type: 'init', data: [
    { id: 1, tle1: BAD_TLE_1, tle2: BAD_TLE_2 },
    { id: 25544, tle1: ISS_TLE_1, tle2: ISS_TLE_2 },
  ] } });
  const ready = last('ready');
  assert.equal(ready.msg.count, 2, 'both slots are retained so ids stay aligned');

  reset();
  globalThis.self.onmessage({ data: { type: 'propagate', data: { timeMs: Date.UTC(2024, 0, 1, 12) } } });
  const pos = last('positions');
  assert.equal(pos.msg.valid[0], 0, 'the malformed satellite must be flagged invalid');
  assert.equal(pos.msg.valid[1], 1, 'the valid satellite must be flagged valid');
});

// ---------------------------------------------------------------------------
// 2. propagate -> positions
// ---------------------------------------------------------------------------
TOTAL++;
test('propagate posts transferable position/valid buffers aligned with the ids', () => {
  reset();
  globalThis.self.onmessage({ data: { type: 'init', data: [
    { id: 25544, tle1: ISS_TLE_1, tle2: ISS_TLE_2 },
  ] } });
  reset();
  globalThis.self.onmessage({ data: { type: 'propagate', data: { timeMs: Date.UTC(2024, 0, 1, 12) } } });

  const { msg, transfer } = last('positions');
  assert.ok(msg.positions instanceof Float32Array);
  assert.ok(msg.valid instanceof Uint8Array);
  assert.equal(msg.positions.length, 3);
  assert.equal(msg.valid.length, 1);
  assert.deepEqual(msg.ids, [25544]);
  // Both buffers must be transferred (zero-copy) to the main thread.
  assert.equal(transfer.length, 2);
});

TOTAL++;
test('the propagated ISS position sits at a plausible low-Earth-orbit radius', () => {
  reset();
  globalThis.self.onmessage({ data: { type: 'init', data: [
    { id: 25544, tle1: ISS_TLE_1, tle2: ISS_TLE_2 },
  ] } });
  reset();
  globalThis.self.onmessage({ data: { type: 'propagate', data: { timeMs: Date.UTC(2024, 0, 1, 12) } } });

  const { msg } = last('positions');
  const [x, y, z] = msg.positions;
  assert.equal(msg.valid[0], 1);
  const rEarth = Math.sqrt(x * x + y * y + z * z);
  // ISS orbital radius ~ 6790 km => ~1.066 Earth radii. Accept the perigee..apogee band + margin.
  assert.ok(rEarth > 1.02 && rEarth < 1.12,
    `ISS radius ${rEarth.toFixed(4)} Earth radii is outside the expected LEO band`);
});

TOTAL++;
test('worker ECI-to-Three conversion matches the right-handed frame', () => {
  const date = new Date(Date.UTC(2024, 0, 1, 12));
  const rec = satellite.twoline2satrec(ISS_TLE_1, ISS_TLE_2);
  const expected = satellite.propagate(rec, date).position;

  reset();
  globalThis.self.onmessage({ data: { type: 'init', data: [
    { id: 25544, tle1: ISS_TLE_1, tle2: ISS_TLE_2 },
  ] } });
  reset();
  globalThis.self.onmessage({ data: { type: 'propagate', data: { timeMs: date.getTime() } } });

  const { msg } = last('positions');
  const [x, y, z] = msg.positions;
  const scale = 1 / 6371;
  assert.ok(Math.abs(x - expected.x * scale) < 1e-6, 'worker X must equal ECI X');
  assert.ok(Math.abs(y - expected.z * scale) < 1e-6, 'worker Y must equal north-pole ECI Z');
  assert.ok(Math.abs(z + expected.y * scale) < 1e-6, 'worker Z must equal negative eastward ECI Y');
});

TOTAL++;
test('re-initialising replaces the previous constellation', () => {
  reset();
  globalThis.self.onmessage({ data: { type: 'init', data: [
    { id: 1, tle1: ISS_TLE_1, tle2: ISS_TLE_2 },
    { id: 2, tle1: ISS_TLE_1, tle2: ISS_TLE_2 },
  ] } });
  reset();
  globalThis.self.onmessage({ data: { type: 'init', data: [
    { id: 3, tle1: ISS_TLE_1, tle2: ISS_TLE_2 },
  ] } });
  reset();
  globalThis.self.onmessage({ data: { type: 'propagate', data: { timeMs: Date.UTC(2024, 0, 1, 12) } } });
  const { msg } = last('positions');
  assert.equal(msg.positions.length, 3, 'only the latest single satellite must remain');
  assert.deepEqual(msg.ids, [3]);
});

console.log(`\nPropagator worker tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
