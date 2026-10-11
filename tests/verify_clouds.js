import assert from 'node:assert/strict';
import { CloudService, CLOUD_TIERS, CLOUD_ATTRIBUTION } from '../src/services/CloudService.js';

// =============================================================================
//  LIVE CLOUD MAPS — VERIFICATION SUITE
//
//  The live clouds are a streamed, near-real-time grayscale map of the whole Earth
//  (EUMETSAT data via clouds.matteason.co.uk). The app must: build cache-busted,
//  correctly-ordered resolution tiers, degrade to the bundled static map on any
//  failure, and carry the required attribution. This suite pins all of that.
// =============================================================================

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

const HOUR = 60 * 60 * 1000;

console.log('================================================================');
console.log(' LIVE CLOUD MAPS — VERIFICATION');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
console.log('SUITE 1: resolution tiers');

await test('tiers are ordered coarse -> fine with the expected resolutions', () => {
  assert.deepEqual(CLOUD_TIERS.map((t) => t.key), ['2048x1024', '4096x2048', '8192x4096']);
});

await test('the 2K base tier is always active; finer tiers activate as the camera nears', () => {
  assert.equal(CLOUD_TIERS[0].distance, Infinity, 'base tier must use Infinity');
  // Distances must be strictly decreasing so a nearer camera unlocks a finer tier.
  for (let i = 1; i < CLOUD_TIERS.length; i++) {
    assert.ok(CLOUD_TIERS[i].distance < CLOUD_TIERS[i - 1].distance, `tier ${i} not nearer than ${i - 1}`);
  }
});

// -----------------------------------------------------------------------------
console.log('\nSUITE 2: URL construction & cache busting');

await test('updateBucket is stable within a 3h window and rolls at the boundary', () => {
  const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
  assert.equal(CloudService.updateBucket(t0), CloudService.updateBucket(t0 + 2 * HOUR), 'must be stable within a bucket');
  assert.notEqual(CloudService.updateBucket(t0), CloudService.updateBucket(t0 + 3 * HOUR), 'must roll at the 3h boundary');
});

await test('buildCloudUrl points at the tier image and carries the bucket', () => {
  const now = Date.UTC(2026, 0, 1, 4, 30, 0);
  const url = CloudService.buildCloudUrl('4096x2048', { now, base: 'https://example.test' });
  assert.equal(url, `https://example.test/images/4096x2048/clouds.jpg?v=${CloudService.updateBucket(now)}`);
});

await test('cloudTiers returns one cache-busted URL per tier, preserving distances', () => {
  const tiers = CloudService.cloudTiers({ now: Date.UTC(2026, 0, 1) });
  assert.equal(tiers.length, CLOUD_TIERS.length);
  tiers.forEach((tier, i) => {
    assert.match(tier.url, new RegExp(`/images/${CLOUD_TIERS[i].key}/clouds\\.jpg\\?v=\\d+$`));
    assert.equal(tier.distance, CLOUD_TIERS[i].distance);
  });
});

// -----------------------------------------------------------------------------
console.log('\nSUITE 3: availability probe & fail-safe fallback');

await test('a reachable service returns the tier list', async () => {
  let probed = null;
  const tiers = await CloudService.resolveCloudTiers({
    now: Date.UTC(2026, 0, 1),
    fetchImpl: (url, opts) => { probed = { url, method: opts?.method }; return Promise.resolve({ ok: true }); },
  });
  assert.ok(tiers, 'tiers must resolve when the probe succeeds');
  assert.equal(tiers.length, CLOUD_TIERS.length);
  assert.equal(probed.method, 'HEAD', 'probe must be a cheap HEAD request');
  assert.equal(probed.url, tiers[0].url, 'probe must target the base tier');
});

await test('a network failure returns null (bundled static map is kept)', async () => {
  const tiers = await CloudService.resolveCloudTiers({ fetchImpl: () => Promise.reject(new Error('offline')) });
  assert.equal(tiers, null, 'failure must yield null so the static map stays bound');
});

await test('a non-OK response returns null (no blank sky)', async () => {
  const tiers = await CloudService.resolveCloudTiers({ fetchImpl: () => Promise.resolve({ ok: false, status: 503 }) });
  assert.equal(tiers, null);
});

// -----------------------------------------------------------------------------
console.log('\nSUITE 4: licensing');

await test('the required EUMETSAT attribution is present', () => {
  assert.match(CLOUD_ATTRIBUTION, /EUMETSAT/, 'EUMETSAT attribution is required by the data licence');
});

// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(` Live cloud tests: ${passed}/${passed + failed} passed`);
console.log('================================================================');

if (failed > 0) process.exit(1);
