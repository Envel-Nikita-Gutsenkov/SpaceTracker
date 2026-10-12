import assert from 'node:assert/strict';
import {
  solveEllipticKepler,
  solveHyperbolicKepler,
  heliocentricConicEcliptic,
  heliocentricConicThreeJS,
  sampleConicTrajectory,
} from '../src/utils/conicPropagation.js';
import { DEEP_SPACE_PROBES } from '../src/utils/deepSpaceProbes.js';
import { AU_KM } from '../src/utils/planetaryData.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

console.log('Conic propagation tests');

const probe = (id) => DEEP_SPACE_PROBES.find((p) => p.id === id);

test('elliptic Kepler solver satisfies M = E - e sin E', () => {
  for (const e of [0, 0.1, 0.5, 0.9]) {
    for (const M of [-3, -1, 0, 0.7, 2.5, 6]) {
      const E = solveEllipticKepler(M, e);
      let m = M % (2 * Math.PI);
      if (m < -Math.PI) m += 2 * Math.PI;
      if (m > Math.PI) m -= 2 * Math.PI;
      const residual = E - e * Math.sin(E) - m;
      assert.ok(Math.abs(residual) < 1e-9, `e=${e} M=${M} residual=${residual}`);
    }
  }
});

test('hyperbolic Kepler solver satisfies M = e sinh H - H', () => {
  for (const e of [1.1, 1.4, 3.7, 6.3]) {
    for (const M of [0, 0.5, 3, 20, 60]) {
      const H = solveHyperbolicKepler(M, e);
      const residual = e * Math.sinh(H) - H - M;
      assert.ok(Math.abs(residual) < 1e-6, `e=${e} M=${M} residual=${residual}`);
    }
  }
});

test('New Horizons sits at ~60 AU in Jan 2025 (JPL Horizons elements)', () => {
  const nh = probe('new-horizons');
  const { rAu } = heliocentricConicEcliptic(nh.elements, 2460676.5);
  assert.ok(rAu > 55 && rAu < 66, `New Horizons r = ${rAu.toFixed(2)} AU`);
});

test('Voyager 1 is the farthest probe and beyond 140 AU in Jan 2025', () => {
  const v1 = heliocentricConicEcliptic(probe('voyager-1').elements, 2460676.5).rAu;
  const v2 = heliocentricConicEcliptic(probe('voyager-2').elements, 2460676.5).rAu;
  const p10 = heliocentricConicEcliptic(probe('pioneer-10').elements, 2460676.5).rAu;
  assert.ok(v1 > 140, `Voyager 1 r = ${v1.toFixed(2)} AU`);
  assert.ok(v1 > v2 && v1 > p10, 'Voyager 1 must be the most distant probe');
});

test('every probe recedes monotonically over the next year', () => {
  for (const p of DEEP_SPACE_PROBES) {
    const r0 = heliocentricConicEcliptic(p.elements, 2460676.5).rAu;
    const r1 = heliocentricConicEcliptic(p.elements, 2460676.5 + 365.25).rAu;
    assert.ok(r1 > r0, `${p.name} did not recede (${r0.toFixed(2)} -> ${r1.toFixed(2)} AU)`);
  }
});

test('scene conversion yields finite, scaled positions', () => {
  const { rel, rAu } = heliocentricConicThreeJS(probe('voyager-1').elements, new Date(Date.UTC(2025, 0, 1)));
  assert.ok(Number.isFinite(rel.x) && Number.isFinite(rel.y) && Number.isFinite(rel.z));
  // 1 AU = 23481.066 scene units, so the scene radius must match rAu * AU_UNITS.
  const sceneR = Math.hypot(rel.x, rel.y, rel.z);
  assert.ok(Math.abs(sceneR / rAu - 23481.066) < 1, `scene/AU ratio = ${(sceneR / rAu).toFixed(3)}`);
});

test('outbound-only trails start at periapsis and grow monotonically', () => {
  const pts = sampleConicTrajectory(probe('voyager-1').elements, 340, 600, true);
  assert.ok(pts.length > 16, 'trail must have samples');
  const radii = pts.map(([x, y, z]) => Math.hypot(x, y, z));
  assert.ok(radii[0] < radii[radii.length - 1], 'trail must start near periapsis');
  for (let i = 1; i < radii.length; i++) {
    assert.ok(radii[i] >= radii[i - 1] - 1e-9, `trail radius decreased at ${i}`);
  }
});

test('the symmetric (default) sampler still returns both branches', () => {
  const pts = sampleConicTrajectory(probe('voyager-1').elements, 340, 600);
  const mid = Math.floor(pts.length / 2);
  const rStart = Math.hypot(...pts[0]);
  const rMid = Math.hypot(...pts[mid]);
  assert.ok(rStart > rMid, 'symmetric branch must start far from periapsis');
});

test('escape trails sweep from periapsis out to the requested radius', () => {
  // Guard against the AU/km unit bug: the sampler used to compare an AU radius bound against a
  // km-scale semi-major axis and omit the 1/e, so every escape trail collapsed to a short stub
  // hugging periapsis (Voyager 1: 17 points all at ~8.66 AU instead of sweeping to 340 AU).
  for (const p of DEEP_SPACE_PROBES) {
    const maxRadiusAu = 340;
    const pts = sampleConicTrajectory(p.elements, maxRadiusAu, 600, true);
    const radii = pts.map(([x, y, z]) => Math.hypot(x, y, z));
    const qAu = p.elements.qKm / AU_KM;
    assert.ok(Math.abs(radii[0] - qAu) <= 1e-3 * maxRadiusAu,
      `${p.name}: trail must start at periapsis (${radii[0].toFixed(3)} vs q ${qAu.toFixed(3)})`);
    assert.ok(Math.abs(radii[radii.length - 1] - maxRadiusAu) <= 1e-3 * maxRadiusAu,
      `${p.name}: trail must reach ${maxRadiusAu} AU (got ${radii[radii.length - 1].toFixed(3)})`);
    assert.ok(radii[radii.length - 1] > qAu * 2,
      `${p.name}: trail is degenerate (ends at ${radii[radii.length - 1].toFixed(3)} AU)`);
  }
});

console.log(`\nConic propagation tests: ${passed}/9 passed`);
