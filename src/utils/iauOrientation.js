// IAU rotational elements — the real, time-dependent orientation of each body's spin axis and
// prime meridian.
//
// Every body used to be oriented by a single constant `axialTiltDeg` rotation about the scene Z
// axis, which made every pole lean the same way and pinned the prime meridian to an arbitrary
// phase. This module replaces that with the published IAU model.
//
// Source (authoritative): IAU Working Group on Cartographic Coordinates and Rotational Elements,
// "Report ... 2015" (Archinal et al. 2018, Cel. Mech. Dyn. Astron. 130:22), as distributed in the
// NAIF SPICE text kernel `pck00011.tpc` (NASA/JPL). The three Euler angles for a body are:
//
//   alpha = ra0  + raRate  * T      (RA  of the north pole, deg, ICRF, at J2000 TDB)
//   delta = dec0 + decRate * T      (Dec of the north pole, deg, ICRF, at J2000 TDB)
//   W     = w0   + w1      * d      (prime meridian angle, deg)
//
// with T = centuries and d = days since J2000 TDB. The body-fixed -> ICRF rotation is
//
//   r_ICRF = R3(90 + alpha) . R1(90 - delta) . R3(W) . r_body
//
// using right-handed active rotations R1/R3. Verified against the two exact anchors: the derived
// pole (cos d cos a, cos d sin a, sin d) and Earth's prime meridian at J2000.
//
// FRAME: the app's scene frame is the ICRF permuted by eciToThreeJS, i.e. scene = (x, z, -y). The
// pole/spin quaternions returned here are already expressed in that scene frame, so they orient a
// Three.js object directly. A body nested inside a rotated parent (a moon inside the parent-equator
// pivot) receives the same rotation on its position, so assigning the raw pole there keeps the
// body's geometry relative to its parent unchanged.
//
// SHAPE FRAME: every body is drawn from one shared unit sphere whose local +Y is the polar (spin)
// axis and local +X is the a-axis (see bodyShape.js). The IAU body frame has +Z as the pole and
// +X as the prime meridian, so the constant change-of-basis M below maps sphere-local -> IAU body.
//
// HAUMEA: the IAU model set does not tabulate Haumea (it is not a regular planetary satellite nor
// a "major" body in the report). Its pole is instead taken from the direct determination of
// Kondratyev & Kornoukhov (2018), who fit the light curve + occultation: alpha = 282.6 deg,
// delta = -13.0 deg (their first solution, which is the one whose obliquity to the ecliptic is
// 81.2 deg — the value this app already carries as `axialTiltDeg`). The sidereal spin rate comes
// from the observed rotation period 3.915341 h (Wikipedia infobox, which cites the same paper).
// Haumea's secular pole drift is not published, so raRate/decRate are zero; and NO published
// origin for its prime meridian exists, so w0 is an arbitrary epoch reference (the *pole* is
// exact, the *azimuth of the long axis within the equatorial plane* is a reference choice).
//
// LIMITATION (explicit, bounded): the IAU models also carry small periodic "nutation precession"
// terms. Those are NOT implemented here — only the secular polynomial is. The omitted amplitude is
// recorded per body in `nutationMaxDeg` so the gap is visible and testable. For the planets the
// omission is tiny (<= 1.6 deg, Mars); for a few tidally locked satellites it is larger (Triton
// ~32 deg, Mimas' prime meridian ~45 deg) because those terms keep the moon's face on its parent
// as the parent's pole precesses.

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const J2000 = 2451545.0;

// Secular IAU rotational elements. Angles in degrees, rates per Julian century (pole) and per day
// (prime meridian), all at J2000 TDB. `nutationMaxDeg` = largest omitted periodic amplitude.
export const IAU_SPIN = {
  // --- Planets (and Pluto) -------------------------------------------------
  mercury: { ra: 281.0103, dec: 61.4155, raRate: -0.0328, decRate: -0.0049, w0: 329.5988, w1: 6.1385108, nutationMaxDeg: 0.011 },
  venus:   { ra: 272.76, dec: 67.16, w0: 160.20, w1: -1.4813688, nutationMaxDeg: 0 },
  earth:   { ra: 0.0, dec: 90.0, raRate: -0.641, decRate: -0.557, w0: 190.147, w1: 360.9856235, nutationMaxDeg: 0 },
  mars:    { ra: 317.269202, dec: 54.432516, raRate: -0.10927547, decRate: -0.05827105, w0: 176.049863, w1: 350.891982443297, nutationMaxDeg: 1.591 },
  jupiter: { ra: 268.056595, dec: 64.495303, raRate: -0.006499, decRate: 0.002413, w0: 284.95, w1: 870.536, nutationMaxDeg: 0.002 },
  saturn:  { ra: 40.589, dec: 83.537, raRate: -0.036, decRate: -0.004, w0: 38.90, w1: 810.7939024, nutationMaxDeg: 0 },
  uranus:  { ra: 257.311, dec: -15.175, w0: 203.81, w1: -501.1600928, nutationMaxDeg: 0 },
  neptune: { ra: 299.36, dec: 43.46, w0: 249.978, w1: 541.1397757, nutationMaxDeg: 0.70 },
  pluto:   { ra: 132.993, dec: -6.163, w0: 302.695, w1: 56.3625225, nutationMaxDeg: 0 },

  // --- Dwarf planets -------------------------------------------------------
  ceres:   { ra: 291.418, dec: 66.764, w0: 170.650, w1: 952.1532, nutationMaxDeg: 0 },
  // Kondratyev & Kornoukhov (2018) pole; w0 arbitrary (no published prime-meridian origin).
  haumea:  { ra: 282.6, dec: -13.0, raRate: 0, decRate: 0, w0: 0, w1: 2206.704, nutationMaxDeg: 0, phaseArbitrary: true },

  // --- Satellites of Mars --------------------------------------------------
  phobos:  { ra: 317.67071657, dec: 52.88627266, raRate: -0.10844326, decRate: -0.06134706, w0: 35.18774440, w1: 1128.84475928, nutationMaxDeg: 1.784 },
  deimos:  { ra: 316.65705808, dec: 53.50992033, raRate: -0.10518014, decRate: -0.05979094, w0: 79.39932954, w1: 285.16188899, nutationMaxDeg: 3.092 },

  // --- Satellites of Jupiter ----------------------------------------------
  io:       { ra: 268.05, dec: 64.50, raRate: -0.009, decRate: 0.003, w0: 200.39, w1: 203.4889538, nutationMaxDeg: 0.094 },
  europa:   { ra: 268.08, dec: 64.51, raRate: -0.009, decRate: 0.003, w0: 36.022, w1: 101.3747235, nutationMaxDeg: 1.086 },
  ganymede: { ra: 268.20, dec: 64.57, raRate: -0.009, decRate: 0.003, w0: 44.064, w1: 50.3176081, nutationMaxDeg: 0.431 },
  callisto: { ra: 268.72, dec: 64.83, raRate: -0.009, decRate: 0.003, w0: 259.51, w1: 21.5710715, nutationMaxDeg: 0.590 },
  amalthea: { ra: 268.05, dec: 64.49, raRate: -0.009, decRate: 0.003, w0: 231.67, w1: 722.6314560, nutationMaxDeg: 0.84 },
  thebe:    { ra: 268.05, dec: 64.49, raRate: -0.009, decRate: 0.003, w0: 8.56, w1: 533.7004100, nutationMaxDeg: 2.11 },
  adrastea: { ra: 268.05, dec: 64.49, raRate: -0.009, decRate: 0.003, w0: 33.29, w1: 1206.9986602, nutationMaxDeg: 0 },
  metis:    { ra: 268.05, dec: 64.49, raRate: -0.009, decRate: 0.003, w0: 346.09, w1: 1221.2547301, nutationMaxDeg: 0 },

  // --- Satellites of Saturn -----------------------------------------------
  mimas:      { ra: 40.66, dec: 83.52, raRate: -0.036, decRate: -0.004, w0: 333.46, w1: 381.9945550, nutationMaxDeg: 44.85 },
  enceladus:  { ra: 40.66, dec: 83.52, raRate: -0.036, decRate: -0.004, w0: 6.32, w1: 262.7318996, nutationMaxDeg: 0 },
  tethys:     { ra: 40.66, dec: 83.52, raRate: -0.036, decRate: -0.004, w0: 8.95, w1: 190.6979085, nutationMaxDeg: 9.66 },
  dione:      { ra: 40.66, dec: 83.52, raRate: -0.036, decRate: -0.004, w0: 357.6, w1: 131.5349316, nutationMaxDeg: 0 },
  rhea:       { ra: 40.38, dec: 83.55, raRate: -0.036, decRate: -0.004, w0: 235.16, w1: 79.6900478, nutationMaxDeg: 3.10 },
  titan:      { ra: 39.4827, dec: 83.4279, w0: 186.5855, w1: 22.5769768, nutationMaxDeg: 0 },
  iapetus:    { ra: 318.16, dec: 75.03, raRate: -3.949, decRate: -1.143, w0: 355.2, w1: 4.5379572, nutationMaxDeg: 0 },
  pan:        { ra: 40.6, dec: 83.5, raRate: -0.036, decRate: -0.004, w0: 48.8, w1: 626.0440000, nutationMaxDeg: 0 },
  atlas:      { ra: 40.58, dec: 83.53, raRate: -0.036, decRate: -0.004, w0: 137.88, w1: 598.3060000, nutationMaxDeg: 0 },
  prometheus: { ra: 40.58, dec: 83.53, raRate: -0.036, decRate: -0.004, w0: 296.14, w1: 587.289000, nutationMaxDeg: 0 },
  pandora:    { ra: 40.58, dec: 83.53, raRate: -0.036, decRate: -0.004, w0: 162.92, w1: 572.7891000, nutationMaxDeg: 0 },
  janus:      { ra: 40.58, dec: 83.52, raRate: -0.036, decRate: -0.004, w0: 58.83, w1: 518.2359876, nutationMaxDeg: 1.623 },
  epimetheus: { ra: 40.58, dec: 83.52, raRate: -0.036, decRate: -0.004, w0: 293.87, w1: 518.4907239, nutationMaxDeg: 3.153 },
  helene:     { ra: 40.85, dec: 83.34, raRate: -0.036, decRate: -0.004, w0: 245.12, w1: 131.6174056, nutationMaxDeg: 0 },

  // --- Satellites of Uranus ------------------------------------------------
  puck:     { ra: 257.31, dec: -15.18, w0: 91.24, w1: -472.5450690, nutationMaxDeg: 0.33 },
  miranda:  { ra: 257.43, dec: -15.08, w0: 30.70, w1: -254.6906892, nutationMaxDeg: 4.41 },
  ariel:    { ra: 257.43, dec: -15.10, w0: 156.22, w1: -142.8356681, nutationMaxDeg: 0.29 },
  umbriel:  { ra: 257.43, dec: -15.10, w0: 108.05, w1: -86.8688923, nutationMaxDeg: 0.21 },
  titania:  { ra: 257.43, dec: -15.10, w0: 77.74, w1: -41.3514316, nutationMaxDeg: 0.29 },
  oberon:   { ra: 257.43, dec: -15.10, w0: 6.77, w1: -26.7394932, nutationMaxDeg: 0.16 },

  // --- Satellites of Neptune ----------------------------------------------
  naiad:    { ra: 299.36, dec: 43.36, w0: 254.06, w1: 1222.8441209, nutationMaxDeg: 6.49 },
  thalassa: { ra: 299.36, dec: 43.45, w0: 102.06, w1: 1155.7555612, nutationMaxDeg: 0.28 },
  despina:  { ra: 299.36, dec: 43.45, w0: 306.51, w1: 1075.7341562, nutationMaxDeg: 0.09 },
  galatea:  { ra: 299.36, dec: 43.43, w0: 258.09, w1: 839.6597686, nutationMaxDeg: 0.07 },
  larissa:  { ra: 299.36, dec: 43.41, w0: 179.41, w1: 649.0534470, nutationMaxDeg: 0.27 },
  proteus:  { ra: 299.27, dec: 42.91, w0: 93.38, w1: 320.7654228, nutationMaxDeg: 0.05 },
  triton:   { ra: 299.36, dec: 41.17, w0: 296.53, w1: -61.2572637, nutationMaxDeg: 32.35 },

  // --- Satellites of Pluto -------------------------------------------------
  charon:   { ra: 132.993, dec: -6.163, w0: 122.695, w1: 56.3625225, nutationMaxDeg: 0 },
};

// True when this body has published IAU rotational elements.
export function hasIauSpin(id) {
  return Boolean(IAU_SPIN[id]);
}

// --- 3x3 matrices (row-major, 9 numbers) -----------------------------------

function mul3(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

// Right-handed active rotation about X (IAU convention).
function rot1(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

// Right-handed active rotation about Z (IAU convention).
function rot3(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

// ICRF -> scene frame permutation, matching eciToThreeJS (x, z, -y).
const P_ICRF_TO_SCENE = [1, 0, 0, 0, 0, 1, 0, -1, 0];

// Shared unit-sphere frame -> IAU body frame: sphere +Y -> body +Z (pole), sphere +X -> body +X
// (prime meridian); right-handed, det = +1.
const M_SPHERE_TO_BODY = [1, 0, 0, 0, 0, -1, 0, 1, 0];

function quatFromMat3(m) {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const trace = m00 + m11 + m22;
  let x, y, z, w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return [x, y, z, w];
}

function poleAngles(id, jd) {
  const s = IAU_SPIN[id];
  if (!s) return null;
  const d = jd - J2000;
  const T = d / 36525.0;
  return {
    alpha: (s.ra + (s.raRate || 0) * T) * DEG,
    delta: (s.dec + (s.decRate || 0) * T) * DEG,
    w: (s.w0 + s.w1 * d) * DEG,
  };
}

// North-pole unit vector in the ICRF (= (cos d cos a, cos d sin a, sin d)).
export function iauPoleIcrf(id, jd) {
  const a = poleAngles(id, jd);
  if (!a) return null;
  const cd = Math.cos(a.delta);
  return [cd * Math.cos(a.alpha), cd * Math.sin(a.alpha), Math.sin(a.delta)];
}

// Body-fixed -> ICRF matrix A = R3(90 + alpha) . R1(90 - delta) . R3(W).
function bodyToIcrf(id, jd, includeSpin) {
  const a = poleAngles(id, jd);
  if (!a) return null;
  let A = mul3(rot3(Math.PI / 2 + a.alpha), rot1(Math.PI / 2 - a.delta));
  if (includeSpin) A = mul3(A, rot3(a.w));
  return A;
}

// Full body orientation (pole + spin) as a quaternion [x, y, z, w] in the scene frame, mapping the
// shared unit-sphere local frame to the scene. Null when the body has no IAU elements.
export function iauOrientationQuaternion(id, jd) {
  const A = bodyToIcrf(id, jd, true);
  if (!A) return null;
  return quatFromMat3(mul3(P_ICRF_TO_SCENE, mul3(A, M_SPHERE_TO_BODY)));
}

// Pole-only orientation (spin excluded) as a scene-frame quaternion. Used for the tilt pivot that
// carries the body mesh, its rings and its atmosphere shell, with the daily spin applied locally.
export function iauPoleQuaternion(id, jd) {
  const A = bodyToIcrf(id, jd, false);
  if (!A) return null;
  return quatFromMat3(mul3(P_ICRF_TO_SCENE, mul3(A, M_SPHERE_TO_BODY)));
}

// Prime-meridian angle W(t) in radians, reduced to [0, 2pi). Null when the body has no IAU elements.
export function iauSpinAngleRad(id, jd) {
  const a = poleAngles(id, jd);
  if (!a) return null;
  return ((a.w % TWO_PI) + TWO_PI) % TWO_PI;
}

// Quaternion [x, y, z, w] for a rotation of `angle` about the scene +Z axis (the legacy fixed-tilt
// fallback, identical to the old `rotation.order = 'ZYX'; rotation.z = angle`).
export function quatFromAxisZ(angle) {
  const h = angle * 0.5;
  return [0, 0, Math.sin(h), Math.cos(h)];
}
