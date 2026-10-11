import assert from 'node:assert/strict';
import { getFocusTransitionProgress } from '../src/utils/focusTransition.js';

assert.equal(getFocusTransitionProgress(100, 100), 0, 'begin at the current camera position');
assert.equal(getFocusTransitionProgress(100, 700), 0.5, 'ease smoothly through the midpoint');
assert.equal(getFocusTransitionProgress(100, 1300), 1, 'finish at the destination');
assert.equal(getFocusTransitionProgress(100, 50), 0, 'clamp times before the transition');
assert.equal(getFocusTransitionProgress(100, 2000), 1, 'clamp times after the transition');
assert.equal(getFocusTransitionProgress(0, 100, 0), 1, 'finish safely for invalid durations');

console.log('Focus transition tests: 6/6 passed');
