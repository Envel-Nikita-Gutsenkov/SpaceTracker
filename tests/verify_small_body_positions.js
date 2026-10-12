import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

// src/scene/** uses extensionless relative imports (Vite resolves them) which bare Node ESM
// refuses. Install the same tiny resolve hook the other scene tests use before importing
// PlanetarySystem, so this file runs under the plain `node tests/...` command.
const loaderSource = [
  "import { existsSync } from 'node:fs';",
  "import { fileURLToPath } from 'node:url';",
  'export async function resolve(specifier, context, nextResolve) {',
  '  try { return await nextResolve(specifier, context); }',
  '  catch (err) {',
  "    if (specifier.startsWith('.') && context.parentURL) {",
  "      for (const cand of [specifier + '.js', specifier + '/index.js']) {",
  '        const url = new URL(cand, context.parentURL);',
  '        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };',
  '      }',
  '    }',
  '    throw err;',
  '  }',
  '}',
].join('\n');
register('data:text/javascript,' + encodeURIComponent(loaderSource));

const { PlanetarySystem } = await import('../src/scene/planets/PlanetarySystem.js');
const { ORDERED_MOON_KEYS, MOONS } = await import('../src/utils/smallBodies.js');
const { ORDERED_DWARF_KEYS, OFFICIAL_DWARF_KEYS, DWARF_PLANETS } = await import('../src/utils/dwarfPlanets.js');
const { ORDERED_PLANET_KEYS } = await import('../src/utils/planetaryData.js');
const { EARTH_RADIUS_KM } = await import('../src/utils/astronomy.js');
const { getDwarfPositionThreeJS, getMoonOffsetThreeJS } = await import('../src/utils/smallBodyEphemeris.js');

let passed = 0;
const TOTAL = 8;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

console.log('Small-body world positions (hidden-body focus regression)');

// ---------------------------------------------------------------------------
// A headless PlanetarySystem: the real class logic (constructor bypassed, since the
// constructor synthesises textures/canvas that need a DOM) with the real registry data.
// Every dwarf and moon is built exactly as the constructor does — dwarfs are hidden,
// moons hang off their parent's group through a tilt pivot.
// ---------------------------------------------------------------------------
function makeBody(id, { bodyClass, parentId = null, tiltRad = 0 }) {
  const group = new THREE.Group();
  group.name = `body_${id}`;
  const bodyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 4, 4),
    new THREE.MeshBasicMaterial(),
  );
  bodyMesh.scale.setScalar(0.01);
  group.add(bodyMesh);
  return {
    group, bodyMesh, ringMesh: null, beaconMesh: null,
    data: { id, parentId }, radiusUnits: 0.01, bodyClass, parentId,
    tiltRad, rotSpeed: 0, rotSign: 1,
    ensureTexture: null, moonOrbitLine: null, lod: null,
  };
}

function makeOrbitLine() {
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  line.visible = false;
  line.userData = {};
  return line;
}

function makeSystem() {
  const sys = Object.create(PlanetarySystem.prototype);
  sys.scene = new THREE.Scene();
  sys.group = new THREE.Group();
  sys.scene.add(sys.group);
  sys.planets = new Map();
  sys.smallBodies = new Map();
  sys.orbitLines = new Map();
  sys._tempV = new THREE.Vector3();
  sys.textureLod = null;

  // Regular-planet parents are positioned by update() every frame; stand in for that here so
  // their moons have a real anchor to hang off.
  const planetParents = [...new Set(ORDERED_MOON_KEYS.map(k => MOONS[k].parentId))]
    .filter(p => ORDERED_PLANET_KEYS.includes(p));
  planetParents.forEach((pid, i) => {
    const b = makeBody(pid, { bodyClass: 'planet' });
    b.group.position.set((i + 1) * 50, (i + 1) * 20, (i + 1) * 10);
    sys.planets.set(pid, b);
    sys.group.add(b.group);
  });

  ORDERED_DWARF_KEYS.forEach(key => {
    const tiltRad = (DWARF_PLANETS[key].axialTiltDeg || 0) * (Math.PI / 180);
    const b = makeBody(key, { bodyClass: 'dwarf', tiltRad });
    b.group.visible = false;
    sys.smallBodies.set(key, b);
    sys.group.add(b.group);
    const line = makeOrbitLine();
    sys.group.add(line);
    sys.orbitLines.set(key, line);
  });

  ORDERED_MOON_KEYS.forEach(key => {
    const data = MOONS[key];
    const parent = sys.planets.get(data.parentId) || sys.smallBodies.get(data.parentId);
    const b = makeBody(key, {
      bodyClass: 'moon',
      parentId: data.parentId,
      tiltRad: (data.axialTiltDeg || 0) * (Math.PI / 180),
    });
    b.group.visible = false;
    const pivot = new THREE.Group();
    pivot.rotation.z = -parent.tiltRad;
    pivot.add(b.group);
    parent.group.add(pivot);
    b.pivot = pivot;
    b.moonOrbitLine = makeOrbitLine();
    pivot.add(b.moonOrbitLine);
    sys.smallBodies.set(key, b);
  });

  return sys;
}

const sys = makeSystem();
const DATE = new Date(Date.UTC(2024, 0, 1));
const SUN = new THREE.Vector3(0, 0, 0);

// The exact call the render loop makes while everything is hidden (no toggles, no selection).
sys._updateSmallBodies(DATE, SUN, null, null, null, true, false, false, false);

const worldOf = (id) => {
  const b = sys.smallBodies.get(id) || sys.planets.get(id);
  return b.group.getWorldPosition(new THREE.Vector3());
};

// ---------------------------------------------------------------------------

test('a hidden dwarf parent is still positioned at its heliocentric location', () => {
  for (const id of ORDERED_DWARF_KEYS) {
    const world = worldOf(id);
    assert.ok(world.length() > 1,
      `dwarf "${id}" is at ${world.length().toFixed(4)} — it never left the scene origin`);
    const expected = getDwarfPositionThreeJS(id, DATE, SUN);
    const err = world.distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z));
    assert.ok(err < 1e-6, `dwarf "${id}" world position is ${err} from its ephemeris position`);
  }
});

test('a hidden dwarf\'s moons anchor to it, not to Earth (MK 2 / Xiangliu bug)', () => {
  // Regression: these dwarf-parented moons used to report the scene origin because their
  // hidden parent was never positioned, so focus flew the camera to Earth with nothing there.
  for (const id of ORDERED_MOON_KEYS) {
    const data = MOONS[id];
    if (!ORDERED_DWARF_KEYS.includes(data.parentId)) continue;
    const world = worldOf(id);
    assert.ok(world.length() > 10,
      `moon "${id}" is at ${world.length().toFixed(4)} units — still stranded at the origin`);
    const parentWorld = worldOf(data.parentId);
    assert.ok(world.distanceTo(parentWorld) < 10,
      `moon "${id}" is not anchored near its parent "${data.parentId}"`);
  }
});

test('every moon sits inside its own [periapsis, apoapsis] band around its parent', () => {
  for (const id of ORDERED_MOON_KEYS) {
    const data = MOONS[id];
    const el = data.elements;
    const aU = el.aKm / EARTH_RADIUS_KM;
    const q = aU * (1 - el.e);
    const Q = aU * (1 + el.e);
    const parentWorld = worldOf(data.parentId);
    const dist = worldOf(id).distanceTo(parentWorld);
    assert.ok(dist >= q * 0.999 && dist <= Q * 1.001,
      `moon "${id}": distance ${dist.toFixed(6)} outside [${q.toFixed(6)}, ${Q.toFixed(6)}]`);
  }
});

test('getPositionOf returns a real off-origin point for a dwarf moon on the click frame', () => {
  // focusPlanet() reads getPositionOf synchronously, before the next update() frame, so a
  // hidden moon must already resolve to its true location or the camera is aimed at Earth.
  for (const id of ['mk2', 'xiangliu', 'charon', 'dysnomia']) {
    const pos = sys.getPositionOf(id);
    assert.ok(pos, `getPositionOf("${id}") returned null`);
    assert.ok(pos.length() > 10,
      `getPositionOf("${id}") is at ${pos.length().toFixed(4)} — points at Earth`);
  }
});

test('focusing a dwarf moon keeps it anchored while its parent stays hidden', () => {
  const date = new Date(Date.UTC(2025, 5, 1));
  // focusedPlanetId = 'mk2', dwarf planets OFF, moons OFF — the exact click state.
  sys._updateSmallBodies(date, SUN, null, null, 'mk2', true, false, false, false);
  assert.equal(sys.smallBodies.get('mk2').group.visible, true, 'the focused moon must be shown');
  assert.equal(sys.smallBodies.get('makemake').group.visible, false, 'its parent stays hidden');
  const pos = sys.getPositionOf('mk2');
  assert.ok(pos.length() > 10, `focused moon resolved to ${pos.length().toFixed(4)}, near Earth`);
});

test('moons are anchored even when only the Moon toggle is on (dwarfs still hidden)', () => {
  // showMoons = true, showDwarfPlanets = false: every dwarf-parented moon must still follow
  // its invisible parent instead of collapsing onto the origin.
  const date = new Date(Date.UTC(2026, 2, 15));
  sys._updateSmallBodies(date, SUN, null, null, null, true, false, false, true);
  for (const id of ORDERED_MOON_KEYS) {
    const data = MOONS[id];
    if (!ORDERED_DWARF_KEYS.includes(data.parentId)) continue;
    const parentWorld = worldOf(data.parentId);
    const el = data.elements;
    const aU = el.aKm / EARTH_RADIUS_KM;
    const dist = worldOf(id).distanceTo(parentWorld);
    assert.ok(dist >= aU * (1 - el.e) * 0.999 && dist <= aU * (1 + el.e) * 1.001,
      `moon "${id}" collapsed to the origin instead of following "${data.parentId}"`);
    // Sanity: the moon offset is a pure rotation of the ephemeris offset, so lengths match.
    const off = getMoonOffsetThreeJS(id, date);
    const offLen = Math.hypot(off.x, off.y, off.z);
    assert.ok(Math.abs(dist - offLen) < 1e-6, `moon "${id}" distance ${dist} != offset length ${offLen}`);
  }
});

test('official dwarf planets and candidates are gated by two independent toggles', () => {
  const date = new Date(Date.UTC(2026, 0, 1));
  const candidates = ORDERED_DWARF_KEYS.filter(id => !OFFICIAL_DWARF_KEYS.includes(id));

  // Only the IAU switch on (args: ...showDwarfPlanets=true, showMoons=false, points off,
  // showDwarfCandidates=false): the four official dwarfs show, every candidate stays hidden.
  sys._updateSmallBodies(date, SUN, null, null, null, true, false, true, false);
  for (const id of OFFICIAL_DWARF_KEYS) {
    assert.equal(sys.smallBodies.get(id).group.visible, true, `official dwarf "${id}" must show`);
  }
  for (const id of candidates) {
    assert.equal(sys.smallBodies.get(id).group.visible, false, `candidate "${id}" must stay hidden`);
  }

  // Only the candidate switch on: the exact inverse of the above.
  sys._updateSmallBodies(date, SUN, null, null, null, true, false, false, false, false, false, true);
  for (const id of OFFICIAL_DWARF_KEYS) {
    assert.equal(sys.smallBodies.get(id).group.visible, false, `official dwarf "${id}" must hide`);
  }
  for (const id of candidates) {
    assert.equal(sys.smallBodies.get(id).group.visible, true, `candidate "${id}" must show`);
  }
});

test('orbits are click-only: no dwarf or moon layer draws every ellipse at once', () => {
  const date = new Date(Date.UTC(2026, 0, 1));
  const dwarfOrbit = (id) => sys.orbitLines.get(id).visible;
  const moonOrbit = (id) => sys.smallBodies.get(id).moonOrbitLine.visible;

  // Every dwarf body on, nothing selected: not a single dwarf orbit may be drawn.
  sys._updateSmallBodies(date, SUN, null, null, null, true, false, true, false);
  for (const id of ORDERED_DWARF_KEYS) {
    assert.equal(dwarfOrbit(id), false, `dwarf "${id}" orbit must stay hidden until selected`);
  }

  // Selecting one dwarf reveals exactly its own orbit.
  sys._updateSmallBodies(date, SUN, null, 'ceres', null, true, false, true, false);
  for (const id of ORDERED_DWARF_KEYS) {
    assert.equal(dwarfOrbit(id), id === 'ceres', `dwarf "${id}" orbit visibility wrong when Ceres is selected`);
  }

  // Focusing (without selecting) does the same.
  sys._updateSmallBodies(date, SUN, null, null, 'eris', true, false, true, false);
  for (const id of ORDERED_DWARF_KEYS) {
    assert.equal(dwarfOrbit(id), id === 'eris', `dwarf "${id}" orbit visibility wrong when Eris is focused`);
  }

  // Same rule for the moon layer: enabling moons draws no orbit web…
  sys._updateSmallBodies(date, SUN, null, null, null, true, false, false, true);
  for (const id of ORDERED_MOON_KEYS) {
    assert.equal(moonOrbit(id), false, `moon "${id}" orbit must stay hidden until selected`);
  }

  // …and focusing one moon reveals only that orbit.
  sys._updateSmallBodies(date, SUN, null, null, 'charon', true, false, false, true);
  for (const id of ORDERED_MOON_KEYS) {
    assert.equal(moonOrbit(id), id === 'charon', `moon "${id}" orbit visibility wrong when Charon is focused`);
  }
});

console.log(`\nSmall-body position tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
