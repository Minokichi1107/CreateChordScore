/**
 * Section code-buffer comparison helper.
 *
 * Used when Section reconfiguration starts to detect code edits that have not
 * been saved to the project yet. The comparison is intentionally independent
 * of the editor's dirty flag.
 */

/**
 * Return true when the current chord buffer differs from its saved snapshot.
 * Section changes and selection changes are outside this comparison.
 */
export function hasSectionGenerationCodeEdits(buffer, initialSnapshot) {
  if (!Array.isArray(buffer) || !Array.isArray(initialSnapshot)) return true;
  return JSON.stringify(buffer) !== JSON.stringify(initialSnapshot);
}
