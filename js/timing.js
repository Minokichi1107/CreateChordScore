/**
 * ════════════════════════════════════════
 * timing.js — TimingModel
 * ════════════════════════════════════════
 *
 * 【責務】
 *   - beats / downbeats から小節グリッドを構築する
 *   - コードのタイムスタンプをグリッドスロットに quantize する
 *   - 動作モード（full / beat-only / fallback）を自動判定する
 *
 * 【設計原則】
 *   - 外部 import ゼロ（UI / DOM / project 構造に一切触らない）
 *   - chartmode.js のみが import する
 *   - インデックスはすべて 0-based（UI表示時は呼び出し側で +1）
 *   - slotsPerMeasure = timeSignature.numerator × resolutionPerBeat
 *     → resolutionPerBeat のハードコード禁止
 *
 * 【動作モード】
 *   "full"      : downbeats正常・beats正常 → 小節グリッド全有効
 *   "beat-only" : beats正常・downbeats不安定 → 拍子情報から小節推定
 *   "fallback"  : beats不安定 → timing semantic 放棄・コード列のみ
 *
 * 【インデックス規約】
 *   measure / beat / slot はすべて 0-based
 *   UI表示時のみ呼び出し側で +1 する
 *
 * 【将来予定】
 *   resolutionPerBeat の display resolution 分離（Phase40設計）
 *   derived namespace への移行
 *
 * [FIXME-6/8] 6/8 は numerator=6 として扱っているが
 *   音楽的には2拍系(3+3)。将来 metricalStructure 導入時に修正。
 */

// ────────────────────────────────────────
// モード判定
// ────────────────────────────────────────

/**
 * beats 配列が「正常」かどうかを判定する。
 * 3拍以上あれば正常とみなす。
 *
 * @param {number[]} beats
 * @returns {boolean}
 */
function isBeatsUsable(beats) {
  return Array.isArray(beats) && beats.length >= 3;
}

/**
 * downbeats 配列が「正常」かどうかを判定する。
 * 2小節以上あれば正常とみなす。
 *
 * @param {number[]} downbeats
 * @returns {boolean}
 */
function isDownbeatsUsable(downbeats) {
  return Array.isArray(downbeats) && downbeats.length >= 2;
}

/**
 * 動作モードを決定する。
 *
 * @param {number[]} beats
 * @param {number[]} downbeats
 * @returns {"full"|"beat-only"|"fallback"}
 */
function determineMode(beats, downbeats) {
  if (!isBeatsUsable(beats))      return 'fallback';
  if (!isDownbeatsUsable(downbeats)) return 'beat-only';
  return 'full';
}

// ────────────────────────────────────────
// 小節情報の構築
// ────────────────────────────────────────

/**
 * downbeats から小節情報配列を構築する（full / beat-only モード用）。
 *
 * full モード:
 *   downbeats[i] が各小節の startTime
 *   endTime は downbeats[i+1]、最終小節は audioDuration
 *
 * beat-only モード:
 *   beats と timeSignature.numerator から小節を推定する
 *   downbeats なしで beats を beatsPerMeasure 個ずつグループ化
 *
 * @param {object} params
 * @param {number[]}  params.beats
 * @param {number[]}  params.downbeats
 * @param {object}    params.timeSignature  - { numerator, denominator }
 * @param {"full"|"beat-only"|"fallback"} params.mode
 * @param {number}    params.audioDuration
 * @returns {{ startTime: number, endTime: number, beatCount: number, confidence: "high"|"low"|"estimated" }[]}
 */
function buildMeasures({ beats, downbeats, timeSignature, mode, audioDuration }) {
  const beatsPerMeasure = timeSignature.numerator;

  if (mode === 'full') {
    return downbeats.map((startTime, i) => {
      const endTime = i < downbeats.length - 1
        ? downbeats[i + 1]
        : (audioDuration ?? startTime + beatsPerMeasure * 0.5);
      return {
        startTime,
        endTime,
        beatCount: beatsPerMeasure,
        confidence: 'high',
      };
    });
  }

  if (mode === 'beat-only') {
    // beats を beatsPerMeasure 個ずつグループ化して小節を推定する
    // [FIXME-6/8] beatsPerMeasure = numerator をそのまま使う
    const measures = [];
    for (let i = 0; i < beats.length; i += beatsPerMeasure) {
      const startTime = beats[i];
      const nextMeasureStart = beats[i + beatsPerMeasure];
      const endTime = nextMeasureStart !== undefined
        ? nextMeasureStart
        : (audioDuration ?? startTime + beatsPerMeasure * 0.5);
      measures.push({
        startTime,
        endTime,
        beatCount: beatsPerMeasure,
        confidence: 'estimated',
      });
    }
    return measures;
  }

  // fallback: 小節情報なし
  return [];
}

// ────────────────────────────────────────
// Phase72-B: anchor repair（manual timing correction）
// ────────────────────────────────────────
//
// 【設計原則（Phase72-A確定済み）】
//   - repairRule は「意図」を保存する。「結果」は保存しない。
//   - raw.beats / raw.downbeats は絶対に変更しない（pure function）。
//   - anchor より前の downbeats は一切変更しない（ANCHOR INCLUSIVE RULE）。
//   - anchor 以降は beatsPerMeasure 単位で再グルーピングする。
//   - 「解析結果の誤りを自動検出して除外する」処理は行わない
//     （それ自体が新しい自動推定になり、Phase59の
//      「自信がないなら触るな」方針に反するため）。
//   - repairedDownbeats はこの関数が返すだけで、呼び出し側も
//     どこにも保存しない（runtime限定の disposable 値）。

/**
 * applyAnchorRepair
 *
 * repairRule（ユーザーが指定した「ここを小節頭にする」という意図）を
 * downbeats に適用し、補正済みの downbeats 配列を生成する。
 *
 * 【ANCHOR INCLUSIVE RULE】
 *   anchor の拍は必ず新しい小節の先頭になる。
 *   anchor より前の downbeats は一切変更しない（時刻比較のみで判定）。
 *
 * 【VALUE SOURCE CONSTRAINT】
 *   repairRule.beatTime は raw.beats に実在する値である前提
 *   （Phase72-A確定）。見つからない場合は repairRule 保存時の
 *   invariant が破壊された状態であり、ユーザー操作の誤りではない。
 *
 * 【pure function】
 *   beats / downbeats を書き換えない。新しい配列を返す。
 *
 * @param {number[]} beats          - raw.beats（不変・参照のみ）
 * @param {number[]} downbeats      - raw.downbeats（不変・参照のみ）
 * @param {object|null} repairRule  - { version, type, beatTime } または null
 * @param {object} timeSignature    - { numerator, denominator }
 * @returns {number[]}  repairedDownbeats
 *                      （repairRule が null / 型不一致なら downbeats をそのまま返す）
 */
function applyAnchorRepair(beats, downbeats, repairRule, timeSignature) {
  // repairRule なし → 何もしない（素通し）
  if (!repairRule || repairRule.type !== 'anchorDownbeat') {
    return downbeats;
  }

  const anchorTime      = repairRule.beatTime;
  const beatsPerMeasure = timeSignature?.numerator ?? 4;
  const EPS              = 1e-6;

  // ① anchor より前の既存 downbeats はそのまま残す（時刻比較のみ）。
  //    「怪しい downbeat を自動で除外する」判定はここでは行わない
  //    （それは新しい自動推定であり、repairRule の責務外）。
  const before = downbeats.filter(d => d < anchorTime - EPS);

  // ② anchor に対応する拍を raw.beats から探す。
  //    [VALUE SOURCE CONSTRAINT] beatTime は raw.beats に実在する値の
  //    はずなので、見つからない場合はデータ整合性違反として扱う
  //    （ユーザーへの通知は行わない。内部不整合のログのみ）。
  const anchorBeatIdx = beats.findIndex(b => Math.abs(b - anchorTime) < EPS);
  if (anchorBeatIdx === -1) {
    console.error(
      '[applyAnchorRepair] anchor beatTime not found in raw.beats — ' +
      'repairRule invariant violated (beatTime must reference an existing beat). ' +
      'Skipping repair for this call.'
    );
    return downbeats;
  }

  // ③ anchor 以降の beats を beatsPerMeasure ごとに区切って
  //    新しい downbeats として並べる。
  const after = [];
  for (let i = anchorBeatIdx; i < beats.length; i += beatsPerMeasure) {
    after.push(beats[i]);
  }

  // ④ 前半（変更なし）+ 後半（再生成）をつなげる
  return [...before, ...after];
}

// ────────────────────────────────────────
// スロット境界の構築
// ────────────────────────────────────────

/**
 * beats 配列から全スロットの境界時刻を構築する。
 *
 * 各 beat を resolutionPerBeat 個のスロットに分割する。
 * スロット間の時刻は beat 間を線形補間する。
 *
 * @param {number[]} beats
 * @param {number} resolutionPerBeat
 * @returns {number[]}  各スロット開始時刻の配列
 */
function buildSlotTimings(beats, resolutionPerBeat) {
  const timings = [];
  for (let bi = 0; bi < beats.length; bi++) {
    const beatStart = beats[bi];
    const beatEnd   = beats[bi + 1] !== undefined
      ? beats[bi + 1]
      : beatStart + (beatStart - (beats[bi - 1] ?? beatStart - 0.5));

    const interval = (beatEnd - beatStart) / resolutionPerBeat;
    for (let si = 0; si < resolutionPerBeat; si++) {
      timings.push(beatStart + interval * si);
    }
  }
  return timings;
}

// ────────────────────────────────────────
// quantize
// ────────────────────────────────────────

/**
 * タイムスタンプを小節・beat・slot に quantize する。
 *
 * anticipationWindow:
 *   次の beat の slot 0 まで（スロット幅の何倍以内か）を先読みするか。
 *   コードが次 beat 直前に現れた場合に次 beat 頭に吸着させる。
 *
 * @param {number} time
 * @param {object} params
 * @param {number[]} params.beats
 * @param {number[]} params.downbeats
 * @param {number[]} params.slotTimings
 * @param {object[]} params.measures
 * @param {number}   params.resolutionPerBeat
 * @param {object}   params.timeSignature
 * @param {number}   params.anticipationWindow
 * @returns {{ measure: number, beat: number, slot: number, confidence: "high"|"low" }}
 */
function quantizeTime(time, {
  beats,
  slotTimings,
  measures,
  resolutionPerBeat,
  timeSignature,
  anticipationWindow,
}) {
  const slotsPerMeasure = timeSignature.numerator * resolutionPerBeat;

  if (!slotTimings.length || !measures.length) {
    return { measure: 0, beat: 0, slot: 0, confidence: 'low' };
  }

  // ── nearest slot を探す ──────────────
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < slotTimings.length; i++) {
    const dist = Math.abs(slotTimings[i] - time);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx  = i;
    }
  }

  // ── anticipationWindow チェック ──────
  // nearest が beat頭でなく（slot % resolutionPerBeat !== 0）、
  // 次の beat 頭スロットが anticipationWindow 以内にある場合は次 beat に吸着。
  //
  // [Phase72-B 修正]
  //   旧実装では beatIdx を anticipationWindow チェックの前に一度だけ計算していたが、
  //   nearestIdx が吸着で更新された場合に beatIdx が古い値のまま残る問題があった。
  //   修正: nearestIdx 確定後に beatIdx を（再）計算する。
  //   anticipationWindow チェック内で使う一時的な beatIdx は別名（preBeatIdx）にし、
  //   最終的な beatIdx は nearestIdx 確定後に求める（下記 resolvedTime の直前）。
  {
    const preBeatIdx = Math.floor(nearestIdx / resolutionPerBeat);
    const slotInBeat = nearestIdx % resolutionPerBeat;

    if (slotInBeat !== 0) {
      const nextBeatSlotIdx = (preBeatIdx + 1) * resolutionPerBeat;
      if (nextBeatSlotIdx < slotTimings.length) {
        const slotWidth = slotTimings.length > 1
          ? (slotTimings[1] - slotTimings[0])
          : 0.1;
        const distToNextBeat = slotTimings[nextBeatSlotIdx] - time;
        if (distToNextBeat >= 0 && distToNextBeat < slotWidth * anticipationWindow) {
          nearestIdx = nextBeatSlotIdx;
        }
      }
    }
  }

  // nearestIdx 確定後に beatIdx を求める（吸着済みの nearestIdx を使う）
  const beatIdx = Math.floor(nearestIdx / resolutionPerBeat);

  // ── measure 特定（Phase72-B: measures を直接の authority とする）──
  // 旧実装は finalBeatIdx（グローバル beat index）を
  // measures[mi].beatCount の積み上げで逆算していた。
  // これは「全 measure が timeSignature.numerator 拍固定」という
  // 暗黙の前提に依存しており、repairRule（Phase72-B）適用後に
  // measure 長さが不揃いになるケースで measureIdx がズレるバグがあった。
  //
  // 修正方針:
  //   nearestIdx（anticipationWindow 吸着済み）が指す確定時刻を求め、
  //   その時刻が measures[].startTime/endTime のどの範囲に
  //   入るかで measureIdx を直接判定する。
  //   beatCount の積み上げは行わない（measures が唯一の authority）。
  //
  // [AUTHORITY] measures（buildMeasures の結果。repairRule 適用後は
  //   repairedDownbeats から再構築済み）を信頼の起点とする。
  const resolvedTime = slotTimings[nearestIdx] ?? time;

  let measureIdx = measures.length - 1; // 範囲外（曲末尾超え）は末尾 measure
  for (let mi = 0; mi < measures.length; mi++) {
    const m = measures[mi];
    if (resolvedTime >= m.startTime && resolvedTime < m.endTime) {
      measureIdx = mi;
      break;
    }
    if (resolvedTime < m.startTime) {
      // 最初の measure より前（曲頭未満）→ 先頭 measure とする
      measureIdx = mi;
      break;
    }
  }

  const measure = measures[measureIdx];

  // ── measure 内の beat / slot 位置を求める ──
  // measure.startTime からの経過時間を beats 間隔で数え、
  // 「このmeasure内で何拍目か」を直接算出する（積み上げ逆算をしない）。
  // beats は raw のまま（repair対象外）なので、measure.startTime と
  // 一致する beat のインデックスを起点として使う。
  // [ASSUMPTION] measure.startTime は必ず raw.beats のいずれかの要素と一致する。
  // 現在の anchorDownbeat repair では:
  //   applyAnchorRepair() が after.push(beats[i]) で downbeat を生成するため、
  //   measure.startTime は常に beats[] 上の実在する値になる。
  //
  // [IMPLEMENTATION NOTE] 一致検索は b >= startTime - EPS ではなく
  //   Math.abs(b - startTime) < EPS（厳密一致）を使う。
  //   b >= startTime - EPS だと「startTimeより少し後ろの拍」を誤って拾う
  //   可能性があるため（例: startTime=4.0 の時に beats=[3.9999995, 4.5] があると
  //   b >= 3.9999994 で 4.5 を先に拾ってしまう）。
  //   ASSUMPTION に従い「startTime と一致する拍を探す」という意図で実装する。
  //
  // [FUTURE RISK] 将来 'shiftTime' 等、beats 上に存在しない時刻を
  // startTime として持つ別方式の repairRule が追加された場合、
  // findIndex が -1 を返し、startBeatIdx !== -1 ガードにより
  // beatInMeasure = 0 にサイレントフォールバックする。
  // その場合は measure.startBeatIdx を事前計算して持たせる方式に切り替えること。
  const BEAT_EPS = 1e-6;
  let beatInMeasure = 0;
  const startBeatIdx = beats.findIndex(
    b => Math.abs(b - measure.startTime) < BEAT_EPS
  );
  if (startBeatIdx !== -1) {
    beatInMeasure = beatIdx - startBeatIdx;
  }

  const finalSlotInBeat = nearestIdx % resolutionPerBeat;
  const slotInMeasure   = beatInMeasure * resolutionPerBeat + finalSlotInBeat;

  const confidence = nearestDist < 0.1 ? 'high' : 'low';

  return {
    measure: measureIdx,                        // 0-based
    beat:    Math.max(0, beatInMeasure),        // 0-based, within measure
    slot:    Math.max(0, slotInMeasure),        // 0-based, within measure
    confidence,
  };
}

// ────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────

/**
 * createTimingModel
 *
 * beats / downbeats から TimingModel を生成して返す。
 *
 * @param {object} params
 * @param {number[]} params.beats
 * @param {number[]} params.downbeats
 * @param {object}   params.timeSignature       - { numerator, denominator }
 * @param {number}   [params.resolutionPerBeat] - デフォルト 2（8分グリッド）
 * @param {string}   [params.quantizeMode]      - "nearest"（現在のみ対応）
 * @param {number}   [params.anticipationWindow]- デフォルト 0.5
 * @param {number}   [params.audioDuration]     - 秒。最終小節 endTime 計算用
 * @param {object|null} [params.repairRule]     - Phase72-B: { version, type:'anchorDownbeat', beatTime }
 *                                                 ユーザーが指定した手動タイミング補正の意図。
 *                                                 null の場合は repair なし（既存動作と同一）。
 * @returns {TimingModel}
 */
export function createTimingModel({
  beats        = [],
  downbeats    = [],
  timeSignature = { numerator: 4, denominator: 4 },
  resolutionPerBeat  = 2,
  quantizeMode       = 'nearest',
  anticipationWindow = 0.5,
  audioDuration      = null,
  repairRule         = null,
} = {}) {

  const mode = determineMode(beats, downbeats);

  // fallback: 最小限の情報のみ返す
  if (mode === 'fallback') {
    return {
      mode,
      measureCount: 0,
      quantize: () => ({ measure: 0, beat: 0, slot: 0, confidence: 'low' }),
      getMeasure: () => null,
    };
  }

  // Phase72-B: repairRule を downbeats に適用する。
  // [AUTHORITY] repair の結果は measures に反映される。
  //   repairedDownbeats 自体はこの関数のローカル変数に留まり、
  //   呼び出し側（chartmode.js / analysisLoader.js）には公開しない。
  //   raw.downbeats は変更しない（applyAnchorRepair は pure function）。
  const repairedDownbeats = applyAnchorRepair(beats, downbeats, repairRule, timeSignature);

  const measures     = buildMeasures({ beats, downbeats: repairedDownbeats, timeSignature, mode, audioDuration });
  const slotTimings  = buildSlotTimings(beats, resolutionPerBeat);
  const slotsPerMeasure = timeSignature.numerator * resolutionPerBeat;

  /**
   * quantize
   * タイムスタンプ → { measure, beat, slot, confidence }（すべて 0-based）
   *
   * @param {number} time
   * @returns {{ measure: number, beat: number, slot: number, confidence: "high"|"low" }}
   */
  function quantize(time) {
    return quantizeTime(time, {
      beats,
      slotTimings,
      measures,
      resolutionPerBeat,
      timeSignature,
      anticipationWindow,
    });
  }

  /**
   * getMeasure
   * 小節インデックス（0-based）→ 小節情報
   *
   * @param {number} measureIndex  0-based
   * @returns {{ startTime: number, endTime: number, beatCount: number, confidence: string } | null}
   */
  function getMeasure(measureIndex) {
    return measures[measureIndex] ?? null;
  }

  /**
   * getBeatPosition
   *
   * 現在時刻が「小節内のどの位置にいるか」を 0.0〜1.0 で返す。
   *
   * 【責務分離】
   *   timing interpretation (slot → 割合変換) はこの関数が持つ。
   *   chartmode.js は受け取った値を left% に変換するだけでよい。
   *
   * 【設計上の注意】
   *   今回の実装は slotIndex / slotsPerMeasure による等分割。
   *   将来 swing / triplet / subdivision が加わる場合も
   *   この関数内で吸収することで renderer 側への leakage を防ぐ。
   *
   * @param {number} time - 現在の再生時刻（秒）
   * @returns {number} 0.0〜1.0（小節内での拍位置の割合）
   *                   fallback / 小節外の場合は 0.0 を返す
   */
  function getBeatPosition(time) {
    const q = quantize(time);
    if (q.confidence === 'low' && q.slot === 0 && q.beat === 0) {
      // fallback quantize の戻り値（全部0）は位置不明として先頭扱い
      return 0.0;
    }
    return q.slot / slotsPerMeasure;
  }

  return {
    mode,
    // measureCount は detector quality 依存（最終小節を検出できない場合に欠ける）
    measureCount: measures.length,
    slotsPerMeasure,
    quantize,
    getMeasure,
    getBeatPosition,
  };
}

// ════════════════════════════════════════
// Phase59: Timing Stabilization Layer
// ════════════════════════════════════════
//
// 【設計原則】
//   - createTimingModel() は変更しない（消費者のまま）
//   - repair は preprocessing として独立させる
//   - 音楽的な「演奏の揺れ」を解析エラーと誤認しないよう
//     tolerance-based snap + continuity-aware repair を採用
//   - repair default OFF（research phase）
//   - pure functions のみ。DOM / global state / window には触らない
//     （__TIMING_DEBUG__ への書き込みは呼び出し側 chartmode.js が責務）
//
// 【関数一覧】
//   analyzeTiming()                 — 診断のみ（副作用なし）
//   repairDownbeats()               — continuity-aware repair（experimental）
//   buildNormalizedTimingAnalysis() — 全 consumer の入口

// ────────────────────────────────────────
// 内部ユーティリティ
// ────────────────────────────────────────

/**
 * 数値配列の中央値を返す（破壊的ソートを避けるためコピーして使う）
 * @param {number[]} arr
 * @returns {number}
 */
function _median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * beats 配列から各 beat 間の間隔（秒）を計算する
 * @param {number[]} beats
 * @returns {number[]}
 */
function _beatIntervals(beats) {
  const intervals = [];
  for (let i = 1; i < beats.length; i++) {
    intervals.push(beats[i] - beats[i - 1]);
  }
  return intervals;
}

/**
 * 近傍ウィンドウ内の beat 間隔の中央値を計算する（local median）
 *
 * downbeat[i] 周辺の beats を参照して局所テンポを推定する。
 * 全体 median だけでは「タメ・rit.・shuffle」を drift と誤認するため
 * local window で補正する。
 *
 * @param {number[]} beats
 * @param {number}   centerTime     — 対象 downbeat の時刻
 * @param {number}   windowSeconds  — ±windowSeconds 以内の beats を使う
 * @returns {number}  中央値 beat 間隔（秒）、計算不能なら 0
 */
function _localMedianBeatInterval(beats, centerTime, windowSeconds) {
  const nearby = [];
  for (let i = 1; i < beats.length; i++) {
    const mid = (beats[i - 1] + beats[i]) / 2;
    if (Math.abs(mid - centerTime) <= windowSeconds) {
      nearby.push(beats[i] - beats[i - 1]);
    }
  }
  return nearby.length >= 2 ? _median(nearby) : 0;
}

// ────────────────────────────────────────
// PUBLIC API: analyzeTiming
// ────────────────────────────────────────

/**
 * analyzeTiming
 *
 * beats / downbeats の統計を診断する。副作用なし。
 * repair の前後どちらでも使える（入力データを一切変更しない）。
 *
 * 【severity 判定基準】
 *   "none":     driftCount = 0
 *   "minor":    driftCount > 0 かつ maxConsecutiveDrift <= 2
 *   "moderate": maxConsecutiveDrift 3〜5
 *   "severe":   maxConsecutiveDrift 6 以上
 *
 * @param {number[]} beats
 * @param {number[]} downbeats
 * @param {{ numerator: number, denominator: number }} timeSignature
 * @returns {object}  診断結果
 */
export function analyzeTiming(beats, downbeats, timeSignature) {
  const beatsPerMeasure    = timeSignature?.numerator ?? 4;
  const intervals          = _beatIntervals(beats);
  const medianBeatInterval = _median(intervals);
  const estimatedBPM       = medianBeatInterval > 0
    ? Math.round(60 / medianBeatInterval)
    : 0;
  const expectedMeasureLength = medianBeatInterval * beatsPerMeasure;

  // downbeat 間隔を計算して drift を判定する
  // 基準: expectedMeasureLength から ±driftThreshold 以上ズレたら drift
  const DRIFT_THRESHOLD = 0.20; // ±20%

  const downbeatIntervals = [];
  let driftCount          = 0;
  let maxConsecutiveDrift = 0;
  let currentConsecutive  = 0;
  const driftMeasures     = [];

  for (let i = 0; i < downbeats.length - 1; i++) {
    const interval = downbeats[i + 1] - downbeats[i];
    const expected = expectedMeasureLength;
    const drift    = interval - expected;
    const driftPct = expected > 0 ? Math.abs(drift) / expected : 0;
    const isDrift  = driftPct > DRIFT_THRESHOLD;

    downbeatIntervals.push({
      index:    i,
      interval: +interval.toFixed(4),
      expected: +expected.toFixed(4),
      drift:    +drift.toFixed(4),
      driftPct: +driftPct.toFixed(4),
      isDrift,
    });

    if (isDrift) {
      driftCount++;
      currentConsecutive++;
      driftMeasures.push(i + 1); // 次の小節（i+1）の頭がズレる
      if (currentConsecutive > maxConsecutiveDrift) {
        maxConsecutiveDrift = currentConsecutive;
      }
    } else {
      currentConsecutive = 0;
    }
  }

  // severity 判定
  let severity;
  if (driftCount === 0)               severity = 'none';
  else if (maxConsecutiveDrift <= 2)  severity = 'minor';
  else if (maxConsecutiveDrift <= 5)  severity = 'moderate';
  else                                severity = 'severe';

  return {
    medianBeatInterval: +medianBeatInterval.toFixed(4),
    estimatedBPM,
    beatsPerMeasure,
    expectedMeasureLength: +expectedMeasureLength.toFixed(4),
    downbeatIntervals,
    driftThreshold:      DRIFT_THRESHOLD,
    driftCount,
    maxConsecutiveDrift,
    driftMeasures,
    severity,
  };
}

// ────────────────────────────────────────
// PUBLIC API: repairDownbeats
// ────────────────────────────────────────

/**
 * repairDownbeats
 *
 * continuity-aware downbeat repair（実験的）。
 *
 * 【設計思想】
 *   音楽的な「演奏の揺れ」（タメ・シンコペ・グルーヴ）は直さない。
 *   madmom が明らかに道を踏み外した時だけそっと補助する。
 *   「自信がないなら触るな」を基本方針とする。
 *
 * 【continuity repair】
 *   repair[n] の結果を expected[n+1] の計算に連鎖させる。
 *   各小節独立判定ではなく、修正後の位置から次を推定する。
 *
 * 【tolerance-based snap】
 *   |expected - nearestBeat| < beatInterval × snapTolerance のみ吸着。
 *   超えた場合は repair rejected（元の downbeat を維持）。
 *
 * 【local/global hybrid median】
 *   全体 median だけでは局所的なテンポ揺れを drift と誤認する。
 *   近傍ウィンドウの local median と全体 global median を加重平均して使う。
 *
 * @param {number[]} beats
 * @param {number[]} downbeats
 * @param {{ numerator: number, denominator: number }} timeSignature
 * @param {object}   [opts]
 * @param {number}   [opts.snapTolerance=0.3]          — beatInterval の何倍以内なら吸着するか
 * @param {number}   [opts.localWindowMeasures=2]       — local median に使う近傍小節数
 * @param {number[]} [opts.globalLocalRatio=[7,3]]      — [global重み, local重み]
 * @returns {{ downbeats: number[], repairStats: object, perMeasure: object[] }}
 */
export function repairDownbeats(beats, downbeats, timeSignature, opts = {}) {
  const {
    snapTolerance       = 0.3,
    localWindowMeasures = 2,
    globalLocalRatio    = [7, 3],
  } = opts;

  // 入力検証: 最低限のデータがない場合は early return（入力をそのまま返す）
  if (!isBeatsUsable(beats) || !isDownbeatsUsable(downbeats)) {
    return {
      downbeats: [...downbeats],
      repairStats: { attempted: 0, succeeded: 0, rejected: 0, failedClean: false },
      perMeasure: downbeats.map((_, i) => ({ index: i, state: 'original', confidence: 1.0 })),
    };
  }

  const beatsPerMeasure = timeSignature?.numerator ?? 4;
  const intervals       = _beatIntervals(beats);
  const globalMedian    = _median(intervals);
  const [gw, lw]        = globalLocalRatio;
  const totalWeight     = gw + lw;

  const repairedDownbeats = [downbeats[0]]; // downbeat[0] は anchor（変更しない）
  const perMeasure        = [{ index: 0, state: 'original', confidence: 1.0 }];
  let   attempted         = 0;
  let   succeeded         = 0;
  let   rejected          = 0;

  try {
    for (let i = 1; i < downbeats.length; i++) {
      const prevRepaired    = repairedDownbeats[i - 1];
      const actual          = downbeats[i];

      // local/global hybrid median で期待間隔を計算
      const windowSec      = localWindowMeasures * beatsPerMeasure * globalMedian;
      const localMedian    = _localMedianBeatInterval(beats, prevRepaired, windowSec);
      const effectiveMedian = (localMedian > 0)
        ? (globalMedian * gw + localMedian * lw) / totalWeight
        : globalMedian;

      const expected        = prevRepaired + effectiveMedian * beatsPerMeasure;

      // expected に最も近い beat を探す
      let nearestBeat = actual; // beat が見つからない場合は actual のまま
      let nearestDist = Infinity;
      for (const b of beats) {
        const dist = Math.abs(b - expected);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestBeat = b;
        }
      }

      // snap tolerance チェック
      const tolerance     = globalMedian * snapTolerance;
      const gap           = Math.abs(expected - nearestBeat);
      const withinTol     = gap < tolerance;
      const confidence    = withinTol
        ? +(1 - gap / tolerance).toFixed(4)
        : 0.0;

      attempted++;

      if (withinTol && Math.abs(nearestBeat - actual) > 0.001) {
        // 吸着成功（actual と nearestBeat が有意に異なる場合のみ修正）
        repairedDownbeats.push(nearestBeat);
        succeeded++;
        perMeasure.push({
          index:      i,
          state:      'repaired',
          before:     +actual.toFixed(4),
          after:      +nearestBeat.toFixed(4),
          gap:        +gap.toFixed(4),
          tolerance:  +tolerance.toFixed(4),
          confidence,
        });
      } else if (withinTol) {
        // nearestBeat ≈ actual（修正不要）
        repairedDownbeats.push(actual);
        perMeasure.push({ index: i, state: 'original', confidence });
      } else {
        // tolerance 超過 → repair rejected（元の値を維持）
        repairedDownbeats.push(actual);
        rejected++;
        perMeasure.push({
          index:      i,
          state:      'rejected',
          expected:   +expected.toFixed(4),
          nearest:    +nearestBeat.toFixed(4),
          gap:        +gap.toFixed(4),
          tolerance:  +tolerance.toFixed(4),
          confidence: 0.0,
        });
      }
    }
  } catch (err) {
    // repair 中に予期しない例外が発生 → 完全 fallback（入力をそのまま返す）
    console.warn('[repairDownbeats] unexpected error, falling back to raw downbeats:', err);
    return {
      downbeats: [...downbeats],
      repairStats: { attempted, succeeded, rejected, failedClean: true },
      perMeasure: downbeats.map((_, i) => ({ index: i, state: 'original', confidence: 1.0 })),
    };
  }

  return {
    downbeats: repairedDownbeats,
    repairStats: { attempted, succeeded, rejected, failedClean: false },
    perMeasure,
  };
}

// ────────────────────────────────────────
// PUBLIC API: buildNormalizedTimingAnalysis
// ────────────────────────────────────────

/**
 * buildNormalizedTimingAnalysis
 *
 * 全 consumer（chartmode.js / 将来の perform.js / click seek 等）の入口。
 * rawAnalysis → normalize → normalized timing source を返す。
 *
 * 【責務】
 *   - analyzeTiming() で診断
 *   - repair: true の場合のみ repairDownbeats() を実行
 *   - createTimingModel() に渡す最終的な beats / downbeats を決定する
 *
 * 【pure function】
 *   DOM / global state / window には一切触らない。
 *   __TIMING_DEBUG__ への書き込みは呼び出し側（chartmode.js）の責務。
 *
 * @param {object} rawAnalysis     — project.analysis（loadAnalysis済み）
 * @param {object} [opts]
 * @param {boolean} [opts.repair=false]  — true: experimental repair を実行
 * @param {object}  [opts.repairOpts]    — repairDownbeats() に渡すオプション
 * @returns {{
 *   beats:       number[],
 *   downbeats:   number[],
 *   diagnostics: object,    // analyzeTiming() の結果（常に含まれる）
 *   repair:      object|null // repairDownbeats() の結果（repair:false なら null）
 * }}
 */
export function buildNormalizedTimingAnalysis(rawAnalysis, opts = {}) {
  const { repair = false, repairOpts = {} } = opts;

  const beats     = rawAnalysis?.beats     ?? [];
  const downbeats = rawAnalysis?.downbeats ?? [];
  const ts        = rawAnalysis?.timeSignature ?? { numerator: 4, denominator: 4 };

  // 診断は常に実行（repair ON/OFF に関係なく）
  const diagnostics = analyzeTiming(beats, downbeats, ts);

  if (!repair) {
    // repair OFF: raw をそのまま返す
    return {
      beats,
      downbeats,
      diagnostics,
      repair: null,
    };
  }

  // repair ON（experimental）: repairDownbeats() を実行
  const repairResult = repairDownbeats(beats, downbeats, ts, repairOpts);

  return {
    beats,
    downbeats: repairResult.downbeats,  // 修正済み（or フォールバックで元のまま）
    diagnostics,
    repair: repairResult,
  };
}
