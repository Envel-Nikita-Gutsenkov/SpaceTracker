import assert from 'node:assert/strict';
import { getZoomedPlanetId, getZoomedBodyId, isPlanetCloseUp, SUN_CLOSE_UP_FACTOR } from '../src/utils/planetaryLabels.js';

const camera = { x: 0, y: 0, z: 8 };
const planets = [
  { id: 'mars', isPlanet: true, pos: { x: 0, y: 0, z: 0 }, radiusUnits: 1 },
  { id: 'jupiter', isPlanet: true, pos: { x: 0, y: 0, z: -100 }, radiusUnits: 10 },
  { id: 'earth', isPlanet: false, pos: { x: 0, y: 0, z: 7 }, radiusUnits: 1 },
];

assert.equal(getZoomedPlanetId(camera, planets), 'mars', 'return the nearby planet to keep as the only label');
assert.equal(getZoomedPlanetId({ x: 0, y: 0, z: 15 }, planets), null, 'do not activate exactly at the zoom threshold');
assert.equal(getZoomedPlanetId({ x: 0, y: 0, z: 50 }, planets), null, 'keep labels in a wide view');
assert.equal(getZoomedPlanetId(camera, null), null, 'handle missing body lists');
assert.equal(isPlanetCloseUp(14.9, 1), true, 'classify distances inside 15 planet radii as close-up');
assert.equal(isPlanetCloseUp(15, 1), false, 'classify the threshold boundary as outside close-up');

// getZoomedBodyId also treats Earth, the Moon and the Sun as zoom targets, so
// zooming into any of them suppresses every other body's label.
const bodies = [
  { id: 'earth', pos: { x: 0, y: 0, z: 0 }, radiusUnits: 1.005, closeUpFactor: 15 },
  { id: 'sun', pos: { x: 0, y: 0, z: -23481 }, radiusUnits: 109.2, closeUpFactor: SUN_CLOSE_UP_FACTOR },
  { id: 'moon', pos: { x: 0, y: 0, z: 60 }, radiusUnits: 0.273, closeUpFactor: 15 },
  { id: 'mars', isPlanet: true, pos: { x: 100, y: 0, z: 0 }, radiusUnits: 0.53, closeUpFactor: 15 },
];

assert.equal(getZoomedBodyId({ x: 0, y: 0, z: 8 }, bodies), 'earth',
  'looking at Earth suppresses the other planet labels');
assert.equal(getZoomedBodyId({ x: 100, y: 0, z: 2 }, bodies), 'mars',
  'strong zoom to a planet suppresses every other label');
assert.equal(getZoomedBodyId({ x: 0, y: 0, z: -23200 }, bodies), 'sun',
  'the Sun is a valid zoom target at its own (smaller) close-up factor');
assert.equal(getZoomedBodyId({ x: 0, y: 0, z: 500 }, bodies), null,
  'a wide view keeps all labels available');
assert.equal(getZoomedBodyId({ x: 0, y: 0, z: 8 }, null), null, 'handle missing body lists');
assert.equal(getZoomedBodyId(null, bodies), null, 'handle missing camera');

// Nearest close-up body wins when several are within range.
const overlapping = [
  { id: 'earth', pos: { x: 0, y: 0, z: 0 }, radiusUnits: 1.005, closeUpFactor: 15 },
  { id: 'moon', pos: { x: 0, y: 0, z: 5 }, radiusUnits: 1.0, closeUpFactor: 15 },
];
assert.equal(getZoomedBodyId({ x: 0, y: 0, z: 4 }, overlapping), 'moon',
  'the closest body inside its shell wins');

console.log('Planetary label zoom tests: 13/13 passed');
