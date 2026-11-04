/**
 * Section auto-generation: boundary(bar) -> chord-ID mapping, draft -> Section
 * conversion, and whole-set validation. Pure functions (no DOM, no I/O, no
 * editor-session mutation); the app layer decides when to call them.
 *
 * [DATA MODEL NOTE] The Section data model itself allows gaps/overlaps
 * (docs/section-model.md). The "contiguous, non-overlapping" rule below is a
 * policy for *generated sets only*; it is enforced here, not in
 * validateSectionInvariants().
 */
import { validateSectionInvariants } from './analysisSession.js';

export const DEFAULT_GENERATED_SECTION_TYPE = 'other';
export const DEFAULT_GENERATED_SECTION_NAME = '未設定';

const hasChordName = c => !!c && typeof c.chord === 'string' && c.chord.length > 0;

/**
 * Map requested boundary bars to chord ranges.
 *
 * Rules (nothing is invented; unmappable boundaries are reported):
 *  - Section 1 always starts at buffer[0] (covers the whole song from the start).
 *  - A boundary at bar b starts at the first chord (with a name) whose bar is >= b.
 *    If that chord's bar is later than b, the boundary is "snapped" and the
 *    actual bar is reported (e.g. no chord starts in bar b).
 *  - A boundary whose chord is not after the previous Section's start is rejected
 *    ('collapses-onto-previous'); no chord at/after b -> 'no-chord-at-or-after-bar'.
 *  - Each Section ends at the chord just before the next Section's start;
 *    the last Section ends at buffer[buffer.length - 1].
 *  - N.C. ('N') is a normal chord; empty-name chords never start a Section.
 *
 * @param {number[]} bars - boundary bar indices (0-based), strictly ascending, each >= 1
 * @param {Array} buffer - chord entries in time order
 * @param {(chord:object)=>(number|null)} measureOf - chord -> bar index (null if outside the grid)
 */
export function mapBoundariesToChordRanges(bars, buffer, measureOf) {
  const problems = [];
  if (!Array.isArray(buffer) || buffer.length === 0) {
    return { ok: false, ranges: [], problems: [{ reason: 'empty-buffer' }] };
  }
  const barOf = buffer.map(c => (hasChordName(c) ? measureOf(c) : null));
  const starts = [{ index: 0, requestedBar: 0, actualBar: barOf[0], snapped: false }];

  let previousBar = 0;
  for (const bar of bars) {
    if (!Number.isInteger(bar) || bar < 1) { problems.push({ bar, reason: 'invalid-bar' }); continue; }
    if (bar <= previousBar) { problems.push({ bar, reason: 'not-ascending' }); continue; }
    previousBar = bar;
    const index = barOf.findIndex(m => Number.isInteger(m) && m >= bar);
    if (index === -1) { problems.push({ bar, reason: 'no-chord-at-or-after-bar' }); continue; }
    if (index <= starts[starts.length - 1].index) {
      problems.push({ bar, reason: 'collapses-onto-previous' });
      continue;
    }
    starts.push({ index, requestedBar: bar, actualBar: barOf[index], snapped: barOf[index] !== bar });
  }

  const ranges = starts.map((s, i) => ({
    ...s,
    startIndex: s.index,
    endIndex: i + 1 < starts.length ? starts[i + 1].index - 1 : buffer.length - 1,
  }));
  return { ok: problems.length === 0, ranges, problems };
}

/**
 * Validate a *generated* Section set against the chord buffer.
 * Each Section is checked with validateSectionInvariants(); the set must be in
 * time order, non-overlapping, gap-free, and cover buffer[0]..buffer[last].
 *
 * @returns {{valid:boolean, errors:Array<{index?:number,reason:string}>}}
 */
export function validateGeneratedSectionSet(sections, buffer) {
  const errors = [];
  if (!Array.isArray(sections) || sections.length === 0) {
    return { valid: false, errors: [{ reason: 'empty-set' }] };
  }
  if (!Array.isArray(buffer) || buffer.length === 0) {
    return { valid: false, errors: [{ reason: 'no-buffer' }] };
  }

  const ids = new Set();
  const spans = [];
  sections.forEach((section, index) => {
    if (!section || typeof section.id !== 'string' || !section.id.trim()) {
      errors.push({ index, reason: 'invalid-section-id' }); return;
    }
    if (ids.has(section.id)) errors.push({ index, reason: 'duplicate-section-id' });
    ids.add(section.id);
    for (const key of ['type', 'name']) {
      if (typeof section[key] !== 'string' || !section[key].trim()) {
        errors.push({ index, reason: `invalid-section-${key}` });
      }
    }
    const check = validateSectionInvariants(section, buffer);
    if (!check.valid) { errors.push({ index, reason: check.reason }); return; }
    spans.push({
      index,
      start: buffer.findIndex(c => c._id === section.startChordId),
      end: buffer.findIndex(c => c._id === section.endChordId),
    });
  });
  if (errors.length > 0) return { valid: false, errors };

  if (spans[0].start !== 0) errors.push({ index: 0, reason: 'first-section-not-at-start' });
  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1];
    const cur = spans[i];
    if (cur.start <= prev.start) errors.push({ index: cur.index, reason: 'not-in-time-order' });
    else if (cur.start <= prev.end) errors.push({ index: cur.index, reason: 'overlaps-previous' });
    else if (cur.start > prev.end + 1) errors.push({ index: cur.index, reason: 'gap-before' });
  }
  if (spans[spans.length - 1].end !== buffer.length - 1) {
    errors.push({ index: spans.length - 1, reason: 'last-section-not-at-end' });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Convert a user-editable draft into a Section array ready for
 * applyGeneratedSectionsCommand(). The draft is never written to song data.
 *
 * @param {Array<{candidateId:string, startBar:number, name:string, type?:string}>} draft
 *   ordered by startBar; draft[0].startBar is ignored (always the song start).
 * @param {Array} buffer
 * @param {(chord:object)=>(number|null)} measureOf
 * @param {()=>string} [newId] - ID factory (tests inject a deterministic one)
 */
export function buildSectionsFromDraft(draft, buffer, measureOf, newId = () => crypto.randomUUID()) {
  if (!Array.isArray(draft) || draft.length === 0) {
    return { ok: false, sections: [], ranges: [], errors: [{ reason: 'empty-draft' }] };
  }
  const mapped = mapBoundariesToChordRanges(draft.slice(1).map(d => d.startBar), buffer, measureOf);
  if (!mapped.ok) {
    return { ok: false, sections: [], ranges: mapped.ranges, errors: mapped.problems };
  }
  const sections = mapped.ranges.map((range, i) => ({
    id: newId(),
    type: draft[i].type ?? DEFAULT_GENERATED_SECTION_TYPE,
    name: draft[i].name,
    startChordId: buffer[range.startIndex]._id,
    endChordId: buffer[range.endIndex]._id,
  }));
  const check = validateGeneratedSectionSet(sections, buffer);
  return {
    ok: check.valid,
    sections: check.valid ? sections : [],
    ranges: mapped.ranges,
    errors: check.errors,
  };
}

/** Initial draft from detected boundary bars (names are left unset by design). */
export function createDraftFromBoundaries(bars, diagnostics = []) {
  const diagByBar = new Map(diagnostics.map(d => [d.bar, d]));
  return [0, ...bars].map((startBar, i) => ({
    candidateId: `cand-${i}`,
    startBar,
    name: DEFAULT_GENERATED_SECTION_NAME,
    type: DEFAULT_GENERATED_SECTION_TYPE,
    diagnostics: diagByBar.get(startBar) ?? null,
  }));
}
