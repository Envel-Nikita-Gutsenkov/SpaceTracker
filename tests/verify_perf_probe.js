import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { perfProbe } from '../src/utils/perfProbe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('================================================================');
console.log(' PERF PROBE VERIFICATION');
console.log('================================================================\n');

test('the probe is inert headless (no window): every hook is a no-op', () => {
  assert.equal(perfProbe.enabled, false, 'without ?perf=1 (and without window) it must be disabled');
  // None of these may throw or accumulate when disabled.
  perfProbe.begin('x');
  perfProbe.end();
  perfProbe.record('modelLoad', 1234);
  perfProbe.tick(1000);
  perfProbe.tick(1016);
  const snap = perfProbe.snapshot();
  assert.equal(snap.frames, 0, 'a disabled probe must not count frames');
  assert.deepEqual(snap.rows, [], 'a disabled probe must not record sections');
});

test('the probe only arms itself behind ?perf=1', () => {
  const src = readSource('src/utils/perfProbe.js');
  assert.match(src, /get\('perf'\)\s*===\s*'1'/, "the probe must require ?perf=1 in the URL");
  assert.match(src, /typeof window !== 'undefined'/, 'the probe must guard against a headless environment');
});

test('SceneManager instruments the render loop with named sections', () => {
  const src = readSource('src/scene/SceneManager.js');
  assert.match(src, /import \{ perfProbe \}/, 'SceneManager must import the probe');
  assert.match(src, /perfProbe\.tick\(now\)/, 'the loop must tick the probe every frame');
  for (const section of ['ephemeris', 'planets', 'satellites', 'earth', 'render']) {
    assert.match(src, new RegExp(`perfProbe\\.begin\\('${section}'\\)`),
      `the loop must time the "${section}" section`);
  }
  const begins = (src.match(/perfProbe\.begin\(/g) || []).length;
  const ends = (src.match(/perfProbe\.end\(/g) || []).length;
  assert.equal(begins, ends, `every begin() must be balanced by an end() (${begins} vs ${ends})`);
});

test('npm run bench is wired to the hot-path benchmark', () => {
  const pkg = JSON.parse(readSource('package.json'));
  assert.match(pkg.scripts.bench || '', /bench_hotpaths\.js/, 'package.json must define a bench script');
  assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'bench_hotpaths.js')), 'the benchmark file must exist');
});

test('the probe reports where the worst long task happened', () => {
  const src = readSource('src/utils/perfProbe.js');
  assert.match(src, /record\(name, ms\)/, 'the probe must expose record() for multi-frame measurements');
  assert.match(src, /_longestTaskAt/, 'the probe must remember when the worst long task ran');
  assert.match(src, /e\.startTime/, 'the long-task observer must capture the task start time');
});

test('spacecraft models are warmed (compiled + uploaded) before first display', () => {
  const src = readSource('src/scene/SatelliteModel.js');
  // Opening a NASA GLB must not stall the frame that first shows the hull: the shader
  // programs and textures have to be paid while the procedural stand-in is still up.
  assert.match(src, /dracoLoader\.preload\(\)/, 'the Draco decoder must be warmed at construction');
  assert.match(src, /_warmModel\(/, 'models must be warmed after load');
  assert.match(src, /renderer\.initTexture\(/, 'model textures must be uploaded eagerly');
  assert.match(src, /compileAsync|renderer\.compile\(/, 'model shader programs must be compiled eagerly');
  // The warm-up needs the renderer, so SceneManager must hand it to SatelliteModel.
  const mgr = readSource('src/scene/SceneManager.js');
  assert.match(mgr, /new SatelliteModel\(this\.scene, this\.renderer\)/, 'SceneManager must pass the renderer');
});

test('spacecraft hulls are prefetched during idle so the first click is warm', () => {
  const src = readSource('src/scene/SatelliteModel.js');
  // Opening a hull for the first time used to pay a cold fetch + parse on the click (the
  // `modelLoad` spike). Likely hulls are now pre-parsed on idle after boot, capped by the LRU
  // budget; the rest are only byte-warmed so their later parse is a disk-cache hit.
  assert.match(src, /requestIdleCallback/, 'warming must yield to the browser during idle time');
  assert.match(src, /textureReadiness\.whenReady\(\)/, 'warming must wait out the boot gate, not compete with it');
  assert.match(src, /resident < MAX_CACHED_MODELS/, 'the parse budget must be capped by the LRU cache size');
  assert.match(src, /fetch\(cfg\.url, \{ cache: 'force-cache' \}\)/, 'overflow hulls must be byte-warmed, not parsed');
  assert.match(src, /this\._disposed = false/, 'dispose() must be able to stop a scheduled warm');
});

test('the probe ignores backgrounded-tab artifacts', () => {
  const src = readSource('src/utils/perfProbe.js');
  // A hidden tab suspends rAF: the resume frame carries the whole pause and the catch-up work
  // reads as a multi-second long task. Neither is app work, so both must be dropped.
  assert.match(src, /visibilitychange/, 'the probe must react to the tab becoming visible again');
  assert.match(src, /_visibleSince/, 'the probe must re-baseline its long-task window on resume');
  assert.match(src, /document\.hidden/, 'frames and long tasks while hidden must be skipped');
  assert.match(src, /this\._lastTick = 0/, 'the resume frame must not be measured as a frame interval');
});

console.log(`\nPerf probe tests: ${passed}/${total} passed`);
assert.equal(passed, total, `expected ${total} tests`);
