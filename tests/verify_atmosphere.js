import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { ATMOSPHERE_BODIES, ATMOSPHERE_BODY_IDS, atmosphereLimbRim } from '../src/scene/planetAtmospheres.js';
import { getBodyData, ALL_BODIES } from '../src/utils/smallBodies.js';
import { Atmosphere } from '../src/scene/Atmosphere.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

console.log('================================================================');
console.log(' PLANETARY ATMOSPHERE LIMB TEST SUITE');
console.log('================================================================\n');

console.log('SUITE 1: Parameters');

test('every entry has a sane height, colour and intensity', () => {
  for (const [id, cfg] of Object.entries(ATMOSPHERE_BODIES)) {
    assert.ok(Number.isFinite(cfg.height) && cfg.height > 0 && cfg.height <= 0.25,
      `${id}: height ${cfg.height} must be in (0, 0.25] — real atmospheres are thin`);
    assert.ok(Number.isInteger(cfg.color) && cfg.color >= 0 && cfg.color <= 0xffffff,
      `${id}: invalid color ${cfg.color}`);
    assert.ok(Number.isFinite(cfg.intensity) && cfg.intensity > 0 && cfg.intensity <= 1,
      `${id}: intensity ${cfg.intensity} must be in (0, 1] (it is the peak alpha)`);
  }
});

test('atmosphereLimbRim is a monotonic, bounded function of the shell height', () => {
  assert.equal(atmosphereLimbRim(0), 0, 'a zero-thickness shell has a zero rim angle');
  assert.equal(atmosphereLimbRim(-1), 0, 'degenerate heights fall back to 0');
  let prev = -1;
  for (const h of [0.005, 0.012, 0.02, 0.05, 0.1, 0.2]) {
    const v = atmosphereLimbRim(h);
    assert.ok(v > 0 && v < 1, `rim ${v} for h=${h} must be in (0, 1)`);
    assert.ok(v > prev, `rim must grow with shell thickness (h=${h})`);
    prev = v;
  }
});

console.log('\nSUITE 2: Scientific grounding');

test('every body flagged atmosphere:true carries a limb configuration', () => {
  const missing = [];
  for (const [id, data] of Object.entries(ALL_BODIES)) {
    if (data.atmosphere === true && !ATMOSPHERE_BODIES[id]) missing.push(id);
  }
  assert.deepEqual(missing, [], `atmospheric bodies missing a limb config: ${missing.join(', ')}`);
});

test('the airless bodies stay absent (a sharp limb is physically correct)', () => {
  const airless = ['mercury', 'ceres', 'phobos', 'europa', 'callisto', 'io', 'ganymede', 'enceladus'];
  for (const id of airless) {
    assert.ok(getBodyData(id), `expected ${id} to exist in the body registry`);
    assert.ok(!ATMOSPHERE_BODIES[id], `${id} is airless and must NOT have an atmosphere limb`);
  }
});

test('the key atmospheric bodies are configured (Earth, Neptune, Pluto…)', () => {
  for (const id of ['earth', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'titan', 'triton', 'pluto']) {
    const cfg = ATMOSPHERE_BODIES[id];
    assert.ok(cfg, `${id} must have an atmosphere limb`);
    const data = getBodyData(id);
    assert.ok(data && data.radiusKm > 0, `${id} must resolve to a real body with a radius`);
  }
});

test('Pluto now carries a real (blue haze) atmosphere', () => {
  assert.equal(getBodyData('pluto').atmosphere, true, 'Pluto has a real haze layer (New Horizons)');
});

test('every configured body id resolves to a real body', () => {
  for (const id of ATMOSPHERE_BODY_IDS) {
    assert.ok(getBodyData(id), `config references unknown body "${id}"`);
  }
});

console.log('\nSUITE 3: Soft-edge render settings');

test('the limb renders back-side, additive, without writing depth', () => {
  const src = fs.readFileSync(path.resolve('src/scene/Atmosphere.js'), 'utf8');
  assert.match(src, /side:\s*THREE\.BackSide/, 'the shell must render back-side so the planet occludes the disc');
  assert.match(src, /blending:\s*THREE\.AdditiveBlending/, 'atmosphere must add light, not replace it');
  assert.match(src, /depthWrite:\s*false/, 'the glow must never occlude geometry');
});

test('the glow fades to zero at the outer silhouette (no hard geometric edge)', () => {
  const src = fs.readFileSync(path.resolve('src/scene/Atmosphere.js'), 'utf8');
  // Brightness ∝ optical path length through the shell → 0 at the silhouette, 1 at the limb.
  assert.match(src, /abs\(dot\(N, V\)\)/, 'must use the |N·V| path-length term');
  assert.match(src, /limbRim/, 'must normalise the rim so it peaks at the planet limb');
  // Regression guard: the old front-side fresnel peaked AT the shell boundary → hard edge.
  assert.doesNotMatch(src, /pow\(1\.0\s*-\s*max\(dot\(N, V\), 0\.0\)/,
    'the old hard-edged front-side fresnel must be gone');
});

test('the night limb does not glow', () => {
  const src = fs.readFileSync(path.resolve('src/scene/Atmosphere.js'), 'utf8');
  assert.match(src, /smoothstep\([^)]*dot\(N, S\)\)/, 'the glow must be gated by the sunlit limb');
});

console.log('\nSUITE 4: Runtime update robustness (headless)');

// Build a real Atmosphere without a WebGL context: geometry and ShaderMaterial construct fine
// in Node, and a stub planetary system gives every non-Earth shell a parent so update() walks
// all of its entries (Earth is parented straight to the scene).
function buildAtmosphere() {
  const scene = new THREE.Scene();
  const smallBodies = new Map();
  for (const id of ATMOSPHERE_BODY_IDS) {
    if (id === 'earth') continue;
    smallBodies.set(id, { group: new THREE.Group() });
  }
  return new Atmosphere(scene, { planets: new Map(), smallBodies });
}

test('every configured body contributes a limb shell to update()', () => {
  const atmo = buildAtmosphere();
  assert.equal(atmo.entries.length, ATMOSPHERE_BODY_IDS.length,
    'each atmospheric body must own exactly one shell (Earth is parented to the scene)');
});

test('update() never throws when the camera slot holds a non-camera (the shipped crash)', () => {
  const atmo = buildAtmosphere();
  // A Vector3 carries .x but no .position — exactly what landed in the camera slot when the
  // arguments were swapped, which used to throw "Cannot read properties of undefined
  // (reading 'x')" from Vector3.copy on every single frame.
  assert.doesNotThrow(() =>
    atmo.update(new THREE.Vector3(1, 2, 3), new THREE.Vector3(), new THREE.Vector3(1, 0, 0)));
});

test('update() tolerates null, undefined and degenerate arguments', () => {
  const atmo = buildAtmosphere();
  assert.doesNotThrow(() => atmo.update());
  assert.doesNotThrow(() => atmo.update(null, null, null));
  assert.doesNotThrow(() => atmo.update(undefined, undefined, undefined));
  // A real camera with missing sun arguments must also stay quiet.
  assert.doesNotThrow(() => atmo.update(new THREE.PerspectiveCamera(), undefined, undefined));
});

test('update() reads the camera from the FIRST argument (parameter-order contract)', () => {
  const atmo = buildAtmosphere();
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(7, 8, 9);
  atmo.update(cam, new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, 1));
  for (const e of atmo.entries) {
    assert.deepEqual(e.uniforms.camPos.value.toArray(), [7, 8, 9],
      `camPos for "${e.id}" must come from the first (camera) argument`);
  }
});

test('update() publishes a unit sun direction, falling back at Earth', () => {
  const atmo = buildAtmosphere();
  const cam = new THREE.PerspectiveCamera();
  const sunDir = new THREE.Vector3(0, 0, 1);
  // A distant sun position gives each shell a real direction to the Sun.
  atmo.update(cam, new THREE.Vector3(100, 0, 0), sunDir);
  for (const e of atmo.entries) {
    assert.ok(Math.abs(e.uniforms.sunDir.value.length() - 1) < 1e-6,
      `sun direction for "${e.id}" must be normalised`);
  }
  // Sun position coincident with a shell (Earth sits at the origin) → fall back to the global dir.
  atmo.update(cam, new THREE.Vector3(0, 0, 0), sunDir);
  const earth = atmo.entries.find((e) => e.id === 'earth');
  assert.deepEqual(earth.uniforms.sunDir.value.toArray(), [0, 0, 1],
    'a degenerate sun position must fall back to the scene-wide sun direction');
});

test('SceneManager calls atmosphere.update(camera, sunPosition, sunDir) in that order', () => {
  const src = fs.readFileSync(path.resolve('src/scene/SceneManager.js'), 'utf8');
  assert.match(src, /this\.atmosphere\.update\(\s*this\.camera,\s*(?:this\.sun\.getPosition\(\)|sunPos),\s*sunDir\s*\)/,
    'the render loop must pass the camera first — the order is a tested contract');
});

console.log('\n================================================================');
console.log(` Atmosphere tests: ${passed}/${passed + failed} passed`);
console.log('================================================================');

if (failed > 0) process.exit(1);
