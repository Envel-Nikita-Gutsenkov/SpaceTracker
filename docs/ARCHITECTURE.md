# Space Tracker — Architecture

## Overview

A real-time 3D web application for tracking satellites and exploring the
Solar System. Satellite positions are propagated with SGP4 from live TLE
data, rendered as GPU point clouds, and updated every second off the main thread.
An optional deep-space layer adds the Moon, Sun, planets, radiation belts and a
close-up 3D model of the selected spacecraft.

## Technology Stack

| Area | Technology | Notes |
|---|---|---|
| UI | React 18 | Panels are plain components; no React work inside the render loop |
| State | Zustand 4 | Single store (`useSatStore`) shared by React and the Three.js layer |
| Rendering | Three.js r167 | Scene graph, OrbitControls, custom GLSL shaders |
| Propagation | satellite.js 5 | SGP4/SDP4 (Vallado port) |
| Astronomy | In-house | Meeus solar/lunar ephemeris, Keplerian planet elements, WGS-84 geodesy |
| Data | CelesTrak GP | Live TLE/3LE via a dev proxy or an edge proxy (`/api/celestrak`) |
| Data | Wikipedia API | Mission description extracts for the info panel |
| Cache | IndexedDB | DB `space-tracker-v13`; satellites 1 h TTL (10 min when degraded) with stale-while-revalidate, Wikipedia 24 h TTL, stale-on-outage fallback |
| Concurrency | Web Workers (ES modules) | 4 workers propagate SGP4 in parallel |
| Build | Vite 5 | `worker.format: 'es'`, `build.target: 'esnext'` |
| Deploy | Cloudflare Pages | Static build + edge Function; see [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md) |

## Rendering Approach

Satellites are **not** individual meshes and **not** an `InstancedMesh`. Each
category is a single `THREE.Points` object with a custom `ShaderMaterial`
(~18 draw calls total for 10k+ satellites):

- Per-point size attenuates with camera distance and is clamped to 1–9 px.
- The glow around a selected satellite is computed analytically from
  `gl_PointCoord` (`smoothstep`) — no textures, additive blending.
- The selected satellite's dot is hidden in the vertex shader (`uHideSelectedId`)
  when its 3D model is shown, by moving it outside the clip volume.
- Filtering is done by compacting matching items to the front of the buffer and
  shrinking `geometry.setDrawRange(0, N)` — no geometry rebuild.

Other scene layers: Earth (day/night/specular shader + separate cloud sphere),
Atmosphere (Fresnel shell), Stars (NASA celestial-sphere texture), Sun (procedural
corona + lens flare), Moon (LROC albedo + regolith shading), planets
(`PlanetMeshBuilder` + real NASA-derived equirectangular maps from
`PlanetTextureGenerator`), `VanAllenBelts`, `SatelliteModel`
(GLTF with a procedural fallback bus) and `OrbitLine` (selected orbit + optional
"all orbits" web).

The same `PlanetMeshBuilder` / `PlanetTextureGenerator` pipeline also renders the dwarf
planets and natural moons registered in `smallBodies.js` (elements from `dwarfPlanets.js`
and `moons.js`, positions via `smallBodyEphemeris.js`). They stay hidden until the
matching Display toggle is switched on or the body is selected directly, keeping the
default scene at the classical eight planets plus Pluto.

`SatelliteModel` streams a real NASA GLTF model the first time a flagship object
is focused, swapping it in behind the procedural placeholder. Most NASA exports use
Draco mesh compression (`KHR_draco_mesh_compression`), so the loader wires up
`DRACOLoader` with the decoder bundled in `public/draco/` (loaded on demand from the
app origin). Models are keyed by
NORAD catalogue number in `spacecraftModels.js`, which also holds the sizing
helpers and the facing vectors. Because NASA exports use wildly inconsistent
units, the loader measures each model's bounding box and auto-scales its largest
dimension to the object's real physical size. Loaded models are held in a
least-recently-used cache (4 slots); the oldest entry (never the one on screen) is
evicted and its geometry, materials and textures fully disposed, bounding VRAM/RAM
even as the fleet of close-up models grows.

`VanAllenBelts` draws the two main radiation belts as closed dipole L-shells from the
geomagnetic field-line equation `r = L·cos²λ` (McIlwain L, in Earth radii). The shells
span the published empirical extents — inner proton belt `L ≈ 1.2–2.4`, outer electron
belt `L ≈ 3.1–6.0`, with the radiation slot region between — and terminate on the
ionospheric loss cone at `r = 1.0157`. The whole group is tilted 9.4° about the spin axis
to match the current-epoch geomagnetic dipole (IGRF-13: `atan(√(g11²+h11²)/|g10|) = 9.41°`;
the 2020 geomagnetic pole sits at 80.65° N) and **co-rotates with the planet** — the field
is frozen into the conducting interior, so `VanAllenBelts.update(gmst)` spins the shell
with the Earth's sidereal rotation. The model is a deliberately simplified **centred
dipole**: it omits the *eccentric*-dipole offset — the real dipole centre sits ~489 km
(0.077 R⊕; Fraser-Smith 1987) from the Earth's centre toward 20.4° N, 147° E, which is
what produces the South Atlantic Anomaly — and uses time-averaged, flux-agnostic shells
rather than an IGRF/AP-8 field. Those simplifications are asserted explicitly by
`tests/verify_van_allen.js`, which checks the
geometry, the 1:1 scale (1 unit = 6371 km), the orientation and the extents against
independent math.

The cloud layer upgrades the bundled static map to a **near-real-time** one
(`CloudService`): a gap-free grayscale cloud map of the whole Earth, re-composited by
"Live cloud maps" from **EUMETSAT** data and refreshed every three hours. It is served
over CORS and streamed by the same `TextureLODManager` as the day/night layers, in 2K/4K/8K
tiers keyed to camera proximity (the 2K base is always on; the finer tiers load as the
camera closes in and are released again when it pulls back). The static
`public/earth_clouds_2048.webp` is bound first and stays resident until the live base tier
has decoded, so the swap is seamless; if the service is unreachable the static map simply
stays — a network failure can never blank the globe.

Planet and Earth maps load progressively through `TextureLODManager`: a procedural (or
2K) base tier is shown immediately and higher-resolution tiers stream in by camera
distance (the 8K Earth layers stay active at every distance, so pulling back never swaps
in the coarser image). Each tier is a separate
texture, decoded off-thread and pre-uploaded. The Earth tiers are preloaded at startup and
never evicted, so their one-time decode + GPU upload happens during boot and crossing a
distance threshold is a pure reference swap — zooming never triggers a stall. Planet and
dwarf tiers stream lazily (only the 2K base loads at boot) but are kept resident once
fetched, so the one-time decode + upload for a body happens on first approach and every
later approach is an instant swap. Nothing is fetched until the camera goes there, so
distant bodies never hold high-resolution VRAM. Bodies with no real map (most moons and
several dwarfs) get a procedural surface instead, synthesised in a worker pool
(`surface.worker.js`) rather than on the render thread, so revealing a whole group of
them at once never stalls a frame.

## Orbital Mechanics

- **SGP4** runs in `src/workers/propagator.worker.js`. `SatelliteManager` spawns
  4 workers, each holding its own slice of satrecs.
- Each worker returns a `Float32Array` of positions (Earth-radius units, Three.js
  axes) **transferred** across the boundary — zero copy.
- **No `SharedArrayBuffer`** is used, so no COOP/COEP headers are required and
  textures load normally.
- The main thread keeps a global `master` buffer; the GPU buffer is uploaded once
  per tick, after all workers have replied.
- The currently selected satellite is propagated analytically every frame so its
  marker never lags behind; worker data never overwrites it.

## Data Sources

| Source | Purpose | Cadence |
|---|---|---|
| CelesTrak `gp.php?GROUP=…` | GP element sets across the core groups | fetch on load, stale-while-revalidate (1 h / 10 min degraded) |
| CelesTrak `gp.php?CATNR=…` | flagship objects fetched if absent from groups | fetch on load |
| CelesTrak `gp.php?NAME=STARLINK` | Starlink constellation | fetch on load |
| Bundled `public/satellites-fallback.json` | last-known-good catalogue; fills any group a throttled fetch drops | regenerated by `tools/fetch_satellite_fallback.mjs`, fetched only when a load looks incomplete |
| Wikipedia `w/api.php` | mission description extract for the info panel | on satellite select, cached 24 h |
| NASA Visible Earth | Earth day (8K) / night (8K) / specular / clouds textures | local static assets in `public/` |
| EUMETSAT (via "Live cloud maps") | Near-real-time cloud map, streamed in 2K/4K/8K tiers | fetch on load, ~3 h refresh, static fallback |
| Solar System Scope (CC BY 4.0) | Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Saturn rings, and the Ceres/Haumea/Makemake/Eris *Fictional* pack | local static assets |
| NASA / JHUAPL / SwRI New Horizons | Pluto global color mosaic | local static asset |
| NASA LROC | Moon albedo | local static asset |
| NASA SVS "Deep Star Maps 2020" (SVS 4851) | sky background sphere (credit NASA/GSFC SVS; Gaia DR2: ESA/Gaia/DPAC) | local static asset |
| Sketchfab "unaipl2003" | ISS 3D model (GLTF) | local static asset, CC BY 4.0 |
| NASA 3D Resources | Close-up 3D models for 20+ spacecraft | local static assets, loaded on demand |
| Draco (Google, Apache-2.0) | mesh decompression decoder bundled in `public/draco/` | local static asset, loaded on demand |
| Meeus algorithms | Sun & Moon ephemeris | computed client-side |
| JPL Keplerian elements (Standish) | planet positions | computed client-side |
| JPL Horizons (osculating elements) | interstellar probe trajectories | computed client-side |
| NASA/ESA/JAXA/CNSA/MBRSC mission fact sheets | other-planet orbiter orbital data | curated static data |
| JPL SBDB (osculating elements) | dwarf-planet trajectories | computed client-side |
| JPL planetary satellite ephemerides | natural-moon orbits | computed client-side |

### Licensing

The project itself is MIT (see `LICENSE`). All bundled third-party assets and
their required attributions are listed in `THIRD-PARTY-NOTICES.md` and shown in
the in-app **Legal & Attributions** panel. Several sources require attribution
under Creative Commons: **Solar System Scope** textures (CC BY 4.0), the
**Sketchfab ISS** model (CC BY 4.0), the **Askaniy** Ganymede/Callisto/Phobos/
Deimos maps (CC BY-SA 3.0), and **Wikipedia** extracts (CC BY-SA 4.0). The
streamed cloud map uses **EUMETSAT** data, which requires the notice *"Contains
modified EUMETSAT data"*; the "Live cloud maps" processing and images are CC0.

The **MIT License covers the source code only** — bundled assets keep their own
terms, and downscaled/re-encoded maps are derivatives that stay under the source
license (the CC BY-SA maps remain CC BY-SA). NASA/US-Government data is generally
not copyrighted, but the ESA, EUMETSAT and CC BY/BY-SA sources are not public
domain and may need separate permission for commercial or operational use. This
is an independent, unaffiliated hobby project provided without warranty; see
`THIRD-PARTY-NOTICES.md` for the per-asset terms.

## Frontend Architecture

```
App (React 18 + Zustand store)
├── SceneCanvas (plain <canvas>, no React inside the render loop)
│   └── SceneManager
│       ├── Earth / Atmosphere / Clouds
│       ├── Stars, Sun (corona + flare, solar probes)
│       ├── Moon (LROC, lunar satellites)
│       ├── PlanetarySystem (8 planets + Pluto + toggleable dwarf planets & moons, orbit lines)
│       ├── VanAllenBelts
│       ├── SatelliteManager (THREE.Points per category, worker pool, labels, picking)
│       ├── OrbitLine (selected orbit + all-orbits web)
│       └── SatelliteModel (GLTF / procedural close-up)
├── Sidebar          — domains, categories, display & time toggles
├── PlanetBar        — celestial body picker (dropdown)
├── CelestialLabels  — clickable HUD labels projected from the scene
├── SearchBar        — name / NORAD search
├── HUD              — UTC clock, optional metrics (FPS, objects, speed, memory)
└── InfoPanel        — live position, orbital elements, TLE, mission links
```

## Performance Strategy

1. **One `THREE.Points` per category** — ~18 draw calls for the whole catalogue.
2. **Worker pool** — 4 workers propagate in parallel, one chunk of TLEs each.
3. **Transferable buffers** — zero-copy worker → main thread transfer.
4. **Batched GPU upload** — one buffer update per tick, not one per worker.
5. **Compact `drawRange` filtering** — matching items are moved to the front;
   hidden items cost zero GPU time without reallocating geometry.
6. **Distance culling** — Earth-orbit categories fade out between 80 and 140 units
   from the origin and are fully culled beyond that (relevant near the Moon/Sun).
7. **Analytic selection** — the selected satellite is updated per frame in the main
   thread; the rest update at 1 Hz.
8. **Zero-GC loop** — pre-allocated `Vector3` scratch objects in `SceneManager`.
9. **Label pool** — 60 canvas sprites reused, with screen-space anti-overlap.
10. **Analytic picking** — a ray-to-point test over the visible range, not a
    `Raycaster` against thousands of meshes.

### Trade-offs

- `logarithmicDepthBuffer: true` gives correct depth from LEO to Pluto at some
  fragment-shader cost.
- Earth (96×96) and Clouds (128×128) spheres are poly-heavy but static.

## Offline Resilience

All network data is cached so the app stays usable without connectivity:

- **Satellites** — the catalogue is served stale-while-revalidate: any cached
  snapshot is painted immediately. A complete snapshot is trusted for 1 h, a
  degraded one for 10 min, after which a fresh catalogue is fetched in the
  background. The group feeds are fetched in waves of 4 (CelesTrak throttles
  bursts) with a single retry wave and a 15 s per-request timeout, and any group
  that fails or comes back empty is topped up from the bundled
  `public/satellites-fallback.json` snapshot, so a throttled load never blanks a
  sidebar category. The degraded result is cached (flagged `complete: false`) so
  the next boot is instant; it refreshes again after 10 min. An empty result is
  never cached — the sky is never empty.
- **Wikipedia** — extracts are cached for 24 h; a network failure falls back to
  the last cached extract for that satellite.
- **Storage fallback** — if IndexedDB is unavailable the cache degrades to an
  in-process `Map` (see `services/cache.js`).
- **Still remote-only**: Google Fonts (`index.html`) and CelesTrak itself. In a
  static production build the `/api/celestrak/*` route must be served by an
  edge/host proxy (the repo ships a Cloudflare Pages Function for this — see
  [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md)) or by pointing
  `VITE_CELESTRAK_BASE_URL` straight at `https://celestrak.org`. All other
  libraries, textures and models are bundled or local in `public/`.

## Data Flow

```
CelesTrak gp.php ──► DataService (fetch, parse 3LE, dedupe, sort, IndexedDB cache)
                           │
                       Satellite[]  (metadata + TLE)
                           │
                 ┌─────────┴─────────┐
             Worker 0            Worker 1..3        (SGP4, 1 Hz)
                 │                   │
        Float32Array (transferable, zero-copy)
                 └────────────► SatelliteManager.master
                                        │
                                 _syncGeometry()  (once per tick)
                                        │
                                 THREE.Points  →  WebGL  →  Screen
```

## Deployment

Space Tracker is a fully static bundle (`npm run build` → `dist/`). Hosting it
requires serving `dist/` plus a small proxy for `/api/celestrak/*` — no separate
backend, database or build-time secret.

- **Quick start:** any static host (Netlify, GitHub Pages, S3, Nginx), with
  `VITE_CELESTRAK_BASE_URL=https://celestrak.org` set at build time. CelesTrak
  replies with `access-control-allow-origin: *`, so a direct browser fetch works.
- **Recommended:** Cloudflare Pages, which runs the bundled edge Function that
  proxies `/api/celestrak/*` on the same origin (so the default base works
  unchanged) and applies the `public/_headers` cache policy. Full walkthrough:
  [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md).

## File Structure

```
Space/
├── docs/                   this folder (ARCHITECTURE, API, PERFORMANCE, ROADMAP, DEPLOY_CLOUDFLARE)
├── functions/
│   └── api/celestrak/[[path]].js  Cloudflare Pages edge proxy for the CelesTrak GP feed
├── public/
│   ├── earth_{day,night}_{2048,8k}.webp   Earth day / night (2K base + 8K, one image series)
│   ├── {mercury,venus,mars}_*.webp      planet maps (2K base + 4K/8K tiers)
│   ├── {jupiter,saturn}_*.webp          planet maps (2K base + 4K tier)
│   ├── {uranus,neptune}_2k.webp         planet maps (2K, no higher master published)
│   ├── pluto_{2k,8k}.webp   New Horizons global color mosaic (2K base + 8K tier)
│   ├── saturn_ring_8k.png  radial ring alpha strip
│   ├── moon_2k.jpg + moon_8k.webp  lunar albedo maps (2K base + 8K tier)
│   ├── {ceres,haumea,makemake,eris}_{2k,4k}.webp  dwarf-planet maps (2K + 4K tiers)
│   ├── {io,titan,triton,charon,phobos,deimos}_2k.webp  moon maps (WebP)
│   ├── {europa,ganymede,callisto,enceladus}_2k.jpg  moon maps (JPEG; WebP gains nothing)
│   ├── starmap_nasa_4096.jpg
│   ├── models/             34 GLTF spacecraft models (ISS + NASA fleet + 2 procedural)
│   ├── draco/              Draco decoder (wasm wrapper + binary + JS fallback)
│   ├── _headers            Cloudflare Pages cache policy
│   └── _routes.json        limits the Functions runtime to /api/celestrak/*
├── src/
│   ├── main.jsx, App.jsx, App.css
│   ├── scene/
│   │   ├── SceneManager.js         init, render loop, focus/tracking, pick
│   │   ├── Earth.js, Atmosphere.js, planetAtmospheres.js, Stars.js, Sun.js, Moon.js
│   │   ├── DeepSpaceFleet.js       interstellar probe markers + escape trails
│   │   ├── fleetMeshFactory.js     procedural meshes for the non-Earth fleets
│   │   ├── SatelliteManager.js     points, workers, filters, labels, picking
│   │   ├── SatelliteModel.js       GLTF close-up + procedural fallback
│   │   ├── spacecraftModels.js     model registry, sizing and facing vectors
│   │   ├── OrbitLine.js            selected orbit + all-orbits web
│   │   ├── VanAllenBelts.js
│   │   ├── textureReadiness.js, textureUpload.js  off-thread decode + GPU pre-upload
│   │   └── planets/                PlanetarySystem, PlanetFleet, PlanetMeshBuilder, PlanetTextureGenerator, TextureLODManager, equirectUV
│   ├── components/                 Sidebar, InfoPanel, HUD, SearchBar, PlanetBar, CelestialLabels
│   ├── services/
│   │   ├── DataService.js          fetch, parse, cache satellites
│   │   ├── WikiService.js          cached Wikipedia extracts (info panel)
│   │   ├── CloudService.js         live EUMETSAT cloud-map tiers
│   │   └── cache.js                shared IndexedDB cache + in-memory fallback
│   ├── store/useSatStore.js        Zustand store
│   ├── utils/
│   │   ├── astronomy.js            GMST, Sun/Moon ephemeris, WGS-84, orbit regimes
│   │   ├── ephemeris.js            Kepler solver, planet positions/trajectories
│   │   ├── keplerEquation.js       shared Kepler-equation solver
│   │   ├── planetaryData.js        J2000 elements + physical data
│   │   ├── planetaryLabels.js      projected celestial-label anchors
│   │   ├── categories.js           category definitions + detectCategory()
│   │   ├── celestialFleet.js       static solar/lunar probe fleet
│   │   ├── planetaryFleet.js       artificial satellites of the other planets
│   │   ├── deepSpaceProbes.js      interstellar probe elements (JPL Horizons)
│   │   ├── conicPropagation.js     elliptic + hyperbolic conic propagation
│   │   ├── dwarfPlanets.js         dwarf-planet elements + physical data (JPL SBDB)
│   │   ├── moons.js                natural-moon elements + physical data (JPL)
│   │   ├── smallBodies.js          unified ALL_BODIES registry + lookups
│   │   ├── smallBodyEphemeris.js   dwarf/moon position + orbit-point maths
│   │   ├── celestialOcclusion.js   body-in-front-of-body occlusion tests
│   │   ├── focusTransition.js      eased camera focus transitions
│   │   ├── perfProbe.js            frame-stage timing probe
│   │   ├── missionDatabase.js      mission links & descriptions
│   │   └── i18n.js                 EN / RU strings
│   └── workers/propagator.worker.js
├── tests/                  node verification suites (math, textures, ephemeris, i18n, …)
├── tools/                  one-off GLB builders (procedural chassis + NASA STL merge)
├── index.html, vite.config.js, package.json, wrangler.toml
├── LICENSE                 MIT (project license)
├── THIRD-PARTY-NOTICES.md  bundled asset & dependency attributions
└── README.md               project overview, quick start and credits
```
