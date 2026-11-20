/**
 * Section reconfiguration Draft (Phase150 Stage1).
 * Independent of analysisEditor until adopt.
 */
import { validateGeneratedSectionSet } from './sectionSetValidation.js';
import { validateSectionInvariants } from './analysisSession.js';

export const RECONFIG_GAP_TYPE = 'other';
export const RECONFIG_GAP_NAME = 'その他';
const ALLOWED = new Set(['id', 'type', 'name', 'startChordId', 'endChordId']);
/** Draft/UI-only keys that must never enter canonical Section snapshots. */
const DRAFT_ONLY_KEYS = new Set(['nameUserEdited']);

function chordIndex(buffer, id) {
  return buffer.findIndex(c => c && c._id === id);
}
function cloneSections(sections) {
  return structuredClone(Array.isArray(sections) ? sections : []);
}

/**
 * Project a Draft section row onto the canonical Section shape (ALLOWED keys only).
 * Drops Draft/UI metadata such as nameUserEdited. Does not mutate the input.
 */
export function toCanonicalSection(section) {
  if (!section || typeof section !== 'object') return section;
  const out = {};
  for (const key of ALLOWED) {
    if (section[key] !== undefined) out[key] = section[key];
  }
  return out;
}

/** Map Draft sections to canonical Section objects for adopt / persistence. */
export function toCanonicalSections(sections) {
  return (Array.isArray(sections) ? sections : []).map(toCanonicalSection);
}

export function orderSectionsOnBuffer(sections, buffer) {
  const rows = (sections || []).map((section, i) => {
    const start = chordIndex(buffer, section?.startChordId);
    const end = chordIndex(buffer, section?.endChordId);
    const valid = start >= 0 && end >= 0 && start <= end;
    return { section, start, end, valid, i };
  });
  rows.sort((a, b) => {
    if (a.valid && b.valid) return a.start - b.start || a.end - b.end || a.i - b.i;
    if (a.valid) return -1;
    if (b.valid) return 1;
    return a.i - b.i;
  });
  return rows;
}

/**
 * Diagnose a single section against buffer.
 * @returns {{ valid: boolean, reasons: string[], start: number, end: number, repairableByBoundary: boolean }}
 */
/**
 * Structural issues block Draft editing (boundary/split/merge).
 * Completeness issues (empty name/type) only block adopt.
 */
const COMPLETENESS_REASONS = new Set(['invalid-section-name', 'invalid-section-type']);


/**
 * UI classification for a diagnoseDraftSections() row.
 * structural-invalid → show delete; incomplete-fields → soft notice; ok → nothing.
 */
export function classifySectionDiagForUi(diag) {
  if (!diag) return 'structural-invalid';
  if (diag.structurallyValid === false) return 'structural-invalid';
  if (diag.complete === false) return 'incomplete-fields';
  return 'ok';
}

export function diagnoseDraftSection(section, buffer) {
  const structural = [];
  const completeness = [];
  if (!section || typeof section !== 'object') {
    return {
      valid: false, structurallyValid: false, complete: false,
      reasons: ['missing-section'], structuralReasons: ['missing-section'], completenessReasons: [],
      start: -1, end: -1, repairableByBoundary: false,
    };
  }
  if (typeof section.id !== 'string' || !section.id.trim()) structural.push('invalid-section-id');
  // Name/type may be empty during Draft edit (e.g. after split); completeness only
  if (typeof section.type !== 'string' || !section.type.trim()) completeness.push('invalid-section-type');
  if (typeof section.name !== 'string' || !section.name.trim()) completeness.push('invalid-section-name');
  if (!section.startChordId) structural.push('missing-startChordId');
  if (!section.endChordId) structural.push('missing-endChordId');
  const start = chordIndex(buffer, section.startChordId);
  const end = chordIndex(buffer, section.endChordId);
  if (section.startChordId && start < 0) structural.push('start-chord-not-found');
  if (section.endChordId && end < 0) structural.push('end-chord-not-found');
  if (start >= 0 && end >= 0 && start > end) structural.push('start-after-end');
  // Invariants that are purely range-related
  if (start >= 0 && end >= 0 && start <= end) {
    const inv = validateSectionInvariants(
      { ...section, name: section.name || 'x', type: section.type || 'other' },
      buffer,
    );
    if (!inv.valid && !structural.includes(inv.reason) && inv.reason !== 'invalid-section-name' && inv.reason !== 'invalid-section-type') {
      structural.push(inv.reason);
    }
  }
  const structurallyValid = structural.length === 0 && start >= 0 && end >= 0 && start <= end;
  const complete = structurallyValid && completeness.length === 0;
  const reasons = [...structural, ...completeness];
  // valid: backward-compat = complete (adopt-grade). Editing uses structurallyValid.
  const valid = complete;
  const repairableByBoundary = start >= 0 && end >= 0;
  return {
    valid, structurallyValid, complete, reasons,
    structuralReasons: structural, completenessReasons: completeness,
    start, end, repairableByBoundary,
  };
}

export function diagnoseDraftSections(draft, buffer) {
  const sections = draft?.sections || [];
  const idCounts = new Map();
  for (const section of sections) {
    const id = section?.id;
    if (typeof id === 'string' && id.trim()) {
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
  }
  return sections.map((section, index) => {
    const base = diagnoseDraftSection(section, buffer);
    const structural = [...base.structuralReasons];
    const completeness = [...base.completenessReasons];
    const id = section?.id;
    if (typeof id === 'string' && id.trim() && (idCounts.get(id) || 0) > 1) {
      if (!structural.includes('duplicate-section-id')) structural.push('duplicate-section-id');
    }
    const structurallyValid = structural.length === 0 && base.start >= 0 && base.end >= 0 && base.start <= base.end;
    const complete = structurallyValid && completeness.length === 0;
    const reasons = [...structural, ...completeness];
    return {
      index,
      id: id ?? null,
      section,
      start: base.start,
      end: base.end,
      reasons,
      structuralReasons: structural,
      completenessReasons: completeness,
      structurallyValid,
      complete,
      // valid kept as adopt-grade completeness for existing callers
      valid: complete,
      repairableByBoundary: base.repairableByBoundary && !structural.includes('duplicate-section-id'),
    };
  });
}

export function buildDraftSectionsFromCurrent(buffer, sections, newId = () => crypto.randomUUID()) {
  if (!Array.isArray(buffer) || buffer.length === 0) {
    return { sections: [], gapsFilled: 0, overlapCount: 0, invalidCount: 0 };
  }
  const ordered = orderSectionsOnBuffer(sections, buffer);
  const invalidCount = ordered.filter(r => !r.valid).length;
  let overlapCount = 0;
  const valid = ordered.filter(r => r.valid);
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].start <= valid[i - 1].end) overlapCount += 1;
  }
  const result = [];
  let cursor = 0;
  let gapsFilled = 0;
  for (const row of valid) {
    if (row.start > cursor) {
      result.push({
        id: newId(), type: RECONFIG_GAP_TYPE, name: RECONFIG_GAP_NAME,
        startChordId: buffer[cursor]._id, endChordId: buffer[row.start - 1]._id,
      });
      gapsFilled += 1;
    }
    result.push({
      id: row.section.id, type: row.section.type, name: row.section.name,
      startChordId: row.section.startChordId, endChordId: row.section.endChordId,
    });
    cursor = Math.max(cursor, row.end + 1);
  }
  if (cursor < buffer.length) {
    result.push({
      id: newId(), type: RECONFIG_GAP_TYPE, name: RECONFIG_GAP_NAME,
      startChordId: buffer[cursor]._id, endChordId: buffer[buffer.length - 1]._id,
    });
    gapsFilled += 1;
  }
  // Keep invalid sections visible (do not auto-repair / drop silently)
  for (const row of ordered.filter(r => !r.valid)) {
    result.push({
      id: row.section.id, type: row.section.type, name: row.section.name,
      startChordId: row.section.startChordId, endChordId: row.section.endChordId,
    });
  }
  return { sections: result, gapsFilled, overlapCount, invalidCount };
}

export function createReconfigurationDraft({ projectId, buffer, sections, newId }) {
  const built = buildDraftSectionsFromCurrent(buffer, sections, newId);
  const sectionsClone = built.sections;
  return {
    projectId: projectId ?? null,
    bufferSnapshot: structuredClone(buffer),
    sections: sectionsClone,
    sectionsBaseline: cloneSections(sectionsClone),
    gapsFilled: built.gapsFilled,
    overlapCount: built.overlapCount,
    invalidCount: built.invalidCount,
    undoStack: [],
    redoStack: [],
  };
}

/** True if draft sections differ from the baseline taken at open time. */
export function isDraftDirty(draft) {
  if (!draft) return false;
  try {
    return JSON.stringify(draft.sections) !== JSON.stringify(draft.sectionsBaseline ?? []);
  } catch {
    return true;
  }
}

function snap(draft) { return cloneSections(draft.sections); }

export function pushDraftUndo(draft) {
  if (!draft) return;
  draft.undoStack.push(snap(draft));
  draft.redoStack = [];
}
export function undoDraft(draft) {
  if (!draft || !draft.undoStack.length) return false;
  draft.redoStack.push(snap(draft));
  draft.sections = draft.undoStack.pop();
  return true;
}
export function redoDraft(draft) {
  if (!draft || !draft.redoStack.length) return false;
  draft.undoStack.push(snap(draft));
  draft.sections = draft.redoStack.pop();
  return true;
}

export function mergeDraftSections(draft, sectionIds, buffer) {
  if (!draft || !Array.isArray(sectionIds) || sectionIds.length < 2) return { ok: false, reason: 'need-two-sections' };
  const idSet = new Set(sectionIds);
  const ordered = orderSectionsOnBuffer(draft.sections.filter(s => idSet.has(s.id)), buffer).filter(r => r.valid);
  if (ordered.length < 2) return { ok: false, reason: 'need-two-valid-sections' };
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start !== ordered[i - 1].end + 1) return { ok: false, reason: 'not-contiguous' };
  }
  const first = ordered[0].section;
  const merged = {
    id: first.id, type: first.type, name: first.name,
    startChordId: buffer[ordered[0].start]._id,
    endChordId: buffer[ordered[ordered.length - 1].end]._id,
  };
  const inv = validateSectionInvariants(merged, buffer);
  if (!inv.valid) return { ok: false, reason: inv.reason };
  pushDraftUndo(draft);
  const remove = new Set(ordered.map(r => r.section.id));
  const next = draft.sections.filter(s => !remove.has(s.id));
  const insertAt = Math.min(...ordered.map(r => draft.sections.findIndex(s => s.id === r.section.id)).filter(i => i >= 0));
  next.splice(insertAt === Infinity ? next.length : insertAt, 0, merged);
  draft.sections = next;
  return { ok: true, section: merged };
}

export function splitDraftSection(draft, sectionId, endChordIdOfFirst, buffer, newId = () => crypto.randomUUID()) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  const section = draft.sections.find(s => s.id === sectionId);
  if (!section) return { ok: false, reason: 'section-not-found' };
  const start = chordIndex(buffer, section.startChordId);
  const end = chordIndex(buffer, section.endChordId);
  const mid = chordIndex(buffer, endChordIdOfFirst);
  if (start < 0 || end < 0 || mid < 0) return { ok: false, reason: 'chord-not-found' };
  if (mid < start || mid >= end) return { ok: false, reason: 'split-not-inside' };
  const front = {
    id: section.id, type: section.type, name: section.name,
    startChordId: buffer[start]._id, endChordId: buffer[mid]._id,
    ...(section.nameUserEdited ? { nameUserEdited: true } : {}),
  };
  // Spec: back half gets new id; name and type left empty for user to fill before adopt
  const back = {
    id: newId(), type: '', name: '',
    startChordId: buffer[mid + 1]._id, endChordId: buffer[end]._id,
  };
  for (const s of [front, back]) {
    const inv = validateSectionInvariants(
      { ...s, name: s.name || 'x', type: s.type || 'other' },
      buffer,
    );
    if (!inv.valid) return { ok: false, reason: inv.reason };
  }
  pushDraftUndo(draft);
  const idx = draft.sections.findIndex(s => s.id === sectionId);
  const next = draft.sections.slice();
  next.splice(idx, 1, front, back);
  draft.sections = next;
  return { ok: true, front, back };
}

export function updateDraftSection(draft, sectionId, patch = {}, opts = {}) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  const idx = draft.sections.findIndex(s => s.id === sectionId);
  if (idx < 0) return { ok: false, reason: 'section-not-found' };
  pushDraftUndo(draft);
  const cur = draft.sections[idx];
  const next = { ...cur };
  if (patch.startChordId !== undefined) next.startChordId = patch.startChordId;
  if (patch.endChordId !== undefined) next.endChordId = patch.endChordId;
  if (patch.name !== undefined) {
    next.name = patch.name;
    // Explicit name edits lock auto type→name linking unless caller opts out
    if (opts.fromUserNameEdit !== false) next.nameUserEdited = true;
  }
  if (patch.type !== undefined) {
    next.type = patch.type;
    // Auto-fill name when user has not manually edited it
    if (!next.nameUserEdited && typeof opts.defaultNameForType === 'function') {
      next.name = opts.defaultNameForType(patch.type);
    }
  }
  if (patch.nameUserEdited !== undefined) next.nameUserEdited = !!patch.nameUserEdited;
  draft.sections[idx] = next;
  return { ok: true };
}

/**
 * Delete a draft section (typically invalid / unrepairable). Draft-only.
 * Does not auto-fill gaps; adopt validation will reject incomplete coverage.
 */
/**
 * Delete exactly one draft section by array index (safe with duplicate IDs).
 * @param {object} draft
 * @param {number} sectionIndex
 */
export function deleteDraftSectionAt(draft, sectionIndex) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= draft.sections.length) {
    return { ok: false, reason: 'bad-index' };
  }
  pushDraftUndo(draft);
  draft.sections = draft.sections.slice(0, sectionIndex).concat(draft.sections.slice(sectionIndex + 1));
  return { ok: true };
}

/** @deprecated Prefer deleteDraftSectionAt — ID filter removes all duplicates. */
export function deleteDraftSection(draft, sectionId) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  const idx = draft.sections.findIndex(s => s.id === sectionId);
  if (idx < 0) return { ok: false, reason: 'section-not-found' };
  return deleteDraftSectionAt(draft, idx);
}

/**
 * Set end of section at draft.sections[sectionIndex] to endChordIndex (B-method).
 *
 * Rules (Phase150 Stage1 fix):
 * - Shared boundary with the next time-ordered valid neighbour only.
 * - Moving A's end left/right adjusts only B's start by the same shared boundary
 *   (B.start = A.end + 1). No cascade to later sections.
 * - Reject if A or B would become shorter than 1 chord.
 * - Reject if move would cross beyond B's current end (must move B first).
 * - Last section's end is fixed at buffer end; left/right moves rejected.
 * - Local overlap repair: A may end just before B.start without changing B's range
 *   when they currently overlap and the new end is strictly before B.start.
 * - Invalid sections are not rewritten by this operation; operate on valid pairs only.
 */
export function setDraftSectionEndByChordIndex(draft, sectionIndex, endChordIndex, buffer) {
  if (!draft || !Array.isArray(buffer)) return { ok: false, reason: 'bad-args' };
  if (sectionIndex < 0 || sectionIndex >= draft.sections.length) return { ok: false, reason: 'bad-index' };
  if (endChordIndex < 0 || endChordIndex >= buffer.length) return { ok: false, reason: 'bad-chord' };

  const target = draft.sections[sectionIndex];
  const allDiag = diagnoseDraftSections(draft, buffer);
  const diag = allDiag[sectionIndex];
  if (!diag || !diag.structurallyValid) return { ok: false, reason: 'section-invalid', details: diag?.structuralReasons || diag?.reasons };

  const aStart = diag.start;
  const aEnd = diag.end;
  if (endChordIndex < aStart) return { ok: false, reason: 'end-before-start' };

  // Immediate neighbour in buffer time order (includes invalids that have any chord span).
  // Sort key: start if known, else end if known, else stable index (keeps unresolved near place).
  const positioned = allDiag
    .map(r => ({
      ...r,
      sortKey: r.start >= 0 ? r.start : (r.end >= 0 ? r.end : Number.MAX_SAFE_INTEGER),
    }))
    .slice()
    .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index);
  const ordPos = positioned.findIndex(r => r.index === sectionIndex);
  if (ordPos < 0) return { ok: false, reason: 'section-not-in-order' };

  const isLast = ordPos === positioned.length - 1;
  if (isLast) {
    // Last section end is fixed at song end. Boundary tool must not implicitly split.
    // Use splitDraftAtChordIndex for intentional splits.
    if (endChordIndex === aEnd) return { ok: true, noop: true };
    return { ok: false, reason: 'last-section-end-fixed' };
  }

  // F5: fully unlocated invalid sections must not be guessed into the timeline.
  // If any exist, shared-boundary moves (which need a safe neighbour) are refused.
  const hasUnlocatedInvalid = allDiag.some(
    r => !r.structurallyValid && r.start < 0 && r.end < 0
  );
  if (hasUnlocatedInvalid) {
    return { ok: false, reason: 'unlocated-invalid-section' };
  }

  const nextRow = positioned[ordPos + 1];
  // Never skip an invalid neighbour to rewrite a later section
  if (!nextRow.structurallyValid) {
    return { ok: false, reason: 'neighbour-invalid', details: nextRow.structuralReasons || nextRow.reasons };
  }
  const bStart = nextRow.start;
  const bEnd = nextRow.end;

  // Local overlap repair: allow ending strictly before current B.start without moving B
  if (aEnd >= bStart && endChordIndex < bStart) {
    // A shrinks to clear overlap; B unchanged
    if (endChordIndex < aStart) return { ok: false, reason: 'end-before-start' };
    // A must remain >= 1 chord
    if (endChordIndex < aStart) return { ok: false, reason: 'section-too-short' };
    pushDraftUndo(draft);
    draft.sections[sectionIndex] = { ...draft.sections[sectionIndex], endChordId: buffer[endChordIndex]._id };
    return { ok: true, localOverlapRepair: true };
  }

  // Shared-boundary move: new B.start = endChordIndex + 1
  const newBStart = endChordIndex + 1;
  if (newBStart >= buffer.length) return { ok: false, reason: 'no-room-for-next' };
  // A at least 1 chord: endChordIndex >= aStart (already)
  // B at least 1 chord: newBStart <= bEnd
  if (newBStart > bEnd) return { ok: false, reason: 'crosses-next-section-end' };
  if (endChordIndex < aStart) return { ok: false, reason: 'section-too-short' };

  // If not currently overlapping/adjacent in a simple way, still only touch A and B
  pushDraftUndo(draft);
  const bIdx = nextRow.index;
  draft.sections[sectionIndex] = {
    ...draft.sections[sectionIndex],
    endChordId: buffer[endChordIndex]._id,
  };
  draft.sections[bIdx] = {
    ...draft.sections[bIdx],
    startChordId: buffer[newBStart]._id,
  };
  return { ok: true };
}

export function isDraftBufferStale(draft, buffer) {
  if (!draft) return true;
  try { return JSON.stringify(buffer) !== JSON.stringify(draft.bufferSnapshot); }
  catch { return true; }
}


/**
 * Merge draft.sections[sectionIndex] into the previous time-ordered structural neighbour.
 * Keeps previous section id/name/type; range extends to current end.
 */
export function mergeDraftWithPrevious(draft, sectionIndex, buffer) {
  if (!draft || !Array.isArray(buffer)) return { ok: false, reason: 'bad-args' };
  if (!Number.isInteger(sectionIndex) || sectionIndex <= 0 || sectionIndex >= draft.sections.length) {
    return { ok: false, reason: 'no-previous-section' };
  }
  const list = diagnoseDraftSections(draft, buffer);
  const cur = list[sectionIndex];
  if (!cur || !cur.structurallyValid) return { ok: false, reason: 'section-invalid', details: cur?.structuralReasons };
  const positioned = list
    .filter(r => r.structurallyValid && r.start >= 0 && r.end >= 0)
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);
  const ordPos = positioned.findIndex(r => r.index === sectionIndex);
  if (ordPos <= 0) return { ok: false, reason: 'no-previous-section' };
  const prev = positioned[ordPos - 1];
  if (cur.start !== prev.end + 1) {
    // Allow merge only when adjacent (no gap/overlap)
    if (cur.start <= prev.end) return { ok: false, reason: 'sections-overlap' };
    return { ok: false, reason: 'gap-between-sections' };
  }
  pushDraftUndo(draft);
  const prevSec = draft.sections[prev.index];
  const merged = {
    ...prevSec,
    endChordId: draft.sections[sectionIndex].endChordId,
  };
  // Remove current, replace previous with merged (handle index order)
  const next = draft.sections.slice();
  const hi = Math.max(prev.index, sectionIndex);
  const lo = Math.min(prev.index, sectionIndex);
  next.splice(hi, 1);
  next[lo] = merged;
  draft.sections = next;
  return { ok: true, mergedIndex: lo, merged };
}

/**
 * Split section at sectionIndex so endChordIndex is the last chord of the front half.
 * Back half: new id, empty name/type.
 */
export function splitDraftAtChordIndex(draft, sectionIndex, endChordIndex, buffer, newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sec-${Date.now()}`)) {
  if (!draft || !Array.isArray(buffer)) return { ok: false, reason: 'bad-args' };
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= draft.sections.length) {
    return { ok: false, reason: 'bad-index' };
  }
  const list = diagnoseDraftSections(draft, buffer);
  const diag = list[sectionIndex];
  if (!diag || !diag.structurallyValid) return { ok: false, reason: 'section-invalid', details: diag?.structuralReasons };
  const aStart = diag.start;
  const aEnd = diag.end;
  if (endChordIndex < aStart || endChordIndex >= aEnd) return { ok: false, reason: 'split-not-inside' };
  const section = draft.sections[sectionIndex];
  const front = {
    id: section.id,
    type: section.type,
    name: section.name,
    startChordId: buffer[aStart]._id,
    endChordId: buffer[endChordIndex]._id,
    ...(section.nameUserEdited ? { nameUserEdited: true } : {}),
  };
  const back = {
    id: newId(),
    type: '',
    name: '',
    startChordId: buffer[endChordIndex + 1]._id,
    endChordId: buffer[aEnd]._id,
  };
  pushDraftUndo(draft);
  const next = draft.sections.slice();
  next.splice(sectionIndex, 1, front, back);
  draft.sections = next;
  return { ok: true, frontIndex: sectionIndex, backIndex: sectionIndex + 1 };
}

export function prepareDraftForAdopt(draft, { projectId, buffer, isEditing }) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  if (!isEditing) return { ok: false, reason: 'editor-inactive' };
  if (draft.projectId != null && projectId != null && draft.projectId !== projectId) {
    return { ok: false, reason: 'project-mismatch' };
  }
  if (isDraftBufferStale(draft, buffer)) return { ok: false, reason: 'buffer-stale' };
  // 1) Inspect Draft rows BEFORE canonical projection so unknown keys are visible.
  //    ALLOWED keys and known DRAFT_ONLY_KEYS (e.g. nameUserEdited) are permitted;
  //    any other key is rejected as unknown-section-key.
  const draftRows = Array.isArray(draft.sections) ? draft.sections : [];
  for (const section of draftRows) {
    if (!section || typeof section !== 'object') return { ok: false, reason: 'invalid-section' };
    for (const key of Object.keys(section)) {
      if (ALLOWED.has(key) || DRAFT_ONLY_KEYS.has(key)) continue;
      return { ok: false, reason: 'unknown-section-key', key };
    }
  }
  // 2) Project to canonical Section shape (drops DRAFT_ONLY_KEYS).
  const sections = toCanonicalSections(draftRows);
  for (const section of sections) {
    if (!section || typeof section !== 'object') return { ok: false, reason: 'invalid-section' };
    if (Object.keys(section).some(k => !ALLOWED.has(k))) {
      return { ok: false, reason: 'unknown-section-key' };
    }
  }
  // Structural + completeness (name/type required at adopt)
  {
    const list = diagnoseDraftSections({ sections: draftRows }, buffer);
    const structuralBad = list.filter(d => !d.structurallyValid);
    if (structuralBad.length) {
      return {
        ok: false,
        reason: 'invalid-section-remaining',
        errors: structuralBad.map(d => ({ id: d.id, index: d.index, reasons: d.structuralReasons || d.reasons })),
      };
    }
    const incomplete = list.filter(d => !d.complete);
    if (incomplete.length) {
      return {
        ok: false,
        reason: 'incomplete-section-fields',
        errors: incomplete.map(d => ({
          id: d.id,
          index: d.index,
          reasons: d.completenessReasons || d.reasons.filter(r => COMPLETENESS_REASONS.has(r)),
        })),
      };
    }
  }
  const check = validateGeneratedSectionSet(sections, buffer);
  if (!check.valid) {
    return { ok: false, reason: check.errors[0]?.reason ?? 'invalid-section-set', errors: check.errors };
  }
  return { ok: true, sections };
}

export function createReconfigRuntime() {
  return { draft: null, audioSnapshot: null, modalOpen: false, closed: false };
}

export function teardownReconfigRuntime(runtime, opts = {}) {
  const restoreAudio = opts.restoreAudio === true;
  const hadDraft = runtime.draft != null;
  const snap = runtime.audioSnapshot;
  const closeModal = runtime.modalOpen === true || hadDraft;
  runtime.draft = null;
  runtime.audioSnapshot = null;
  runtime.modalOpen = false;
  runtime.closed = true;
  return {
    hadDraft, closeModal, pauseAudio: true,
    restoreAudio: restoreAudio && snap ? snap : null,
    adopt: false, save: false,
  };
}

/** Indices for UI: for each draft section, start/end chord index on buffer. */
export function draftSectionChordSpans(draft, buffer) {
  // Preserve draft.sections array order for UI indexing (not re-sorted).
  return (draft?.sections || []).map((section, i) => {
    const start = chordIndex(buffer, section?.startChordId);
    const end = chordIndex(buffer, section?.endChordId);
    const valid = start >= 0 && end >= 0 && start <= end;
    return { id: section?.id, start, end, valid, section, i };
  });
}
