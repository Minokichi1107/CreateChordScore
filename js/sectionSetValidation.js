import { validateSectionInvariants } from './analysisSession.js';

export function validateSectionSet(sections, buffer) {
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


/** Backward-compatible name for the former generated-only validator. */
export const validateGeneratedSectionSet = validateSectionSet;
