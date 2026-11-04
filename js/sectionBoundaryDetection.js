/**
 * Section boundary detection (pure functions).
 *
 * Input : chord segments + bar (measure) time intervals.
 * Output: candidate boundary bar indices (0-based; bar 0 is never a boundary).
 *
 * This module only proposes candidates. It never touches Section data, the
 * editor session, or any I/O. Accuracy on unseen songs is limited (see
 * docs/section-auto-mvp-design.md): every result must be confirmed by the user.
 *
 * Port of the offline Python prototype (11-song evaluation). Keep the numeric
 * behavior identical; changing it requires bumping SECTION_BOUNDARY_ALGORITHM_VERSION.
 */

export const SECTION_BOUNDARY_ALGORITHM_VERSION = 'sbd-0.1';

const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

/** Reduce a chord name to root + minor flag ("Cmaj7/E" -> "C", "F#m7" -> "F#m"). 'N' -> null. */
export function simplifyChord(name) {
  if (typeof name !== 'string' || name === 'N') return null;
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  if (!m) return null;
  const quality = m[2].split('/')[0];
  const minor = quality.startsWith('m') && !quality.startsWith('maj');
  return (FLAT_TO_SHARP[m[1]] ?? m[1]) + (minor ? 'm' : '');
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function cosine(a, b) {
  const d = Math.sqrt(dot(a, a)) * Math.sqrt(dot(b, b));
  return d > 0 ? dot(a, b) / d : 0;
}

/**
 * Time-weighted, L2-normalized chord vector per bar.
 * @param {Array<{chord:string,start:number,end:number}>} chords
 * @param {Array<{start:number,end:number}>} intervals - one per bar
 * @returns {number[][]}
 */
export function buildBarVectors(chords, intervals) {
  const simplified = chords.map(c => simplifyChord(c.chord));
  const keys = [...new Set(simplified.filter(k => k !== null))].sort();
  const index = new Map(keys.map((k, i) => [k, i]));
  const vectors = intervals.map(() => new Array(keys.length).fill(0));
  chords.forEach((c, ci) => {
    const k = simplified[ci];
    if (k === null) return;
    intervals.forEach((iv, b) => {
      const overlap = Math.min(c.end, iv.end) - Math.max(c.start, iv.start);
      if (overlap > 0) vectors[b][index.get(k)] += overlap;
    });
  });
  return vectors.map(v => {
    const n = Math.sqrt(dot(v, v));
    return n > 0 ? v.map(x => x / n) : v;
  });
}

/** 1 - mean cosine between the W bars before and after each bar. */
export function sequenceNovelty(V, W) {
  const n = V.length;
  const s = new Array(n).fill(0);
  for (let b = 1; b < n; b++) {
    const w = Math.min(W, b, n - b);
    if (w < 2) continue;
    let sum = 0;
    for (let i = 0; i < w; i++) sum += cosine(V[b - w + i], V[b + i]);
    s[b] = 1 - sum / w;
  }
  return s;
}

/** Best earlier match of the next L bars, minus 0.8 x the match one bar earlier. */
export function repeatScore(V, L = 4) {
  const n = V.length;
  const S = V.map(a => V.map(b => dot(a, b)));
  const s = new Array(n).fill(0);
  for (let b = 2; b < n - 1; b++) {
    const l = Math.min(L, n - b);
    if (l < 3) continue;
    let best = 0;
    for (let a = 0; a <= b - L; a++) {
      let fwd = 0;
      for (let i = 0; i < l; i++) fwd += S[a + i][b + i];
      fwd /= l;
      const prev = a > 0 ? S[a - 1][b - 1] : 0;
      best = Math.max(best, fwd - 0.8 * Math.max(0, prev));
    }
    s[b] = best;
  }
  return s;
}

function normalizeByMax(x) {
  const m = Math.max(...x, 0);
  return m > 0 ? x.map(v => v / m) : x;
}

/** Python-compatible round(): halves go to the even neighbor. */
function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

// Scores are compared at 1e-9 resolution so float noise cannot reorder near-ties;
// exact/near ties go to the smaller bar index (deterministic across runtimes).
const tieKey = v => Math.floor(v * 1e9 + 0.5);

function pickTop(score, k, minDistance) {
  const order = score.map((_, i) => i)
    .sort((a, b) => tieKey(score[b]) - tieKey(score[a]) || a - b);
  const picked = [];
  for (const b of order) {
    if (b < 2 || score[b] <= 0) continue;
    if (picked.every(x => Math.abs(b - x) >= minDistance)) picked.push(b);
    if (picked.length >= k) break;
  }
  return picked.sort((a, b) => a - b);
}

/**
 * Detect boundary candidates.
 * @returns {{ algorithmVersion:string, barCount:number, bars:number[], diagnostics:object[] }}
 *   diagnostics are objective facts only (no probability / confidence score).
 */
export function detectSectionBoundaries(chords, intervals, { minDistance = 8 } = {}) {
  const V = buildBarVectors(chords, intervals);
  const n = V.length;
  const nov8 = sequenceNovelty(V, 8);
  const nov4 = sequenceNovelty(V, 4);
  const n8 = normalizeByMax(nov8);
  const n4 = normalizeByMax(nov4);
  const nr = normalizeByMax(repeatScore(V));
  const score = n8.map((v, i) => v + n4[i] + nr[i]);
  const bars = pickTop(score, Math.max(3, roundHalfEven(n / 14)), minDistance);

  const diagnostics = bars.map((bar, i) => {
    const previous = i === 0 ? 0 : bars[i - 1];
    const span = bar - previous;
    return {
      bar,
      changeAround4Bars: Number(nov4[bar].toFixed(3)), // 0 (same) .. 1 (completely different)
      barsFromPrevious: span,
      alignedTo4or8: span % 4 === 0,
    };
  });
  return { algorithmVersion: SECTION_BOUNDARY_ALGORITHM_VERSION, barCount: n, bars, diagnostics };
}

/**
 * Input-quality hint: bars whose length differs from the median bar length by
 * more than `tolerance` (default 30%). The first and last bars are ignored
 * (pickup / song end). A rough guide only; the threshold is not validated.
 */
export function measureIrregularity(intervals, { tolerance = 0.3 } = {}) {
  const inner = intervals.slice(1, -1).map(iv => iv.end - iv.start);
  if (inner.length === 0) return { medianSeconds: null, irregularCount: 0, total: 0 };
  const sorted = [...inner].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const irregularCount = inner.filter(d => Math.abs(d - median) > median * tolerance).length;
  return { medianSeconds: median, irregularCount, total: inner.length };
}
