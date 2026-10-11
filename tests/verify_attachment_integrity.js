import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

// The scene modules under src/ use extensionless relative imports (Vite resolves them),
// which bare Node ESM refuses. Install a tiny resolve hook that appends `.js` before we
// dynamically import PlanetFleet, so this file runs with the plain `node tests/...` command
// and without touching any other file.
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

const { PlanetFleet } = await import('../src/scene/planets/PlanetFleet.js');
const { PLANETARY_ORBITERS } = await import('../src/utils/planetaryFleet.js');
const { PLANETARY_ELEMENTS_J2000, ORDERED_PLANET_KEYS } = await import('../src/utils/planetaryData.js');
const { EARTH_RADIUS_KM } = await import('../src/utils/astronomy.js');
const { ALL_BODIES, getBodyClass, moonsOf, MOONS } = await import('../src/utils/smallBodies.js');
const { ORDERED_MOON_KEYS } = await import('../src/utils/moons.js');
const { DWARF_PLANETS, ORDERED_DWARF_KEYS } = await import('../src/utils/dwarfPlanets.js');
const { SOLAR_SATS, LUNAR_SATS } = await import('../src/utils/celestialFleet.js');
const { DEEP_SPACE_PROBES } = await import('../src/utils/deepSpaceProbes.js');
const { getMoonOffsetThreeJS } = await import('../src/utils/smallBodyEphemeris.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const TOTAL = 10;

console.log('Attachment integrity: every object bound to the right parent body');

const UNIT = EARTH_RADIUS_KM;

// ---------------------------------------------------------------------------
// 1. Referential integrity.
// ---------------------------------------------------------------------------

test('every moon orbits a real planet/dwarf body, never another moon', () => {
  for (const key of ORDERED_MOON_KEYS) {
    const moon = MOONS[key];
    assert.ok(moon.parentId, `moon "${key}" has an empty parentId`);
    assert.ok(ALL_BODIES[moon.parentId], `moon "${key}" orbits unknown body "${moon.parentId}"`);
    const cls = getBodyClass(moon.parentId);
    assert.ok(cls === 'planet' || cls === 'dwarf',
      `moon "${key}" orbits "${moon.parentId}" whose class is "${cls}" (must be planet or dwarf)`);
    assert.notEqual(cls, 'moon', `moon "${key}" must not orbit another moon`);
  }
});

test('every planetary orbiter references a real parent and is flagged planetary', () => {
  for (const sat of PLANETARY_ORBITERS) {
    assert.ok(sat.parentPlanetId, `${sat.id} has an empty parentPlanetId`);
    assert.ok(PLANETARY_ELEMENTS_J2000[sat.parentPlanetId],
      `${sat.id} orbits unknown body "${sat.parentPlanetId}"`);
    assert.equal(sat.isPlanetary, true, `${sat.id} is not flagged isPlanetary`);
    assert.notEqual(sat.parentPlanetId, 'earth', `${sat.id} must not use the Earth fleet`);
  }
});

test('every deep-space probe is heliocentric and unbound to any parent', () => {
  for (const p of DEEP_SPACE_PROBES) {
    assert.ok(p.isDeepSpace, `${p.id} must be flagged isDeepSpace`);
    assert.equal(p.heliocentric, true, `${p.id} must be heliocentric`);
    assert.ok(p.parentId === undefined || p.parentId === null,
      `${p.id} must have no parent, got "${p.parentId}"`);
  }
});

// ---------------------------------------------------------------------------
// 2. Global identifier uniqueness.
// ---------------------------------------------------------------------------

test('ids and NORAD ids are collision-free across every fleet and body', () => {
  // A NORAD id being equal to its own object's id is not a collision, so track the owning
  // fleet member and only flag two *different* members sharing one identifier.
  const owners = new Map();
  const claim = (identifier, owner) => {
    const key = String(identifier);
    if (owners.has(key)) {
      assert.equal(owners.get(key), owner,
        `identifier "${key}" is shared by two different members: "${owners.get(key)}" and "${owner}"`);
    } else {
      owners.set(key, owner);
    }
  };

  for (const k of ORDERED_PLANET_KEYS) claim(k, `planet:${k}`);
  for (const k of ORDERED_DWARF_KEYS) claim(k, `dwarf:${k}`);
  for (const k of ORDERED_MOON_KEYS) claim(k, `moon:${k}`);
  for (const s of PLANETARY_ORBITERS) {
    claim(s.id, `orbiter:${s.id}`);
    if (s.noradId != null) claim(s.noradId, `orbiter:${s.id}`);
  }
  for (const p of DEEP_SPACE_PROBES) {
    claim(p.id, `probe:${p.id}`);
    if (p.noradId != null) claim(p.noradId, `probe:${p.id}`);
  }
  for (const s of SOLAR_SATS) {
    claim(s.id, `solar:${s.id}`);
    claim(s.noradId, `solar:${s.id}`);
  }
  for (const s of LUNAR_SATS) {
    claim(s.id, `lunar:${s.id}`);
    claim(s.noradId, `lunar:${s.id}`);
  }
});

// ---------------------------------------------------------------------------
// 3. Headless anchoring proof.
// ---------------------------------------------------------------------------

// Stub "solar system": each orbited planet gets a distinct, well-separated fixed position so a
// mis-anchored orbiter would land nowhere near its parent.
const orbitedParents = [...new Set(PLANETARY_ORBITERS.map(s => s.parentPlanetId))];
const stubPositions = new Map();
orbitedParents.forEach((id, i) => {
  stubPositions.set(id, new THREE.Vector3((i + 1) * 1000, (i + 2) * 500, (i + 3) * 250));
});
const stubSystem = { getPositionOf: (id) => stubPositions.get(id) ?? null };

const scene = new THREE.Scene();
const fleet = new PlanetFleet(scene, stubSystem);
fleet.visible = true;

const YEAR_MS = 365 * 86400000;
const baseMs = Date.UTC(2024, 0, 1);
const DATES = Array.from({ length: 8 }, (_, k) => new Date(baseMs + (k * YEAR_MS) / 8));

function orbitalRange(sat) {
  const parent = PLANETARY_ELEMENTS_J2000[sat.parentPlanetId];
  const rp = (parent.radiusKm + (sat.periapsisKm ?? sat.altKm ?? 0)) / UNIT;
  const ra = (parent.radiusKm + (sat.apoapsisKm ?? sat.periapsisKm ?? sat.altKm ?? 0)) / UNIT;
  return { rp, ra };
}

test('fleet builds one anchored group per orbited parent planet', () => {
  assert.equal(fleet.entries.size, orbitedParents.length,
    `expected ${orbitedParents.length} parent groups, got ${fleet.entries.size}`);
  for (const id of orbitedParents) {
    const entry = fleet.entries.get(id);
    assert.ok(entry, `no entry built for parent "${id}"`);
    assert.ok(entry.group.parent === fleet.group, `entry group for "${id}" is not under the fleet`);
    const expectedRadius = PLANETARY_ELEMENTS_J2000[id].radiusKm / UNIT;
    assert.ok(Math.abs(entry.planetRadiusUnits - expectedRadius) < 1e-9,
      `"${id}" planetRadiusUnits mismatch`);
    assert.ok(entry.items.length > 0, `"${id}" has no orbiters`);
  }
});

test('across a year each orbiter stays bound to ITS parent within [periapsis, apoapsis]', () => {
  const world = new THREE.Vector3();
  const expectedWorld = new THREE.Vector3();
  const tol = 1e-6;

  for (const date of DATES) {
    fleet.update(date, null);

    for (const [planetId, entry] of fleet.entries) {
      const parentPos = stubPositions.get(planetId);
      assert.ok(parentPos, `stub has no position for "${planetId}"`);

      // The parent group is anchored exactly on the live parent position.
      assert.ok(entry.group.position.distanceTo(parentPos) < tol,
        `"${planetId}" group is not anchored to the parent position`);

      for (const item of entry.items) {
        assert.equal(item.sat.parentPlanetId, planetId,
          `${item.sat.id} is filed under the wrong parent group`);

        item.mesh.getWorldPosition(world);

        // (a) world position equals parent + the same local offset update() computed.
        const local = fleet._localPosition(item, date.getTime());
        expectedWorld.copy(parentPos).add(new THREE.Vector3(local.x, local.y, local.z));
        assert.ok(world.distanceTo(expectedWorld) < tol,
          `${item.sat.id} world position drifted from parent + local offset`);

        // (b) the orbiter's distance from its parent lies inside its own orbit's [rp, ra].
        const { rp, ra } = orbitalRange(item.sat);
        const dist = world.distanceTo(parentPos);
        assert.ok(dist >= rp - tol,
          `${item.sat.id} is ${dist.toFixed(6)} units from ${planetId}, inside periapsis ${rp.toFixed(6)}`);
        assert.ok(dist <= ra + tol,
          `${item.sat.id} is ${dist.toFixed(6)} units from ${planetId}, beyond apoapsis ${ra.toFixed(6)}`);
      }
    }
  }
});

test('orbiters track the parent\'s live position (translation-invariant binding)', () => {
  // With the date fixed, the local orbit offset is constant, so moving the parent by Δ must
  // move every one of its orbiters' world positions by exactly Δ — the proof that they are
  // bound to the parent's live position rather than a cached/absolute one.
  const parentId = 'mars';
  const date = DATES[0];
  const itemList = [...fleet.entries.get(parentId).items];

  const A = new THREE.Vector3(1234, 567, 890);
  stubPositions.set(parentId, A);
  fleet.update(date, null);
  const before = itemList.map((it) => it.mesh.getWorldPosition(new THREE.Vector3()));

  const delta = new THREE.Vector3(37, -21, 53);
  const B = A.clone().add(delta);
  stubPositions.set(parentId, B);
  fleet.update(date, null);
  const after = itemList.map((it) => it.mesh.getWorldPosition(new THREE.Vector3()));

  itemList.forEach((it, k) => {
    const movedBy = after[k].clone().sub(before[k]);
    assert.ok(movedBy.distanceTo(delta) < 1e-6,
      `${it.sat.id} did not follow its parent's live move by exactly Δ`);
    const { rp, ra } = orbitalRange(it.sat);
    assert.ok(after[k].distanceTo(B) >= rp - 1e-6 && after[k].distanceTo(B) <= ra + 1e-6,
      `${it.sat.id} left its [rp, ra] band after the parent moved`);
  });

  // Restore the well-separated layout for any later use.
  stubPositions.set(parentId, new THREE.Vector3(1000, 1000, 750));
});

// ---------------------------------------------------------------------------
// 4. Moons bound to their parent.
// ---------------------------------------------------------------------------

test('moon ephemeris offsets are finite for every moon across a year', () => {
  for (const key of ORDERED_MOON_KEYS) {
    for (const date of DATES) {
      const off = getMoonOffsetThreeJS(key, date);
      assert.ok(off, `getMoonOffsetThreeJS("${key}") returned null`);
      assert.ok(Number.isFinite(off.x) && Number.isFinite(off.y) && Number.isFinite(off.z),
        `moon "${key}" has a non-finite offset`);
    }
  }
});

test('moonsOf() groups each moon under exactly its own parent', () => {
  const parents = [...new Set(ORDERED_MOON_KEYS.map(k => MOONS[k].parentId))];
  let grouped = 0;
  for (const parentId of parents) {
    const expected = ORDERED_MOON_KEYS.filter(k => MOONS[k].parentId === parentId).map(k => MOONS[k]);
    const got = moonsOf(parentId);
    assert.equal(got.length, expected.length,
      `moonsOf("${parentId}") returned ${got.length}, expected ${expected.length}`);
    for (const m of expected) {
      assert.ok(got.includes(m), `moonsOf("${parentId}") is missing ${m.nameEn}`);
    }
    grouped += got.length;
  }
  assert.equal(grouped, ORDERED_MOON_KEYS.length, 'some moons were dropped from the grouping');
  assert.equal(moonsOf('mercury').length, 0, 'a moonless body must return no moons');
});

test('every moon parent exists in PLANETARY_ELEMENTS_J2000 or DWARF_PLANETS', () => {
  for (const key of ORDERED_MOON_KEYS) {
    const parentId = MOONS[key].parentId;
    assert.ok(
      PLANETARY_ELEMENTS_J2000[parentId] || DWARF_PLANETS[parentId],
      `moon "${key}" parent "${parentId}" is in neither the planet nor dwarf registry`,
    );
  }
});

console.log(`\nAttachment integrity tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
