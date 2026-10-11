import assert from 'node:assert/strict';
import { isSegmentOccludedBySphere } from '../src/utils/celestialOcclusion.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

const camera = { x: 0, y: 0, z: 10 };
const backgroundPlanet = { x: 0, y: 0, z: -10 };

console.log('Celestial label occlusion tests');

test('a foreground planet hides a planet behind it', () => {
  assert.equal(
    isSegmentOccludedBySphere(camera, backgroundPlanet, { x: 0, y: 0, z: 0 }, 0.5),
    true,
  );
});

test('a foreground planet blocks the line of sight to the Sun', () => {
  const sun = { x: 0, y: 0, z: -1000 };
  assert.equal(
    isSegmentOccludedBySphere(camera, sun, { x: 0, y: 0, z: 0 }, 2),
    true,
  );
});

test('a sphere outside the line of sight does not occlude', () => {
  assert.equal(
    isSegmentOccludedBySphere(camera, backgroundPlanet, { x: 1.1, y: 0, z: 0 }, 1),
    false,
  );
});

test('a sphere behind the target does not occlude', () => {
  assert.equal(
    isSegmentOccludedBySphere(camera, backgroundPlanet, { x: 0, y: 0, z: -12 }, 1),
    false,
  );
});

test('a sphere centered behind the target still occludes if its surface crosses the segment', () => {
  assert.equal(
    isSegmentOccludedBySphere(camera, backgroundPlanet, { x: 0, y: 0, z: -11 }, 2),
    true,
  );
});

test('a sphere behind the camera does not occlude', () => {
  assert.equal(
    isSegmentOccludedBySphere(camera, backgroundPlanet, { x: 0, y: 0, z: 12 }, 1),
    false,
  );
});

test('invalid or degenerate inputs fail open', () => {
  assert.equal(
    isSegmentOccludedBySphere(camera, camera, { x: 0, y: 0, z: 0 }, 1),
    false,
  );
  assert.equal(
    isSegmentOccludedBySphere(camera, backgroundPlanet, { x: 0, y: 0, z: 0 }, 0),
    false,
  );
  assert.equal(
    isSegmentOccludedBySphere(camera, backgroundPlanet, null, 1),
    false,
  );
});

console.log(`\nOcclusion tests: ${passed}/7 passed`);
