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
 * 【normalize pipeline】
 *   raw.chords
 *     ↓ sanitizeChords()   入力整形（null除去・数値補正）
 *     ↓ normalizeChordName() 意味変換（replacementMap適用）
 *     ↓ analysis.chords    UI/timing/chartが参照
 *   raw は不変。normalizeルール変更時も raw から再生成可能。
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
// replacementMap（chord名正規化辞書）
// ────────────────────────────────────────

/**
 * replacementMap
 *
 * resource/analysis/replacementMap.json を fetch して返す。
 * fetch は loadAnalysis() 呼び出し時に行う（lazy loading）。
 * 失敗した場合は空オブジェクト（normalize スキップ）。
 *
 * @returns {Promise<object>}
 */
async function fetchReplacementMap() {
  try {
    const res = await fetch('/resource/analysis/replacementMap.json');
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// module-level cache（同一セッション内で再 fetch しない）
let _replacementMap = null;

/**
 * normalizeChordName
 *
 * replacementMap を使って chord 名を正規化する。
 * - replacementMap に存在する → 置換後の名前を返す
 * - 存在しない → 元の名前をそのまま返す
 *
 * sanitize（入力整形）とは分離した責務。
 * sanitize: null除去・数値補正
 * normalize: 意味変換（非正規表記 → 正規表記）
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeChordName(name) {
  if (!_replacementMap) return name;
  return _replacementMap[name] ?? name;
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

      return { chord: normalizeChordName(item.chord), start, end, confidence };
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

// ────────────────────────────────────────
// timing pipeline（normalized cache 生成用）
// ────────────────────────────────────────
// [OWNERSHIP] buildNormalizedTimingAnalysis は timing.js の純関数。
// loadAnalysis() がここで呼ぶことで、
// normalized は project.analysis に1度だけ生成・格納される。
// chartmode.js / 将来の consumer は再計算せず normalized を受け取るだけ。
import { buildNormalizedTimingAnalysis } from './timing.js';

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
 * 【戻り値の層構造】
 *   raw:        persisted canonical source（serialize 対象）
 *   normalized: runtime-only derived cache（serialize 禁止）
 *   その他:     sanitize / normalize 済み参照フィールド
 *
 * 【normalized の invalidate 条件】
 *   - analysis 再読込（このファイルの呼び出し）
 *   - repair policy 変更
 *   - 将来の manual timing edit
 *   capo 変更 / chart open/close では rebuild 不要（capo 非依存）
 *
 * 【Phase72-B: repairRule】
 *   repairRule はユーザーが指定した手動タイミング補正の「意図」
 *   （{ version, type:'anchorDownbeat', beatTime } または null）。
 *   raw と同じ階層（analysis.repairRule）で受け取り、戻り値にも
 *   そのまま含める。normalized（disposable derived cache）とは
 *   別物として扱う（混同しないこと）。
 *   実際に repairRule を適用して measures を再構築するのは
 *   chartmode.js が createTimingModel() を呼ぶ際の責務であり、
 *   このファイルでは運ぶだけで、解釈・適用は行わない。
 *
 * @param {*} analysis - data.analysis（analysis.raw / repairRule を持つオブジェクト）または raw 直接
 * @returns {object|null}
 */
export async function loadAnalysis(analysis) {
  // replacementMap を初期化（初回のみ fetch）
  if (_replacementMap === null) {
    _replacementMap = await fetchReplacementMap();
  }

  // ── structural check ──────────────────
  // analysis 自体がない → null（beat解析未実行等、正常ケースを含む）
  if (!analysis) return null;

  const raw = analysis.raw;

  // raw が存在しない → null
  if (!raw || typeof raw !== 'object') return null;

  // chords が array でない → 致命的破損 → null
  if (!Array.isArray(raw.chords)) return null;

  // Phase72-B: repairRule をそのまま運ぶ（解釈はしない）。
  // 型不一致・欠損は null に正規化する（呼び出し側の判定を単純にするため）。
  const repairRule = (analysis.repairRule && typeof analysis.repairRule === 'object')
    ? analysis.repairRule
    : null;

  // ── bpm ──────────────────────────────
  // 0以下・非数値 → null（不明扱い）
  const bpm = typeof raw.bpm === 'number' && Number.isFinite(raw.bpm) && raw.bpm > 0
    ? raw.bpm
    : null;

  // ── normalize / sanitize ─────────────
  const timeSignature = normalizeTimeSignature(raw.timeSignature);
  const beats         = sanitizeTimestamps(raw.beats);
  const downbeats     = sanitizeTimestamps(raw.downbeats);

  // ── normalized timing cache ───────────
  // [RUNTIME CACHE] deterministic derived cache。
  // NEVER persist / NEVER treat as source of truth。
  // capo 非依存。capo 変更では rebuild 不要。
  // rebuild 条件: analysis 再読込 / repair policy 変更 / 将来の manual timing edit のみ。
  //
  // [OWNERSHIP] normalized は repairRule を適用しない（Phase59のdrift repair結果のみ）。
  // repairRule（anchorDownbeat方式）の適用は chartmode.js が
  // createTimingModel() を呼ぶ際に行う（別の経路・別の関心事）。
  //
  // timing.js の buildNormalizedTimingAnalysis は analysis オブジェクト全体を受け取る。
  // sanitize 済みの { beats, downbeats, timeSignature, ... } を含むオブジェクトを渡す。
  const sanitizedAnalysis = { beats, downbeats, timeSignature,
    chords: sanitizeChords(raw.chords), bpm, meta: normalizeMeta(raw.meta) };
  const normalized = buildNormalizedTimingAnalysis(sanitizedAnalysis, { repair: false });

  return {
    // [PERSIST INVARIANT] raw = persisted canonical source。
    // loadProj() が analysis/{id}.json から復元する際の source of truth。
    // serialize は raw のみ行う（project.js serializeProject 参照）。
    raw,

    // [PERSIST INVARIANT] repairRule = ユーザーの意図。raw と同様に永続化対象。
    // normalized（disposable cache）とは別フィールド（Phase72-A確定の三層構造）。
    repairRule,

    // derived（sanitize 済み）— raw からの投影
    bpm,
    timeSignature,
    beats,
    downbeats,
    chords:     sanitizedAnalysis.chords,
    meta:       sanitizedAnalysis.meta,

    // [RUNTIME CACHE] normalized = deterministic derived cache。
    // chartmode.js / 将来の consumer はこれを受け取るだけ（再計算しない）。
    // NEVER persist / NEVER treat as source of truth。
    normalized,
  };
}

// ────────────────────────────────────────
// analysis persistence API
// ────────────────────────────────────────

/**
 * saveAnalysisFile
 *
 * analysis.raw を analysis/{projectId}.json として保存する。
 * 呼び出しタイミングは app.js（orchestration層）が決定する。
 * import時のみ呼ぶこと（loadAnalysis/autosave からは呼ばない）。
 *
 * 【Phase72-B: repairRule】
 *   repairRule はユーザーが指定した手動タイミング補正の「意図」
 *   （{ version, type:'anchorDownbeat', beatTime } または null）。
 *   raw とは別フィールドとして保存する（normalized とは混同しない）。
 *
 * 【再解析時の repairRule 破棄方針（確定）】
 *   既存呼び出し箇所（新規 import / 旧形式 migration）は
 *   repairRule 引数を渡さない（デフォルト null）。
 *   これにより「解析データを再インポートした場合、
 *   古い repairRule は自動的に破棄される」という運用が、
 *   呼び出し側の変更なしに実現される。
 *   理由: 解析データ（raw.beats）が変わった場合、
 *   古い anchor の beatTime が新しい raw.beats に
 *   存在しない可能性が高く、repair を引き継ぐ方が危険なため。
 *
 * @param {string} projectId
 * @param {object} raw                 - analysis.raw（不変の生データ）
 * @param {object|null} [repairRule]   - Phase72-B: ユーザーの手動補正の意図
 * @returns {Promise<boolean>} 成功:true / 失敗:false
 */
export async function saveAnalysisFile(projectId, raw, repairRule = null) {
  try {
    const payload = {
      version:     1,
      projectId,
      generatedAt: new Date().toISOString(),
      raw,
      repairRule,
    };
    const res = await fetch('/save-analysis', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * loadAnalysisFile
 *
 * analysis/{projectId}.json を読み込み、
 * projectId照合・version確認の上で { raw, repairRule } を返す。
 *
 * 【Phase72-B: 戻り値の形が変わった】
 *   旧: raw を直接返す
 *   新: { raw, repairRule } を返す（呼び出し箇所は1箇所のみ確認済み・app.js）
 *   repairRule は未保存（旧形式ファイル等）の場合 null になる。
 *
 * @param {string} projectId
 * @returns {Promise<{ raw: object, repairRule: object|null }|null>}
 *          null は missing・mismatch・破損
 */
export async function loadAnalysisFile(projectId) {
  try {
    const res = await fetch(`/analysis/${projectId}.json`);
    if (!res.ok) return null;          // missing → null（正常系）

    const data = await res.json();

    // version field 存在確認（migration準備）
    if (typeof data.version !== 'number') {
      console.warn('[analysisLoader] version field missing. migration may be needed.');
      // version なしでも読み込みは続行（Step4でmigration対応）
    }

    // raw 存在確認
    if (!data.raw || typeof data.raw !== 'object') return null;

    // repairRule: 旧形式ファイル（フィールド自体が無い）は null 扱い
    const repairRule = data.repairRule ?? null;

    return { raw: data.raw, repairRule };

  } catch {
    return null;                       // 破損・parse error → null
  }
}