import assert from 'node:assert/strict';
import * as satjs from 'satellite.js';
import { parseOMM } from '../src/services/DataService.js';

// CelesTrak exhausted its 5-digit catalog numbers on 2026-07-11 and withholds GP data for the
// new 6-digit objects from the TLE/3LE endpoint. The live path now consumes OMM/JSON and
// synthesises the two TLE lines satellite.js v5 needs. These tests prove:
//   1. the synthesis round-trips the OMM elements back through twoline2satrec,
//   2. a 6-digit NORAD ID survives end to end (the whole point of the migration), and
//   3. the synthesised lines match the authoritative Space-Track TLE byte for byte, so the
//      app propagates the same elements the catalogue does.

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

const DEG = Math.PI / 180;

// A real CelesTrak OMM record (ISS), captured from gp.php?CATNR=25544&FORMAT=json.
const ISS_OMM = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-10-08T23:34:55.716384',
  MEAN_MOTION: 15.48782794,
  ECCENTRICITY: 0.00068216,
  INCLINATION: 51.6313,
  RA_OF_ASC_NODE: 96.9458,
  ARG_OF_PERICENTER: 239.5445,
  MEAN_ANOMALY: 120.487,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 58939,
  BSTAR: 0.00011684905,
  MEAN_MOTION_DOT: 0.00005946,
  MEAN_MOTION_DDOT: 0,
};

function parseOne(omm, group = 'stations') {
  const sats = parseOMM(JSON.stringify([omm]), group);
  assert.equal(sats.length, 1, 'one OMM record must yield exactly one satellite');
  return sats[0];
}

console.log('================================================================');
console.log(' OMM / JSON PARSING TEST SUITE');
console.log(' Space Tracker 3D Simulation Platform');
console.log('================================================================\n');

test('OMM is parsed into the TLE-synthesised satellite shape', () => {
  const sat = parseOne(ISS_OMM);
  assert.equal(sat.id, 25544);
  assert.equal(sat.name, 'ISS', 'the ISS display-name override must still apply');
  assert.equal(sat.category, 'iss');
  assert.equal(sat.revAtEpoch, 58939);
  assert.equal(sat.intlDesignator, '98067A');
  assert.match(sat.tle1, /^1 25544U 98067A/);
  assert.match(sat.tle2, /^2 25544/);
  assert.equal(sat.tle1.length, 69, 'line 1 must be a well-formed 69-char TLE line');
  assert.equal(sat.tle2.length, 69, 'line 2 must be a well-formed 69-char TLE line');
});

test('synthesised TLE round-trips the OMM elements through satellite.js', () => {
  const sat = parseOne(ISS_OMM);
  const rec = satjs.twoline2satrec(sat.tle1, sat.tle2);
  assert.equal(rec.error, 0, 'SGP4 must accept the synthesised elements');

  const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (±${tol})`);
  near(rec.inclo, ISS_OMM.INCLINATION * DEG, 2e-6);
  near(rec.nodeo, ISS_OMM.RA_OF_ASC_NODE * DEG, 2e-6);
  near(rec.argpo, ISS_OMM.ARG_OF_PERICENTER * DEG, 2e-6);
  near(rec.mo,    ISS_OMM.MEAN_ANOMALY * DEG, 2e-6);
  near(rec.ecco,  ISS_OMM.ECCENTRICITY, 1e-7);
  near(rec.bstar, ISS_OMM.BSTAR, 1e-7);
  // SGP4's initl applies the standard Kozai correction to the mean motion, so rec.no is not
  // the raw field value; verify the synthesised field itself and that init succeeded.
  near(Number(sat.tle2.substring(52, 63)), ISS_OMM.MEAN_MOTION, 1e-7);
  assert.ok(Number.isFinite(rec.no) && rec.no > 0, 'initl must produce a valid mean motion');
});

test('the propagated state vector is physical (finite, plausible radius)', () => {
  const sat = parseOne(ISS_OMM);
  const rec = satjs.twoline2satrec(sat.tle1, sat.tle2);
  const pv = satjs.propagate(rec, new Date(sat.epochMs));
  assert.ok(pv?.position && Number.isFinite(pv.position.x), 'propagation must return a position');
  const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z);
  assert.ok(r > 6400 && r < 7200, `ISS radius out of range: ${r} km`);
});

test('the epoch survives as an absolute UTC timestamp', () => {
  const sat = parseOne(ISS_OMM);
  assert.equal(sat.epochRaw, '26281.98258931', 'epoch must be converted to YYDDD.DDDDDDDD');
  assert.ok(Math.abs(sat.epochMs - Date.parse('2026-10-08T23:34:55.716Z')) <= 2,
    `epoch drifted: ${sat.epoch}`);
});

test('the synthesised TLE matches the authoritative Space-Track lines byte for byte', () => {
  // Space-Track TLE_LINE1/LINE2 for ISS at this exact OMM epoch (queried 2026-10-09).
  const sat = parseOne(ISS_OMM);
  assert.equal(sat.tle1, '1 25544U 98067A   26281.98258931  .00005946  00000-0  11685-3 0  9992');
  assert.equal(sat.tle2, '2 25544  51.6313  96.9458 0006822 239.5445 120.4870 15.48782794589393');
});

test('a 6-digit NORAD ID is preserved end to end', () => {
  const sat = parseOne({ ...ISS_OMM, NORAD_CAT_ID: 100972, OBJECT_NAME: 'OBJECT Z', OBJECT_ID: '2026-999Z' });
  assert.equal(sat.id, 100972, 'the true 6-digit catalog number must survive');
  // Space-Track encodes >= 100000 as Alpha-5: leading two digits become a letter (A=10),
  // e.g. 100972 -> A0972. Truncating to five digits would collide with a real object.
  assert.match(sat.tle1, /^1 A0972U/, 'line 1 must carry the Alpha-5 catalog number');
  assert.match(sat.tle2, /^2 A0972 /, 'line 2 must carry the Alpha-5 catalog number');
  const rec = satjs.twoline2satrec(sat.tle1, sat.tle2);
  assert.equal(rec.error, 0);
  const pv = satjs.propagate(rec, new Date(sat.epochMs));
  assert.ok(pv?.position && Number.isFinite(pv.position.x),
    'a 6-digit object must still initialise and propagate');
});

test('malformed and empty payloads degrade to an empty list', () => {
  assert.deepEqual(parseOMM('not json', 'stations'), []);
  assert.deepEqual(parseOMM('[]', 'stations'), []);
  assert.deepEqual(parseOMM(JSON.stringify({ error: 'Invalid query' }), 'stations'), []);
  assert.deepEqual(parseOMM(JSON.stringify([{ NORAD_CAT_ID: 1 }]), 'stations'), [],
    'records missing orbital elements are skipped');
});

console.log('\n================================================================');
console.log(` OMM parsing tests: ${passed}/${passed + failed} passed`);
console.log('================================================================');

if (failed > 0) process.exit(1);
