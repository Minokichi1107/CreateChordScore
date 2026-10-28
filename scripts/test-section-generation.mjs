import assert from 'node:assert/strict';
import {
  captureSectionGenerationBuffer,
  evaluateSectionGenerationEligibility,
  hasSectionGenerationCodeEdits,
} from '../js/sectionGeneration.js';
import { applyGeneratedSectionsCommand } from '../js/analysisCommands.js';
import { undoBuffer, redoBuffer } from '../js/analysisSession.js';

const analysis = {
  projectId: 'p1',
  generatedAt: '2026-10-27T00:00:00.000Z',
  raw: { sections: [], chords: [{ _id: 'c1' }, { _id: 'c2' }] },
};
const eligible = evaluateSectionGenerationEligibility({
  loadResult: { state: 'present', sha256: 'a'.repeat(64), analysis },
  expectedProjectId: 'p1',
  memoryRaw: structuredClone(analysis.raw),
  editorSession: { active: false, dirty: false },
});
assert.equal(eligible.eligible, true);
assert.equal(eligible.sha256, 'a'.repeat(64));

assert.equal(evaluateSectionGenerationEligibility({
  loadResult: { state: 'present', analysis: { ...analysis, raw: { chords: analysis.raw.chords } } },
  expectedProjectId: 'p1',
  memoryRaw: analysis.raw,
}).reason, 'sections-missing');

assert.equal(evaluateSectionGenerationEligibility({
  loadResult: { state: 'present', analysis: { ...analysis, raw: { ...analysis.raw, sections: [{ id: 'old' }] } } },
  expectedProjectId: 'p1',
  memoryRaw: analysis.raw,
}).reason, 'sections-already-exist');

assert.equal(evaluateSectionGenerationEligibility({
  loadResult: { state: 'present', analysis },
  expectedProjectId: 'p1',
  memoryRaw: { chords: [{ _id: 'different' }, { _id: 'c2' }] },
}).reason, 'chords-changed-on-disk');

// ---- Eligibility rejection regressions (docs/section-save-technical-design.md §8.1) ----
// Every case starts from the eligible fixture above and breaks exactly one condition.
function evaluate({ loadResult, expectedProjectId = 'p1', memoryRaw = analysis.raw, editorSession = null } = {}) {
  return evaluateSectionGenerationEligibility({
    loadResult: loadResult === undefined ? { state: 'present', analysis } : loadResult,
    expectedProjectId,
    memoryRaw,
    editorSession,
  });
}
function withAnalysis(patch) {
  return { state: 'present', analysis: { ...analysis, ...patch } };
}
function assertRejected(result, reason, label) {
  assert.equal(result.eligible, false, `${label}: must be rejected`);
  assert.equal(result.reason, reason, `${label}: reason`);
  assert.equal(result.analysis, undefined, `${label}: must not expose analysis`);
}

// §8.1 row 1: the server state must be `present` (absent / duplicate / invalid JSON / read error).
assertRejected(evaluate({ loadResult: { state: 'absent' } }), 'read-absent', 'state absent');
assertRejected(evaluate({ loadResult: { state: 'duplicate' } }), 'multiple-files', 'state duplicate');
// A non-present state must win even if an analysis object is (wrongly) attached to the response.
assertRejected(evaluate({ loadResult: { state: 'absent', analysis } }), 'read-absent', 'absent state with analysis attached');
assertRejected(evaluate({ loadResult: { state: 'invalid-json' } }), 'read-invalid-json', 'state invalid-json');
// Reason wording for the next two is incidental; only the rejection itself is specified.
for (const [label, loadResult] of [['state read-error', { state: 'read-error' }], ['present without analysis', { state: 'present' }]]) {
  const result = evaluate({ loadResult });
  assert.equal(result.eligible, false, `${label}: must be rejected`);
  assert.equal(result.analysis, undefined, `${label}: must not expose analysis`);
}

// §7.4 / §8.1: projectId must match the current project.
assertRejected(evaluate({ expectedProjectId: 'other' }), 'project-id-mismatch', 'projectId mismatch');
assertRejected(evaluate({ expectedProjectId: '' }), 'project-id-mismatch', 'empty expected projectId');
assertRejected(evaluate({ loadResult: withAnalysis({ projectId: undefined }) }), 'project-id-mismatch', 'missing projectId');

// §8.1 (F8): generatedAt must be a non-empty string; legacy files without it are not eligible.
for (const [label, value] of [
  ['missing', undefined], ['null', null], ['empty', ''], ['blank', '   '], ['number', 123], ['object', {}],
]) {
  assertRejected(evaluate({ loadResult: withAnalysis({ generatedAt: value }) }), 'generated-at-missing', `generatedAt ${label}`);
}

// §8.1: raw.sections must exist, be an array and be empty. (Missing / non-empty are covered above.)
for (const [label, value] of [['null', null], ['object', {}], ['string', 'sections'], ['number', 0]]) {
  assertRejected(
    evaluate({ loadResult: withAnalysis({ raw: { ...analysis.raw, sections: value } }) }),
    'sections-not-array',
    `sections ${label}`,
  );
}
assertRejected(evaluate({ loadResult: withAnalysis({ raw: [] }) }), 'raw-invalid', 'raw is an array');
assertRejected(evaluate({ loadResult: withAnalysis({ raw: null }) }), 'raw-invalid', 'raw is null');

// §7.4 / §8.1: every on-disk chord must carry a usable `_id` (Section references are chord IDs).
for (const [label, chords] of [
  ['not an array', null],
  ['chord is null', [{ _id: 'c1' }, null]],
  ['_id missing', [{ _id: 'c1' }, {}]],
  ['_id empty', [{ _id: 'c1' }, { _id: '' }]],
  ['_id blank', [{ _id: 'c1' }, { _id: '  ' }]],
  ['_id not a string', [{ _id: 'c1' }, { _id: 2 }]],
]) {
  assertRejected(
    evaluate({ loadResult: withAnalysis({ raw: { sections: [], chords } }) }),
    'disk-chords-invalid',
    `disk chords ${label}`,
  );
}

// §8.1 (R6): an active editor with unsaved edits blocks generation; the other combinations do not.
assertRejected(
  evaluate({ editorSession: { active: true, dirty: true } }),
  'editor-has-unsaved-edits',
  'active editor with unsaved edits',
);
assert.equal(evaluate({ editorSession: { active: true, dirty: false } }).eligible, true, 'active but clean editor');
assert.equal(evaluate({ editorSession: { active: false, dirty: true } }).eligible, true, 'inactive editor is not an editing session');
assert.equal(evaluate({ editorSession: null }).eligible, true, 'no editor session');

// Duplicate chord `_id`s on disk make Section endpoints ambiguous and are rejected by the server
// (section_save.validate_sections: duplicate-chord-id), so generation must not start (review of PR #185).
function chordsOf(ids) { return ids.map(id => ({ _id: id })); }
function evaluateDiskChords(ids, memoryIds = ids) {
  return evaluate({
    loadResult: withAnalysis({ raw: { sections: [], chords: chordsOf(ids) } }),
    memoryRaw: { chords: chordsOf(memoryIds) },
  });
}
for (const [label, ids] of [
  ['adjacent', ['c1', 'c1', 'c2', 'c3']],
  ['distant', ['c1', 'c2', 'c3', 'c4', 'c1']],
  ['first and last', ['c1', 'c2', 'c3', 'c1']],
  ['two different pairs', ['c1', 'c2', 'c1', 'c2']],
  ['last two', ['c1', 'c2', 'c3', 'c3']],
  ['all identical', ['c1', 'c1', 'c1']],
]) {
  assertRejected(evaluateDiskChords(ids), 'disk-chords-duplicate-id', `duplicate disk chord ids (${label})`);
}
// Unique IDs stay eligible; IDs are compared exactly, as the server does (case and whitespace are significant).
assert.equal(evaluateDiskChords(['c1', 'c2', 'c3', 'c4']).eligible, true, 'unique chord ids');
assert.equal(evaluateDiskChords(['c1', 'C1', ' c1']).eligible, true, 'ids differing in case or whitespace are distinct');
// The pre-existing invalid-ID classification is unchanged and takes precedence over the duplicate check.
assertRejected(evaluateDiskChords(['c1', 'c1', '']), 'disk-chords-invalid', 'invalid id plus duplicate');
// Duplicates only in memory (disk unique) are still reported as a memory/disk mismatch.
assertRejected(evaluateDiskChords(['c1', 'c2', 'c3'], ['c1', 'c2', 'c2']), 'chords-changed-on-disk', 'duplicate ids only in memory');

const initialBuffer = captureSectionGenerationBuffer([{ _id: 'c1', start: 0, end: 1 }]);
assert.equal(hasSectionGenerationCodeEdits(initialBuffer, initialBuffer), false);
assert.equal(hasSectionGenerationCodeEdits([{ _id: 'c1', start: 0, end: 2 }], initialBuffer), true);

function session() {
  return {
    active: true,
    buffer: [{ _id: 'c1' }, { _id: 'c2' }],
    sections: [],
    history: [],
    future: [],
    dirty: false,
    selection: { chordIds: [], boundaryIndex: null, anchorChordId: null, editPoint: null },
  };
}
const generated = [{
  id: 's1', type: 'verse', name: 'Verse 1',
  startChordId: 'c1', endChordId: 'c2',
}];
const state = session();
state.future.push({ buffer: [], sections: [] }); // a new edit must clear Redo history
const applied = applyGeneratedSectionsCommand(state, generated);
assert.equal(applied.ok, true);
assert.equal(applied.count, 1);
assert.equal(state.sections.length, 1);
assert.equal(state.history.length, 1);
assert.equal(state.dirty, true);
assert.equal(state.future.length, 0);

// Undo restores the empty Section list, and Redo restores the generated Sections.
assert.equal(undoBuffer(state), true);
assert.equal(state.sections.length, 0);
assert.equal(state.history.length, 0);
assert.equal(state.future.length, 1);
assert.equal(redoBuffer(state), true);
assert.deepEqual(state.sections, generated);
assert.equal(state.history.length, 1);
assert.equal(state.future.length, 0);

// Unknown Section keys are rejected before history or state mutation.
const unknownKeyState = session();
const unknownKey = applyGeneratedSectionsCommand(unknownKeyState, [
  { ...generated[0], evil: { injected: true } },
]);
assert.equal(unknownKey.ok, false);
assert.equal(unknownKey.reason, 'unknown-section-key');
assert.equal(unknownKeyState.sections.length, 0);
assert.equal(unknownKeyState.history.length, 0);

// Empty generated Sections are rejected and do not create history.
const emptyState = session();
assert.equal(applyGeneratedSectionsCommand(emptyState, []).reason, 'empty-generated-sections');
assert.equal(emptyState.history.length, 0);

const invalidState = session();
const invalid = applyGeneratedSectionsCommand(invalidState, [{
  id: 's2', type: 'verse', name: 'Bad',
  startChordId: 'missing', endChordId: 'c2',
}]);
assert.equal(invalid.ok, false);
assert.equal(invalidState.sections.length, 0);
assert.equal(invalidState.history.length, 0);

const existingState = session();
existingState.sections.push(generated[0]);
assert.equal(applyGeneratedSectionsCommand(existingState, generated).reason, 'sections-already-exist');
assert.equal(existingState.history.length, 0);

console.log('Section generation W6 tests passed.');
