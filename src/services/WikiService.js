// Wikipedia summary lookup with an offline-capable cache.
//
// Fetched extracts are persisted (see ./cache) so a previously opened satellite
// still shows its description when the network is unavailable.
import { cacheGet, cacheSet } from './cache.js';

// v2: results are now validated for relevance, so the prefix is bumped to drop
// any junk extract cached by the previous "top search hit, unconditionally" logic.
const CACHE_PREFIX = 'wiki:v2';
const TTL_MS       = 24 * 3600 * 1000; // 24 hours
const SEARCH_LIMIT = 5;

// Words that carry no identifying signal on their own. Dropping them keeps the
// relevance check focused on proper nouns and catalogue numbers.
const STOPWORDS = new Set([
  'the', 'of', 'a', 'an', 'and', 'in', 'for', 'to', 'on', 'at', 'by',
  'list', 'launch', 'launches', 'spaceflight', 'satellite', 'satellites',
]);

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')       // drop parentheticals: "Aqua (satellite)" -> "Aqua"
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// A search hit is only trusted when the query's meaningful tokens are mostly
// present in the article title. This rejects the generic launch-list and
// unrelated articles Wikipedia returns for catalogue designations such as
// "TRANSPORTER-18 OBJECT BD", while still matching proper names like
// "Aqua (satellite)". Curated titles skip this check (see `curated` below).
function isRelevant(query, title) {
  const q = tokenize(query);
  if (q.length === 0) return false;
  const t = new Set(tokenize(title));
  let shared = 0;
  for (const tok of q) if (t.has(tok)) shared++;
  return shared > 0 && shared / q.length >= 0.5;
}

// Disambiguation pages read like "Zarya may refer to: ..." and are useless as a
// summary, so they are dropped before the relevance check.
function isDisambiguation(extract) {
  return /may refer to:?/i.test(String(extract || '').slice(0, 120));
}

function searchUrl(lang, title) {
  return `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*`
    + `&generator=search&gsrsearch=${encodeURIComponent(title)}&gsrlimit=${SEARCH_LIMIT}`
    + `&prop=extracts&exintro=1&explaintext=1`;
}

async function query(lang, title, { requireRelevance }) {
  if (!title) return null;
  const res = await fetch(searchUrl(lang, title));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  // `generator=search` returns pages keyed by page id in arbitrary order; the
  // `index` field carries the actual search ranking, so sort by it before
  // choosing instead of trusting insertion order.
  const pages = Object.values(data?.query?.pages || {})
    .filter((p) => p && !p.missing && p.extract)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const page of pages) {
    if (isDisambiguation(page.extract)) continue;
    if (requireRelevance && !isRelevant(title, page.title)) continue;

    const text    = page.extract.split('. ').slice(0, 3).join('. ') + '.';
    const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/\s+/g, '_'))}`;
    return { text, wikiUrl, wikiTitle: page.title, lang };
  }
  return null;
}

export const WikiService = {
  /**
   * Resolve a Wikipedia extract, preferring the user's language edition.
   * Returns `{ text, wikiUrl, wikiTitle, lang }` or null.
   *
   * Pass `curated: true` when the title comes from a hand-checked database entry
   * (it is trusted as-is). Uncurated titles fall back to the object's own name and
   * must clear the relevance check, so a generic name yields no article rather
   * than a wrong one.
   */
  async getExtract({ satId, primaryLang, secondaryLang, primaryTitle, secondaryTitle, curated = false }) {
    const key = `${CACHE_PREFIX}:${satId}:${primaryLang}`;
    const requireRelevance = !curated;

    let cached = null;
    try { cached = await cacheGet(key); } catch (_) {}

    if (cached?.ts && cached.result && Date.now() - cached.ts < TTL_MS) {
      return cached.result;
    }

    try {
      let result = await query(primaryLang, primaryTitle, { requireRelevance });
      if (!result && secondaryLang) result = await query(secondaryLang, secondaryTitle, { requireRelevance });
      if (result) {
        try { await cacheSet(key, { ts: Date.now(), result }); } catch (_) {}
        return result;
      }
    } catch (_) {
      // Network failure → serve the last cached extract if we have one.
      if (cached?.result) return cached.result;
    }

    return cached?.result || null;
  },
};
