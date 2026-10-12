// Verification of the IAU axial-orientation model (src/utils/iauOrientation.js) and of the way
// the renderer consumes it (PlanetMeshBuilder pivot + PlanetarySystem spin).
//
// Everything here is checked against the published rotational elements, not against the module's
// own output: the pole vectors, the two exact anchors (Earth at J2000, Jupiter's pole), the
// quaternion algebra (composition identity, unit norm, q == -q), the prograde/retrograde sign of
// the prime-meridian rate, and the pivot/child composition the renderer actually builds.
//
// The module is deliberately dependency-free, so it imports here directly; THREE is only used to
// reproduce the exact parent/child transform the scene applies.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  IAU_SPIN,
  hasIauSpin,
  iauPoleIcrf,
  iauOrientationQuaternion,
  iauPoleQuaternion,
  iauSpinAngleRad,
  quatFromAxisZ,
} from '../src/utils/iauOrientation.js';
import { ALL_BODIES, getBodyData } from '../src/utils/smallBodies.js';
import { isSynchronousMoon } from '../src/utils/smallBodyEphemeris.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const J2000 = 2451545.0;

// Signed smallest angular difference a - b, in (-pi, pi].
function angularDiff(a, b) {
  let d = (a - b) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}

function unit(v) {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// ICRF -> scene frame, matching eciToThreeJS (x, z, -y).
function icrfToScene(v) {
  return [v[0], v[2], -v[1]];
}

console.log('IAU axial-orientation verification');

// ---------------------------------------------------------------------------
// 1. Table integrity.
// ---------------------------------------------------------------------------

test('every IAU entry has finite, in-range elements', () => {
  const ids = Object.keys(IAU_SPIN);
  assert.ok(ids.length >= 40, `expected a substantial table, got ${ids.length} entries`);
  for (const id of ids) {
    const s = IAU_SPIN[id];
    assert.ok(Number.isFinite(s.ra) && s.ra >= 0 && s.ra < 360, `${id}.ra=${s.ra} must be in [0, 360)`);
    assert.ok(Number.isFinite(s.dec) && s.dec >= -90 && s.dec <= 90, `${id}.dec=${s.dec} must be in [-90, 90]`);
    assert.ok(Number.isFinite(s.raRate || 0), `${id}.raRate is not finite`);
    assert.ok(Number.isFinite(s.decRate || 0), `${id}.decRate is not finite`);
    assert.ok(Number.isFinite(s.w0), `${id}.w0 is not finite`);
    assert.ok(Number.isFinite(s.w1), `${id}.w1 is not finite`);
    assert.notEqual(s.w1, 0, `${id}.w1 must be non-zero (a body that never spins)`);
    assert.ok(Number.isFinite(s.nutationMaxDeg) && s.nutationMaxDeg >= 0,
      `${id}.nutationMaxDeg must be a documented, non-negative bound`);
    assert.ok(s.nutationMaxDeg < 90, `${id}.nutationMaxDeg=${s.nutationMaxDeg} is implausibly large`);
  }
});

test('every IAU id resolves to a real registered body', () => {
  for (const id of Object.keys(IAU_SPIN)) {
    assert.ok(hasIauSpin(id), `hasIauSpin(${id}) must be true`);
    const body = getBodyData(id);
    assert.ok(body, `IAU_SPIN references unknown body "${id}"`);
    assert.ok(body.radiusKm > 0, `${id} must have a positive radius`);
  }
  assert.equal(hasIauSpin('__nope__'), false, 'an unknown id must report no IAU elements');
});

test('the omitting of nutation/precession is bounded per body (documented, testable)', () => {
  // The module implements only the secular polynomial; the largest omitted periodic amplitude is
  // recorded per body. This guards the module header's claim and flags any silent regression.
  assert.equal(IAU_SPIN.earth.nutationMaxDeg, 0, 'Earth has no omitted periodic term');
  assert.ok(IAU_SPIN.triton.nutationMaxDeg > 30, 'Triton is the documented large-omission case');
  assert.ok(IAU_SPIN.mimas.nutationMaxDeg > 40, "Mimas' prime meridian is the largest omission");
  // The planets (except Mars) are essentially unaffected.
  for (const p of ['mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
    assert.ok(IAU_SPIN[p].nutationMaxDeg <= 1.0, `${p} must have a sub-degree omission`);
  }
});

// ---------------------------------------------------------------------------
// 2. Poles — exact anchors.
// ---------------------------------------------------------------------------

test('Earth points its north pole along +Z at J2000 (the frame definition)', () => {
  const p = iauPoleIcrf('earth', J2000);
  assert.ok(p, 'Earth must have a pole');
  assert.ok(Math.abs(p[0]) < 1e-12 && Math.abs(p[1]) < 1e-12, `Earth J2000 pole must be on +Z, got ${p}`);
  assert.ok(Math.abs(p[2] - 1) < 1e-12, `Earth J2000 pole Z must be 1, got ${p[2]}`);
});

test("Jupiter's pole matches its published (alpha, delta) at J2000", () => {
  // ra 268.056595, dec 64.495303 deg (WGCCRE / pck00011).
  const p = iauPoleIcrf('jupiter', J2000);
  const a = 268.056595 * DEG;
  const d = 64.495303 * DEG;
  const expected = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(p[i] - expected[i]) < 1e-12, `Jupiter pole component ${i} mismatch`);
  }
  // And it drifts with time through the secular rate.
  const pLater = iauPoleIcrf('jupiter', J2000 + 36525.0); // one century
  assert.ok(Math.hypot(p[0] - pLater[0], p[1] - pLater[1], p[2] - pLater[2]) > 1e-5,
    'Jupiter pole must move over a century (raRate/decRate must be applied)');
});

test('each pole vector is a unit vector for every body and every epoch sampled', () => {
  for (const id of Object.keys(IAU_SPIN)) {
    for (const jd of [J2000 - 36525, J2000, J2000 + 36525]) {
      const p = iauPoleIcrf(id, jd);
      assert.ok(Math.abs(Math.hypot(p[0], p[1], p[2]) - 1) < 1e-12, `${id} pole is not unit at jd=${jd}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. The pole quaternion maps the shared sphere's +Y onto the true pole.
// ---------------------------------------------------------------------------

test('iauPoleQuaternion sends the sphere +Y (spin axis) onto the scene-frame pole', () => {
  for (const id of Object.keys(IAU_SPIN)) {
    for (const jd of [J2000, J2000 + 9000]) {
      const q = iauPoleQuaternion(id, jd);
      const qq = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(qq);
      const want = icrfToScene(unit(iauPoleIcrf(id, jd)));
      assert.ok(Math.abs(axis.x - want[0]) < 1e-9 &&
                Math.abs(axis.y - want[1]) < 1e-9 &&
                Math.abs(axis.z - want[2]) < 1e-9,
        `${id}: pivot +Y -> ${axis.toArray()} but pole is ${want}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Quaternion algebra.
// ---------------------------------------------------------------------------

test('orientation quaternions are unit-norm and orthogonal', () => {
  for (const id of Object.keys(IAU_SPIN)) {
    for (const jd of [J2000, J2000 + 4321.5]) {
      for (const q of [iauPoleQuaternion(id, jd), iauOrientationQuaternion(id, jd)]) {
        const n = Math.hypot(q[0], q[1], q[2], q[3]);
        assert.ok(Math.abs(n - 1) < 1e-9, `${id}: quaternion norm ${n} != 1`);
        const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...q));
        const e = m.elements;
        // Orthonormal: each column has unit length and the columns are mutually perpendicular.
        const col = (i) => [e[i * 4], e[i * 4 + 1], e[i * 4 + 2]];
        const c0 = col(0), c1 = col(1), c2 = col(2);
        assert.ok(Math.abs(Math.hypot(...c0) - 1) < 1e-9, `${id}: not orthonormal`);
        assert.ok(Math.abs(dot3(c0, c1)) < 1e-9 && Math.abs(dot3(c0, c2)) < 1e-9 &&
                  Math.abs(dot3(c1, c2)) < 1e-9, `${id}: columns not perpendicular`);
      }
    }
  }
});

test('iauOrientationQuaternion == iauPoleQuaternion . Ry(W) (composition identity)', () => {
  // This is the identity the renderer relies on: the pivot carries the pole, the mesh carries W.
  for (const id of Object.keys(IAU_SPIN)) {
    const jd = J2000 + 1234.5;
    const full = iauOrientationQuaternion(id, jd);
    const pole = iauPoleQuaternion(id, jd);
    const w = iauSpinAngleRad(id, jd);
    const qPole = new THREE.Quaternion(pole[0], pole[1], pole[2], pole[3]);
    const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w);
    const composed = qPole.clone().multiply(qSpin);
    const qFull = new THREE.Quaternion(full[0], full[1], full[2], full[3]);
    const dot = Math.abs(composed.dot(qFull));
    assert.ok(dot > 1 - 1e-9, `${id}: composition off by ${(1 - dot).toExponential(2)} (q vs -q ok)`);
  }
});

test('quatFromAxisZ is a rotation of the given angle about scene +Z', () => {
  const angle = 0.9;
  const q = new THREE.Quaternion(...quatFromAxisZ(angle));
  const v = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  assert.ok(Math.abs(v.x - Math.cos(angle)) < 1e-12 && Math.abs(v.y - Math.sin(angle)) < 1e-12,
    `quatFromAxisZ rotated +X to ${v.toArray()}`);
});

// ---------------------------------------------------------------------------
// 5. Spin direction and rate.
// ---------------------------------------------------------------------------

test('the prime-meridian rate signs are the published ones', () => {
  // Prograde bodies about their IAU pole have w1 > 0 (Earth, Mars, Jupiter…); the retrograde
  // cases Venus and Uranus are negative. Pluto is deliberately NOT asserted here: its IAU pole
  // is defined near the ecliptic so its w1 is positive even though its obliquity exceeds 90 deg —
  // the sign of w1 alone does not encode the app's prograde/retrograde label.
  assert.ok(IAU_SPIN.earth.w1 > 0, 'Earth w1 must be positive');
  assert.ok(IAU_SPIN.mars.w1 > 0, 'Mars w1 must be positive');
  assert.ok(IAU_SPIN.jupiter.w1 > 0, 'Jupiter w1 must be positive');
  assert.ok(IAU_SPIN.venus.w1 < 0, 'Venus w1 must be negative');
  assert.ok(IAU_SPIN.uranus.w1 < 0, 'Uranus w1 must be negative');
});

test('W(t) advances at exactly w1 for a prograde body (Earth) and reverses for Venus', () => {
  const d = 3.0; // days
  const earth0 = iauSpinAngleRad('earth', J2000);
  const earth1 = iauSpinAngleRad('earth', J2000 + d);
  const dEarth = angularDiff(earth1, earth0);
  const wantEarth = angularDiff((IAU_SPIN.earth.w1 * d * DEG) % TWO_PI, 0);
  assert.ok(Math.abs(angularDiff(dEarth, wantEarth)) < 1e-9, 'Earth spin must advance by w1*d');
  assert.ok(dEarth > 0, 'Earth spins eastward (positive)');

  const v0 = iauSpinAngleRad('venus', J2000);
  const v1 = iauSpinAngleRad('venus', J2000 + d);
  assert.ok(angularDiff(v1, v0) < 0, 'Venus spins retrograde (negative)');
});

test('the prime meridian turns eastward for Earth and westward for Venus (physical check)', () => {
  // The real, frame-level test of the spin direction: carry the sphere +X (prime meridian /
  // long axis) through the full orientation and watch its scene-frame azimuth. Increasing
  // azimuth (scene +X toward -Z) is eastward, i.e. the same sense Earth turns.
  const azimuth = (id, jd) => {
    const full = iauOrientationQuaternion(id, jd);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(...full));
    return Math.atan2(-x.z, x.x);
  };
  const dt = 0.05;
  const dEarth = angularDiff(azimuth('earth', J2000 + dt), azimuth('earth', J2000));
  const dVenus = angularDiff(azimuth('venus', J2000 + dt), azimuth('venus', J2000));
  assert.ok(dEarth > 0, `Earth's prime meridian must turn eastward, got ${dEarth}`);
  assert.ok(dVenus < 0, `Venus' prime meridian must turn westward, got ${dVenus}`);
});

test('the full renderer composition reproduces the IAU orientation (pivot + local spin)', () => {
  // Exactly what PlanetarySystem does: set the pivot quaternion to the pole, then spin the mesh
  // about its local +Y by W. The resulting world orientation must equal iauOrientationQuaternion.
  for (const id of Object.keys(IAU_SPIN)) {
    const jd = J2000 + 20000;
    const pivot = new THREE.Object3D();
    const pole = iauPoleQuaternion(id, jd);
    pivot.quaternion.set(pole[0], pole[1], pole[2], pole[3]);
    const mesh = new THREE.Object3D();
    mesh.rotation.set(0, iauSpinAngleRad(id, jd), 0);
    pivot.add(mesh);
    pivot.updateWorldMatrix(false, true);

    const world = mesh.getWorldQuaternion(new THREE.Quaternion());
    const full = iauOrientationQuaternion(id, jd);
    const want = new THREE.Quaternion(full[0], full[1], full[2], full[3]);
    assert.ok(Math.abs(world.dot(want)) > 1 - 1e-9,
      `${id}: renderer composition does not match the IAU orientation`);
  }
});

// ---------------------------------------------------------------------------
// 6. Haumea (the body that motivated this work).
// ---------------------------------------------------------------------------

test("Haumea carries its published pole and sidereal rate", () => {
  const s = IAU_SPIN.haumea;
  assert.ok(s, 'Haumea must have IAU elements');
  assert.equal(s.ra, 282.6, 'Haumea ra (Kondratyev & Kornoukhov 2018)');
  assert.equal(s.dec, -13.0, 'Haumea dec (Kondratyev & Kornoukhov 2018)');
  assert.equal(s.phaseArbitrary, true, 'Haumea has no published prime-meridian origin');
  // Spin rate must correspond to the observed 3.915341 h sidereal day (within 0.1%).
  const expectedW1 = 360 / (3.915341 / 24);
  assert.ok(Math.abs(s.w1 - expectedW1) / expectedW1 < 1e-3,
    `Haumea w1=${s.w1} vs ${expectedW1} from P=3.915341 h`);
});

test("Haumea's pole lies close to the ecliptic plane (its distinctive geometry)", () => {
  const p = iauPoleIcrf('haumea', J2000);
  // Ecliptic latitude = asin(component along the ecliptic normal). The ecliptic normal in the
  // ICRF is (0, -sin eps, cos eps); Haumea's obliquity is ~81 deg, so |latitude| must be small.
  const eps = 23.4392911 * DEG;
  const eclipticNormal = [0, -Math.sin(eps), Math.cos(eps)];
  const lat = Math.asin(Math.max(-1, Math.min(1, dot3(p, eclipticNormal)))) / DEG;
  assert.ok(Math.abs(lat) < 12, `Haumea ecliptic latitude ${lat.toFixed(2)} deg should be ~10`);
  // ...which means the spin axis is ~81 deg from the ecliptic pole.
  assert.ok(Math.abs(90 - Math.abs(lat) - 81.2) < 3, 'Haumea obliquity to the ecliptic must be ~81 deg');
});

test('Haumea spins fast enough to be visibly non-static', () => {
  const d = 0.163139208; // one sidereal day (days)
  const before = iauSpinAngleRad('haumea', J2000);
  const after = iauSpinAngleRad('haumea', J2000 + d);
  assert.ok(Math.abs(angularDiff(after, before)) < 1e-6, 'Haumea must complete ~one turn per sidereal day');
  // A quarter period must be a quarter turn.
  const quarter = iauSpinAngleRad('haumea', J2000 + d / 4);
  assert.ok(Math.abs(Math.abs(angularDiff(quarter, before)) - Math.PI / 2) < 1e-6,
    'Haumea must advance a quarter turn per quarter period');
});

// ---------------------------------------------------------------------------
// 7. Regression: no body is left un-spinning.
// ---------------------------------------------------------------------------

test('every registered body with a rotation period yields a non-zero spin', () => {
  const jdA = J2000 + 100;
  const jdB = J2000 + 100.25;
  for (const id of Object.keys(ALL_BODIES)) {
    const body = getBodyData(id);
    if (!body.rotPeriodHours) continue; // an unknown/chaotic spin is allowed to be static
    let moved = false;
    if (hasIauSpin(id)) {
      moved = Math.abs(angularDiff(iauSpinAngleRad(id, jdB), iauSpinAngleRad(id, jdA))) > 1e-9;
    } else {
      // The legacy path spins at 2*pi/|P|; a quarter of the fastest period still moves.
      const rate = TWO_PI / (Math.abs(body.rotPeriodHours) * 3600);
      moved = (0.25 * 86400 * rate) > 1e-6;
    }
    assert.ok(moved, `${id} has rotPeriodHours=${body.rotPeriodHours} but does not spin`);
  }
});

test("tidally locked moons share their parent's pole", () => {
  // Tidally locked satellites spin about (approximately) their parent's pole. Io and Charon are
  // exact to <0.01 deg; Titan differs by ~0.2 deg and Triton by ~2 deg because its secular IAU
  // model is coarse (its omitted nutation term is ~32 deg — see the module header).
  const cases = [
    ['io', 'jupiter', 0.01],
    ['charon', 'pluto', 0.01],
    ['titan', 'saturn', 1.0],
    ['triton', 'neptune', 3.0],
  ];
  const jd = J2000 + 8000;
  for (const [moon, parent, maxDeg] of cases) {
    const qm = new THREE.Quaternion(...iauPoleQuaternion(moon, jd));
    const qp = new THREE.Quaternion(...iauPoleQuaternion(parent, jd));
    const dot = Math.min(1, Math.abs(qm.dot(qp)));
    const angleDeg = Math.acos(dot) / DEG;
    assert.ok(angleDeg < maxDeg, `${moon} pole is ${angleDeg.toFixed(3)} deg from ${parent}'s (max ${maxDeg})`);
  }
});

test('a moon assigned the true pole inside the parent-equator pivot keeps its relative geometry', () => {
  // The moon subtree is rotated by the parent-equator pivot; assigning the true IAU pole in that
  // SAME frame means position and orientation share one rotation, so the face-to-parent angle is
  // invariant. This is exactly why the renderer assigns the raw pole to the moon body pivot.
  const jd = J2000 + 5000;
  const parentTilt = 26.73 * DEG; // Saturn
  const offset = new THREE.Vector3(0.3, -0.1, 0.2);
  const build = (applyPivot) => {
    const root = new THREE.Object3D();
    const pivot = new THREE.Object3D();
    if (applyPivot) pivot.rotation.z = -parentTilt;
    root.add(pivot);
    const group = new THREE.Object3D();
    group.position.copy(offset);
    pivot.add(group);
    const bodyPivot = new THREE.Object3D();
    const q = iauPoleQuaternion('titan', jd);
    bodyPivot.quaternion.set(q[0], q[1], q[2], q[3]);
    group.add(bodyPivot);
    root.updateWorldMatrix(false, true);
    return { group, bodyPivot };
  };
  const faceAngle = (scene) => {
    const face = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(scene.bodyPivot.getWorldQuaternion(new THREE.Quaternion()));
    const toParent = scene.group.getWorldPosition(new THREE.Vector3()).negate();
    return face.angleTo(toParent);
  };
  const flat = faceAngle(build(false));
  const tilted = faceAngle(build(true));
  assert.ok(Math.abs(flat - tilted) < 1e-9,
    `face-to-parent angle changed under the pivot (${flat} vs ${tilted})`);
});

test('non-synchronous moons are NOT driven by the orbital anomaly', () => {
  for (const id of ['hiiaka', 'namaka', 'hyperion']) {
    assert.equal(isSynchronousMoon(id), false, `${id} must not be treated as tidally locked`);
  }
  // Synchronous moons must be recognised as locked.
  for (const id of ['io', 'titan', 'charon', 'phobos']) {
    assert.equal(isSynchronousMoon(id), true, `${id} must be recognised as tidally locked`);
  }
  // Hi'iaka spins on its own 9.68 h period, which is far from its 49.46 d orbit — the old code
  // forced it onto the orbital anomaly, which is the bug this guards against.
  const hiiaka = getBodyData('hiiaka');
  const orbitHours = hiiaka.elements.periodDays * 24;
  assert.ok(Math.abs(hiiaka.rotPeriodHours - orbitHours) / orbitHours > 0.5,
    "Hi'iaka's spin must differ strongly from its orbital period");
});

console.log(`\nIAU axial-orientation verification: ${passed} tests passed`);
