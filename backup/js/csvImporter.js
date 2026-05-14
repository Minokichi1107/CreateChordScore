// ════════════════════════════════════════
// CSV IMPORTER - CSV/JSONパーサー
// ════════════════════════════════════════

// ────────────────────────────────────────
// CSV解析
// ────────────────────────────────────────
export function parseCSV(text, normChordFn) {
  const lines = text.split('\n');
  const chords = [];
  const times = [];
  let prev = null;

  for (const line of lines) {
    const parts = line.trim().split(',');
    if (parts.length < 2) continue;

    const time = parseFloat(parts[0]);
    if (isNaN(time)) continue;

    const chord = normChordFn(parts[1].trim());
    if (chord !== prev) {
      chords.push(chord);
      times.push(time);
      prev = chord;
    }
  }

  return {
    chords,
    times,
    duration: times[times.length - 1] + 2 || 0
  };
}

// ────────────────────────────────────────
// JSON解析
// ────────────────────────────────────────
export function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}
