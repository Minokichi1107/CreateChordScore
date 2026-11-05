import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  simplifyChord,
  buildBarVectors,
  computeBoundaryScores,
  pickBoundaryPeaks,
  detectSectionBoundaries,
  measureIrregularity,
  DEFAULT_PEAK_RADIUS,
  SECTION_BOUNDARY_ALGORITHM_VERSION,
} from '../js/sectionBoundaryDetection.js';
import { createTimingModel } from '../js/timing.js';
import { suggestNewBoundaryBar } from '../js/sectionAutoGenerationModal.js';
import {
  mapBoundariesToChordRanges,
  validateGeneratedSectionSet,
  buildSectionsFromDraft,
  createDraftFromBoundaries,
} from '../js/sectionAutoGeneration.js';
import {
  applyGeneratedSectionsCommand,
  renameSectionCommand,
  updateSectionBoundaryCommand,
} from '../js/analysisCommands.js';
import { undoBuffer, redoBuffer, validateSectionInvariants } from '../js/analysisSession.js';
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
// Measured on the 11-song fixtures with the app's own timing grid (sbd-0.2): tuning F=0.53, holdout F=0.34.
// A JS-only pin (not Python-verified): it only guards against silent behavior changes.
const PINNED_TOTALS = {
  tuning: { tp: 33, pred: 62, gt: 62 },
  holdout: { tp: 17, pred: 50, gt: 49 },
};
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
// No fixed spacing: every candidate is a local peak within the default radius instead.
assert.equal(DEFAULT_PEAK_RADIUS, 2);
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


// ================= P0 review fixes: peak rule, add-position, 11-song regression =================

// ---- peak picking (replaces the fixed 8-bar spacing) ----
assert.deepEqual(pickBoundaryPeaks([0, 0, 1, 1, 0, 0, 0, 0], 5), [2], 'plateau: leftmost bar only');
assert.deepEqual(pickBoundaryPeaks([0, 0, 1, 1 + 1e-12, 0, 0, 0, 0], 5), [2], 'near-tie (<1e-9) is a tie');
assert.deepEqual(pickBoundaryPeaks([0, 0, 5, 4, 3, 0, 0, 0, 0, 0], 5), [2], 'bars next to a higher peak are suppressed');
assert.deepEqual(pickBoundaryPeaks([0, 0, 5, 0, 0, 4, 0, 0, 0, 0], 5), [2, 5], 'short sections: peaks 3 bars apart are both kept');
assert.deepEqual(pickBoundaryPeaks([0, 0, 5, 0, 4, 0, 0, 0, 0], 5), [2], 'radius 2 suppresses a peak 2 bars away');
assert.deepEqual(pickBoundaryPeaks([0, 0, 5, 0, 4, 0, 0, 0, 0], 5, { peakRadius: 1 }), [2, 4], 'radius is a parameter');
assert.deepEqual(pickBoundaryPeaks([0, 0, 5, 0, 0, 4, 0, 0, 0], 5, { minDistance: 4 }), [2], 'optional explicit spacing still works');
assert.deepEqual(pickBoundaryPeaks([9, 9, 1, 0, 0, 0, 3, 0, 0, 0, 2], 2), [6, 10], 'k limit; bars 0/1 never picked');
assert.deepEqual(pickBoundaryPeaks([0, 0, 0, 0, 0], 3), [], 'non-positive scores are never boundaries');

// ---- "add boundary" start position (no assumed section length) ----
{
  const d = starts => starts.map((startBar, i) => ({ candidateId: `c${i}`, startBar }));
  assert.equal(suggestNewBoundaryBar(d([0, 10, 30]), 50), 20, 'middle of the longest section');
  assert.equal(suggestNewBoundaryBar(d([0, 2, 3]), 4), 1, 'a 2-bar section can still be split');
  assert.equal(suggestNewBoundaryBar(d([0, 1]), 2), null, 'no room');
  assert.equal(suggestNewBoundaryBar(d([0, NaN]), 10), 5, 'half-edited rows are ignored');
  assert.equal(suggestNewBoundaryBar(d([0]), 1), null, 'single bar song');
}

// ---- 11-song regression: JS == Python reference, on anonymized fixtures ----
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/section-boundary/songs.json', import.meta.url), 'utf8'));
assert.equal(fixture.algorithmVersion, SECTION_BOUNDARY_ALGORITHM_VERSION,
  'fixture expected values were generated for another algorithm version: run scripts/section_boundary_reference.py --write');
assert.equal(fixture.songs.length, 11);
const rawGrid = song => {
  const edges = [...song.downbeats, song.chords[song.chords.length - 1].end];
  return edges.slice(0, -1).map((start, i) => ({ start, end: edges[i + 1] }));
};
for (const song of fixture.songs) {
  const grid = rawGrid(song);
  const scores = computeBoundaryScores(buildBarVectors(song.chords, grid));
  assert.equal(scores.length, song.expected.scores.length, `${song.id}: bar count`);
  scores.forEach((v, i) => assert.ok(Math.abs(v - song.expected.scores[i]) <= 1e-9, `${song.id}: score of bar ${i}`));
  assert.deepEqual(detectSectionBoundaries(song.chords, grid).bars, song.expected.bars, `${song.id}: boundaries`);
}

// ---- accuracy on the app's own timing grid (JS-only pin; guards against silent behavior changes) ----
function appGrid(song) {
  const model = createTimingModel({
    beats: song.beats, downbeats: song.downbeats, timeSignature: song.timeSignature,
    resolutionPerBeat: 2, quantizeMode: 'nearest', anticipationWindow: 0.5, audioDuration: null,
    repairRule: song.repairRule ?? null,
  });
  const count = model.measureCount;
  const intervals = Array.from({ length: count }, (_, i) => {
    const m = model.getMeasure(i);
    return { start: m.startTime, end: m.endTime };
  });
  const measureOf = chord => {
    const q = model.quantize(chord.start);
    return q.measure >= 0 && q.measure < count ? q.measure : null;
  };
  return { model, intervals, measureOf, count };
}
const hits = (pred, gt, tol) => {
  const used = new Set();
  let tp = 0;
  for (const p of pred) {
    const i = gt.findIndex((g, gi) => !used.has(gi) && Math.abs(p - g) <= tol);
    if (i !== -1) { used.add(i); tp += 1; }
  }
  return tp;
};
const totals = { tuning: { tp: 0, pred: 0, gt: 0 }, holdout: { tp: 0, pred: 0, gt: 0 } };
for (const song of fixture.songs) {
  const g = appGrid(song);
  assert.notEqual(g.model.mode, 'fallback', `${song.id}: timing model`);
  const detectedBars = detectSectionBoundaries(song.chords, g.intervals).bars;
  const gt = [...new Set(song.sectionStartChordIndices.map(i => g.measureOf(song.chords[i])))]
    .filter(b => b !== null && b > 0).sort((a, b) => a - b);
  const bucket = totals[song.holdout ? 'holdout' : 'tuning'];
  bucket.tp += hits(detectedBars, gt, 1); bucket.pred += detectedBars.length; bucket.gt += gt.length;

  // end-to-end for every song (including the two F=0 songs): bars -> Sections -> validated, applied, Undo, Redo
  const buffer = song.chords.map((c, i) => ({ ...c, _id: `${song.id}-${i}` }));
  const draft = createDraftFromBoundaries(detectedBars);
  let n = 0;
  const built = buildSectionsFromDraft(draft, buffer, g.measureOf, () => `${song.id}-s${n++}`);
  assert.equal(built.ok, true, `${song.id}: generated Sections must validate (${JSON.stringify(built.errors)})`);
  assert.equal(built.sections.length, detectedBars.length + 1);
  const state = { active: true, buffer, sections: [], history: [], future: [], dirty: false,
    selection: { chordIds: [], boundaryIndex: null, anchorChordId: null, editPoint: null } };
  assert.equal(applyGeneratedSectionsCommand(state, built.sections).ok, true);
  assert.equal(state.history.length, 1, `${song.id}: one undo step`);
  assert.equal(undoBuffer(state), true);
  assert.equal(state.sections.length, 0, `${song.id}: Undo removes the whole set`);
  assert.equal(state.history.length, 0);
  assert.equal(redoBuffer(state), true);
  assert.deepEqual(state.sections, built.sections, `${song.id}: Redo restores the whole set`);
  assert.equal(state.future.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(state.sections)), built.sections, `${song.id}: survives a JSON save/load round trip`);
  assert.equal(validateGeneratedSectionSet(JSON.parse(JSON.stringify(state.sections)), buffer).valid, true, `${song.id}: valid after reload`);
}
const fScore = ({ tp, pred, gt }) => { const p = tp / pred; const r = tp / gt; return 2 * p * r / (p + r); };
console.log(`accuracy (+-1 bar, app grid): tuning F=${fScore(totals.tuning).toFixed(2)} holdout F=${fScore(totals.holdout).toFixed(2)}`, JSON.stringify(totals));
assert.deepEqual(totals, PINNED_TOTALS, 'accuracy pin changed: re-evaluate before accepting (algorithm or grid behavior changed)');

// ---- editing generated Sections with the existing commands (rename / boundary move) + Undo/Redo ----
{
  const b = buf([['C', 0], ['G', 2], ['Am', 4], ['F', 6], ['C', 8], ['G', 10]]);
  const built = buildSectionsFromDraft(createDraftFromBoundaries([2, 4]), b, measureOf, (() => { let i = 0; return () => `g${i++}`; })());
  const state = { active: true, buffer: b, sections: [], history: [], future: [], dirty: false,
    selection: { chordIds: [], boundaryIndex: null, anchorChordId: null, editPoint: null } };
  assert.equal(applyGeneratedSectionsCommand(state, built.sections).ok, true);
  assert.equal(renameSectionCommand(state, 'g1', { name: 'Aメロ', type: 'jp-a-melo' }).ok, true);
  assert.equal(updateSectionBoundaryCommand(state, 'g1', { endChordId: 'k2' }).ok, true, 'shorten a generated Section');
  assert.equal(state.history.length, 3, 'generation + rename + boundary move = 3 undo steps');
  assert.equal(state.sections.find(s => s.id === 'g1').name, 'Aメロ');
  assert.equal(updateSectionBoundaryCommand(state, 'g1', { endChordId: 'nope' }).ok, false, 'invalid edit rejected, history unchanged');
  assert.equal(state.history.length, 3);
  assert.equal(undoBuffer(state), true);   // boundary move
  assert.equal(state.sections.find(s => s.id === 'g1').endChordId, 'k3');
  assert.equal(undoBuffer(state), true);   // rename
  assert.equal(state.sections.find(s => s.id === 'g1').name, '未設定');
  assert.equal(redoBuffer(state), true);
  assert.equal(redoBuffer(state), true);
  assert.equal(state.sections.find(s => s.id === 'g1').endChordId, 'k2');
  assert.equal(validateSectionInvariants(state.sections.find(s => s.id === 'g1'), b).valid, true);
}

// ================= boundary cases =================
{
  // pickup (anacrusis) + intro: a short first bar; irregular bar lengths; chords crossing barlines
  const lengths = [0.5, 2, 2, 2, 2, 1, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  let t = 0;
  const ivs = lengths.map(len => { const iv = { start: t, end: t + len }; t += len; return iv; });
  const progA = ['C', 'G', 'Am', 'F'];
  const chords = ivs.map((iv, i) => ({ _id: `p${i}`, chord: i === 0 ? 'N' : progA[i % 4], start: iv.start, end: iv.end }));
  const result = detectSectionBoundaries(chords, ivs);
  assert.ok(result.bars.every(x => x >= 2 && x < ivs.length), 'pickup/irregular bars: boundaries stay inside the song');
  assert.equal(measureIrregularity(ivs).irregularCount, 2, 'the 1s and 3s bars are flagged (>30% off the median); the pickup is ignored');

  // a chord spanning a barline counts, time-weighted, in both bars
  const vec = buildBarVectors([{ chord: 'C', start: 0, end: 3 }, { chord: 'G', start: 3, end: 4 }], [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.ok(vec[0].length === 2 && vec[1][0] > 0 && vec[1][1] > 0, 'barline-crossing chord contributes to both bars');
}
{
  // chord crossing a barline: the Section starts at the next chord that STARTS in/after the boundary bar
  const b = buf([['C', 0], ['G', 2], ['Am', 3], ['F', 6]]); // Am starts in bar 1 and sounds into bar 2
  const r = mapBoundariesToChordRanges([2], b, measureOf);
  assert.equal(r.ok, true);
  assert.equal(r.ranges[1].startIndex, 3, 'the spanning chord does not start the Section; F (bar 3) does');
  assert.equal(r.ranges[1].snapped, true);
}
{
  // empty-name chords at the start / end of the buffer
  const b = [{ _id: 'e0', chord: '', start: 0, end: 1 }, ...buf([['C', 2], ['G', 4], ['Am', 6]]).map((c, i) => ({ ...c, _id: `k${i}` })),
    { _id: 'e1', chord: '', start: 8, end: 9 }];
  const r = mapBoundariesToChordRanges([2], b, measureOf);
  assert.equal(r.ok, true);
  assert.equal(r.ranges[0].startIndex, 0, 'first Section starts at buffer[0] even if it is an empty chord');
  assert.equal(r.ranges[1].startIndex, 2, 'an empty chord never starts a later Section');
  assert.equal(r.ranges[r.ranges.length - 1].endIndex, b.length - 1, 'trailing empty chord is covered');
  const built = buildSectionsFromDraft(createDraftFromBoundaries([2]), b, measureOf, (() => { let i = 0; return () => `s${i++}`; })());
  assert.equal(built.ok, true, JSON.stringify(built.errors));
}
{
  // boundary near the end of the song, and several boundaries mapping to one chord
  const b = buf([['C', 0], ['G', 2], ['Am', 4], ['F', 6]]);
  const last = mapBoundariesToChordRanges([3], b, measureOf);
  assert.equal(last.ok, true);
  assert.deepEqual(last.ranges.map(x => [x.startIndex, x.endIndex]), [[0, 2], [3, 3]], 'last Section can be a single chord');
  assert.equal(mapBoundariesToChordRanges([4], b, measureOf).problems[0].reason, 'no-chord-at-or-after-bar');
  const sparse = buf([['C', 0], ['G', 2], ['Am', 12]]); // bars 0,1,6
  const draft = createDraftFromBoundaries([3, 4, 5]);
  const built = buildSectionsFromDraft(draft, sparse, measureOf);
  assert.equal(built.ok, false);
  assert.deepEqual(built.errors.map(e => e.reason), ['collapses-onto-previous', 'collapses-onto-previous']);
  assert.deepEqual(built.sections, [], 'nothing is built when boundaries collapse');
}

console.log('Section auto-generation tests passed.');
