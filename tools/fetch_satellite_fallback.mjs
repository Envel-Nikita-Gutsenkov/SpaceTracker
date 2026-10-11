// Regenerates the bundled offline fallback catalogue: public/satellites-fallback.json
//
// The live app fetches CelesTrak's 24 GP groups in parallel; when CelesTrak throttles a
// burst, individual groups fail and the sidebar shows those categories as empty. This
// snapshot lets the client top a failed (or suspiciously thin) group back up from a
// recently captured, known-good catalogue instead of silently showing nothing.
//
// The snapshot stores the *raw 3LE text* per group, not parsed objects: it is far smaller,
// reuses the exact same parser the live path uses, and stays human-diffable. It is only
// fetched at runtime when a live group actually fails, so it never costs a normal boot.
//
// Usage:  node tools/fetch_satellite_fallback.mjs
//
// Requires network access to celestrak.org. Commit the regenerated JSON afterwards.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = 'https://celestrak.org';

// Keep this list in sync with GROUPS in src/services/DataService.js.
const GROUPS = [
  'stations', 'science', 'tdrss', 'visual', 'glo-ops', 'gps-ops',
  'galileo',  'beidou',  'weather', 'geo',    'radar',
  'iridium-NEXT', 'planet', 'spire', 'oneweb', 'starlink',
  'cubesat',  'military', 'amateur', 'satnogs', 'globalstar', 'orbcomm',
  'sarsat',
];

const DELAY_MS = 500; // be gentle: CelesTrak throttles bursts of parallel requests

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchGroup(group) {
  const query = group === 'starlink' ? 'NAME=STARLINK' : `GROUP=${group}`;
  const url = `${BASE}/NORAD/elements/gp.php?${query}&FORMAT=3le`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // CelesTrak answers unknown groups with HTTP 200 and an "Invalid query" body, so a
  // non-empty response is not proof of success — require at least one parsed element.
  if ((text.match(/^1 /gm) || []).length === 0) throw new Error('no elements in response');
  return text;
}

async function fetchGroupWithRetry(group) {
  try {
    return await fetchGroup(group);
  } catch (err) {
    await sleep(1500);
    return await fetchGroup(group);
  }
}

const groups = {};
const failures = [];

for (const group of GROUPS) {
  process.stdout.write(`  fetching ${group}… `);
  try {
    const text = await fetchGroupWithRetry(group);
    const sats = (text.match(/^1 /gm) || []).length;
    groups[group] = text;
    console.log(`${sats} objects, ${(text.length / 1024).toFixed(0)} KiB`);
  } catch (err) {
    failures.push(group);
    console.log(`FAILED (${err.message})`);
  }
  await sleep(DELAY_MS);
}

if (failures.length > 0) {
  console.error(`\nAborting: ${failures.length} group(s) failed: ${failures.join(', ')}`);
  console.error('Refusing to write a partial snapshot. Re-run when CelesTrak is responsive.');
  process.exit(1);
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  source: 'celestrak.org GP 3LE',
  groups,
};

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'public', 'satellites-fallback.json');
const json = JSON.stringify(snapshot);
await writeFile(outPath, json);

const total = Object.values(groups).reduce((n, t) => n + (t.match(/^1 /gm) || []).length, 0);
console.log(`\nWrote ${outPath}`);
console.log(`${Object.keys(groups).length} groups, ${total} objects, ${(json.length / 1024 / 1024).toFixed(2)} MiB`);
