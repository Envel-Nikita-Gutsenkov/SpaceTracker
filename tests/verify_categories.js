import assert from 'node:assert/strict';
import { CATEGORIES, detectCategory } from '../src/utils/categories.js';

// Coverage for the categories added alongside the new CelesTrak groups (gnss superset,
// last-30-days, emerging mega-constellations, GEO operators, Earth resources). The mapping is
// what keeps first-seen-wins dedup honest: a superset group must not steal an object from its
// own category, and a group override must beat the generic name rules.

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

let TOTAL = 0;

console.log('Satellite category mapping verification tests');

// ---------------------------------------------------------------------------
// 1. The new category exists and is well-formed
// ---------------------------------------------------------------------------
TOTAL++;
test('the megaconst category is registered with a unique id', () => {
  const cat = CATEGORIES.find(c => c.id === 'megaconst');
  assert.ok(cat, 'megaconst must be a registered category');
  assert.ok(cat.name && cat.color && cat.dotSize > 0, 'a category needs a name, colour and dot size');
  const ids = CATEGORIES.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'category ids must be unique');
});

// ---------------------------------------------------------------------------
// 2. Emerging mega-constellations — by group and by name
// ---------------------------------------------------------------------------
TOTAL++;
test('Kuiper / Qianfan / GuoWang map to megaconst by group', () => {
  assert.equal(detectCategory('kuiper', 'KUIPER-00008'), 'megaconst');
  assert.equal(detectCategory('qianfan', 'QIANFAN-1'), 'megaconst');
  assert.equal(detectCategory('hulianwang', 'HULIANWANG DIGUI-01'), 'megaconst');
});

TOTAL++;
test('Kuiper / Qianfan / GuoWang are recognised by name even from a catch-all group', () => {
  assert.equal(detectCategory('last-30-days', 'KUIPER-00123'), 'megaconst');
  assert.equal(detectCategory('last-30-days', 'QIANFAN-42'), 'megaconst');
  assert.equal(detectCategory('last-30-days', 'HULIANWANG DIGUI-77'), 'megaconst');
});

// ---------------------------------------------------------------------------
// 3. The gnss superset must not mislabel GLONASS as military
// ---------------------------------------------------------------------------
TOTAL++;
test('COSMOS in the gnss group is GLONASS, not military', () => {
  // CelesTrak names GLONASS satellites "COSMOS 2433 (720)" with no "GLONASS" in the name; the
  // generic COSMOS rule would otherwise file them under military.
  assert.equal(detectCategory('gnss', 'COSMOS 2433 (720)'), 'glonass');
  // A military COSMOS from any other group still maps to military.
  assert.equal(detectCategory('military', 'COSMOS 2500'), 'military');
});

TOTAL++;
test('gnss nav constellations resolve to their own categories by name', () => {
  assert.equal(detectCategory('gnss', 'GALILEO 5'), 'galileo');
  assert.equal(detectCategory('gnss', 'GPS BIIR-2  (PRN 13)'), 'gps');
  assert.equal(detectCategory('gnss', 'NAVSTAR 43 (USA 132)'), 'gps');
  assert.equal(detectCategory('gnss', 'BEIDOU-3 M1'), 'beidou');
});

// ---------------------------------------------------------------------------
// 4. Extended groups round out existing categories
// ---------------------------------------------------------------------------
TOTAL++;
test('GEO operators deepen the geo category', () => {
  for (const g of ['intelsat', 'ses', 'eutelsat', 'telesat']) {
    assert.equal(detectCategory(g, 'SOMETHING'), 'geo', `${g} must map to geo`);
  }
});

TOTAL++;
test('Earth-resources groups deepen the planet category', () => {
  assert.equal(detectCategory('resource', 'LANDSAT 9'), 'planet');
  assert.equal(detectCategory('dmc', 'DMC-3'), 'planet');
});

// ---------------------------------------------------------------------------
// 5. Unknown groups still fall through to `other`
// ---------------------------------------------------------------------------
TOTAL++;
test('an unrecognised group falls through to other', () => {
  assert.equal(detectCategory('last-30-days', 'SOME NEW SAT'), 'other');
  assert.equal(detectCategory(undefined, ''), 'other');
});

console.log(`\nCategory mapping tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
