// Heliocentric conic-section propagation from osculating orbital elements.
//
// Supports both bound (elliptical, a > 0) and unbound (hyperbolic, a < 0) orbits,
// which is what the interstellar probes (Voyager, Pioneer, New Horizons) are on.
// The elements are geometric osculating elements referred to the J2000 ecliptic,
// exactly as returned by NASA/JPL Horizons
// (EPHEM_TYPE=ELEMENTS, reference frame "Ecliptic of J2000.0", center Sun (10)).
//
// Kept free of any `three` import so the math can be unit-tested in Node.

import { AU_KM } from './planetaryData.js';
import { helioEclipticToThreeJS } from './ephemeris.js';
import { solveKeplerElliptic } from './keplerEquation.js';

const DEG2RAD = Math.PI / 180;
const SECONDS_PER_DAY = 86400;

// Elliptical Kepler equation M = E - e sin(E). Delegates to the shared, divergence-free
// solver (see keplerEquation.js) — the previous hand-rolled "seed E0 = pi for e >= 0.8"
// Newton iteration diverged near M ~ ±pi and made the high-e orbiters jump on screen.
export function solveEllipticKepler(M, e) {
  return solveKeplerElliptic(M, e);
}

// Hyperbolic Kepler equation M = e sinh(H) - H. Monotonic in H, so plain Newton
// converges fast; the seed is chosen to stay well-behaved near periapsis (H ~ 0).
export function solveHyperbolicKepler(M, e) {
  if (!Number.isFinite(M) || !(e > 1)) return 0;
  const absM = Math.abs(M);
  let H = absM < e ? M / (e - 1) : Math.asinh(M / e);
  for (let i = 0; i < 80; i++) {
    const f = e * Math.sinh(H) - H - M;
    const fp = e * Math.cosh(H) - 1;
    const d = f / fp;
    H -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return H;
}

// Heliocentric ecliptic position (AU) and distance (AU/km) for an osculating conic.
//
// `elements`:
//   e            – eccentricity
//   aKm          – semi-major axis in km (negative for hyperbolic)
//   qKm          – periapsis distance in km (= a (1 - e) with a's sign convention)
//   iDeg         – inclination (deg)
//   nodeDeg      – longitude of ascending node (deg)
//   argPeriDeg   – argument of periapsis (deg)
//   Tp           – Julian Date of periapsis passage
//   nDegPerSec   – mean motion in deg/sec (Horizons convention: sqrt(mu/|a|^3))
export function heliocentricConicEcliptic(elements, jd) {
  const { e, aKm, qKm, iDeg, nodeDeg, argPeriDeg, Tp, nDegPerSec } = elements;

  // Mean anomaly advanced from periapsis passage (radians).
  const M = nDegPerSec * (jd - Tp) * SECONDS_PER_DAY * DEG2RAD;

  let xPrime;
  let yPrime;

  if (e < 1) {
    const a = aKm > 0 ? aKm : qKm / (1 - e);
    const E = solveEllipticKepler(M, e);
    xPrime = a * (Math.cos(E) - e);
    yPrime = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
  } else {
    // Hyperbolic branch (a < 0). r = a (1 - e cosh H) > 0 because a < 0 here.
    const a = aKm < 0 ? aKm : -qKm / (e - 1);
    const H = solveHyperbolicKepler(M, e);
    xPrime = a * (Math.cosh(H) - e);
    yPrime = -a * Math.sqrt(e * e - 1) * Math.sinh(H);
  }

  const inc = iDeg * DEG2RAD;
  const node = nodeDeg * DEG2RAD;
  const argPeri = argPeriDeg * DEG2RAD;

  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosInc = Math.cos(inc);
  const sinInc = Math.sin(inc);
  const cosW = Math.cos(argPeri);
  const sinW = Math.sin(argPeri);

  // Perifocal -> ecliptic rotation (P/Q frame), same convention as ephemeris.js.
  const Px = cosW * cosNode - sinW * sinNode * cosInc;
  const Py = cosW * sinNode + sinW * cosNode * cosInc;
  const Pz = sinW * sinInc;

  const Qx = -sinW * cosNode - cosW * sinNode * cosInc;
  const Qy = -sinW * sinNode + cosW * cosNode * cosInc;
  const Qz = cosW * sinInc;

  const xEclKm = xPrime * Px + yPrime * Qx;
  const yEclKm = xPrime * Py + yPrime * Qy;
  const zEclKm = xPrime * Pz + yPrime * Qz;

  // Convert to AU so the result can be fed straight into helioEclipticToThreeJS
  // (which expects AU, matching ephemeris.js).
  const xEcl = xEclKm / AU_KM;
  const yEcl = yEclKm / AU_KM;
  const zEcl = zEclKm / AU_KM;

  const rAu = Math.sqrt(xEcl * xEcl + yEcl * yEcl + zEcl * zEcl);

  return { xEcl, yEcl, zEcl, rAu, rKm: rAu * AU_KM };
}

// Heliocentric ecliptic position converted to scene units (relative to the Sun).
export function heliocentricConicThreeJS(elements, date) {
  const jd = date instanceof Date ? date.getTime() / 86400000 + 2440587.5 : date;
  const ecl = heliocentricConicEcliptic(elements, jd);
  const rel = helioEclipticToThreeJS(ecl.xEcl, ecl.yEcl, ecl.zEcl);
  return { ...ecl, rel };
}

// Sampled outbound trajectory for drawing the escape path of an unbound probe.
//
// A hyperbola never closes, so instead of a full conic we trace from periapsis
// outward until the radius exceeds `maxRadiusAu`, capped at `maxPoints` samples.
export function sampleConicTrajectory(elements, maxRadiusAu = 320, maxPoints = 480, outboundOnly = false) {
  const points = [];
  if (!(maxRadiusAu > 0)) return points;

  // Sample in true-anomaly-like parameter space (eccentric/hyperbolic anomaly).
  const upper = elements.e < 1 ? Math.PI : Math.acosh(Math.max(1.0, 1 + maxRadiusAu / Math.max(1e-9, elementsDistanceScale(elements))));
  if (!Number.isFinite(upper)) return points;

  const steps = Math.max(16, Math.min(maxPoints, Math.round(upper * 24)));
  // An escaping probe only travels the outbound branch (from periapsis outward), so
  // when asked we trace just that half instead of the mirror-image inbound branch.
  const hStart = outboundOnly && elements.e >= 1 ? 0 : -upper;
  const hSpan = outboundOnly && elements.e >= 1 ? upper : 2 * upper;
  for (let i = 0; i <= steps; i++) {
    const H = hStart + hSpan * (i / steps);

    // Reuse the conic math by synthesising a JD that yields anomaly H.
    // For a hyperbola M = e sinh H - H; for an ellipse we mirror via E directly.
    let xPrime;
    let yPrime;
    if (elements.e < 1) {
      const a = elements.aKm > 0 ? elements.aKm : elements.qKm / (1 - elements.e);
      xPrime = a * (Math.cos(H) - elements.e);
      yPrime = a * Math.sqrt(Math.max(0, 1 - elements.e * elements.e)) * Math.sin(H);
    } else {
      const a = elements.aKm < 0 ? elements.aKm : -elements.qKm / (elements.e - 1);
      xPrime = a * (Math.cosh(H) - elements.e);
      yPrime = -a * Math.sqrt(elements.e * elements.e - 1) * Math.sinh(H);
    }

    const inc = elements.iDeg * DEG2RAD;
    const node = elements.nodeDeg * DEG2RAD;
    const argPeri = elements.argPeriDeg * DEG2RAD;
    const cosNode = Math.cos(node), sinNode = Math.sin(node);
    const cosInc = Math.cos(inc), sinInc = Math.sin(inc);
    const cosW = Math.cos(argPeri), sinW = Math.sin(argPeri);

    const Px = cosW * cosNode - sinW * sinNode * cosInc;
    const Py = cosW * sinNode + sinW * cosNode * cosInc;
    const Pz = sinW * sinInc;
    const Qx = -sinW * cosNode - cosW * sinNode * cosInc;
    const Qy = -sinW * sinNode + cosW * cosNode * cosInc;
    const Qz = cosW * sinInc;

    points.push([
      (xPrime * Px + yPrime * Qx) / AU_KM,
      (xPrime * Py + yPrime * Qy) / AU_KM,
      (xPrime * Pz + yPrime * Qz) / AU_KM,
    ]);
  }
  return points;
}

// Characteristic distance used to bound the sampled arc (|a| for hyperbolic).
function elementsDistanceScale(elements) {
  return Math.abs(elements.aKm || elements.qKm || AU_KM);
}
