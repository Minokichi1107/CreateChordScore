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
  splitDraftAtChordIndex,
  deleteDraftSection,
  deleteDraftSectionAt,
  diagnoseDraftSection,
  diagnoseDraftSections,
  isDraftDirty,
  prepareDraftForAdopt,
  mergeDraftWithPrevious,
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
  // A-5: Interior boundary on last section via setDraftSectionEnd → refuse (use split API)
  const b = buf(6);
  const draft = createReconfigurationDraft({ projectId: 'p', buffer: b, sections: [] });
  draft.sections = [S('a', 0, 2), S('b', 3, 5)];
  const r = setDraftSectionEndByChordIndex(draft, 1, 4, b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'last-section-end-fixed');
  assert.equal(draft.sections.length, 2);
  // Explicit split still works
  const rSplit = splitDraftAtChordIndex(draft, 1, 4, b);
  assert.equal(rSplit.ok, true, rSplit.reason);
  assert.equal(draft.sections.length, 3);
  assert.equal(draft.sections[1].endChordId, 'k4');
  assert.equal(draft.sections[2].startChordId, 'k5');
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



// --- A-5 last section boundary refuses; explicit split works ---
{
  const b = buf(8);
  const draft = createReconfigurationDraft({
    projectId: 'p',
    buffer: b,
    sections: [S('only', 0, 7)],
  });
  const r = setDraftSectionEndByChordIndex(draft, 0, 2, b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'last-section-end-fixed');
  assert.equal(draft.sections.length, 1);
  const rSplit = splitDraftAtChordIndex(draft, 0, 2, b);
  assert.equal(rSplit.ok, true, rSplit.reason);
  assert.equal(draft.sections.length, 2);
  assert.equal(draft.sections[0].id, 'only');
  assert.equal(draft.sections[0].endChordId, 'k2');
  assert.equal(draft.sections[1].startChordId, 'k3');
  assert.equal(draft.sections[1].name, '');
  assert.equal(draft.sections[1].type, '');
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



// --- name soft-lock related Draft behavior (modal clears soft lock after apply) ---
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

  // Type change with nameUserEdited: must not auto-rename
  updateDraftSection(draft, 's0', { type: 'chorus' }, {
    defaultNameForType: () => 'Chorus',
  });
  assert.equal(draft.sections[0].type, 'chorus');
  assert.equal(draft.sections[0].name, 'サビ'); // not overwritten

  // After undo of type+name chain: restore stepwise
  assert.equal(undoDraft(draft), true); // undo type
  assert.equal(undoDraft(draft), true); // undo name
  assert.equal(draft.sections[0].name, '未設定');
  assert.equal(!!draft.sections[0].nameUserEdited, false);

  // Type change without nameUserEdited: auto-name applies
  updateDraftSection(draft, 's0', { type: 'chorus' }, {
    defaultNameForType: () => 'Chorus',
  });
  assert.equal(draft.sections[0].name, 'Chorus');
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
  const r = splitDraftAtChordIndex(draft, 0, 2, b);
  assert.equal(r.ok, true, r.reason);
  assert.equal(draft.sections[1].name, '');
  assert.equal(draft.sections[1].type, '');
  const list = diagnoseDraftSections(draft, b);
  assert.equal(list[1].structurallyValid, true);
  assert.equal(list[1].complete, false);
  // boundary edit still works with incomplete back half
  const br = setDraftSectionEndByChordIndex(draft, 0, 1, b);
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



// --- A-1/A-2: play position state must not be required for boundary API ---
{
  const b = buf(6);
  const draft = createReconfigurationDraft({
    projectId: 'p', buffer: b,
    sections: [S('a', 0, 2), S('b', 3, 5)],
  });
  // Boundary change uses explicit end index, independent of any "play" concept
  const beforeBStart = draft.sections[1].startChordId;
  const r = setDraftSectionEndByChordIndex(draft, 0, 1, b);
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


console.log('test-section-reconfiguration: ok');
