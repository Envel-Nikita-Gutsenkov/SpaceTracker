import assert from 'node:assert/strict';
import { cacheClear, cacheSet, cacheGet } from '../src/services/cache.js';
import { DataService } from '../src/services/DataService.js';
import { WikiService } from '../src/services/WikiService.js';

// Node has no IndexedDB, so the cache layer transparently uses its in-memory
// fallback. We also stub global fetch to simulate network outages.

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

console.log('================================================================');
console.log(' OFFLINE RESILIENCE TEST SUITE');
console.log(' Space Tracker 3D Simulation Platform');
console.log('================================================================\n');

const realFetch = globalThis.fetch;

function sat(name, id) {
  return { id, name, tle1: '1 ' + id, tle2: '2 ' + id, category: 'science' };
}

// Live groups are fetched as OMM/JSON (the TLE/3LE endpoint cannot carry the 6-digit
// catalog numbers CelesTrak began issuing on 2026-07-11).
const OMM_TEXT = JSON.stringify([
  {
    OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A',
    EPOCH: '2024-01-01T00:00:00.000000',
    MEAN_MOTION: 15.72125391, ECCENTRICITY: 0.0006703,
    INCLINATION: 51.6416, RA_OF_ASC_NODE: 247.4627,
    ARG_OF_PERICENTER: 130.536, MEAN_ANOMALY: 325.0288,
    EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 25544,
    ELEMENT_SET_NO: 999, REV_AT_EPOCH: 56353, BSTAR: 0.00010270,
    MEAN_MOTION_DOT: 0.00016717, MEAN_MOTION_DDOT: 0,
  },
]);

// ---------------------------------------------------------------------------
console.log('SUITE 1: Satellite data cache & offline fallback');

await test('fresh cache is served without touching the network', async () => {
  await cacheClear();
  await cacheSet('satellites', { ts: Date.now(), data: [sat('ISS (ZARYA)', 25544)] });
  let calls = 0;
  globalThis.fetch = () => { calls++; return Promise.reject(new Error('should not fetch')); };
  const res = await DataService.loadAll();
  globalThis.fetch = realFetch;
  assert.equal(res.length, 1);
  assert.equal(res[0].name, 'ISS', 'ISS name must be sanitized');
  assert.equal(calls, 0, 'network must not be used when cache is fresh');
});

await test('stale cache is used as offline fallback when network fails', async () => {
  await cacheClear();
  await cacheSet('satellites', {
    ts: Date.now() - 3 * 3600 * 1000, // older than the 1h TTL
    data: [sat('ISS (ZARYA)', 25544), sat('Hubble Space Telescope (HST)', 20580)],
  });
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  const res = await DataService.loadAll();
  globalThis.fetch = realFetch;
  assert.equal(res.length, 2, 'stale cache must be returned on outage');
  assert.equal(res[0].name, 'ISS', 'ISS name must be sanitized');
});

await test('stale cache is served immediately and refreshed in the background', async () => {
  await cacheClear();
  await cacheSet('satellites', {
    ts: Date.now() - 3 * 3600 * 1000, // older than the 1h TTL
    data: [sat('OLD SAT', 11111)],
    complete: true,
  });
  // The live fetch answers every group with a fresh, complete snapshot.
  globalThis.fetch = fetchWithFallback(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(OMM_TEXT) }));
  let refreshed = null;
  const res = await DataService.loadAll(() => {}, (fresh) => { refreshed = fresh; });

  // The cached snapshot is returned without waiting on the network.
  assert.equal(res.length, 1);
  assert.equal(res[0].name, 'OLD SAT', 'the stale cache is served first');

  // The background refresh lands afterwards and hands the fresh catalogue to onRefresh.
  await new Promise((r) => setTimeout(r, 250));
  globalThis.fetch = realFetch;
  assert.ok(refreshed, 'onRefresh must be called with the fresh catalogue');
  assert.ok(refreshed.some(s => s.id === 25544), 'the fresh catalogue replaces the stale one');
  const cached = await cacheGet('satellites');
  assert.equal(cached.complete, true, 'the refreshed snapshot is complete');
});

await test('offline with no cache returns empty without throwing', async () => {
  await cacheClear();
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  const res = await DataService.loadAll();
  globalThis.fetch = realFetch;
  assert.deepEqual(res, []);
});

await test('successful load parses OMM and persists the snapshot', async () => {
  await cacheClear();
  globalThis.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(OMM_TEXT) });
  const res = await DataService.loadAll();
  globalThis.fetch = realFetch;
  assert.equal(res.length, 1);
  assert.equal(res[0].id, 25544);
  assert.equal(res[0].name, 'ISS');
  // TLE epoch is exposed as an absolute UTC timestamp for freshness checks
  assert.equal(res[0].epoch, '2024-01-01T00:00:00.000Z');
  assert.equal(res[0].epochMs, Date.UTC(2024, 0, 1));
  assert.equal(res[0].epochRaw, '24001.00000000');
  const cached = await cacheGet('satellites');
  assert.ok(cached?.ts, 'snapshot must be persisted with a timestamp');
  assert.equal(cached.data.length, 1);
});

// A known-good snapshot shaped like public/satellites-fallback.json. It only needs to carry the
// groups the tests exercise; the real one is generated by tools/fetch_satellite_fallback.mjs.
const GLONASS_TLE = [
  'COSMOS 2500',
  '1 40000U 98067A   24001.00000000  .00016717  00000-0  10270-3 0  9000',
  '2 40000  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537',
].join('\n');
const FALLBACK = {
  generatedAt: '2024-01-01T00:00:00.000Z',
  groups: { 'glo-ops': GLONASS_TLE },
};

function fetchWithFallback(live) {
  return (url) => {
    const u = String(url);
    if (u.includes('satellites-fallback.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FALLBACK) });
    }
    return live(u);
  };
}

await test('a failed group is topped up from the bundled fallback', async () => {
  await cacheClear();
  globalThis.fetch = fetchWithFallback(() => Promise.reject(new Error('throttled')));
  const res = await DataService.loadAll();
  globalThis.fetch = realFetch;
  const cosmos = res.find(s => s.name === 'COSMOS 2500');
  assert.ok(cosmos, 'fallback satellites must be merged in when a group fails');
  assert.equal(cosmos.category, 'glonass', 'fallback satellites keep their category');
  const cached = await cacheGet('satellites');
  assert.ok(cached?.data?.some(s => s.name === 'COSMOS 2500'),
    'a degraded load is cached so the next boot paints instantly');
  assert.equal(cached.complete, false, 'the degraded snapshot is flagged for an early refresh');
});

await test('an empty (HTTP 200) group is treated as incomplete and topped up', async () => {
  await cacheClear();
  globalThis.fetch = fetchWithFallback((u) => {
    // CelesTrak answers a throttled group with HTTP 200 and a body that parses to nothing.
    if (u.includes('GROUP=glo-ops')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
    }
    return Promise.resolve({ ok: true, text: () => Promise.resolve(OMM_TEXT) });
  });
  const res = await DataService.loadAll();
  globalThis.fetch = realFetch;
  assert.ok(res.some(s => s.name === 'COSMOS 2500'), 'the blanked group must be restored');
  assert.ok(res.some(s => s.name === 'ISS'), 'healthy groups must still be present');
  const cached = await cacheGet('satellites');
  assert.ok(cached?.data?.some(s => s.name === 'COSMOS 2500'),
    'an incomplete load is cached so the next boot paints instantly');
  assert.equal(cached.complete, false, 'the incomplete snapshot is flagged for an early refresh');
});

await test('a cold start paints from the bundled snapshot and refreshes live in the background', async () => {
  await cacheClear();
  // The bundled snapshot answers instantly; the live groups answer with a fresh OMM snapshot.
  globalThis.fetch = fetchWithFallback(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(OMM_TEXT) }));
  let refreshed = null;
  const res = await DataService.loadAll(() => {}, (fresh) => { refreshed = fresh; });

  assert.ok(res.some(s => s.name === 'COSMOS 2500'),
    'the first visit must not wait for the live group fetch');
  assert.ok(!res.some(s => s.id === 25544), 'the live catalogue is not merged into the first paint');

  await new Promise((r) => setTimeout(r, 250));
  globalThis.fetch = realFetch;
  assert.ok(refreshed, 'onRefresh must be called with the live catalogue');
  assert.ok(refreshed.some(s => s.id === 25544), 'the background refresh replaces the snapshot');
  const cached = await cacheGet('satellites');
  assert.equal(cached.complete, true, 'the refreshed snapshot is complete');
});

// ---------------------------------------------------------------------------
console.log('\nSUITE 2: Wikipedia extract cache & offline fallback');

const WIKI_JSON = {
  query: {
    pages: {
      '1': {
        title: 'Hubble Space Telescope',
        extract: 'The Hubble Space Telescope is a space telescope. It was launched in 1990. It orbits Earth.',
      },
    },
  },
};

await test('fresh Wikipedia cache is served without touching the network', async () => {
  await cacheClear();
  const key = 'wiki:v2:20580:en';
  await cacheSet(key, { ts: Date.now(), result: { text: 'Cached text.', wikiUrl: 'u', wikiTitle: 'T', lang: 'en' } });
  let calls = 0;
  globalThis.fetch = () => { calls++; return Promise.reject(new Error('should not fetch')); };
  const res = await WikiService.getExtract({
    satId: 20580, primaryLang: 'en', secondaryLang: 'ru',
    primaryTitle: 'Hubble Space Telescope', secondaryTitle: 'Хаббл',
  });
  globalThis.fetch = realFetch;
  assert.equal(res.text, 'Cached text.');
  assert.equal(calls, 0, 'network must not be used when cache is fresh');
});

await test('Wikipedia falls back to stale cache when network fails', async () => {
  await cacheClear();
  const key = 'wiki:v2:20580:en';
  await cacheSet(key, {
    ts: Date.now() - 48 * 3600 * 1000, // older than the 24h TTL
    result: { text: 'Stale but useful.', wikiUrl: 'u', wikiTitle: 'T', lang: 'en' },
  });
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  const res = await WikiService.getExtract({
    satId: 20580, primaryLang: 'en', secondaryLang: 'ru',
    primaryTitle: 'Hubble Space Telescope', secondaryTitle: 'Хаббл',
  });
  globalThis.fetch = realFetch;
  assert.equal(res.text, 'Stale but useful.');
});

await test('successful Wikipedia fetch is parsed and cached', async () => {
  await cacheClear();
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(WIKI_JSON) });
  const res = await WikiService.getExtract({
    satId: 20580, primaryLang: 'en', secondaryLang: 'ru',
    primaryTitle: 'Hubble Space Telescope', secondaryTitle: 'Хаббл',
  });
  globalThis.fetch = realFetch;
  assert.match(res.wikiUrl, /^https:\/\/en\.wikipedia\.org\/wiki\//);
  assert.match(res.text, /Hubble Space Telescope/);
  const cached = await cacheGet('wiki:v2:20580:en');
  assert.ok(cached?.ts, 'result must be cached');
  assert.equal(cached.result.wikiTitle, 'Hubble Space Telescope');
});

await test('uncurated junk search hit is rejected', async () => {
  await cacheClear();
  const JUNK = { query: { pages: {
    '1': {
      index: 1,
      title: 'List of spaceflight launches in July–December 2024',
      extract: 'This article lists orbital and suborbital launches planned for the second half of 2024.',
    },
  } } };
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JUNK) });
  const res = await WikiService.getExtract({
    satId: 100934, primaryLang: 'en', secondaryLang: 'ru',
    primaryTitle: 'TRANSPORTER 18 OBJECT BD', secondaryTitle: 'TRANSPORTER 18 OBJECT BD',
  });
  globalThis.fetch = realFetch;
  assert.equal(res, null, 'a launch-list article must not be shown for a catalogue designation');
});

await test('uncurated lookup picks the relevant hit by search rank', async () => {
  await cacheClear();
  // Page ids are out of order on purpose: `generator=search` does not return them
  // sorted, so the picker must sort by the `index` ranking field, not object order.
  const MIXED = { query: { pages: {
    '9': { index: 1, title: 'Water', extract: 'Water is an inorganic compound.' },
    '3': { index: 2, title: 'Aqua (satellite)', extract: 'Aqua is a NASA Earth science satellite.' },
  } } };
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(MIXED) });
  const res = await WikiService.getExtract({
    satId: 27424, primaryLang: 'en', primaryTitle: 'Aqua (satellite)',
  });
  globalThis.fetch = realFetch;
  assert.ok(res, 'a relevant article must be found');
  assert.equal(res.wikiTitle, 'Aqua (satellite)');
});

await test('curated title is trusted even without token overlap', async () => {
  await cacheClear();
  // Curated entries may be acronyms (SOHO) whose article title shares no token;
  // they must bypass the relevance check and be used as-is.
  const ACRONYM = { query: { pages: {
    '1': { index: 1, title: 'Solar and Heliospheric Observatory', extract: 'The Solar and Heliospheric Observatory is an ESA/NASA spacecraft.' },
  } } };
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(ACRONYM) });
  const res = await WikiService.getExtract({
    satId: 23726, primaryLang: 'en', curated: true, primaryTitle: 'SOHO',
  });
  globalThis.fetch = realFetch;
  assert.equal(res.wikiTitle, 'Solar and Heliospheric Observatory');
});

await test('a disambiguation page is never used as a summary', async () => {
  await cacheClear();
  const DISAMBIG = { query: { pages: {
    '1': { index: 1, title: 'Zarya', extract: 'Zarya may refer to: Zorya, a dawn goddess; Zarya (ISS module).' },
  } } };
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(DISAMBIG) });
  const res = await WikiService.getExtract({
    satId: 99999, primaryLang: 'en', curated: true, primaryTitle: 'Zarya',
  });
  globalThis.fetch = realFetch;
  assert.equal(res, null, 'a disambiguation page must be rejected');
});

// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(` Offline resilience tests: ${passed}/${passed + failed} passed`);
console.log('================================================================');

if (failed > 0) process.exit(1);
