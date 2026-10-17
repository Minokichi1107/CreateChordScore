// Phase146 / Issue #101 acceptance fixture for sub-beat measure anchors.
// Run with Node.js 22: node scripts/test-phase146-subbeat-anchor.mjs
// This is a red acceptance test until timing.js supports repairRule.subdivision.
import assert from 'node:assert/strict';
import { createTimingModel } from '../js/timing.js';

const beats = Array.from({ length: 33 }, (_, i) => i * 0.5);
const originalDownbeats = [0, 2, 4, 6, 8, 10, 12, 14, 16];
const repairRule = {
  version: 1,
  type: 'anchorDownbeat',
  beatTime: 1.5,
  subdivision: 1, // the second half of the beat: 1.75 seconds
};

const model = createTimingModel({
  beats,
  downbeats: [...originalDownbeats],
  timeSignature: { numerator: 4, denominator: 4 },
  resolutionPerBeat: 2,
  audioDuration: 16,
  repairRule,
});

// Anchor at the second half of the beat must be the new measure's slot 0.
assert.equal(model.getMeasure(1).startTime, 1.75);
assert.equal(model.quantize(1.75).measure, 1);
assert.equal(model.quantize(1.75).slot, 0);

// The following measure boundary advances by 8 slots, not by a fixed seconds value.
assert.equal(model.getMeasure(2).startTime, 3.75);
assert.equal(model.quantize(2.0).measure, 1);
assert.equal(model.quantize(2.0).slot, 1);

// The shortened preceding measure has seven visible eighth-note slots.
assert.equal(model.getMeasure(0).endTime, 1.75);
assert.equal(model.getMeasure(0).displaySlotCount, 7);
assert.equal(model.getMeasure(0).isLocalAnchorTruncated, true);

// Repair is runtime-only; source analysis arrays must remain unchanged.
assert.deepEqual(originalDownbeats, [0, 2, 4, 6, 8, 10, 12, 14, 16]);
assert.deepEqual(beats, Array.from({ length: 33 }, (_, i) => i * 0.5));

console.log('Phase146 sub-beat anchor acceptance tests passed.');
