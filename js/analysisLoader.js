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
 *   analysis.raw.sections  → セクション構造（verse / chorus 等・Phase103〜）
 *
 *     [OWNERSHIP]
 *     sections は ChordMini が生成した解析データではなく、
 *     ユーザーが定義する構造メタデータである。
 *
 *     永続化スキーマとの一貫性を優先し、analysis.raw に保持して保存するが、
 *     ownership は raw.chords / raw.beats / raw.downbeats とは異なる
 *     （保存場所＝raw、生成元＝User。両者は必ずしも一致しない）。
 *
 *   これらが追加されても本ファイルで normalize する経路は変わらない。
 *
 * 【normalize pipeline】（Phase84更新）
 *   raw.chords
 *     ↓ sanitizeChords()      入力整形（null除去・数値補正）
 *     ↓   └ toReadableChord() 意味変換（replacementMap適用・chords.js委譲）
 *     ↓ analysis.chords       UI/timing/chartが参照
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
// chords sanitize
// ────────────────────────────────────────
//
// [Phase84] replacementMapによるchord名変換（ChordMini生表記 → 人間向け表記）は
// chords.js の Representation Translation Layer（toReadableChord）へ委譲する。
// このファイルは以前ローカルに同名の normalizeChordName() を持っていたが、
// chords.js側の normalizeChordName()（alias統合。別の関心事）と紛らわしいため
// 廃止し、責務ごとに1つのAPIへ一本化した（Phase83で発覚した混同の教訓）。
// replacementMapのロード・Authorityは chords.js の loadReplacementMap()
// （app.js起動フローが呼ぶ）が持つ。このファイルはconsumerに徹する。

import { toReadableChord } from './chords.js';

/**
 * analysis.raw.chords を sanitize する（ingestion orchestration）。
 * readable translation は toReadableChord()（chords.js）に委譲する。
 * - 非配列 → []
 * - chord 文字列がない item を除去
 * - start / end: 非有限・負値 → 0 に補正
 * - start > end → swap して補正
 * - confidence: 0〜1 範囲外 → clamp
 *
 * @param {*} raw
 * @returns {{ chord: string, start: number, end: number, confidence: number }[]}
 */
export function sanitizeChords(raw) {
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

      const result = { chord: toReadableChord(item.chord), start, end, confidence };
      // _id は永続フィールド。既存値があれば引き継ぐ（sanitize段階では再付与しない）。
      if (typeof item._id === 'string') result._id = item._id;
      return result;
    });
}

// ────────────────────────────────────────
// chord _id マイグレーション（Phase74-C）
// ────────────────────────────────────────
/**
 * _ensureChordIds — chordイベントに永続IDを付与する
 *
 * [ID PERSISTENCE INVARIANT]
 * chord._id は永続フィールドである。一度付与したら保存対象とし、
 * 以後の読み込みでは既存の _id をそのまま使う（再採番しない）。
 * 旧形式（_id無し）のanalysisファイルはここで一度だけ自動付与する。
 *
 * 採番方式: 既存IDの最大値+1から連番を振る。
 * 欠番があっても気にしない（c001, c002, c004 → 次は c005）。
 *
 * @param {object[]} chords - sanitizeChords() 済みの配列
 * @returns {object[]} _id付きの配列
 */
function _ensureChordIds(chords) {
  // 既存の _id から最大の連番を取得（c003 → 3）
  let maxNum = 0;
  for (const c of chords) {
    if (typeof c._id === 'string') {
      const m = c._id.match(/^c(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }

  let nextNum = maxNum + 1;
  return chords.map(c => {
    if (c._id) return c;  // 既存IDはそのまま保持
    return { ...c, _id: `c${String(nextNum++).padStart(3, '0')}` };
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
  // [Phase84] replacementMapのロードは app.js 起動フローが loadReplacementMap()
  // （chords.js）で行う。このファイルはconsumer（toReadableChord経由）のため、
  // ここでの初期化は不要（未ロードでもtoReadableChord()が素通しでフェイルセーフする）。

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

  // ── normalize / sanitize ──────────────
  const timeSignature = normalizeTimeSignature(raw.timeSignature);
  const beats         = sanitizeTimestamps(raw.beats);
  const downbeats     = sanitizeTimestamps(raw.downbeats);

  // [MIGRATION] loadAnalysis() は旧analysisデータのマイグレーション責務を持つ。
  // _id は永続フィールドのため、sanitize（runtime view生成）とは別に
  // ここで raw.chords 自体を書き換える。以降 raw は _id 付きの canonical source として扱う。
  // [ID PERSISTENCE INVARIANT] 旧形式（_id無し）のanalysisファイルは
  // ここで一度だけ自動付与する（以後の保存で _id が永続化される）。
  raw.chords = _ensureChordIds(Array.isArray(raw.chords) ? raw.chords : []);

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

  // [DATA OWNERSHIP] 2系統のchordsが存在する。役割を混同しないこと。
  //
  // raw.chords      — 永続データ（source of truth）。_id付き。
  //                    Phase74-C 解析エディタの編集対象はこちら。
  //                    saveAnalysisFile() で永続化されるのもこちら。
  //
  // analysis.chords — sanitizeChords() 済みの runtime view（このreturn内の `chords:` フィールド）。
  //                    表示・計算用の派生データ。直接編集しない。
  //
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