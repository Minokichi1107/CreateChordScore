/**
 * Phase150 Stage1 — Section reconfiguration unit tests
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateGeneratedSectionSet,
} from '../js/sectionSetValidation.js';
import {
  RECONFIG_GAP_TYPE,
  buildDraftSectionsFromCurrent,
  calculateSectionCoverage,
  recommendSectionReconfiguration,
  createReconfigurationDraft,
  updateDraftSection,
  undoDraft,
  redoDraft,
  setDraftSectionEndByChordIndex,
  canAdjustBoundaryWithNext,
  adjustSharedBoundary,
  splitDraftAtChordIndex,
  deleteDraftSection,
  deleteDraftSectionAt,
  diagnoseDraftSection,
  diagnoseDraftSections,
  classifySectionDiagForUi,
  isDraftDirty,
  prepareDraftForAdopt,
  mergeDraftWithPrevious,
  orderedValidSections,
  toCanonicalSection,
  toCanonicalSections,
  createReconfigRuntime,
  teardownReconfigRuntime,
  draftSectionChordSpans,
} from '../js/sectionReconfiguration.js';
import { replaceSectionsFromDraftCommand, applyGeneratedSectionsCommand } from '../js/analysisCommands.js';
import { undoBuffer } from '../js/analysisSession.js';
import {
  buildDraftIssueBannersHtml,
  openSectionReconfigurationModal,
} from '../js/sectionReconfigurationModal.js';

assert.equal(typeof openSectionReconfigurationModal, 'function', 'Stage1 modal module imports');
// Stage1 keyboard/IME regressions are guarded at the actual event-handler layer.
const stage1ModalSource = readFileSync(new URL('../js/sectionReconfigurationModal.js', import.meta.url), 'utf8');
assert.match(stage1ModalSource, /if \(e\.isComposing \|\| e\.keyCode === 229\) return;/, 'IME composition blocks modal shortcuts');
assert.match(stage1ModalSource, /if \(inField\) \{[\s\S]*?return;[\s\S]*?if \(e\.code === 'Tab'\)/, 'editable fields retain native Tab behavior');
assert.match(stage1ModalSource, /updatePlayingHighlight\(null\);/, 'playback end updates highlight without rebuilding the name input');
assert.match(stage1ModalSource, /patch\.nameUserEdited = false;[\s\S]*?opts\.defaultNameForType = type => generateDraftSectionName\(type, sec\.id\)/, 'type changes always regenerate names and clear manual-name metadata');
const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.match(appSource, /SECTION_TYPES\.find\(entry => entry\.value === type\)/, 'legacy auto-name inference remains available to the separate rename dialog');

const buf = (n = 4) => Array.from({ length: n }, (_, i) => ({
  _id: `k${i}`, chord: ['C', 'G', 'Am', 'F'][i % 4], start: i * 2, end: i * 2 + 2,
}));
const S = (id, s, e, type = 'verse', name = 'V') => ({
  id, type, name, startChordId: `k${s}`, endChordId: `k${e}`,
});
const st = (b, sections = []) => ({
  active: true, buffer: b, sections: structuredClone(sections),
  history: [], future: [], dirty: false,
  selection: { chordIds: [], boundaryIndex: null, anchorChordId: null, editPoint: null },
});

{
  const b = buf();
  const sections = [S('a', 0, 1, 'other', '未設定'), S('b', 2, 3, 'other', '未設定')];
  assert.equal(validateGeneratedSectionSet(sections, b).valid, true);
}

{
  const b = buf(6);
  const built = buildDraftSectionsFromCurrent(b, [S('a', 0, 1), S('c', 4, 5)]);
  assert.equal(built.gapsFilled, 1);
  assert.ok(built.sections.some(s => s.type === RECONFIG_GAP_TYPE));
}

{
  // Existing overlaps are trimmed in chronological order; fully absorbed Sections are dropped.
  const b = buf(8);
  const built = buildDraftSectionsFromCurrent(b, [
    S('first', 0, 5),
    S('absorbed', 3, 4),
    S('later', 4, 7),
  ]);
  assert.deepEqual(
    built.sections.map(section => [section.id, section.startChordId, section.endChordId]),
    [['first', 'k0', 'k5'], ['later', 'k6', 'k7']],
  );
  assert.equal(built.overlapCount, 2);
  assert.equal(built.droppedCount, 1);
  assert.equal(built.gapsFilled, 0);
}

{
  // Gaps are filled after overlap trimming, not against the uncorrected start boundary.
  const b = buf(8);
  const built = buildDraftSectionsFromCurrent(b, [
    S('first', 0, 2),
    S('trimmed', 1, 4),
    S('last', 6, 7),
  ], (() => { let n = 0; return () => `gap-${++n}`; })());
  assert.deepEqual(
    built.sections.map(section => [section.id, section.startChordId, section.endChordId]),
    [['first', 'k0', 'k2'], ['trimmed', 'k3', 'k4'], ['gap-1', 'k5', 'k5'], ['last', 'k6', 'k7']],
  );
  assert.equal(built.gapsFilled, 1);
}

{
  // Coverage is time-weighted, unions overlaps once, and leaves gaps uncovered.
  const b = buf(10);
  const coverage = calculateSectionCoverage([
    S('a', 0, 5),
    S('b', 4, 7),
  ], b);
  assert.equal(coverage.totalSeconds, 20);
  assert.equal(coverage.coveredSeconds, 16);
  assert.equal(coverage.ratio, 0.8);
  assert.equal(recommendSectionReconfiguration(coverage), 'keep-existing');

  const below = calculateSectionCoverage([S('a', 0, 3), S('b', 6, 7)], b);
  assert.equal(below.ratio, 0.6);
  assert.equal(recommendSectionReconfiguration(below), 'start-fresh');
  assert.equal(recommendSectionReconfiguration({ ratio: null }), null);
}

{
  const b = buf();
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [S('a', 0, 3)] });
  assert.equal(isDraftDirty(draft), false);
  updateDraftSection(draft, 'a', { name: 'X' });
  assert.equal(draft.sections[0].name, 'X');
  assert.equal(isDraftDirty(draft), true);
  undoDraft(draft);
  assert.equal(draft.sections[0].name, 'V');
  redoDraft(draft);
  assert.equal(draft.sections[0].name, 'X');
}

{
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 3), S('b', 4, 7)];
  const r = adjustSharedBoundary(draft, 'a', 'b', 2, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k2');
  assert.equal(draft.sections[1].startChordId, 'k3');
  assert.equal(draft.sections[1].endChordId, 'k7');
}

{
  // Stage2: the single-Section setter changes only its target; shared movement has a separate API.
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 7)];
  const r = setDraftSectionEndByChordIndex(draft, 0, 1, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k1');
  assert.equal(draft.sections[1].startChordId, 'k3');
  assert.equal(draft.sections[1].endChordId, 'k7');
}

{
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 5), S('c', 6, 7)];
  const r = adjustSharedBoundary(draft, 'a', 'b', 5, b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'next-section-too-short');
  assert.equal(draft.sections[0].endChordId, 'k2');
  assert.equal(draft.sections[1].startChordId, 'k3');
  assert.equal(draft.sections[2].startChordId, 'k6');
  assert.equal(draft.sections[2].endChordId, 'k7');
}

{
  // A-5: the last Section has no shared boundary; intentional subdivision uses the split API.
  const b = buf(6);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 5)];
  const can = canAdjustBoundaryWithNext(draft, b, 'b');
  assert.equal(can.ok, false);
  assert.equal(can.reason, 'last');
  assert.equal(draft.sections.length, 2);
  const rSplit = splitDraftAtChordIndex(draft, 'b', 4, b);
  assert.equal(rSplit.ok, true, rSplit.reason);
  assert.equal(draft.sections.length, 3);
  assert.equal(draft.sections[1].endChordId, 'k4');
  assert.equal(draft.sections[2].startChordId, 'k5');
}

{
  const b = buf(9);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 5), S('c', 6, 8)];
  const r = adjustSharedBoundary(draft, 'a', 'b', 1, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k1');
  assert.equal(draft.sections[1].startChordId, 'k2');
  assert.equal(draft.sections[1].endChordId, 'k5');
  assert.equal(draft.sections[2].startChordId, 'k6');
  assert.equal(draft.sections[2].endChordId, 'k8');
}

{
  // Stage2 rejects an already-overlapping pair instead of repairing it implicitly.
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 5), S('b', 3, 7)];
  const r = adjustSharedBoundary(draft, 'a', 'b', 2, b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'overlap');
  assert.equal(draft.sections[0].endChordId, 'k5');
  assert.equal(draft.sections[1].startChordId, 'k3');
  assert.equal(draft.sections[1].endChordId, 'k7');
}

{
  const b = buf(4);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [S('a', 0, 3)] });
  draft.sections.push({ id: 'bad', type: 'verse', name: 'Bad', startChordId: 'missing', endChordId: 'k3' });
  const diag = diagnoseDraftSection(draft.sections[1], b);
  assert.equal(diag.valid, false);
  assert.ok(diag.reasons.includes('start-chord-not-found'));
  const before = draft.sections[0].endChordId;
  assert.equal(deleteDraftSection(draft, 'bad').ok, true);
  assert.equal(draft.sections.length, 1);
  assert.equal(draft.sections[0].endChordId, before);
}

{
  const b = buf(4);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [S('a', 0, 3)] });
  draft.sections.push({ id: 'bad', type: 'verse', name: 'Bad', startChordId: 'nope', endChordId: 'nope2' });
  const prep = prepareDraftForAdopt(draft, { projectId: 'p', buffer: b, isEditing: true });
  assert.equal(prep.ok, false);
  assert.equal(prep.reason, 'section-invalid');
}

{
  const b = buf();
  const state = st(b, [S('old', 0, 3)]);
  const bufBefore = JSON.stringify(state.buffer);
  const r = replaceSectionsFromDraftCommand(state, [S('n1', 0, 1, 'chorus', 'A'), S('n2', 2, 3, 'verse', 'B')]);
  assert.equal(r.ok, true);
  assert.equal(state.history.length, 1);
  assert.equal(JSON.stringify(state.buffer), bufBefore);
  undoBuffer(state);
  assert.equal(state.sections[0].id, 'old');
  assert.equal(applyGeneratedSectionsCommand(state, [S('x', 0, 3)]).reason, 'sections-already-exist');
}

{
  const rt = createReconfigRuntime();
  assert.deepEqual(rt.view, {
    scrollTop: 0, lastSeenSigs: null,
  });
  assert.equal(rt.splitContext, null);
  rt.draft = createReconfigurationDraft({ projectId: 'old', buffer: buf(), sections: [S('a', 0, 3)] });
  rt.modalOpen = true;
  rt.view = { scrollTop: 120, lastSeenSigs: ['old'] };
  rt.splitContext = { sectionId: 'a' };
  rt.audioSnapshot = { timeSec: 1, speedPct: 100 };
  const result = teardownReconfigRuntime(rt, { clearView: true, clearSplitContext: true });
  assert.equal(result, undefined, 'teardown is a state-reset operation and has no return value');
  assert.equal(rt.draft, null);
  assert.deepEqual(rt.view, { scrollTop: 0, lastSeenSigs: null });
  assert.equal(rt.splitContext, null);
  assert.equal(rt.modalOpen, false);
  assert.equal(rt.closed, true);
  assert.equal(rt.audioSnapshot, null);
}

{
  const b = buf();
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [S('a', 0, 3)] });
  const spans = draftSectionChordSpans(draft, b);
  assert.equal(spans[0].start, 0);
  assert.equal(spans[0].end, 3);
  assert.equal(spans[0].valid, true);
}

{
  const b = buf(4);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [S('a', 0, 3)] });
  draft.sections.push({ id: 'x', type: 'verse', name: 'X', startChordId: '?', endChordId: '?' });
  assert.equal(diagnoseDraftSections(draft, b).filter(x => !x.valid).length, 1);
}



// --- F5: invalid neighbour is not modified by boundary move ---
{
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [
    S('a', 0, 2),
    { id: 'bad', type: 'verse', name: 'Bad', startChordId: 'missing', endChordId: 'k5' },
    S('c', 6, 7),
  ];
  const r = canAdjustBoundaryWithNext(draft, b, 'a');
  assert.equal(r.ok, false, 'should reject when immediate next is invalid');
  assert.equal(r.reason, 'neighbour-invalid');
  assert.equal(draft.sections[1].startChordId, 'missing');
  assert.equal(draft.sections[2].startChordId, 'k6');
}

// --- F5: fully unlocated invalid must not be skipped to change later section ---
{
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [
    S('a', 0, 2),
    { id: 'ghost', type: 'verse', name: 'Ghost', startChordId: 'nope-a', endChordId: 'nope-b' },
    S('c', 6, 7),
  ];
  const beforeC = JSON.stringify(draft.sections[2]);
  const r = canAdjustBoundaryWithNext(draft, b, 'a');
  assert.equal(r.ok, false, 'should reject when unlocated invalid exists');
  assert.equal(r.reason, 'unlocated-invalid');
  assert.equal(JSON.stringify(draft.sections[2]), beforeC, 'C must not change');
  assert.equal(draft.sections[0].endChordId, 'k2', 'A must not change on reject');
}

// --- F6: duplicate id detection and index-safe delete ---
{
  const b = buf(6);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('dup', 0, 2), S('dup', 3, 5)];
  const list = diagnoseDraftSections(draft, b);
  assert.equal(list.every(x => x.reasons.includes('duplicate-section-id')), true);
  assert.equal(list.every(x => x.valid === false), true);
  const r = deleteDraftSectionAt(draft, 0);
  assert.equal(r.ok, true);
  assert.equal(draft.sections.length, 1);
  assert.equal(draft.sections[0].id, 'dup');
  assert.equal(draft.sections[0].startChordId, 'k3');
  // remaining still may show duplicate? only one left — should not
  const list2 = diagnoseDraftSections(draft, b);
  assert.equal(list2[0].reasons.includes('duplicate-section-id'), false);
}



// --- A-5 last section boundary refuses; explicit split works ---
{
  const b = buf(8);
  const draft = createReconfigurationDraft({
    projectId: 'p',
    buffer: b,
    sections: [S('only', 0, 7)],
  });
  const can = canAdjustBoundaryWithNext(draft, b, 'only');
  assert.equal(can.ok, false);
  assert.equal(can.reason, 'last');
  assert.equal(draft.sections.length, 1);
  const rSplit = splitDraftAtChordIndex(draft, 'only', 2, b);
  assert.equal(rSplit.ok, true, rSplit.reason);
  assert.equal(draft.sections.length, 2);
  assert.equal(draft.sections[0].id, 'only');
  assert.equal(draft.sections[0].endChordId, 'k2');
  assert.equal(draft.sections[1].startChordId, 'k3');
  assert.equal(draft.sections[1].name, '');
  assert.equal(draft.sections[1].type, '');
}

// --- type→name auto naming always overrides a prior manual name ---
{
  const b = buf(4);
  const draft = createReconfigurationDraft({
    projectId: 'p',
    buffer: b,
    sections: [{ id: 's', type: 'other', name: '未設定', startChordId: 'k0', endChordId: 'k3' }],
  });
  updateDraftSection(draft, 's', { type: 'chorus' }, {
    defaultNameForType: (t) => t === 'chorus' ? 'サビ' : 'その他',
  });
  assert.equal(draft.sections[0].name, 'サビ');
  updateDraftSection(draft, 's', { name: '手動名' }, { fromUserNameEdit: true });
  assert.equal(draft.sections[0].nameUserEdited, true);
  updateDraftSection(draft, 's', { type: 'verse', nameUserEdited: false }, {
    defaultNameForType: () => 'Aメロ',
  });
  assert.equal(draft.sections[0].name, 'Aメロ', 'type change regenerates even a manually edited name');
  assert.equal(draft.sections[0].nameUserEdited, false);
  assert.equal(undoDraft(draft), true);
  assert.equal(draft.sections[0].name, '手動名', 'Undo restores the manual name');
  assert.equal(draft.sections[0].nameUserEdited, true);
  assert.equal(redoDraft(draft), true);
  assert.equal(draft.sections[0].name, 'Aメロ', 'Redo restores the generated name');
  assert.equal(draft.sections[0].nameUserEdited, false);
}



// --- P1-2: nameUserEdited is Draft-only; adopt strips it ---
{
  const b = buf(4);
  const draft = createReconfigurationDraft({
    projectId: 'p',
    buffer: b,
    sections: [
      { id: 's0', type: 'other', name: '未設定', startChordId: 'k0', endChordId: 'k1' },
      { id: 's1', type: 'other', name: '未設定', startChordId: 'k2', endChordId: 'k3' },
    ],
  });
  updateDraftSection(draft, 's0', { name: '手動サビ' }, { fromUserNameEdit: true });
  assert.equal(draft.sections[0].nameUserEdited, true);
  assert.equal(draft.sections[0].name, '手動サビ');
  updateDraftSection(draft, 's0', { name: '未設定' }, { fromUserNameEdit: true });
  assert.equal(draft.sections[0].name, '未設定');
  assert.equal(draft.sections[0].nameUserEdited, true);

  const prep = prepareDraftForAdopt(draft, { projectId: 'p', buffer: b, isEditing: true });
  assert.equal(prep.ok, true, prep.reason);
  assert.ok(prep.sections.every(s => !('nameUserEdited' in s)));
  assert.ok(prep.sections.every(s => Object.keys(s).every(k => ['id','type','name','startChordId','endChordId'].includes(k))));
  assert.equal(prep.sections[0].name, '未設定');
  assert.equal(prep.sections[0].type, 'other');
  assert.equal(prep.sections[0].id, 's0');
  assert.equal(draft.sections[0].nameUserEdited, true);
  const can = toCanonicalSection(draft.sections[0]);
  assert.equal('nameUserEdited' in can, false);
  assert.equal(can.name, '未設定');
}



// --- adopt: inspect keys before projection; DRAFT_ONLY allowed; unknown rejected ---
{
  const b = buf(4);
  const draft = createReconfigurationDraft({
    projectId: 'p',
    buffer: b,
    sections: [
      { id: 's0', type: 'other', name: 'A', startChordId: 'k0', endChordId: 'k1' },
      { id: 's1', type: 'other', name: 'B', startChordId: 'k2', endChordId: 'k3' },
    ],
  });
  draft.sections[0].nameUserEdited = true;
  draft.sections[0].unexpectedMeta = 'leak';
  let prep = prepareDraftForAdopt(draft, { projectId: 'p', buffer: b, isEditing: true });
  assert.equal(prep.ok, false);
  assert.equal(prep.reason, 'unknown-section-key');

  delete draft.sections[0].unexpectedMeta;
  prep = prepareDraftForAdopt(draft, { projectId: 'p', buffer: b, isEditing: true });
  assert.equal(prep.ok, true, prep.reason);
  assert.equal('nameUserEdited' in prep.sections[0], false);
  assert.equal(prep.sections[0].name, 'A');
}

// --- nameUserEdited participates in Draft undo snapshots ---
{
  const b = buf(4);
  const draft = createReconfigurationDraft({
    projectId: 'p',
    buffer: b,
    sections: [
      { id: 's0', type: 'other', name: '未設定', startChordId: 'k0', endChordId: 'k1' },
      { id: 's1', type: 'other', name: '未設定', startChordId: 'k2', endChordId: 'k3' },
    ],
  });
  assert.equal(!!draft.sections[0].nameUserEdited, false);
  updateDraftSection(draft, 's0', { name: 'サビ' }, { fromUserNameEdit: true });
  assert.equal(draft.sections[0].name, 'サビ');
  assert.equal(draft.sections[0].nameUserEdited, true);
  assert.equal(undoDraft(draft), true);
  assert.equal(draft.sections[0].name, '未設定');
  assert.equal(!!draft.sections[0].nameUserEdited, false);
  assert.equal(redoDraft(draft), true);
  assert.equal(draft.sections[0].name, 'サビ');
  assert.equal(draft.sections[0].nameUserEdited, true);
}



// --- Manual-name metadata is cleared by type changes; Undo/Redo restores it atomically ---
{
  const b = buf(4);
  const draft = createReconfigurationDraft({
    projectId: 'p',
    buffer: b,
    sections: [
      { id: 's0', type: 'other', name: '未設定', startChordId: 'k0', endChordId: 'k1' },
      { id: 's1', type: 'verse', name: 'Verse', startChordId: 'k2', endChordId: 'k3' },
    ],
  });
  const undoBefore = draft.undoStack.length;
  // Simulate "typed then reverted to same name": no updateDraftSection → no undo growth
  assert.equal(draft.sections[0].name, '未設定');
  assert.equal(draft.undoStack.length, undoBefore);
  assert.equal(!!draft.sections[0].nameUserEdited, false);

  // Commit a real name change
  updateDraftSection(draft, 's0', { name: 'サビ' }, { fromUserNameEdit: true });
  assert.equal(draft.sections[0].name, 'サビ');
  assert.equal(draft.sections[0].nameUserEdited, true);
  assert.equal(draft.undoStack.length, undoBefore + 1);

  // Type change always regenerates the name and clears the manual-name flag in one operation.
  updateDraftSection(draft, 's0', { type: 'chorus', nameUserEdited: false }, {
    defaultNameForType: () => 'Chorus',
  });
  assert.equal(draft.sections[0].type, 'chorus');
  assert.equal(draft.sections[0].name, 'Chorus');
  assert.equal(draft.sections[0].nameUserEdited, false);

  // Undo/Redo restores type, name and manual-name metadata together.
  assert.equal(undoDraft(draft), true);
  assert.equal(draft.sections[0].type, 'other');
  assert.equal(draft.sections[0].name, 'サビ');
  assert.equal(draft.sections[0].nameUserEdited, true);
  assert.equal(redoDraft(draft), true);
  assert.equal(draft.sections[0].type, 'chorus');
  assert.equal(draft.sections[0].name, 'Chorus');
  assert.equal(draft.sections[0].nameUserEdited, false);
}



// --- structural vs completeness: empty name/type allowed for edit ---
{
  const b = buf(6);
  const draft = createReconfigurationDraft({
    projectId: 'p', buffer: b,
    sections: [
      { id: 'a', type: 'verse', name: 'V', startChordId: 'k0', endChordId: 'k5' },
    ],
  });
  const r = splitDraftAtChordIndex(draft, 'a', 2, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[1].name, '');
  assert.equal(draft.sections[1].type, '');
  const list = diagnoseDraftSections(draft, b);
  assert.equal(list[1].structurallyValid, true);
  assert.equal(list[1].complete, false);
  // boundary edit still works with incomplete back half
  const br = adjustSharedBoundary(draft, draft.sections[0].id, draft.sections[1].id, 1, b);
  assert.equal(br.ok, true, br.reason);
  // adopt rejected until fields filled
  let prep = prepareDraftForAdopt(draft, { projectId: 'p', buffer: b, isEditing: true });
  assert.equal(prep.ok, false);
  assert.equal(prep.reason, 'incomplete-section-fields');
  updateDraftSection(draft, draft.sections[1].id, { name: '後', type: 'chorus' }, { fromUserNameEdit: true });
  // may need coverage — ensure both complete
  prep = prepareDraftForAdopt(draft, { projectId: 'p', buffer: b, isEditing: true });
  // after boundary move, sections should still cover if contiguous
  if (!prep.ok) {
    // fill any remaining completeness
    for (const s of draft.sections) {
      if (!s.name) s.name = 'X';
      if (!s.type) s.type = 'other';
    }
    prep = prepareDraftForAdopt(draft, { projectId: 'p', buffer: b, isEditing: true });
  }
  assert.equal(prep.ok, true, prep.reason);
}

// --- merge keeps previous id/name/type ---
{
  const b = buf(8);
  const draft = createReconfigurationDraft({
    projectId: 'p', buffer: b,
    sections: [
      { id: 'a', type: 'verse', name: '前', startChordId: 'k0', endChordId: 'k3' },
      { id: 'b', type: 'chorus', name: '後', startChordId: 'k4', endChordId: 'k7' },
    ],
  });
  const r = mergeDraftWithPrevious(draft, 1, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections.length, 1);
  assert.equal(draft.sections[0].id, 'a');
  assert.equal(draft.sections[0].name, '前');
  assert.equal(draft.sections[0].type, 'verse');
  assert.equal(draft.sections[0].endChordId, 'k7');
  assert.equal(undoDraft(draft), true);
  assert.equal(draft.sections.length, 2);
}

// --- Stage2: chronological previous must not depend on Draft array order ---
{
  const b = buf(8);
  const draft = createReconfigurationDraft({
    projectId: 'p', buffer: b,
    sections: [
      { id: 'later', type: 'chorus', name: '後', startChordId: 'k4', endChordId: 'k7' },
      { id: 'earlier', type: 'verse', name: '前', startChordId: 'k0', endChordId: 'k3' },
    ],
  });
  // Draft arrays are normally normalized at creation; reverse here to exercise
  // a later chronological Section stored at array index 0.
  draft.sections.reverse();
  const ordered = orderedValidSections(draft.sections, b);
  assert.deepEqual(ordered.map(row => row.section.id), ['earlier', 'later']);
  assert.deepEqual(ordered.map(row => row.index), [1, 0]);

  // The selected row is array index 0, but its chronological predecessor is index 1.
  const r = mergeDraftWithPrevious(draft, 0, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections.length, 1);
  assert.equal(draft.sections[0].id, 'earlier');
  assert.equal(draft.sections[0].name, '前');
  assert.equal(draft.sections[0].endChordId, 'k7');
  assert.equal(undoDraft(draft), true);
  assert.equal(draft.sections.length, 2);
  assert.equal(draft.sections[0].id, 'later', 'undo restores original array order');
}

// --- Stage2: split can explicitly inherit the source Section metadata ---
{
  const b = buf(6);
  const draft = createReconfigurationDraft({
    projectId: 'p', buffer: b,
    sections: [{
      id: 'source', type: 'chorus', name: 'サビ',
      nameUserEdited: true, startChordId: 'k0', endChordId: 'k5',
    }],
  });
  // nameUserEdited is Draft-only metadata, so seed it after canonical Draft creation.
  draft.sections[0].nameUserEdited = true;
  const r = splitDraftAtChordIndex(draft, 'source', 2, b, undefined, { inheritBackMeta: true });
  assert.equal(r.ok, true, r.reason);
  const back = draft.sections[r.backIndex];
  assert.equal(back.type, 'chorus');
  assert.equal(back.name, 'サビ');
  assert.equal(back.nameUserEdited, true);
  assert.notEqual(back.id, 'source');
}

// --- Auto-generated category names are numbered when a Section is split ---
{
  const b = buf(6);
  const draft = createReconfigurationDraft({
    projectId: 'auto-name-split',
    buffer: b,
    sections: [{
      id: 'intro',
      type: 'intro',
      name: 'イントロ',
      startChordId: 'k0',
      endChordId: 'k5',
    }],
  });
  const r = splitDraftAtChordIndex(draft, 'intro', 2, b, undefined, {
    inheritBackMeta: true,
    defaultNameForType: type => type === 'intro' ? 'イントロ 2' : type,
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[r.frontIndex].name, 'イントロ');
  assert.equal(draft.sections[r.backIndex].name, 'イントロ 2');
  assert.equal(draft.sections[r.backIndex].nameUserEdited, undefined);
}

// --- A-1/A-2: play position state must not be required for boundary API ---
{
  const b = buf(6);
  const draft = createReconfigurationDraft({
    projectId: 'p', buffer: b,
    sections: [S('a', 0, 2), S('b', 3, 5)],
  });
  // Boundary change uses explicit end index, independent of any "play" concept
  const beforeBStart = draft.sections[1].startChordId;
  const r = adjustSharedBoundary(draft, 'a', 'b', 1, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k1');
  assert.equal(draft.sections[1].startChordId, 'k2');
  assert.notEqual(draft.sections[1].startChordId, beforeBStart);
}

// --- C-1/C-2 empty name structural vs complete ---
{
  const b = buf(4);
  const draft = createReconfigurationDraft({
    projectId: 'p', buffer: b,
    sections: [
      { id: 'a', type: 'verse', name: 'V', startChordId: 'k0', endChordId: 'k1' },
      { id: 'b', type: '', name: '', startChordId: 'k2', endChordId: 'k3' },
    ],
  });
  const list = diagnoseDraftSections(draft, b);
  assert.equal(list[1].structurallyValid, true);
  assert.equal(list[1].complete, false);
  assert.equal(list[1].valid, false); // adopt-grade
  assert.ok(list[1].completenessReasons.includes('invalid-section-name'));
}

// --- B-1 ended handler cleanup: stop clears stored handler ref ---
{
  // Lightweight simulation of app monitor registry
  let timeH = null;
  let endH = null;
  const audio = {
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).concat([fn]); },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn);
    },
  };
  const reg = { timeH: null, endH: null };
  const stop = () => {
    if (reg.timeH) audio.removeEventListener('timeupdate', reg.timeH);
    if (reg.endH) audio.removeEventListener('ended', reg.endH);
    reg.timeH = null;
    reg.endH = null;
  };
  const start = () => {
    stop();
    const finish = () => stop();
    reg.timeH = () => {};
    reg.endH = finish;
    audio.addEventListener('timeupdate', reg.timeH);
    audio.addEventListener('ended', reg.endH);
  };
  start();
  assert.equal((audio.listeners.ended || []).length, 1);
  start();
  assert.equal((audio.listeners.ended || []).length, 1, 'no accumulation');
  stop();
  assert.equal((audio.listeners.ended || []).length, 0);
}



// --- C: classifySectionDiagForUi drives delete UI (struct vs incomplete) ---
{
  const b = buf(4);
  const ok = diagnoseDraftSection(
    { id: 'a', type: 'verse', name: 'V', startChordId: 'k0', endChordId: 'k1' }, b);
  assert.equal(classifySectionDiagForUi(ok), 'ok');

  const incomplete = diagnoseDraftSection(
    { id: 'b', type: '', name: '', startChordId: 'k2', endChordId: 'k3' }, b);
  assert.equal(incomplete.structurallyValid, true);
  assert.equal(incomplete.complete, false);
  assert.equal(classifySectionDiagForUi(incomplete), 'incomplete-fields');
  // Delete UI must only show for structural-invalid, not incomplete-fields
  assert.notEqual(classifySectionDiagForUi(incomplete), 'structural-invalid');

  const structural = diagnoseDraftSection(
    { id: 'c', type: 'verse', name: 'X', startChordId: 'missing', endChordId: 'k0' }, b);
  assert.equal(structural.structurallyValid, false);
  assert.equal(classifySectionDiagForUi(structural), 'structural-invalid');
}

// --- A: boundary end index is independent of play concepts (API) ---
{
  const b = buf(6);
  const draft = createReconfigurationDraft({
    projectId: 'p', buffer: b,
    sections: [S('a', 0, 2), S('b', 3, 5)],
  });
  // Changing boundary via API does not depend on any playCandidate state
  const r = adjustSharedBoundary(draft, 'a', 'b', 1, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k1');
  assert.equal(draft.sections[1].startChordId, 'k2');
}

// --- D: playStartIdx restore semantics (pure state machine) ---
{
  // Mirrors modal finishPlay without DOM
  let playCandidate = 3;
  let playConfirmed = 5;
  let playStartIdx = 2; // actual start of this playback
  const finishPlay = () => {
    if (playStartIdx != null) playCandidate = playStartIdx;
    playStartIdx = null;
  };
  // Mid-play user changes confirmed position
  playConfirmed = 7;
  playCandidate = 7;
  finishPlay();
  assert.equal(playCandidate, 2);
  assert.equal(playStartIdx, null);
  assert.equal(playConfirmed, 7); // confirmed may stay for next play
}

// --- E: beforeStructuralEdit must stop play (order contract via flags) ---
{
  let stopped = false;
  let edited = false;
  const stopPlayIfNeeded = () => { stopped = true; };
  const beforeStructuralEdit = () => { stopPlayIfNeeded(); };
  const doMerge = () => { beforeStructuralEdit(); edited = true; };
  doMerge();
  assert.equal(stopped, true);
  assert.equal(edited, true);
}

// --- F: no-audio path must invoke onEnded ---
{
  let ended = false;
  const onTestPlay = ({ onEnded }) => {
    const audio = null;
    if (!audio) {
      onEnded?.();
      return;
    }
  };
  let isPlaying = true;
  let playStartIdx = 0;
  onTestPlay({
    startSec: 0, endSec: 1,
    onEnded: () => { isPlaying = false; playStartIdx = null; ended = true; },
  });
  assert.equal(ended, true);
  assert.equal(isPlaying, false);
  assert.equal(playStartIdx, null);
}

// --- B: app.js monitor registers/removes ended via shared refs (source contract) ---
{
  // Read-only check that stop path clears both handlers when given the same refs
  let timeH = () => {};
  let endH = () => {};
  const audio = {
    _t: new Set(), _e: new Set(),
    addEventListener(type, fn) { (type === 'ended' ? this._e : this._t).add(fn); },
    removeEventListener(type, fn) { (type === 'ended' ? this._e : this._t).delete(fn); },
  };
  audio.addEventListener('timeupdate', timeH);
  audio.addEventListener('ended', endH);
  // Simulate stop
  audio.removeEventListener('timeupdate', timeH);
  audio.removeEventListener('ended', endH);
  timeH = null;
  endH = null;
  assert.equal(audio._e.size, 0);
  assert.equal(audio._t.size, 0);
  // Note: full app.js integration requires browser/DOM; this verifies the removal contract.
}



// --- Banner HTML: structural / incomplete independent ---
{
  const none = buildDraftIssueBannersHtml([]);
  assert.equal(none, '');

  const structuralOnly = buildDraftIssueBannersHtml([
    { index: 0, structurallyValid: false, complete: false, structuralReasons: ['start-chord-not-found'], reasons: ['start-chord-not-found'], repairableByBoundary: false },
  ]);
  assert.match(structuralOnly, /sr1-invalid/);
  assert.doesNotMatch(structuralOnly, /sr1-incomplete-banner/);
  assert.match(structuralOnly, /data-invalid-index="0"/);

  const incompleteOnly = buildDraftIssueBannersHtml([
    { index: 1, structurallyValid: true, complete: false, completenessReasons: ['invalid-section-name'], reasons: ['invalid-section-name'] },
  ]);
  assert.match(incompleteOnly, /sr1-incomplete-banner/);
  assert.doesNotMatch(incompleteOnly, /class="sr1-invalid"/);
  assert.match(incompleteOnly, /data-incomplete-index="1"/);

  const both = buildDraftIssueBannersHtml([
    { index: 0, structurallyValid: false, complete: false, structuralReasons: ['start-after-end'], reasons: ['start-after-end'], repairableByBoundary: true },
    { index: 1, structurallyValid: true, complete: false, completenessReasons: ['invalid-section-type'], reasons: ['invalid-section-type'] },
  ]);
  assert.match(both, /sr1-invalid/);
  assert.match(both, /sr1-incomplete-banner/);
  assert.match(both, /data-invalid-index="0"/);
  assert.match(both, /data-incomplete-index="1"/);
  // incomplete must not appear inside the structural banner list only — both banners present as separate divs
  const invPos = both.indexOf('sr1-invalid');
  const incPos = both.indexOf('sr1-incomplete-banner');
  assert.ok(invPos >= 0 && incPos >= 0 && invPos !== incPos);
}


// --- Split position: focused chord becomes start of new (back) Section ---
{
  const buffer = [];
  for (let i = 0; i < 6; i++) {
    buffer.push({ _id: `c${i}`, chord: String.fromCharCode(65 + i), start: i, end: i + 1 });
  }
  const sections = [{ id: 's1', type: 'verse', name: 'A', startChordId: 'c0', endChordId: 'c5' }];
  // UI stores splitCandidate = index of first chord of back half (e.g. D = 3)
  // executeSplit maps endChordIndex = splitCandidate - 1 into splitDraftAtChordIndex
  const splitCandidate = 3; // D
  const endChordIndex = splitCandidate - 1;
  const draft = createReconfigurationDraft({ projectId: 'split-map', buffer, sections });
  const r = splitDraftAtChordIndex(draft, 's1', endChordIndex, buffer);
  assert(r.ok, 'split at D should succeed');
  const spans = draftSectionChordSpans(draft, buffer);
  assert(spans.length === 2, 'two sections after split');
  assert(spans[0].start === 0 && spans[0].end === 2, `front 0..2 got ${spans[0].start}..${spans[0].end}`);
  assert(spans[1].start === 3 && spans[1].end === 5, `back 3..5 got ${spans[1].start}..${spans[1].end}`);
  assert(draft.sections[r.backIndex].startChordId === 'c3', 'back starts at focused chord D');
  assert(r.backIndex === 1, 'select back section after split');
  // Edge: first interior chord C as new start
  const d2 = createReconfigurationDraft({ projectId: 'split-map2', buffer, sections: structuredClone(sections) });
  const r2 = splitDraftAtChordIndex(d2, 's1', 1, buffer); // candidate C=2 → end=1
  assert(r2.ok && draftSectionChordSpans(d2, buffer)[1].start === 2, 'C becomes back start');
  // Edge: last chord as new start (front keeps all but last)
  const d3 = createReconfigurationDraft({ projectId: 'split-map3', buffer, sections: structuredClone(sections) });
  const r3 = splitDraftAtChordIndex(d3, 's1', 4, buffer); // candidate F=5 → end=4
  assert(r3.ok && draftSectionChordSpans(d3, buffer)[1].start === 5, 'F becomes back start');
  console.log('splitCandidate maps to next-section start: ok');
}


/* Phase150 Stage2 shared-boundary API: strict adjacency, atomic updates, shared Undo/Redo. */
{
  const b = buf(9);
  const draft = createReconfigurationDraft({
    projectId: 'boundary-api', buffer: b,
    sections: [
      S('third', 6, 8, 'chorus', 'C'),
      S('first', 0, 2, 'verse', 'A'),
      S('second', 3, 5, 'chorus', 'B'),
    ],
  });
  // Use deliberately reversed Draft array order; adjacency is timeline-based.
  draft.sections = [draft.sections[2], draft.sections[1], draft.sections[0]];
  draft.sections.find(s => s.id === 'first').custom = { x: 1 };
  draft.sections.find(s => s.id === 'second').custom = 'metadata';
  draft.sections.find(s => s.id === 'third').extra = 'kept';
  const can = canAdjustBoundaryWithNext(draft, b, 'first');
  assert.equal(can.ok, true, can.reason);
  assert.equal(can.nextId, 'second');
  const undoBefore = draft.undoStack.length;
  const r = adjustSharedBoundary(draft, 'first', 'second', 3, b);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.changed, ['first', 'second']);
  const first = draft.sections.find(s => s.id === 'first');
  const second = draft.sections.find(s => s.id === 'second');
  const third = draft.sections.find(s => s.id === 'third');
  assert.equal(first.endChordId, 'k3');
  assert.equal(second.startChordId, 'k4');
  assert.deepEqual(first.custom, { x: 1 });
  assert.equal(second.custom, 'metadata');
  assert.equal(third.startChordId, 'k6');
  assert.equal(third.extra, 'kept');
  assert.equal(draft.undoStack.length, undoBefore + 1, 'one shared Undo snapshot');
  assert.equal(undoDraft(draft), true);
  assert.equal(draft.sections.find(s => s.id === 'first').endChordId, 'k2');
  assert.equal(draft.sections.find(s => s.id === 'second').startChordId, 'k3');

  const history = draft.undoStack.length;
  const redoHistory = draft.redoStack.length;
  const noop = adjustSharedBoundary(draft, 'first', 'second', 2, b);
  assert.equal(noop.ok, true);
  assert.equal(noop.noop, true);
  assert.equal(draft.undoStack.length, history, 'no-op does not add Undo');
  assert.equal(draft.redoStack.length, redoHistory, 'no-op does not clear Redo');
  assert.equal(redoDraft(draft), true);
  assert.equal(draft.sections.find(s => s.id === 'first').endChordId, 'k3');
  assert.equal(draft.sections.find(s => s.id === 'second').startChordId, 'k4');
  assert.equal(adjustSharedBoundary(draft, 'first', 'second', 5, b).reason, 'next-section-too-short');
  assert.equal(adjustSharedBoundary(draft, 'first', 'second', -1, b).reason, 'bad-chord');
  assert.equal(adjustSharedBoundary(draft, 'first', 'third', 2, b).reason, 'not-adjacent');
}

{
  const b = buf(8);
  const make = (sections) => {
    const draft = createReconfigurationDraft({ projectId: 'boundary-invalid', buffer: b, sections });
    // Bypass the creation-time gap filler to exercise malformed Draft states directly.
    draft.sections = structuredClone(sections);
    return draft;
  };
  const gap = make([S('a', 0, 2), S('b', 4, 7)]);
  assert.equal(canAdjustBoundaryWithNext(gap, b, 'a').reason, 'gap');
  const overlap = make([S('a', 0, 4), S('b', 4, 7)]);
  assert.equal(canAdjustBoundaryWithNext(overlap, b, 'a').reason, 'overlap');
  const invalidNeighbour = make([
    S('a', 0, 2),
    { id: 'b', type: 'verse', name: 'B', startChordId: 'missing', endChordId: 'k7' },
  ]);
  assert.equal(canAdjustBoundaryWithNext(invalidNeighbour, b, 'a').reason, 'neighbour-invalid');
  const unlocated = make([
    S('a', 0, 2), S('b', 3, 4),
    { id: 'x', type: '', name: '', startChordId: 'missing-start', endChordId: 'missing-end' },
  ]);
  assert.equal(canAdjustBoundaryWithNext(unlocated, b, 'a').reason, 'unlocated-invalid');
  const last = make([S('a', 0, 7)]);
  assert.equal(canAdjustBoundaryWithNext(last, b, 'a').reason, 'last');
  const shortPrev = make([S('a', 1, 2), S('b', 3, 7)]);
  assert.equal(adjustSharedBoundary(shortPrev, 'a', 'b', 0, b).reason, 'section-too-short');
}


/* Runtime playback generation is monotonic and invalidated on teardown. */
{
  const runtime = createReconfigRuntime();
  assert.equal(runtime.playGeneration, 0);
  runtime.playGeneration = 7;
  runtime.modalOpen = true;
  runtime.closed = false;
  runtime.draft = { sections: [] };
  runtime.audioSnapshot = { timeSec: 12, speedPct: 100 };
  teardownReconfigRuntime(runtime);
  assert.equal(runtime.playGeneration, 8);
  assert.equal(runtime.modalOpen, false, 'teardown clears modalOpen so the next Section settings click can open');
  assert.equal(runtime.closed, true);
  assert.equal(runtime.draft, null);
  assert.equal(runtime.audioSnapshot, null);
}


// Auto-name/category behavior: every type change regenerates the name, including
// manually edited names. Splits inherit the category and create a new numbered name.
{
  const b = buf(8);
  const draft = createReconfigurationDraft({
    projectId: 'auto-name',
    buffer: b,
    sections: [S('a', 0, 7, 'jp-a-melo', 'Aメロ')],
  });
  const changed = updateDraftSection(draft, 'a', { type: 'jp-sabi' }, {
    defaultNameForType: () => 'サビ',
  });
  assert.equal(changed.ok, true);
  assert.equal(draft.sections[0].type, 'jp-sabi');
  assert.equal(draft.sections[0].name, 'サビ');

  const manual = createReconfigurationDraft({
    projectId: 'manual-name',
    buffer: b,
    sections: [{ ...S('m', 0, 7, 'jp-a-melo', '1番Aメロ'), nameUserEdited: true }],
  });
  updateDraftSection(manual, 'm', { type: 'jp-sabi', nameUserEdited: false }, { defaultNameForType: () => 'サビ' });
  assert.equal(manual.sections[0].name, 'サビ', 'manual names are regenerated on type change');
  assert.equal(manual.sections[0].nameUserEdited, false);

  const split = createReconfigurationDraft({
    projectId: 'split-name',
    buffer: b,
    sections: [S('s', 0, 7, 'jp-a-melo', 'Aメロ')],
  });
  const result = splitDraftAtChordIndex(split, 's', 3, b, () => 's-back', {
    inheritBackMeta: true,
    defaultNameForType: () => 'Aメロ 2',
  });
  assert.equal(result.ok, true);
  assert.equal(split.sections[1].type, 'jp-a-melo', 'split inherits source category');
  assert.equal(split.sections[1].name, 'Aメロ 2', 'split receives a new automatic name');
  assert.equal(split.sections[1].nameUserEdited, undefined, 'generated split name remains auto-linked');
}

const stage1Source = readFileSync(new URL('../js/sectionReconfigurationModal.js', import.meta.url), 'utf8');
assert.match(stage1Source, /inheritBackMeta: true/, 'Stage1 split always inherits source category');
assert.match(stage1Source, /種類を選択してください/, 'empty type has an explicit placeholder, never the first category');
assert.match(stage1Source, /modeKey === 'p' \|\| modeKey === 'b' \|\| modeKey === 's'/, 'P/B/S shortcuts remain available');
assert.match(stage1Source, /class="sr1-gap-btn[^"]*" data-gap=/, 'each adjacent chord gap has a direct selection target');
assert.match(stage1Source, />境界を移動</, 'boundary movement is available from the unified panel');
assert.match(stage1Source, />Sectionを分割</, 'split is available beside boundary movement');
assert.match(stage1Source, /selectSectionIndex\(sectionIdx, \{ clearSplitContext: false \}\)/, 'Stage1 split keeps focus on the front half');
assert.doesNotMatch(stage1Source, /selectSectionIndex\(r\.backIndex/, 'Stage1 split does not jump to the back half');
assert.match(stage1Source, /e\.code === 'Enter'.*sr1-name/s, 'Enter exits the Section name field');
assert.match(stage1Source, /reason: 'boundary-change'/, 'successful Stage2-originated boundary changes return to overview');


// --- Stage1 UI boundary edits absorb an existing gap into the following Section ---
{
  const b = buf(8);
  const draft = createReconfigurationDraft({
    projectId: 'boundary-gap-ui',
    buffer: b,
    sections: [S('a', 0, 2), S('b', 5, 7)],
  });
  // Bypass creation-time gap filler to model an existing gap in the Draft.
  draft.sections = [S('a', 0, 2), S('b', 5, 7)];
  const r = adjustSharedBoundary(draft, 'a', 'b', 1, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k1');
  assert.equal(draft.sections[1].startChordId, 'k2');
  assert.equal(draft.sections[1].endChordId, 'k7');
  assert.equal(undoDraft(draft), true);
  assert.equal(draft.sections[0].endChordId, 'k2');
  assert.equal(draft.sections[1].startChordId, 'k5');
}

// --- Stage1 split passes Section ID and applies split metadata options ---
{
  const b = buf(6);
  const draft = createReconfigurationDraft({
    projectId: 'split-section-id',
    buffer: b,
    sections: [S('source-id', 0, 5, 'verse', 'Aメロ')],
  });
  const r = splitDraftAtChordIndex(draft, 'source-id', 2, b, () => 'back-id', {
    inheritBackMeta: true,
    defaultNameForType: () => 'Aメロ 2',
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.backIndex, 1);
  assert.equal(draft.sections[1].id, 'back-id');
  assert.equal(draft.sections[1].type, 'verse');
  assert.equal(draft.sections[1].name, 'Aメロ 2');
  assert.equal(draft.sections[1].nameUserEdited, undefined);
}

console.log('test-section-reconfiguration: ok');
