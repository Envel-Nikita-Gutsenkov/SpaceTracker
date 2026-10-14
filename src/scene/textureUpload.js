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

/**
 * Decode a loaded HTMLImageElement into a GPU-upload-friendly source.
 *
 * For the big 8K/16K maps this matters a lot. `createImageBitmap` decodes off the main thread
 * and, with `colorSpaceConversion: 'none'`, skips the image colour-management pass that the
 * browser would otherwise run on the full-resolution pixels — a hidden cost of hundreds of
 * milliseconds on an 8K image. The returned ImageBitmap is also the fastest source to hand to
 * `texImage2D`, so the unavoidable GPU upload is as short as it can be.
 *
 * The maps are tagged `SRGBColorSpace`, so the GPU sampler decodes the stored sRGB bytes itself;
 * skipping the browser's own conversion here is therefore not just faster but equivalent.
 *
 * Falls back to the decoded HTMLImageElement wherever `createImageBitmap` is unavailable, so
 * older browsers keep working with no visual change.
 */
export async function decodeImageSource(img) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(img, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    } catch { /* fall through to the element */ }
  }
  if (img && typeof img.decode === 'function') {
    try { await img.decode(); } catch { /* decode failure: use the element as-is */ }
  }
  return img;
}

/**
 * Run `fn` when the main thread is next idle, so a heavy synchronous GPU upload lands during a
 * gap instead of in the middle of a gesture. Falls back to a macrotask where `requestIdleCallback`
 * is unavailable, and the `timeout` bounds how long the work may be deferred.
 */
export function scheduleIdle(fn, timeout = 500) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn(), { timeout });
  } else {
    setTimeout(fn, 0);
  }
}
