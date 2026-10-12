import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
console.log(' SUN LIGHTING + PLUTO POLAR SHADOW VERIFICATION');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// The Sun must illuminate the scene from its *true position*, not a fixed
// direction. A DirectionalLight points along one fixed vector (the Earth->Sun
// axis), which is only correct for Earth at the origin: every other planet sits
// at Sun_position + heliocentric offset, so it would be lit from the wrong side.
// A distance-independent PointLight at the Sun fixes this for every body.
// ---------------------------------------------------------------------------
const sun = read('src/scene/Sun.js');

test('The Sun light is a distance-independent PointLight at the Sun', () => {
  assert.match(sun, /new THREE\.PointLight\(\s*0xffffff\s*,\s*4\.0\s*,\s*0\s*,\s*0\s*\)/,
    'the sun light must be a PointLight(color, intensity, distance=0, decay=0) so it lights the outer planets from the correct side without AU-scale falloff');
  assert.doesNotMatch(sun, /new THREE\.DirectionalLight/,
    'the fixed-direction DirectionalLight must be gone — it lit the outer planets from the wrong side');
});

test('The Sun light tracks the Sun scene position every frame', () => {
  assert.match(sun, /this\.light\.position\.copy\(sunPos\)/,
    'the light must be moved onto the Sun each frame');
  assert.match(sun, /getPosition\(\)\s*\{[\s\S]*?this\.sphereMesh\.position/,
    'getPosition must expose the Sun scene position the light is placed at');
});

// ---------------------------------------------------------------------------
// Pluto was only photographed on its encounter hemisphere: the New Horizons
// global map interpolates the unobserved south polar region, leaving a smeared,
// featureless band. It must be faded to shadow rather than shown.
// ---------------------------------------------------------------------------
const builder = read('src/scene/planets/PlanetMeshBuilder.js');

test('Pluto fades its unphotographed south polar cap to shadow', () => {
  assert.match(builder, /function applyPlutoSouthPolarShadow/, 'the shadow patch helper must exist');
  assert.match(builder, /if \(planetId === 'pluto'\)\s*applyPlutoSouthPolarShadow\(sphereMat\)/,
    'the patch must be applied to the Pluto material');
  assert.match(builder, /#include <map_fragment>[\s\S]*?vMapUv\.y/,
    'the mask must key off the sphere latitude (vMapUv.y) after the map sample');
  assert.match(builder, /customProgramCacheKey/,
    'a distinct program cache key is required so the patched program is not shared with unpatched planets');
});

// ---------------------------------------------------------------------------
// The tilt (or the real IAU pole) must live on a PARENT pivot while the daily spin is a pure
// local +Y rotation of the mesh. Applied to one object instead, the per-frame spin re-orients
// the tilt and the pole wobbles across latitudes within one sidereal day (Pluto's sub-observer
// latitude swung +21° -> -22°). A rotation about the pole can never move the pole.
// ---------------------------------------------------------------------------
test('Tilted bodies spin about a fixed axis (tilt on the pivot, spin on the mesh)', () => {
  assert.match(builder, /pivot\.rotation\.z = -tiltRad/,
    'the fixed axial tilt must be carried by the orientation pivot');
  assert.match(builder, /pivot\.add\(bodyMesh\)/,
    'the body mesh must be a child of the pivot so its spin is about the pivot +Y');
  assert.doesNotMatch(builder, /bodyMesh\.rotation\.z = -tiltRad/,
    'the mesh must NOT carry the tilt itself — that is what let the per-frame spin re-orient it');
});

console.log('\n================================================================');
console.log(` SUN LIGHTING + PLUTO SHADOW TESTS PASSED: ${passed}/${total}`);
console.log('================================================================\n');
