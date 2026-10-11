export const EARTH_RADIUS_KM = 6371;

// Julian Date from JS Date
export function toJulianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// Greenwich Mean Sidereal Time in radians
export function getGMST(date) {
  const jd = toJulianDate(date);
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + T * T * 0.000387933
    - T * T * T / 38710000.0;
  return ((gmst % 360) + 360) % 360 * (Math.PI / 180);
}

// Sun position as unit vector in ECI coordinates
// Based on low-precision solar coordinates (Astronomical Algorithms, Ch.25)
export function getSunPositionECI(date) {
  const jd = toJulianDate(date);
  const n  = jd - 2451545.0;
  const L  = (280.460 + 0.9856474 * n) % 360;
  const g  = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180);
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * (Math.PI / 180);
  const epsilon = 23.439 * (Math.PI / 180);
  return {
    x: Math.cos(lambda),
    y: Math.cos(epsilon) * Math.sin(lambda),
    z: Math.sin(epsilon) * Math.sin(lambda),
  };
}

// ECI km → Three.js units (Earth radius = 1.0 unit)
// ECI: X=vernal equinox, Y=90° east in equatorial plane, Z=north pole
// Three.js: Y=up (north pole), X=right, Z=toward viewer
export function eciToThreeJS(x, y, z) {
  return {
    x: x / EARTH_RADIUS_KM,
    y: z / EARTH_RADIUS_KM,
    z: y / EARTH_RADIUS_KM,
  };
}

// Orbital period in minutes from mean motion (rev/day)
export function orbitalPeriod(meanMotion) {
  return 1440 / meanMotion;
}

// Parse a TLE epoch field (YYDDD.DDDDDDDD, columns 19-32 of line 1) into a UTC Date.
// Two-digit year convention (NORAD/Space-Track): 57-99 -> 1957-1999, 00-56 -> 2000-2056.
// Day-of-year is fractional, where day 1.0 is 00:00 UTC on 1 January.
export function tleEpochToDate(epoch) {
  const s = String(epoch).trim();
  const yy = parseInt(s.slice(0, 2), 10);
  const doy = parseFloat(s.slice(2));
  if (!Number.isFinite(yy) || !Number.isFinite(doy)) {
    throw new Error(`Invalid TLE epoch: "${epoch}"`);
  }
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86400000);
}

// WGS-84 reference ellipsoid constants (standard IERS/NGA values)
export const WGS84_A = 6378.137;          // Semi-major axis in km
export const WGS84_F = 1.0 / 298.257223563; // Flattening
export const WGS84_B = WGS84_A * (1.0 - WGS84_F); // Semi-minor axis (~6356.7523 km)
export const WGS84_E2 = 2.0 * WGS84_F - WGS84_F * WGS84_F; // First eccentricity squared (~0.00669437999)

// Moon physical constants (IAU / NASA Planetary Fact Sheet)
export const MOON_RADIUS_KM = 1737.4; // Volumetric mean radius
export const MOON_RADIUS_UNITS = MOON_RADIUS_KM / EARTH_RADIUS_KM; // ~0.27270
export const MOON_SEMI_MAJOR_AXIS_KM = 384400; // Mean distance to Earth (~60.33 Earth radii)

// Sun physical & observational constants (NASA Goddard Space Flight Center Sun Fact Sheet)
// Dr. David R. Williams (NASA GSFC) / IAU Resolution B3
export const SUN_RADIUS_KM = 695700.0;              // Volumetric mean radius: 695,700 km (109.2 x Earth)
export const AU_KM = 149597870.7;                   // Mean distance: 149.6 x 10^6 km (1.0 AU)
export const SUN_RADIUS_UNITS = SUN_RADIUS_KM / EARTH_RADIUS_KM; // 109.19793 Earth radii (ratio 109.2)
export const AU_UNITS = AU_KM / EARTH_RADIUS_KM;                 // 23,481.066 Earth radii
export const SUN_TRUE_ANGULAR_DIAMETER_DEG = 2 * Math.atan(SUN_RADIUS_KM / AU_KM) * (180 / Math.PI); // 0.53298 deg (1919 arcseconds at 1 AU)
export const SUN_ANGULAR_DIAMETER_ARCSEC = 1919.0;

// Moon geocentric position in ECI coordinates (km and unit vector)
// High-precision truncated analytical theory based on Jean Meeus (Astronomical Algorithms, Ch. 47)
export function getMoonPositionECI(date) {
  const jd = toJulianDate(date);
  const T  = (jd - 2451545.0) / 36525.0;
  const deg = Math.PI / 180;

  // Fundamental arguments of the Moon (in radians)
  const Lprime = ((218.3164477 + 481267.88123421 * T - 0.0015786 * T * T) % 360) * deg;
  const D      = ((297.8501921 + 445267.11140340 * T - 0.0018819 * T * T) % 360) * deg;
  const M      = ((357.5291092 + 35999.05029090 * T - 0.0001536 * T * T) % 360) * deg;
  const Mprime = ((134.9633964 + 477198.86750550 * T + 0.0087414 * T * T) % 360) * deg;
  const F      = ((93.2720950 + 483202.01752330 * T - 0.0036539 * T * T) % 360) * deg;

  // Major periodic perturbations in ecliptic longitude (degrees)
  const deltaL = 6.288774 * Math.sin(Mprime)
    + 1.274027 * Math.sin(2 * D - Mprime)
    + 0.658314 * Math.sin(2 * D)
    + 0.213618 * Math.sin(2 * Mprime)
    - 0.185116 * Math.sin(M)
    - 0.114332 * Math.sin(2 * F)
    + 0.058793 * Math.sin(2 * D - 2 * Mprime)
    + 0.057066 * Math.sin(2 * D - M - Mprime);

  // Periodic perturbations in ecliptic latitude (degrees)
  const deltaB = 5.128154 * Math.sin(F)
    + 0.280602 * Math.sin(Mprime + F)
    + 0.277693 * Math.sin(Mprime - F)
    + 0.173237 * Math.sin(2 * D - F)
    + 0.055413 * Math.sin(2 * D + F - Mprime);

  // Periodic perturbations in Earth-Moon distance (km)
  const deltaR = - 20905.355 * Math.cos(Mprime)
    - 3699.111 * Math.cos(2 * D - Mprime)
    - 2955.968 * Math.cos(2 * D)
    - 569.925 * Math.cos(2 * Mprime)
    + 246.158 * Math.cos(2 * D - M - Mprime)
    - 152.138 * Math.cos(2 * D - M);

  const lRad = (Lprime / deg + deltaL) * deg;
  const bRad = deltaB * deg;
  const distKm = 385000.56 + deltaR;

  // True obliquity of the ecliptic
  const eps = (23.439291 - 0.0130042 * T) * deg;

  const cosB = Math.cos(bRad);
  const sinB = Math.sin(bRad);
  const cosL = Math.cos(lRad);
  const sinL = Math.sin(lRad);
  const cosE = Math.cos(eps);
  const sinE = Math.sin(eps);

  // ECI equatorial Cartesian coordinates (km)
  const xKm = distKm * (cosB * cosL);
  const yKm = distKm * (cosB * sinL * cosE - sinB * sinE);
  const zKm = distKm * (cosB * sinL * sinE + sinB * cosE);

  // Convert ECI (x, y, z) to Three.js coordinates (x, z, y) in Earth radius units (1 unit = 6371 km)
  const threePos = eciToThreeJS(xKm, yKm, zKm);

  return {
    xKm,
    yKm,
    zKm,
    distKm,
    three: threePos,
    radiusUnits: MOON_RADIUS_UNITS,
  };
}

// Altitude km from ECI position km relative to mean Earth radius
export function eciToAltitudeKm(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z) - EARTH_RADIUS_KM;
}

// Rigorous WGS-84 geodetic latitude, longitude, and height above reference ellipsoid (Bowring's algorithm)
export function eciToGeodetic(x, y, z, gmst) {
  // Greenwich sidereal angle subtraction for ECEF longitude
  const lonRad = Math.atan2(y, x) - gmst;
  const p = Math.hypot(x, y); // Distance from Z-axis (equatorial plane projection)

  // Equatorial singularity check
  if (p < 1e-6) {
    const lat = z >= 0 ? 90.0 : -90.0;
    const alt = Math.abs(z) - WGS84_B;
    return {
      lat,
      lon: ((lonRad * (180 / Math.PI)) % 360 + 540) % 360 - 180,
      alt,
    };
  }

  // Bowring's closed-form method with sub-millimeter precision
  const ePrime2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
  const theta = Math.atan2(z * WGS84_A, p * WGS84_B);
  const sin3Theta = Math.sin(theta) ** 3;
  const cos3Theta = Math.cos(theta) ** 3;

  const latRad = Math.atan2(
    z + ePrime2 * WGS84_B * sin3Theta,
    p - WGS84_E2 * WGS84_A * cos3Theta
  );

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  // Radius of curvature in the prime vertical
  const N = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinLat * sinLat);
  const altKm = (p / cosLat) - N;

  return {
    lat: latRad * (180 / Math.PI),
    lon: ((lonRad * (180 / Math.PI)) % 360 + 540) % 360 - 180,
    alt: altKm,
  };
}

// Orbital velocity from SGP4 velocity state vector (vx, vy, vz) in km/s, or vis-viva fallback
export function orbitalVelocity(pvOrAltKm) {
  if (pvOrAltKm && typeof pvOrAltKm === 'object' && pvOrAltKm.velocity) {
    const { x, y, z } = pvOrAltKm.velocity;
    return Math.hypot(x, y, z);
  }
  const altKm = typeof pvOrAltKm === 'number' ? pvOrAltKm : 400;
  const mu = 398600.4418; // Earth standard gravitational parameter in km^3 / s^2
  const r = EARTH_RADIUS_KM + altKm;
  return Math.sqrt(mu / r);
}

// Detailed orbital regime classification considering eccentricity (conic sections) and altitude
export function orbitRegime(altKm, ecc = 0, perigeeKm = null, apogeeKm = null) {
  if (ecc >= 1.0) {
    return ecc === 1.0 ? 'Parabolic Escape Trajectory (e = 1.0)' : 'Hyperbolic Interplanetary / Escape Trajectory (e > 1.0)';
  }
  const minAlt = perigeeKm ?? altKm;
  const maxAlt = apogeeKm ?? altKm;

  if (minAlt < 100) return 'Suborbital / Atmospheric Re-entry';
  if (ecc > 0.25) {
    if (minAlt < 1000 && maxAlt > 35000) return 'HEO / GTO — Geostationary Transfer Orbit';
    if (maxAlt > 30000) return 'HEO — Highly Elliptical Orbit (Molniya / Tundra)';
    return 'Elliptical Orbit';
  }
  if (maxAlt < 2000) return 'LEO — Low Earth Orbit';
  if (minAlt > 35500 && maxAlt < 36100 && ecc < 0.01) return 'GEO — Geostationary Orbit';
  if (maxAlt < 35000) return 'MEO — Medium Earth Orbit';
  return 'HEO — High Earth Orbit';
}
