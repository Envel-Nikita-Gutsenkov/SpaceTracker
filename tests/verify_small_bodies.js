import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DWARF_PLANETS, ORDERED_DWARF_KEYS, OFFICIAL_DWARF_KEYS, isOfficialDwarf, MOONS, ORDERED_MOON_KEYS, ALL_BODIES } from '../src/utils/smallBodies.js';
import { getDwarfPositionThreeJS, getMoonOffsetThreeJS, getMoonOrbitPoints } from '../src/utils/smallBodyEphemeris.js';
import { PLANETARY_ELEMENTS_J2000, ORDERED_PLANET_KEYS, AU_KM } from '../src/utils/planetaryData.js';
import { EARTH_RADIUS_KM } from '../src/utils/astronomy.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

console.log('Small bodies (dwarf planets & moons) tests');

// --- Data integrity -------------------------------------------------------

test('dwarf planet catalogue holds every registered body (19: 4 IAU-official + 15 candidates)', () => {
  assert.equal(ORDERED_DWARF_KEYS.length, 19, `expected 19 dwarf keys, got ${ORDERED_DWARF_KEYS.length}`);
  for (const k of ORDERED_DWARF_KEYS) assert.ok(DWARF_PLANETS[k], `missing dwarf entry: ${k}`);
  assert.ok(!ORDERED_DWARF_KEYS.includes('pluto'), 'Pluto must not be duplicated here');
});

test('every dwarf carries an IAU recognition flag and the official set is exactly the four', () => {
  const official = [];
  for (const k of ORDERED_DWARF_KEYS) {
    const rec = DWARF_PLANETS[k].recognition;
    assert.ok(rec === 'official' || rec === 'candidate', `${k}: bad recognition '${rec}'`);
    if (rec === 'official') official.push(k);
  }
  assert.deepEqual(official.sort(), ['ceres', 'eris', 'haumea', 'makemake'],
    'the IAU-designated dwarf planets in this registry must be exactly Ceres, Eris, Haumea, Makemake');
  assert.equal(isOfficialDwarf('ceres'), true);
  assert.equal(isOfficialDwarf('quaoar'), false);
  assert.deepEqual([...OFFICIAL_DWARF_KEYS].sort(), ['ceres', 'eris', 'haumea', 'makemake']);
});

test('moon catalogue is present and complete', () => {
  assert.ok(ORDERED_MOON_KEYS.length >= 28, `expected at least 28 moons, got ${ORDERED_MOON_KEYS.length}`);
  for (const k of ORDERED_MOON_KEYS) assert.ok(MOONS[k], `missing moon entry: ${k}`);
});

test('no id collisions between planets, dwarfs and moons', () => {
  const seen = new Set();
  for (const id of [...ORDERED_PLANET_KEYS, ...ORDERED_DWARF_KEYS, ...ORDERED_MOON_KEYS]) {
    assert.ok(!seen.has(id), `duplicate body id: ${id}`);
    seen.add(id);
  }
});

test('every body has positive, finite physical parameters', () => {
  for (const id of [...ORDERED_DWARF_KEYS, ...ORDERED_MOON_KEYS]) {
    const b = ALL_BODIES[id];
    assert.ok(Number.isFinite(b.radiusKm) && b.radiusKm > 0, `${id}: bad radiusKm`);
    assert.ok(Number.isFinite(b.massKg) && b.massKg > 0, `${id}: bad massKg`);
    assert.ok(Number.isFinite(b.rotPeriodHours), `${id}: bad rotPeriodHours`);
    assert.ok(b.nameEn && b.nameRu, `${id}: missing names`);
    assert.ok(b.source, `${id}: missing source attribution`);
  }
});

test('dwarf planets carry valid osculating conic elements', () => {
  for (const id of ORDERED_DWARF_KEYS) {
    const el = DWARF_PLANETS[id].elements;
    assert.ok(el, `${id}: no elements`);
    assert.ok(Number.isFinite(el.aAU) && el.aAU > 0, `${id}: bad aAU`);
    assert.ok(Number.isFinite(el.e) && el.e >= 0 && el.e < 1, `${id}: bad e`);
    assert.ok(Number.isFinite(el.iDeg) && el.iDeg >= 0 && el.iDeg <= 180, `${id}: bad iDeg`);
    assert.ok(Number.isFinite(el.nDegPerDay) && el.nDegPerDay > 0, `${id}: bad mean motion`);
    assert.ok(Number.isFinite(el.Tp) && el.Tp > 2000000, `${id}: bad perihelion JD`);
    assert.ok(Number.isFinite(el.epochJD) && el.epochJD > 2000000, `${id}: bad epoch`);
  }
});

test('moons carry valid parent-relative elements and resolve their parent', () => {
  for (const id of ORDERED_MOON_KEYS) {
    const m = MOONS[id];
    const el = m.elements;
    assert.ok(el, `${id}: no elements`);
    assert.ok(Number.isFinite(el.aKm) && el.aKm > 0, `${id}: bad aKm`);
    assert.ok(Number.isFinite(el.e) && el.e >= 0 && el.e < 1, `${id}: bad e`);
    assert.ok(Number.isFinite(el.periodDays) && el.periodDays > 0, `${id}: bad periodDays`);
    assert.ok(Number.isFinite(el.nDegPerDay) && el.nDegPerDay > 0, `${id}: bad mean motion`);
    assert.ok(ALL_BODIES[m.parentId], `${id}: parent '${m.parentId}' does not resolve`);
  }
});

// --- Propagation ----------------------------------------------------------

test('dwarf planet heliocentric radius stays between perihelion and aphelion', () => {
  const sun = { x: 0, y: 0, z: 0 };
  for (const id of ORDERED_DWARF_KEYS) {
    const el = DWARF_PLANETS[id].elements;
    const aKm = el.aAU * AU_KM;
    const q = aKm * (1 - el.e);
    const Q = aKm * (1 + el.e);
    for (const jd of [2451545.0, 2461200.5, 2469807.5]) {
      const date = new Date((jd - 2440587.5) * 86400000);
      const pos = getDwarfPositionThreeJS(id, date, sun);
      assert.ok(pos, `${id}: null position`);
      const rKm = Math.hypot(pos.x, pos.y, pos.z) * EARTH_RADIUS_KM;
      assert.ok(rKm >= q * 0.999 && rKm <= Q * 1.001,
        `${id} @ ${jd}: r=${(rKm / AU_KM).toFixed(3)} AU outside [${(q / AU_KM).toFixed(2)}, ${(Q / AU_KM).toFixed(2)}]`);
    }
  }
});

test('moon offset magnitude tracks the semi-major axis and orbit ring closes', () => {
  for (const id of ORDERED_MOON_KEYS) {
    const el = MOONS[id].elements;
    const aU = el.aKm / EARTH_RADIUS_KM;
    const q = aU * (1 - el.e);
    const Q = aU * (1 + el.e);
    for (const jd of [2451545.0, 2460000.0]) {
      const date = new Date((jd - 2440587.5) * 86400000);
      const off = getMoonOffsetThreeJS(id, date);
      assert.ok(off, `${id}: null offset`);
      const r = Math.hypot(off.x, off.y, off.z);
      assert.ok(r >= q * 0.999 && r <= Q * 1.001,
        `${id} @ ${jd}: offset r=${r} outside [${q}, ${Q}]`);
    }
    const ring = getMoonOrbitPoints(id, 64);
    assert.ok(ring.length > 32, `${id}: orbit ring too short`);
  }
});

// --- Rendering / UI wiring (source regression) ----------------------------

test('small bodies default sensibly and stay gated behind explicit toggles', () => {
  const store = fs.readFileSync(path.resolve('src/store/useSatStore.js'), 'utf8');
  assert.match(store, /showDwarfPlanets:\s*true/, 'dwarf planets must default ON');
  assert.match(store, /showDwarfCandidates:\s*true/, 'dwarf-planet candidates must default ON');
  assert.match(store, /showMoons:\s*false/, 'moons must default OFF');
  assert.match(store, /toggleShowDwarfPlanets/, 'missing dwarf toggle');
  assert.match(store, /toggleShowDwarfCandidates/, 'missing dwarf-candidate toggle');
  assert.match(store, /toggleShowMoons/, 'missing moon toggle');
});

test('the render system creates and gates dwarfs and moons', () => {
  const src = fs.readFileSync(path.resolve('src/scene/planets/PlanetarySystem.js'), 'utf8');
  assert.match(src, /ORDERED_DWARF_KEYS/, 'dwarfs must be built from the registry');
  assert.match(src, /ORDERED_MOON_KEYS/, 'moons must be built from the registry');
  assert.match(src, /showClass \|\| isSelected \|\| isFocused/, 'small bodies must obey the toggle/selection gate');
  // Orbits, unlike bodies, are never drawn for a whole layer at once: only the selected/focused
  // body shows its orbit, so enabling dwarfs/moons cannot flood the scene with every ellipse.
  assert.match(src, /line\.visible = Boolean\(showPlanetaryOrbits && \(isSelected \|\| isFocused\)\)/,
    'dwarf orbit lines must be selection-only');
  assert.match(src, /showPlanetaryOrbits && \(isSelected \|\| isFocused\) && orbitFade > 0\.0/,
    'moon orbit lines must be selected-only, fade at close range, and obey the orbit toggle');
  assert.match(src, /moonOrbitLine\.material\.opacity = MOON_ORBIT_LINE_OPACITY \* orbitFade/,
    'selected moon orbit lines must fade smoothly with camera distance');
  assert.doesNotMatch(src, /isSelected \|\| isFocused \|\| showMoons/,
    'moon orbits must not ride the whole moon layer');
  assert.match(src, /isOfficialDwarf\(id\) \? showDwarfPlanets : showDwarfCandidates/,
    'official dwarfs and candidate dwarfs must be gated by their own flags');
  assert.match(src, /obj\.group\.visible = false/, 'small bodies must start hidden');
});

test('the planet bar and search expose dwarf planets and moons', () => {
  const bar = fs.readFileSync(path.resolve('src/components/PlanetBar.jsx'), 'utf8');
  const search = fs.readFileSync(path.resolve('src/components/SearchBar.jsx'), 'utf8');
  assert.match(bar, /ORDERED_DWARF_KEYS/, 'PlanetBar must list dwarf planets');
  assert.match(bar, /ORDERED_MOON_KEYS/, 'PlanetBar must list moons');
  assert.match(search, /DWARF_PLANETS/, 'SearchBar must search dwarf planets');
  assert.match(search, /MOONS/, 'SearchBar must search moons');
});

test('hidden categories are excluded from the selector and search lists', () => {
  // A body that is not rendered (its category toggle is off) must not be offered as a selectable
  // entry: it has no live position to fly to and would read as a dead row in the list.
  const bar = fs.readFileSync(path.resolve('src/components/PlanetBar.jsx'), 'utf8');
  const search = fs.readFileSync(path.resolve('src/components/SearchBar.jsx'), 'utf8');
  assert.match(bar, /showDwarfPlanets\s*\?[\s\S]*?dwarfItems\.filter\(d => d\.recognition === 'official'\)/,
    'PlanetBar must gate IAU dwarfs on their own toggle');
  assert.match(bar, /showDwarfCandidates\s*\?[\s\S]*?dwarfItems\.filter\(d => d\.recognition !== 'official'\)/,
    'PlanetBar must gate candidate dwarfs on their own toggle');
  assert.match(bar, /showMoons\s*\?\s*moonItems\s*:\s*\[\]/, 'PlanetBar must drop moons when the toggle is off');
  assert.match(search, /showDwarfPlanets\s*\?\s*OFFICIAL_DWARF_KEYS/, 'SearchBar must gate IAU dwarfs on their toggle');
  assert.match(search, /showDwarfCandidates\s*\?\s*ORDERED_DWARF_KEYS/, 'SearchBar must gate candidate dwarfs on their toggle');
  assert.match(search, /showMoons\s*\?[\s\S]*?ORDERED_MOON_KEYS/, 'SearchBar must gate moons on the toggle');
});

console.log(`\nSmall bodies tests: ${passed}/13 passed`);
