// Phase146 / Issue #101 regression tests for local anchor-truncated measures.
// Run with Node.js 22: node scripts/test-phase146-timing.mjs
import assert from 'node:assert/strict';
import { createTimingModel } from '../js/timing.js';
import { expandToSlots } from '../js/chartmode.js';

const beats = Array.from({ length: 17 }, (_, i) => i * 0.5);
const originalDownbeats = [0, 2, 4, 6, 8];
const repairRule = { version: 1, type: 'anchorDownbeat', beatTime: 1 };

const model = createTimingModel({
  beats,
  downbeats: [...originalDownbeats],
  timeSignature: { numerator: 4, denominator: 4 },
  resolutionPerBeat: 2,
  audioDuration: 8,
  repairRule,
});

assert.equal(model.mode, 'full');
assert.equal(model.getMeasure(0).startTime, 0);
assert.equal(model.getMeasure(0).endTime, 1);
assert.equal(model.getMeasure(0).isLocalAnchorTruncated, true);
assert.equal(model.getMeasure(0).displaySlotCount, 4);
assert.equal(model.getMeasure(1).isLocalAnchorTruncated, false);
assert.equal(model.getMeasure(1).displaySlotCount, 8);
assert.equal(model.getBeatPosition(0.5), 0.5);
assert.equal(model.getBeatPosition(1), 0);

// The renderer's slot expansion must honor each measure's display count.
const expandedSlots = expandToSlots([
  { index: 0, displaySlotCount: 4, slots: [] },
  { index: 1, displaySlotCount: 8, slots: [] },
], 8);
assert.equal(expandedSlots.filter(slot => slot.measureIndex === 0).length, 4);
assert.equal(expandedSlots.filter(slot => slot.measureIndex === 1).length, 8);

// The repair is runtime-only and must not mutate input arrays.
assert.deepEqual(originalDownbeats, [0, 2, 4, 6, 8]);
assert.deepEqual(beats, Array.from({ length: 17 }, (_, i) => i * 0.5));

// If the anchor already is an original downbeat, it must not mark the
// preceding measure as locally truncated.
const existingAnchorModel = createTimingModel({
  beats,
  downbeats: [...originalDownbeats],
  timeSignature: { numerator: 4, denominator: 4 },
  resolutionPerBeat: 2,
  audioDuration: 8,
  repairRule: { version: 1, type: 'anchorDownbeat', beatTime: 2 },
});
assert.equal(existingAnchorModel.getMeasure(0).isLocalAnchorTruncated, false);
assert.equal(existingAnchorModel.getMeasure(0).displaySlotCount, 8);

// beat-only mode does not reinterpret downbeats as measure boundaries and must
// not activate the new local-short-measure behavior.
const beatOnlyModel = createTimingModel({
  beats,
  downbeats: [0],
  timeSignature: { numerator: 4, denominator: 4 },
  resolutionPerBeat: 2,
  audioDuration: 8,
  repairRule,
});
assert.equal(beatOnlyModel.mode, 'beat-only');
assert.equal(beatOnlyModel.getMeasure(0).isLocalAnchorTruncated, false);
assert.equal(beatOnlyModel.getMeasure(0).displaySlotCount, 8);

console.log('Phase146 local anchor timing tests passed.');
