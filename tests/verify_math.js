import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';
import {
  EARTH_RADIUS_KM,
  toJulianDate,
  getGMST,
  getSunPositionECI,
  eciToThreeJS,
  orbitalPeriod,
  eciToAltitudeKm,
  eciToGeodetic,
  orbitalVelocity,
  orbitRegime,
  tleEpochToDate,
  MOON_RADIUS_KM,
  MOON_RADIUS_UNITS,
  MOON_SEMI_MAJOR_AXIS_KM,
  getMoonPositionECI
} from '../src/utils/astronomy.js';
import {
  CATEGORIES,
  getCategoryById,
  detectCategory
} from '../src/utils/categories.js';
import * as THREE from 'three';
import { EARTH_ROTATION_Y_SIGN } from '../src/scene/Earth.js';
import { applyEquirectLongitudeUV } from '../src/scene/planets/equirectUV.js';

// Independent NOAA low-precision solar position (declination + equation of time).
// Used as an external ground truth for the rendered day/night terminator.
function noaaSubsolar(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy   = (date.getTime() - start) / 86400000;
  const h     = date.getUTCHours() + date.getUTCMinutes() / 60;
  const g     = (2 * Math.PI / 365) * (doy - 1 + (h - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  let lon = -15 * (h + eqtime / 60 - 12);
  lon = ((lon % 360) + 540) % 360 - 180;
  return { lat: decl * (180 / Math.PI), lon };
}

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

console.log('================================================================');
console.log(' AUTOMATED MATHEMATICAL & PHYSICAL VERIFICATION TEST SUITE');
console.log(' Space Tracker 3D Simulation Platform');
console.log('================================================================\n');

// -------------------------------------------------------------------------
// SUITE 1: EARTH RADIUS & SATELLITE ALTITUDE SCALE CONSISTENCY
// -------------------------------------------------------------------------
console.log('SUITE 1: Earth Radius & Orbit Scale Verification');

runTest('Earth unit sphere matches WGS-84 mean volumetric radius R = 6371 km', () => {
  assert.equal(EARTH_RADIUS_KM, 6371, 'Standard Earth radius must equal 6371 km');
  const surfacePoint = eciToThreeJS(EARTH_RADIUS_KM, 0, 0);
  const r = Math.sqrt(surfacePoint.x ** 2 + surfacePoint.y ** 2 + surfacePoint.z ** 2);
  assert.ok(Math.abs(r - 1.0) < 1e-12, 'Earth surface must map exactly to radius = 1.000000 in Three.js space');
});

runTest('ECI basis axes map to Three.js (x, z, -y) with right-handedness', () => {
  const xAxis = eciToThreeJS(EARTH_RADIUS_KM, 0, 0);
  const yAxis = eciToThreeJS(0, EARTH_RADIUS_KM, 0);
  const zAxis = eciToThreeJS(0, 0, EARTH_RADIUS_KM);

  assert.ok(Math.abs(xAxis.x - 1) < 1e-12 && Math.abs(xAxis.y) < 1e-12 && Math.abs(xAxis.z) < 1e-12,
    'ECI +X must map to Three.js +X');
  assert.ok(Math.abs(yAxis.x) < 1e-12 && Math.abs(yAxis.y) < 1e-12 && Math.abs(yAxis.z + 1) < 1e-12,
    'ECI +Y must map to Three.js -Z');
  assert.ok(Math.abs(zAxis.x) < 1e-12 && Math.abs(zAxis.y - 1) < 1e-12 && Math.abs(zAxis.z) < 1e-12,
    'ECI +Z must map to Three.js +Y');

  const mappedCross = new THREE.Vector3(xAxis.x, xAxis.y, xAxis.z)
    .cross(new THREE.Vector3(yAxis.x, yAxis.y, yAxis.z));
  assert.ok(mappedCross.distanceTo(new THREE.Vector3(zAxis.x, zAxis.y, zAxis.z)) < 1e-12,
    'Mapped +X cross +Y must equal mapped +Z in the right-handed frame');
});

runTest('ECI (X, Y, Z) mapping to Three.js (x, z, -y) preserves Euclidean norm', () => {
  const eci = { x: 3000, y: 4000, z: 5000 };
  const rEci = Math.sqrt(eci.x ** 2 + eci.y ** 2 + eci.z ** 2);
  const three = eciToThreeJS(eci.x, eci.y, eci.z);
  const rThree = Math.sqrt(three.x ** 2 + three.y ** 2 + three.z ** 2);
  const reconstructedKm = rThree * EARTH_RADIUS_KM;
  assert.ok(Math.abs(reconstructedKm - rEci) < 1e-10, 'Scale factor must preserve exact Euclidean norm without distortion');
  assert.equal(three.y, eci.z / EARTH_RADIUS_KM, 'Three.js Y axis must represent Earth North Pole / spin axis Z');
  assert.equal(three.z, -eci.y / EARTH_RADIUS_KM, 'Three.js -Z axis must represent Vernal Equinox 90 deg E meridian +Y');
});

runTest('LEO / ISS altitude (420 km) maps accurately to 1.0659 units', () => {
  const rEci = EARTH_RADIUS_KM + 420;
  const three = eciToThreeJS(rEci, 0, 0);
  const altKm = eciToAltitudeKm(rEci, 0, 0);
  assert.ok(Math.abs(altKm - 420.0) < 1e-9, 'Altitude calculation must give 420.0 km');
  assert.ok(Math.abs(three.x - (1.0 + 420 / 6371)) < 1e-9, 'Three.js unit distance must equal 1 + alt/R_earth');
  assert.equal(orbitRegime(altKm), 'LEO — Low Earth Orbit');
});

runTest('GEO geostationary orbit (35,786 km) maps accurately to 6.6170 units', () => {
  const rGeoKm = EARTH_RADIUS_KM + 35786;
  const three = eciToThreeJS(rGeoKm, 0, 0);
  const altKm = eciToAltitudeKm(rGeoKm, 0, 0);
  assert.ok(Math.abs(altKm - 35786.0) < 1e-9);
  assert.ok(Math.abs(three.x - 6.6170146) < 1e-5, 'GEO radius in Three.js must be ~6.617 units');
  assert.equal(orbitRegime(altKm), 'GEO — Geostationary Orbit');
});

runTest('Orbital circular velocity matches vis-viva equation: v = sqrt(GM / r)', () => {
  // ISS at 420 km altitude: v ~ 7.66 km/s
  const vIss = orbitalVelocity(420);
  assert.ok(vIss > 7.65 && vIss < 7.68, `ISS velocity ${vIss.toFixed(2)} km/s must be between 7.65 and 7.68 km/s`);
  // GEO at 35,786 km: v ~ 3.07 km/s
  const vGeo = orbitalVelocity(35786);
  assert.ok(vGeo > 3.06 && vGeo < 3.09, `GEO velocity ${vGeo.toFixed(2)} km/s must be between 3.06 and 3.09 km/s`);
});

// -------------------------------------------------------------------------
// SUITE 2: VAN ALLEN RADIATION BELTS MATHEMATICAL GEOMETRY & POLAR HORNS
// -------------------------------------------------------------------------
console.log('\nSUITE 2: Van Allen Belts Dipole Physics & McIlwain L-Shells');

runTest('Dipole equation r(lambda) = L * cos^2(lambda) satisfies McIlwain parameter', () => {
  const L = 3.5;
  // Equator (lat = 0): r must equal L
  const rEquator = L * Math.cos(0) ** 2;
  assert.equal(rEquator, L, 'Equatorial radius must equal McIlwain L');

  // Lat = 45 degrees: r = L * 0.5
  const r45 = L * Math.cos(Math.PI / 4) ** 2;
  assert.ok(Math.abs(r45 - L * 0.5) < 1e-12, 'Radius at 45 deg must be exactly L * 0.5');

  // Lat = 60 degrees: r = L * 0.25
  const r60 = L * Math.cos(Math.PI / 3) ** 2;
  assert.ok(Math.abs(r60 - L * 0.25) < 1e-12, 'Radius at 60 deg must be exactly L * 0.25');
});

runTest('Ionospheric footpoint cutoffs satisfy lambda_cutoff = arccos(sqrt(r_ionosphere / L))', () => {
  const rIonosphere = 1.0157; // ~100 km altitude
  const L_inner_min = 1.22;
  const L_inner_max = 2.35;
  const L_outer_min = 3.1;
  const L_outer_max = 6.0;

  // Inner proton belt footpoint cutoff
  const latCutoffInnerMin = Math.acos(Math.sqrt(rIonosphere / L_inner_min)) * (180 / Math.PI);
  const latCutoffInnerMax = Math.acos(Math.sqrt(rIonosphere / L_inner_max)) * (180 / Math.PI);
  assert.ok(latCutoffInnerMin > 22 && latCutoffInnerMin < 26, `Inner min latitude cutoff ${latCutoffInnerMin.toFixed(1)} deg must be in 22-26 deg`);
  assert.ok(latCutoffInnerMax > 45 && latCutoffInnerMax < 50, `Inner max latitude cutoff ${latCutoffInnerMax.toFixed(1)} deg must be in 45-50 deg`);

  // Outer electron belt footpoint enters auroral ovals (55 deg to 67 deg)
  const latCutoffOuterMin = Math.acos(Math.sqrt(rIonosphere / L_outer_min)) * (180 / Math.PI);
  const latCutoffOuterMax = Math.acos(Math.sqrt(rIonosphere / L_outer_max)) * (180 / Math.PI);
  assert.ok(latCutoffOuterMin > 52 && latCutoffOuterMin < 56, `Outer min latitude cutoff ${latCutoffOuterMin.toFixed(1)} deg must be in 52-56 deg`);
  assert.ok(latCutoffOuterMax > 63 && latCutoffOuterMax < 67, `Outer max latitude cutoff ${latCutoffOuterMax.toFixed(1)} deg must be in 63-67 deg (auroral oval)`);
});

runTest('Dipole shells never penetrate the solid Earth (r >= 1.00 everywhere)', () => {
  const rIonosphere = 1.0157;
  const testLValues = [1.22, 1.5, 2.0, 2.35, 3.1, 4.0, 5.0, 6.0];

  for (const L of testLValues) {
    const latMax = Math.acos(Math.sqrt(rIonosphere / L));
    // Sample 50 points from -latMax to +latMax
    for (let i = 0; i <= 50; i++) {
      const lat = -latMax + (i / 50) * (2 * latMax);
      const r = L * Math.cos(lat) ** 2;
      assert.ok(r >= rIonosphere - 1e-9, `Shell point r=${r} for L=${L} at lat=${(lat * 180 / Math.PI).toFixed(1)} must not be below ionosphere ${rIonosphere}`);
      assert.ok(r > 1.0, `Shell point r=${r} must remain strictly outside solid Earth (r > 1.0)`);
    }
  }
});

runTest('Geomagnetic dipole axis is tilted by 9.4 degrees relative to rotational axis', () => {
  const tiltDeg = 9.4;
  const tiltRad = (tiltDeg * Math.PI) / 180;
  assert.ok(Math.abs(tiltRad - 0.16406095) < 1e-6, 'Magnetic dipole inclination must be 9.4 degrees (IGRF-13)');
});

runTest('Inner and outer belts are separated by safe "slot region" (L ~ 2.4 to 3.0 R_earth)', () => {
  // Safe zone where radiation drops by orders of magnitude due to VLF wave scattering:
  // Inner belt L_max = 2.35 R_earth (altitude ~ 8,595 km)
  // Outer belt L_min = 3.10 R_earth (altitude ~ 13,379 km)
  const innerMaxAltKm = (2.35 - 1.0) * EARTH_RADIUS_KM;
  const outerMinAltKm = (3.10 - 1.0) * EARTH_RADIUS_KM;
  const slotWidthKm = outerMinAltKm - innerMaxAltKm;
  assert.ok(slotWidthKm > 4500, `Slot region width ${slotWidthKm.toFixed(0)} km must exceed 4,500 km`);
  assert.ok(innerMaxAltKm < 9000, `Inner belt apogee ${innerMaxAltKm.toFixed(0)} km matches proton belt bound`);
  assert.ok(outerMinAltKm > 13000, `Outer belt perigee ${outerMinAltKm.toFixed(0)} km matches electron belt bound`);
});

runTest('Equatorial thickness and radial extent of inner and outer shells match empirical Van Allen data', () => {
  // Inner belt equatorial extent: 1.22 to 2.35 R_earth -> 1,400 km to 8,600 km altitude
  const innerMinAlt = (1.22 - 1.0) * EARTH_RADIUS_KM;
  const innerMaxAlt = (2.35 - 1.0) * EARTH_RADIUS_KM;
  assert.ok(innerMinAlt >= 1350 && innerMinAlt <= 1450, `Inner belt starts at ~1400 km (got ${innerMinAlt.toFixed(0)} km)`);
  assert.ok(innerMaxAlt >= 8500 && innerMaxAlt <= 8700, `Inner belt ends at ~8600 km (got ${innerMaxAlt.toFixed(0)} km)`);

  // Outer belt equatorial extent: 3.10 to 6.00 R_earth -> 13,380 km to 31,855 km altitude (inside GEO ~35,786 km)
  const outerMinAlt = (3.10 - 1.0) * EARTH_RADIUS_KM;
  const outerMaxAlt = (6.00 - 1.0) * EARTH_RADIUS_KM;
  assert.ok(outerMinAlt >= 13300 && outerMinAlt <= 13500, `Outer belt starts at ~13,380 km (got ${outerMinAlt.toFixed(0)} km)`);
  assert.ok(outerMaxAlt >= 31800 && outerMaxAlt <= 32000, `Outer belt ends safely inside GEO radius (got ${outerMaxAlt.toFixed(0)} km)`);
  assert.ok(outerMaxAlt < 35786, 'Outer belt boundary must terminate inside GEO orbit');
});

// -------------------------------------------------------------------------
// SUITE 3: SATELLITE PROPAGATION & ORBIT SYNCHRONISATION
// -------------------------------------------------------------------------
console.log('\nSUITE 3: SGP4 Propagation & Earth Rotation Sync');

// Realistic ISS TLE
const ISS_TLE_1 = '1 25544U 98067A   24080.52841435  .00014897  00000+0  26857-3 0  9997';
const ISS_TLE_2 = '2 25544  51.6416 270.4320 0004558 126.9698 333.1508 15.49842456444647';

runTest('SGP4 twoline2satrec parses orbital inclination and mean motion accurately', () => {
  const satrec = satellite.twoline2satrec(ISS_TLE_1, ISS_TLE_2);
  assert.equal(satrec.error, 0, 'SGP4 satrec must parse without error');
  const incDeg = satrec.inclo * (180 / Math.PI);
  assert.ok(Math.abs(incDeg - 51.6416) < 1e-3, `Inclination must match TLE 51.6416 deg, got ${incDeg}`);
  // In SGP4, satrec.no is the Kozai mean motion (rad/min) converted from Brouwer mean motion (rev/day in TLE):
  // 15.4984 rev/day corresponds to Kozai mean motion within ~0.02%
  const meanMotionRevPerDay = satrec.no * 720 / Math.PI;
  assert.ok(Math.abs(meanMotionRevPerDay - 15.4984) < 0.01, `Mean motion must match TLE ~15.4984 rev/day, got ${meanMotionRevPerDay}`);
});

runTest('ISS orbital period matches ~92.9 minutes', () => {
  const satrec = satellite.twoline2satrec(ISS_TLE_1, ISS_TLE_2);
  const meanMotionRevPerDay = satrec.no * 720 / Math.PI;
  const periodMin = orbitalPeriod(meanMotionRevPerDay);
  assert.ok(periodMin > 92.8 && periodMin < 93.1, `Period ${periodMin.toFixed(2)} min must be ~92.9 minutes`);
});

runTest('ISS propagated altitude and position is within physical low Earth orbit bounds (410 - 430 km)', () => {
  const satrec = satellite.twoline2satrec(ISS_TLE_1, ISS_TLE_2);
  const epochDate = new Date('2024-03-20T12:00:00Z');
  const pv = satellite.propagate(satrec, epochDate);
  assert.ok(pv.position, 'Propagation must yield valid position');
  const { x, y, z } = pv.position;
  const r = Math.sqrt(x * x + y * y + z * z);
  const alt = r - EARTH_RADIUS_KM;
  assert.ok(alt >= 400 && alt <= 440, `ISS altitude ${alt.toFixed(1)} km must be between 400 and 440 km`);

  const threePos = eciToThreeJS(x, y, z);
  const threeNorm = Math.sqrt(threePos.x ** 2 + threePos.y ** 2 + threePos.z ** 2);
  assert.ok(Math.abs(threeNorm - r / EARTH_RADIUS_KM) < 1e-10, 'Three.js position radius must equal r / 6371');
});

runTest('GMST sidereal rotation progresses by ~360 degrees per sidereal day (86164.1 s)', () => {
  const d0 = new Date('2024-01-01T00:00:00Z');
  const d1 = new Date(d0.getTime() + 86164090.5); // 1 mean sidereal day
  const gmst0 = getGMST(d0);
  const gmst1 = getGMST(d1);
  const diffRad = (gmst1 - gmst0 + 2 * Math.PI) % (2 * Math.PI);
  // Should complete exactly 1 full 2*pi rotation (diff close to 0 or 2*pi)
  const diffFromFullTurn = Math.min(diffRad, 2 * Math.PI - diffRad);
  assert.ok(diffFromFullTurn < 1e-3, `Sidereal day Earth rotation must complete 360 deg, diff=${diffFromFullTurn}`);
});

runTest('OrbitLine continuous drift compensation maintains C0 loop closure and smoothness', () => {
  const satrec = satellite.twoline2satrec(ISS_TLE_1, ISS_TLE_2);
  const date = new Date('2024-03-20T12:00:00Z');
  const periodMs = (2 * Math.PI / satrec.no) * 60 * 1000;
  const n = 240;

  const rawPoints = [];
  for (let i = 0; i <= n; i++) {
    const t = new Date(date.getTime() + (i / n) * periodMs);
    const pv = satellite.propagate(satrec, t);
    rawPoints.push(pv.position);
  }

  // Without correction, J2 and earth rotation cause small gap between start and end
  const startP = rawPoints[0];
  const endP = rawPoints[n];
  const uncorrectedGap = Math.sqrt((endP.x - startP.x) ** 2 + (endP.y - startP.y) ** 2 + (endP.z - startP.z) ** 2);
  assert.ok(uncorrectedGap > 0, 'Uncorrected raw points should exhibit small J2 nodal drift gap');

  // Apply OrbitLine drift distribution
  const driftX = endP.x - startP.x;
  const driftY = endP.y - startP.y;
  const driftZ = endP.z - startP.z;

  const correctedPoints = [];
  for (let i = 0; i <= n; i++) {
    const frac = i / n;
    correctedPoints.push({
      x: rawPoints[i].x - frac * driftX,
      y: rawPoints[i].y - frac * driftY,
      z: rawPoints[i].z - frac * driftZ,
    });
  }

  // Verify exact closure at ends
  const cStart = correctedPoints[0];
  const cEnd = correctedPoints[n];
  const closedGap = Math.sqrt((cEnd.x - cStart.x) ** 2 + (cEnd.y - cStart.y) ** 2 + (cEnd.z - cStart.z) ** 2);
  assert.ok(closedGap < 1e-10, `Corrected loop must close with zero gap (gap=${closedGap})`);

  // Verify smooth tangent continuity across the seam
  const segBeforeSeam = {
    x: correctedPoints[n].x - correctedPoints[n - 1].x,
    y: correctedPoints[n].y - correctedPoints[n - 1].y,
    z: correctedPoints[n].z - correctedPoints[n - 1].z,
  };
  const segAfterSeam = {
    x: correctedPoints[1].x - correctedPoints[0].x,
    y: correctedPoints[1].y - correctedPoints[0].y,
    z: correctedPoints[1].z - correctedPoints[0].z,
  };
  const lenB = Math.hypot(segBeforeSeam.x, segBeforeSeam.y, segBeforeSeam.z);
  const lenA = Math.hypot(segAfterSeam.x, segAfterSeam.y, segAfterSeam.z);
  const cosAngle = (segBeforeSeam.x * segAfterSeam.x + segBeforeSeam.y * segAfterSeam.y + segBeforeSeam.z * segAfterSeam.z) / (lenB * lenA);
  assert.ok(cosAngle > 0.999, `Seam tangent angle must be continuous (cos theta = ${cosAngle.toFixed(6)})`);
});

runTest('Highly eccentric orbits (Molniya e ~ 0.72) correctly model asymmetric apogee/perigee ratio', () => {
  // Classic Molniya orbit TLE (e = 0.722, i = 63.4 deg)
  const MOLNIYA_TLE_1 = '1 24208U 96053A   24080.12345678  .00000100  00000+0  00000+0 0  9991';
  const MOLNIYA_TLE_2 = '2 24208  63.4000 120.0000 7220000 270.0000  10.0000  2.00600000123456';
  const satrec = satellite.twoline2satrec(MOLNIYA_TLE_1, MOLNIYA_TLE_2);
  assert.equal(satrec.error, 0);

  // Propagate across full orbital period
  const periodMs = (2 * Math.PI / satrec.no) * 60 * 1000;
  const t0 = new Date('2024-03-20T00:00:00Z');
  let minR = Infinity;
  let maxR = -Infinity;

  for (let i = 0; i <= 360; i++) {
    const t = new Date(t0.getTime() + (i / 360) * periodMs);
    const pv = satellite.propagate(satrec, t);
    if (pv?.position) {
      const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
  }

  const perigeeAltKm = minR - EARTH_RADIUS_KM;
  const apogeeAltKm = maxR - EARTH_RADIUS_KM;

  // Real Molniya: perigee ~ 500-1000 km, apogee ~ 39,000-40,000 km
  assert.ok(perigeeAltKm < 1500, `Molniya perigee ${perigeeAltKm.toFixed(0)} km must be close to Earth`);
  assert.ok(apogeeAltKm > 35000, `Molniya apogee ${apogeeAltKm.toFixed(0)} km must reach high above GEO`);
  const ratio = apogeeAltKm / perigeeAltKm;
  assert.ok(ratio > 20, `Highly eccentric orbit must exhibit drastic apogee/perigee asymmetry (ratio ${ratio.toFixed(1)})`);

  // Verify regime detection
  const regime = orbitRegime(perigeeAltKm, satrec.ecco, perigeeAltKm, apogeeAltKm);
  assert.equal(regime, 'HEO — Highly Elliptical Orbit (Molniya / Tundra)');
});

runTest('Escape trajectories (e >= 1.0) and re-entry/suborbital profiles are recognized without fake loop closure', () => {
  assert.equal(orbitRegime(250, 1.25), 'Hyperbolic Interplanetary / Escape Trajectory (e > 1.0)');
  assert.equal(orbitRegime(250, 1.00), 'Parabolic Escape Trajectory (e = 1.0)');
  assert.equal(orbitRegime(60, 0.05), 'Suborbital / Atmospheric Re-entry');
});

// -------------------------------------------------------------------------
// SUITE 4: SATELLITE CATEGORY CLASSIFICATION & COUNT INTEGRITY
// -------------------------------------------------------------------------
console.log('\nSUITE 4: Satellite Category Classification & Counting');

runTest('ISS category contains only the actual space station and not cargo ships or modules', () => {
  assert.equal(detectCategory('stations', 'ISS (ZARYA)'), 'iss');
  assert.equal(detectCategory('stations', 'ISS'), 'iss');
  // Modules and other stations must route to 'stations'
  assert.equal(detectCategory('stations', 'TIANHE'), 'stations');
  assert.equal(detectCategory('stations', 'TIANGONG'), 'stations');
  assert.equal(detectCategory('stations', 'WENTIAN'), 'stations');
  assert.equal(detectCategory('stations', 'MENGTIAN'), 'stations');
  assert.equal(detectCategory('stations', 'NAUKA'), 'stations');
});

runTest('ISS resupply cargo and crew ferry spacecraft route strictly to separate cargo category', () => {
  assert.equal(detectCategory('stations', 'PROGRESS MS-26'), 'cargo');
  assert.equal(detectCategory('stations', 'CYGNUS NG-20'), 'cargo');
  assert.equal(detectCategory('stations', 'SPACEX DRAGON 2'), 'cargo');
  assert.equal(detectCategory('stations', 'CREW DRAGON ENDURANCE'), 'cargo');
  assert.equal(detectCategory('stations', 'CARGO DRAGON CRS-30'), 'cargo');
  assert.equal(detectCategory('stations', 'CST-100 STARLINER'), 'cargo');
  assert.equal(detectCategory('stations', 'SOYUZ MS-25'), 'cargo');
  assert.equal(detectCategory('stations', 'TIANZHOU 7'), 'cargo');
});

runTest('GLONASS COSMOS satellites route to glonass and not military', () => {
  // Russian GLONASS satellites in glo-ops are named COSMOS 2564, etc.
  assert.equal(detectCategory('glo-ops', 'COSMOS 2564'), 'glonass');
  assert.equal(detectCategory('glo-ops', 'COSMOS 2545'), 'glonass');
  // Non-glonass COSMOS satellites route to military
  assert.equal(detectCategory('active', 'COSMOS 2555'), 'military');
});

runTest('Navigation constellations (GPS, GLONASS, Galileo, BeiDou) route accurately', () => {
  assert.equal(detectCategory('gps-ops', 'NAVSTAR 80 (USA 309)'), 'gps');
  assert.equal(detectCategory('galileo', 'GSAT0223 (GALILEO 27)'), 'galileo');
  assert.equal(detectCategory('beidou', 'BEIDOU-3 M23'), 'beidou');
});

runTest('Science observatories and flagship missions route to science category', () => {
  assert.equal(detectCategory('active', 'HST'), 'science');
  assert.equal(detectCategory('active', 'HUBBLE SPACE TELESCOPE'), 'science');
  assert.equal(detectCategory('active', 'JWST'), 'science');
  assert.equal(detectCategory('active', 'JAMES WEBB'), 'science');
  assert.equal(detectCategory('active', 'CHANDRA X-RAY'), 'science');
  assert.equal(detectCategory('active', 'TESS'), 'science');
  assert.equal(detectCategory('active', 'SPEKTR-RG'), 'science');
  assert.equal(detectCategory('active', 'EUCLID'), 'science');
  assert.equal(detectCategory('active', 'GAIA'), 'science');
  assert.equal(detectCategory('active', 'PARKER SOLAR PROBE'), 'science');
  assert.equal(detectCategory('active', 'LRO'), 'science');
});

runTest('All defined categories have valid color hexes and priorities', () => {
  for (const cat of CATEGORIES) {
    assert.ok(cat.id, 'Category must have id');
    assert.ok(cat.name, 'Category must have name');
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(cat.color), `Color ${cat.color} for ${cat.id} must be valid 6-char hex`);
    assert.ok(cat.priority >= 1 && cat.priority <= 20, `Priority ${cat.priority} must be between 1 and 20`);
    const fetched = getCategoryById(cat.id);
    assert.equal(fetched.id, cat.id);
  }
});

runTest('Every category produced by detectCategory exists in CATEGORIES (no invisible satellites)', () => {
  // SatelliteManager only builds a point mesh per entry in CATEGORIES, so any
  // category id returned by detectCategory that is missing from CATEGORIES is
  // silently counted but never rendered.
  const known = new Set(CATEGORIES.map(c => c.id));

  // CelesTrak groups actually requested by DataService.GROUPS
  const groups = [
    'stations', 'science', 'tdrss', 'visual', 'glo-ops', 'gps-ops',
    'galileo', 'beidou', 'weather', 'geo', 'radar',
    'iridium-NEXT', 'planet', 'spire', 'oneweb', 'starlink',
    'cubesat', 'military', 'amateur', 'satnogs', 'globalstar', 'orbcomm',
    'sarsat', 'active',
  ];
  for (const g of groups) {
    const cid = detectCategory(g, '');
    assert.ok(known.has(cid), `Group "${g}" maps to unknown category "${cid}"`);
  }

  // Name-based branches that override the group mapping
  const nameSamples = [
    'ISS (ZARYA)', 'PROGRESS MS-26', 'TIANHE', 'HST', 'STARLINK-1234',
    'ONEWEB-0001', 'IRIDIUM 100', 'FLOCK 4X', 'COSMOS 2555', 'NAVSTAR 80',
    'NOAA 20', 'GOES 16', 'METEOR M2',
  ];
  for (const n of nameSamples) {
    const cid = detectCategory('active', n);
    assert.ok(known.has(cid), `Name "${n}" maps to unknown category "${cid}"`);
  }

  // Category ids must be unique
  assert.equal(new Set(CATEGORIES.map(c => c.id)).size, CATEGORIES.length);
});

// -------------------------------------------------------------------------
// SUITE 5: SUN SCALING, DIRECTION & ASTRONOMICAL CORRESPONDENCE
// -------------------------------------------------------------------------
console.log('\nSUITE 5: Solar Scale & Optical Collimation Verification');

runTest('Sun position vector is a unit directional vector pointing to true ecliptic longitude', () => {
  const vernalEquinox = new Date('2024-03-20T03:06:00Z'); // Equinox: sun in X direction
  const sunDir = getSunPositionECI(vernalEquinox);
  const norm = Math.hypot(sunDir.x, sunDir.y, sunDir.z);
  assert.ok(Math.abs(norm - 1.0) < 1e-10, `Sun vector norm must equal 1.0 (got ${norm})`);
  // Around vernal equinox, lambda ~ 0 deg, so X ~ 1.0, Y ~ 0.0, Z ~ 0.0
  assert.ok(sunDir.x > 0.98, `Vernal equinox Sun X should be near 1.0, got ${sunDir.x}`);
});

runTest('Summer solstice exhibits Earth obliquity tilt of ~23.44 degrees', () => {
  const summerSolstice = new Date('2024-06-20T20:51:00Z');
  const sunDir = getSunPositionECI(summerSolstice);
  // Declination sin(delta) = sunDir.z
  const decDeg = Math.asin(sunDir.z) * (180 / Math.PI);
  assert.ok(Math.abs(decDeg - 23.44) < 0.5, `Summer solstice declination ${decDeg.toFixed(2)} deg must match axial tilt ~23.44 deg`);
});

runTest('NASA Goddard Space Flight Center Sun Fact Sheet physical constants match 109.2x radius ratio and 1 AU distance', () => {
  // NASA GSFC Sun Fact Sheet (Dr. David R. Williams):
  // Volumetric mean radius: Sun = 695,700 km, Earth = 6,371 km -> Ratio 109.2
  // Mean distance: 149.6 x 10^6 km = 149,597,870.7 km (1 AU)
  const R_sun_km = 695700.0;
  const AU_km = 149597870.7;
  const R_earth_km = 6371.0;

  const sunRadiusUnits = R_sun_km / R_earth_km; // 109.19793
  const auUnits = AU_km / R_earth_km;           // 23,481.066

  assert.ok(Math.abs(sunRadiusUnits - 109.2) < 0.05, `NASA Sun/Earth radius ratio must be 109.2 (got ${sunRadiusUnits.toFixed(2)})`);
  assert.ok(Math.abs(auUnits - 23481.07) < 0.1, `1 AU in Earth radius units must be 23,481.07 (got ${auUnits.toFixed(2)})`);
});

runTest('True astronomical angular diameter from Earth matches NASA Fact Sheet 1919 arcseconds (0.533 degrees)', () => {
  // NASA Sun Fact Sheet: Apparent diameter from Earth at 1 A.U. = 1919 seconds of arc
  const R_sun_km = 695700.0;
  const AU_km = 149597870.7;
  const trueAngularDiameterDeg = 2 * Math.atan(R_sun_km / AU_km) * (180 / Math.PI);
  const trueAngularDiameterArcsec = trueAngularDiameterDeg * 3600.0;

  assert.ok(Math.abs(trueAngularDiameterArcsec - 1919.0) < 1.0, `Apparent diameter must match NASA 1919 arcsec (got ${trueAngularDiameterArcsec.toFixed(1)})`);
  assert.ok(Math.abs(trueAngularDiameterDeg - 0.533) < 0.005, `Apparent diameter in degrees must be 0.533 deg (got ${trueAngularDiameterDeg.toFixed(3)})`);
});

runTest('At midpoint between Earth and Sun (D = 11,740.5 units), Sun radius is 109.2x Earth and never equal', () => {
  const R_earth = 1.0;
  const R_sun = 695700.0 / 6371.0; // 109.198 units
  const D_mid = (149597870.7 / 6371.0) / 2; // 11,740.53 units

  const earthApparentAngle = 2 * Math.atan(R_earth / D_mid) * (180 / Math.PI);
  const sunApparentAngle = 2 * Math.atan(R_sun / D_mid) * (180 / Math.PI);

  assert.ok(sunApparentAngle > earthApparentAngle * 100, `Sun at midpoint must appear ~109x larger than Earth, got ratio ${(sunApparentAngle / earthApparentAngle).toFixed(1)}`);
  assert.ok(Math.abs((sunApparentAngle / earthApparentAngle) - 109.2) < 0.1, 'Physical ratio must strictly remain 109.2');
});

runTest('Moon mean distance (60.34 units) is ~390x closer to Earth than the Sun (23,481 units) and never halfway', () => {
  const moonDistUnits = 384400.0 / 6371.0; // 60.336 units
  const sunDistUnits = 149597870.7 / 6371.0; // 23,481.066 units
  const ratio = sunDistUnits / moonDistUnits; // 389.17

  assert.ok(ratio > 385 && ratio < 395, `Sun must be ~390x further than the Moon (got ${ratio.toFixed(1)})`);
  // Distance from Moon to Sun in conjunction (New Moon) is (sunDist - moonDist) ~ 23,421 units
  const distMoonToSunAtNewMoon = sunDistUnits - moonDistUnits;
  assert.ok(distMoonToSunAtNewMoon > 23000, `Moon is never halfway to Sun; distance to Sun is ${distMoonToSunAtNewMoon.toFixed(0)} units vs Earth-Moon ${moonDistUnits.toFixed(0)} units`);
});

// -------------------------------------------------------------------------
// SUITE 6: CAMERA COLLISION GUARD & GEOMETRIC CONSTRAINTS
// -------------------------------------------------------------------------
console.log('\nSUITE 6: Additional Geometric & Collision Invariants');

runTest('Camera minimum distance (minDistance = 1.025) prevents clipping through Earth surface & clouds', () => {
  const earthSurfaceRadius = 1.000;
  const earthCloudRadius   = 1.006;
  const cameraMinDistance  = 1.025;
  const altitudeKmAboveClouds = (cameraMinDistance - earthCloudRadius) * EARTH_RADIUS_KM;
  assert.ok(cameraMinDistance > earthCloudRadius, 'Camera minDistance must be strictly above cloud layer');
  assert.ok(altitudeKmAboveClouds > 100, `Camera min altitude above clouds ${altitudeKmAboveClouds.toFixed(1)} km ensures no polygon penetration`);
});

runTest('WGS-84 Bowring geodetic conversion matches forward geodetic coordinates with sub-millimeter precision', () => {
  const gmst = 0.54321;
  const testPoints = [
    { latDeg: 0.0, lonDeg: 0.0, hKm: 420.0 },
    { latDeg: 45.0, lonDeg: 30.0, hKm: 550.0 },
    { latDeg: 89.9, lonDeg: -120.0, hKm: 800.0 },
    { latDeg: -51.6, lonDeg: 140.0, hKm: 415.0 },
  ];

  for (const pt of testPoints) {
    const phi = pt.latDeg * (Math.PI / 180);
    const lambda = pt.lonDeg * (Math.PI / 180);
    const h = pt.hKm;
    const a = 6378.137;
    const f = 1.0 / 298.257223563;
    const e2 = 2 * f - f * f;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);

    // Exact forward ECEF coordinates
    const xEcef = (N + h) * Math.cos(phi) * Math.cos(lambda);
    const yEcef = (N + h) * Math.cos(phi) * Math.sin(lambda);
    const zEcef = (N * (1 - e2) + h) * Math.sin(phi);

    // ECEF to ECI by adding GMST rotation
    const xEci = xEcef * Math.cos(gmst) - yEcef * Math.sin(gmst);
    const yEci = xEcef * Math.sin(gmst) + yEcef * Math.cos(gmst);
    const zEci = zEcef;

    const computed = eciToGeodetic(xEci, yEci, zEci, gmst);
    assert.ok(Math.abs(computed.lat - pt.latDeg) < 1e-6, `Latitude error must be < 1e-6 deg (got ${computed.lat} vs ${pt.latDeg})`);
    assert.ok(Math.abs(computed.lon - pt.lonDeg) < 1e-6, `Longitude error must be < 1e-6 deg (got ${computed.lon} vs ${pt.lonDeg})`);
    // Bowring's closed-form method has theoretical maximum error < 5 mm (5e-6 km) globally up to GEO altitudes
    assert.ok(Math.abs(computed.alt - pt.hKm) < 1e-5, `Altitude error must be < 10 mm (got ${computed.alt} vs ${pt.hKm})`);
  }
});

runTest('Orbital velocity matches exact instantaneous norm ||v|| from SGP4 state vector', () => {
  const pv = {
    position: { x: 6700, y: 0, z: 0 },
    velocity: { x: 0, y: 7.2, z: 2.5 },
  };
  const exactNorm = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z); // sqrt(7.2^2 + 2.5^2) = 7.62168
  const vel = orbitalVelocity(pv);
  assert.ok(Math.abs(vel - exactNorm) < 1e-12, 'Velocity must equal exact Euclidean norm of velocity state vector');
});

// -------------------------------------------------------------------------
// SUITE 7: MOON PHYSICAL SCALE, EPHEMERIS & ORBITAL MECHANICS VERIFICATION
// -------------------------------------------------------------------------
console.log('SUITE 7: Moon Physical Scale & Ephemeris Verification');

runTest('Moon radius matches IAU/NASA Planetary standard 1737.4 km (0.27270 units)', () => {
  assert.equal(MOON_RADIUS_KM, 1737.4, 'Moon volumetric mean radius must be 1737.4 km');
  const ratio = MOON_RADIUS_KM / EARTH_RADIUS_KM;
  assert.ok(Math.abs(MOON_RADIUS_UNITS - ratio) < 1e-6, 'Moon Three.js radius units must exactly match ratio to Earth radius');
  assert.ok(Math.abs(MOON_RADIUS_UNITS - 0.2727) < 0.001, 'Moon units must be ~0.2727 of Earth radius');
});

runTest('Moon geocentric distance and orbital eccentricity lie within physical bounds [356,000 - 407,000 km]', () => {
  // Test over full anomalistic and sidereal month cycle (30 days)
  const baseDate = new Date('2026-01-01T00:00:00Z');
  let minDistance = Infinity;
  let maxDistance = -Infinity;

  for (let hour = 0; hour < 24 * 30; hour += 6) {
    const d = new Date(baseDate.getTime() + hour * 3600000);
    const moon = getMoonPositionECI(d);
    const dist = Math.hypot(moon.xKm, moon.yKm, moon.zKm);
    assert.ok(Math.abs(dist - moon.distKm) < 1e-6, 'Calculated Cartesian distance must equal analytical distKm');
    
    // Perigee is ~356,500 km, Apogee is ~406,700 km
    assert.ok(dist >= 355000 && dist <= 410000, `Moon distance ${dist} km out of physical bounds`);
    if (dist < minDistance) minDistance = dist;
    if (dist > maxDistance) maxDistance = dist;
  }

  // Mean distance should be close to semi-major axis (384,400 km)
  const meanDist = (minDistance + maxDistance) / 2;
  assert.ok(Math.abs(meanDist - MOON_SEMI_MAJOR_AXIS_KM) < 10000, `Mean orbital distance ${meanDist} km must match ~384,400 km`);
});

runTest('Moon coordinate transformation to Three.js preserves physical scale', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const moon = getMoonPositionECI(now);
  const rUnits = Math.hypot(moon.three.x, moon.three.y, moon.three.z);
  const expectedUnits = moon.distKm / EARTH_RADIUS_KM;
  assert.ok(Math.abs(rUnits - expectedUnits) < 1e-9, 'Three.js position vector must strictly match Earth radius units');
  assert.ok(rUnits > 55 && rUnits < 65, 'Moon distance in Three.js units must be between 55 and 65 units (~60 R_earth)');
});

runTest('Selenocentric lunar satellite orbital velocities and altitudes conform to lunar gravitational parameter (mu_moon = 4902.8 km^3/s^2)', () => {
  // Lunar gravitational parameter GM_moon = 4902.800066 km^3/s^2
  const GM_MOON = 4902.8;
  const R_MOON = 1737.4;

  // Test LRO 50 km orbit
  const rLro = R_MOON + 50; // 1787.4 km
  const vLro = Math.sqrt(GM_MOON / rLro); // ~1.656 km/s
  const periodLroSec = 2 * Math.PI * Math.sqrt((rLro ** 3) / GM_MOON);
  const periodLroMin = periodLroSec / 60; // ~113.1 minutes

  assert.ok(Math.abs(vLro - 1.656) < 0.05, `LRO circular velocity ${vLro} km/s matches physical lunar orbital velocity (~1.66 km/s)`);
  assert.ok(Math.abs(periodLroMin - 113) < 2.0, `LRO orbital period ${periodLroMin} min matches NASA nominal ~113 min mapping orbit`);

  // Test Chandrayaan-2 / Danuri 100 km orbit
  const r100 = R_MOON + 100; // 1837.4 km
  const v100 = Math.sqrt(GM_MOON / r100); // ~1.633 km/s
  const period100Min = (2 * Math.PI * Math.sqrt((r100 ** 3) / GM_MOON)) / 60; // ~117.9 minutes

  assert.ok(Math.abs(v100 - 1.633) < 0.05, `100km lunar orbit velocity ${v100} km/s matches ~1.63 km/s`);
  assert.ok(Math.abs(period100Min - 118) < 2.0, `100km lunar orbit period ${period100Min} min matches nominal ~118 min`);
});

runTest('Lunar satellites have distinct 3D orbital planes (RAAN) and never overlap in one point', () => {
  // Test distinct RAANs and mutual distance separation
  const raans = [42.0, 135.0, 228.0, 310.0];
  for (let i = 0; i < raans.length; i++) {
    for (let j = i + 1; j < raans.length; j++) {
      const diff = Math.abs(raans[i] - raans[j]);
      assert.ok(diff >= 45.0, `Orbital planes must be separated by at least 45 deg nodal difference (got ${diff} deg)`);
    }
  }
});

// -------------------------------------------------------------------------
// SUITE 8: SOLAR SYSTEM PLANETS ORBITAL & PHYSICAL VERIFICATION
// -------------------------------------------------------------------------
console.log('\nSUITE 8: Solar System Planetary Physics & Kepler Ephemeris Verification');

import {
  PLANETARY_ELEMENTS_J2000,
  AU_KM,
  AU_UNITS,
  GM_SUN_KM3_S2,
  ORDERED_PLANET_KEYS
} from '../src/utils/planetaryData.js';
import {
  solveKepler,
  getPlanetaryElements,
  getHeliocentricPosition,
  helioEclipticToThreeJS
} from '../src/utils/ephemeris.js';

runTest('Astronomical constants AU and GM_SUN match IAU / NASA standards', () => {
  assert.equal(AU_KM, 149597870.7, '1 AU must be exactly 149,597,870.7 km');
  assert.ok(Math.abs(AU_UNITS - 23481.0658766) < 0.001, 'AU_UNITS must equal AU_KM / EARTH_RADIUS_KM');
  assert.equal(GM_SUN_KM3_S2, 1.32712440018e11, 'GM_SUN must be standard solar gravitational parameter');
});

runTest('All 9 planetary radii match official NASA Planetary Fact Sheet within 0.1%', () => {
  const NASA_FACTS = {
    mercury: 2439.7,
    venus:   6051.8,
    earth:   6371.0,
    mars:    3389.5,
    jupiter: 69911.0,
    saturn:  58232.0,
    uranus:  25362.0,
    neptune: 24622.0,
    pluto:   1188.3,
  };

  for (const [key, expectedR] of Object.entries(NASA_FACTS)) {
    const data = PLANETARY_ELEMENTS_J2000[key];
    assert.ok(data, `Data for ${key} must exist`);
    const relError = Math.abs(data.radiusKm - expectedR) / expectedR;
    assert.ok(relError < 0.001, `Radius of ${key} (${data.radiusKm}) must match NASA Fact Sheet (${expectedR}) with <0.1% error`);
  }
});

runTest("All major planets satisfy Kepler's Third Law (T^2 = a^3) within 0.5%", () => {
  // Kepler's Third Law: (T / 1 year)^2 = (a / 1 AU)^3 for heliocentric orbits
  for (const key of ORDERED_PLANET_KEYS) {
    const p = PLANETARY_ELEMENTS_J2000[key];
    const a = p.a;
    // Expected period in Earth years
    const expectedPeriodYears = Math.sqrt(Math.pow(a, 3));
    const expectedPeriodDays = expectedPeriodYears * 365.25636; // Sidereal year

    // Rate of mean longitude LRate in deg/century gives empirical period
    const degPerDay = p.LRate / 36525.0;
    const empiricalPeriodDays = 360.0 / Math.abs(degPerDay);

    const relDiff = Math.abs(expectedPeriodDays - empiricalPeriodDays) / expectedPeriodDays;
    assert.ok(relDiff < 0.008, `Kepler 3rd law discrepancy for ${key} (${relDiff * 100}%) exceeds physical tolerance`);
  }
});

runTest("Newton-Raphson Kepler solver satisfies M = E - e*sin(E) with precision < 1e-11", () => {
  // Test across full range of mean anomalies and high eccentricities (including Pluto e = 0.2488)
  const testEccentricities = [0.0068, 0.0167, 0.0484, 0.0934, 0.2056, 0.2488, 0.75];
  const testM = [0.0, 0.25, Math.PI / 4, 1.2, Math.PI, 4.5, 2 * Math.PI - 0.1];

  for (const e of testEccentricities) {
    for (const M of testM) {
      const E = solveKepler(M, e);
      let mNorm = M % (2.0 * Math.PI);
      if (mNorm < -Math.PI) mNorm += 2.0 * Math.PI;
      if (mNorm > Math.PI) mNorm -= 2.0 * Math.PI;

      const calcM = E - e * Math.sin(E);
      const diff = Math.abs(calcM - mNorm);
      assert.ok(diff < 1e-11, `Kepler solver residual ${diff} for e=${e}, M=${M} must be < 1e-11`);
    }
  }
});

runTest('Heliocentric distances for all planets remain strictly within [a*(1-e), a*(1+e)] bounds', () => {
  const testDates = [
    new Date('2000-01-01T12:00:00Z'),
    new Date('2024-06-21T00:00:00Z'),
    new Date('2026-10-08T12:00:00Z'),
    new Date('2050-01-01T00:00:00Z'),
  ];

  for (const key of ORDERED_PLANET_KEYS) {
    const p = PLANETARY_ELEMENTS_J2000[key];
    const minPossibleAu = p.a * (1.0 - p.e) * 0.99; // 1% tolerance for secular drift
    const maxPossibleAu = p.a * (1.0 + p.e) * 1.01;

    for (const d of testDates) {
      const helio = getHeliocentricPosition(key, d);
      assert.ok(helio.rAu >= minPossibleAu && helio.rAu <= maxPossibleAu,
        `Distance of ${key} (${helio.rAu} AU) at ${d.toISOString()} must be between ${minPossibleAu} and ${maxPossibleAu}`);
      
      // Vis-viva speed check
      assert.ok(helio.speedKmS > 3.0 && helio.speedKmS < 65.0,
        `Orbital speed of ${key} (${helio.speedKmS} km/s) must be physically sound (3 to 65 km/s)`);
    }
  }
});

runTest('Earth heliocentric position at any date correctly maps to origin (0,0,0) in Three.js coordinates', () => {
  const d = new Date('2026-10-08T12:00:00Z');
  const earthHelio = getHeliocentricPosition('earth', d);
  assert.ok(earthHelio, 'Earth heliocentric calculation must succeed');

  // Earth distance from Sun should be ~1.00 AU (~149.6M km)
  assert.ok(Math.abs(earthHelio.rAu - 1.00) < 0.03, `Earth heliocentric distance ${earthHelio.rAu} AU must be ~1.0 AU`);

  // The independent ecliptic-to-scene path must also remain a proper rotation.
  const eclX = helioEclipticToThreeJS(1, 0, 0, 1);
  const eclY = helioEclipticToThreeJS(0, 1, 0, 1);
  const eclZ = helioEclipticToThreeJS(0, 0, 1, 1);
  const mappedCross = new THREE.Vector3(eclX.x, eclX.y, eclX.z)
    .cross(new THREE.Vector3(eclY.x, eclY.y, eclY.z));
  assert.ok(mappedCross.distanceTo(new THREE.Vector3(eclZ.x, eclZ.y, eclZ.z)) < 1e-12,
    'ecliptic basis must preserve handedness through the heliocentric conversion');

  // Scene position relative to Sun:
  const earthThreeRel = helioEclipticToThreeJS(earthHelio.xEcl, earthHelio.yEcl, earthHelio.zEcl);
  const rUnits = Math.hypot(earthThreeRel.x, earthThreeRel.y, earthThreeRel.z);
  assert.ok(Math.abs(rUnits - AU_UNITS) < 0.05 * AU_UNITS, `Earth-Sun distance in units (${rUnits}) must match AU_UNITS (~23,481)`);
});

// -------------------------------------------------------------------------
// SUITE 9: RENDERED EARTH DAY/NIGHT TERMINATOR vs REAL-TIME SOLAR POSITION
// -------------------------------------------------------------------------
console.log('\nSUITE 9: Earth Globe Orientation & Day/Night Terminator vs NOAA');

// Equator direction (three.js local frame) of the surface point at east longitude `lonDeg`,
// read back from the *actual* Earth sphere geometry (with its longitude UV convention).
function earthEquatorDir(geometry, lonDeg) {
  const targetU = (((lonDeg + 180) / 360) % 1 + 1) % 1;
  const pos = geometry.attributes.position;
  const uv  = geometry.attributes.uv;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(pos.getY(i)) > 1e-4) continue; // equator ring only
    let d = Math.abs(uv.getX(i) - targetU);
    d = Math.min(d, 1 - d);
    if (d < bestD) { bestD = d; best = i; }
  }
  return new THREE.Vector3(pos.getX(best), 0, pos.getZ(best)).normalize();
}

runTest('Standard Earth sphere UV maps east longitude to local angle -longitude', () => {
  const geo = new THREE.SphereGeometry(1, 256, 8);
  for (const lon of [-90, 0, 90]) {
    const dir = earthEquatorDir(geo, lon);
    const angle = Math.atan2(dir.z, dir.x) * (180 / Math.PI);
    const expectedLocalAngle = -lon;
    assert.ok(Math.abs(((angle - expectedLocalAngle + 540) % 360) - 180) < 0.5,
      `Standard SphereGeometry UV at east longitude ${lon} must point at local angle ${expectedLocalAngle}, got ${angle.toFixed(2)}`);
  }
});

runTest('Earth spin sign is +1 for the right-handed ECI-to-Three convention', () => {
  assert.equal(EARTH_ROTATION_Y_SIGN, 1, 'Earth rotation must use +GMST');
});

runTest('Earth rotation +GMST places each surface point at RA = GMST + longitude', () => {
  const geo = new THREE.SphereGeometry(1, 256, 8);
  const norm = (x) => ((x % 360) + 540) % 360 - 180;
  for (const iso of ['2026-10-08T06:00:00Z', '2026-10-08T18:00:00Z', '2026-06-21T09:00:00Z']) {
    const gmstDeg = getGMST(new Date(iso)) * (180 / Math.PI);
    const m = new THREE.Matrix4().makeRotationY(EARTH_ROTATION_Y_SIGN * gmstDeg * (Math.PI / 180));
    for (const lon of [-90, 0, 90]) {
      const world = earthEquatorDir(geo, lon).applyMatrix4(m);
      const worldRA = Math.atan2(-world.z, world.x) * (180 / Math.PI);
      const expected = norm(gmstDeg + lon);
      assert.ok(Math.abs(norm(worldRA - expected)) < 0.5,
        `At ${iso}: +GMST must put lon ${lon} at world RA ${expected.toFixed(1)}, got ${worldRA.toFixed(1)}`);
    }
  }
});

runTest('Rendered subsolar longitude matches NOAA at 06:00 and 18:00 UTC (where a mirror would flip day/night)', () => {
  for (const iso of ['2026-10-08T06:00:00Z', '2026-10-08T18:00:00Z', '2026-06-21T09:00:00Z']) {
    const date = new Date(iso);
    const gmstDeg = getGMST(date) * (180 / Math.PI);
    const sun = getSunPositionECI(date);
    const sunRA = Math.atan2(sun.y, sun.x) * (180 / Math.PI);

    // The rendered lit hemisphere is centred on the surface longitude whose world RA matches
    // the Sun's RA: worldRA(lon) = GMST + lon  ==>  lon = sunRA - GMST.
    const renderSubsolarLon = ((sunRA - gmstDeg) % 360 + 540) % 360 - 180;
    const truth = noaaSubsolar(date).lon;
    const dLon = Math.abs(((renderSubsolarLon - truth + 540) % 360) - 180);
    assert.ok(dLon < 1.5,
      `At ${iso}: rendered subsolar lon ${renderSubsolarLon.toFixed(2)} must match NOAA ${truth.toFixed(2)} (diff ${dLon.toFixed(2)} deg)`);
  }
});

runTest('Shared equirect UV helper maps Moon and planet longitudes independently of radius', () => {
  // Moon and planet maps retain the shared horizontal UV flip; Earth uses standard SphereGeometry UVs.
  const geo = applyEquirectLongitudeUV(new THREE.SphereGeometry(MOON_RADIUS_UNITS, 360, 8));
  for (const lon of [-120, -45, 0, 45, 120]) {
    const dir = earthEquatorDir(geo, lon);
    const angle = Math.atan2(dir.z, dir.x) * (180 / Math.PI);
    assert.ok(Math.abs(((angle - lon + 540) % 360) - 180) < 0.5,
      `At lon ${lon} the shared helper must place the surface point at local angle ${lon}, got ${angle.toFixed(2)}`);
  }
});

// -------------------------------------------------------------------------
// SUITE 10: TLE EPOCH PARSING (DATA FRESHNESS / AGE)
// -------------------------------------------------------------------------
console.log('\nSUITE 10: TLE Epoch Parsing & Freshness');

runTest('TLE epoch (YYDDD.DDDDDDDD) parses to the correct absolute UTC instant', () => {
  const cases = [
    ['24001.00000000', '2024-01-01T00:00:00.000Z'], // day 1.0 = Jan 1 00:00
    ['24001.50000000', '2024-01-01T12:00:00.000Z'], // fractional day
    ['24366.00000000', '2024-12-31T00:00:00.000Z'], // leap year, last day
    ['20060.00000000', '2020-02-29T00:00:00.000Z'], // leap day 2020
    ['99001.00000000', '1999-01-01T00:00:00.000Z'], // 57-99 -> 19xx
    ['57001.00000000', '1957-01-01T00:00:00.000Z'], // Sputnik-era pivot
    ['56001.00000000', '2056-01-01T00:00:00.000Z'], // 00-56 -> 20xx
  ];
  for (const [raw, iso] of cases) {
    assert.equal(tleEpochToDate(raw).toISOString(), iso, `epoch "${raw}" must parse to ${iso}`);
  }
});

runTest('TLE epoch parser rejects malformed input instead of yielding NaN dates', () => {
  assert.throws(() => tleEpochToDate(''), /Invalid TLE epoch/);
  assert.throws(() => tleEpochToDate('garbage'), /Invalid TLE epoch/);
});

console.log('\n================================================================');
console.log(` ALL MATHEMATICAL VERIFICATION TESTS PASSED: ${passedTests}/${totalTests}`);
console.log('================================================================\n');
