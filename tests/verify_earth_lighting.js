import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EARTH_TWILIGHT,
  EARTH_SUN_DIFFUSE,
  EARTH_SUN_AMBIENT,
  EARTH_NIGHT_GAIN,
  earthTerminatorMix,
  earthDayRadiance,
} from '../src/scene/earthLighting.js';

// =============================================================================
//  EARTH DAY/NIGHT LIGHTING — MATHEMATICAL VERIFICATION
//
//  The terminator *longitude* is verified against the NOAA solar position in
//  tests/verify_math.js (Suite 9). This suite pins the *appearance* curve: the day/night
//  blend must be centred on the true geometric terminator (N·S = 0) and the day side must
//  fall off like a Lambertian sphere, not a flat ambient term.
// =============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

console.log('================================================================');
console.log(' EARTH DAY/NIGHT LIGHTING — MATHEMATICAL VERIFICATION');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
test('the lighting constants are physically sane', () => {
  assert.ok(EARTH_TWILIGHT > 0 && EARTH_TWILIGHT < 0.5,
    `twilight half-width ${EARTH_TWILIGHT} must be a small positive cosine band`);
  assert.ok(EARTH_SUN_DIFFUSE > 0, 'day radiance gain must be positive');
  assert.ok(EARTH_SUN_AMBIENT >= 0 && EARTH_SUN_AMBIENT < EARTH_SUN_DIFFUSE,
    'ambient must be a faint floor below the full day radiance');
  assert.ok(EARTH_NIGHT_GAIN > 0, 'city-lights gain must be positive');
});

// ---------------------------------------------------------------------------
// The blend must hit exactly 0.5 where N·S = 0 — the geometric terminator. A band offset
// toward the day side (the old smoothstep(-0.08, 0.12, …)) shifts the visible half-lit line
// off the real boundary, which is what the "shadows look slightly wrong" report described.
test('the day/night blend is centred exactly on the geometric terminator', () => {
  assert.ok(Math.abs(earthTerminatorMix(0) - 0.5) < 1e-12,
    `mix(0) must be exactly 0.5 (got ${earthTerminatorMix(0)})`);
});

test('the blend is 0 at the dusk edge of night and 1 at the dawn edge of day', () => {
  assert.equal(earthTerminatorMix(-EARTH_TWILIGHT), 0, 'mix(-twilight) must be 0');
  assert.equal(earthTerminatorMix(EARTH_TWILIGHT), 1, 'mix(+twilight) must be 1');
  assert.equal(earthTerminatorMix(-1), 0, 'the deep night side must be fully night');
  assert.equal(earthTerminatorMix(1), 1, 'the sub-solar side must be fully day');
});

test('the blend is symmetric about the terminator', () => {
  for (const x of [0.02, 0.05, 0.08, 0.1, 0.2, 0.5]) {
    const sum = earthTerminatorMix(-x) + earthTerminatorMix(x);
    assert.ok(Math.abs(sum - 1) < 1e-12, `mix(-x)+mix(x) must be 1 at x=${x} (got ${sum})`);
  }
});

test('the blend is monotonic increasing from night to day', () => {
  let prev = -Infinity;
  for (let d = -0.5; d <= 0.5; d += 0.005) {
    const m = earthTerminatorMix(d);
    assert.ok(m >= prev - 1e-15, `mix must not decrease as N·S grows (d=${d.toFixed(3)})`);
    prev = m;
  }
});

// ---------------------------------------------------------------------------
test('the day side falls off like a Lambertian sphere', () => {
  // Fully lit at the sub-solar point, ambient-only at the terminator, dark past it.
  assert.ok(Math.abs(earthDayRadiance(1) - (EARTH_SUN_DIFFUSE + EARTH_SUN_AMBIENT)) < 1e-12,
    'sub-solar radiance must be gain + ambient');
  assert.ok(Math.abs(earthDayRadiance(0) - EARTH_SUN_AMBIENT) < 1e-12,
    'terminator radiance must be the ambient floor');
  assert.equal(earthDayRadiance(-0.5), EARTH_SUN_AMBIENT,
    'the night side must receive no direct light');
  assert.ok(earthDayRadiance(0.5) > earthDayRadiance(0.25),
    'radiance must increase toward the sub-solar point');
});

// ---------------------------------------------------------------------------
// Source contract: the shader must consume the shared constants and must no longer carry the
// hand-tuned offset band / flat ambient term this suite replaced.
const earthSrc = read('src/scene/Earth.js');

test('the shader injects the shared lighting constants', () => {
  assert.match(earthSrc, /from '\.\/earthLighting\.js'/,
    'Earth.js must import its lighting constants from the shared module');
  assert.ok(
    earthSrc.includes('smoothstep(-${glslFloat(EARTH_TWILIGHT)}, ${glslFloat(EARTH_TWILIGHT)}'),
    'the terminator band must be symmetric about N·S = 0');
  assert.ok(earthSrc.includes('${glslFloat(EARTH_SUN_DIFFUSE)}'),
    'the day radiance gain must come from the shared constant');
});

test('the hand-tuned offset band and flat ambient term are gone', () => {
  assert.doesNotMatch(earthSrc, /smoothstep\(\s*-?0\.08\s*,\s*0\.12/,
    'the offset smoothstep(-0.08, 0.12) band must be replaced by the symmetric one');
  assert.doesNotMatch(earthSrc, /dotNS\s*\*\s*0\.75\s*\+\s*0\.35/,
    'the flat N·S*0.75+0.35 ambient term must be replaced by the Lambertian falloff');
});

test('the 8K day/night layers stay active at every distance', () => {
  assert.match(earthSrc, /const EARTH_HIRES_DISTANCE\s*=\s*Infinity/,
    'the hires tiers must never stream down to the coarser base at range');
});

test('the base and hi-res tiers are the same image series', () => {
  // The night base must be the WebP downscale of the 8K master (tools/build_earth_tiers.py),
  // not the old PNG from a different product/grade.
  assert.match(earthSrc, /\/earth_night_2048\.webp/,
    'the night base tier must be the same series as the 8K master');
  assert.doesNotMatch(earthSrc, /earth_night_2048\.png/,
    'the old mismatched PNG night base must be gone');
});

console.log('\n================================================================');
console.log(` EARTH LIGHTING TESTS PASSED: ${passed}/${total}`);
console.log('================================================================\n');
