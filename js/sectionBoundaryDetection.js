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

export const SECTION_BOUNDARY_ALGORITHM_VERSION = 'sbd-0.2';

/** Window sizes (bars) of the two sequence-novelty features. */
export const NOVELTY_WINDOWS = Object.freeze({ short: 4, long: 8 });

/**
 * Default peak-suppression radius (bars): half of the SHORT novelty window.
 * A boundary's score is computed from the bars around it (at least +-short/2 bars
 * overlap with its neighbours' windows), so neighbouring bars are smeared copies of the
 * same change. A bar is a candidate only if no bar within this radius scores higher.
 * This replaces the prototype's fixed 8-bar minimum spacing, which could not find
 * real short Sections (the 11 evaluation songs contain 4-9 bar Sections).
 */
export const DEFAULT_PEAK_RADIUS = NOVELTY_WINDOWS.short / 2;

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

/** Combined boundary score per bar (sum of three max-normalized features). */
export function computeBoundaryScores(V) {
  const n8 = normalizeByMax(sequenceNovelty(V, NOVELTY_WINDOWS.long));
  const n4 = normalizeByMax(sequenceNovelty(V, NOVELTY_WINDOWS.short));
  const nr = normalizeByMax(repeatScore(V));
  return n8.map((v, i) => v + n4[i] + nr[i]);
}

/** True if no bar within `radius` scores higher (plateaus: only the leftmost bar counts). */
function isLocalPeak(score, b, radius) {
  const here = tieKey(score[b]);
  for (let d = -radius; d <= radius; d++) {
    const j = b + d;
    if (d === 0 || j < 0 || j >= score.length) continue;
    const other = tieKey(score[j]);
    if (other > here || (other === here && j < b)) return false;
  }
  return true;
}

/**
 * Pick up to k boundary bars: highest scores first, each must be a local peak within
 * `peakRadius` bars (see DEFAULT_PEAK_RADIUS); optional extra `minDistance` (default: none).
 * Ties and near-ties (< 1e-9) go to the smaller bar index. Bars 0 and 1 are never boundaries.
 */
export function pickBoundaryPeaks(score, k, { peakRadius = DEFAULT_PEAK_RADIUS, minDistance = 1 } = {}) {
  const order = score.map((_, i) => i)
    .sort((a, b) => tieKey(score[b]) - tieKey(score[a]) || a - b);
  const picked = [];
  for (const b of order) {
    if (b < 2 || score[b] <= 0) continue;
    if (!isLocalPeak(score, b, peakRadius)) continue;
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
export function detectSectionBoundaries(chords, intervals, {
  peakRadius = DEFAULT_PEAK_RADIUS,
  minDistance = 1, // no extra spacing rule by default (1 = distinct bars only)
} = {}) {
  const V = buildBarVectors(chords, intervals);
  const n = V.length;
  const score = computeBoundaryScores(V);
  const nov4 = sequenceNovelty(V, NOVELTY_WINDOWS.short);
  const bars = pickBoundaryPeaks(score, Math.max(3, roundHalfEven(n / 14)), { peakRadius, minDistance });

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
