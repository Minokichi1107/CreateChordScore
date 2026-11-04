import assert from 'node:assert/strict';
import {
  simplifyChord,
  buildBarVectors,
  detectSectionBoundaries,
  measureIrregularity,
  SECTION_BOUNDARY_ALGORITHM_VERSION,
} from '../js/sectionBoundaryDetection.js';
import {
  mapBoundariesToChordRanges,
  validateGeneratedSectionSet,
  buildSectionsFromDraft,
  createDraftFromBoundaries,
} from '../js/sectionAutoGeneration.js';
import { applyGeneratedSectionsCommand } from '../js/analysisCommands.js';
import { undoBuffer } from '../js/analysisSession.js';
import {
  captureSectionGenerationBuffer,
  hasSectionGenerationCodeEdits,
} from '../js/sectionGeneration.js';

// ---- simplifyChord ----
assert.equal(simplifyChord('C'), 'C');
assert.equal(simplifyChord('Cmaj7'), 'C');
assert.equal(simplifyChord('Am7'), 'Am');
assert.equal(simplifyChord('F#m7b5'), 'F#m');
assert.equal(simplifyChord('Bb'), 'A#');
assert.equal(simplifyChord('Dm/F'), 'Dm');
assert.equal(simplifyChord('N'), null);
assert.equal(simplifyChord(''), null);
assert.equal(simplifyChord(undefined), null);

// ---- detection on a synthetic song: A(16) B(16) A(16), 1 chord per bar ----
const PROG_A = ['C', 'G', 'Am', 'F'];
const PROG_B = ['Dm', 'Em', 'F', 'G'];
const intervals = Array.from({ length: 48 }, (_, i) => ({ start: i * 2, end: i * 2 + 2 }));
const synthChords = intervals.map((iv, i) => {
  const prog = i >= 16 && i < 32 ? PROG_B : PROG_A;
  return { _id: `c${i}`, chord: prog[i % 4], start: iv.start, end: iv.end };
});
const detected = detectSectionBoundaries(synthChords, intervals);
assert.equal(detected.algorithmVersion, SECTION_BOUNDARY_ALGORITHM_VERSION);
assert.equal(detected.barCount, 48);
assert.ok(detected.bars.includes(16), 'finds the A->B boundary');
assert.ok(detected.bars.includes(32), 'finds the B->A boundary');
assert.ok(detected.bars.every(b => b >= 2 && b < 48), 'bar 0/1 are never boundaries');
assert.deepEqual(detected.bars, [...detected.bars].sort((a, b) => a - b), 'ascending');
for (let i = 1; i < detected.bars.length; i++) {
  assert.ok(detected.bars[i] - detected.bars[i - 1] >= 8, 'min distance 8 bars');
}
assert.equal(detected.diagnostics.length, detected.bars.length);
assert.ok(!('confidence' in detected.diagnostics[0]), 'no probability-like score is exposed');
// Determinism
assert.deepEqual(detectSectionBoundaries(synthChords, intervals).bars, detected.bars);
// Degenerate inputs do not throw
assert.deepEqual(detectSectionBoundaries([], []).bars, []);
assert.deepEqual(detectSectionBoundaries([{ chord: 'N', start: 0, end: 1 }], [{ start: 0, end: 1 }]).bars, []);
assert.deepEqual(buildBarVectors([{ chord: 'C', start: 0, end: 2 }], [{ start: 0, end: 1 }, { start: 1, end: 2 }])
  .map(v => v.map(x => Number(x.toFixed(3)))), [[1], [1]]);

// ---- input-quality hint ----
{
  const reg = Array.from({ length: 10 }, (_, i) => ({ start: i * 2, end: i * 2 + 2 }));
  assert.equal(measureIrregularity(reg).irregularCount, 0);
  const odd = reg.map(iv => ({ ...iv }));
  odd[4] = { start: 8, end: 9 }; // half-length bar in the middle
  assert.equal(measureIrregularity(odd).irregularCount, 1);
  odd[0] = { start: 0, end: 0.5 }; // pickup is ignored
  assert.equal(measureIrregularity(odd).irregularCount, 1);
  assert.deepEqual(measureIrregularity([{ start: 0, end: 1 }]), { medianSeconds: null, irregularCount: 0, total: 0 });
}

// ---- bar -> chord mapping ----
// bar index of a chord = floor(start / 2) in this fixture
const measureOf = c => Math.floor(c.start / 2);
const buf = (specs) => specs.map(([chord, start], i) => ({ _id: `k${i}`, chord, start, end: start + 1 }));

// exact: one chord per bar
{
  const b = buf([['C', 0], ['G', 2], ['Am', 4], ['F', 6], ['C', 8], ['G', 10]]);
  const r = mapBoundariesToChordRanges([2, 4], b, measureOf);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ranges.map(x => [x.startIndex, x.endIndex]), [[0, 1], [2, 3], [4, 5]]);
  assert.ok(r.ranges.every(x => !x.snapped));
}
// snapped: no chord starts in bar 3 -> the next chord (bar 4) is used and reported
{
  const b = buf([['C', 0], ['G', 2], ['Am', 8], ['F', 10], ['C', 12]]); // bars 0,1,4,5,6
  const r = mapBoundariesToChordRanges([3], b, measureOf);
  assert.equal(r.ok, true);
  assert.equal(r.ranges[1].startIndex, 2);
  assert.equal(r.ranges[1].requestedBar, 3);
  assert.equal(r.ranges[1].actualBar, 4);
  assert.equal(r.ranges[1].snapped, true);
}
// two boundaries collapsing onto one chord are rejected, not invented
{
  const b = buf([['C', 0], ['G', 2], ['Am', 8], ['F', 10]]); // bars 0,1,4,5
  const r = mapBoundariesToChordRanges([3, 4], b, measureOf);
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems, [{ bar: 4, reason: 'collapses-onto-previous' }]);
}
// boundary after the last chord
{
  const b = buf([['C', 0], ['G', 2]]);
  const r = mapBoundariesToChordRanges([5], b, measureOf);
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].reason, 'no-chord-at-or-after-bar');
}
// N.C. is a normal chord and may start a Section; empty-name chords never do
{
  const b = buf([['C', 0], ['G', 2], ['N', 4], ['F', 6]]);
  assert.equal(mapBoundariesToChordRanges([2], b, measureOf).ranges[1].startIndex, 2, 'N.C. can start a Section');
  const withEmpty = [...b];
  withEmpty[2] = { ...withEmpty[2], chord: '' };
  const r = mapBoundariesToChordRanges([2], withEmpty, measureOf);
  assert.equal(r.ranges[1].startIndex, 3, 'empty-name chord is skipped as a start');
  assert.equal(r.ranges[0].endIndex, 2, 'previous Section still ends right before (no gap)');
}
// a chord outside the grid (measureOf -> null) is never a start
{
  const b = buf([['C', 0], ['G', 2], ['Am', 4]]);
  const r = mapBoundariesToChordRanges([2], b, c => (c._id === 'k1' ? null : measureOf(c)));
  assert.equal(r.ranges[1].startIndex, 2);
}
// invalid / non-ascending bars and empty buffer
{
  const b = buf([['C', 0], ['G', 2], ['Am', 4], ['F', 6]]);
  assert.equal(mapBoundariesToChordRanges([0], b, measureOf).problems[0].reason, 'invalid-bar');
  assert.equal(mapBoundariesToChordRanges([1.5], b, measureOf).problems[0].reason, 'invalid-bar');
  assert.equal(mapBoundariesToChordRanges([3, 2], b, measureOf).problems[0].reason, 'not-ascending');
  assert.equal(mapBoundariesToChordRanges([2, 2], b, measureOf).problems[0].reason, 'not-ascending');
  assert.equal(mapBoundariesToChordRanges([1], [], measureOf).problems[0].reason, 'empty-buffer');
  // no boundary -> a single Section covering everything
  assert.deepEqual(mapBoundariesToChordRanges([], b, measureOf).ranges.map(x => [x.startIndex, x.endIndex]), [[0, 3]]);
}

// ---- set validation ----
{
  const b = buf([['C', 0], ['G', 2], ['Am', 4], ['F', 6]]);
  const S = (id, s, e) => ({ id, type: 'other', name: '未設定', startChordId: `k${s}`, endChordId: `k${e}` });
  const reasons = (sections) => validateGeneratedSectionSet(sections, b).errors.map(e => e.reason);
  assert.equal(validateGeneratedSectionSet([S('a', 0, 1), S('b', 2, 3)], b).valid, true);
  assert.deepEqual(reasons([S('a', 0, 1), S('b', 3, 3)]), ['gap-before']);
  assert.deepEqual(reasons([S('a', 0, 2), S('b', 2, 3)]), ['overlaps-previous']);
  assert.deepEqual(reasons([S('a', 2, 3), S('b', 0, 1)]), ['first-section-not-at-start', 'not-in-time-order', 'last-section-not-at-end']);
  assert.deepEqual(reasons([S('a', 1, 2), S('b', 3, 3)]), ['first-section-not-at-start']);
  assert.deepEqual(reasons([S('a', 0, 1), S('b', 2, 2)]), ['last-section-not-at-end']);
  assert.deepEqual(reasons([S('a', 0, 1), S('a', 2, 3)]), ['duplicate-section-id']);
  assert.deepEqual(reasons([S('a', 2, 1)]), ['start-after-end']);
  assert.deepEqual(reasons([{ ...S('a', 0, 3), startChordId: 'nope' }]), ['start-not-found']);
  assert.deepEqual(reasons([{ ...S('a', 0, 3), name: '  ' }]), ['invalid-section-name']);
  assert.deepEqual(reasons([]), ['empty-set']);
  assert.deepEqual(validateGeneratedSectionSet([S('a', 0, 3)], []).errors.map(e => e.reason), ['no-buffer']);
}

// ---- draft -> Sections -> apply (Undo) ----
{
  const b = buf([['C', 0], ['G', 2], ['Am', 4], ['F', 6], ['C', 8], ['G', 10]]);
  const draft = createDraftFromBoundaries([2, 4], [{ bar: 2, changeAround4Bars: 0.5, barsFromPrevious: 2, alignedTo4or8: false }]);
  assert.equal(draft.length, 3);
  assert.deepEqual(draft.map(d => d.name), ['未設定', '未設定', '未設定']);
  assert.equal(draft[1].diagnostics.bar, 2);
  assert.equal(draft[2].diagnostics, null);

  let n = 0;
  const built = buildSectionsFromDraft(draft, b, measureOf, () => `sec${++n}`);
  assert.equal(built.ok, true);
  assert.deepEqual(built.sections.map(s => [s.id, s.startChordId, s.endChordId]),
    [['sec1', 'k0', 'k1'], ['sec2', 'k2', 'k3'], ['sec3', 'k4', 'k5']]);
  assert.ok(built.sections.every(s => Object.keys(s).sort().join() === 'endChordId,id,name,startChordId,type'),
    'only keys accepted by applyGeneratedSectionsCommand');

  const state = { active: true, buffer: b, sections: [], history: [], future: [], dirty: false,
    selection: { chordIds: [], boundaryIndex: null, anchorChordId: null, editPoint: null } };
  const applied = applyGeneratedSectionsCommand(state, built.sections);
  assert.equal(applied.ok, true);
  assert.equal(applied.count, 3);
  assert.equal(state.history.length, 1, 'one undo step for the whole set');
  assert.equal(undoBuffer(state), true);
  assert.equal(state.sections.length, 0);

  // user-edited draft: renamed and moved boundary
  const edited = draft.map(d => ({ ...d }));
  edited[1].startBar = 3; // moved from bar 2 to bar 3
  edited[1].name = 'Aメロ';
  edited[2].startBar = 5;
  const e = buildSectionsFromDraft(edited, b, measureOf, () => 'x' + (++n));
  assert.equal(e.ok, true);
  assert.equal(e.sections[1].name, 'Aメロ');
  assert.deepEqual(e.sections.map(s => [s.startChordId, s.endChordId]), [['k0', 'k2'], ['k3', 'k4'], ['k5', 'k5']]);

  // invalid draft: duplicate bars are reported and nothing is built
  const dup = draft.map(d => ({ ...d }));
  dup[2].startBar = dup[1].startBar;
  const d = buildSectionsFromDraft(dup, b, measureOf);
  assert.equal(d.ok, false);
  assert.deepEqual(d.sections, []);
  assert.equal(d.errors[0].reason, 'not-ascending');
  // empty name is rejected by set validation
  const blank = draft.map(d2 => ({ ...d2 }));
  blank[0].name = '';
  assert.equal(buildSectionsFromDraft(blank, b, measureOf).errors[0].reason, 'invalid-section-name');
  assert.equal(buildSectionsFromDraft([], b, measureOf).errors[0].reason, 'empty-draft');
}

// ---- stale-candidate detection reuses the existing buffer-snapshot helpers ----
{
  const b = buf([['C', 0], ['G', 2]]);
  const snapshot = captureSectionGenerationBuffer(b);
  assert.equal(hasSectionGenerationCodeEdits(b, snapshot), false);
  const edited = structuredClone(b);
  edited[1].chord = 'Am';
  assert.equal(hasSectionGenerationCodeEdits(edited, snapshot), true, 'chord rename is detected');
  const moved = structuredClone(b);
  moved[1].start = 3;
  assert.equal(hasSectionGenerationCodeEdits(moved, snapshot), true, 'timing change is detected');
  assert.equal(hasSectionGenerationCodeEdits(b.slice(0, 1), snapshot), true, 'deleted chord is detected');
}

console.log('Section auto-generation tests passed.');
