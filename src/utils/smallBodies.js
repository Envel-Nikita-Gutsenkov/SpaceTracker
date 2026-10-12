// Unified Solar-System body registry.
//
// Architecture: this is the single source of truth the whole app is data-driven from.
// Major planets live in PLANETARY_ELEMENTS_J2000 (JPL rate-based approximate positions);
// dwarf planets in dwarfPlanets.js and natural satellites in moons.js (osculating / mean
// parent-relative elements). Adding a future body is just: append an entry to the relevant
// dictionary and list its key in that dictionary's ORDERED_* array — the mesh builder,
// orbit lines, picking, focus, PlanetBar, SearchBar and InfoPanel all read from here.
//
// Body classes:
//   'planet'  – heliocentric, JPL rate-based elements (PLANETARY_ELEMENTS_J2000)
//   'dwarf'   – heliocentric, osculating conic elements (dwarfPlanets.js)
//   'moon'    – parent-relative mean elements (moons.js)

import { PLANETARY_ELEMENTS_J2000 } from './planetaryData.js';
import { DWARF_PLANETS, ORDERED_DWARF_KEYS, OFFICIAL_DWARF_KEYS, isOfficialDwarf } from './dwarfPlanets.js';
import { MOONS, ORDERED_MOON_KEYS } from './moons.js';

export { DWARF_PLANETS, ORDERED_DWARF_KEYS, OFFICIAL_DWARF_KEYS, isOfficialDwarf, MOONS, ORDERED_MOON_KEYS };

// Every known body keyed by id, each carrying an explicit `bodyClass`.
export const ALL_BODIES = {};

for (const [id, p] of Object.entries(PLANETARY_ELEMENTS_J2000)) {
  ALL_BODIES[id] = { ...p, bodyClass: 'planet', parentId: null };
}
for (const [id, d] of Object.entries(DWARF_PLANETS)) {
  ALL_BODIES[id] = d;
}
for (const [id, m] of Object.entries(MOONS)) {
  ALL_BODIES[id] = m;
}

// Returns the unified data record for any body id, or null if unknown.
export function getBodyData(id) {
  return ALL_BODIES[id] || null;
}

export function getBodyClass(id) {
  return ALL_BODIES[id]?.bodyClass || null;
}

export function isMoon(id) {
  return getBodyClass(id) === 'moon';
}

export function isDwarf(id) {
  return getBodyClass(id) === 'dwarf';
}

// Moons grouped by their parent body id — handy for attaching mesh subgroups.
export function moonsOf(parentId) {
  return ORDERED_MOON_KEYS.filter((k) => MOONS[k].parentId === parentId).map((k) => MOONS[k]);
}
