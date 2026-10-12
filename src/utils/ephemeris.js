import { toJulianDate, EARTH_RADIUS_KM } from './astronomy.js';
import {
  PLANETARY_ELEMENTS_J2000,
  AU_KM,
  AU_UNITS,
  GM_SUN_KM3_S2
} from './planetaryData.js';
import { solveKeplerElliptic } from './keplerEquation.js';

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

// Mean obliquity of the ecliptic at J2000.0 (IAU standard: 23° 26' 21.406")
export const ECLIPTIC_OBLIQUITY_RAD = 23.4392911 * DEG2RAD;

// Kepler's Equation solver: M = E - e * sin(E) for the eccentric anomaly E (radians).
// Delegates to the shared divergence-free solver in keplerEquation.js.
export function solveKepler(M, e) {
  return solveKeplerElliptic(M, e);
}

// Compute osculating Keplerian orbital elements at specified Date
export function getPlanetaryElements(planetId, date) {
  const base = PLANETARY_ELEMENTS_J2000[planetId];
  if (!base) return null;

  const jd = toJulianDate(date);
  const T = (jd - 2451545.0) / 36525.0; // Centuries since J2000.0

  const a = base.a + base.aRate * T;
  const e = base.e + base.eRate * T;
  const I = (base.I + base.IRate * T) * DEG2RAD;
  const L = ((base.L + base.LRate * T) % 360.0 + 360.0) % 360.0 * DEG2RAD;
  const longPeri = ((base.longPeri + base.longPeriRate * T) % 360.0 + 360.0) % 360.0 * DEG2RAD;
  const longNode = ((base.longNode + base.longNodeRate * T) % 360.0 + 360.0) % 360.0 * DEG2RAD;

  // Argument of perihelion: omega = longPeri - longNode
  const omega = longPeri - longNode;
  // Mean anomaly: M = L - longPeri
  const M = L - longPeri;

  return { a, e, I, L, longPeri, longNode, omega, M, T };
}

// Compute 3D Heliocentric Ecliptic position (in AU) and velocity (in km/s)
export function getHeliocentricPosition(planetId, date) {
  const el = getPlanetaryElements(planetId, date);
  if (!el) return null;

  const { a, e, I, omega, longNode, M } = el;
  const E = solveKepler(M, e);

  // Coordinates in orbital plane
  const xPrime = a * (Math.cos(E) - e);
  const yPrime = a * Math.sqrt(Math.max(0.0, 1.0 - e * e)) * Math.sin(E);

  // Distance from Sun in AU
  const rAu = Math.sqrt(xPrime * xPrime + yPrime * yPrime);
  const rKm = rAu * AU_KM;
  const aKm = a * AU_KM;

  // Vis-viva equation: v = sqrt(GM * (2/r - 1/a))
  const speedKmS = Math.sqrt(Math.max(0.0, GM_SUN_KM3_S2 * (2.0 / rKm - 1.0 / aKm)));

  // Orbital plane to heliocentric ecliptic coordinates rotation (Euler angles: longNode, I, omega)
  const cosNode = Math.cos(longNode);
  const sinNode = Math.sin(longNode);
  const cosInc  = Math.cos(I);
  const sinInc  = Math.sin(I);
  const cosW    = Math.cos(omega);
  const sinW    = Math.sin(omega);

  const Px = cosW * cosNode - sinW * sinNode * cosInc;
  const Py = cosW * sinNode + sinW * cosNode * cosInc;
  const Pz = sinW * sinInc;

  const Qx = -sinW * cosNode - cosW * sinNode * cosInc;
  const Qy = -sinW * sinNode + cosW * cosNode * cosInc;
  const Qz = cosW * sinInc;

  const xEcl = xPrime * Px + yPrime * Qx;
  const yEcl = xPrime * Py + yPrime * Qy;
  const zEcl = xPrime * Pz + yPrime * Qz;

  return {
    xEcl,
    yEcl,
    zEcl,
    rAu,
    rKm,
    speedKmS,
    elements: el,
  };
}

// Convert Heliocentric Ecliptic vector (AU) to scene coordinate system (Three.js units)
// Scene coordinate convention:
// Earth center is at origin (0, 0, 0).
// Earth North Pole is aligned with +Y axis.
// Sun is at sunPosScene (distance ~23481.06 units).
// Heliocentric coordinates are offset from the Sun position.
export function helioEclipticToThreeJS(xEcl, yEcl, zEcl, scale = AU_UNITS) {
  const eps = ECLIPTIC_OBLIQUITY_RAD;
  const cosEps = Math.cos(eps);
  const sinEps = Math.sin(eps);

  // Ecliptic to Equatorial (ECI):
  // X_eci = X_ecl
  // Y_eci = Y_ecl * cos(eps) - Z_ecl * sin(eps)
  // Z_eci = Y_ecl * sin(eps) + Z_ecl * cos(eps)
  const xEci = xEcl;
  const yEci = yEcl * cosEps - zEcl * sinEps;
  const zEci = yEcl * sinEps + zEcl * cosEps;

  // ECI to Three.js, as a right-handed rotation:
  // Three.js X = ECI X; Y = ECI Z (North Pole); Z = -ECI Y (east).
  return {
    x: xEci * scale,
    y: zEci * scale,
    z: -yEci * scale,
  };
}

// Compute planet position in Three.js coordinates relative to Sun's scene position
export function getPlanetPositionThreeJS(planetId, date, sunPosScene) {
  const helio = getHeliocentricPosition(planetId, date);
  if (!helio) return null;

  const relSun = helioEclipticToThreeJS(helio.xEcl, helio.yEcl, helio.zEcl);

  // Position in scene = Sun_Position + Vector_Sun_To_Planet
  return {
    x: sunPosScene.x + relSun.x,
    y: sunPosScene.y + relSun.y,
    z: sunPosScene.z + relSun.z,
    relSun,
    helio,
  };
}

// Compute Euclidean distance from Earth (origin 0,0,0) to planet in km and AU
export function getGeocentricDistanceKm(planetId, date, sunPosScene) {
  const pos = getPlanetPositionThreeJS(planetId, date, sunPosScene);
  if (!pos) return 0;
  const distUnits = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  const distKm = distUnits * EARTH_RADIUS_KM;
  const distAu = distKm / AU_KM;
  return { distKm, distAu, distUnits };
}

// Generate smooth 3D orbit trajectory points in Three.js coordinates
export function getOrbitTrajectoryPoints(planetId, date, sunPosScene, steps = 180) {
  const el = getPlanetaryElements(planetId, date);
  if (!el) return [];

  const { a, e, I, omega, longNode } = el;
  const cosNode = Math.cos(longNode);
  const sinNode = Math.sin(longNode);
  const cosInc  = Math.cos(I);
  const sinInc  = Math.sin(I);
  const cosW    = Math.cos(omega);
  const sinW    = Math.sin(omega);

  const Px = cosW * cosNode - sinW * sinNode * cosInc;
  const Py = cosW * sinNode + sinW * cosNode * cosInc;
  const Pz = sinW * sinInc;

  const Qx = -sinW * cosNode - cosW * sinNode * cosInc;
  const Qy = -sinW * sinNode + cosW * cosNode * cosInc;
  const Qz = cosW * sinInc;

  const points = [];
  const b = a * Math.sqrt(Math.max(0.0, 1.0 - e * e));

  for (let i = 0; i <= steps; i++) {
    const E = (i / steps) * 2.0 * Math.PI;
    const xPrime = a * (Math.cos(E) - e);
    const yPrime = b * Math.sin(E);

    const xEcl = xPrime * Px + yPrime * Qx;
    const yEcl = xPrime * Py + yPrime * Qy;
    const zEcl = xPrime * Pz + yPrime * Qz;

    const relSun = helioEclipticToThreeJS(xEcl, yEcl, zEcl);
    points.push({
      x: sunPosScene.x + relSun.x,
      y: sunPosScene.y + relSun.y,
      z: sunPosScene.z + relSun.z,
    });
  }

  return points;
}
