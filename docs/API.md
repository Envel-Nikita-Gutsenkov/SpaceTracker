# API Reference

## External Data Sources

### CelesTrak GP (`gp.php`, no auth)

Fetched through the Vite dev proxy, which rewrites `/api/celestrak/*` to
`https://celestrak.org/*`.

The base path is configurable via the `VITE_CELESTRAK_BASE_URL` env var
(default `/api/celestrak`), so a production deploy can point it at its own
reverse proxy / edge function.

| Use | Request |
|---|---|
| Group feed | `/api/celestrak/NORAD/elements/gp.php?GROUP=<group>&FORMAT=3le` |
| Single object | `/api/celestrak/NORAD/elements/gp.php?CATNR=<noradId>&FORMAT=3le` |
| Starlink | `/api/celestrak/NORAD/elements/gp.php?NAME=STARLINK&FORMAT=3le` |

Groups fetched on load: `stations`, `science`, `tdrss`, `visual`, `glo-ops`,
`gps-ops`, `galileo`, `beidou`, `weather`, `geo`, `radar`, `iridium-NEXT`,
`planet`, `spire`, `oneweb`, `starlink`, `cubesat`, `military`, `amateur`,
`satnogs`, `globalstar`, `orbcomm`, `sarsat`.

Response format is 3LE (name line + TLE line 1 + TLE line 2 per object).

> **Production note.** The Vite dev proxy only exists in `npm run dev`. On a static
> deploy `/api/celestrak/*` must be served by an equivalent proxy. The Cloudflare
> Worker `worker/index.js` provides it at the edge (see `docs/DEPLOY_CLOUDFLARE.md`),
> so the default base works unchanged. Alternatively, set
> `VITE_CELESTRAK_BASE_URL=https://celestrak.org` — CelesTrak sends
> `access-control-allow-origin: *`, so a direct browser fetch is allowed.

### Wikipedia (`w/api.php`, no auth)

Used by `WikiService` to fill the mission description in `InfoPanel`. The
user's language edition is queried first, then the other edition as a fallback:

| Use | Request |
|---|---|
| Summary extract | `https://<ru\|en>.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=<title>&gsrlimit=5&prop=extracts&exintro=1&explaintext=1` |

Results are cached (24-hour TTL) so a previously opened satellite still shows
its description offline. Hits are ranked by search relevance and, for titles
guessed from the object name, filtered by token overlap — so a generic
designation yields no article rather than a wrong one.

## Internal API

### DataService

```js
// Fetch, parse, dedupe and cache the full catalogue
DataService.loadAll(
  onProgress?: (percent: number, message: string) => void,
  onRefresh?: (fresh: Satellite[]) => void,   // background-refresh result
) → Promise<Satellite[]>

// Clear the satellite cache entry
clearCache() → Promise<void>
```

Cache: shared IndexedDB store (see [Cache](#cache)), key `satellites`. The
catalogue is served **stale-while-revalidate**: any cached snapshot — even a
degraded one — is returned immediately so the app paints without waiting on the
network. A complete snapshot is trusted for 1 hour, a degraded one for 10
minutes; once past its TTL a fresh catalogue is fetched in the background and
handed to `onRefresh`. Only a cold start (no cache) blocks on the network.

The CelesTrak group feeds are fetched in waves of 4 with a single retry wave,
each request bounded by a 15 s timeout. If a group fails or parses to no objects
(CelesTrak answers a throttled/unknown group with HTTP 200 and an unparseable
body), the missing and suspiciously thin groups are topped up from the bundled
`public/satellites-fallback.json` snapshot. The degraded result **is** cached
(flagged `complete: false`) so the next boot is instant, but it refreshes again
after 10 minutes instead of the full hour. An empty result is never cached.
Every failed group is reported with `console.error`.

Satellite shape (produced by `parse3LE`):

```js
{
  id: number,              // NORAD catalogue number
  name: string,
  tle1: string,
  tle2: string,
  category: string,        // see category table below
  country: string,
  launchDate: string,
  intlDesignator: string,  // COSPAR / international designator
  objectType: string,      // 'PAYLOAD'
  meanMotion: number,      // rev/day
  eccentricity: number,
  inclination: number,     // deg
  raan: number,            // deg
  argPerigee: number,      // deg
  meanAnomaly: number,     // deg
  epoch: string,           // TLE epoch as an absolute UTC timestamp (ISO 8601)
  epochMs: number,         // TLE epoch in ms since the Unix epoch (freshness checks)
  epochRaw: string,        // original TLE epoch field (YYDDD.DDDDDDDD)
  bstar: number,           // drag term
  revAtEpoch: number,
  apogeeKm: number,
  perigeeKm: number,
}
```

`utils/celestialFleet.js` also provides static `SOLAR_SATS` / `LUNAR_SATS`
entries merged into the store (they carry `isSolar` / `isLunar` flags and are
rendered by the Sun / Moon objects, not the Points cloud).

### WikiService

```js
// Cached Wikipedia extract for a satellite
WikiService.getExtract({
  satId,            // cache key (id or name)
  primaryLang,      // 'ru' | 'en' — queried first
  secondaryLang,    // queried only if the primary edition has no page
  primaryTitle,
  secondaryTitle,
}) → Promise<{ text, wikiUrl, wikiTitle, lang } | null>
```

A 24-hour-fresh cache entry is returned immediately. On a network failure the
last cached extract (if any) is returned; otherwise `null`.

### Cache

`services/cache.js` is the shared persistence layer used by both services.
Values are stored in IndexedDB (database `space-tracker-v11`, store `cache`) so
they survive reloads; when IndexedDB is unavailable (private mode, blocked
storage, non-browser runs) an in-process `Map` is used as a transparent
fallback.

```js
cacheGet(key)          → Promise<any | null>
cacheSet(key, value)   → Promise<void>
cacheClear()           → Promise<void>   // wipes every entry
```

### SatelliteManager

```js
const mgr = new SatelliteManager(scene, camera);

mgr.load(satellites);                 // build Points per category, start workers
mgr.setFilters(                       // visibility + filtering (compact drawRange)
  visibleCategories,                  // Set<string>
  searchQuery,                        // string
  operatorFilter,                     // 'all' | 'nasa_usa' | 'russia' | 'esa' | 'china' | 'spacex'
  orbitRegimeFilter,                  // 'all' | 'leo' | 'meo' | 'geo' | 'heo'
  bodyFilters                         // Set<'earth'|'moon'|'sun'|'cislunar'>
);
mgr.update(timeMs);                   // per-frame: selected sat + fast-forward ticks
mgr.updateCameraDistance(camDistEarth); // distance fade / cull of Earth-orbit points
mgr.setSelectedId(satId);             // highlight + keep the marker in sync
mgr.setHiddenSelectedId(satId);       // hide the dot when the 3D model is shown
mgr.getPositionOf(satId, timeMs);     // → { x, y, z } | null (live ECI→scene position)
mgr.pick(ndcX, ndcY);                 // → Satellite | null (analytic ray-to-point)
mgr.setPointSize(px);
mgr.destroy();
```

### Propagator Worker

Message to worker:

```js
{ type: 'init',      data: [{ id, tle1, tle2, gi }] }   // gi = global index
{ type: 'propagate', data: { timeMs } }
```

Message from worker:

```js
{ type: 'ready',     count }
// positions: Float32Array [x0,y0,z0, x1,y1,z1, …] in Earth-radius units, Three.js axes
// valid:     Uint8Array   (1 = propagated, 0 = failed for that satrec)
// Transferred (zero-copy):
{ type: 'positions', positions, valid, ids }   // transfer: [positions.buffer, valid.buffer]
```

## Satellite Categories

Defined in `src/utils/categories.js`; `detectCategory(group, name)` assigns a
category from the feed group and object name.

| ID | Name | Group | Color |
|---|---|---|---|
| `iss` | ISS (Space Station) | stations | `#00ffaa` |
| `cargo` | ISS Resupply / Cargo | stations | `#fca311` |
| `stations` | Tiangong & Modules | stations | `#ff70a6` |
| `science` | Science & Hubble | science | `#00e5ff` |
| `gps` | GPS (USA) | gps-ops | `#ffcc00` |
| `glonass` | GLONASS (RU) | glo-ops | `#ff6600` |
| `galileo` | Galileo (EU) | galileo | `#aa44ff` |
| `beidou` | BeiDou (CN) | beidou | `#ff4488` |
| `weather` | Weather & NOAA | weather | `#44ddff` |
| `geo` | Geostationary Comm | geo | `#ffaa00` |
| `iridium` | Iridium NEXT | iridium-NEXT | `#00b4d8` |
| `oneweb` | OneWeb Mega-Const. | oneweb | `#7209b7` |
| `planet` | Earth Imaging | planet | `#48cae4` |
| `cubesat` | CubeSats / Nano | cubesat | `#f72585` |
| `satnogs` | SatNOGS Open Net | satnogs | `#06d6a0` |
| `iot` | IoT & Messaging | globalstar | `#118ab2` |
| `radar` | SAR Radar Imaging | radar | `#ffd166` |
| `starlink` | Starlink (SpaceX) | starlink | `#4488ff` |
| `military` | Military & Recon | military | `#ff5c5c` |
| `amateur` | Amateur Radio | amateur | `#9ef01a` |
| `other` | Other Satellites | active | `#778da9` |

Note: `military` and `amateur` are full categories with their own colour and
dot size. Like every entry in `CATEGORIES`, each is rendered as its own
`THREE.Points` layer; any group that maps to nothing falls back to `other`.
