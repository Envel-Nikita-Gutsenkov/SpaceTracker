import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { TRANSLATIONS, getTranslation } from '../src/utils/i18n.js';
import { CATEGORIES } from '../src/utils/categories.js';

// Behavioral coverage for the localization layer plus a static scan that guarantees
// every key referenced by the UI actually exists in both dictionaries. A missing key
// silently falls back to the raw identifier, which is invisible in `npm run build`.

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

let TOTAL = 0;

console.log('Localization (i18n) verification tests');

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');

// ---------------------------------------------------------------------------
// 1. getTranslation behavior
// ---------------------------------------------------------------------------
TOTAL++;
test('getTranslation returns the requested language string', () => {
  assert.equal(getTranslation('en', 'app_title'), TRANSLATIONS.en.app_title);
  assert.equal(getTranslation('ru', 'retry'), TRANSLATIONS.ru.retry);
  // The dictionaries must genuinely diverge (brand names like app_title are intentionally
  // identical, so weigh the whole set rather than a single key).
  const differing = Object.keys(TRANSLATIONS.en).filter(k => TRANSLATIONS.en[k] !== TRANSLATIONS.ru[k]);
  assert.ok(differing.length > 50, `expected most keys to be translated, only ${differing.length} differ`);
});

TOTAL++;
test('getTranslation falls back to English for an unknown language', () => {
  assert.equal(getTranslation('de', 'retry'), TRANSLATIONS.en.retry);
  assert.equal(getTranslation(undefined, 'retry'), TRANSLATIONS.en.retry);
});

TOTAL++;
test('getTranslation falls back to the explicit default, then to the raw key', () => {
  assert.equal(getTranslation('en', 'no_such_key_xyz', 'DEFAULT'), 'DEFAULT');
  assert.equal(getTranslation('ru', 'no_such_key_xyz'), 'no_such_key_xyz');
});

TOTAL++;
test('getTranslation never resolves a key to an empty string', () => {
  for (const lang of ['en', 'ru']) {
    for (const [key, value] of Object.entries(TRANSLATIONS[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key} must be a string`);
      assert.ok(value.length > 0, `${lang}.${key} must not be empty`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Dictionary parity — en and ru must expose exactly the same keys
// ---------------------------------------------------------------------------
TOTAL++;
test('English and Russian dictionaries expose identical key sets', () => {
  const en = new Set(Object.keys(TRANSLATIONS.en));
  const ru = new Set(Object.keys(TRANSLATIONS.ru));
  const missingInRu = [...en].filter(k => !ru.has(k));
  const missingInEn = [...ru].filter(k => !en.has(k));
  assert.deepEqual(missingInRu, [], `keys present in en but missing in ru: ${missingInRu}`);
  assert.deepEqual(missingInEn, [], `keys present in ru but missing in en: ${missingInEn}`);
  assert.ok(en.size > 100, `expected a substantial dictionary, got ${en.size} keys`);
});

// ---------------------------------------------------------------------------
// 3. Static scan — every literal key used by the UI resolves in both languages
// ---------------------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

TOTAL++;
test('every literal getTranslation key used in src exists in en and ru', () => {
  const keyPattern = /getTranslation\(\s*[^,]+,\s*['"]([A-Za-z0-9_]+)['"]/g;
  const used = new Map(); // key -> first file that uses it
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(keyPattern)) {
      if (!used.has(m[1])) used.set(m[1], relative(SRC, file));
    }
  }
  assert.ok(used.size >= 20, `expected to find keys in the UI, found ${used.size}`);

  const missing = [];
  for (const [key, file] of used) {
    if (!(key in TRANSLATIONS.en)) missing.push(`en.${key} (used in ${file})`);
    if (!(key in TRANSLATIONS.ru)) missing.push(`ru.${key} (used in ${file})`);
  }
  assert.deepEqual(missing, [], `missing translation keys: ${missing.join(', ')}`);
});

TOTAL++;
test('the dynamic category keys cat_<id> exist for every rendered category', () => {
  // InfoPanel builds the badge label as `cat_${cat.id}` with the English name as fallback.
  // Every category id must therefore have a translation so the badge is localized.
  const missing = [];
  for (const cat of CATEGORIES) {
    const key = `cat_${cat.id}`;
    if (!(key in TRANSLATIONS.en)) missing.push(`en.${key}`);
    if (!(key in TRANSLATIONS.ru)) missing.push(`ru.${key}`);
  }
  assert.deepEqual(missing, [], `missing category translations: ${missing.join(', ')}`);
});

console.log(`\nLocalization tests: ${passed}/${TOTAL} passed`);
assert.equal(passed, TOTAL, `expected ${TOTAL} tests`);
