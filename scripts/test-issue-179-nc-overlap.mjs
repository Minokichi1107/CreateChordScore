// Regression tests for Issue #179: N.C. has lower display priority than actual chords.
// Run with Node.js 22: node scripts/test-issue-179-nc-overlap.mjs
import assert from 'node:assert/strict';
import { buildContinuousChordProjection } from '../js/chartmode.js';

if (typeof window === 'undefined') globalThis.window = {};

const beats = Array.from({ length: 17 }, (_, i) => i * 0.5);
const chords = [
  { chord: 'N', start: 0, end: 0.511, _id: 'leading-nc' },
  { chord: 'Eb', start: 0.111, end: 2.0615, _id: 'opening-chord' },
  { chord: 'N', start: 2.25, end: 3.25, _id: 'middle-nc' },
  { chord: 'G', start: 2.5, end: 3.0, _id: 'middle-chord' },
];
const originalChords = structuredClone(chords);
const analysis = {
  beats,
  downbeats: [0, 2, 4, 6, 8],
  timeSignature: { numerator: 4, denominator: 4 },
  chords,
};

const projection = buildContinuousChordProjection(analysis, 8);
assert.ok(projection);
assert.equal(projection.model.mode, 'full');

// The 0.111s leading N.C. remainder is below half a beat and is suppressed;
// the overlapping actual chord remains present in the display projection.
assert.ok(projection.segments.some(segment => segment.chord === 'Eb'));
assert.ok(!projection.segments.some(segment => segment.chordId === 'leading-nc'));

// An N.C. interval overlapping a chord keeps its sufficiently long non-overlapping
// portions, but none of its projected segments may cover the actual chord's interval.
const middleNc = projection.segments.filter(segment => segment.chordId === 'middle-nc');
assert.equal(middleNc.length, 2);
const measure = projection.measures[1];
const intervals = middleNc.map(segment => ({
  start: measure.startTime + (segment.leftPercent / 100) * (measure.endTime - measure.startTime),
  end: measure.startTime + ((segment.leftPercent + segment.widthPercent) / 100) * (measure.endTime - measure.startTime),
}));
assert.ok(intervals.every(interval => interval.end <= 2.5 + 1e-6 || interval.start >= 3.0 - 1e-6));

// Display projection must not mutate source analysis data.
assert.deepEqual(chords, originalChords);

console.log('Issue #179 N.C. overlap priority tests passed.');
