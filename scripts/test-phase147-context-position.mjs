// Phase147 / Issue #167 regression tests for right-click beat-position resolution.
// Run with Node.js 22: node scripts/test-phase147-context-position.mjs
import assert from 'node:assert/strict';
import { pickNearestBeatInMeasure } from '../js/chartmode.js';

// The result includes the exact resolved time used to place the visual marker.
const regular = pickNearestBeatInMeasure(0.13, 0, 2, [0, 0.5, 1, 1.5]);
assert.deepEqual(regular, { beatTime: 0, subdivision: 1, time: 0.25 });

const beatHead = pickNearestBeatInMeasure(0.25, 0, 2, [0, 0.5, 1, 1.5]);
assert.deepEqual(beatHead, { beatTime: 0.5, subdivision: 0, time: 0.5 });

// Offbeats use the local neighboring beat interval rather than a song-wide interval.
const uneven = pickNearestBeatInMeasure(0.11, 0, 1.8, [0, 0.4, 1, 1.4]);
assert.deepEqual(uneven, { beatTime: 0, subdivision: 1, time: 0.2 });

const laterUnevenOffbeat = pickNearestBeatInMeasure(0.39, 0, 1.8, [0, 0.4, 1, 1.4]);
assert.deepEqual(laterUnevenOffbeat, { beatTime: 0.4, subdivision: 1, time: 0.7 });

// Candidates outside the measure must not be selected.
const measureHead = pickNearestBeatInMeasure(0, 0.4, 1.4, [0, 0.4, 1, 1.4]);
assert.deepEqual(measureHead, { beatTime: 0.4, subdivision: 0, time: 0.4 });

assert.equal(pickNearestBeatInMeasure(0.5, 1, 1, [0, 0.5, 1]), null);
assert.equal(pickNearestBeatInMeasure(Number.NaN, 0, 2, [0, 0.5, 1]), null);

console.log('Phase147 right-click context-position tests passed.');
