/**
 * Section reconfiguration Draft (Phase150).
 * Independent of analysisEditor until adopt.
 */
import { validateGeneratedSectionSet } from './sectionSetValidation.js';
import { validateSectionInvariants } from './analysisSession.js';

export const RECONFIG_GAP_TYPE = 'other';
export const RECONFIG_GAP_NAME = 'その他';
const ALLOWED = new Set(['id', 'type', 'name', 'startChordId', 'endChordId']);

function chordIndex(buffer, id) {
  return buffer.findIndex(c => c && c._id === id);
}
function cloneSections(sections) {
  return structuredClone(Array.isArray(sections) ? sections : []);
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
  return {
    projectId: projectId ?? null,
    bufferSnapshot: structuredClone(buffer),
    sections: built.sections,
    gapsFilled: built.gapsFilled,
    overlapCount: built.overlapCount,
    invalidCount: built.invalidCount,
    undoStack: [],
    redoStack: [],
  };
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
  const front = { id: section.id, type: section.type, name: section.name, startChordId: buffer[start]._id, endChordId: buffer[mid]._id };
  const back = { id: newId(), type: section.type, name: section.name, startChordId: buffer[mid + 1]._id, endChordId: buffer[end]._id };
  for (const s of [front, back]) {
    const inv = validateSectionInvariants(s, buffer);
    if (!inv.valid) return { ok: false, reason: inv.reason };
  }
  pushDraftUndo(draft);
  const idx = draft.sections.findIndex(s => s.id === sectionId);
  const next = draft.sections.slice();
  next.splice(idx, 1, front, back);
  draft.sections = next;
  return { ok: true, front, back };
}

export function updateDraftSection(draft, sectionId, patch = {}) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  const idx = draft.sections.findIndex(s => s.id === sectionId);
  if (idx < 0) return { ok: false, reason: 'section-not-found' };
  pushDraftUndo(draft);
  const cur = draft.sections[idx];
  draft.sections[idx] = {
    ...cur,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.startChordId !== undefined ? { startChordId: patch.startChordId } : {}),
    ...(patch.endChordId !== undefined ? { endChordId: patch.endChordId } : {}),
  };
  return { ok: true };
}

/** B-method: set end of section at sectionIndex to chord index; shift following boundaries. */
export function setDraftSectionEndByChordIndex(draft, sectionIndex, endChordIndex, buffer) {
  if (!draft || !Array.isArray(buffer)) return { ok: false, reason: 'bad-args' };
  if (sectionIndex < 0 || sectionIndex >= draft.sections.length) return { ok: false, reason: 'bad-index' };
  if (endChordIndex < 0 || endChordIndex >= buffer.length) return { ok: false, reason: 'bad-chord' };
  const ordered = orderSectionsOnBuffer(draft.sections, buffer).filter(r => r.valid);
  if (ordered.length !== draft.sections.length) return { ok: false, reason: 'invalid-present' };
  // work on ordered list by time
  const secs = ordered.map(r => ({ ...r.section, _s: r.start, _e: r.end }));
  if (sectionIndex >= secs.length) return { ok: false, reason: 'bad-index' };
  const start = secs[sectionIndex]._s;
  if (endChordIndex < start) return { ok: false, reason: 'end-before-start' };
  // last section must end at buffer end when adopting; while editing allow intermediate
  pushDraftUndo(draft);
  secs[sectionIndex]._e = endChordIndex;
  secs[sectionIndex].endChordId = buffer[endChordIndex]._id;
  // If next section starts before or at new end, push next start to end+1
  for (let i = sectionIndex + 1; i < secs.length; i++) {
    const minStart = secs[i - 1]._e + 1;
    if (minStart >= buffer.length) {
      // drop remaining sections — keep for user fix
      break;
    }
    if (secs[i]._s < minStart) {
      secs[i]._s = minStart;
      secs[i].startChordId = buffer[minStart]._id;
      if (secs[i]._e < secs[i]._s) {
        secs[i]._e = secs[i]._s;
        secs[i].endChordId = buffer[secs[i]._e]._id;
      }
    }
  }
  draft.sections = secs.map(({ _s, _e, ...s }) => s);
  return { ok: true };
}

export function isDraftBufferStale(draft, buffer) {
  if (!draft) return true;
  try { return JSON.stringify(buffer) !== JSON.stringify(draft.bufferSnapshot); }
  catch { return true; }
}

export function prepareDraftForAdopt(draft, { projectId, buffer, isEditing }) {
  if (!draft) return { ok: false, reason: 'no-draft' };
  if (!isEditing) return { ok: false, reason: 'editor-inactive' };
  if (draft.projectId != null && projectId != null && draft.projectId !== projectId) {
    return { ok: false, reason: 'project-mismatch' };
  }
  if (isDraftBufferStale(draft, buffer)) return { ok: false, reason: 'buffer-stale' };
  const sections = cloneSections(draft.sections);
  for (const section of sections) {
    if (!section || typeof section !== 'object') return { ok: false, reason: 'invalid-section' };
    if (Object.keys(section).some(k => !ALLOWED.has(k))) return { ok: false, reason: 'unknown-section-key' };
  }
  const check = validateGeneratedSectionSet(sections, buffer);
  if (!check.valid) {
    return { ok: false, reason: check.errors[0]?.reason ?? 'invalid-section-set', errors: check.errors };
  }
  return { ok: true, sections };
}

export function createReconfigRuntime() {
  return { draft: null, audioSnapshot: null, modalOpen: false };
}

export function teardownReconfigRuntime(runtime, opts = {}) {
  const restoreAudio = opts.restoreAudio === true;
  const hadDraft = runtime.draft != null;
  const snap = runtime.audioSnapshot;
  const closeModal = runtime.modalOpen === true || hadDraft;
  runtime.draft = null;
  runtime.audioSnapshot = null;
  runtime.modalOpen = false;
  return {
    hadDraft, closeModal, pauseAudio: true,
    restoreAudio: restoreAudio && snap ? snap : null,
    adopt: false, save: false,
  };
}

/** Indices for UI: for each draft section, start/end chord index on buffer. */
export function draftSectionChordSpans(draft, buffer) {
  return orderSectionsOnBuffer(draft?.sections || [], buffer).map(r => ({
    id: r.section?.id,
    start: r.start,
    end: r.end,
    valid: r.valid,
    section: r.section,
  }));
}
