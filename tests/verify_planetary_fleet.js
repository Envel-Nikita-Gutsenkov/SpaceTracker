import assert from 'node:assert/strict';
import { PLANETARY_ORBITERS, PLANETARY_ORBITER_COUNTS } from '../src/utils/planetaryFleet.js';
import { DEEP_SPACE_PROBES } from '../src/utils/deepSpaceProbes.js';
import { PLANETARY_ELEMENTS_J2000, getBodyGM } from '../src/utils/planetaryData.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const TOTAL = 9;

console.log('Planetary fleet & deep-space probe data tests');

test('every planetary orbiter references a real parent planet', () => {
  for (const sat of PLANETARY_ORBITERS) {
    assert.ok(sat.parentPlanetId, `${sat.name} has no parentPlanetId`);
    assert.ok(PLANETARY_ELEMENTS_J2000[sat.parentPlanetId],
      `${sat.name} orbits unknown body "${sat.parentPlanetId}"`);
    assert.notEqual(sat.parentPlanetId, 'earth', `${sat.name} must not use the Earth fleet`);
    assert.ok(sat.isPlanetary, `${sat.name} must be flagged isPlanetary`);
  }
});

test('planetary orbiter orbital parameters are physically valid', () => {
  for (const sat of PLANETARY_ORBITERS) {
    const radiusKm = PLANETARY_ELEMENTS_J2000[sat.parentPlanetId].radiusKm;
    assert.ok(Number.isFinite(sat.periapsisKm) && sat.periapsisKm > 0,
      `${sat.name} needs a positive periapsis altitude`);
    assert.ok(Number.isFinite(sat.apoapsisKm) && sat.apoapsisKm >= sat.periapsisKm,
      `${sat.name} apoapsis must be >= periapsis`);
    assert.ok(sat.periapsisKm + radiusKm > radiusKm, `${sat.name} periapsis inside the planet`);
    assert.ok(Number.isFinite(sat.periodMin) && sat.periodMin > 0, `${sat.name} needs a positive period`);
    assert.ok(sat.incDeg >= 0 && sat.incDeg <= 180, `${sat.name} inclination out of range`);
  }
});

test('planetary orbiter ids and NORAD ids are unique', () => {
  const ids = PLANETARY_ORBITERS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate orbiter id: ${ids.join(', ')}`);
  const norads = PLANETARY_ORBITERS.filter(s => s.noradId != null).map(s => s.noradId);
  assert.equal(new Set(norads).size, norads.length, 'duplicate orbiter NORAD id');
});

test('every orbiter carries bilingual copy and an official https source', () => {
  for (const sat of PLANETARY_ORBITERS) {
    assert.ok(sat.name && sat.agency, `${sat.id} missing name/agency`);
    assert.ok(sat.desc && sat.descRu, `${sat.id} missing EN/RU description`);
    assert.ok(/^https:\/\//.test(sat.wikiUrl || ''), `${sat.id} needs an https official URL`);
    assert.ok(sat.keywords, `${sat.id} missing search keywords`);
  }
});

test('BepiColombo is flagged as a planned (not yet inserted) orbit', () => {
  const bepi = PLANETARY_ORBITERS.find(s => s.id === 'bepicolombo');
  assert.ok(bepi, 'BepiColombo must be present');
  assert.equal(bepi.isPlanned, true, 'BepiColombo must be marked planned');
});

test('orbital elements satisfy Kepler\'s third law with the parent GM', () => {
  // T = 2π √(a³/μ) with a and μ in km, s. The published periapsis and period are the
  // anchor; apoapsis (or period) must be mutually consistent, otherwise the rendered
  // orbiter drifts off its own orbit trace. Tolerance absorbs fact-sheet rounding.
  for (const sat of PLANETARY_ORBITERS) {
    const parent = PLANETARY_ELEMENTS_J2000[sat.parentPlanetId];
    const mu = getBodyGM(sat.parentPlanetId);
    assert.ok(mu > 0, `${sat.name}: parent ${sat.parentPlanetId} has no mass/GM`);
    const rp = parent.radiusKm + sat.periapsisKm;
    const ra = parent.radiusKm + (sat.apoapsisKm ?? sat.periapsisKm);
    const a = (rp + ra) / 2;
    const tkepMin = (2 * Math.PI * Math.sqrt((a * a * a) / mu)) / 60;
    const ratio = tkepMin / sat.periodMin;
    assert.ok(Math.abs(ratio - 1) < 0.03,
      `${sat.name}: Kepler period ${tkepMin.toFixed(0)} min vs listed ${sat.periodMin} ` +
      `min (ratio ${ratio.toFixed(3)}) — periapsis/apoapsis/period are inconsistent`);
  }
});

test('orbiter counts match the grouped helper', () => {
  const total = Object.values(PLANETARY_ORBITER_COUNTS).reduce((a, b) => a + b, 0);
  assert.equal(total, PLANETARY_ORBITERS.length, 'grouped counts must sum to the fleet size');
  assert.equal(PLANETARY_ORBITER_COUNTS.mars, 7, 'Mars should have 7 listed orbiters');
});

test('every deep-space probe is a valid unbound heliocentric conic', () => {
  for (const p of DEEP_SPACE_PROBES) {
    assert.ok(p.isDeepSpace, `${p.id} must be flagged isDeepSpace`);
    assert.ok(p.heliocentric, `${p.id} must be heliocentric`);
    const el = p.elements;
    assert.ok(el, `${p.id} missing elements`);
    assert.ok(el.e > 1, `${p.id} must be hyperbolic (e > 1), got e=${el.e}`);
    assert.ok(el.aKm < 0, `${p.id} hyperbolic semi-major axis must be negative`);
    assert.ok(el.qKm > 0, `${p.id} needs a positive periapsis distance`);
    assert.ok(Number.isFinite(el.Tp) && Number.isFinite(el.nDegPerSec) && el.nDegPerSec > 0,
      `${p.id} needs a valid periapsis epoch and mean motion`);
    // a(1 - e) must equal q for a consistent conic.
    assert.ok(Math.abs(el.aKm * (1 - el.e) - el.qKm) / el.qKm < 1e-6,
      `${p.id}: a(1-e) must equal qKm`);
  }
});

test('deep-space probe ids and NORAD ids are unique and non-colliding with orbiters', () => {
  const ids = DEEP_SPACE_PROBES.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate probe id');
  const allNorads = [
    ...PLANETARY_ORBITERS.filter(s => s.noradId != null).map(s => s.noradId),
    ...DEEP_SPACE_PROBES.filter(p => p.noradId != null).map(p => p.noradId),
  ];
  assert.equal(new Set(allNorads).size, allNorads.length, 'duplicate NORAD id across fleets');
});

console.log(`\nPlanetary fleet data tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
