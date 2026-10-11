import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextureReadiness, textureReadiness, BOOT_TEXTURE_TIMEOUT_MS } from '../src/scene/textureReadiness.js';
import { TextureLODManager } from '../src/scene/planets/TextureLODManager.js';
import { uploadTextureNow, setUploadRenderer } from '../src/scene/textureUpload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.stack || err.message}`);
    throw err;
  }
}

// A DOM-free stand-in for HTMLImageElement: assigning `src` schedules an async onload and there
// is no decode(), so the loader takes its synchronous commit path.
class MockImage {
  constructor() {
    this.crossOrigin = null;
    this.onload = null;
    this.onerror = null;
    this._src = '';
  }
  set src(value) {
    this._src = value;
    queueMicrotask(() => { if (this.onload) this.onload(); });
  }
  get src() { return this._src; }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

console.log('================================================================');
console.log(' BOOT TEXTURE READINESS VERIFICATION');
console.log('================================================================\n');

await test('a fresh tracker resolves once every tracked texture settles', async () => {
  const tracker = new TextureReadiness();
  let releaseA;
  let releaseB;
  tracker.track(new Promise((r) => { releaseA = r; }));
  tracker.track(new Promise((r) => { releaseB = r; }));
  assert.equal(tracker.pendingCount, 2, 'both textures must be pending');

  let resolved = false;
  const gate = tracker.whenReady(5000).then(() => { resolved = true; });

  await tick();
  assert.equal(resolved, false, 'the gate must stay closed while textures are pending');

  releaseA();
  await tick();
  assert.equal(resolved, false, 'one texture left must still hold the gate closed');

  releaseB();
  await gate;
  assert.equal(resolved, true, 'the gate must open once all textures settle');
  assert.equal(tracker.pendingCount, 0, 'nothing may remain pending');
});

await test('a rejected texture never traps the gate', async () => {
  const tracker = new TextureReadiness();
  tracker.track(Promise.reject(new Error('404')));
  tracker.track(Promise.resolve());

  await tracker.whenReady(5000); // must resolve, not reject/hang
  assert.equal(tracker.pendingCount, 0, 'a failed load must still drain the gate');
});

await test('progress reflects the settled fraction of tracked textures', async () => {
  const tracker = new TextureReadiness();
  assert.equal(tracker.progress, 1, 'an empty tracker is fully ready');

  let release;
  tracker.track(Promise.resolve());
  tracker.track(new Promise((r) => { release = r; }));
  await tick(); // let the already-resolved load settle
  assert.equal(tracker.progress, 0.5, 'one of two settled must read 50%');

  release();
  await tracker.whenReady(5000);
  assert.equal(tracker.progress, 1, 'a drained tracker reads 100%');
});

await test('a hung texture is released by the safety timeout', async () => {
  const tracker = new TextureReadiness();
  tracker.track(new Promise(() => {})); // never settles
  const t0 = Date.now();
  await tracker.whenReady(50);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 40, `the timeout must be honoured, waited ${elapsed}ms`);
  assert.equal(tracker.pendingCount, 1, 'the hung load is still pending, but the gate opened');
});

await test('the default boot timeout is a bounded, sane value', () => {
  assert.ok(Number.isFinite(BOOT_TEXTURE_TIMEOUT_MS) && BOOT_TEXTURE_TIMEOUT_MS > 0,
    'the default timeout must be finite and positive');
  assert.ok(BOOT_TEXTURE_TIMEOUT_MS <= 30000, 'the default timeout must not strand the user too long');
});

// ---------------------------------------------------------------------------
// Loader integration (mocked Image; no DOM).
// ---------------------------------------------------------------------------
const savedImage = globalThis.Image;

try {
  globalThis.Image = MockImage;

  await test('a preloaded LodTexture gates boot and uploads every tier', async () => {
    const initCalls = [];
    const manager = new TextureLODManager({ initTexture: () => initCalls.push(1) });
    const lod = manager.create([
      { url: '/base.jpg', distance: Infinity },
      { url: '/mid.jpg',  distance: 6.0 },
      { url: '/hi.jpg',   distance: 2.0 },
    ], { preload: true, evict: Infinity }); // mirrors Earth: preloaded tiers stay resident

    assert.ok(lod.levels.every(l => l.status === 'loading'),
      'every preloaded tier must start loading synchronously at construction');

    await textureReadiness.whenReady(2000);

    assert.ok(lod.levels.every(l => l.status === 'ready'), 'every preloaded tier must decode');
    assert.equal(initCalls.length, 3, 'each tier must pay its GPU upload during boot, not mid-zoom');
    assert.equal(textureReadiness.pendingCount, 0, 'the boot gate must drain');
  });

  await test('gateBoot:false keeps a lazily-fetched map off the boot gate', async () => {
    const before = textureReadiness.pendingCount;
    const lod = new TextureLODManager(null).create([{ url: '/live.jpg' }], { gateBoot: false });
    assert.equal(textureReadiness.pendingCount, before,
      'a non-gating load must not extend the boot gate');
    await tick();
    assert.equal(lod.levels[0].status, 'ready', 'the lazy map must still load normally');
  });

  // Count how many times a tier is asked to fetch *fresh* (idle/error), i.e. an actual download.
  function countRefetches(lod) {
    const state = { n: 0 };
    const orig = lod._request.bind(lod);
    lod._request = (i) => {
      const lvl = lod.levels[i];
      if (lvl && (lvl.status === 'idle' || lvl.status === 'error')) state.n += 1;
      return orig(i);
    };
    return state;
  }

  await test('a resident (evict: Infinity) tier is never re-fetched across zoom cycles', async () => {
    const lod = new TextureLODManager(null).create([
      { url: '/base.jpg', distance: Infinity },
      { url: '/hi.jpg',   distance: 2.5 },
    ], { preload: true, evict: Infinity });
    await textureReadiness.whenReady(2000);

    const refetches = countRefetches(lod);
    for (const d of [3.2, 12, 60, 12, 3.2, 2.0, 40, 3.2]) lod.update(d);

    assert.equal(refetches.n, 0, 'a resident tier must never be re-fetched when the camera moves');
    assert.ok(lod.levels.every(l => l.status === 'ready'), 'every tier must stay resident');
  });

  await test('default eviction re-fetches a released tier (the zoom freeze we fixed)', async () => {
    // Guards the fix: without evict: Infinity the hires tier is released on zoom-out and
    // re-downloaded on zoom-in — the hard freeze this change eliminates.
    const lod = new TextureLODManager(null).create([
      { url: '/base.jpg', distance: Infinity },
      { url: '/hi.jpg',   distance: 2.5 },
    ], { preload: true }); // default evict: 4.0
    await textureReadiness.whenReady(2000);

    const refetches = countRefetches(lod);
    lod.update(60);  // far beyond 2.5 * 4.0 = 10, so the hires tier is released
    lod.update(2.0); // zoom back in — must re-fetch

    assert.ok(refetches.n > 0, 'a released tier is re-fetched on the way back in (the freeze)');
  });
} finally {
  globalThis.Image = savedImage;
}

await test('headless (no Image) the loader resolves immediately and never hangs', async () => {
  const saved = globalThis.Image;
  delete globalThis.Image;
  try {
    const lod = new TextureLODManager(null).create([{ url: '/x.jpg' }], {});
    const promise = lod._request(0);
    assert.ok(promise && typeof promise.then === 'function', '_request must return a promise');
    await promise;
    assert.equal(lod.levels[0].status, 'idle', 'headless loader leaves the tier untouched');
  } finally {
    globalThis.Image = saved;
  }
});

// ---------------------------------------------------------------------------
// Source wiring: the overlay must actually be gated on texture readiness.
// ---------------------------------------------------------------------------
await test('App awaits texture readiness before hiding the overlay', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
  assert.match(src, /await scene\.whenTexturesReady\(\)/,
    'App must await scene.whenTexturesReady() before clearing the loading overlay');
  assert.match(src, /Preparing textures/,
    'App must surface the texture-preparation phase to the user');
});

await test('SceneManager exposes the readiness gate and progress', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'scene', 'SceneManager.js'), 'utf8');
  assert.match(src, /whenTexturesReady\s*\(/, 'SceneManager must expose whenTexturesReady()');
  assert.match(src, /textureProgress/, 'SceneManager must expose texture progress for the bar');
});

await test('the streamed live cloud map is preloaded, resident and off the boot gate', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'scene', 'Earth.js'), 'utf8');
  assert.match(src, /gateBoot:\s*false/,
    'the live cloud map is a background fetch and must not hold the loading overlay open');
  assert.match(src, /evict:\s*Infinity/,
    'live cloud tiers must stay resident so zoom-out never evicts and zoom-in never re-downloads');
  assert.match(src, /preload:\s*true/,
    'live cloud tiers must be fetched once up front, not on the first close zoom');
});

await test('planetary surface LODs stream lazily (no boot-time hi-res flood)', () => {
  // With 8K terrestrial maps a resident-set of every planet's hires tier would run to
  // hundreds of MB of GPU memory and stall the loading overlay decoding maps the camera
  // never approaches. The tiers therefore load on proximity only.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'scene', 'planets', 'PlanetMeshBuilder.js'), 'utf8');
  assert.match(src, /lodManager\.create\(lodTiers,\s*PLANET_LOD_OPTIONS\)/,
    'a planetary LOD must stream lazily — never preload every hires tier at boot');
  assert.ok(!/lodManager\.create\(lodTiers,\s*\{\s*preload:\s*true/.test(src),
    'planetary tiers must not be preloaded: that would defeat the LOD and flood VRAM');
});

// ---------------------------------------------------------------------------
// Non-LOD boot textures (8K Moon, star map, single-map planets) must also be
// uploaded to the GPU behind the gate, or their first-draw upload freezes the
// first visible frame.
// ---------------------------------------------------------------------------
await test('uploadTextureNow forces the GPU upload through initTexture', () => {
  const seen = [];
  const renderer = { initTexture: (t) => seen.push(t) };
  const tex = { id: 'moon_8k' };
  uploadTextureNow(renderer, tex);
  assert.deepEqual(seen, [tex], 'the texture must be handed to renderer.initTexture');
});

await test('uploadTextureNow is a safe no-op without a renderer or texture', () => {
  assert.doesNotThrow(() => uploadTextureNow(null, { id: 1 }), 'null renderer must be tolerated');
  assert.doesNotThrow(() => uploadTextureNow({}, { id: 1 }), 'a renderer without initTexture must be tolerated');
  assert.doesNotThrow(() => uploadTextureNow({ initTexture() {} }, null), 'null texture must be tolerated');
});

await test('a registered renderer is used when the caller has none', () => {
  const seen = [];
  setUploadRenderer({ initTexture: (t) => seen.push(t) });
  const tex = { id: 'planet_4k' };
  uploadTextureNow(null, tex);
  assert.deepEqual(seen, [tex], 'the fallback renderer must receive the texture');
});

await test('every boot texture is uploaded to the GPU before the gate opens', () => {
  const moon = fs.readFileSync(path.join(ROOT, 'src', 'scene', 'Moon.js'), 'utf8');
  assert.match(moon, /this\.textureLod = new TextureLODManager\(renderer\)/,
    'the Moon must own a LOD manager so its base tier uploads behind the gate');
  assert.match(moon, /this\._moonLod = this\.textureLod\.create\(/,
    'the Moon surface must stream through tiered maps (the 2K base paints at boot)');

  const stars = fs.readFileSync(path.join(ROOT, 'src', 'scene', 'Stars.js'), 'utf8');
  assert.match(stars, /new TextureLODManager\(renderer\)/,
    'the skybox must own a LOD manager so its tiers upload behind the gate');
  assert.match(stars, /this\.textureLod\.create\(levels, \{ preload: true/,
    'the skybox tiers must preload (and thus pre-upload) behind the gate');

  const gen = fs.readFileSync(path.join(ROOT, 'src', 'scene', 'planets', 'PlanetTextureGenerator.js'), 'utf8');
  assert.match(gen, /uploadTextureNow\(renderer, real\)/, 'single-map planet textures must be pre-uploaded');

  const mgr = fs.readFileSync(path.join(ROOT, 'src', 'scene', 'SceneManager.js'), 'utf8');
  assert.match(mgr, /new Stars\(this\.scene, this\.renderer\)/, 'SceneManager must give Stars the renderer');
  assert.match(mgr, /new MoonObject\(this\.scene, this\.renderer\)/, 'SceneManager must give Moon the renderer');
  assert.match(mgr, /setUploadRenderer\(this\.renderer\)/, 'SceneManager must register the renderer for other loaders');
});

console.log(`\nBoot readiness tests: ${passed}/${total} passed`);
assert.equal(passed, total, `expected ${total} tests`);
