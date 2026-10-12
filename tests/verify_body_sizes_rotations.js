import assert from 'node:assert/strict';
import { PLANETARY_ELEMENTS_J2000, ORDERED_PLANET_KEYS } from '../src/utils/planetaryData.js';
import { DWARF_PLANETS, ORDERED_DWARF_KEYS } from '../src/utils/dwarfPlanets.js';
import { MOONS, ORDERED_MOON_KEYS } from '../src/utils/moons.js';
import { ALL_BODIES, getBodyData } from '../src/utils/smallBodies.js';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM } from '../src/utils/astronomy.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const TOTAL = 10;

// Relative difference against an authoritative value.
function relDiff(actual, expected) {
  return Math.abs(actual - expected) / Math.abs(expected);
}

// ---------------------------------------------------------------------------
// Authoritative reference values (km, deg, hours). Sources match the module
// headers: NASA/JPL Planetary Fact Sheets, JPL SBDB, NASA Science & cited papers.
// ---------------------------------------------------------------------------

const PLANET_RADII_KM = {
  mercury: 2439.7, venus: 6051.8, earth: 6371.0, mars: 3389.5,
  jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622, pluto: 1188.3,
};

const DWARF_RADII_KM = {
  ceres: 469.7, orcus: 455, haumea: 772, quaoar: 549, makemake: 715,
  gonggong: 615, eris: 1163, sedna: 498, salacia: 419,
  varda: 324, ixion: 348.4, mani: 398, aya: 384, achlys: 353, uni: 305, hygiea: 216.5,
};

const MOON_RADII_KM = {
  phobos: 11.267, deimos: 6.2, io: 1821.6, europa: 1560.8, ganymede: 2634.1,
  callisto: 2410.3, mimas: 198.2, enceladus: 252.1, tethys: 531.1, dione: 561.4,
  rhea: 763.8, titan: 2574.73, iapetus: 734.5, miranda: 235.8, ariel: 578.9,
  umbriel: 584.7, titania: 788.4, oberon: 761.4, triton: 1353.4, charon: 606.0,
};

const PLANET_TILTS_DEG = {
  mercury: 0.034, venus: 177.36, earth: 23.44, mars: 25.19, jupiter: 3.13,
  saturn: 26.73, uranus: 97.77, neptune: 28.32, pluto: 122.53,
};

const PLANET_ROT_HOURS = {
  mercury: 1407.6, venus: -5832.5, earth: 23.9344, mars: 24.6229, jupiter: 9.925,
  saturn: 10.656, uranus: -17.24, neptune: 16.11, pluto: -153.3,
};

// Moons in synchronous rotation: sidereal spin == orbital period.
// Hi'iaka, Namaka and Hyperion are deliberately excluded (they are not synchronous).
const SYNCHRONOUS_MOONS = [
  'phobos', 'deimos',
  'metis', 'adrastea', 'amalthea', 'thebe', 'io', 'europa', 'ganymede', 'callisto',
  'pan', 'atlas', 'prometheus', 'pandora', 'janus', 'epimetheus', 'mimas', 'enceladus',
  'helene', 'tethys', 'dione', 'rhea', 'titan', 'iapetus',
  'puck', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon',
  'naiad', 'thalassa', 'despina', 'galatea', 'larissa', 'proteus', 'triton',
  'charon', 'styx', 'nix', 'kerberos', 'hydra',
  'dysnomia', 'mk2', 'weywot', 'vanth', 'actaea', 'ilmare',
];

console.log('Body sizes and rotations verification');

// ---------------------------------------------------------------------------
// SIZES
// ---------------------------------------------------------------------------

test('planet radii match authoritative values within 0.5%', () => {
  // The expected set must cover exactly the ordered planet keys.
  assert.deepEqual(
    Object.keys(PLANET_RADII_KM).sort(),
    [...ORDERED_PLANET_KEYS].sort(),
    'expected planet-radius table must cover every ordered planet key',
  );
  for (const [key, expected] of Object.entries(PLANET_RADII_KM)) {
    const body = PLANETARY_ELEMENTS_J2000[key];
    assert.ok(body, `missing planet data for ${key}`);
    assert.ok(Number.isFinite(body.radiusKm), `${key}.radiusKm is not finite`);
    const diff = relDiff(body.radiusKm, expected);
    assert.ok(diff <= 0.005, `${key}.radiusKm=${body.radiusKm} vs ${expected} (rel ${(diff * 100).toFixed(4)}%)`);
    if (diff > 1e-9) console.log(`  [NOTE] ${key}.radiusKm=${body.radiusKm} vs authoritative ${expected} (${(diff * 100).toFixed(4)}%)`);
  }
});

test('dwarf radii match authoritative values within 5%', () => {
  assert.deepEqual(
    Object.keys(DWARF_RADII_KM).sort(),
    [...ORDERED_DWARF_KEYS].sort(),
    'expected dwarf-radius table must cover every ordered dwarf key',
  );
  for (const [key, expected] of Object.entries(DWARF_RADII_KM)) {
    const body = DWARF_PLANETS[key];
    assert.ok(body, `missing dwarf data for ${key}`);
    assert.ok(Number.isFinite(body.radiusKm), `${key}.radiusKm is not finite`);
    const diff = relDiff(body.radiusKm, expected);
    assert.ok(diff <= 0.05, `${key}.radiusKm=${body.radiusKm} vs ${expected} (rel ${(diff * 100).toFixed(4)}%)`);
    if (diff > 1e-9) console.log(`  [NOTE] ${key}.radiusKm=${body.radiusKm} vs authoritative ${expected} (${(diff * 100).toFixed(4)}%)`);
  }
});

test('moon radii match authoritative values within 5%', () => {
  for (const [key, expected] of Object.entries(MOON_RADII_KM)) {
    const body = MOONS[key];
    assert.ok(body, `missing moon data for ${key}`);
    assert.ok(Number.isFinite(body.radiusKm), `${key}.radiusKm is not finite`);
    const diff = relDiff(body.radiusKm, expected);
    assert.ok(diff <= 0.05, `${key}.radiusKm=${body.radiusKm} vs ${expected} (rel ${(diff * 100).toFixed(4)}%)`);
    if (diff > 1e-9) console.log(`  [NOTE] ${key}.radiusKm=${body.radiusKm} vs authoritative ${expected} (${(diff * 100).toFixed(4)}%)`);
  }
});

test('every body has finite positive mass/radius and a finite positive scene scale factor', () => {
  // Astronomy-scale constants the whole scene derives from.
  assert.equal(EARTH_RADIUS_KM, 6371, 'EARTH_RADIUS_KM must be 6371 km');
  assert.equal(MOON_RADIUS_KM, 1737.4, 'MOON_RADIUS_KM must be 1737.4 km');

  const keys = Object.keys(ALL_BODIES);
  assert.ok(keys.length >= ORDERED_PLANET_KEYS.length + ORDERED_DWARF_KEYS.length + ORDERED_MOON_KEYS.length,
    'ALL_BODIES should contain at least every ordered planet, dwarf and moon');

  for (const id of keys) {
    const body = getBodyData(id);
    assert.ok(body, `getBodyData(${id}) returned null`);
    assert.equal(body, ALL_BODIES[id], `getBodyData(${id}) must return the registered record`);

    assert.ok(Number.isFinite(body.massKg), `${id}.massKg is not finite`);
    assert.ok(body.massKg > 0, `${id}.massKg must be strictly positive (got ${body.massKg})`);

    assert.ok(Number.isFinite(body.radiusKm), `${id}.radiusKm is not finite`);
    assert.ok(body.radiusKm > 0, `${id}.radiusKm must be strictly positive (got ${body.radiusKm})`);

    // This ratio is the sphere radius in scene units used by the renderer.
    const scale = body.radiusKm / EARTH_RADIUS_KM;
    assert.ok(Number.isFinite(scale), `${id} scene scale factor is not finite`);
    assert.ok(scale > 0, `${id} scene scale factor must be strictly positive (got ${scale})`);
  }
});

// ---------------------------------------------------------------------------
// ROTATIONS
// ---------------------------------------------------------------------------

test('planet axial tilts match authoritative values within 0.5 deg', () => {
  for (const [key, expected] of Object.entries(PLANET_TILTS_DEG)) {
    const body = PLANETARY_ELEMENTS_J2000[key];
    assert.ok(body, `missing planet data for ${key}`);
    assert.ok(Number.isFinite(body.axialTiltDeg), `${key}.axialTiltDeg is not finite`);
    const delta = Math.abs(body.axialTiltDeg - expected);
    assert.ok(delta <= 0.5, `${key}.axialTiltDeg=${body.axialTiltDeg} vs ${expected} (delta ${delta.toFixed(4)} deg)`);
  }
});

test('planet sidereal rotation periods match authoritative values within 0.5%', () => {
  for (const [key, expected] of Object.entries(PLANET_ROT_HOURS)) {
    const body = PLANETARY_ELEMENTS_J2000[key];
    assert.ok(body, `missing planet data for ${key}`);
    assert.ok(Number.isFinite(body.rotPeriodHours), `${key}.rotPeriodHours is not finite`);
    const diff = relDiff(body.rotPeriodHours, expected);
    assert.ok(diff <= 0.005, `${key}.rotPeriodHours=${body.rotPeriodHours} vs ${expected} (rel ${(diff * 100).toFixed(4)}%)`);
  }
});

test('planet rotation sign convention: Venus, Uranus and Pluto are retrograde', () => {
  const retrograde = ['venus', 'uranus', 'pluto'];
  for (const key of ORDERED_PLANET_KEYS) {
    const period = PLANETARY_ELEMENTS_J2000[key].rotPeriodHours;
    assert.ok(Number.isFinite(period), `${key}.rotPeriodHours is not finite`);
    assert.notEqual(period, 0, `${key}.rotPeriodHours must be non-zero`);
    if (retrograde.includes(key)) {
      assert.ok(period < 0, `${key} must have a NEGATIVE (retrograde) rotation period, got ${period}`);
    } else {
      assert.ok(period > 0, `${key} must have a POSITIVE (prograde) rotation period, got ${period}`);
    }
  }
});

test('synchronous moons are tidally locked (rotPeriodHours matches orbital period within 1%)', () => {
  for (const key of SYNCHRONOUS_MOONS) {
    const moon = MOONS[key];
    assert.ok(moon, `missing moon data for ${key}`);
    assert.ok(Number.isFinite(moon.rotPeriodHours), `${key}.rotPeriodHours is not finite`);
    assert.ok(Number.isFinite(moon.elements?.periodDays), `${key}.elements.periodDays is not finite`);
    const expected = moon.elements.periodDays * 24;
    const diff = relDiff(moon.rotPeriodHours, expected);
    assert.ok(diff <= 0.01,
      `${key}: rotPeriodHours=${moon.rotPeriodHours} vs periodDays*24=${expected} (rel ${(diff * 100).toFixed(4)}%)`);
  }

  // Non-synchronous moons must NOT be forced into the lock (guards the exclusion list).
  for (const key of ['hiiaka', 'namaka', 'hyperion']) {
    const moon = MOONS[key];
    const expected = moon.elements.periodDays * 24;
    assert.ok(relDiff(moon.rotPeriodHours, expected) > 0.01,
      `${key} was expected to be non-synchronous but matches periodDays*24`);
  }
});

test('dwarf planets Eris, Salacia and Varda are tidally locked to their moons', () => {
  // Eris–Dysnomia, Salacia–Actaea and Varda–Ilmarë are mutually synchronised (Wikipedia
  // infoboxes; Szakáts et al. 2023; Collyer et al. 2025). JPL SBDB still lists the older,
  // superseded short spins for Eris/Salacia, so it is deliberately NOT the source here.
  const locks = [
    ['eris', 'dysnomia'],
    ['salacia', 'actaea'],
    ['varda', 'ilmare'],
  ];
  for (const [dwarf, moon] of locks) {
    const expected = MOONS[moon].elements.periodDays * 24;
    assert.ok(relDiff(DWARF_PLANETS[dwarf].rotPeriodHours, expected) <= 0.01,
      `${dwarf}.rotPeriodHours=${DWARF_PLANETS[dwarf].rotPeriodHours} vs ${moon} period ${expected}`);
  }
});

test('every body axial tilt is finite and within [0, 180] deg', () => {
  for (const id of Object.keys(ALL_BODIES)) {
    const tilt = getBodyData(id).axialTiltDeg;
    assert.ok(Number.isFinite(tilt), `${id}.axialTiltDeg is not finite`);
    assert.ok(tilt >= 0 && tilt <= 180, `${id}.axialTiltDeg=${tilt} outside [0, 180]`);
  }
});

console.log(`\nBody sizes and rotations verification: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
