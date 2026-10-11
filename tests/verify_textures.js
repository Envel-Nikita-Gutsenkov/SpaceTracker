import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { ORDERED_PLANET_KEYS } from '../src/utils/planetaryData.js';
import { TextureLODManager } from '../src/scene/planets/TextureLODManager.js';
import {
  fillGenericSurface, genericSeed,
  GENERIC_CANVAS_W, GENERIC_CANVAS_H,
} from '../src/scene/planets/proceduralSurface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// Minimal, dependency-free image dimension probe (JPEG SOF + PNG IHDR + WebP RIFF).
function imageSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // WebP: a RIFF container. "VP8X" (extended) writes 24-bit canvas dimensions, "VP8 "
  // (lossy) writes a 14-bit canvas in the frame header, "VP8L" (lossless) packs them.
  if (buf.length >= 30
    && buf.toString('ascii', 0, 4) === 'RIFF'
    && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourCC = buf.toString('ascii', 12, 16);
    if (fourCC === 'VP8X') {
      return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    }
    if (fourCC === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourCC === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      const isSOF = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      const len = buf.readUInt16BE(off + 2);
      off += 2 + len;
    }
  }
  return null;
}

function assetPath(url) {
  return path.join(PUBLIC, url.replace(/^\//, ''));
}

// Lower bound on a real map's payload. The maps are WebP now, which compresses the
// near-uniform bodies (Uranus is a featureless pale disc, ~13 KB) far better than JPEG
// did, so the floor only needs to catch a truncated or placeholder stub.
const MIN_MAP_BYTES = 8000;

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// Parse the real-map registry straight from the generator source so the test
// stays honest if the table and the assets ever drift apart.
// ---------------------------------------------------------------------------
const genSrc = readSource('src/scene/planets/PlanetTextureGenerator.js');
const mapsBlock = genSrc.match(/const REAL_MAPS = \{([\s\S]*?)\};/);
assert.ok(mapsBlock, 'REAL_MAPS table must exist in PlanetTextureGenerator.js');

const REAL_MAPS = {};
for (const m of mapsBlock[1].matchAll(/(\w+):\s*'([^']+)'/g)) {
  REAL_MAPS[m[1]] = m[2];
}

// Same idea for the streamed resolution tiers: parse TIERED_MAPS so the LOD table and the
// on-disk base/hi-res assets are checked together and cannot silently drift apart.
const tierBlock = genSrc.match(/const TIERED_MAPS = \{([\s\S]*?)\};/);
assert.ok(tierBlock, 'TIERED_MAPS table must exist in PlanetTextureGenerator.js');

const TIERED_MAPS = {};
for (const m of tierBlock[1].matchAll(/(\w+):\s*\{\s*base:\s*'([^']+)',\s*hires:\s*'([^']+)'/g)) {
  TIERED_MAPS[m[1]] = { base: m[2], hires: m[3] };
}

console.log('================================================================');
console.log(' PLANET TEXTURE ASSET VERIFICATION');
console.log(' Space Tracker 3D Simulation Platform');
console.log('================================================================\n');

test('Every planet except Earth is backed by a real surface map', () => {
  for (const key of ORDERED_PLANET_KEYS) {
    if (key === 'earth') continue; // Earth ships its own custom shader in Earth.js
    assert.ok(REAL_MAPS[key], `Planet "${key}" must reference a real equirectangular map`);
  }
});

test('Every referenced planet map exists on disk with a non-trivial payload', () => {
  for (const [key, url] of Object.entries(REAL_MAPS)) {
    const file = assetPath(url);
    assert.ok(fs.existsSync(file), `${key} map "${url}" must exist in public/`);
    const { size } = fs.statSync(file);
    assert.ok(size > MIN_MAP_BYTES, `${key} map "${url}" is suspiciously small (${size} bytes)`);
  }
});

test('Every planet map is an equirectangular image with a 2:1 aspect ratio', () => {
  for (const [key, url] of Object.entries(REAL_MAPS)) {
    const dims = imageSize(assetPath(url));
    assert.ok(dims, `${key} map "${url}" must be a readable JPEG/PNG/WebP`);
    const ratio = dims.width / dims.height;
    assert.ok(Math.abs(ratio - 2) < 0.02,
      `${key} map "${url}" must be 2:1 equirectangular, got ${dims.width}x${dims.height} (${ratio.toFixed(3)})`);
  }
});

test('Every planet map is at least 2K before filtering (>= 2048px wide)', () => {
  for (const [key, url] of Object.entries(REAL_MAPS)) {
    const dims = imageSize(assetPath(url));
    assert.ok(dims.width >= 2048,
      `${key} map "${url}" should be >= 2048px wide for crisp close-ups, got ${dims.width}`);
  }
});

test('Every streamed tier references an on-disk base and hi-res map', () => {
  assert.ok(Object.keys(TIERED_MAPS).length >= 8,
    'expected the tiered planets and dwarfs to be listed in TIERED_MAPS');
  for (const [key, tier] of Object.entries(TIERED_MAPS)) {
    for (const [kind, url] of [['base', tier.base], ['hires', tier.hires]]) {
      const file = assetPath(url);
      assert.ok(fs.existsSync(file), `${key} ${kind} map "${url}" must exist in public/`);
      assert.ok(fs.statSync(file).size > MIN_MAP_BYTES, `${key} ${kind} map "${url}" is suspiciously small`);
    }
  }
});

test('Every streamed tier is 2:1 equirectangular and makes hi-res at least 4K', () => {
  for (const [key, tier] of Object.entries(TIERED_MAPS)) {
    const base = imageSize(assetPath(tier.base));
    const hires = imageSize(assetPath(tier.hires));
    assert.ok(base && hires, `${key} tiers must be readable JPEG/PNG/WebP images`);
    for (const [kind, dims] of [['base', base], ['hires', hires]]) {
      const ratio = dims.width / dims.height;
      assert.ok(Math.abs(ratio - 2) < 0.02,
        `${key} ${kind} map must be 2:1 equirectangular, got ${dims.width}x${dims.height}`);
    }
    assert.ok(hires.width >= base.width && hires.width >= 4096,
      `${key} hi-res tier (${hires.width}px) must be >= its base (${base.width}px) and >= 4096px`);
  }
});

test('The fictional dwarf planets stream hi-res tiers', () => {
  for (const key of ['ceres', 'haumea', 'makemake', 'eris']) {
    assert.ok(TIERED_MAPS[key], `dwarf "${key}" must stream hi-res tiers, not a single fixed map`);
    assert.ok(imageSize(assetPath(TIERED_MAPS[key].hires)).width >= 4096,
      `dwarf "${key}" hi-res tier must be at least 4K`);
  }
});

test('Earth references the 8K day/night maps and every earth asset exists', () => {
  const earthSrc = readSource('src/scene/Earth.js');
  assert.match(earthSrc, /\/earth_day_8k\.webp/, 'Earth must upgrade its day map to the 8K image');
  assert.match(earthSrc, /\/earth_night_8k\.webp/, 'Earth must upgrade its night map to the 8K image');

  const urls = [...earthSrc.matchAll(/'\/(earth_[^']+\.(?:jpg|png|webp))'/g)].map(m => m[1]);
  assert.ok(urls.length >= 4, 'Earth must reference at least the day/night/spec/cloud maps');
  for (const url of new Set(urls)) {
    assert.ok(fs.existsSync(assetPath('/' + url)), `Earth asset "/${url}" must exist in public/`);
  }
});

test('Saturn ring alpha map is present', () => {
  const file = path.join(PUBLIC, 'saturn_ring_8k.png');
  assert.ok(fs.existsSync(file), 'saturn_ring_8k.png must exist in public/');
  const dims = imageSize(file);
  assert.ok(dims && dims.width > dims.height, 'ring alpha map must be a wide radial strip');
});

// ---------------------------------------------------------------------------
// Real planet maps must arrive as a *fresh* texture. Swapping the image in place
// on the live placeholder makes three.js take the texSubImage2D path against GPU
// storage allocated at the placeholder's (smaller) size, which overflows it
// (GL_INVALID_VALUE) and silently drops the real map.
// ---------------------------------------------------------------------------
test('Planet maps load as a fresh texture, never an in-place image swap', () => {
  const src = readSource('src/scene/planets/PlanetTextureGenerator.js');
  assert.match(src, /const placeholder = .*CanvasTexture/, 'must build a placeholder texture up front');
  assert.match(src, /const real = .*new THREE\.Texture\(\)/, 'the real map must be a fresh texture');
  assert.match(src, /onReady\(real\)/, 'the fresh real-map texture must be handed to the caller');
});

test('Planet mesh builder binds the fresh real-map texture to the material', () => {
  const src = readSource('src/scene/planets/PlanetMeshBuilder.js');
  assert.match(src, /getTexture\(planetId,\s*\(realTexture\)/, 'must request the real map via a callback');
  assert.match(src, /sphereMat\.map\s*=\s*realTexture/, 'must bind the real map onto the material');
});

test('Planet, Moon and Earth spheres all de-mirror their equirectangular maps', () => {
  // Standard east-positive equirectangular maps render east-west mirrored on THREE.SphereGeometry
  // unless the horizontal UV is flipped. All three bodies must use the shared helper.
  for (const rel of ['src/scene/planets/PlanetMeshBuilder.js', 'src/scene/Moon.js']) {
    const src = readSource(rel);
    assert.match(src, /applyEquirectLongitudeUV\s*\(\s*new THREE\.SphereGeometry/,
      `${rel} must build its sphere through applyEquirectLongitudeUV`);
  }
  const earth = readSource('src/scene/Earth.js');
  assert.match(earth, /applyEarthLongitudeUV\s*=\s*applyEquirectLongitudeUV/,
    'Earth must reuse the shared UV helper so every globe shares one convention');
});

// ---------------------------------------------------------------------------
// Distance-driven LOD tier selection (no DOM: the loader is guarded headless).
// ---------------------------------------------------------------------------
function fakeTexture() {
  const manager = new TextureLODManager();
  return manager.create([
    { url: '/base.jpg', distance: Infinity },
    { url: '/mid.jpg',  distance: 6.0 },
    { url: '/hi.jpg',   distance: 2.0 },
  ]);
}

// Every tier already decoded. Each tier owns its own texture (the per-tier model the
// loader now uses), so a swap is a pure reference change — the exact state right after
// a tier image has finished loading.
function readyLod(activeIndex = 0) {
  const lod = fakeTexture();
  lod.levels.forEach((level, i) => {
    if (!level.texture) level.texture = new THREE.Texture();
    level.texture.image = { id: i };
    level.status = 'ready';
  });
  lod.activeIndex = activeIndex;
  return lod;
}

test('LOD picks the finest tier whose distance covers the camera', () => {
  const lod = fakeTexture();
  assert.equal(lod._targetIndex(50), 0, 'far away must use the base tier');
  assert.equal(lod._targetIndex(6.0), 1, 'at the mid threshold must use the mid tier');
  assert.equal(lod._targetIndex(5.9), 1, 'just inside the threshold must use the mid tier');
  assert.equal(lod._targetIndex(2.0), 2, 'at the close threshold must use the finest tier');
  assert.equal(lod._targetIndex(0.5), 2, 'very close must use the finest tier');
});

test('LOD activates the finest ready tier when the camera closes in', () => {
  const lod = readyLod(0);

  lod.update(1.5);
  assert.equal(lod.activeIndex, 2, 'must activate the finest tier up close');
  assert.equal(lod.texture, lod.levels[2].texture, 'the bound texture must be the finest tier');
  assert.equal(lod.texture.image.id, 2, 'the bound texture must carry the finest pixels');
});

test('LOD downgrade applies hysteresis and releases finer tiers', () => {
  const lod = readyLod(2);

  lod.update(2.4); // active tier distance 2.0 * 1.25 = 2.5, still inside the hysteresis band
  assert.equal(lod.activeIndex, 2, 'must not downgrade inside the hysteresis band');

  lod.update(2.6); // clearly past the band
  assert.equal(lod.activeIndex, 1, 'must downgrade to the mid tier once past the band');
  assert.ok(lod.levels[2].texture, 'still inside the residency window, so not yet released');

  lod.update(9.0); // beyond the 2.0 * 4.0 = 8.0 residency window
  assert.equal(lod.levels[2].texture, null, 'the released finest tier must drop its GPU texture');
  assert.equal(lod.levels[2].status, 'idle', 'the released tier must be re-loadable');
});

test('LOD keeps a tier resident across the whole zoom range (no reload thrash)', () => {
  const lod = readyLod(2);

  // Zoom out past the hysteresis band, then straight back in — the finest tier must
  // never leave memory, so nothing is re-downloaded, re-decoded or re-uploaded.
  lod.update(2.6);
  lod.update(1.5);
  assert.equal(lod.activeIndex, 2, 'must reactivate the finest tier on the way back in');
  assert.equal(lod.levels[2].status, 'ready', 'the tier must still be resident, never released');
  assert.equal(lod.texture, lod.levels[2].texture, 'the resident texture must stay bound');
});

test('LOD never releases the active or base tier', () => {
  const lod = readyLod(2);
  lod.update(50.0);
  assert.equal(lod.activeIndex, 0, 'must fall back to the base tier when far away');
  assert.ok(lod.levels[0].texture, 'the base tier must always stay resident');
  assert.equal(lod.texture, lod.levels[0].texture, 'the base texture must stay bound');
});

test('LOD with eviction disabled keeps every tier resident', () => {
  const lod = new TextureLODManager().create([
    { url: '/base.jpg', distance: Infinity },
    { url: '/mid.jpg',  distance: 6.0 },
    { url: '/hi.jpg',   distance: 2.0 },
  ], { evict: Infinity });
  lod.levels.forEach((level, i) => {
    if (!level.texture) level.texture = new THREE.Texture();
    level.texture.image = { id: i };
    level.status = 'ready';
  });
  lod.activeIndex = 0;
  lod.update(1e6);
  assert.equal(lod.levels[2].status, 'ready', 'a loaded tier must survive any distance');
  assert.ok(lod.levels[2].texture, 'the tier texture must be kept resident');
});

test('Earth preloads its 8K tiers and never evicts them', () => {
  const src = readSource('src/scene/Earth.js');
  assert.match(src, /preload:\s*true/, 'Earth must preload the 8K tiers at startup');
  assert.match(src, /evict:\s*Infinity/, 'Earth must never evict the 8K tiers (no mid-zoom upload)');
});

test('planet and dwarf tiers stay resident once fetched (no reload on every approach)', () => {
  // Lazily streamed (no boot preload) but never evicted: releasing a fetched tier on zoom-out
  // made the next approach re-download, re-decode and synchronously re-upload the map — the
  // hard freeze on every return to a body. `evict: Infinity` turns later approaches into swaps.
  const builder = readSource('src/scene/planets/PlanetMeshBuilder.js');
  assert.match(builder, /lodManager\.create\(lodTiers,\s*PLANET_LOD_OPTIONS\)/,
    'planet LODs must be created with the shared resident options');
  const gen = readSource('src/scene/planets/PlanetTextureGenerator.js');
  assert.match(gen, /PLANET_LOD_OPTIONS\s*=\s*\{\s*evict:\s*Infinity\s*\}/,
    'planet tiers must be kept resident so zoom-out never evicts and zoom-in never re-uploads');
});

test('lazy procedural surfaces are synthesised off the main thread', () => {
  // The generic fallback canvas is ~200 ms of fractal maths per body. Built inline in the render
  // loop it froze the app for seconds when a group of bodies was revealed at once. It must run in
  // the surface worker instead, with the shared placeholder bound until the result arrives.
  const gen = readSource('src/scene/planets/PlanetTextureGenerator.js');
  assert.match(gen, /surface\.worker\.js/, 'the generic canvas must be built in a worker');
  assert.match(gen, /getGenericTextureAsync/, 'the generator must expose the async lazy path');
  const builder = readSource('src/scene/planets/PlanetMeshBuilder.js');
  assert.match(builder, /getGenericTextureAsync/, 'the lazy ensureTexture must use the off-thread path');
  const worker = readSource('src/workers/surface.worker.js');
  assert.match(worker, /fillGenericSurface/, 'the worker must run the shared, DOM-free maths');
});

test('the generic surface fill is pure, deterministic and seed-stable', () => {
  const n = GENERIC_CANVAS_W * GENERIC_CANVAS_H * 4;
  const a = new Uint8ClampedArray(n);
  const b = new Uint8ClampedArray(n);
  const c = new Uint8ClampedArray(n);
  fillGenericSurface(a, GENERIC_CANVAS_W, GENERIC_CANVAS_H, 200, 180, 160, 42);
  fillGenericSurface(b, GENERIC_CANVAS_W, GENERIC_CANVAS_H, 200, 180, 160, 42);
  fillGenericSurface(c, GENERIC_CANVAS_W, GENERIC_CANVAS_H, 200, 180, 160, 43);
  assert.deepEqual(Array.from(a), Array.from(b), 'same inputs must give identical pixels');
  assert.notDeepEqual(Array.from(a), Array.from(c), 'a different seed must give a different surface');
  for (let i = 3; i < a.length; i += 4) assert.equal(a[i], 255, 'every pixel must be fully opaque');
  assert.equal(genericSeed('mimas'), genericSeed('mimas'), 'a body id must map to a stable seed');
  assert.notEqual(genericSeed('mimas'), genericSeed('tethys'), 'different bodies must differ');
});

// ---------------------------------------------------------------------------
// Depth-buffer encoding consistency.
//
// SceneManager enables a logarithmic depth buffer, so three.js defines
// USE_LOGDEPTHBUF for *every* program and every built-in material (planets,
// orbit lines, sprites, spacecraft models) writes logarithmic gl_FragDepth. A
// custom ShaderMaterial that omits the log-depth chunks instead writes *linear*
// depth, so the two encodings get compared against each other and far objects
// bleed straight through the Earth. Every custom shader must include the chunks.
// ---------------------------------------------------------------------------
test('Every custom ShaderMaterial writes logarithmic depth (no see-through Earth)', () => {
  const sceneSrc = readSource('src/scene/SceneManager.js');
  assert.match(sceneSrc, /logarithmicDepthBuffer:\s*true/,
    'this guard only applies while the renderer uses a logarithmic depth buffer');

  const sceneDir = path.join(ROOT, 'src', 'scene');
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  })(sceneDir);

  const required = [
    '<common>',
    '<logdepthbuf_pars_vertex>',
    '<logdepthbuf_vertex>',
    '<logdepthbuf_pars_fragment>',
    '<logdepthbuf_fragment>',
  ];

  let checked = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('new THREE.ShaderMaterial')) continue;
    checked++;
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    for (const chunk of required) {
      assert.ok(src.includes(`#include ${chunk}`),
        `${rel} defines a ShaderMaterial but is missing "#include ${chunk}" — ` +
        'its depth encoding would not match the rest of the scene');
    }
  }
  assert.ok(checked >= 5, `expected several custom ShaderMaterials, found ${checked}`);
});

console.log('\n================================================================');
console.log(` ALL TEXTURE VERIFICATION TESTS PASSED: ${passed}/${total}`);
console.log('================================================================\n');
