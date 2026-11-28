/**
 * Section code-buffer comparison helper.
 *
 * Used when Section reconfiguration starts to detect chord edits that have not
 * been saved to the project yet. The comparison is intentionally independent
 * of the editor's dirty flag.
 */

/**
 * Return true when the current chord buffer differs from its saved snapshot.
 * Section changes and selection changes are outside this comparison.
 */
export function hasSectionCodeEdits(buffer, savedChords) {
  if (!Array.isArray(buffer) || !Array.isArray(savedChords)) return true;
  return JSON.stringify(buffer) !== JSON.stringify(savedChords);
}
