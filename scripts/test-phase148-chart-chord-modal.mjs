// Phase148: Chart Mode modal draft transaction regression tests.
// Run with Node.js 22: node scripts/test-phase148-chart-chord-modal.mjs
import assert from 'node:assert/strict';
import { addChordCommand, deleteChordCommand, updateChordCommand } from '../js/analysisCommands.js';
import {
  createAnalysisSession,
  undoBuffer,
  redoBuffer,
  refreshSelection,
} from '../js/analysisSession.js';
import { commitChartChordEditDraft } from '../js/chartChordEditModal.js';

const initialBuffer = [
  { _id: 'a', chord: 'C', start: 0, end: 1, confidence: 1 },
  { _id: 'b', chord: 'G', start: 1, end: 3, confidence: 1 },
  { _id: 'c', chord: 'Am', start: 3, end: 4, confidence: 1 },
];
const main = createAnalysisSession();
main.active = true;
main.buffer = structuredClone(initialBuffer);
main.sections = [];
main.hasContentEdit = false;
main.dirty = false;
refreshSelection(main, ['b'], 'b');

const originalSnapshot = structuredClone(main.buffer);
const draft = structuredClone(main);
const update = updateChordCommand(draft, 'b', { chord: 'G7' });
assert.equal(update.ok, true);
assert.deepEqual(main.buffer, originalSnapshot, 'editing the draft must not mutate the authoritative session');

const add = addChordCommand(draft, 'b', 2, 'D');
assert.equal(add.ok, true);
assert.equal(draft.buffer.length, 4);
assert.equal(draft.buffer[1].end, 2);
assert.equal(draft.buffer[2].start, 2);
assert.equal(draft.buffer[2].chord, 'D');

const draftAfterEdit = structuredClone(draft.buffer);
assert.equal(commitChartChordEditDraft(main, draft), true);
assert.equal(main.history.length, 1, 'the whole modal transaction must create exactly one Undo entry');
assert.equal(main.buffer.length, 4);
assert.equal(main.buffer[1].chord, 'G7');
assert.equal(main.buffer[2].chord, 'D');
assert.equal(main.dirty, true);
assert.equal(main.hasContentEdit, true);

assert.equal(undoBuffer(main), true);
assert.deepEqual(main.buffer, originalSnapshot, 'one Undo must restore the complete pre-modal buffer');
assert.equal(redoBuffer(main), true);
assert.deepEqual(main.buffer, draftAfterEdit, 'one Redo must restore the complete post-modal buffer');

// A final state equal to the baseline must not create a spurious Undo transaction.
const noOpMain = createAnalysisSession();
noOpMain.active = true;
noOpMain.buffer = structuredClone(initialBuffer);
noOpMain.sections = [];
noOpMain.hasContentEdit = false;
const noOpDraft = structuredClone(noOpMain);
assert.equal(updateChordCommand(noOpDraft, 'b', { chord: 'G7' }).ok, true);
assert.equal(updateChordCommand(noOpDraft, 'b', { chord: 'G' }).ok, true);
assert.equal(commitChartChordEditDraft(noOpMain, noOpDraft), false);
assert.equal(noOpMain.history.length, 0);
assert.deepEqual(noOpMain.buffer, initialBuffer);

// Existing command guard: the last remaining chord cannot be deleted.
const single = createAnalysisSession();
single.active = true;
single.buffer = [{ _id: 'only', chord: 'C', start: 0, end: 1, confidence: 1 }];
single.sections = [];
single.selection.chordIds = ['only'];
assert.equal(deleteChordCommand(single, 'only').ok, false);
assert.equal(single.buffer.length, 1);

console.log('Phase148 Chart Mode chord modal transaction tests passed.');
