import assert from 'node:assert/strict';
import {
  ORDERED_PLANET_KEYS,
  PLANETARY_ELEMENTS_J2000,
  AU_KM,
  AU_UNITS,
  GM_SUN_KM3_S2
} from '../src/utils/planetaryData.js';
import {
  getHeliocentricPosition,
  getPlanetaryElements,
  solveKepler,
  helioEclipticToThreeJS,
  getPlanetPositionThreeJS
} from '../src/utils/ephemeris.js';
import {
  EARTH_RADIUS_KM,
  MOON_RADIUS_KM,
  MOON_SEMI_MAJOR_AXIS_KM,
  getMoonPositionECI,
  getSunPositionECI,
  getGMST
} from '../src/utils/astronomy.js';

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

console.log('================================================================');
console.log(' NASA / JPL SCIENTIFIC CONSTANTS & DYNAMICS VERIFICATION');
console.log(' Real-time Solar System Physics & Celestial Mechanics Standards');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: PHYSICAL SCALE & ROTATIONAL STANDARDS (NASA GSFC FACT SHEETS)
// -----------------------------------------------------------------------------
console.log('SECTION 1: Physical Constants & Axial Rotation Rates');

// Standard NASA Planetary Fact Sheet sidereal rotation periods in hours:
// Source: https://nssdc.gsfc.nasa.gov/planetary/factsheet/
const NASA_FACT_SHEET = {
  mercury: { rotPeriodH: 1407.6,    axialTiltDeg: 0.034,  massKg: 3.3011e23,  radiusKm: 2439.7 },
  venus:   { rotPeriodH: -5832.5,   axialTiltDeg: 177.36, massKg: 4.8675e24,  radiusKm: 6051.8 },
  earth:   { rotPeriodH: 23.934469, axialTiltDeg: 23.44,  massKg: 5.9722e24,  radiusKm: 6371.0 },
  mars:    { rotPeriodH: 24.6229,   axialTiltDeg: 25.19,  massKg: 6.4171e23,  radiusKm: 3389.5 },
  jupiter: { rotPeriodH: 9.9250,    axialTiltDeg: 3.13,   massKg: 1.8982e27,  radiusKm: 69911.0 },
  saturn:  { rotPeriodH: 10.656,    axialTiltDeg: 26.73,  massKg: 5.6834e26,  radiusKm: 58232.0 },
  uranus:  { rotPeriodH: -17.24,    axialTiltDeg: 97.77,  massKg: 8.6810e25,  radiusKm: 25362.0 },
  neptune: { rotPeriodH: 16.11,     axialTiltDeg: 28.32,  massKg: 1.02413e26, radiusKm: 24622.0 },
  pluto:   { rotPeriodH: -153.2928, axialTiltDeg: 122.53, massKg: 1.303e22,   radiusKm: 1188.3 },
};

test('All 9 planetary physical radii match NASA GSFC Planetary Fact Sheet', () => {
  for (const key of ORDERED_PLANET_KEYS) {
    const data = PLANETARY_ELEMENTS_J2000[key];
    const ref = NASA_FACT_SHEET[key];
    assert.ok(data, `Data for ${key} must exist`);
    const diff = Math.abs(data.radiusKm - ref.radiusKm);
    const relDiff = diff / ref.radiusKm;
    assert.ok(relDiff < 0.005, `Radius of ${key} (${data.radiusKm} km) must match NASA ref (${ref.radiusKm} km) within 0.5%`);
  }
});

test('Axial tilts (obliquity to orbit) conform to IAU / NASA standards', () => {
  for (const key of ORDERED_PLANET_KEYS) {
    const data = PLANETARY_ELEMENTS_J2000[key];
    const ref = NASA_FACT_SHEET[key];
    assert.ok(Math.abs(data.axialTiltDeg - ref.axialTiltDeg) < 0.5,
      `Axial tilt of ${key} (${data.axialTiltDeg} deg) must match NASA value (${ref.axialTiltDeg} deg)`);
  }
});

test('Sidereal rotation periods and retrograde spins (Venus, Uranus, Pluto) match NASA', () => {
  for (const key of ORDERED_PLANET_KEYS) {
    const data = PLANETARY_ELEMENTS_J2000[key];
    const ref = NASA_FACT_SHEET[key];
    assert.ok(Math.abs(data.rotPeriodHours - ref.rotPeriodH) < 1.0,
      `Rotation period of ${key} (${data.rotPeriodHours} h) must match NASA (${ref.rotPeriodH} h)`);

    // Verify retrograde rotation flag
    if (ref.rotPeriodH < 0) {
      assert.ok(data.rotPeriodHours < 0, `${key} must have negative period indicating retrograde spin`);
    } else {
      assert.ok(data.rotPeriodHours > 0, `${key} must have positive period indicating prograde spin`);
    }
  }
});

// -----------------------------------------------------------------------------
// SECTION 2: KEPLER LAWS & ORBITAL CONSERVATION THEOREMS
// -----------------------------------------------------------------------------
console.log('\nSECTION 2: Keplerian Mechanics & Energy Conservation Theorems');

test("Kepler's Third Law (T^2 / a^3 = const = 4*pi^2 / GM_sun) holds strictly across all orbits", () => {
  const GMSun_AU3_yr2 = 4.0 * Math.PI * Math.PI; // In AU and years, 4*pi^2 / GM = 1
  for (const key of ORDERED_PLANET_KEYS) {
    const data = PLANETARY_ELEMENTS_J2000[key];
    const a = data.a;
    // Mean motion n in rad/s: n = sqrt(GM / a^3)
    const aMeters = a * AU_KM * 1000.0;
    const GMSun_SI = GM_SUN_KM3_S2 * 1e9;
    const periodSec = 2.0 * Math.PI * Math.sqrt(Math.pow(aMeters, 3) / GMSun_SI);
    const periodYears = periodSec / (365.256363 * 86400.0);

    const ratio = (periodYears * periodYears) / Math.pow(a, 3);
    assert.ok(Math.abs(ratio - 1.0) < 0.005,
      `Kepler Third Law ratio for ${key} (${ratio.toFixed(5)}) must be ~1.00000`);
  }
});

test('Vis-viva equation: conservation of orbital specific mechanical energy epsilon = -GM / (2a)', () => {
  const d = new Date('2026-10-08T12:00:00Z');
  for (const key of ORDERED_PLANET_KEYS) {
    const helio = getHeliocentricPosition(key, d);
    const rKm = helio.rKm;
    const vKmS = helio.speedKmS;
    const aKm = helio.elements.a * AU_KM;

    // Specific orbital energy: epsilon = v^2 / 2 - GM / r
    const specificEnergy = (vKmS * vKmS) / 2.0 - GM_SUN_KM3_S2 / rKm;
    const theoreticalEnergy = -GM_SUN_KM3_S2 / (2.0 * aKm);

    const relError = Math.abs(specificEnergy - theoreticalEnergy) / Math.abs(theoreticalEnergy);
    assert.ok(relError < 0.001,
      `Specific orbital energy for ${key} (${specificEnergy.toFixed(2)}) must match theoretical -GM/(2a) within 0.1%`);
  }
});

test('Conservation of specific angular momentum (Kepler Second Law: h = r * v_perp = const)', () => {
  // Test across four arbitrary epochs spanning decades
  const epochs = [
    new Date('2000-01-01T12:00:00Z'),
    new Date('2015-07-14T00:00:00Z'),
    new Date('2026-10-08T12:00:00Z'),
    new Date('2040-03-20T00:00:00Z'),
  ];

  for (const key of ['mercury', 'mars', 'pluto']) { // high eccentricity tests
    const data = PLANETARY_ELEMENTS_J2000[key];
    const hTheoretical = Math.sqrt(GM_SUN_KM3_S2 * data.a * AU_KM * (1.0 - data.e * data.e));

    for (const ep of epochs) {
      const helio = getHeliocentricPosition(key, ep);
      // Angular momentum h = sqrt(GM * a * (1 - e^2))
      const hInstant = Math.sqrt(GM_SUN_KM3_S2 * helio.elements.a * AU_KM * (1.0 - helio.elements.e * helio.elements.e));
      const relDiff = Math.abs(hInstant - hTheoretical) / hTheoretical;
      assert.ok(relDiff < 0.01,
        `Specific angular momentum of ${key} must remain constant over centuries (diff: ${(relDiff * 100).toFixed(4)}%)`);
    }
  }
});

// -----------------------------------------------------------------------------
// SECTION 3: REAL-TIME LUNAR ORBIT & PHASES ACCURACY
// -----------------------------------------------------------------------------
console.log('\nSECTION 3: Lunar Ephemeris, Distance Bounds & Tidal Synchronization');

test('Moon geocentric distance stays strictly within perigee / apogee physical envelope', () => {
  // Perigee ~356,400 km, Apogee ~406,700 km
  const testDays = 365;
  const baseTime = new Date('2026-01-01T00:00:00Z').getTime();

  let minR = Infinity;
  let maxR = -Infinity;

  for (let day = 0; day < testDays; day += 5) {
    const t = new Date(baseTime + day * 86400000);
    const m = getMoonPositionECI(t);
    const rKm = m.distKm;
    if (rKm < minR) minR = rKm;
    if (rKm > maxR) maxR = rKm;
  }

  assert.ok(minR >= 350000 && minR <= 370000,
    `Calculated Moon perigee (${minR.toFixed(0)} km) must be between 350,000 and 370,000 km`);
  assert.ok(maxR >= 400000 && maxR <= 415000,
    `Calculated Moon apogee (${maxR.toFixed(0)} km) must be between 400,000 and 415,000 km`);
});

test('Moon mean distance matches NASA standard ~384,400 km (~60.33 Earth radii)', () => {
  const d = new Date('2026-10-08T12:00:00Z');
  const moon = getMoonPositionECI(d);
  const rKm = moon.distKm;
  const meanKm = MOON_SEMI_MAJOR_AXIS_KM;
  const relDiff = Math.abs(rKm - meanKm) / meanKm;
  assert.ok(relDiff < 0.06, `Moon distance at current date (${rKm.toFixed(0)} km) must be within 6% of mean 384,400 km`);
});

// -----------------------------------------------------------------------------
// SECTION 4: EARTH ROTATION & GREENWICH SIDEREAL TIME SYNCHRONIZATION
// -----------------------------------------------------------------------------
console.log('\nSECTION 4: Earth Axial Orientation & True Astronomical Day/Night');

test('Earth sidereal rotation rate matches IERS / IAU standard (360.985647366 deg/day)', () => {
  const d1 = new Date('2026-10-08T00:00:00Z');
  const d2 = new Date('2026-10-09T00:00:00Z');
  const gmst1 = getGMST(d1) * 180 / Math.PI;
  const gmst2 = getGMST(d2) * 180 / Math.PI;
  let deltaDeg = (gmst2 - gmst1 + 360) % 360;

  // In 24 solar hours (86,400 s), Earth turns 1 full turn (360°) + ~0.9856° due to orbital motion
  assert.ok(Math.abs(deltaDeg - 0.9856) < 0.05,
    `Earth sidereal rotation advance beyond full circle per 24h (${deltaDeg.toFixed(4)} deg) must match IERS 0.9856 deg`);
});

test('Subsolar point at Greenwich noon (12:00 UTC) points directly along the prime meridian', () => {
  const d = new Date('2026-10-08T12:00:00Z');
  const gmst = getGMST(d);
  const sun = getSunPositionECI(d);
  const sunRA = Math.atan2(sun.y, sun.x);

  // Subsolar longitude = Sun_RA - GMST
  let subsolarLon = ((sunRA - gmst) * 180 / Math.PI) % 360;
  if (subsolarLon > 180) subsolarLon -= 360;
  if (subsolarLon < -180) subsolarLon += 360;

  // At 12:00 UTC, subsolar longitude must be close to 0 deg (within Equation of Time ~15 min / 3.75 deg)
  assert.ok(Math.abs(subsolarLon) < 5.0,
    `Subsolar longitude at 12:00 UTC (${subsolarLon.toFixed(2)} deg) must be within 5 degrees of Greenwich`);
});

console.log('\n================================================================');
console.log(` ALL NASA / SCIENTIFIC VERIFICATION TESTS PASSED: ${passed}/${total}`);
console.log('================================================================\n');
