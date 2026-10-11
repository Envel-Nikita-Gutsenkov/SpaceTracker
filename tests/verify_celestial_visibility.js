import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

console.log('Celestial visibility / occlusion regression tests');

const sunSrc = fs.readFileSync(path.resolve('src/scene/Sun.js'), 'utf8');
const sceneSrc = fs.readFileSync(path.resolve('src/scene/SceneManager.js'), 'utf8');
const labelsSrc = fs.readFileSync(path.resolve('src/utils/planetaryLabels.js'), 'utf8');

test('solar occlusion hides the photosphere and corona shell, not just the glare sprites', () => {
  // The additive sprites used to be the only layers faded, so the opaque
  // photosphere/corona could still show through a foreground body.
  assert.match(sunSrc, /_applyVisibility\s*\(/, 'Sun must route visibility through one helper');
  assert.match(sunSrc, /this\.sphereMesh\.visible\s*=\s*show/, 'photosphere must follow the occlusion flag');
  assert.match(sunSrc, /this\.coronaMesh\.visible\s*=\s*show/, 'corona shell must follow the occlusion flag');
  assert.match(sunSrc, /!this\._planetOccluded/, 'occlusion flag must gate visibility');
});

test('any foreground body (Earth, Moon, planet) can occlude the Sun', () => {
  assert.match(sceneSrc, /_isSunOccluded\s*\(/, 'SceneManager must own the occlusion check');
  assert.match(sceneSrc, /isSegmentOccludedBySphere\(camPos, sunPos, this\._vOrigin, 1\.005\)/,
    'Earth must occlude the Sun');
  assert.match(sceneSrc, /isSegmentOccludedBySphere\(camPos, sunPos, moonPos, 0\.273\)/,
    'the Moon must occlude the Sun');
  assert.match(sceneSrc, /setPlanetOccluded\(this\._isSunOccluded\(\)\)/,
    'the Sun must be occluded by the combined check');
});

test('labels are suppressed for every body when zoomed into one body', () => {
  assert.match(labelsSrc, /export function getZoomedBodyId/, 'body-aware zoom helper must exist');
  assert.match(sceneSrc, /getZoomedBodyId\(camPos, bodies\)/, 'label pass must use the body-aware helper');
  // Once any body is inspected up-close, its own label is redundant clutter too, so the whole
  // label pass is skipped rather than only dropping the non-target labels.
  assert.match(sceneSrc, /if \(zoomedBodyId\) continue;/, 'all labels must be dropped on close-up');
});

test('the label pass is allocation-free per tick', () => {
  assert.match(sceneSrc, /_ensureLabelBodies\s*\(/, 'label descriptors must be cached');
  assert.doesNotMatch(sceneSrc, /b\.pos\.clone\(\)\.project/, 'labels must not clone a vector every tick');
});

console.log(`\nCelestial visibility tests: ${passed}/4 passed`);
