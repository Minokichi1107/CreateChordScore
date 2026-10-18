// Phase146 / Issue #101 acceptance fixture for sub-beat measure anchors.
// Run with Node.js 22: node scripts/test-phase146-subbeat-anchor.mjs
import assert from 'node:assert/strict';
import { createTimingModel } from '../js/timing.js';
import {
  buildGridViewModel,
  buildContinuousChordProjection,
  expandToSlots,
  pickNearestBeatInMeasure,
} from '../js/chartmode.js';

// buildGridViewModel writes optional diagnostics to window; provide the minimal
// browser global for this Node-only integration fixture.
globalThis.window = globalThis.window ?? {};

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

// Continuous-projection context-menu selection must preserve the offbeat subdivision.
const continuousAnchor = pickNearestBeatInMeasure(0.875, 0, 2, beats);
assert.deepEqual(continuousAnchor, { beatTime: 1.5, subdivision: 1 });

// Whole-song correction uses the same sub-beat anchor representation.
const wholeSongModel = createTimingModel({
  beats,
  downbeats: [...originalDownbeats],
  timeSignature: { numerator: 4, denominator: 4 },
  resolutionPerBeat: 2,
  audioDuration: 16,
  repairRule: { ...repairRule, type: 'wholeSongDownbeat' },
});
assert.equal(wholeSongModel.getMeasure(1).startTime, 1.75);
assert.equal(wholeSongModel.getMeasure(2).startTime, 3.75);
assert.equal(wholeSongModel.getMeasure(0).isLeading, true);
// Unlike a conventional beat-head pickup, this leading measure contains all
// four beat heads but ends on the "&" boundary, so its canonical/display width
// must be seven slots rather than the standard eight.
assert.equal(wholeSongModel.getMeasure(0).displaySlotCount, 7);
assert.equal(wholeSongModel.getMeasure(0).isWholeSongSubbeatTruncated, true);
assert.equal(wholeSongModel.getMeasure(1).displaySlotCount, 8);
assert.equal(wholeSongModel.quantize(1.75).measure, 1);
assert.equal(wholeSongModel.quantize(1.75).slot, 0);

// Integration-level projection checks: both view-model paths must carry the
// seven-slot width, and slot expansion must not restore an eighth empty slot.
const wholeSongAnalysis = {
  beats,
  downbeats: [...originalDownbeats],
  timeSignature: { numerator: 4, denominator: 4 },
  chords: [],
  repairRule: { ...repairRule, type: 'wholeSongDownbeat' },
};
const gridView = buildGridViewModel(wholeSongAnalysis, 16);
const continuousView = buildContinuousChordProjection(wholeSongAnalysis, 16);
assert.equal(gridView.measures[0].displaySlotCount, 7);
assert.equal(gridView.measures[0].isWholeSongSubbeatTruncated, true);
assert.equal(continuousView.measures[0].displaySlotCount, 7);
assert.equal(continuousView.measures[0].isWholeSongSubbeatTruncated, true);
const expandedSlots = expandToSlots(gridView.measures, gridView.model.slotsPerMeasure);
assert.equal(expandedSlots.filter(slot => slot.measureIndex === 0).length, 7);
assert.equal(expandedSlots.filter(slot => slot.measureIndex === 1).length, 8);

// Every whole-song "&" phase uses its actual short width. The existing
// pickup right-alignment transform must not remap these slot positions,
// because that beat-based transform can collapse distinct slots.
for (const { beatIndex, expectedSlots } of [
  { beatIndex: 0, expectedSlots: 1 },
  { beatIndex: 1, expectedSlots: 3 },
  { beatIndex: 2, expectedSlots: 5 },
  { beatIndex: 3, expectedSlots: 7 },
]) {
  const anchorRule = {
    version: 1,
    type: 'wholeSongDownbeat',
    beatTime: beats[beatIndex],
    subdivision: 1,
  };
  const phaseChords = Array.from({ length: expectedSlots }, (_, slotIndex) => ({
    _id: `phase-${beatIndex}-slot-${slotIndex}`,
    chord: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'][slotIndex],
    start: slotIndex * 0.25,
    end: (slotIndex + 1) * 0.25,
  }));
  const phaseAnalysis = {
    beats,
    downbeats: [...originalDownbeats],
    timeSignature: { numerator: 4, denominator: 4 },
    chords: phaseChords,
    repairRule: anchorRule,
  };
  const phaseModel = createTimingModel({
    beats,
    downbeats: [...originalDownbeats],
    timeSignature: { numerator: 4, denominator: 4 },
    resolutionPerBeat: 2,
    audioDuration: 16,
    repairRule: anchorRule,
  });
  const phaseGrid = buildGridViewModel(phaseAnalysis, 16);
  const phaseMeasure = phaseGrid.measures[0];
  assert.equal(phaseModel.getMeasure(0).displaySlotCount, expectedSlots);
  assert.equal(phaseModel.getMeasure(0).isWholeSongSubbeatTruncated, true);
  assert.equal(phaseMeasure.displaySlotCount, expectedSlots);
  assert.equal(phaseMeasure.isWholeSongSubbeatTruncated, true);
  assert.deepEqual(
    phaseMeasure.slots.map(slot => slot.slotIndex).sort((a, b) => a - b),
    Array.from({ length: expectedSlots }, (_, i) => i),
  );
  const phaseExpanded = expandToSlots(phaseGrid.measures, phaseGrid.model.slotsPerMeasure);
  assert.equal(
    phaseExpanded.filter(slot => slot.measureIndex === 0).length,
    expectedSlots,
  );
  assert.deepEqual(
    phaseExpanded
      .filter(slot => slot.measureIndex === 0 && slot.onset)
      .map(slot => slot.onset.chord),
    phaseChords.map(chord => chord.chord),
  );
}

// Existing beat-head whole-song repair retains its original pickup semantics.
const beatHeadView = buildGridViewModel({
  ...wholeSongAnalysis,
  repairRule: { version: 1, type: 'wholeSongDownbeat', beatTime: 1.5, subdivision: 0 },
}, 16);
assert.equal(beatHeadView.measures[0].displaySlotCount, 8);
assert.equal(beatHeadView.measures[0].isWholeSongSubbeatTruncated, false);

console.log('Phase146 sub-beat anchor acceptance tests passed.');
