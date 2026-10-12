// Ephemeris for small bodies: dwarf planets (heliocentric osculating conics) and natural
// satellites (parent-relative mean elements). Kept separate from ephemeris.js so that
// ephemeris.js stays free of a dependency on conicPropagation (which imports ephemeris).
//
// Frames: dwarf elements are heliocentric J2000 ecliptic (JPL SBDB). Moon elements are mean
// elements relative to the parent's Laplace plane (≈ the parent's equatorial plane for close
// regular moons). The moon offset is computed in the Laplace/equatorial plane and the caller
// tilts the moon sub-group by the parent's axial tilt to place it in the parent's equator.

import { AU_KM } from './planetaryData.js';
import { toJulianDate } from './astronomy.js';
import { helioEclipticToThreeJS } from './ephemeris.js';
import { solveEllipticKepler, heliocentricConicThreeJS, sampleConicRing } from './conicPropagation.js';
import { getBodyData } from './smallBodies.js';

const DEG2RAD = Math.PI / 180;
const SECONDS_PER_DAY = 86400;

// Perifocal→reference-plane rotation basis (P, Q), shared by the moon propagator.
function perifocalBasis(iDeg, nodeDeg, argPeriDeg) {
  const inc = iDeg * DEG2RAD;
  const node = nodeDeg * DEG2RAD;
  const argPeri = argPeriDeg * DEG2RAD;
  const cosNode = Math.cos(node), sinNode = Math.sin(node);
  const cosInc = Math.cos(inc), sinInc = Math.sin(inc);
  const cosW = Math.cos(argPeri), sinW = Math.sin(argPeri);
  return {
    Px: cosW * cosNode - sinW * sinNode * cosInc,
    Py: cosW * sinNode + sinW * cosNode * cosInc,
    Pz: sinW * sinInc,
    Qx: -sinW * cosNode - cosW * sinNode * cosInc,
    Qy: -sinW * sinNode + cosW * cosNode * cosInc,
    Qz: cosW * sinInc,
  };
}

// ---------------------------------------------------------------------------
// Dwarf planets — heliocentric osculating elements (JPL SBDB).
// ---------------------------------------------------------------------------

// Convert a dwarf-planet record's osculating elements to the conic-propagation format.
export function dwarfConicElements(id) {
  const d = getBodyData(id);
  if (!d || d.bodyClass !== 'dwarf') return null;
  const el = d.elements;
  const aKm = el.aAU * AU_KM;
  return {
    e: el.e,
    aKm,
    qKm: aKm * (1 - el.e),
    iDeg: el.iDeg,
    nodeDeg: el.nodeDeg,
    argPeriDeg: el.argPeriDeg,
    Tp: el.Tp,
    nDegPerSec: el.nDegPerDay / SECONDS_PER_DAY,
  };
}

// Heliocentric position of a dwarf planet in scene coordinates (relative to the Sun's position).
export function getDwarfPositionThreeJS(id, date, sunPosScene) {
  const elements = dwarfConicElements(id);
  if (!elements) return null;
  const res = heliocentricConicThreeJS(elements, date);
  return {
    x: sunPosScene.x + res.rel.x,
    y: sunPosScene.y + res.rel.y,
    z: sunPosScene.z + res.rel.z,
    relSun: res.rel,
    rAu: res.rAu,
  };
}

// Full closed-orbit ring for a dwarf planet, in scene coordinates. Dwarf elements are always
// bound (e < 1), so the uniform-in-eccentric-anomaly ring sampler is used directly — the old
// `sampleConicTrajectory(elements, 0, steps)` call passed a zero radius bound and returned an
// empty array, so every dwarf orbit line rendered with no geometry at all.
export function getDwarfOrbitPoints(id, sunPosScene, steps = 512) {
  const elements = dwarfConicElements(id);
  if (!elements) return [];
  const auPts = sampleConicRing(elements, steps);
  return auPts.map(([x, y, z]) => {
    const r = helioEclipticToThreeJS(x, y, z);
    return { x: sunPosScene.x + r.x, y: sunPosScene.y + r.y, z: sunPosScene.z + r.z };
  });
}

// ---------------------------------------------------------------------------
// Moons — parent-relative mean orbital elements.
// ---------------------------------------------------------------------------

// Solve a moon's true position in its Laplace/equatorial plane for a given date, returned
// as an offset (in scene units, Earth radius = 1) where +Y is the reference-plane normal.
function moonPlaneOffset(moonId, date) {
  const m = getBodyData(moonId);
  if (!m || m.bodyClass !== 'moon') return null;
  const el = m.elements;
  const jd = toJulianDate(date);
  const M = (el.M0Deg + el.nDegPerDay * (jd - el.epochJD)) * DEG2RAD;
  const e = el.e;
  const E = solveEllipticKepler(M, e);
  const aKm = el.aKm;
  const xPrime = aKm * (Math.cos(E) - e);
  const yPrime = aKm * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
  const basis = perifocalBasis(el.iDeg, el.nodeDeg, el.argPeriDeg);

  // Orbital plane → ecliptic (km), then km → AU → scene units via the shared converter.
  const xEcl = (xPrime * basis.Px + yPrime * basis.Qx) / AU_KM;
  const yEcl = (xPrime * basis.Py + yPrime * basis.Qy) / AU_KM;
  const zEcl = (xPrime * basis.Pz + yPrime * basis.Qz) / AU_KM;
  const rel = helioEclipticToThreeJS(xEcl, yEcl, zEcl);
  return { offset: rel, rAu: Math.hypot(xEcl, yEcl, zEcl) };
}

// Offset of a moon from its parent's centre, in scene units, at the given date.
export function getMoonOffsetThreeJS(moonId, date) {
  const res = moonPlaneOffset(moonId, date);
  return res ? res.offset : null;
}

// Mean-anomaly angle (radians) of a moon, used to tidally lock its spin to the orbit.
export function getMoonMeanAnomaly(moonId, date) {
  const m = getBodyData(moonId);
  if (!m || m.bodyClass !== 'moon') return 0;
  const el = m.elements;
  const jd = toJulianDate(date);
  return (el.M0Deg + el.nDegPerDay * (jd - el.epochJD)) * DEG2RAD;
}

// True when a moon's sidereal spin period equals its orbital period (within 1%), i.e. it is
// tidally locked and its face must stay toward the parent. Hi'iaka, Namaka and Hyperion are
// deliberately not locked. A body with no published spin period returns false.
export function isSynchronousMoon(moonId) {
  const m = getBodyData(moonId);
  if (!m || m.bodyClass !== 'moon' || !m.elements) return false;
  const period = m.rotPeriodHours;
  if (!period) return false;
  const expected = m.elements.periodDays * 24;
  return Math.abs(period - expected) / Math.abs(expected) <= 0.01;
}

// Parent-relative orbit ring for a moon, in scene units (in the reference plane).
export function getMoonOrbitPoints(moonId, steps = 160) {
  const m = getBodyData(moonId);
  if (!m || m.bodyClass !== 'moon') return [];
  const el = m.elements;
  const e = el.e;
  const aKm = el.aKm;
  const b = aKm * Math.sqrt(Math.max(0, 1 - e * e));
  const basis = perifocalBasis(el.iDeg, el.nodeDeg, el.argPeriDeg);

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const E = (i / steps) * 2 * Math.PI;
    const xPrime = aKm * (Math.cos(E) - e);
    const yPrime = b * Math.sin(E);
    const xEcl = (xPrime * basis.Px + yPrime * basis.Qx) / AU_KM;
    const yEcl = (xPrime * basis.Py + yPrime * basis.Qy) / AU_KM;
    const zEcl = (xPrime * basis.Pz + yPrime * basis.Qz) / AU_KM;
    const r = helioEclipticToThreeJS(xEcl, yEcl, zEcl);
    points.push({ x: r.x, y: r.y, z: r.z });
  }
  return points;
}
