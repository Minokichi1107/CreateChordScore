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

/**
 * normalizeProvenance — raw.provenance を normalize する（Phase127）
 *
 * [SCOPE] データ来歴（Data Provenance）: このanalysisデータが
 *   ①自動解析のままか ②人間がコード・タイミングを手動修正したか
 *   ③人間がSection構成を手動編集したか ④外部資料（譜面サイト等）と
 *   照合済みか、を保持する。
 *
 * [PROVENANCE FACT INVARIANT]（Phase127-Fで適用範囲を修正）
 *   hasContentEdit のみが対象。「Commandがok:trueを返したか」ではなく
 *   「実際に値が変わったか」を記録する事実ベースのフラグであり、
 *   一度trueになったら、Undoを含めfalseへは戻さない（一方向フラグ）。
 *
 *   ただし、コードデータの再インポートは「一方向フラグの例外」ではなく、
 *   別の話として扱う。再インポートは「同じ解析データへの追記」ではなく
 *   「解析データそのものの世代交代」（既存のrepairRule破棄と同じ扱い。
 *   app.js loadChordData()参照）であり、Provenanceが対象とする
 *   「解析データ」自体が別のものに切り替わる。そのためhasContentEditは
 *   新しい世代に対して false から再出発する（詳細はapp.js側の
 *   contentEditBackfill関連コメント参照）。
 *
 *   hasStructureEditはこの原則の対象外（Phase127-Fで変更）。
 *   一方向フラグではなく、「今Sectionが存在するか」
 *   （raw.sections.length > 0）を保存の都度導出する値であり、
 *   Section作成→削除で0件に戻れば自動的にfalseへ戻る。
 *
 * [DEFAULT] 既存の analysis（provenance未記録）は「未記録状態」として
 *   扱う。「chordmini解析そのまま」と断定しない（過去に記録機構が
 *   無かった時代の手動修正が存在した可能性を否定しないため）。
 *
 * @param {*} raw
 * @returns {{ source: string, hasContentEdit: boolean, hasStructureEdit: boolean,
 *   externalCheck: { checked: boolean, reference: string, url: string, checkedAt: string|null, memo: string } }}
 */
function normalizeProvenance(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const ec = (r.externalCheck && typeof r.externalCheck === 'object') ? r.externalCheck : {};
  return {
    source: typeof r.source === 'string' ? r.source : 'chordmini',
    hasContentEdit:   r.hasContentEdit   === true,
    hasStructureEdit: r.hasStructureEdit === true,
    externalCheck: {
      checked:   ec.checked === true,
      reference: typeof ec.reference === 'string' ? ec.reference : '',
      url:       typeof ec.url       === 'string' ? ec.url       : '',
      checkedAt: typeof ec.checkedAt === 'string' ? ec.checkedAt : null,
      memo:      typeof ec.memo      === 'string' ? ec.memo      : '',
    },
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

  // [PROVENANCE][Phase127] 既存analysisにprovenanceが無い場合はここで
  // 「未記録状態」のデフォルト値を1度だけ付与する（_ensureChordIdsと同じ
  // 後付けマイグレーションパターン）。以後の保存でprovenanceが永続化される。
  raw.provenance = normalizeProvenance(raw.provenance);

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
 * @param {string|null} [baseVersion]
 *   [Phase127-F] 省略時（未指定・デフォルト）は無条件保存（従来通り）。
 *   通常の編集保存（saveAnalysisEdit等）はこの引数を渡さない。
 *   値を渡すと、サーバー側で「今のファイルの最終保存時刻」と比較し、
 *   一致した場合のみ保存する（既存曲の編集状況を確認する処理＝
 *   バックフィル専用の安全策・[BACKFILL NON-DESTRUCTIVE INVARIANT]）。
 * @returns {Promise<'ok'|'conflict'|'error'>}
 *   'ok'       保存成功
 *   'conflict' 読み込んだ後に他の保存が入っていたため、保存を見送った
 *              （古いデータは書き込んでいない）
 *   'error'    通信エラー等、本当の失敗
 */
export async function saveAnalysisFile(projectId, raw, repairRule = null, baseVersion = undefined) {
  try {
    const payload = {
      version:     1,
      projectId,
      generatedAt: new Date().toISOString(),
      raw,
      repairRule,
    };
    // [重要] 「引数を渡さなかった（undefined）」と「値がnull（バージョン不明）」
    // を区別する。前者は通常保存（チェック不要）、後者はバックフィルが
    // 古いファイル（generatedAtが存在しない）を読んだ場合であり、
    // 安全のため常に書き込みを拒否させる必要がある（サーバー側で判定）。
    if (baseVersion !== undefined) {
      payload.baseVersion = baseVersion; // null または文字列
    }
    const res = await fetch('/save-analysis', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (res.ok) return 'ok';
    if (res.status === 409) return 'conflict';
    return 'error';
  } catch {
    return 'error';
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

    return { raw: data.raw, repairRule, generatedAt: data.generatedAt ?? null };

  } catch {
    return null;                       // 破損・parse error → null
  }
}

// ────────────────────────────────────────
// Content Edit Backfill 比較ロジック（Phase127-F）
// ────────────────────────────────────────

/**
 * _EPSILON_SEC — 数値（start/end/beats/downbeats）比較時の許容誤差（秒）。
 *
 * [背景] JS(V8)↔Python(server.py)間のJSON往復では数値が完全一致することを
 * 実測済みだが、将来別ツール経由の丸め誤差に備えた安全マージンとして
 * 小さな許容誤差を設ける（厳密な0一致を要求しない）。
 */
const _EPSILON_SEC = 1e-6;

function _numbersEqual(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') return a === b;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) < _EPSILON_SEC;
}

/**
 * _asArray — 配列でなければ空配列とみなす正規化ヘルパー。
 *
 * [理由] raw.beats / raw.downbeats（あるいはchords）自体が未定義
 * （undefined・null）の場合を「差異なし（両方とも存在しない）」として
 * 扱うため。Array.isArrayの単純なfalse早期returnだと、両者ともundefined
 * のケースまで「不一致」と誤判定してしまう（Phase127-F単体テストで
 * 発見・修正）。
 */
function _asArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * _chordsEqual — chords配列の比較（Phase127-F専用）。
 *
 * [SCOPE] 比較対象は chord（コード名・文字列完全一致）・start・end のみ。
 * _id / confidence / meta 等は比較しない（ユーザーが意識しない内部情報の
 * ため。architecture.md [PROVENANCE FACT INVARIANT]周辺コメント参照）。
 *
 * 配列の順序はそのまま比較する（並べ替えない）。コード進行は時系列その
 * ものであり、順序自体が意味を持つため。
 *
 * @param {Array|undefined} a
 * @param {Array|undefined} b
 * @returns {boolean}
 */
function _chordsEqual(a, b) {
  const ax = _asArray(a), bx = _asArray(b);
  if (ax.length !== bx.length) return false;
  for (let i = 0; i < ax.length; i++) {
    const x = ax[i], y = bx[i];
    if (!x || !y) return false;
    if (x.chord !== y.chord) return false;
    if (!_numbersEqual(x.start, y.start)) return false;
    if (!_numbersEqual(x.end,   y.end))   return false;
  }
  return true;
}

/**
 * _numberArraysEqual — beats / downbeats配列の比較（Phase127-F専用）。
 * 配列の順序はそのまま比較する（時系列データのため）。
 * undefined/null は空配列として扱う（_asArray参照）。
 */
function _numberArraysEqual(a, b) {
  const ax = _asArray(a), bx = _asArray(b);
  if (ax.length !== bx.length) return false;
  for (let i = 0; i < ax.length; i++) {
    if (!_numbersEqual(ax[i], bx[i])) return false;
  }
  return true;
}

/**
 * compareContentEditSnapshot — Content Edit Backfill（Phase127-F）の
 * 比較本体。pure function（DOM/IndexedDB/fetch等の副作用を一切持たない）。
 *
 * [SCOPE] 「元のChordMini出力（インポート時スナップショット）」と
 * 「現在のanalysis.raw」を比較し、手動編集の有無を判定する。
 * 比較対象は raw.chords（chord名・start・end）/ raw.beats / raw.downbeats
 * のみ。_id・confidence・meta・provenance等は比較しない。
 *
 * [呼び出し元の責務] このファイルはIndexedDBへのアクセスを持たない
 * （analysisLoader.jsは analysis data の ingestion 専用というモジュール
 * 境界を守るため）。IndexedDBからのchord asset読み込み・JSON.parseは
 * 呼び出し元（app.js）が行い、パース済みの2つのrawオブジェクトを渡すこと。
 *
 * @param {object|null} snapshotRaw - IndexedDB ${projectId}:chord から
 *   復元した、インポート時点のChordMini出力の raw 相当オブジェクト
 *   （{ chords, beats, downbeats, ... }）。存在しない・破損している場合は null。
 * @param {object} currentRaw - 現在の project.analysis.raw
 * @returns {'matched'|'edited'|'unavailable'}
 */
export function compareContentEditSnapshot(snapshotRaw, currentRaw) {
  if (!snapshotRaw || typeof snapshotRaw !== 'object') return 'unavailable';
  if (!currentRaw  || typeof currentRaw  !== 'object') return 'unavailable';

  const chordsMatch    = _chordsEqual(snapshotRaw.chords, currentRaw.chords);
  const beatsMatch      = _numberArraysEqual(snapshotRaw.beats,     currentRaw.beats);
  const downbeatsMatch  = _numberArraysEqual(snapshotRaw.downbeats, currentRaw.downbeats);

  return (chordsMatch && beatsMatch && downbeatsMatch) ? 'matched' : 'edited';
}