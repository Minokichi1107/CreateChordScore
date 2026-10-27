import assert from 'node:assert/strict';
import {
  captureSectionGenerationBuffer,
  evaluateSectionGenerationEligibility,
  hasSectionGenerationCodeEdits,
} from '../js/sectionGeneration.js';
import { applyGeneratedSectionsCommand } from '../js/analysisCommands.js';

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
const applied = applyGeneratedSectionsCommand(state, generated);
assert.equal(applied.ok, true);
assert.equal(applied.count, 1);
assert.equal(state.sections.length, 1);
assert.equal(state.history.length, 1);
assert.equal(state.dirty, true);

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
