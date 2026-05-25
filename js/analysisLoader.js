/**
 * ════════════════════════════════════════
 * analysisLoader.js — Analysis Ingestion / Normalization Layer
 * ════════════════════════════════════════
 *
 * 【責務】
 *   外部解析データ（analysis.raw）を
 *   UIが安全に使える project.analysis 構造へ変換する。
 *
 * 【設計原則】
 *   - 外部データは信用しない（sanitize-first）
 *   - 可能な限り救済する（致命的破損のみ null 返却）
 *   - UIは絶対クラッシュさせない
 *   - Chart Mode 専用にしない（playback / beat snap / timeline 等も参照する）
 *
 * 【層構造】
 *   tools/chordmini_fetch.py  → 外部解析取得
 *   analysis.raw              → 永続化された生データ
 *   analysisLoader.js         → validate / sanitize / normalize（このファイル）
 *   project.analysis          → UI安全構造
 *   Chart Mode / Playback等   → 参照・表示
 *
 * 【拡張予定】
 *   analysis.raw.lyrics    → 歌詞アライメント
 *   analysis.raw.sections  → セクション構造（verse / chorus 等）
 *   これらが追加されても本ファイルで normalize する経路は変わらない。
 *
 * 【呼び出し元】
 *   app.js の loadChordData() 内で
 *   project.analysis = loadAnalysis(data.analysis) として使用する。
 */

// ────────────────────────────────────────
// timeSignature normalize
// ────────────────────────────────────────

/**
 * timeSignature 文字列を { numerator, denominator } に変換する。
 *
 * @param {*} raw - "4/4" / "3/4" / "6/8" 等、または null / undefined / 異常値
 * @returns {{ numerator: number, denominator: number }}
 */
function normalizeTimeSignature(raw) {
  const FALLBACK = { numerator: 4, denominator: 4 };

  if (!raw || typeof raw !== 'string') return FALLBACK;

  const parts = raw.split('/');
  if (parts.length !== 2) return FALLBACK;

  const numerator   = parseInt(parts[0], 10);
  const denominator = parseInt(parts[1], 10);

  if (
    !Number.isFinite(numerator)   || numerator   <= 0 ||
    !Number.isFinite(denominator) || denominator <= 0
  ) return FALLBACK;

  return { numerator, denominator };
}

// ────────────────────────────────────────
// beats / downbeats sanitize
// ────────────────────────────────────────

/**
 * タイムスタンプ配列を sanitize する。
 * - 非配列 → []
 * - null / 非数値 / 非有限値 / 負値 を除去
 * - sort（昇順）
 * - 重複除去
 *
 * @param {*} raw
 * @returns {number[]}
 */
function sanitizeTimestamps(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b)
    .filter((v, i, arr) => i === 0 || v !== arr[i - 1]); // dedupe
}

// ────────────────────────────────────────
// chords sanitize
// ────────────────────────────────────────

/**
 * analysis.raw.chords を sanitize する。
 * - 非配列 → []
 * - chord 文字列がない item を除去
 * - start / end: 非有限・負値 → 0 に補正
 * - start > end → swap して補正
 * - confidence: 0〜1 範囲外 → clamp
 *
 * @param {*} raw
 * @returns {{ chord: string, start: number, end: number, confidence: number }[]}
 */
function sanitizeChords(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(item => item && typeof item.chord === 'string' && item.chord.length > 0)
    .map(item => {
      let start = typeof item.start === 'number' && Number.isFinite(item.start)
        ? item.start : 0;
      let end   = typeof item.end   === 'number' && Number.isFinite(item.end)
        ? item.end   : 0;

      // 負値補正
      if (start < 0) start = 0;
      if (end   < 0) end   = 0;

      // start > end → swap
      if (start > end) [start, end] = [end, start];

      const confidence = typeof item.confidence === 'number' && Number.isFinite(item.confidence)
        ? Math.min(1, Math.max(0, item.confidence))
        : 0;

      return { chord: item.chord, start, end, confidence };
    });
}

// ────────────────────────────────────────
// meta normalize
// ────────────────────────────────────────

/**
 * meta フィールドを normalize する。
 * 欠損は空文字 / 0 で補完する。
 *
 * @param {*} raw
 * @returns {{ detector: string, totalBeats: number, totalDownbeats: number, processingTime: number }}
 */
function normalizeMeta(raw) {
  if (!raw || typeof raw !== 'object') {
    return { detector: '', totalBeats: 0, totalDownbeats: 0, processingTime: 0 };
  }
  return {
    detector:       typeof raw.detector       === 'string' ? raw.detector : '',
    totalBeats:     Number.isFinite(raw.totalBeats)     ? raw.totalBeats     : 0,
    totalDownbeats: Number.isFinite(raw.totalDownbeats) ? raw.totalDownbeats : 0,
    processingTime: Number.isFinite(raw.processingTime) ? raw.processingTime : 0,
  };
}

// ────────────────────────────────────────
// メインエントリ
// ────────────────────────────────────────

/**
 * loadAnalysis
 *
 * analysis オブジェクト（JSON上の data.analysis）を受け取り、
 * project.analysis として使える normalize 済み構造を返す。
 *
 * 致命的な構造破損の場合は null を返す。
 * 呼び出し元は null を許容すること（Chart Mode は null guard が必要）。
 *
 * @param {*} analysis - data.analysis（analysis.raw を持つオブジェクト）
 * @returns {object|null}
 */
export function loadAnalysis(analysis) {
  // ── structural check ──────────────────
  // analysis 自体がない → null（beat解析未実行等、正常ケースを含む）
  if (!analysis) return null;

  const raw = analysis.raw;

  // raw が存在しない → null
  if (!raw || typeof raw !== 'object') return null;

  // chords が array でない → 致命的破損 → null
  if (!Array.isArray(raw.chords)) return null;

  // ── bpm ──────────────────────────────
  // 0以下・非数値 → null（不明扱い）
  const bpm = typeof raw.bpm === 'number' && Number.isFinite(raw.bpm) && raw.bpm > 0
    ? raw.bpm
    : null;

  // ── normalize / sanitize ─────────────
  // [RAW-READONLY] raw は serialize 用に保持。Chart Mode 等は derived を参照すること。
  // 将来: derived: { bpm, beats, ... } namespace に移行予定（Phase40設計）
  return {
    raw,
    bpm,
    timeSignature: normalizeTimeSignature(raw.timeSignature),
    beats:         sanitizeTimestamps(raw.beats),
    downbeats:     sanitizeTimestamps(raw.downbeats),
    chords:        sanitizeChords(raw.chords),
    meta:          normalizeMeta(raw.meta),
  };
}