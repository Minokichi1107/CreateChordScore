/**
 * Phase150 Stage1 — Section reconfiguration unit tests
 */
import assert from 'node:assert/strict';
import {
  validateGeneratedSectionSet,
} from '../js/sectionSetValidation.js';
import {
  RECONFIG_GAP_TYPE,
  buildDraftSectionsFromCurrent,
  createReconfigurationDraft,
  updateDraftSection,
  undoDraft,
  redoDraft,
  setDraftSectionEndByChordIndex,
  deleteDraftSection,
  deleteDraftSectionAt,
  diagnoseDraftSection,
  diagnoseDraftSections,
  isDraftDirty,
  prepareDraftForAdopt,
  toCanonicalSection,
  toCanonicalSections,
  createReconfigRuntime,
  teardownReconfigRuntime,
  draftSectionChordSpans,
} from '../js/sectionReconfiguration.js';
import { replaceSectionsFromDraftCommand, applyGeneratedSectionsCommand } from '../js/analysisCommands.js';
import { undoBuffer } from '../js/analysisSession.js';

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
  const r = setDraftSectionEndByChordIndex(draft, 0, 2, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k2');
  assert.equal(draft.sections[1].startChordId, 'k3');
  assert.equal(draft.sections[1].endChordId, 'k7');
}

{
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 7)];
  const r = setDraftSectionEndByChordIndex(draft, 0, 4, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k4');
  assert.equal(draft.sections[1].startChordId, 'k5');
  assert.equal(draft.sections[1].endChordId, 'k7');
}

{
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 5), S('c', 6, 7)];
  const r = setDraftSectionEndByChordIndex(draft, 0, 5, b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'crosses-next-section-end');
  assert.equal(draft.sections[2].startChordId, 'k6');
  assert.equal(draft.sections[2].endChordId, 'k7');
}

{
  // Interior boundary on last section → split (not refuse)
  const b = buf(6);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 5)];
  const r = setDraftSectionEndByChordIndex(draft, 1, 4, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.split, true);
  assert.equal(draft.sections.length, 3);
  assert.equal(draft.sections[1].endChordId, 'k4');
  assert.equal(draft.sections[2].startChordId, 'k5');
  assert.equal(draft.sections[2].endChordId, 'k5');
  // Extending last end beyond song end is still refused
  const r2 = setDraftSectionEndByChordIndex(draft, 2, 5, b);
  assert.equal(r2.ok, true);
  assert.equal(r2.noop, true);
}

{
  const b = buf(9);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 5), S('c', 6, 8)];
  const r = setDraftSectionEndByChordIndex(draft, 0, 1, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[0].endChordId, 'k1');
  assert.equal(draft.sections[1].startChordId, 'k2');
  assert.equal(draft.sections[1].endChordId, 'k5');
  assert.equal(draft.sections[2].startChordId, 'k6');
  assert.equal(draft.sections[2].endChordId, 'k8');
}

{
  const b = buf(8);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 5), S('b', 3, 7)];
  const r = setDraftSectionEndByChordIndex(draft, 0, 2, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.localOverlapRepair, true);
  assert.equal(draft.sections[0].endChordId, 'k2');
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
  assert.equal(prep.reason, 'invalid-section-remaining');
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
  rt.draft = createReconfigurationDraft({ projectId: 'old', buffer: buf(), sections: [S('a', 0, 3)] });
  rt.modalOpen = true;
  rt.audioSnapshot = { timeSec: 1, speedPct: 100 };
  const r = teardownReconfigRuntime(rt, { restoreAudio: false });
  assert.equal(r.adopt, false);
  assert.equal(rt.draft, null);
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
  const r = setDraftSectionEndByChordIndex(draft, 0, 1, b);
  assert.equal(r.ok, false, 'should reject when immediate next is invalid');
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
  const r = setDraftSectionEndByChordIndex(draft, 0, 1, b);
  assert.equal(r.ok, false, 'should reject when unlocated invalid exists');
  assert.equal(r.reason, 'unlocated-invalid-section');
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



// --- Split last section at interior boundary ---
{
  const b = buf(8);
  const draft = createReconfigurationDraft({
    projectId: 'p',
    buffer: b,
    sections: [S('only', 0, 7)],
  });
  const r = setDraftSectionEndByChordIndex(draft, 0, 2, b);
  assert.equal(r.ok, true, 'split last section should succeed');
  assert.equal(r.split, true);
  assert.equal(draft.sections.length, 2);
  assert.equal(draft.sections[0].id, 'only');
  assert.equal(draft.sections[0].endChordId, 'k2');
  assert.equal(draft.sections[1].startChordId, 'k3');
  assert.equal(draft.sections[1].endChordId, 'k7');
  // cannot move last end away from song end after split (section 1 is last)
  const r2 = setDraftSectionEndByChordIndex(draft, 1, 5, b);
  assert.equal(r2.ok, true);
  assert.equal(r2.split, true);
  assert.equal(draft.sections.length, 3);
}

// --- type→name auto link vs nameUserEdited ---
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
  updateDraftSection(draft, 's', { type: 'verse' }, {
    defaultNameForType: () => 'Aメロ',
  });
  assert.equal(draft.sections[0].name, '手動名', 'user name must not be overwritten');
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


console.log('test-section-reconfiguration: ok');
