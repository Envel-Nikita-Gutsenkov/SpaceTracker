import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SPACECRAFT_3D_REGISTRY,
  SPACECRAFT_CATEGORY_MODELS,
  resolveCategoryModel,
  computeModelScale,
  computeFocusDistances,
  computeOverlayDepthRange,
  PROCEDURAL_SPAN_UNITS,
  FACING_VECTORS,
  EARTH_RADIUS_M,
} from '../src/scene/spacecraftModels.js';
import { detectCategory } from '../src/utils/categories.js';
import { SOLAR_SATS, LUNAR_SATS } from '../src/utils/celestialFleet.js';
import { DEEP_SPACE_PROBES } from '../src/utils/deepSpaceProbes.js';
import { PLANETARY_ORBITERS } from '../src/utils/planetaryFleet.js';

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

const PUBLIC = path.resolve('public');
const MAX_TOTAL_BYTES = 40 * 1024 * 1024; // keep the shipped model set lean

console.log('================================================================');
console.log(' SPACECRAFT 3D MODEL REGISTRY / SCALING TEST SUITE');
console.log('================================================================\n');

console.log('SUITE 1: Scale math');

test('computeModelScale fits the raw bbox into the physical size', () => {
  // A 100 m satellite exported as a 50-unit-wide model:
  // target units = 100 / 6371000, scale = target / 50
  const s = computeModelScale(50, 100);
  assert.ok(Math.abs(s - (100 / EARTH_RADIUS_M) / 50) < 1e-18);
  assert.ok(Math.abs(s * 50 - 100 / EARTH_RADIUS_M) < 1e-18);
});

test('computeModelScale reproduces the legacy ISS scale', () => {
  // iss.glb raw largest dimension ~14.39 units; real truss span 109 m.
  const s = computeModelScale(14.39, 109);
  assert.ok(Math.abs(s - 0.000001189) < 1e-8, `got ${s}`);
});

test('computeModelScale returns 1 for degenerate inputs', () => {
  assert.equal(computeModelScale(0, 100), 1);
  assert.equal(computeModelScale(50, 0), 1);
  assert.equal(computeModelScale(NaN, 100), 1);
});

console.log('\nSUITE 1b: Focus framing distances');

test('focus stand-off and zoom-scale with the real body size', () => {
  const mms = computeFocusDistances(3.5);   // tiny Magnetospheric Multiscale bus
  const iss = computeFocusDistances(109);   // ISS truss span
  assert.ok(iss.standoff > mms.standoff * 10,
    'a 109 m ISS must be framed far wider than a 3.5 m MMS');
  assert.ok(Math.abs(mms.standoff - (3.5 / EARTH_RADIUS_M) * 2) < 1e-18);
});

test('near < minDistance < standoff, and full zoom never clips the hull', () => {
  for (const size of [2.5, 3.5, 12, 109, 500]) {
    const { standoff, minDistance, near } = computeFocusDistances(size);
    assert.ok(near > 0 && near < minDistance, `near ${near} must be below minDistance ${minDistance}`);
    assert.ok(minDistance < standoff, `minDistance ${minDistance} must be below standoff ${standoff}`);
    // At the closest zoom the near plane must still sit in front of the nearest hull face.
    const nearestHullFace = minDistance - (size / EARTH_RADIUS_M) / 2;
    assert.ok(near < nearestHullFace, `near ${near} clips into hull face ${nearestHullFace}`);
  }
});

test('unknown or degenerate sizes fall back to the procedural span', () => {
  for (const size of [undefined, 0, -1, NaN]) {
    const { sizeUnits, standoff } = computeFocusDistances(size);
    assert.equal(sizeUnits, PROCEDURAL_SPAN_UNITS);
    assert.ok(standoff > 0);
  }
});

console.log('\nSUITE 1c: Overlay depth range');

// Fragment spread across the hull per depth-buffer unit: in the log buffer a small view
// distance makes gl_FragDepth grow ~linearly, so this is d(fragDepth)/dw * span.
function hullDepthSpread(near, far, span) {
  const fc = 2 / Math.log2(far + 1); // logDepthBufFC used by three.js
  return (1 / Math.LN2) * fc * 0.5 * span;
}
const DEPTH_QUANTUM = 1 / 2 ** 24;

test('overlay near/far bracket the hull and restore thousands of depth quanta', () => {
  for (const size of [2.5, 3.5, 12, 109]) {
    const span = size / EARTH_RADIUS_M;
    const camDist = span * 2; // the framing stand-off
    const { near, far } = computeOverlayDepthRange(camDist, span);
    const half = span / 2;
    assert.ok(near > 0 && far > near, `bad range ${near}..${far}`);
    assert.ok(near <= camDist - half, 'near must not clip the hull front');
    assert.ok(far >= camDist + half, 'far must include the hull back');
    const spread = hullDepthSpread(near, far, span);
    assert.ok(spread > 100 * DEPTH_QUANTUM, `hull spread ${spread} is too small`);
  }
});

test('overlay pass beats the global log-depth buffer by orders of magnitude', () => {
  const span = 3.5 / EARTH_RADIUS_M; // tiny MMS bus, the worst case
  const camDist = span * 2;
  const spreadGlobal = hullDepthSpread(0.01, 1e7, span); // global camera near/far
  const { near, far } = computeOverlayDepthRange(camDist, span);
  const spreadOverlay = hullDepthSpread(near, far, span);
  // Sanity: the global buffer really does collapse the hull below one quantum...
  assert.ok(spreadGlobal < DEPTH_QUANTUM, `global spread ${spreadGlobal} unexpectedly fine`);
  // ...and the overlay recovers a comfortable margin.
  assert.ok(spreadOverlay > spreadGlobal * 1000);
});

test('overlay depth range handles degenerate inputs', () => {
  for (const [d, s] of [[0, 0], [-1, -1], [NaN, NaN], [0, 1e-6]]) {
    const { near, far } = computeOverlayDepthRange(d, s);
    assert.ok(near > 0 && far > near, `bad range for (${d}, ${s}): ${near}..${far}`);
  }
});

console.log('\nSUITE 2: Registry integrity');

const entries = Object.entries(SPACECRAFT_3D_REGISTRY);
assert.ok(entries.length > 0, 'registry must not be empty');

test('every entry has a url, a positive physical size and a valid facing', () => {
  for (const [id, cfg] of entries) {
    assert.ok(cfg.url && cfg.url.startsWith('/models/'), `id ${id} missing url`);
    assert.ok(cfg.physicalSizeMeters > 0 || cfg.scale > 0, `id ${id} needs size or explicit scale`);
    const facing = cfg.facing || '+z';
    assert.ok(FACING_VECTORS[facing], `id ${id} has invalid facing "${facing}"`);
  }
});

test('every registered model file exists in public/', () => {
  const urls = new Set(entries.map(([, c]) => c.url));
  for (const url of urls) {
    const file = path.join(PUBLIC, url.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `missing model file: ${url}`);
  }
});

test('every constellation member resolves to a shared model', () => {
  const families = {
    'MMS 1-4': [40482, 40483, 40484, 40485],
    'THEMIS A/D/E': [30580, 30797, 30798],
    'GRACE-FO 1-2': [43476, 43477],
    'Jason-2/3': [33105, 41240],
    'Landsat 8-9': [39084, 49260],
    'Suomi NPP / NOAA-20 / NOAA-21': [37849, 43013, 54234],
    'TDRS 8-13': [26388, 27389, 27566, 39070, 39504, 42915],
  };
  for (const [name, ids] of Object.entries(families)) {
    const urls = new Set(ids.map((id) => SPACECRAFT_3D_REGISTRY[id]?.url));
    assert.equal(urls.size, 1, `${name} must all share exactly one model`);
    assert.ok([...urls][0], `${name} missing registry entry`);
  }
});

test('shipped model set stays within the size budget', () => {
  const urls = new Set(entries.map(([, c]) => c.url));
  for (const cfg of Object.values(SPACECRAFT_CATEGORY_MODELS)) urls.add(cfg.url);
  let total = 0;
  for (const url of urls) {
    total += fs.statSync(path.join(PUBLIC, url.replace(/^\//, ''))).size;
  }
  console.log(`         total model payload: ${(total / 1024 / 1024).toFixed(2)} MB (${urls.size} files)`);
  assert.ok(total <= MAX_TOTAL_BYTES, `model payload ${(total / 1024 / 1024).toFixed(2)} MB exceeds budget`);
});

console.log('\nSUITE 3: GLB extension compatibility');

/** Read the JSON chunk of a .glb container and return its parsed glTF object. */
function readGlbJson(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${file}: bad GLB magic`);
  let offset = 12;
  while (offset < buf.length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(buf.subarray(dataStart, dataStart + chunkLen).toString('utf8'));
    }
    offset = dataStart + chunkLen;
  }
  throw new Error(`${file}: no JSON chunk found`);
}

// Extensions GLTFLoader r167 resolves natively, plus Draco which we wire up ourselves.
const SUPPORTED_REQUIRED_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'KHR_mesh_quantization',
  'KHR_materials_specular',
  'KHR_texture_transform',
  'EXT_meshopt_compression',
]);

test('every model only requires extensions the loader can decode', () => {
  const urls = new Set(entries.map(([, c]) => c.url));
  for (const url of urls) {
    const gltf = readGlbJson(path.join(PUBLIC, url.replace(/^\//, '')));
    for (const ext of gltf.extensionsRequired || []) {
      assert.ok(SUPPORTED_REQUIRED_EXTENSIONS.has(ext), `${url} requires unsupported extension ${ext}`);
    }
  }
});

test('the Draco decoder is shipped for models that require it', () => {
  const urls = new Set(entries.map(([, c]) => c.url));
  let needsDraco = false;
  for (const url of urls) {
    const gltf = readGlbJson(path.join(PUBLIC, url.replace(/^\//, '')));
    if ((gltf.extensionsRequired || []).includes('KHR_draco_mesh_compression')) needsDraco = true;
  }
  if (!needsDraco) return;
  for (const file of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
    assert.ok(fs.existsSync(path.join(PUBLIC, 'draco', file)), `missing Draco decoder file: public/draco/${file}`);
  }
});

console.log('\nSUITE 3b: Spacecraft render settings');

test('loaded models render double-sided and are never frustum-culled', () => {
  const src = fs.readFileSync(path.resolve('src/scene/SatelliteModel.js'), 'utf8');
  // mms.glb ships no material, so glTF falls back to an opaque FrontSide material and
  // thin panels/dishes vanish from behind as the camera orbits — force DoubleSide.
  assert.match(src, /side:\s*THREE\.DoubleSide/, 'fallback materials must be double-sided');
  assert.match(src, /\.side\s*=\s*THREE\.DoubleSide/, 'existing glTF materials must be set double-sided too');
  assert.match(src, /frustumCulled\s*=\s*false/, 'tiny scaled sub-meshes must not be frustum-culled');
  // Authored glTF normals must be preserved; only compute them when missing.
  assert.match(src, /!node\.geometry\.attributes\.normal/, 'authored normals must be preserved');
});

test('the focused hull renders in a dedicated tight-depth pass', () => {
  const src = fs.readFileSync(path.resolve('src/scene/SatelliteModel.js'), 'utf8');
  // The global log-depth buffer collapses a ~1e-6 hull to sub-quantum precision, so the
  // model must be re-drawn on its own layer with near/far bracketing just that hull.
  assert.match(src, /onAfterRender/, 'must hook the post-render pass');
  assert.match(src, /clearDepth\(\)/, 'overlay pass must clear depth before drawing');
  assert.match(src, /layers\.set\(MODEL_LAYER\)/, 'hull must live on its own render layer');
  assert.match(src, /computeOverlayDepthRange/, 'must use the tight depth-range helper');
});

console.log('\nSUITE 3c: Deep-space probe models');

test('every deep-space probe ships a real GLB keyed by its NORAD id', () => {
  for (const probe of DEEP_SPACE_PROBES) {
    const cfg = SPACECRAFT_3D_REGISTRY[probe.noradId];
    assert.ok(cfg, `${probe.name} (NORAD ${probe.noradId}) has no 3D model registration`);
    assert.ok(cfg.url.startsWith('/models/'), `${probe.name} bad url ${cfg.url}`);
    assert.ok(cfg.physicalSizeMeters > 0, `${probe.name} needs a positive physical size`);
    const file = path.join(PUBLIC, cfg.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `${probe.name} model file missing: ${cfg.url}`);
  }
});

test('deep-space probes and orbiters render through the shared close-up model pass', () => {
  const fleet = fs.readFileSync(path.resolve('src/scene/DeepSpaceFleet.js'), 'utf8');
  // The fleet owns only markers + trails now; the real hull is drawn by SatelliteModel
  // so it gets the tight-depth overlay pass (tiny heliocentric hulls would z-fight).
  assert.doesNotMatch(fleet, /createDeepSpaceProbeMesh/, 'fleet must not build a procedural probe mesh');
  const mgr = fs.readFileSync(path.resolve('src/scene/SceneManager.js'), 'utf8');
  // Every selectable object now routes through the shared close-up pass, so there must be
  // no leftover branch that blanks the model for a particular fleet.
  assert.doesNotMatch(mgr, /isPlanetary\)\s*\{\s*this\.satModel\.update\(null\)/s,
    'no fleet may suppress the shared close-up model');
  assert.match(mgr, /this\.satModel\.update\(satPos, sunDir, this\.camera, store\.showSat3DModel, sel\)/,
    'the selected object must render through the shared close-up pass');
});

test('interstellar probe markers are gated behind the deep-space display toggle', () => {
  const fleet = fs.readFileSync(path.resolve('src/scene/DeepSpaceFleet.js'), 'utf8');
  // The stray screen-space markers must not appear on their own: they only reveal when the
  // user enables the layer (or explicitly selects a probe).
  assert.match(fleet, /showProbes = false/, 'the fleet must accept a display gate defaulting to off');
  assert.match(fleet, /showProbes && camDistFromEarth >= REVEAL_FROM_EARTH_UNITS/,
    'revealing the markers must require the display toggle');
  const mgr = fs.readFileSync(path.resolve('src/scene/SceneManager.js'), 'utf8');
  assert.match(mgr, /this\.deepSpace\.update\(date, sunPos, this\.camera, selectedSatId, showAllOrbits, Boolean\(store\.showDeepSpaceProbes\)\)/,
    'SceneManager must pass the deep-space display toggle to the fleet');
});

test('every planetary orbiter with a shipped model is keyed by its NORAD id', () => {
  // Mars orbiters (MRO, Odyssey) and Juno are the ones NASA publishes a GLB for; the rest
  // stay procedural. A stale id would silently drop the real model.
  const modelled = [
    ['mro', 29601],
    ['mars-odyssey', 26855],
    ['juno', 37773],
  ];
  for (const [id, noradId] of modelled) {
    const sat = PLANETARY_ORBITERS.find((s) => s.id === id);
    assert.ok(sat, `planetary fleet is missing ${id}`);
    assert.equal(sat.noradId, noradId, `${id} has an unexpected NORAD id ${sat.noradId}`);
    const cfg = SPACECRAFT_3D_REGISTRY[sat.noradId];
    assert.ok(cfg, `${sat.name} (NORAD ${sat.noradId}) has no 3D model registration`);
    assert.ok(cfg.url.startsWith('/models/'), `${sat.name} bad url ${cfg.url}`);
    assert.ok(cfg.physicalSizeMeters > 0, `${sat.name} needs a positive physical size`);
    const file = path.join(PUBLIC, cfg.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `${sat.name} model file missing: ${cfg.url}`);
  }
});

test('SatelliteModel resolves a model by string id OR NORAD id', () => {
  const src = fs.readFileSync(path.resolve('src/scene/SatelliteModel.js'), 'utf8');
  // Fleet objects carry string ids while the registry is keyed by NORAD number, so the
  // lookup must fall back to noradId or orbiters/probes silently render the procedural bus.
  assert.match(src, /SPACECRAFT_3D_REGISTRY\[satId\]/, 'must look up the model by id first');
  assert.match(src, /SPACECRAFT_3D_REGISTRY\[selectedSat\.noradId\]/, 'must fall back to noradId');
  // Async swap-in must compare the resolved config url, not the raw id, or a fleet GLB that
  // finishes streaming while focused never replaces the placeholder bus.
  assert.match(src, /this\.activeConfig\.url === config\.url/, 'async swap-in must compare the resolved url');
});

console.log('\nSUITE 3d: Category default models');

test('every category model has a url, a positive size and a valid facing', () => {
  for (const [id, cfg] of Object.entries(SPACECRAFT_CATEGORY_MODELS)) {
    assert.ok(cfg.url && cfg.url.startsWith('/models/'), `category ${id} missing url`);
    assert.ok(cfg.physicalSizeMeters > 0 || cfg.scale > 0, `category ${id} needs size or explicit scale`);
    const facing = cfg.facing || '+z';
    assert.ok(FACING_VECTORS[facing], `category ${id} has invalid facing "${facing}"`);
  }
});

test('every category model file exists in public/', () => {
  for (const [id, cfg] of Object.entries(SPACECRAFT_CATEGORY_MODELS)) {
    const file = path.join(PUBLIC, cfg.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `missing category model file for ${id}: ${cfg.url}`);
  }
});

test('each navigation category ships a chassis sized to its real array span', () => {
  const expectedSpans = { glonass: 7.8, galileo: 18.7 };
  for (const [id, span] of Object.entries(expectedSpans)) {
    const cfg = SPACECRAFT_CATEGORY_MODELS[id];
    assert.ok(cfg, `${id} must have a default model`);
    assert.equal(cfg.physicalSizeMeters, span, `${id} model must be sized to the real array span`);
    const gltf = readGlbJson(path.join(PUBLIC, cfg.url.replace(/^\//, '')));
    let minX = Infinity, maxX = -Infinity;
    for (const mesh of gltf.meshes) {
      const acc = gltf.accessors[mesh.primitives[0].attributes.POSITION];
      minX = Math.min(minX, acc.min[0]);
      maxX = Math.max(maxX, acc.max[0]);
    }
    const spanX = maxX - minX;
    assert.ok(Math.abs(spanX - span) < 1e-3, `${id} model X span ${spanX} must equal the ${span} m array span`);
  }
});

test('SatelliteModel falls back to a category default model last', () => {
  const src = fs.readFileSync(path.resolve('src/scene/SatelliteModel.js'), 'utf8');
  assert.match(src, /resolveCategoryModel\(selectedSat\?\.category, selectedSat\?\.name\)/, 'must resolve a category default model by category or name');
});

test('a navigation satellite mislabelled by a failed group fetch still gets its model', () => {
  // The `sarsat` MEOSAR group carries the whole Galileo constellation. If the `galileo`
  // group request fails (CelesTrak rate-limits), dedup first-seen-wins labels every
  // Galileo satellite `other` — so the resolver must also match on the name.
  assert.equal(detectCategory('sarsat', 'GSAT0204 (GALILEO 8)'), 'galileo', 'Galileo name must map to the galileo category');
  assert.equal(resolveCategoryModel('other', 'GSAT0204 (GALILEO 8)')?.url, '/models/galileo.glb',
    'a Galileo satellite labelled `other` must still resolve its chassis model');
  assert.equal(resolveCategoryModel(undefined, 'GSAT0102 (GALILEO-FM2)')?.url, '/models/galileo.glb',
    'a category-less Galileo satellite must still resolve its chassis model');
  // A category that is present always wins over the name heuristic.
  assert.equal(resolveCategoryModel('glonass', 'GSAT0204 (GALILEO 8)')?.url, '/models/glonass.glb',
    'an explicit category must take precedence over the name');
  // Indian GSAT telecom satellites are not Galileo and must stay on the procedural bus.
  assert.equal(detectCategory('geo', 'GSAT-17'), 'geo', 'GSAT-17 is not Galileo');
  assert.equal(resolveCategoryModel('other', 'GSAT-17'), undefined, 'GSAT-17 must not resolve a navigation model');
});

console.log('\nSUITE 4: Celestial fleet identity');

test('synthetic fleet ids are unique (no id collisions that shadow a model)', () => {
  const fleet = [...SOLAR_SATS, ...LUNAR_SATS];
  const ids = fleet.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate celestial-fleet id: ${ids.join(', ')}`);
  for (const s of fleet) {
    assert.equal(s.id, s.noradId, `${s.name} has id !== noradId`);
  }
});

test('celestial-fleet objects that ship a model are keyed by their own id', () => {
  // LRO/STEREO-A/Parker are the fleet objects with a dedicated GLB; a stale id here
  // would silently drop the model (the exact bug this suite guards against).
  for (const name of ['LRO (Lunar Reconnaissance Orbiter)', 'STEREO-A (Solar Observatory)', 'Parker Solar Probe']) {
    const sat = [...SOLAR_SATS, ...LUNAR_SATS].find((s) => s.name === name);
    assert.ok(sat, `celestial fleet is missing ${name}`);
    assert.ok(SPACECRAFT_3D_REGISTRY[sat.id], `${name} (id ${sat.id}) has no 3D model registration`);
  }
});

console.log('\n================================================================');
console.log(` Model registry tests: ${passed}/${passed + failed} passed`);
console.log('================================================================');

if (failed > 0) process.exit(1);
