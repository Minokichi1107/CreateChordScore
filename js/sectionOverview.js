/**
 * Phase150 Stage2 — Section overview projection.
 *
 * Pure, read-only projection from the shared Draft and timing model.
 * All calculations use real values; view values are presentation-only.
 */
import {
  diagnoseDraftSections,
  orderedValidSections,
} from './sectionReconfiguration.js';
import {
  detectPickupMeasure,
  getDisplayMeasureNumber,
} from './chartmode.js';

export const SECTION_OVERVIEW_START_SNAP_TOL = 0.25;
export const SECTION_OVERVIEW_BREAKDOWN_TOL = 0.25;
const EPS = 1e-9;

const FRACTION_CANDIDATES = [
  { value: 0, numerator: 0, denominator: 1 },
  { value: 1 / 5, numerator: 1, denominator: 5 },
  { value: 1 / 4, numerator: 1, denominator: 4 },
  { value: 1 / 3, numerator: 1, denominator: 3 },
  { value: 2 / 5, numerator: 2, denominator: 5 },
  { value: 1 / 2, numerator: 1, denominator: 2 },
  { value: 3 / 5, numerator: 3, denominator: 5 },
  { value: 2 / 3, numerator: 2, denominator: 3 },
  { value: 3 / 4, numerator: 3, denominator: 4 },
  { value: 4 / 5, numerator: 4, denominator: 5 },
  { value: 1, numerator: 1, denominator: 1 },
];

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function beatMapper(beats) {
  if (!Array.isArray(beats) || beats.length < 2) return null;
  for (let i = 0; i < beats.length; i++) {
    if (!finite(beats[i])) return null;
    if (i > 0 && beats[i] <= beats[i - 1]) return null;
  }

  return time => {
    if (!finite(time)) return null;
    const last = beats.length - 1;

    if (time < beats[0]) {
      const interval = beats[1] - beats[0];
      const distance = (beats[0] - time) / interval;
      if (distance > 2 + EPS) return null;
      return { value: (time - beats[0]) / interval, extrapolated: true };
    }

    if (time > beats[last]) {
      const interval = beats[last] - beats[last - 1];
      const distance = (time - beats[last]) / interval;
      if (distance > 2 + EPS) return null;
      return { value: last + (time - beats[last]) / interval, extrapolated: true };
    }

    let lo = 0;
    let hi = last;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (beats[mid] <= time) lo = mid;
      else hi = mid;
    }
    if (Math.abs(time - beats[hi]) <= EPS) return { value: hi, extrapolated: false };
    if (Math.abs(time - beats[lo]) <= EPS) return { value: lo, extrapolated: false };
    const ratio = (time - beats[lo]) / (beats[hi] - beats[lo]);
    return { value: lo + ratio, extrapolated: false };
  };
}

function nearestFractionMatch(value) {
  let best = null;
  for (const candidate of FRACTION_CANDIDATES) {
    const distance = Math.abs(value - candidate.value);
    if (
      !best
      || distance < best.distance - EPS
      || (
        Math.abs(distance - best.distance) <= EPS
        && (
          candidate.denominator < best.candidate.denominator
          || (
            candidate.denominator === best.candidate.denominator
            && candidate.value < best.candidate.value
          )
        )
      )
    ) {
      best = { candidate, distance };
    }
  }
  return best ?? { candidate: FRACTION_CANDIDATES[0], distance: 0 };
}

function nearestFraction(value) {
  return nearestFractionMatch(value).candidate;
}

/**
 * Display beat lengths truncated to one decimal place.
 * This is presentation-only; the underlying beat values remain unchanged.
 */
function formatSectionBeatValueDetails(value) {
  if (!finite(value)) return { text: '—' };
  const sign = value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  const truncated = Math.trunc(absolute * 10 + EPS) / 10;
  const text = truncated.toFixed(1).replace(/\.0$/, '');
  return { text: `${sign}${text}` };
}

export function formatSectionBeatValue(value) {
  return formatSectionBeatValueDetails(value).text;
}

function formatBeatOrdinal(position) {
  if (!finite(position)) return '—';
  let whole = Math.floor(position + EPS);
  const fraction = position - whole;
  const nearest = nearestFraction(fraction);
  if (nearest.value >= 1 - EPS) whole += 1;
  const ordinal = whole + 1;
  const sign = ordinal < 0 ? '−' : '';
  const fractionText = nearest.value <= EPS || nearest.value >= 1 - EPS
    ? ''
    : `と${nearest.numerator}/${nearest.denominator}`;
  return `${sign}${Math.abs(ordinal)}${fractionText}`;
}

function formatSeconds(seconds) {
  if (!finite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `約${total}秒`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `約${minutes}分${String(rest).padStart(2, '0')}秒`;
}

function getMeasures(timing) {
  if (Array.isArray(timing?.measures)) return timing.measures;
  const model = timing?.model;
  if (!model || !Number.isInteger(model.measureCount) || typeof model.getMeasure !== 'function') return [];
  const result = [];
  for (let i = 0; i < model.measureCount; i++) {
    const measure = model.getMeasure(i);
    if (measure) result.push({ ...measure, index: i });
  }
  return result;
}

function resolveMeasureContext(time, timing, measures, beatAt, isPickup, snapTol) {
  if (!finite(time) || !timing?.model || !measures.length || typeof beatAt !== 'function') {
    return { label: '—', estimated: false };
  }
  const bTime = beatAt(time);
  if (!bTime) return { label: '—', estimated: false };

  const boundaries = [];
  for (let i = 0; i < measures.length; i++) {
    const measure = measures[i];
    if (!finite(measure?.startTime)) continue;
    const b = beatAt(measure.startTime);
    if (b) boundaries.push({ time: measure.startTime, beat: b.value, measureIndex: i, extrapolated: b.extrapolated });
  }
  const lastMeasure = measures[measures.length - 1];
  if (finite(lastMeasure?.endTime)) {
    const b = beatAt(lastMeasure.endTime);
    if (b && (!boundaries.length || b.value > boundaries[boundaries.length - 1].beat + EPS)) {
      boundaries.push({
        time: lastMeasure.endTime,
        beat: b.value,
        measureIndex: measures.length,
        extrapolated: b.extrapolated,
      });
    }
  }

  let nearest = null;
  for (const boundary of boundaries) {
    const distance = Math.abs(bTime.value - boundary.beat);
    if (!nearest || distance < nearest.distance) nearest = { ...boundary, distance };
  }
  if (nearest && nearest.distance <= snapTol + EPS) {
    const number = getDisplayMeasureNumber(nearest.measureIndex, isPickup);
    const estimated = bTime.extrapolated || nearest.extrapolated;
    return {
      label: `${estimated ? '約 ' : ''}小節${number}・1拍目`,
      estimated,
    };
  }

  const modelPosition = timing.model.getContinuousMeasurePosition?.(time);
  let measureIndex = Number.isInteger(modelPosition?.measureIndex)
    ? modelPosition.measureIndex
    : -1;
  if (measureIndex < 0 || measureIndex >= measures.length) {
    measureIndex = measures.findIndex(m => finite(m?.startTime) && finite(m?.endTime)
      && time >= m.startTime && time < m.endTime);
  }
  if (measureIndex < 0) {
    if (time < measures[0].startTime) measureIndex = 0;
    else measureIndex = measures.length - 1;
  }

  const measure = measures[measureIndex];
  const bMeasureStart = beatAt(measure?.startTime);
  if (!bMeasureStart) return { label: '—', estimated: bTime.extrapolated };
  const beatWithinMeasure = bTime.value - bMeasureStart.value;
  const inside = finite(measure?.startTime) && finite(measure?.endTime)
    && time >= measure.startTime - EPS && time < measure.endTime - EPS;
  const estimated = bTime.extrapolated || bMeasureStart.extrapolated || !inside;
  const number = getDisplayMeasureNumber(measureIndex, isPickup);
  return {
    label: `${estimated ? '約 ' : ''}小節${number}・${formatBeatOrdinal(beatWithinMeasure)}拍目`,
    estimated,
  };
}

function measureBoundaries(measures, beatAt) {
  const result = [];
  for (let i = 0; i < measures.length; i++) {
    const time = measures[i]?.startTime;
    if (!finite(time)) continue;
    const beat = beatAt(time);
    if (!beat) continue;
    if (result.length && beat.value <= result[result.length - 1].beat + EPS) continue;
    result.push({ beat: beat.value, measureIndex: i });
  }
  const last = measures[measures.length - 1];
  if (finite(last?.endTime)) {
    const beat = beatAt(last.endTime);
    if (beat && (!result.length || beat.value > result[result.length - 1].beat + EPS)) {
      result.push({ beat: beat.value, measureIndex: measures.length });
    }
  }
  return result;
}

function nearestBoundaryIndex(boundaries, value, tolerance) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < boundaries.length; i++) {
    const distance = Math.abs(value - boundaries[i].beat);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestDistance <= tolerance + EPS ? bestIndex : -1;
}

/** Apply the same boundary tolerance to the displayed beat total and bar breakdown. */
function snapBeatToBoundary(value, boundaries, tolerance) {
  if (!finite(value)) return null;
  const index = nearestBoundaryIndex(boundaries, value, tolerance);
  return index >= 0 ? boundaries[index].beat : value;
}

function calculateMeasureBreakdown(bStart, bEnd, measures, beatAt, tolerance) {
  const empty = { leadBeats: null, fullMeasures: null, tailBeats: null };
  if (!finite(bStart) || !finite(bEnd) || bEnd <= bStart || !measures.length) return empty;
  const boundaries = measureBoundaries(measures, beatAt);
  if (boundaries.length < 2) return empty;

  const alignedStart = nearestBoundaryIndex(boundaries, bStart, tolerance);
  const alignedEnd = nearestBoundaryIndex(boundaries, bEnd, tolerance);
  let startBoundaryIndex = alignedStart >= 0
    ? alignedStart
    : boundaries.findIndex(boundary => boundary.beat > bStart + EPS);
  let endBoundaryIndex = alignedEnd >= 0
    ? alignedEnd
    : -1;
  if (endBoundaryIndex < 0) {
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (boundaries[i].beat < bEnd - EPS) {
        endBoundaryIndex = i;
        break;
      }
    }
  }
  if (startBoundaryIndex < 0 || endBoundaryIndex < 0 || endBoundaryIndex < startBoundaryIndex) return empty;

  const leadBeats = alignedStart >= 0 ? 0 : Math.max(0, boundaries[startBoundaryIndex].beat - bStart);
  const tailBeats = alignedEnd >= 0 ? 0 : Math.max(0, bEnd - boundaries[endBoundaryIndex].beat);
  const fullMeasures = Math.max(0, endBoundaryIndex - startBoundaryIndex);
  return { leadBeats, fullMeasures, tailBeats };
}

function makeLengthLabels(totalBeats, breakdown) {
  if (!finite(totalBeats)) return { lengthLabel: '—', lengthSub: null };
  const formatted = formatSectionBeatValueDetails(totalBeats);
  const total = `${formatted.text}拍`;
  const { leadBeats, fullMeasures, tailBeats } = breakdown;
  if (!finite(leadBeats) || !Number.isInteger(fullMeasures) || !finite(tailBeats)) {
    return { lengthLabel: total, lengthSub: null };
  }

  if (fullMeasures > 0) {
    return { lengthLabel: `${fullMeasures}小節`, lengthSub: `(${total})` };
  }
  return { lengthLabel: total, lengthSub: null };
}

function getSectionTimes(section, startIdx, endIdx, buffer) {
  if (startIdx < 0 || endIdx < startIdx || endIdx >= buffer.length) {
    return { tStart: null, tEnd: null };
  }
  const tStart = buffer[startIdx]?.start;
  const tEnd = endIdx === buffer.length - 1
    ? buffer[endIdx]?.end
    : buffer[endIdx + 1]?.start;
  return {
    tStart: finite(tStart) ? tStart : null,
    tEnd: finite(tEnd) ? tEnd : null,
  };
}

function buildInvalidRow(diag) {
  return {
    draftIndex: diag.index,
    id: diag.id,
    name: diag.section?.name ?? '',
    type: diag.section?.type ?? '',
    status: 'invalid',
    real: {
      startIdx: diag.start,
      endIdx: diag.end,
      tStart: null,
      tEnd: null,
      seconds: null,
      bStart: null,
      bEnd: null,
      totalBeats: null,
      measures: { leadBeats: null, fullMeasures: null, tailBeats: null },
    },
    view: { startLabel: '—', lengthLabel: '—', lengthSub: null, secondsLabel: '—' },
    compare: null,
  };
}

/**
 * Build the read-only Stage2 overview projection.
 *
 * timing: { model, measures?, beats, isPickup? }
 * opts: { startSnapTol=0.25, breakdownTol=0.25 }
 */
export function buildSectionOverview(draft, buffer, timing, opts = {}) {
  const safeBuffer = Array.isArray(buffer) ? buffer : [];
  const sections = Array.isArray(draft?.sections) ? draft.sections : [];
  const startSnapTol = finite(opts.startSnapTol) ? Math.max(0, opts.startSnapTol) : SECTION_OVERVIEW_START_SNAP_TOL;
  const breakdownTol = finite(opts.breakdownTol) ? Math.max(0, opts.breakdownTol) : SECTION_OVERVIEW_BREAKDOWN_TOL;
  const measures = getMeasures(timing);
  const beatAt = beatMapper(timing?.beats);
  const isPickup = typeof timing?.isPickup === 'boolean'
    ? timing.isPickup
    : detectPickupMeasure(measures);
  const diagnostics = diagnoseDraftSections({ sections }, safeBuffer);
  const validRows = orderedValidSections(sections, safeBuffer, diagnostics);
  const invalidRows = diagnostics
    .filter(row => !row.structurallyValid)
    .map(buildInvalidRow);

  const rows = validRows.map(diag => {
    const { startIdx, endIdx } = { startIdx: diag.start, endIdx: diag.end };
    const { tStart, tEnd } = getSectionTimes(diag.section, startIdx, endIdx, safeBuffer);
    const seconds = finite(tStart) && finite(tEnd) && tEnd > tStart ? tEnd - tStart : null;
    const startBeat = beatAt && finite(tStart) ? beatAt(tStart) : null;
    const endBeat = beatAt && finite(tEnd) ? beatAt(tEnd) : null;
    const bStart = startBeat?.value ?? null;
    const bEnd = endBeat?.value ?? null;
    const boundaries = typeof beatAt === 'function' ? measureBoundaries(measures, beatAt) : [];
    const totalBeats = finite(bStart) && finite(bEnd) && bEnd > bStart ? bEnd - bStart : null;
    const displayBStart = snapBeatToBoundary(bStart, boundaries, breakdownTol);
    const displayBEnd = snapBeatToBoundary(bEnd, boundaries, breakdownTol);
    const displayTotalBeats = finite(displayBStart) && finite(displayBEnd) && displayBEnd > displayBStart
      ? displayBEnd - displayBStart
      : null;
    const breakdown = calculateMeasureBreakdown(bStart, bEnd, measures, beatAt, breakdownTol);
    const startPosition = resolveMeasureContext(tStart, timing, measures, beatAt, isPickup, startSnapTol);
    const labels = makeLengthLabels(displayTotalBeats, breakdown);
    const lengthLabel = totalBeats == null ? '—' : labels.lengthLabel;
    const lengthSub = labels.lengthSub;

    return {
      draftIndex: diag.index,
      id: diag.id,
      name: diag.section?.name ?? '',
      type: diag.section?.type ?? '',
      status: diag.complete ? 'ok' : 'incomplete',
      real: {
        startIdx,
        endIdx,
        tStart,
        tEnd,
        seconds,
        bStart,
        bEnd,
        totalBeats,
        measures: breakdown,
      },
      view: {
        startLabel: startPosition.label,
        lengthLabel,
        lengthSub,
        secondsLabel: formatSeconds(seconds),
      },
      compare: null,
    };
  });

  // Detect adjacency gaps / overlaps without changing Draft order or boundaries.
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1];
    const current = rows[i];
    if (current.real.startIdx <= previous.real.endIdx) {
      previous.status = 'overlap';
      current.status = 'overlap';
    } else if (current.real.startIdx > previous.real.endIdx + 1 && previous.status !== 'overlap') {
      previous.status = 'gap-after';
    }
  }
  if (rows.length && rows[rows.length - 1].real.endIdx < safeBuffer.length - 1) {
    const last = rows[rows.length - 1];
    if (last.status !== 'overlap') last.status = 'gap-after';
  }

  // Compare only exact category keys and only real, computable beat lengths.
  const maxima = new Map();
  for (const row of rows) {
    if (typeof row.type !== 'string' || !row.type.trim() || !finite(row.real.totalBeats)) continue;
    maxima.set(row.type, Math.max(maxima.get(row.type) ?? 0, row.real.totalBeats));
  }
  for (const row of rows) {
    const max = maxima.get(row.type);
    if (typeof row.type === 'string' && row.type.trim() && finite(max) && max > 0 && finite(row.real.totalBeats)) {
      row.compare = { groupKey: row.type, ratio: row.real.totalBeats / max };
    }
  }

  return { rows, invalidRows };
}

/**
 * Resolve the first N chords of a Section into a playable time range.
 * Returns null when the Section or chord timing is not usable.
 */
export function getSectionPreviewRange(row, buffer, chordCount = 4) {
  const safeBuffer = Array.isArray(buffer) ? buffer : [];
  const startIdx = row?.real?.startIdx;
  const sectionEndIdx = row?.real?.endIdx;
  if (!Number.isInteger(startIdx) || !Number.isInteger(sectionEndIdx) ||
      startIdx < 0 || sectionEndIdx < startIdx || sectionEndIdx >= safeBuffer.length) {
    return null;
  }
  const count = Number.isFinite(chordCount)
    ? Math.max(1, Math.min(8, Math.round(chordCount)))
    : 4;
  const endIdx = Math.min(sectionEndIdx, startIdx + count - 1);
  const startSec = safeBuffer[startIdx]?.start;
  const lastChord = safeBuffer[endIdx];
  const endSec = lastChord?.end ?? lastChord?.start;
  if (!finite(startSec) || !finite(endSec) || endSec <= startSec) return null;
  return {
    startIdx,
    endIdx,
    startSec,
    endSec,
    chordCount: endIdx - startIdx + 1,
  };
}

/** Pure merge eligibility check for a Section card. */
export function canMergeWithPrevious(draft, buffer, sectionId) {
  const sections = Array.isArray(draft?.sections) ? draft.sections : [];
  const matches = [];
  sections.forEach((section, index) => {
    if (section?.id === sectionId) matches.push(index);
  });
  if (matches.length !== 1) return { ok: false, reason: 'invalid' };
  const sectionIndex = matches[0];
  const diagnostics = diagnoseDraftSections({ sections }, buffer);
  const current = diagnostics[sectionIndex];
  if (!current?.structurallyValid) return { ok: false, reason: 'invalid' };

  const ordered = orderedValidSections(sections, buffer, diagnostics);
  const position = ordered.findIndex(row => row.index === sectionIndex);
  if (position <= 0) return { ok: false, reason: 'no-prev' };
  const previous = ordered[position - 1];
  if (current.start <= previous.end) return { ok: false, reason: 'overlap' };
  if (current.start !== previous.end + 1) return { ok: false, reason: 'gap' };
  return { ok: true, prevId: previous.id };
}

/** Compare Section snapshots by stable ID and the B.9 signature fields. */
export function diffSections(before, after) {
  const signature = section => JSON.stringify([
    section?.type ?? null,
    section?.name ?? null,
    section?.startChordId ?? null,
    section?.endChordId ?? null,
  ]);
  const beforeMap = new Map((Array.isArray(before) ? before : []).filter(s => s?.id).map(s => [s.id, signature(s)]));
  const afterMap = new Map((Array.isArray(after) ? after : []).filter(s => s?.id).map(s => [s.id, signature(s)]));
  const added = [];
  const changed = [];
  const removed = [];
  for (const [id, sig] of afterMap) {
    if (!beforeMap.has(id)) added.push(id);
    else if (beforeMap.get(id) !== sig) changed.push(id);
  }
  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) removed.push(id);
  }
  return { added, changed, removed };
}
