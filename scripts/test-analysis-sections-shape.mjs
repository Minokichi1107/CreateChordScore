// checkRawSectionsShape(): the gate used by edit start and by the save guard.
// Missing is allowed (no Sections yet), arrays are allowed, every other existing value is invalid.
// null must NOT be treated like a missing key. The function never changes its input.
import assert from 'node:assert/strict';
import { checkRawSectionsShape } from '../js/analysisSession.js';

const withSections = value => ({ chords: [], sections: value });

assert.deepEqual(checkRawSectionsShape({ chords: [] }), { ok: true, missing: true }, 'missing key');
assert.deepEqual(checkRawSectionsShape(withSections([])), { ok: true, missing: false }, 'empty array');
assert.deepEqual(checkRawSectionsShape(withSections([{ id: 's1' }])), { ok: true, missing: false }, 'existing Sections');

for (const [label, value] of [
  ['null', null], ['object', {}], ['string', 'invalid'], ['empty string', ''], ['number 0', 0], ['number 1', 1],
  ['false', false], ['true', true], ['undefined value', undefined],
]) {
  assert.deepEqual(checkRawSectionsShape(withSections(value)), { ok: false, reason: 'sections-not-array' }, label);
}

for (const [label, raw] of [['null', null], ['undefined', undefined], ['array', []], ['string', 'x']]) {
  assert.deepEqual(checkRawSectionsShape(raw), { ok: false, reason: 'raw-invalid' }, `raw is ${label}`);
}

// read-only: nothing is added, converted or replaced
for (const raw of [{ chords: [] }, withSections(null), withSections({}), withSections([])]) {
  const before = JSON.stringify(raw);
  const keysBefore = Object.keys(raw).join();
  checkRawSectionsShape(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(Object.keys(raw).join(), keysBefore);
}
assert.equal(checkRawSectionsShape(withSections(null)).ok, false, 'null is not the same as a missing key');

console.log('Analysis sections shape tests passed.');
