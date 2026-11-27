/**
 * Section reconfiguration Draft (Phase150 Stage1).
 * Independent of analysisEditor until adopt.
 */
import { validateSectionSet } from './sectionSetValidation.js';
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
 * Return structurally valid Draft sections in chronological buffer order.
 * Each row retains its original Draft array index for safe mutation.
 */
export function orderedValidSections(sections, buffer, diagnostics = null) {
  const list = Array.isArray(diagnostics)
    ? diagnostics
    : diagnoseDraftSections({ sections: Array.isArray(sections) ? sections : [] }, buffer);
  return list
    .filter(row => row.structurallyValid && row.start >= 0 && row.end >= row.start)
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);
}

const COMPLETENESS_REASONS = new Set(['invalid-section-name', 'invalid-section-type']);

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
  if (typeof section.type !== 'string' || !section.type.trim()) completeness.push('invalid-section-type');
  if (typeof section.name !== 'string' || !section.name.trim()) completeness.push('invalid-section-name');
  if (!section.startChordId) structural.push('missing-startChordId');
  if (!section.endChordId) structural.push('missing-endChordId');
  const start = chordIndex(buffer, section.startChordId);
  const end = chordIndex(buffer, section.endChordId);
  if (section.startChordId && start < 0) structural.push('start-chord-not-found');
  if (section.endChordId && end < 0) structural.push('end-chord-not-found');
  if (start >= 0 && end >= 0 && start > end) structural.push('start-after-end');
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
      valid: complete,
      repairableByBoundary: base.repairableByBoundary && !structural.includes('duplicate-section-id'),
    };
  });
}

export function buildDraftSectionsFromCurrent(buffer, sections, newId = () => crypto.randomUUID()) {
  if (!Array.isArray(buffer) || buffer.length === 0) {
    return { sections: [], gapsFilled: 0, overlapCount: 0, invalidCount: 0 };
  }

  // Normalize only valid, locatable ranges. Same-start ties retain source-array order.
  // Invalid rows are preserved for Stage2 diagnostics rather than silently discarded.
  const ordered = orderSectionsOnBuffer(sections, buffer);
  const valid = ordered
    .filter(row => row.valid)
    .sort((a, b) => a.start - b.start || a.i - b.i);
  const invalid = ordered.filter(row => !row.valid);
  const result = [];
  let cursor = 0;
  let gapsFilled = 0;
  let overlapCount = 0;
  let droppedCount = 0;
  const droppedSections = [];

  const addGap = (start, end) => {
    if (start > end) return;
    result.push({
      id: newId(),
      type: RECONFIG_GAP_TYPE,
      name: RECONFIG_GAP_NAME,
      startChordId: buffer[start]._id,
      endChordId: buffer[end]._id,
    });
    gapsFilled += 1;
  };

  for (const row of valid) {
    const effectiveStart = Math.max(row.start, cursor);
    if (row.start < cursor) overlapCount += 1;

    // A fully covered later Section has no surviving chord range.
    if (effectiveStart > row.end) {
      droppedCount += 1;
      droppedSections.push(structuredClone(row.section));
      continue;
    }

    // Fill only the uncovered range after overlap trimming.
    addGap(cursor, effectiveStart - 1);
    result.push({
      id: row.section.id,
      type: row.section.type,
      name: row.section.name,
      startChordId: buffer[effectiveStart]._id,
      endChordId: buffer[row.end]._id,
    });
    cursor = row.end + 1;
  }

  addGap(cursor, buffer.length - 1);

  for (const row of invalid) {
    result.push({
      id: row.section.id,
      type: row.section.type,
      name: row.section.name,
      startChordId: row.section.startChordId,
      endChordId: row.section.endChordId,
    });
  }

  return {
    sections: result,
    gapsFilled,
    overlapCount,
    invalidCount: invalid.length,
    droppedCount,
    droppedSections,
  };
}

/**
 * Measure the union of existing Section time ranges against the whole song.
 * Section boundaries are projected from chord IDs using the same convention
 * as Section Overview: start chord's start time through the next chord's start
 * (or the final chord's end). Overlaps are counted once; uncovered gaps are
 * not counted. A null ratio means reliable timing coverage cannot be computed.
 */
export function calculateSectionCoverage(sections, buffer) {
  if (!Array.isArray(buffer) || buffer.length === 0) {
    return { coveredSeconds: 0, totalSeconds: null, ratio: null, percent: null };
  }
  const songStart = Number(buffer[0]?.start);
  const songEnd = Number(buffer[buffer.length - 1]?.end);
  const totalSeconds = songEnd - songStart;
  if (!Number.isFinite(songStart) || !Number.isFinite(songEnd) || totalSeconds <= 0) {
    return { coveredSeconds: 0, totalSeconds: null, ratio: null, percent: null };
  }

  const intervals = [];
  for (const section of Array.isArray(sections) ? sections : []) {
    const start = chordIndex(buffer, section?.startChordId);
    const end = chordIndex(buffer, section?.endChordId);
    if (start < 0 || end < start) continue;
    const startTime = Number(buffer[start]?.start);
    const endTime = end === buffer.length - 1
      ? Number(buffer[end]?.end)
      : Number(buffer[end + 1]?.start);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) continue;
    const clippedStart = Math.max(songStart, startTime);
    const clippedEnd = Math.min(songEnd, endTime);
    if (clippedEnd > clippedStart) intervals.push({ start: clippedStart, end: clippedEnd });
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  let coveredSeconds = 0;
  let activeStart = null;
  let activeEnd = null;
  for (const interval of intervals) {
    if (activeStart === null) {
      activeStart = interval.start;
      activeEnd = interval.end;
    } else if (interval.start <= activeEnd) {
      activeEnd = Math.max(activeEnd, interval.end);
    } else {
      coveredSeconds += activeEnd - activeStart;
      activeStart = interval.start;
      activeEnd = interval.end;
    }
  }
  if (activeStart !== null) coveredSeconds += activeEnd - activeStart;

  const ratio = Math.max(0, Math.min(1, coveredSeconds / totalSeconds));
  return {
    coveredSeconds,
    totalSeconds,
    ratio,
    percent: ratio * 100,
  };
}

export function recommendSectionReconfiguration(coverage, threshold = 0.8) {
  if (!Number.isFinite(coverage?.ratio)) return null;
  return coverage.ratio >= threshold ? 'keep-existing' : 'start-fresh';
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
    droppedCount: built.droppedCount ?? 0,
    droppedSections: structuredClone(built.droppedSections ?? []),
    normalization: {
      gapsFilled: built.gapsFilled,
      overlapCount: built.overlapCount,
      droppedCount: built.droppedCount ?? 0,
      droppedNames: (built.droppedSections ?? []).map(section => String(section?.name ?? '')).filter(Boolean),
    },
    invalidCount: built.invalidCount,
    undoStack: [],
    redoStack: [],
  };
}

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

export function splitDraftSection(
  draft, sectionId, endChordIdOfFirst, buffer,
  newId = () => crypto.randomUUID(), opts = {},
) {
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
  const inheritBackMeta = opts.inheritBackMeta === true;
  const backType = inheritBackMeta ? section.type : '';
  const back = {
    id: newId(),
    type: backType,
    name: inheritBackMeta ? section.name : '',
    startChordId: buffer[mid + 1]._id,
    endChordId: buffer[end]._id,
  };
  if (inheritBackMeta && typeof opts.defaultNameForType === 'function') {
    back.name = opts.defaultNameForType(backType);
  } else if (inheritBackMeta && section.nameUserEdited) {
    back.nameUserEdited = true;
  }
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
  return { ok: true, front, back, frontIndex: idx, backIndex: idx + 1 };
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
    if (opts.fromUserNameEdit !== false) next.nameUserEdited = true;
  }
  // Apply flag before type so defaultNameForType can run when unlocking
  if (patch.nameUserEdited !== undefined) next.nameUserEdited = !!patch.nameUserEdited;
  if (patch.type !== undefined) {
    next.type = patch.type;
    if (!next.nameUserEdited && typeof opts.defaultNameForType === 'function') {
      next.name = opts.defaultNameForType(patch.type);
    }
  }
  draft.sections[idx] = next;
  return { ok: true };
}

export function deleteDraftSectionAt(draft, sectionIndex) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= draft.sections.length) {
    return { ok: false, reason: 'bad-index' };
  }
  pushDraftUndo(draft);
  draft.sections = draft.sections.slice(0, sectionIndex).concat(draft.sections.slice(sectionIndex + 1));
  return { ok: true };
}

export function deleteDraftSection(draft, sectionId) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  const idx = draft.sections.findIndex(s => s.id === sectionId);
  if (idx < 0) return { ok: false, reason: 'section-not-found' };
  return deleteDraftSectionAt(draft, idx);
}

function resolveSharedBoundaryPair(draft, buffer, prevSectionId, nextSectionId = null, opts = {}) {
  if (!draft || !Array.isArray(draft.sections) || !Array.isArray(buffer) || !buffer.length ||
      typeof prevSectionId !== 'string' || !prevSectionId) {
    return { ok: false, reason: 'bad-args' };
  }
  const diagnostics = diagnoseDraftSections(draft, buffer);
  const matches = diagnostics.filter(row => row.id === prevSectionId);
  if (matches.length !== 1) return { ok: false, reason: matches.length ? 'invalid' : 'section-not-found' };
  const prev = matches[0];
  if (!prev.structurallyValid) {
    return { ok: false, reason: 'invalid', details: prev.structuralReasons || prev.reasons };
  }
  if (diagnostics.some(row => !row.structurallyValid && row.start < 0 && row.end < 0)) {
    return { ok: false, reason: 'unlocated-invalid' };
  }
  const positioned = diagnostics.slice().sort((a, b) => {
    const aKey = a.start >= 0 ? a.start : (a.end >= 0 ? a.end : Number.MAX_SAFE_INTEGER);
    const bKey = b.start >= 0 ? b.start : (b.end >= 0 ? b.end : Number.MAX_SAFE_INTEGER);
    return aKey - bKey || a.index - b.index;
  });
  const at = positioned.findIndex(row => row.index === prev.index);
  if (at < 0 || at === positioned.length - 1) return { ok: false, reason: 'last' };
  const next = positioned[at + 1];
  if (!next.structurallyValid) {
    return { ok: false, reason: 'neighbour-invalid', details: next.structuralReasons || next.reasons };
  }
  if (nextSectionId != null && next.id !== nextSectionId) {
    return { ok: false, reason: 'not-adjacent' };
  }
  if (next.start <= prev.end) return { ok: false, reason: 'overlap' };
  if (next.start !== prev.end + 1 && !(opts.allowGap === true && next.start > prev.end + 1)) {
    return { ok: false, reason: 'gap' };
  }
  return {
    ok: true,
    prevId: prev.id,
    nextId: next.id,
    prevIndex: prev.index,
    nextIndex: next.index,
    prevStartIdx: prev.start,
    prevEndIdx: prev.end,
    nextStartIdx: next.start,
    nextEndIdx: next.end,
  };
}

export function canAdjustBoundaryWithNext(draft, buffer, prevSectionId) {
  return resolveSharedBoundaryPair(draft, buffer, prevSectionId);
}

export function adjustSharedBoundary(draft, prevSectionId, nextSectionId, endChordIndex, buffer) {
  if (!Number.isInteger(endChordIndex)) return { ok: false, reason: 'bad-chord' };
  // A boundary edit also absorbs any existing gap into the following Section.
  const pair = resolveSharedBoundaryPair(draft, buffer, prevSectionId, nextSectionId, { allowGap: true });
  if (!pair.ok) return pair;
  if (endChordIndex < 0 || endChordIndex >= buffer.length ||
      !buffer[endChordIndex]?._id || !buffer[endChordIndex + 1]?._id) {
    return { ok: false, reason: 'bad-chord' };
  }
  if (endChordIndex === pair.prevEndIdx) return { ok: true, noop: true };
  if (endChordIndex < pair.prevStartIdx) return { ok: false, reason: 'section-too-short' };
  if (endChordIndex >= pair.nextEndIdx) return { ok: false, reason: 'next-section-too-short' };

  const prev = draft.sections[pair.prevIndex];
  const next = draft.sections[pair.nextIndex];
  const updatedPrev = { ...prev, endChordId: buffer[endChordIndex]._id };
  const updatedNext = { ...next, startChordId: buffer[endChordIndex + 1]._id };

  const prevDiag = diagnoseDraftSection(updatedPrev, buffer);
  const nextDiag = diagnoseDraftSection(updatedNext, buffer);
  if (!prevDiag.structurallyValid || !nextDiag.structurallyValid) {
    return { ok: false, reason: 'invalid', details: [
      ...(prevDiag.structuralReasons || prevDiag.reasons || []),
      ...(nextDiag.structuralReasons || nextDiag.reasons || []),
    ] };
  }
  pushDraftUndo(draft);
  draft.sections[pair.prevIndex] = updatedPrev;
  draft.sections[pair.nextIndex] = updatedNext;
  return { ok: true, prev: updatedPrev, next: updatedNext, changed: [pair.prevId, pair.nextId] };
}

export function setDraftSectionEndByChordIndex(draft, sectionIndex, endChordIndex, buffer) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= draft.sections.length) {
    return { ok: false, reason: 'bad-index' };
  }
  if (!Number.isInteger(endChordIndex) || endChordIndex < 0 || endChordIndex >= buffer.length) {
    return { ok: false, reason: 'bad-chord' };
  }
  const section = draft.sections[sectionIndex];
  const start = chordIndex(buffer, section.startChordId);
  if (start < 0) return { ok: false, reason: 'start-chord-not-found' };
  if (endChordIndex < start) return { ok: false, reason: 'end-before-start' };
  const next = { ...section, endChordId: buffer[endChordIndex]._id };
  const diag = diagnoseDraftSection(next, buffer);
  if (!diag.structurallyValid) return { ok: false, reason: 'invalid', details: diag.structuralReasons || diag.reasons };
  pushDraftUndo(draft);
  draft.sections[sectionIndex] = next;
  return { ok: true, section: next };
}

export function isDraftBufferStale(draft, buffer) {
  if (!draft || !Array.isArray(buffer)) return true;
  try {
    return JSON.stringify(draft.bufferSnapshot) !== JSON.stringify(buffer);
  } catch {
    return true;
  }
}

export function mergeDraftWithPrevious(draft, sectionIndex, buffer) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= draft.sections.length) {
    return { ok: false, reason: 'bad-index' };
  }

  // The overview is chronological, but Draft array order is not a contract.
  // Resolve the selected Section's predecessor by chord position, then retain
  // the original array order for every unaffected Section.
  const diagnostics = diagnoseDraftSections(draft, buffer);
  const ordered = orderedValidSections(draft.sections, buffer, diagnostics);
  const position = ordered.findIndex(row => row.index === sectionIndex);
  if (position < 0) return { ok: false, reason: 'invalid' };
  if (position === 0) return { ok: false, reason: 'no-previous-section' };

  const curRow = ordered[position];
  const prevRow = ordered[position - 1];
  const cur = curRow.section;
  const prev = prevRow.section;
  if (curRow.start <= prevRow.end) return { ok: false, reason: 'sections-overlap' };
  if (curRow.start !== prevRow.end + 1) return { ok: false, reason: 'gap-between-sections' };

  const merged = {
    id: prev.id, type: prev.type, name: prev.name,
    startChordId: prev.startChordId, endChordId: cur.endChordId,
    ...(prev.nameUserEdited ? { nameUserEdited: true } : {}),
  };
  const inv = validateSectionInvariants(merged, buffer);
  if (!inv.valid) return { ok: false, reason: inv.reason };

  pushDraftUndo(draft);
  const insertAt = Math.min(curRow.index, prevRow.index);
  const next = draft.sections.filter((_, index) =>
    index !== curRow.index && index !== prevRow.index
  );
  next.splice(insertAt, 0, merged);
  draft.sections = next;
  return { ok: true, section: merged, mergedIndex: insertAt };
}

export function splitDraftAtChordIndex(
  draft, sectionId, endChordIndex, buffer, newId = () => crypto.randomUUID(), opts = {},
) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  const section = draft.sections.find(s => s.id === sectionId);
  if (!section) return { ok: false, reason: 'section-not-found' };
  const start = chordIndex(buffer, section.startChordId);
  const end = chordIndex(buffer, section.endChordId);
  if (start < 0 || end < 0) return { ok: false, reason: 'chord-not-found' };
  if (!Number.isInteger(endChordIndex) || endChordIndex < start || endChordIndex >= end) {
    return { ok: false, reason: 'split-not-inside' };
  }
  return splitDraftSection(draft, sectionId, buffer[endChordIndex]._id, buffer, newId, opts);
}

export function prepareDraftForAdopt(draft, { projectId, buffer, isEditing }) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  // Reject unexpected Draft keys before canonical projection can silently drop them.
  const hasUnknownKey = (draft.sections || []).some(section =>
    section && typeof section === 'object' &&
    Object.keys(section).some(key => !ALLOWED.has(key) && !DRAFT_ONLY_KEYS.has(key))
  );
  if (hasUnknownKey) return { ok: false, reason: 'unknown-section-key' };
  const diagnostics = diagnoseDraftSections(draft, buffer);
  // Structural failures and missing user-entered fields are independent; report each in its own pass.
  const incomplete = diagnostics.filter(d => d.structurallyValid && !d.complete);
  if (incomplete.length) {
    return { ok: false, reason: 'incomplete-section-fields', details: incomplete };
  }
  const invalid = diagnostics.filter(d => !d.structurallyValid);
  if (invalid.length) {
    return { ok: false, reason: 'section-invalid', details: invalid };
  }
  const sections = toCanonicalSections(draft.sections);
  const setResult = validateSectionSet(sections, buffer);
  if (!setResult.valid) {
    return { ok: false, reason: setResult.reason || 'invalid-set', details: setResult };
  }
  return { ok: true, sections, projectId: projectId ?? draft.projectId };
}

export function createReconfigRuntime() {
  return {
    playGeneration: 0,
    modalOpen: false,
    closed: true,
    draft: null,
    audioSnapshot: null,
    view: { scrollTop: 0, lastSeenSigs: null },
    splitContext: null,
  };
}

export function teardownReconfigRuntime(runtime, opts = {}) {
  if (!runtime) return;
  runtime.playGeneration = (Number(runtime.playGeneration) || 0) + 1;
  runtime.modalOpen = false;
  runtime.closed = true;
  runtime.draft = null;
  runtime.audioSnapshot = null;
  if (opts.clearView) {
    runtime.view = { scrollTop: 0, lastSeenSigs: null };
  }
  if (opts.clearSplitContext) runtime.splitContext = null;
}

export function draftSectionChordSpans(draft, buffer) {
  return (draft?.sections || []).map((section, i) => {
    const start = chordIndex(buffer, section?.startChordId);
    const end = chordIndex(buffer, section?.endChordId);
    const valid = start >= 0 && end >= 0 && start <= end;
    return { id: section?.id, start, end, valid, section, i };
  });
}
