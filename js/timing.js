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
  // 次の beat 頭スロットが anticipationWindow 以内にある場合は次 beat に吸着
  const beatIdx    = Math.floor(nearestIdx / resolutionPerBeat);
  const slotInBeat = nearestIdx % resolutionPerBeat;

  if (slotInBeat !== 0) {
    const nextBeatSlotIdx = (beatIdx + 1) * resolutionPerBeat;
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

  // ── measure / beat / slot に変換（0-based）──
  // NOTE: measureIdx は time ではなく finalBeatIdx（グローバル beat index）から求める。
  //       time ベースだと「nearest slot が次小節 beat 頭に吸着したのに
  //       measureIdx は前小節のまま」というずれが起きるため。
  const finalBeatIdx    = Math.floor(nearestIdx / resolutionPerBeat);
  const finalSlotInBeat = nearestIdx % resolutionPerBeat;

  // グローバル beat index → measure index を逆算
  let measureIdx = 0;
  let accBeats   = 0;
  for (let mi = 0; mi < measures.length; mi++) {
    const nextAcc = accBeats + measures[mi].beatCount;
    if (finalBeatIdx < nextAcc) {
      measureIdx = mi;
      break;
    }
    accBeats = nextAcc;
    measureIdx = mi; // 最終小節を超えた場合は末尾小節
  }

  const beatInMeasure = finalBeatIdx - accBeats;
  const slotInMeasure = beatInMeasure * resolutionPerBeat + finalSlotInBeat;

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

  const measures     = buildMeasures({ beats, downbeats, timeSignature, mode, audioDuration });
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
