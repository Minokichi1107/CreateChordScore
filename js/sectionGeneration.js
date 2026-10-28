/**
 * Section auto-generation eligibility and edit-snapshot helpers.
 *
 * This module is deliberately pure: it does not start an editor, mutate project
 * state, perform network I/O, or decide the future Issue #130 timing stop rules.
 */

/**
 * Placeholder for the Issue #130 timing-structure gate.
 * Keep this explicit seam; Phase B requires it to pass until the separate
 * timing investigation defines concrete stop conditions.
 */
export function evaluateTimingStructureForSectionGeneration() {
  return { eligible: true, reason: null };
}

function fail(reason, details = {}) {
  return { eligible: false, reason, ...details };
}

function chordIds(chords) {
  if (!Array.isArray(chords)) return null;
  const ids = [];
  for (const chord of chords) {
    if (!chord || typeof chord !== 'object' ||
        typeof chord._id !== 'string' || !chord._id.trim()) return null;
    ids.push(chord._id);
  }
  return ids;
}

function sameSequence(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

/**
 * Evaluate generation eligibility using the server-read analysis document.
 *
 * @param {object} input
 * @param {object} input.loadResult - response from the future W5 loadAnalysisForSave()
 * @param {string} input.expectedProjectId - current project's ID
 * @param {object} input.memoryRaw - project.analysis.raw (not the normalized projection)
 * @param {object|null} input.editorSession - current Analysis Editor session
 * @returns {{eligible:boolean, reason?:string, analysis?:object}}
 */
export function evaluateSectionGenerationEligibility({
  loadResult,
  expectedProjectId,
  memoryRaw,
  editorSession,
} = {}) {
  if (!loadResult || loadResult.state !== 'present' || !loadResult.analysis) {
    const reason = loadResult?.reason || loadResult?.state || 'read-error';
    return fail(reason === 'duplicate' ? 'multiple-files' : `read-${reason}`);
  }

  const analysis = loadResult.analysis;
  if (!expectedProjectId || analysis.projectId !== expectedProjectId) {
    return fail('project-id-mismatch');
  }
  if (typeof analysis.generatedAt !== 'string' || !analysis.generatedAt.trim()) {
    return fail('generated-at-missing');
  }

  const raw = analysis.raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('raw-invalid');
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'sections')) {
    return fail('sections-missing');
  }
  if (!Array.isArray(raw.sections)) return fail('sections-not-array');
  if (raw.sections.length > 0) return fail('sections-already-exist');

  const diskChordIds = chordIds(raw.chords);
  if (diskChordIds === null) return fail('disk-chords-invalid');
  // Section endpoints are chord `_id` references, so duplicate IDs make them ambiguous.
  // The server rejects this too (section_save.validate_sections: duplicate-chord-id).
  if (new Set(diskChordIds).size !== diskChordIds.length) return fail('disk-chords-duplicate-id');

  const memoryChordIds = chordIds(memoryRaw?.chords);
  if (memoryChordIds === null || !sameSequence(memoryChordIds, diskChordIds)) {
    return fail('chords-changed-on-disk');
  }

  if (editorSession?.active && editorSession.dirty) {
    return fail('editor-has-unsaved-edits');
  }

  const timing = evaluateTimingStructureForSectionGeneration(analysis);
  if (!timing.eligible) return fail(timing.reason || 'timing-structure-invalid');

  return { eligible: true, reason: null, analysis, sha256: loadResult.sha256 };
}

/** Capture the initial code buffer without retaining mutable references. */
export function captureSectionGenerationBuffer(buffer) {
  if (!Array.isArray(buffer)) throw new TypeError('buffer must be an array');
  return structuredClone(buffer);
}

/**
 * Return true if code edits occurred during a Section-generation session.
 * Section changes and selection changes are intentionally outside this comparison.
 */
export function hasSectionGenerationCodeEdits(buffer, initialSnapshot) {
  if (!Array.isArray(buffer) || !Array.isArray(initialSnapshot)) return true;
  return JSON.stringify(buffer) !== JSON.stringify(initialSnapshot);
}
