import * as THREE from 'three';
import { getBodyData } from '../../utils/smallBodies';
import { EARTH_RADIUS_KM } from '../../utils/astronomy';
import { textureReadiness } from '../textureReadiness.js';
import { uploadTextureNow } from '../textureUpload.js';
import {
  pseudoNoise, smoothNoise, fbm,
  genericSeed, fillGenericSurface,
  GENERIC_CANVAS_W, GENERIC_CANVAS_H,
} from './proceduralSurface.js';

const textureCache = new Map();
const loader = new THREE.TextureLoader();

// A single 2x2 stand-in bound to bodies whose surface is synthesised lazily. It is never seen
// (the body stays hidden until its real map is built) — it exists only so the material keeps a
// stable `USE_MAP` program, making the later swap a pure reference change with no shader recompile.
let sharedPlaceholder = null;

// --- Off-main-thread generic surface synthesis ------------------------------------------------
// The generic fallback canvas (moons and dwarfs with no real map) is a ~200 ms fractal-noise
// pass. Building it inline in the render loop froze the app for seconds the moment a group of
// bodies was revealed at once (the "show moons" toggle). The identical maths runs in a small
// worker pool instead, so revealing bodies never stalls a frame: the body shows the shared
// placeholder for a moment, then gets its surface. Falls back to inline synthesis where workers
// are unavailable (Node tests, very old browsers), so the output is never missing.
let _surfaceWorkers = null;
let _surfaceRequestId = 0;
const _surfacePending = new Map();

function surfaceWorkers() {
  if (_surfaceWorkers) return _surfaceWorkers;
  if (typeof Worker === 'undefined') { _surfaceWorkers = []; return _surfaceWorkers; }
  const hw = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  const count = Math.max(1, Math.min(4, hw));
  const workers = [];
  for (let i = 0; i < count; i++) {
    try {
      const w = new Worker(new URL('../../workers/surface.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const { requestId, data } = e.data || {};
        const resolve = _surfacePending.get(requestId);
        _surfacePending.delete(requestId);
        if (resolve) resolve(data);
      };
      workers.push(w);
    } catch { /* worker unavailable — fall back to inline synthesis */ }
  }
  _surfaceWorkers = workers;
  return workers;
}

// Real NASA-derived equirectangular surface maps (Solar System Scope, CC BY 4.0, and
// NASA/JHUAPL/SwRI New Horizons imagery, public domain). Every mapped body now uses a
// real map; the procedural canvas is kept as an instant placeholder and load fallback.
//
// This is the *finest* real map for each body. Bodies listed in TIERED_MAPS below stream
// their map through the LOD manager, so this entry is only used when tiers are bypassed.
const REAL_MAPS = {
  mercury:  '/mercury_8k.webp',
  venus:    '/venus_8k.webp',
  mars:     '/mars_8k.webp',
  jupiter:  '/jupiter_4k.webp',
  saturn:   '/saturn_4k.webp',
  uranus:   '/uranus_2k.webp',  // Solar System Scope publishes no higher map for Uranus
  neptune:  '/neptune_2k.webp', // …or for Neptune
  pluto:    '/pluto_8k.webp',
  // Dwarf planets (Solar System Scope "fictional" maps, CC BY 4.0)
  ceres:    '/ceres_4k.webp',
  haumea:   '/haumea_4k.webp',
  makemake: '/makemake_4k.webp',
  eris:     '/eris_4k.webp',
  // Galilean moons and other satellites with real global maps (NASA/JPL/USGS). These four
  // stay JPEG: their already-compact maps do not shrink under WebP, so re-encoding would only
  // add generation loss for nothing.
  io:        '/io_2k.webp',
  europa:    '/europa_2k.jpg',
  ganymede:  '/ganymede_2k.jpg',
  callisto:  '/callisto_2k.jpg',
  titan:     '/titan_2k.webp',
  enceladus: '/enceladus_2k.jpg',
  triton:    '/triton_2k.webp',
  charon:    '/charon_2k.webp',
  phobos:    '/phobos_2k.webp',
  deimos:    '/deimos_2k.webp',
};

// Bodies whose surface map streams in coarse→fine resolution tiers by camera proximity
// (see TextureLODManager). Levels are ordered coarsest → finest; `distance` is the
// camera-to-body distance in scene units (Earth radius = 1) within which the tier becomes
// active. The 2K base paints instantly, while the full-resolution tier only uploads once
// the camera closes in, so its heavy decode never lands on a wide solar-system view.
//
// Both tiers of every body come from the SAME source master (Solar System Scope, CC BY 4.0
// — the 2K "High" and the 8K/4K "Ultra" download), so a tier swap changes only resolution,
// never colour grading: the material, lighting and tone mapping are untouched (the swap
// rebinds `material.map` only — see PlanetarySystem).
export const PLUTO_HIRES_DISTANCE = 2.0;

// `base` is the shared 2K master, `hires` the finest map the source publishes. `radii` is
// how many body radii from the camera the hi-res tier activates — generous, so the decode
// finishes while the disc is still small and the swap is never a visible pop.
const TIERED_MAPS = {
  mercury:  { base: '/mercury_2k.webp',  hires: '/mercury_8k.webp',  radii: 10 },
  venus:    { base: '/venus_2k.webp',    hires: '/venus_8k.webp',    radii: 10 },
  mars:     { base: '/mars_2k.webp',     hires: '/mars_8k.webp',     radii: 10 },
  jupiter:  { base: '/jupiter_2k.webp',  hires: '/jupiter_4k.webp',  radii: 10 },
  saturn:   { base: '/saturn_2k.webp',   hires: '/saturn_4k.webp',   radii: 10 },
  ceres:    { base: '/ceres_2k.webp',    hires: '/ceres_4k.webp',    radii: 10 },
  haumea:   { base: '/haumea_2k.webp',   hires: '/haumea_4k.webp',   radii: 10 },
  makemake: { base: '/makemake_2k.webp', hires: '/makemake_4k.webp', radii: 10 },
  eris:     { base: '/eris_2k.webp',     hires: '/eris_4k.webp',     radii: 10 },
};

// Activation distance of a body's hi-res tier, in scene units (Earth radius = 1).
function hiresDistance(bodyId, radii) {
  const data = getBodyData(bodyId);
  const radiusUnits = data && data.radiusKm ? data.radiusKm / EARTH_RADIUS_KM : 1.0;
  return Math.max(0.5, radiusUnits * radii);
}

export const PLANET_LOD_TIERS = {
  pluto: [
    { url: '/pluto_2k.webp', distance: Infinity },
    { url: '/pluto_8k.webp', distance: PLUTO_HIRES_DISTANCE },
  ],
  ...Object.fromEntries(Object.entries(TIERED_MAPS).map(([id, t]) => [id, [
    { url: t.base,  distance: Infinity },
    { url: t.hires, distance: hiresDistance(id, t.radii) },
  ]])),
};

// Streamed options for the planet/dwarf tiers above.
//
// The tiers stay LAZY (no `preload`) — only the 2K base is fetched at boot, and the 4K/8K
// tier loads once the camera closes in. But once a tier has been fetched it is kept resident
// for the rest of the session (`evict: Infinity`, exactly like the Earth layers). Releasing it
// on zoom-out made the next approach re-download, re-decode and synchronously re-upload the
// map — a hard ~1 s freeze EVERY time the camera returned to a body. Keeping the tiers the
// user has actually visited resident turns every later approach into a pure reference swap.
// The cost is bounded by the handful of bodies visited in one session, and nothing is fetched
// until the camera goes there.
export const PLANET_LOD_OPTIONS = { evict: Infinity };

// Seam-free wrapping, mipmaps and anisotropic filtering keep the surface crisp on the
// grazing limb of the sphere.
function applySamplerSettings(tex) {
  tex.colorSpace      = THREE.SRGBColorSpace;
  tex.wrapS           = THREE.RepeatWrapping;      // seamless across the 0/1 longitude seam
  tex.wrapT           = THREE.ClampToEdgeWrapping;
  tex.minFilter       = THREE.LinearMipmapLinearFilter;
  tex.magFilter       = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy      = 16;                        // clamped to the GPU maximum on upload
  return tex;
}

// Helper: simple pseudo-random noise generator for deterministic, seedable procedural textures.
// The noise primitives live in ./proceduralSurface.js so the surface worker can run the exact
// same maths off the main thread (see getGenericTextureAsync).

export class PlanetTextureGenerator {
  // True when the body has a real photo map to stream (see REAL_MAPS).
  static hasRealMap(planetId) {
    return Boolean(REAL_MAPS[planetId]);
  }

  // Cheap shared placeholder for lazily-textured bodies (see PlanetMeshBuilder).
  static getPlaceholderTexture() {
    if (!sharedPlaceholder) {
      if (typeof document === 'undefined') {
        sharedPlaceholder = applySamplerSettings(new THREE.Texture());
      } else {
        const c = document.createElement('canvas');
        c.width = 2; c.height = 2;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 2, 2);
        sharedPlaceholder = applySamplerSettings(new THREE.CanvasTexture(c));
      }
    }
    return sharedPlaceholder;
  }

  // Returns the texture to bind immediately (a procedural canvas). When a real map exists,
  // `onReady(realTexture)` is called once the photo decodes with a *brand-new* texture.
  //
  // The real map must NEVER be swapped in place onto the placeholder: three.js allocates
  // immutable GPU storage at the placeholder's dimensions, so assigning a larger image and
  // flagging `needsUpdate` makes it take the `texSubImage2D` path and overflow that storage
  // (GL_INVALID_VALUE — the real map silently fails to upload). A fresh texture forces a
  // clean `texStorage2D` at the correct size.
  static getTexture(planetId, onReady = null, renderer = null) {
    const realUrl = REAL_MAPS[planetId];

    if (!realUrl) {
      if (textureCache.has(planetId)) return textureCache.get(planetId);
      const tex = applySamplerSettings(new THREE.CanvasTexture(this.createProceduralCanvas(planetId)));
      textureCache.set(planetId, tex);
      return tex;
    }

    const placeholder = applySamplerSettings(new THREE.CanvasTexture(this.createProceduralCanvas(planetId)));

    if (typeof Image === 'undefined') return placeholder; // headless / test environment

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const ready = new Promise((resolve) => {
      img.onload = () => {
        if (onReady) {
          const real = applySamplerSettings(new THREE.Texture());
          real.image = img;
          real.needsUpdate = true;
          // Upload the real map now, behind the boot gate, so its first-draw upload never
          // lands as a hitch on the first frame the planets become visible.
          uploadTextureNow(renderer, real);
          onReady(real);
        }
        resolve();
      };
      // A failed map keeps the procedural placeholder and must never hold the boot gate open.
      img.onerror = () => { resolve(); };
      img.src = realUrl;
    });
    // Gate the loading overlay on the real map so its decode + first upload land during boot.
    textureReadiness.track(ready);

    return placeholder;
  }

  // Off-thread variant of the lazy path: returns immediately and calls `onReady(texture)` once the
  // generic surface for `planetId` has been synthesised in a worker. The caller binds the shared
  // placeholder first, so the body is never untextured. Where workers are unavailable the surface
  // is built inline (a one-off cost) and `onReady` fires synchronously.
  static getGenericTextureAsync(planetId, onReady) {
    const cached = textureCache.get(planetId);
    if (cached) { onReady(cached); return; }

    const workers = surfaceWorkers();
    if (workers.length === 0) {
      const tex = applySamplerSettings(new THREE.CanvasTexture(this.createGenericCanvas(planetId)));
      textureCache.set(planetId, tex);
      onReady(tex);
      return;
    }

    const data = getBodyData(planetId);
    const hex = data?.colorHex ?? 0x888888;
    const r0 = (hex >> 16) & 0xff;
    const g0 = (hex >> 8) & 0xff;
    const b0 = hex & 0xff;
    const seed = genericSeed(planetId);

    const requestId = ++_surfaceRequestId;
    _surfacePending.set(requestId, (buffer) => {
      const c = document.createElement('canvas');
      c.width = GENERIC_CANVAS_W; c.height = GENERIC_CANVAS_H;
      const ctx = c.getContext('2d');
      const imgData = ctx.createImageData(GENERIC_CANVAS_W, GENERIC_CANVAS_H);
      imgData.data.set(buffer);
      ctx.putImageData(imgData, 0, 0);
      const tex = applySamplerSettings(new THREE.CanvasTexture(c));
      textureCache.set(planetId, tex);
      onReady(tex);
    });
    workers[requestId % workers.length].postMessage({ requestId, r0, g0, b0, seed });
  }

  static createProceduralCanvas(planetId) {
    switch (planetId) {
      case 'mercury': return this.createMercuryCanvas();
      case 'venus':   return this.createVenusCanvas();
      case 'mars':    return this.createMarsCanvas();
      case 'jupiter': return this.createJupiterCanvas();
      case 'saturn':  return this.createSaturnCanvas();
      case 'uranus':  return this.createUranusCanvas();
      case 'neptune': return this.createNeptuneCanvas();
      case 'pluto':   return this.createPlutoCanvas();
      default: {
        const cls = getBodyData(planetId)?.bodyClass;
        if (cls === 'dwarf' || cls === 'moon') return this.createGenericCanvas(planetId);
        return this.createDefaultCanvas();
      }
    }
  }

  static createMercuryCanvas() {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const n = fbm(u * 14.0, v * 7.0, 5, 42);
        const craters = Math.pow(fbm(u * 32.0, v * 16.0, 3, 101), 1.8);
        const base = 0.45 + 0.35 * n - 0.20 * craters;
        const col = Math.floor(Math.min(255, Math.max(20, base * 255)));

        const idx = (y * w + x) * 4;
        d[idx]     = col;
        d[idx + 1] = Math.floor(col * 0.98);
        d[idx + 2] = Math.floor(col * 0.95);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  static createVenusCanvas() {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      const lat = (v - 0.5) * Math.PI;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        // Subtle planetary chevron cloud bands
        const band = Math.sin(lat * 8.0 + fbm(u * 6.0, v * 3.0, 3, 7) * 2.0);
        const haze = fbm(u * 10.0, v * 5.0, 4, 13);
        const factor = 0.5 + 0.3 * band + 0.2 * haze;

        const idx = (y * w + x) * 4;
        d[idx]     = Math.floor(235 + 20 * factor);
        d[idx + 1] = Math.floor(215 + 25 * factor);
        d[idx + 2] = Math.floor(165 + 30 * factor);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  static createMarsCanvas() {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      const latDist = Math.abs(v - 0.5) * 2.0; // 0 at equator, 1 at poles
      const isPolarCap = latDist > 0.88;

      for (let x = 0; x < w; x++) {
        const u = x / w;
        const idx = (y * w + x) * 4;

        if (isPolarCap) {
          const capEdge = (latDist - 0.88) / 0.12;
          const iceNoise = fbm(u * 20.0, v * 10.0, 3, 99);
          const ice = Math.min(255, Math.floor(230 + 25 * iceNoise * capEdge));
          d[idx]     = ice;
          d[idx + 1] = ice;
          d[idx + 2] = Math.min(255, ice + 10);
        } else {
          const maria = fbm(u * 8.0, v * 4.0, 4, 17);
          const isDarkMaria = maria < 0.42;
          const rust = fbm(u * 16.0, v * 8.0, 3, 55);

          if (isDarkMaria) {
            d[idx]     = Math.floor(125 + 30 * rust);
            d[idx + 1] = Math.floor(75 + 20 * rust);
            d[idx + 2] = Math.floor(55 + 15 * rust);
          } else {
            d[idx]     = Math.floor(210 + 35 * rust);
            d[idx + 1] = Math.floor(115 + 25 * rust);
            d[idx + 2] = Math.floor(65 + 20 * rust);
          }
        }
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  static createJupiterCanvas() {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    // Great Red Spot center in UV coordinates
    const grsU = 0.62, grsV = 0.65, grsRadU = 0.055, grsRadV = 0.035;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const idx = (y * w + x) * 4;

        // Check if inside Great Red Spot
        const du = Math.abs(u - grsU);
        const dv = Math.abs(v - grsV);
        const grsDist = Math.sqrt((du / grsRadU) ** 2 + (dv / grsRadV) ** 2);

        if (grsDist < 1.0) {
          const swirl = Math.sin(grsDist * Math.PI * 3.0);
          d[idx]     = Math.floor(225 + 20 * swirl);
          d[idx + 1] = Math.floor(95 + 15 * swirl);
          d[idx + 2] = Math.floor(65 + 15 * swirl);
        } else {
          // Dynamic alternating belts and zones
          const lat = (v - 0.5) * Math.PI;
          const bandPattern = Math.sin(lat * 18.0 + fbm(u * 12.0, v * 4.0, 3, 88) * 1.5);
          const turb = fbm(u * 24.0, v * 12.0, 4, 303);

          if (bandPattern > 0.0) {
            // Bright white/cream zone
            d[idx]     = Math.floor(240 - 25 * turb);
            d[idx + 1] = Math.floor(225 - 35 * turb);
            d[idx + 2] = Math.floor(190 - 45 * turb);
          } else {
            // Dark amber/brown belt
            d[idx]     = Math.floor(185 + 30 * turb);
            d[idx + 1] = Math.floor(115 + 25 * turb);
            d[idx + 2] = Math.floor(75 + 20 * turb);
          }
        }
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  static createSaturnCanvas() {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      const lat = (v - 0.5) * Math.PI;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const idx = (y * w + x) * 4;

        const band = Math.sin(lat * 14.0 + fbm(u * 8.0, v * 2.0, 2, 44) * 0.4);
        const haze = fbm(u * 16.0, v * 6.0, 3, 12);
        const blend = 0.5 + 0.35 * band + 0.15 * haze;

        d[idx]     = Math.floor(230 + 20 * blend);
        d[idx + 1] = Math.floor(205 + 20 * blend);
        d[idx + 2] = Math.floor(145 + 25 * blend);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  static createSaturnRingTexture() {
    const key = 'saturn_rings';
    if (textureCache.has(key)) return textureCache.get(key);

    // Real radial ring map (Solar System Scope): horizontal axis = distance from the
    // planet centre, which matches the ring geometry UVs (u = normalised radius).
    const tex = loader.load('/saturn_ring_8k.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 16;                             // clamped to the GPU maximum on upload
    textureCache.set(key, tex);
    return tex;
  }

  static createUranusCanvas() {
    const w = 512, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const idx = (y * w + x) * 4;
        const subtle = fbm(u * 10.0, v * 4.0, 3, 50);

        d[idx]     = Math.floor(165 + 15 * subtle);
        d[idx + 1] = Math.floor(225 + 15 * subtle);
        d[idx + 2] = Math.floor(235 + 15 * subtle);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  static createNeptuneCanvas() {
    const w = 512, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const idx = (y * w + x) * 4;

        const band = Math.sin(v * 20.0 + fbm(u * 8.0, v * 4.0, 3, 21) * 1.2);
        const cirrus = Math.pow(fbm(u * 18.0, v * 12.0, 3, 77), 2.5);

        d[idx]     = Math.floor(45 + 30 * band + 140 * cirrus);
        d[idx + 1] = Math.floor(105 + 40 * band + 130 * cirrus);
        d[idx + 2] = Math.floor(225 + 25 * band + 25 * cirrus);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  static createPlutoCanvas() {
    const w = 512, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    // Tombaugh Regio ("Heart") centered at u=0.45, v=0.55
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const idx = (y * w + x) * 4;

        const du = u - 0.45;
        const dv = v - 0.55;
        const heartDist = Math.sqrt(du * du + dv * dv);
        const noise = fbm(u * 12.0, v * 6.0, 4, 88);

        if (heartDist < 0.14) {
          // Bright nitrogen ice plain (Sputnik Planitia)
          d[idx]     = Math.floor(245 - 20 * noise);
          d[idx + 1] = Math.floor(230 - 25 * noise);
          d[idx + 2] = Math.floor(215 - 20 * noise);
        } else {
          // Reddish-tan tholin covered terrain
          d[idx]     = Math.floor(180 + 35 * noise);
          d[idx + 1] = Math.floor(135 + 25 * noise);
          d[idx + 2] = Math.floor(110 + 20 * noise);
        }
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  // Procedural fallback / placeholder for any dwarf planet or moon without a real global map.
  // Uses the body's catalogued base albedo colour (from smallBodies) plus fractal-noise relief
  // and cratering, so every body still renders in a plausible, body-specific colour.
  //
  // This is ~200 ms of pure maths, so the render loop must NOT call it inline — see
  // `getGenericTextureAsync`, which runs the identical `fillGenericSurface` in a worker. The
  // synchronous form is kept for boot-time placeholders and as the worker-unavailable fallback.
  static createGenericCanvas(planetId) {
    const data = getBodyData(planetId);
    const hex = data?.colorHex ?? 0x888888;
    const r0 = (hex >> 16) & 0xff;
    const g0 = (hex >> 8) & 0xff;
    const b0 = hex & 0xff;
    const seed = genericSeed(planetId);

    const c = document.createElement('canvas');
    c.width = GENERIC_CANVAS_W; c.height = GENERIC_CANVAS_H;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(GENERIC_CANVAS_W, GENERIC_CANVAS_H);
    fillGenericSurface(imgData.data, GENERIC_CANVAS_W, GENERIC_CANVAS_H, r0, g0, b0, seed);
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  static createDefaultCanvas() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, 64, 32);
    return c;
  }
}
