// Cloudflare Worker: serves the built SPA as static assets and proxies CelesTrak GP data.
//
// With the default asset-first routing (`run_worker_first` unset) the Worker is only
// invoked for requests that match no static asset, i.e. `/api/celestrak/*`. Everything
// else is served straight from the asset collection, so textures never hit this code.

const UPSTREAM = 'https://celestrak.org';

// Only the GP endpoints the app uses, so this can never become an open proxy to
// arbitrary celestrak.org paths.
const ALLOWED_PREFIX = '/NORAD/elements/';

// CelesTrak refreshes GP data roughly twice a day. A 30-minute edge cache keeps it
// fresh while shielding the origin; the client re-caches for an hour in IndexedDB.
const CACHE_SECONDS = 1800;

// CelesTrak's origin intermittently times out under load, which surfaces at the edge as a 522.
// Fail a hung upstream request fast, retry it once, and let the edge keep serving the last good
// copy for a day while the origin recovers (stale-if-error) rather than passing the error on.
const UPSTREAM_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS      = 250;

function text(body, status, extra) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...extra },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== '/api/celestrak' && !url.pathname.startsWith('/api/celestrak/')) {
      // Not the proxy: defer to the static assets (and their not-found handling).
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text('Method Not Allowed', 405, { allow: 'GET, HEAD' });
    }

    const subpath = url.pathname.slice('/api/celestrak'.length); // '/NORAD/elements/gp.php'
    if (!subpath.startsWith(ALLOWED_PREFIX)) {
      return text('Forbidden', 403);
    }

    const target = `${UPSTREAM}${subpath}${url.search}`;
    let upstream;
    try {
      upstream = await fetchUpstream(target, request.method);
      // A 5xx here is usually the origin timing out. One short retry rides out a transient
      // timeout instead of failing the whole group on the first attempt.
      if (upstream.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        upstream = await fetchUpstream(target, request.method);
      }
    } catch (_) {
      return text('Upstream unreachable', 502);
    }

    const headers = new Headers(upstream.headers);
    headers.set(
      'cache-control',
      `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}, stale-if-error=86400`
    );
    headers.delete('content-disposition');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function fetchUpstream(url, method) {
  return fetch(url, {
    method,
    headers: { accept: 'text/plain, */*' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
  });
}
