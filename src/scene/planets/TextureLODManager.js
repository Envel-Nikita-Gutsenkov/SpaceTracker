import * as THREE from 'three';
import { textureReadiness } from '../textureReadiness.js';

// Sampler settings shared by every streamed tier so a resolution swap never changes
// wrapping, filtering or colour handling.
function configure(tex) {
  tex.colorSpace      = THREE.SRGBColorSpace;
  tex.wrapS           = THREE.RepeatWrapping;      // seamless across the 0/1 longitude seam
  tex.wrapT           = THREE.ClampToEdgeWrapping;
  tex.minFilter       = THREE.LinearMipmapLinearFilter;
  tex.magFilter       = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy      = 16;                        // clamped to the GPU maximum on upload
  return tex;
}

/**
 * A set of resolution tiers for one map, streamed by camera proximity.
 *
 * Each tier owns its own THREE.Texture. A tier is prefetched while the camera is still
 * approaching (`distance <= tier.distance * prefetch`), decoded off the main thread and
 * uploaded to the GPU ahead of time, so switching to it is an instant reference swap that
 * never stalls the render loop. Tiers the camera has left behind are disposed.
 *
 * `levels` are ordered coarsest → finest; each carries the camera-to-body distance
 * (scene units) within which it becomes active (base level uses `Infinity`).
 */
export class LodTexture {
  constructor(levels, { prefetch = 1.6, hysteresis = 1.25, evict = 4.0, preload = false, gateBoot = true } = {}) {
    this.levels = levels.map(l => ({
      url: l.url,
      distance: l.distance ?? Infinity,
      texture: null,
      status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
    }));
    this.baseIndex = 0;
    this.activeIndex = 0;
    this.prefetchFactor = prefetch;
    this.hysteresis = hysteresis;
    // Whether a tier's load counts toward the boot-time readiness gate that holds the loading
    // overlay open. True for the maps painted on first load; false for anything fetched lazily
    // after boot (e.g. the streamed live cloud map), whose latency must never stall startup.
    this.gateBoot = gateBoot;
    // A tier is only released once the camera is `evict`×its activation distance away —
    // far wider than the prefetch window. This keeps a decoded tier resident across the
    // whole range the user actually zooms through, so panning back and forth never
    // re-triggers the download + decode + GPU upload (which would hitch on every zoom).
    // `evict: Infinity` disables release entirely.
    this.evictFactor = evict;
    this.renderer = null;
    this._distance = Infinity;

    this.levels[this.baseIndex].texture = configure(new THREE.Texture());
    this._request(this.baseIndex);

    // Eagerly fetch + decode + pre-upload every tier up front. The one-time cost (a large
    // JPEG decode and a full-resolution GPU upload) then lands while the app is still
    // booting, instead of firing mid-zoom the moment the camera crosses a threshold.
    if (preload) {
      for (let i = 0; i < this.levels.length; i++) this._request(i);
    }
  }

  setRenderer(renderer) { this.renderer = renderer; }

  // The texture the consumer should bind right now.
  get texture() { return this.levels[this.activeIndex].texture; }

  // True once the currently active tier has decoded and is safe to display.
  get ready() { return this.levels[this.activeIndex].status === 'ready'; }

  // Finest tier whose activation distance covers `distance`.
  _targetIndex(distance) {
    let best = this.baseIndex;
    for (let i = 0; i < this.levels.length; i++) {
      if (distance <= this.levels[i].distance) best = i;
    }
    return best;
  }

  _request(index) {
    const level = this.levels[index];
    if (!level) return Promise.resolve();
    if (level.status === 'loading' || level.status === 'ready') return level._readyPromise || Promise.resolve();
    if (typeof Image === 'undefined') { // headless / test environment
      const done = Promise.resolve();
      if (this.gateBoot) textureReadiness.track(done);
      return done;
    }

    level.status = 'loading';
    if (!level.texture) level.texture = configure(new THREE.Texture());

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const commit = () => {
        level.texture.image = img;
        level.texture.needsUpdate = true;
        level.status = 'ready';
        // Pay the (large) GPU upload now, during prefetch, not at the swap moment.
        if (this.renderer && typeof this.renderer.initTexture === 'function') {
          try { this.renderer.initTexture(level.texture); } catch { /* non-fatal */ }
        }
        this.update(this._distance);
        resolve();
      };

      img.onload = () => {
        // decode() moves the heavy JPEG decode off the main thread where supported.
        if (typeof img.decode === 'function') img.decode().then(commit, commit);
        else commit();
      };
      // A failed tier must never hold the boot gate open.
      img.onerror = () => { level.status = 'error'; resolve(); };
      img.src = level.url;
    });

    level._readyPromise = promise;
    if (this.gateBoot) textureReadiness.track(promise);
    return promise;
  }

  update(distance) {
    this._distance = distance;
    const target = this._targetIndex(distance);

    if (target > this.activeIndex) {
      if (this.levels[target].status === 'ready') this.activeIndex = target;
    } else if (target < this.activeIndex) {
      const active = this.levels[this.activeIndex];
      if (active.distance === Infinity || distance > active.distance * this.hysteresis) {
        this.activeIndex = target;
      }
    }

    // Prefetch tiers we are approaching so decode + upload finish before the swap.
    for (let i = this.activeIndex + 1; i < this.levels.length; i++) {
      if (distance <= this.levels[i].distance * this.prefetchFactor) this._request(i);
    }

    this._evict(distance);
  }

  // Dispose tiers that are neither active nor inside the (generous) residency window.
  _evict(distance) {
    this.levels.forEach((level, i) => {
      if (i === this.baseIndex || i === this.activeIndex || level.status === 'loading') return;
      const stillResident = distance <= level.distance * this.evictFactor;
      if (i > this.activeIndex && !stillResident && level.status === 'ready') {
        level.texture.dispose();
        level.texture = null;
        level.status = 'idle';
      }
    });
  }

  dispose() {
    this.levels.forEach(level => {
      level.texture?.dispose();
      level.texture = null;
      level.status = 'idle';
    });
  }
}

export class TextureLODManager {
  constructor(renderer = null) {
    this.renderer = renderer;
    this.items = new Set();
  }

  // Propagate the renderer to every streamed map so they can pre-upload tiers.
  setRenderer(renderer) {
    this.renderer = renderer;
    this.items.forEach(lod => lod.setRenderer(renderer));
  }

  create(levels, options) {
    const lod = new LodTexture(levels, options);
    lod.setRenderer(this.renderer);
    this.items.add(lod);
    return lod;
  }

  // Release every streamed map this manager owns (scene teardown).
  dispose() {
    this.items.forEach(lod => lod.dispose());
    this.items.clear();
  }
}
