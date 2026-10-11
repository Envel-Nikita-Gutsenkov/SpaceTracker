import { perfProbe } from '../utils/perfProbe.js';

// Scene-wide renderer, registered once at boot. Loaders that can't be handed a renderer directly
// (they are constructed before it, or live in modules that don't take one) fall back to this so
// their textures still get pre-uploaded behind the boot gate.
let _renderer = null;

/** Register the scene renderer so uploads without an explicit renderer still work. */
export function setUploadRenderer(renderer) {
  if (renderer) _renderer = renderer;
}

/**
 * Force a texture's GPU upload right now, and record how long the synchronous upload took.
 *
 * A big map (the 8K Moon/Pluto/Earth layers) can block the main thread for seconds inside
 * `initTexture`. Loaders normally register their texture as "ready" on image load — long before
 * the GPU upload happens at the first draw — so that multi-second upload lands on the first frame
 * the user actually sees. Calling this while the boot gate is still up moves the cost into boot.
 *
 * Safe to call headless or without a renderer: it simply does nothing.
 */
export function uploadTextureNow(renderer, texture) {
  const r = renderer || _renderer;
  if (!r || !texture || typeof r.initTexture !== 'function') return;
  const t0 = performance.now();
  try { r.initTexture(texture); } catch { /* non-fatal */ }
  perfProbe.record('texUpload', performance.now() - t0);
}
