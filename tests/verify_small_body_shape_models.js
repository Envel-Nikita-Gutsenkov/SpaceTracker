import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { getBodyData } from '../src/utils/smallBodies.js';
import { SMALL_BODY_SHAPE_MODELS, SmallBodyShapeModels } from '../src/scene/planets/SmallBodyShapeModels.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

function readGlb(filePath) {
  const buffer = readFileSync(filePath);
  assert.ok(buffer.length >= 20, `${filePath}: file is too short`);
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF', `${filePath}: invalid GLB magic`);
  assert.equal(buffer.readUInt32LE(4), 2, `${filePath}: expected GLB v2`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${filePath}: declared length mismatch`);

  let offset = 12;
  let json = null;
  while (offset < buffer.length) {
    assert.ok(offset + 8 <= buffer.length, `${filePath}: truncated chunk header`);
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + length <= buffer.length, `${filePath}: truncated chunk data`);
    if (type === 0x4e4f534a) json = JSON.parse(buffer.toString('utf8', start, start + length));
    offset = start + length;
  }

  assert.ok(json, `${filePath}: missing JSON chunk`);
  return json;
}

function meshPositionExtents(json, id) {
  const positionAccessors = new Set();
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const position = primitive.attributes?.POSITION;
      assert.ok(Number.isInteger(position), `${id}: primitive is missing POSITION`);
      positionAccessors.add(position);
    }
  }
  assert.equal(positionAccessors.size, 1, `${id}: expected one position accessor`);
  const accessor = json.accessors[[...positionAccessors][0]];
  assert.ok(accessor && accessor.count > 1000, `${id}: expected a detailed surface mesh`);
  assert.ok(Array.isArray(accessor.min) && Array.isArray(accessor.max), `${id}: missing position bounds`);
  return accessor.max.map((max, axis) => max - accessor.min[axis]);
}

function withinTolerance(actual, expected, tolerance, context) {
  const relativeError = Math.abs(actual - expected) / expected;
  assert.ok(relativeError <= tolerance,
    `${context}: ${actual.toFixed(2)} vs ${expected.toFixed(2)} (${(relativeError * 100).toFixed(1)}% error)`);
}

console.log('NASA small-body shape model verification');

test('only verified Phobos and Deimos meshes are registered', () => {
  assert.deepEqual(Object.keys(SMALL_BODY_SHAPE_MODELS).sort(), ['deimos', 'phobos']);
  for (const [id, model] of Object.entries(SMALL_BODY_SHAPE_MODELS)) {
    assert.equal(model.credit, 'NASA/JPL-Caltech');
    assert.equal(model.url, `/models/${id}.glb`);
    assert.equal(model.axisRotation.length, 3);
  }
});

test('NASA GLBs are valid and their oriented dimensions match catalogued axes', () => {
  for (const id of ['phobos', 'deimos']) {
    const json = readGlb(`public/models/${id}.glb`);
    assert.equal(json.asset.version, '2.0');
    assert.ok(json.scenes?.[json.scene]?.nodes?.length > 0, `${id}: missing default scene`);

    const sourceExtents = meshPositionExtents(json, id);
    const orientedExtents = id === 'phobos'
      ? [sourceExtents[2], sourceExtents[1], sourceExtents[0]]
      : [sourceExtents[0], sourceExtents[2], sourceExtents[1]];
    const { aKm, bKm, cKm } = getBodyData(id).shape;
    const expectedBodyFrameExtents = [2 * aKm, 2 * cKm, 2 * bKm];
    for (let axis = 0; axis < 3; axis++) {
      withinTolerance(orientedExtents[axis], expectedBodyFrameExtents[axis], 0.15,
        `${id} axis ${axis} must remain mapped to long/polar/middle body axes`);
    }
  }
});

test('registered model loads lazily, replaces and restores the fallback without reloading', async () => {
  const calls = [];
  const loader = {
    async loadAsync(url) {
      calls.push(url);
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial()));
      return { scene };
    },
  };
  const manager = new SmallBodyShapeModels({ loader, logger: { warn() {} } });
  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
  const bodyPivot = new THREE.Group();
  bodyPivot.add(bodyMesh);
  const body = {
    bodyMesh,
    bodyPivot,
    data: { radiusKm: 10 },
    radiusUnits: 10 / 6371,
  };

  assert.equal(manager.setBodyEnabled('phobos', body, true), true);
  assert.equal(bodyMesh.visible, true, 'fallback stays visible while the request is pending');
  await body.shapeModelPromise;
  assert.equal(calls.length, 1);
  assert.equal(calls[0], '/models/phobos.glb');
  assert.ok(body.realisticShapeRoot);
  assert.equal(body.realisticShapeRoot.visible, true);
  assert.equal(body.bodyMesh.visible, false);
  assert.equal(body.realisticShapeRoot.scale.x, body.radiusUnits / body.data.radiusKm);

  manager.setBodyEnabled('phobos', body, false);
  assert.equal(body.realisticShapeRoot.visible, false);
  assert.equal(body.bodyMesh.visible, true);
  manager.setBodyEnabled('phobos', body, true);
  assert.equal(body.realisticShapeRoot.visible, true);
  assert.equal(calls.length, 1, 'a cached body mesh must not be downloaded again');

  const shapeRoot = body.realisticShapeRoot;
  manager.disposeBody(body);
  assert.equal(body.realisticShapeRoot, null);
  assert.equal(shapeRoot.parent, null);
  assert.equal(body.bodyMesh.visible, true);
  body.bodyMesh.geometry.dispose();
  body.bodyMesh.material.dispose();
});

test('unknown bodies and failed downloads keep the legacy shape', async () => {
  let warnings = 0;
  let loads = 0;
  const manager = new SmallBodyShapeModels({
    loader: { loadAsync: async () => { loads++; throw new Error('offline'); } },
    logger: { warn: () => { warnings++; } },
  });
  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
  const body = { bodyMesh, bodyPivot: new THREE.Group(), data: { radiusKm: 10 }, radiusUnits: 10 / 6371 };
  body.bodyPivot.add(bodyMesh);

  assert.equal(manager.setBodyEnabled('not-registered', body, true), false);
  assert.equal(loads, 0);
  assert.equal(manager.setBodyEnabled('deimos', body, true), true);
  await body.shapeModelPromise;
  assert.ok(body.shapeModelError);
  assert.equal(body.realisticShapeRoot, undefined);
  assert.equal(body.bodyMesh.visible, true);
  assert.equal(warnings, 1);
  manager.setBodyEnabled('deimos', body, false);
  manager.setBodyEnabled('deimos', body, true);
  assert.equal(loads, 1, 'a failed asset must not generate a request every frame');
  body.bodyMesh.geometry.dispose();
  body.bodyMesh.material.dispose();
});

console.log(`\nAll ${passed} small-body shape-model tests passed.`);
