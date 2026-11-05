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
 *
 * [NOT IMPLEMENTED] This always returns eligible: it does NOT validate the timing
 * structure (bar grid, downbeats, repair rules). The only timing-related stop in the
 * UI is app.js startSectionAutoGeneration(), which refuses a 'fallback' timing model
 * (no bar grid). 'full' and 'beat-only' models are both accepted. See
 * docs/section-auto-mvp-design.md "タイミング構造チェックの現状".
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
 * @param {object} input.loadResult - the analysis document read from disk. In the current MVP it is
 *   built in app.js from loadAnalysisFile() (no sha256); the future dedicated save API (not wired up yet)
 *   would supply it from its own loader (W5).
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
  // Spec F7 (section-save-technical-design.md v2.2, section 2.1.1): for THIS eligibility check only,
  // a missing `sections` property counts as "no Sections yet", like `[]`.
  // - This function reads only. It does not add the property or touch the loaded data, and the
  //   load path does not fill it in either. The `sections` array is first written by the user's
  //   normal save (saveAnalysisEdit()) after they adopt generated Sections.
  // - A property that exists but is not an array (null, object, string, number, boolean) is
  //   rejected, never replaced with `[]`. Existing Sections are rejected too.
  // - Other code paths may treat these values differently (e.g. beginAnalysisEdit() reads
  //   `raw.sections ?? []`, so null falls back to [] there); see docs/section-auto-mvp-design.md.
  const sectionsPropertyMissing = !Object.prototype.hasOwnProperty.call(raw, 'sections');
  if (!sectionsPropertyMissing) {
    if (!Array.isArray(raw.sections)) return fail('sections-not-array');
    if (raw.sections.length > 0) return fail('sections-already-exist');
  }

  const diskChordIds = chordIds(raw.chords);
  if (diskChordIds === null) return fail('disk-chords-invalid');
  // Section endpoints are chord `_id` references, so duplicate IDs make them ambiguous.
  // The future dedicated save API would reject this too (section_save.validate_sections:
  // duplicate-chord-id; section_save.py is not wired into server.py yet).
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

  return { eligible: true, reason: null, analysis, sha256: loadResult.sha256, sectionsPropertyMissing };
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
