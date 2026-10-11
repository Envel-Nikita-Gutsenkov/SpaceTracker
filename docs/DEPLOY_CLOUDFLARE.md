# Deploying to Cloudflare (Workers)

The app deploys as a **Cloudflare Worker with static assets**: the Vite build in
`./dist` is served from Cloudflare's asset collection, and a small Worker handles
the one dynamic route, the CelesTrak proxy. No backend, no secrets and no
build-time environment variables are required.

## What in the repo supports this

| File | Role |
|---|---|
| `wrangler.toml` | Declares `main = "worker/index.js"` and `[assets] directory = "./dist"`. |
| `worker/index.js` | Proxies `/api/celestrak/*` → `https://celestrak.org/*` (the app's default base). Only `GET`/`HEAD`, and only `/NORAD/elements/*` paths. Bounds each upstream call with a 5 s timeout and one retry on 5xx, and adds `stale-if-error` so the edge can serve the last good copy while CelesTrak's origin recovers. |
| `public/_headers` | Cache policy: hashed bundles and stable-named textures get a yearly `immutable` cache; `/index.html` revalidates so new deploys appear at once. Workers static assets honour `_headers`. |

Because asset-first routing is the default (`run_worker_first` is not set), every
texture/model/bundle request is served straight from the asset collection and the
Worker is only invoked for `/api/celestrak/*`, so the proxy adds no asset latency.

## Build settings (Cloudflare dashboard)

| Field | Value |
|---|---|
| Build command | `npm run build` |
| **Deploy command** | `npx wrangler deploy` |
| Root directory | `/` |

- The **Deploy command must be `npx wrangler deploy`**. Do **not** use
  `npx wrangler pages deploy …` (that is the Pages flow) — on a Worker project it
  fails with "error occurred while running deploy command", and `wrangler deploy`
  against a Pages-shaped config fails with "Workers-specific command in a Pages
  project".
- The Worker `name` in `wrangler.toml` (`space`) must match the project name in the
  Cloudflare dashboard. If they differ, rename the project or the `name`.

## Local preview

```bash
npm run build
npx wrangler dev          # serves ./dist + the Worker at http://localhost:8787
```

## Direct deploy from a laptop

```bash
npm run build
npx wrangler deploy
```

## Verify

Open the site, then DevTools → Network, and trigger a satellite load:

- `/api/celestrak/NORAD/elements/gp.php?GROUP=stations&FORMAT=3le` → `200` and
  `cache-control: public, max-age=1800`.
- `/assets/index-*.js` → `cache-control: public, max-age=31536000, immutable`.

## Notes

- **No secrets.** CelesTrak needs no auth; the Worker is same-origin.
- **Fallback without the Worker:** set `VITE_CELESTRAK_BASE_URL=https://celestrak.org`
  at build time and drop the proxy. CelesTrak sends `access-control-allow-origin: *`,
  so a direct browser fetch works — the edge proxy is still preferable (one origin,
  edge cache).
- **Traffic:** ~20 MB on a first visit; repeat visits are served from the immutable
  cache with only `/index.html` revalidating.
- **Safety:** the Worker only forwards `/NORAD/elements/*` with `GET`/`HEAD`, so it
  cannot be used as an open proxy.
