# Performance Guide

## Rendering Performance

### Satellite Rendering (PRIMARY BOTTLENECK)

- **Solution:** one `THREE.Points` per category with a custom `ShaderMaterial`
  (~18 draw calls total for 10k+ satellites).
- **Anti-patterns avoided:** an individual `Mesh` per satellite; a single mesh with
  per-frame `Matrix4` updates.
- **Position updates:** set `BufferAttribute.needsUpdate = true`. The geometry is
  never rebuilt — only the GPU buffer is re-uploaded.
- **Point size** attenuates with distance (`size * 180 / camDist`) and is clamped to
  1–9 px, so distant satellites stay 1 px while close ones remain readable.
- **Selection glow** is derived analytically from `gl_PointCoord` (no texture).

### Filtering Without Rebuilding

`setFilters` compacts matching satellites to the front of each category buffer and
shrinks the visible range:

```js
data.positions.set(tempPos);
data.points.geometry.setDrawRange(0, visibleCount);
```

Non-matching satellites are excluded from the draw call with **no geometry
reallocation and no per-frame cost**.

### Distance Culling

Earth-orbit categories are culled by camera distance from the origin:

```js
const fade = clamp((140.0 - camDistEarth) / 60.0, 0, 1); // fade 80 → 140 units
points.material.uniforms.uOpacity.value = fade;          // 0 → invisible
```

This keeps the Earth fleet from being drawn (or adding overdraw) when viewing the
Moon or Sun.

### Worker Thread Architecture

- 4 Web Workers, each propagating N/4 satellites.
- SGP4 runs at **1 Hz** (`UPDATE_INTERVAL = 1000 ms`) — sufficient for visualization.
- **Transferable `Float32Array`** buffers = zero-copy worker → main thread.
- **No `SharedArrayBuffer`** (avoids COOP/COEP headers that break texture loading).
- The GPU buffer is uploaded **once per tick**, after all workers reply — not four
  separate uploads per second.

### Per-Frame Selected Satellite

Only the selected satellite is propagated every frame (analytically, on the main
thread). All other satellites update at 1 Hz. Worker results never overwrite the
selected marker, so it never lags or drifts.

## Earth Shader

- One GLSL pass blends day / night / specular in a single shader; clouds are a
  second transparent sphere layer.
- The day/night blend is a `smoothstep` of `dot(normal, sunDir)` centred on the geometric
  terminator (N·S = 0), with the day side falling off like a Lambertian sphere. The twilight
  width and the day/night gains live in `src/scene/earthLighting.js` and are pinned by
  `tests/verify_earth_lighting.js` — GPU-side, free.

## Texture Budget

All planet surfaces use real NASA-derived equirectangular maps. A lightweight
procedural canvas is rendered instantly as a placeholder and swapped for the real
image at full resolution once it decodes, so no body ever flashes blank.

| Texture | Size | Source / Notes |
|---|---|---|
| Earth day | 8K (8192×4096) | NASA Blue Marble; 8K active at every distance, 2K base paints the first boot frames |
| Earth night | 8K (8192×4096) | city lights; same series as the day tier (the 2K base is a downscale of the 8K master) |
| Earth specular | 2048×1024 | ocean mask |
| Earth clouds | 2K base + live 2K/4K/8K | static fallback bound first, then EUMETSAT tiers streamed by distance |
| Mercury / Venus / Mars | 8K (8192×4096) | Solar System Scope; 2K base + 8K tier streamed on approach |
| Jupiter / Saturn | 4K (4096×2048) | Solar System Scope (no higher master is published) |
| Uranus / Neptune | 2K (2048×1024) | Solar System Scope (no higher master is published) |
| Pluto | 8K (8192×4096) | NASA / JHUAPL / SwRI New Horizons global color mosaic; 2K base + 8K tier |
| Ceres / Haumea / Makemake / Eris | 4K (4096×2048) | Solar System Scope "fictional" maps; 2K base + 4K tier streamed on approach |
| Saturn rings | 8K radial alpha strip | Solar System Scope |
| Moon albedo | 8K / 2K | LROC mosaic |
| Io / Europa / Ganymede / Callisto | 2K (2048×1024) | NASA/JPL/USGS-derived moon maps |
| Titan / Enceladus / Triton / Charon / Phobos / Deimos | 2K (2048×1024) | NASA/JPL and public-domain moon maps |
| Star map | 4096 | celestial-sphere background |

Every map above is served as **WebP** (q92, visually lossless) except the four moon
maps whose source JPEGs are already compact enough that WebP would only add generation
loss (Europa, Ganymede, Callisto, Enceladus), the 2K lunar base (`moon_2k.jpg`, a noisy
map WebP does not shrink) and the star map. The switch cut the `public/` texture payload
from ~99 MB to ~75 MB with no visible change — both tiers of each body still come from the
same master, so a tier swap only ever adds detail.

Planet spheres use 96×96 segments; with mipmaps and 16× anisotropy the surface stays
crisp on the grazing limb while minimising shimmer at distance.

### Progressive & Distance-Streamed Textures

Heavy maps are never on the critical path for first paint, and are only resident when
they can actually be seen:

1. A lightweight base tier (procedural canvas, or the 2K Earth map) is bound immediately.
2. `TextureLODManager` (`src/scene/planets/TextureLODManager.js`) streams higher tiers by
   camera-to-body distance. Because the Earth tiers are preloaded and never evicted, the 8K
   day/night layers stay active at every distance — the 2K base only paints the first frames
   of boot. Planets and dwarfs still stream their finer tiers on approach.
3. The Earth tiers are **preloaded at startup and never evicted** (`preload: true,
   evict: Infinity`). The one-time 8K decode + full-resolution GPU upload therefore lands
   during boot, behind the loading overlay — so no zoom ever has texture work to do and the
   camera stays perfectly smooth. Each tier is decoded off the main thread (`img.decode()`)
   and pre-uploaded with `renderer.initTexture()`.
4. Each tier owns its own `THREE.Texture`, so activating one is an instant reference swap —
   no in-place `image` mutation and no per-frame re-upload. A 1.25× hysteresis band
   prevents thrashing on the threshold.
5. A tier is only released once the camera is far outside its range (a 4× residency
   margin); `evict: Infinity` opts a map out of release entirely, keeping every fetched tier
   resident for the session.
6. Planetary and dwarf tiers stream **lazily** (`preload: false`): only the 2K base is
   fetched at boot, and the 4K/8K tier loads once the camera closes in. Once fetched it is
   **kept resident** (`PLANET_LOD_OPTIONS`, `evict: Infinity`, like Earth), so returning to a
   body is a pure reference swap. Releasing it on zoom-out used to re-download, re-decode and
   synchronously re-upload the map — a hard freeze on every approach. Preloading every 8K tier
   up front would still be wrong: it would hold hundreds of MB of GPU memory and stall the
   loading overlay decoding maps the camera never approaches.
7. Both tiers of a body come from the **same source master** and share one
   `MeshStandardMaterial`, so a tier swap rebinds `material.map` only — never the colour
   space, lighting or tone mapping — and is not visible as a colour shift, only as added detail.
8. If a map is missing, the base tier simply stays — graceful degradation, never a blank
   sphere.
9. The generic procedural surface for moons and dwarf planets with no real map (~200 ms of
   fractal maths per body) is synthesised in a **worker pool** (`src/workers/surface.worker.js`
   over the shared, DOM-free `proceduralSurface.js`), never inline in the render loop. Revealing
   a whole group of bodies at once — the moons/dwarf toggle — therefore costs no frame time; each
   body shows the shared placeholder until its surface arrives, then swaps to it.

This is the foundation for adding more tiers (16K, tiled/virtual textures) without
touching the render loop.

## CPU Performance

```
Main thread: postMessage({ type: 'propagate', data: { timeMs } })   // 1 Hz
Worker:      SGP4 × N/4 satellites → Float32Array
Worker:      postMessage({ type: 'positions', positions, valid, ids },
                          [positions.buffer, valid.buffer])          // transferred
Main thread: geometry.attributes.position.needsUpdate = true          // once per tick
```

- Pre-allocated `THREE.Vector3` scratch objects in `SceneManager` avoid per-frame
  allocations (zero-GC steady state).
- The simulation clock is advanced every frame inside `SceneManager._loop`, but is only
  published to the Zustand store every 100 ms. UI components subscribe with selectors
  (`shallow`), so the render loop never forces the app shell to re-render at 60 fps.
- Labels are drawn from a pool of 60 canvas sprites with screen-space anti-overlap.

### Frame Budget (60 fps target = 16.67 ms/frame)

| Task | Budget | Notes |
|---|---|---|
| Three.js render | ~8 ms | ~18 satellite draw calls + scene layers |
| Controls update | ~0.5 ms | OrbitControls damping |
| Position upload | ~1 ms | copy Float32Array ranges once per tick |
| React re-renders | ~0 ms | clock published at 10 Hz; components use selectors |
| Total | ~10 ms | ~6 ms headroom |

## Memory

- Per satellite: ~200 bytes metadata + 12 bytes position ≈ 212 bytes.
- 10,000 satellites: ~2.1 MB; TLE strings: ~2 MB.
- Textures: distant bodies hold only their base tier; the 8K Earth day + night pair
  (~350 MB with mipmaps) is preloaded at boot and kept resident for the whole session, so it
  stays active however far the camera pulls back.
- Total: comfortable on desktop GPUs; mobile should drop the 8K upgrade.

## Picking (Click Detection)

- `SatelliteManager.pick(ndcX, ndcY)` performs an **analytic ray-to-point** test:
  it iterates the visible range and scores candidates by distance to the click ray
  and to the camera.
- A drag threshold (12 px) in `App.jsx` distinguishes a click from an OrbitControls
  rotation.
- No `Raycaster` against individual satellites; picking runs only on click.

## Tuning Tips

| Scenario | Optimization |
|---|---|
| Low-end / mobile | Skip the 8K Earth upgrade in `Earth.js` (keep the 2K maps), lower star-map resolution, disable clouds/atmosphere, reduce point size |
| Large constellation feeds | Increase `WORKER_COUNT` (e.g. 8) |
| Higher accuracy | Decrease `UPDATE_INTERVAL` (e.g. 100 ms) |
| Deep-space view | Earth fleet is already distance-culled; keep `logarithmicDepthBuffer` on |
