import assert from 'node:assert/strict';
import { register } from 'node:module';

// useSatStore.js imports '../utils/categories' without an extension (Vite resolves it,
// bare Node ESM does not). Install the same tiny resolve hook used by the scene tests so
// the store can be exercised headlessly with the plain `node tests/...` command.
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

const { useSatStore } = await import('../src/store/useSatStore.js');
const { CATEGORIES } = await import('../src/utils/categories.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

let TOTAL = 0;

console.log('Satellite store (useSatStore) verification tests');

const ALL_BODY_IDS = ['earth', 'moon', 'sun', 'cislunar', 'planetary', 'deepspace'];

// ---------------------------------------------------------------------------
// 1. Defaults — including the gating of the new dwarf-planet / moon layers
// ---------------------------------------------------------------------------
TOTAL++;
test('dwarf planets show by default; moons stay hidden until enabled', () => {
  const s = useSatStore.getState();
  assert.equal(s.showDwarfPlanets, true, 'dwarf planets must default to shown');
  assert.equal(s.showMoons, false, 'natural moons must default to hidden');
});

TOTAL++;
test('mega-constellations are off by default, everything else is on', () => {
  const visible = useSatStore.getState().visibleCategories;
  const off = new Set(['starlink', 'oneweb', 'satnogs', 'cubesat', 'megaconst']);
  for (const cat of CATEGORIES) {
    assert.equal(visible.has(cat.id), !off.has(cat.id),
      `${cat.id} visibility default is wrong`);
  }
});

// ---------------------------------------------------------------------------
// 2. Category toggles
// ---------------------------------------------------------------------------
TOTAL++;
test('toggleCategory flips a single category without disturbing the rest', () => {
  useSatStore.setState({ visibleCategories: new Set(['iss', 'science']) });
  useSatStore.getState().toggleCategory('science');
  assert.deepEqual([...useSatStore.getState().visibleCategories], ['iss']);
  useSatStore.getState().toggleCategory('science');
  assert.deepEqual([...useSatStore.getState().visibleCategories].sort(), ['iss', 'science']);
});

TOTAL++;
test('showAllCategories / hideAllCategories set the full set and the empty set', () => {
  useSatStore.getState().hideAllCategories();
  assert.equal(useSatStore.getState().visibleCategories.size, 0);
  useSatStore.getState().showAllCategories();
  assert.equal(useSatStore.getState().visibleCategories.size, CATEGORIES.length);
});

// ---------------------------------------------------------------------------
// 3. Dwarf-planet / moon layer toggles (the user-facing gate)
// ---------------------------------------------------------------------------
TOTAL++;
test('toggleShowDwarfPlanets and toggleShowMoons round-trip', () => {
  useSatStore.setState({ showDwarfPlanets: false, showMoons: false });
  useSatStore.getState().toggleShowDwarfPlanets();
  useSatStore.getState().toggleShowMoons();
  assert.equal(useSatStore.getState().showDwarfPlanets, true);
  assert.equal(useSatStore.getState().showMoons, true);
  useSatStore.getState().toggleShowDwarfPlanets();
  assert.equal(useSatStore.getState().showDwarfPlanets, false);
});

TOTAL++;
test('interstellar probe markers default to hidden and toggle round-trips', () => {
  assert.equal(useSatStore.getState().showDeepSpaceProbes, false,
    'deep-space probe markers must default to hidden');
  useSatStore.getState().toggleShowDeepSpaceProbes();
  assert.equal(useSatStore.getState().showDeepSpaceProbes, true);
  useSatStore.getState().toggleShowDeepSpaceProbes();
  assert.equal(useSatStore.getState().showDeepSpaceProbes, false);
  useSatStore.getState().setShowDeepSpaceProbes(true);
  assert.equal(useSatStore.getState().showDeepSpaceProbes, true);
  useSatStore.setState({ showDeepSpaceProbes: false });
});

// ---------------------------------------------------------------------------
// 4. Body-domain filters — the derived `bodyFilter` label must stay coherent
// ---------------------------------------------------------------------------
TOTAL++;
test('setBodyFilter selects a canonical set for every known domain', () => {
  for (const id of ALL_BODY_IDS) {
    useSatStore.getState().setBodyFilter(id);
    const s = useSatStore.getState();
    assert.deepEqual([...s.bodyFilters], [id], `bodyFilter=${id} must select only that domain`);
    assert.equal(s.bodyFilter, id);
  }
  useSatStore.getState().setBodyFilter('all');
  assert.equal(useSatStore.getState().bodyFilters.size, ALL_BODY_IDS.length);
  assert.equal(useSatStore.getState().bodyFilter, 'all');
});

TOTAL++;
test('toggleBodyFilter derives all / custom / single labels', () => {
  useSatStore.getState().setAllBodyFilters(true);
  useSatStore.getState().toggleBodyFilter('earth');
  let s = useSatStore.getState();
  assert.equal(s.bodyFilters.size, 5);
  assert.equal(s.bodyFilter, 'custom', 'a partial selection is labelled custom');

  useSatStore.getState().setAllBodyFilters(false);
  useSatStore.getState().toggleBodyFilter('sun');
  s = useSatStore.getState();
  assert.deepEqual([...s.bodyFilters], ['sun']);
  assert.equal(s.bodyFilter, 'sun', 'a single remaining domain is labelled by its id');
});

TOTAL++;
test('setAllBodyFilters(true/false) selects or clears every domain', () => {
  useSatStore.getState().setAllBodyFilters(true);
  assert.equal(useSatStore.getState().bodyFilters.size, ALL_BODY_IDS.length);
  assert.equal(useSatStore.getState().bodyFilter, 'all');
  useSatStore.getState().setAllBodyFilters(false);
  assert.equal(useSatStore.getState().bodyFilters.size, 0);
  assert.equal(useSatStore.getState().bodyFilter, 'none');
});

// ---------------------------------------------------------------------------
// 5. Satellite list bookkeeping
// ---------------------------------------------------------------------------
TOTAL++;
test('setAllSatellites stores the list and its count together', () => {
  const sats = [{ id: 1 }, { id: 2 }, { id: 3 }];
  useSatStore.getState().setAllSatellites(sats);
  const s = useSatStore.getState();
  assert.equal(s.allSatellites.length, 3);
  assert.equal(s.satelliteCount, 3, 'satelliteCount must mirror the list length');
});

// ---------------------------------------------------------------------------
// 6. UI/panel toggles
// ---------------------------------------------------------------------------
TOTAL++;
test('panel and language toggles behave', () => {
  useSatStore.setState({ sidebarOpen: true, infoPanelOpen: true, hudMetricsOpen: false, language: 'en' });
  useSatStore.getState().toggleSidebarOpen();
  useSatStore.getState().toggleInfoPanelOpen();
  useSatStore.getState().toggleHudMetricsOpen();
  useSatStore.getState().setLanguage('ru');
  const s = useSatStore.getState();
  assert.equal(s.sidebarOpen, false);
  assert.equal(s.infoPanelOpen, false);
  assert.equal(s.hudMetricsOpen, true);
  assert.equal(s.language, 'ru');
});

// ---------------------------------------------------------------------------
// 7. Responsive & camera-input state
// ---------------------------------------------------------------------------
TOTAL++;
test('mouse sensitivity defaults to the shipped wheel-zoom speed and round-trips', () => {
  assert.equal(useSatStore.getState().mouseSensitivity, 1.0);
  useSatStore.getState().setMouseSensitivity(2.5);
  assert.equal(useSatStore.getState().mouseSensitivity, 2.5);
  useSatStore.getState().setMouseSensitivity(1.0);
});

TOTAL++;
test('selecting a satellite collapses the info panel on mobile only', () => {
  // Desktop preserves whatever collapsed/expanded state the user left the panel in.
  useSatStore.setState({ isMobile: false, infoPanelOpen: true, selectedSat: null });
  useSatStore.getState().setSelectedSat({ id: 42, name: 'X' });
  assert.equal(useSatStore.getState().infoPanelOpen, true, 'desktop must keep the panel state');

  // Mobile never pops the full panel open on its own — it arms the compact pill.
  useSatStore.setState({ isMobile: true, infoPanelOpen: true });
  useSatStore.getState().setSelectedSat({ id: 43, name: 'Y' });
  assert.equal(useSatStore.getState().infoPanelOpen, false, 'mobile must keep the panel collapsed');
  assert.equal(useSatStore.getState().selectedSat.id, 43);

  useSatStore.setState({ isMobile: false, selectedSat: null, infoPanelOpen: true });
});

console.log(`\nSatellite store tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
