// Registry and sizing helpers for real (NASA) spacecraft 3D models.
//
// Kept free of any `three` import so it can be reasoned about and unit-tested
// without a browser/WebGL context.

export const EARTH_RADIUS_M = 6371000; // 1 Three.js unit == Earth radius

// Shared configs for multi-spacecraft constellations / series (one chassis model each).
const MMS = { name: 'MMS', url: '/models/mms.glb', physicalSizeMeters: 3.5, facing: '+z' };
const THEMIS = { name: 'THEMIS', url: '/models/themis.glb', physicalSizeMeters: 20, facing: '+z' };
const GRACE = { name: 'GRACE-FO', url: '/models/grace.glb', physicalSizeMeters: 3.1, facing: '+z' };
const JASON = { name: 'Jason', url: '/models/jason2.glb', physicalSizeMeters: 3.6, facing: '+z' };
const LANDSAT_8 = { name: 'Landsat 8', url: '/models/landsat8.glb', physicalSizeMeters: 9.4, facing: '+z' };
const SUOMI_NPP = { name: 'Suomi NPP', url: '/models/suomi_npp.glb', physicalSizeMeters: 8, facing: '+z' };
const TDRS = { name: 'TDRS', url: '/models/tdrs.glb', physicalSizeMeters: 17, facing: '+z' };

// Registry of real spacecraft 3D models, keyed by NORAD catalogue number.
//
// Each entry:
//   url                – model path under public/
//   physicalSizeMeters – real-world largest dimension (drives auto-scale)
//   facing             – local axis the attitude code aligns with the radial-outward vector
//                        (away from the central body, default '+z'); to aim something such as
//                        a dish back at Earth, pass the NEGATION of that axis
//   rotOffset          – optional { x, y, z } Euler (radians) applied before centering
//   scale              – optional explicit scale override (skips auto-scale)
//
// Auto-scale: the loader measures the model's raw bounding box and scales it so its
// largest dimension equals `physicalSizeMeters / EARTH_RADIUS_M` scene units — so every
// model is physically accurate regardless of the units it was exported in.
export const SPACECRAFT_3D_REGISTRY = {
  25544: { name: 'ISS',     url: '/models/iss.glb',     physicalSizeMeters: 109,  facing: '+z' }, // truss span
  20580: { name: 'Hubble',  url: '/models/hubble.glb',  physicalSizeMeters: 13.2, facing: '+z' },
  25867: { name: 'Chandra', url: '/models/chandra.glb', physicalSizeMeters: 19.5, facing: '+z' }, // solar-array span
  43435: { name: 'TESS',    url: '/models/tess.glb',    physicalSizeMeters: 3.7,  facing: '+z' },
  28485: { name: 'Swift',   url: '/models/swift.glb',   physicalSizeMeters: 5.6,  facing: '+z' },
  25994: { name: 'Terra',   url: '/models/terra.glb',   physicalSizeMeters: 6.8,  facing: '+z' },
  27424: { name: 'Aqua',    url: '/models/aqua.glb',    physicalSizeMeters: 16.7, facing: '+z' },
  33053: { name: 'Fermi',   url: '/models/fermi.glb',   physicalSizeMeters: 12,   facing: '+z' },
  // LRO is a lunar orbiter (no TLE): it is rendered from the synthetic lunar fleet
  // (celestialFleet.js) and keyed here by its real NORAD id, 35315.
  35315: { name: 'LRO',     url: '/models/lro.glb',     physicalSizeMeters: 5,    facing: '+z' },
  // STEREO-A and Parker Solar Probe are heliocentric probes rendered by the synthetic
  // solar fleet (celestialFleet.js), so they carry no CelesTrak TLE either.
  43600: { name: 'Parker Solar Probe', url: '/models/parker.glb', physicalSizeMeters: 3,   facing: '+z' },
  29510: { name: 'STEREO-A',           url: '/models/stereo.glb', physicalSizeMeters: 2.5, facing: '+z' },

  // Earth-observing fleet (A-Train / decadal survey / NOAA-JPSS)
  28376: { name: 'Aura',     url: '/models/aura.glb',     physicalSizeMeters: 6.8, facing: '+z' },
  29108: { name: 'CALIPSO',  url: '/models/calipso.glb',  physicalSizeMeters: 5.9, facing: '+z' },
  29107: { name: 'CloudSat', url: '/models/cloudsat.glb', physicalSizeMeters: 4.6, facing: '+z' },
  43613: { name: 'ICESat-2', url: '/models/icesat2.glb',  physicalSizeMeters: 3.4, facing: '+z' },
  39574: { name: 'GPM Core Observatory', url: '/models/gpm.glb', physicalSizeMeters: 6.5, facing: '+z' },
  46984: { name: 'Sentinel-6 Michael Freilich', url: '/models/sentinel6.glb', physicalSizeMeters: 4.6, facing: '+z' },

  // Heliophysics
  36395: { name: 'Solar Dynamics Observatory', url: '/models/sdo.glb',    physicalSizeMeters: 4.5, facing: '+z' },
  29479: { name: 'Hinode (Solar-B)',           url: '/models/hinode.glb', physicalSizeMeters: 4,   facing: '+z' },

  // Interstellar / escape probes (heliocentric; rendered by DeepSpaceFleet and drawn
  // through the close-up model pass when focused). Voyager 1/2 are identical chassis, as
  // are Pioneer 10/11, so each pair shares one real NASA GLB.
  // Sizes are the real largest span: Voyager dish 3.7 m + ~13 m boom, Pioneer dish 2.74 m
  // + ~6.6 m boom, New Horizons dish 2.1 m + RTG (~2.7 m span).
  // The Voyager high-gain dish opens along the model's +Y (the feed horn sits above the
  // dish), so '-y' aligns that boresight with the radial-inward vector — pointing the dish
  // back at Earth, exactly like the New Horizons HGA below.
  10321: { name: 'Voyager 1',    url: '/models/voyager.glb',      physicalSizeMeters: 12.5, facing: '-y' },
  10320: { name: 'Voyager 2',    url: '/models/voyager.glb',      physicalSizeMeters: 12.5, facing: '-y' },
  5863:  { name: 'Pioneer 10',   url: '/models/pioneer10.glb',    physicalSizeMeters: 8.2,  facing: '+z' },
  6421:  { name: 'Pioneer 11',   url: '/models/pioneer10.glb',    physicalSizeMeters: 8.2,  facing: '+z' },
  // The NH high-gain antenna boresight (and the model's +Y) points up out of the dish. The
  // attitude code aligns `facing` with the radial-outward vector, so '-y' aims +Y — the dish —
  // back at Earth instead of at empty space.
  28928: { name: 'New Horizons', url: '/models/new_horizons.glb', physicalSizeMeters: 2.7,  facing: '-y' },

  // Other-planet orbiters (rendered by PlanetFleet). Only the selected orbiter is drawn
  // through the shared close-up pass, exactly like the deep-space probes; the rest stay
  // as lightweight procedural buses. Sizes are the real largest span.
  29601: { name: 'Mars Reconnaissance Orbiter', url: '/models/mro.glb',          physicalSizeMeters: 13.2, facing: '+z' },
  26855: { name: '2001 Mars Odyssey',           url: '/models/mars_odyssey.glb', physicalSizeMeters: 8.2,  facing: '+z' },
  37773: { name: 'Juno',                        url: '/models/juno.glb',         physicalSizeMeters: 23,   facing: '+z' },
};

// Constellations / mission series that share a single chassis model.
for (const id of [40482, 40483, 40484, 40485]) SPACECRAFT_3D_REGISTRY[id] = MMS;
for (const id of [30580, 30797, 30798]) SPACECRAFT_3D_REGISTRY[id] = THEMIS; // THEMIS A, D, E (B/C are lunar ARTEMIS, no TLE)
for (const id of [43476, 43477]) SPACECRAFT_3D_REGISTRY[id] = GRACE;                            // GRACE-FO 1-2
for (const id of [33105, 41240]) SPACECRAFT_3D_REGISTRY[id] = JASON;                            // Jason-2 (OSTM), Jason-3
for (const id of [39084, 49260]) SPACECRAFT_3D_REGISTRY[id] = LANDSAT_8;                        // Landsat 8-9
for (const id of [37849, 43013, 54234]) SPACECRAFT_3D_REGISTRY[id] = SUOMI_NPP;                 // Suomi NPP, NOAA-20/21
for (const id of [26388, 27389, 27566, 39070, 39504, 42915]) SPACECRAFT_3D_REGISTRY[id] = TDRS; // TDRS 8-13

// Constellation-level default models, keyed by category id.
//
// Navigation constellations are streamed by CelesTrak per launch (GLONASS as `COSMOS xxxx`,
// Galileo `GSATxxxx`) with a unique NORAD id each, so enumerating them in the registry would
// go stale on every launch/deorbit and leave most of the constellation on the generic
// procedural bus. Keying by category gives every current and future member the shared chassis
// model instead. `facing` aims the model's nadir face (its navigation antenna) at Earth,
// matching the attitude convention that aligns `facing` with the radial-outward vector.
//
// Real largest dimensions:
//   GLONASS-M (Uragan-M): ~7.8 m solar-array span, ~3.7 m body length, ~1.6 m body diameter.
//   Galileo FOC:          ~18.7 m solar-array span, body 2.7 x 1.2 x 1.1 m.
export const SPACECRAFT_CATEGORY_MODELS = {
  glonass: { name: 'GLONASS-M',   url: '/models/glonass.glb', physicalSizeMeters: 7.8,  facing: '-y' },
  galileo: { name: 'Galileo FOC', url: '/models/galileo.glb', physicalSizeMeters: 18.7, facing: '-z' },
};

/**
 * Resolve the constellation chassis model for a satellite.
 *
 * A satellite's stored `category` is decided by whichever CelesTrak group wins the dedup
 * race, and navigation satellites ride in several groups (the `sarsat` MEOSAR list carries
 * the whole Galileo constellation). When the authoritative navigation group's request
 * fails or is rate-limited, `fetchGroup` returns nothing and every member would be labelled
 * `other` — a snapshot that can then sit in the IndexedDB cache for an hour. Fall back to
 * the satellite name so a miss on one group never leaves the constellation on the generic
 * procedural bus.
 */
export function resolveCategoryModel(category, name) {
  const byCategory = category ? SPACECRAFT_CATEGORY_MODELS[category] : undefined;
  if (byCategory) return byCategory;
  const upper = (name || '').toUpperCase();
  if (upper.includes('GALILEO')) return SPACECRAFT_CATEGORY_MODELS.galileo;
  if (upper.includes('GLONASS')) return SPACECRAFT_CATEGORY_MODELS.glonass;
  return undefined;
}

export const FACING_VECTORS = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1],
};

/**
 * Three.js scale that fits a raw model's largest dimension into `physicalSizeMeters`.
 * Returns 1 for degenerate inputs.
 */
export function computeModelScale(rawLargest, physicalSizeMeters) {
  if (!(rawLargest > 0) || !(physicalSizeMeters > 0)) return 1;
  return (physicalSizeMeters / EARTH_RADIUS_M) / rawLargest;
}

// Procedural fallback bus + solar-array span in scene units (~67 m; 1 unit = Earth radius).
export const PROCEDURAL_SPAN_UNITS = 0.0000105;

/**
 * Camera framing distances (in scene units) for inspecting a single spacecraft.
 *
 * These scale with the real body size, because one fixed stand-off cannot frame
 * both a 109 m ISS and a 3.5 m MMS bus: tiny spacecraft would stay a speck at
 * any zoom level. Unknown/degenerate sizes fall back to the procedural span.
 *
 * Returns:
 *   standoff    – framing distance at which the body fills a comfortable share of the view
 *   minDistance – closest allowed zoom (stays outside the hull)
 *   near        – near-plane just inside the closest approach so the mesh never clips
 */
export function computeFocusDistances(physicalSizeMeters) {
  const sizeUnits = physicalSizeMeters > 0
    ? physicalSizeMeters / EARTH_RADIUS_M
    : PROCEDURAL_SPAN_UNITS;
  const standoff    = sizeUnits * 2.0; // ~2 body-lengths away for a comfortable frame
  const minDistance = sizeUnits * 0.6; // closest zoom keeps the hull out of the near plane
  const near        = Math.max(minDistance * 0.12, 1e-9);
  return { sizeUnits, standoff, minDistance, near };
}

/**
 * Tight near/far planes for the dedicated close-up spacecraft render pass.
 *
 * The whole app shares ONE logarithmic depth buffer tuned for a far plane of 1e7
 * (Earth to the outer planets). In the log buffer the fragment depth grows almost
 * linearly with view distance while the distance is small, so a hull scaled to ~1e-6
 * scene units maps to a fraction of a single depth quantum: front and back faces
 * collapse to the same stored depth and z-fight, which is exactly why parts of the
 * model pop in and out as the camera orbits. Re-drawing the focused hull with a camera
 * whose near/far bracket just that hull restores full precision (thousands of quanta)
 * without changing the physical scale of anything.
 *
 * Returns { near, far } guaranteed to satisfy 0 < near < far and to enclose a body of
 * extent `span` centred `camDist` away from the camera.
 */
export function computeOverlayDepthRange(camDist, span) {
  const h = Number.isFinite(span) && span > 0 ? span : 1e-12;
  const d = Number.isFinite(camDist) && camDist > 0 ? camDist : 0;
  const minNear = h * 0.02; // never collapse the near plane onto the camera
  let near = d - h * 2;
  let far  = d + h * 3;
  if (!(near > minNear)) near = minNear;
  if (!(far > near * 1.001)) far = near * 2 + h * 4;
  return { near, far };
}
