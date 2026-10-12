import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  latLonToScene,
  sceneToLatLon,
  isSurfacePointVisible,
  geographyTier,
  selectNonOverlapping,
  estimateTextWidth,
  projectWorldToScreen,
  CITY_LABELS,
  CONTINENT_LABELS,
} from '../src/utils/geography.js';
import { applyEquirectLongitudeUV } from '../src/scene/planets/equirectUV.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

const DEG = Math.PI / 180;
const ALL = [...CITY_LABELS, ...CONTINENT_LABELS];

// ---------------------------------------------------------------------------
// 1. The mesh anchor: a label must land on the exact texture pixel it names.
//    We rebuild the real Earth geometry, spin it by -gmst, and check that the
//    vertex sampling the city's equirectangular texel sits under latLonToScene.
// ---------------------------------------------------------------------------
const SEG = 512;
const gmst = 1.234;
const geo = applyEquirectLongitudeUV(new THREE.SphereGeometry(1, SEG, SEG));
const posAttr = geo.attributes.position;
const uvAttr = geo.attributes.uv;
const earthMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
earthMesh.rotation.y = -gmst;
earthMesh.updateMatrixWorld(true);

function nearestVertexWorld(lat, lon) {
  const tu = (lon + 180) / 360;
  const tv = (lat + 90) / 180;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < uvAttr.count; i++) {
    const du = uvAttr.getX(i) - tu;
    const dv = uvAttr.getY(i) - tv;
    const d = du * du + dv * dv;
    if (d < bestD) { bestD = d; best = i; }
  }
  const v = new THREE.Vector3().fromBufferAttribute(posAttr, best).applyMatrix4(earthMesh.matrixWorld);
  return v;
}

function angleBetween(a, b) {
  const la = Math.hypot(a.x, a.y, a.z);
  const lb = Math.hypot(b.x, b.y, b.z);
  const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

console.log('Geography label (city / continent) tests');

test('every label lands on its own texel of the real Earth mesh', () => {
  // Tolerance is one half-diagonal of a 512-segment UV cell (~0.005 rad); the observed
  // worst case is well under 0.01 rad, so 0.012 rad (~0.7°) is a tight but safe bound.
  const tol = 0.012;
  for (const item of ALL) {
    const world = nearestVertexWorld(item.lat, item.lon);
    const mine = latLonToScene(item.lat, item.lon, gmst, 1.0);
    const err = angleBetween(world, mine);
    assert.ok(err < tol,
      `${item.name}: label is ${(err / DEG).toFixed(3)}° off the mesh vertex (lat ${item.lat}, lon ${item.lon})`);
  }
});

test('latLonToScene round-trips through sceneToLatLon', () => {
  for (const item of ALL) {
    const p = latLonToScene(item.lat, item.lon, gmst, 1.0);
    const back = sceneToLatLon(p.x, p.y, p.z, gmst, 1.0);
    assert.ok(Math.abs(back.lat - item.lat) < 1e-6, `${item.name}: lat drifted to ${back.lat}`);
    assert.ok(Math.abs(back.lon - item.lon) < 1e-6, `${item.name}: lon drifted to ${back.lon}`);
  }
});

test('longitude increases right ascension (east-positive convention)', () => {
  // Two points on the equator, 10° apart in longitude, must be 10° apart in world RA.
  const a = latLonToScene(0, 0, 0);
  const b = latLonToScene(0, 10, 0);
  const raA = Math.atan2(a.z, a.x);
  const raB = Math.atan2(b.z, b.x);
  assert.ok(Math.abs((raB - raA) - 10 * DEG) < 1e-9, 'RA must track east longitude');
});

// ---------------------------------------------------------------------------
// 2. Visibility: only the near hemisphere is labelled.
// ---------------------------------------------------------------------------
test('only surface points on the near hemisphere are visible', () => {
  // The camera sits on the +x axis, so the point at lon 0 (RA 0, also +x) faces it.
  const camPos = { x: 3.0, y: 0, z: 0 };
  const near = latLonToScene(0, 0, 0);           // faces the camera
  const far = latLonToScene(0, 180, 0);         // opposite side
  assert.equal(isSurfacePointVisible(near, camPos, 1.0, 0.0), true, 'near point must be visible');
  assert.equal(isSurfacePointVisible(far, camPos, 1.0, 0.0), false, 'far point must be hidden');

  // A camera inside the globe sees nothing.
  assert.equal(isSurfacePointVisible(near, { x: 0.5, y: 0, z: 0 }, 1.0, 0.0), false,
    'nothing is visible from inside the globe');
});

test('the visibility margin pulls labels off the very limb', () => {
  const camPos = { x: 1.5, y: 0, z: 0 };
  const horizon = Math.acos(1 / 1.5);
  // A point 0.05 rad inside the horizon is visible with no margin but excluded once the
  // margin exceeds that 0.05 rad gap.
  const justInside = latLonToScene(0, (horizon - 0.05) / DEG, 0);
  assert.equal(isSurfacePointVisible(justInside, camPos, 1.0, 0.0), true, 'inside point visible with no margin');
  assert.equal(isSurfacePointVisible(justInside, camPos, 1.0, 0.1), false, 'margin must exclude the limb');
});

// ---------------------------------------------------------------------------
// 3. Tiering: close-up → cities, pulled back → continents, far → nothing.
// ---------------------------------------------------------------------------
test('geographyTier is monotonic and switches city → continent → none', () => {
  assert.equal(geographyTier(1.1).kind, 'city');
  assert.equal(geographyTier(1.1).level, 4);
  assert.equal(geographyTier(1.5).level, 3);
  assert.equal(geographyTier(2.0).level, 2);
  assert.equal(geographyTier(2.8).level, 1);
  assert.equal(geographyTier(5.0).kind, 'continent');
  assert.equal(geographyTier(50.0).kind, 'none');

  // The level must never increase as the camera pulls back.
  let prev = Infinity;
  for (let d = 1.05; d < 12.0; d += 0.05) {
    const lvl = geographyTier(d).level;
    if (geographyTier(d).kind === 'city') {
      assert.ok(lvl <= prev, `city level rose while zooming out at ${d.toFixed(2)}`);
      prev = lvl;
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Anti-collision: no two kept boxes overlap; priority wins; cap respected.
// ---------------------------------------------------------------------------
test('selectNonOverlapping drops every overlapping box', () => {
  const items = [
    { id: 'a', cx: 100, cy: 100, w: 80, h: 18, priority: 1 },
    { id: 'b', cx: 105, cy: 102, w: 80, h: 18, priority: 2 }, // overlaps a
    { id: 'c', cx: 400, cy: 400, w: 80, h: 18, priority: 3 }, // clear
  ];
  const kept = selectNonOverlapping(items, Infinity, 4, 2);
  const ids = kept.map(k => k.id).sort();
  assert.deepEqual(ids, ['a', 'c'], 'the lower-priority overlapping box must be dropped');
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const x = kept[i], y = kept[j];
      const overlapX = Math.abs(x.cx - y.cx) < (x.w + y.w) / 2 + 4;
      const overlapY = Math.abs(x.cy - y.cy) < (x.h + y.h) / 2 + 2;
      assert.ok(!(overlapX && overlapY), `${x.id} and ${y.id} still overlap`);
    }
  }
});

test('selectNonOverlapping respects the cap and the priority order', () => {
  const items = [];
  for (let i = 0; i < 40; i++) items.push({ id: i, cx: i * 200, cy: 0, w: 10, h: 10, priority: i });
  const kept = selectNonOverlapping(items, 5, 0, 0);
  assert.equal(kept.length, 5);
  assert.deepEqual(kept.map(k => k.id), [0, 1, 2, 3, 4], 'the highest-priority boxes must win');
});

// ---------------------------------------------------------------------------
// 5. Data integrity — a wrong coordinate is exactly the bug this layer must avoid.
// ---------------------------------------------------------------------------
test('city and continent data are well-formed', () => {
  const seen = new Set();
  for (const item of ALL) {
    assert.ok(Number.isFinite(item.lat) && item.lat >= -90 && item.lat <= 90,
      `${item.name}: latitude out of range (${item.lat})`);
    assert.ok(Number.isFinite(item.lon) && item.lon >= -180 && item.lon <= 180,
      `${item.name}: longitude out of range (${item.lon})`);
    assert.ok(item.name && item.nameRu, `${item.name}: missing a name`);
    assert.ok(Number.isInteger(item.level) && item.level >= 1 && item.level <= 4,
      `${item.name}: bad level (${item.level})`);
    assert.ok(!seen.has(item.name), `duplicate label "${item.name}"`);
    seen.add(item.name);
  }
  assert.ok(CITY_LABELS.length >= 50, 'expected a broad city set');
  assert.equal(CONTINENT_LABELS.length, 7, 'seven continents expected');
});

test('estimateTextWidth grows with length and is positive', () => {
  assert.ok(estimateTextWidth('A', 12, 0.06) > 0);
  assert.ok(estimateTextWidth('LONGER NAME', 12, 0.06) > estimateTextWidth('SHORT', 12, 0.06));
  assert.equal(estimateTextWidth('', 12, 0.06), estimateTextWidth('A', 12, 0.06));
});

// ---------------------------------------------------------------------------
// 6. Projection path — the exact world→screen mapping the app uses, driven by a
//    real THREE camera (no WebGL needed).
// ---------------------------------------------------------------------------
test('projectWorldToScreen maps a facing point to the viewport centre', () => {
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.01, 1000);
  cam.position.set(0, 0, 3);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const W = 1600, H = 900;

  const centre = projectWorldToScreen(0, 0, 1, cam, W, H);
  assert.equal(centre.visible, true);
  assert.ok(Math.abs(centre.x - W / 2) < 0.5, `centre x off by ${centre.x - W / 2}`);
  assert.ok(Math.abs(centre.y - H / 2) < 0.5, `centre y off by ${centre.y - H / 2}`);

  // +x must land on the right half; +y (up in world) must land on the upper half (small y).
  const right = projectWorldToScreen(1, 0, 1, cam, W, H);
  assert.ok(right.x > W / 2, 'east point must project to the right half');
  const up = projectWorldToScreen(0, 1, 1, cam, W, H);
  assert.ok(up.y < H / 2, 'north point must project to the upper half');

  // A point behind the camera (larger z than the camera) must be flagged invisible.
  const behind = projectWorldToScreen(0, 0, 10, cam, W, H);
  assert.equal(behind.visible, false, 'behind-camera point must be culled');
});

test('a full label pass only ever emits near-side, on-screen points', () => {
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.01, 1000);
  cam.position.set(0.6, 1.2, 2.6);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const W = 1600, H = 900;
  const camPos = cam.position;

  for (const item of CITY_LABELS) {
    const p = latLonToScene(item.lat, item.lon, gmst, 1.0);
    const onNearSide = isSurfacePointVisible(p, camPos, 1.0, 0.06);
    const s = projectWorldToScreen(p.x, p.y, p.z, cam, W, H);
    if (!onNearSide) continue;
    // Every point kept by the visibility test must also project in front of the camera.
    assert.equal(s.visible, true, `${item.name}: visible hemisphere point projected behind the camera`);
    // ...and it must sit in front of the globe centre, i.e. on the camera-facing side.
    assert.ok(p.x * camPos.x + p.y * camPos.y + p.z * camPos.z > 0,
      `${item.name}: kept point is on the far side`);
  }
});

console.log(`\nGeography label tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
