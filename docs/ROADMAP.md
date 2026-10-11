# Roadmap

## Shipped

### Core Engine
- [x] Earth (day / night / specular), clouds and atmosphere
- [x] CelesTrak GP fetch (no auth) + IndexedDB caching (1-hour TTL) with a stale-on-outage fallback
- [x] SGP4 propagation via `satellite.js` in 4 Web Workers
- [x] `THREE.Points` rendering per category with custom shaders
- [x] Click-to-select (analytic ray-to-point picking)
- [x] Satellite info panel (orbital elements, live position, TLE, mission links)
- [x] Category / domain / operator / orbit-regime filtering
- [x] Text search, real-time clock + playback speed (incl. reverse)
- [x] Satellite labels, selected-orbit line, all-orbits web

### Solar System
- [x] Moon (LROC albedo, Meeus ephemeris, lunar orbiter fleet)
- [x] Sun (procedural corona, lens flare, solar probe fleet)
- [x] All planets (JPL Keplerian elements, orbit lines, real NASA-derived surface maps, LOD tiers)
- [x] Dwarf planets and natural moons (JPL SBDB + satellite ephemerides, lazy texture tiers)
- [x] Artificial satellites of Mars, Jupiter, Venus & Mercury (real mission data)
- [x] Interstellar / escape probes (Voyager 1-2, Pioneer 10-11, New Horizons) on real JPL Horizons hyperbolic conics
- [x] Van Allen radiation belts
- [x] Cislunar / Lagrange domain filtering

### 3D Models
- [x] GLTF close-ups for 30+ spacecraft (ISS + the NASA 3D Resources fleet)
- [x] Draco-compressed model streaming behind an LRU cache
- [x] Procedural GLONASS-M / Galileo FOC navigation chassis
- [x] Auto-scaling to each object's real physical size

### Interface
- [x] Minimalist mode, collapsible sidebar / info panel
- [x] EN / RU localization
- [x] HUD metrics (FPS, object count, time speed, memory)
- [x] Planet picker (PlanetBar), projected celestial labels
- [x] In-app Legal & Attributions panel

### Deployment
- [x] Cloudflare Pages edge proxy for the CelesTrak feed
- [x] Immutable cache headers + a Functions routing limit

## Planned

### v1.1 — Polish
- [ ] Ground track projection on the Earth surface
- [ ] Pass prediction for a user-supplied location
- [ ] Mobile responsive layout

### v1.2 — Interaction
- [ ] Wire the operator / orbit-regime filters to sidebar controls
- [ ] Animated spacecraft close-ups (deploying solar arrays)

### Later
- [ ] Optional WASM propagator (satellite.js core) for higher throughput
- [ ] Space-Track.org integration (authenticated, via a server-side proxy)

## Known Issues

- The static build needs a host-side proxy for `/api/celestrak/*`; without it,
  set `VITE_CELESTRAK_BASE_URL` to a CORS-enabled endpoint. See
  [`DEPLOY_CLOUDFLARE.md`](DEPLOY_CLOUDFLARE.md).
- The legacy string `bodyFilter` and the `bodyFilters` Set coexist in the store.
- `operatorFilter` / `orbitRegimeFilter` are supported by `setFilters` and the
  store, but no UI control currently sets them.
