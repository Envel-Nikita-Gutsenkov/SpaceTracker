// Near-real-time Earth cloud maps from "Live cloud maps" (clouds.matteason.co.uk).
//
// Unlike a raw satellite browse product (which is full of swath gaps and colour
// palettes), this service publishes a single gap-free, grayscale cloud map of the
// whole Earth, re-composited from EUMETSAT data and refreshed every three hours.
// Images are CC0 and served over CORS, so the app can stream them directly.
//
// We never bundle or decode the imagery here — we only hand the caller a coarse→fine
// tier list (2K/4K/8K) that `TextureLODManager` streams by camera proximity. If the
// service is unreachable, `resolveCloudTiers` returns `null` and the bundled static
// cloud map stays bound, so a network failure can never break the globe.
const BASE = import.meta.env?.VITE_CLOUD_MAP_BASE_URL || 'https://clouds.matteason.co.uk';

// The upstream images are regenerated every three hours; bucket the clock so the URL
// changes when a new image is published, otherwise the browser would serve a stale one.
const UPDATE_INTERVAL_MS = 3 * 60 * 60 * 1000;

// Coarse → fine, matching `TextureLODManager` ordering. `distance` is the camera-to-Earth
// distance (Earth radii) within which a tier becomes active; the 2K base is always on and
// the 4K/8K tiers stream in as the camera closes in.
export const CLOUD_TIERS = [
  { key: '2048x1024', distance: Infinity },
  { key: '4096x2048', distance: 5.0 },
  { key: '8192x4096', distance: 2.5 },
];

export const CLOUD_ATTRIBUTION =
  'Contains modified EUMETSAT data (Live cloud maps, clouds.matteason.co.uk, CC0)';

/** The 3-hour publication bucket for `now` — used to bust the CDN/browser cache. */
export function updateBucket(now = Date.now()) {
  return Math.floor(now / UPDATE_INTERVAL_MS);
}

/** Build the URL of the cloud map for one resolution tier at the current bucket. */
export function buildCloudUrl(key, { now = Date.now(), base = BASE } = {}) {
  return `${base}/images/${key}/clouds.jpg?v=${updateBucket(now)}`;
}

/** The full coarse→fine tier list, ready to hand to `TextureLODManager`. */
export function cloudTiers(opts = {}) {
  return CLOUD_TIERS.map((t) => ({ url: buildCloudUrl(t.key, opts), distance: t.distance }));
}

/**
 * Return the streamed tier list, or `null` to keep the bundled static map. Does a single
 * cheap HEAD probe so an outage degrades to the static map instead of a blank sky.
 */
export async function resolveCloudTiers({ now = Date.now(), fetchImpl = fetch } = {}) {
  const tiers = cloudTiers({ now });
  try {
    const res = await fetchImpl(tiers[0].url, { method: 'HEAD' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn(
      `[clouds] live cloud map unavailable (${err.message}) — keeping the bundled static map.`
    );
    return null;
  }
  return tiers;
}

export const CloudService = {
  CLOUD_TIERS,
  CLOUD_ATTRIBUTION,
  updateBucket,
  buildCloudUrl,
  cloudTiers,
  resolveCloudTiers,
};
