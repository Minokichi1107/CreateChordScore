/**
 * ════════════════════════════════════════
 * chartmode.js — Chart Mode UI / GridViewModel
 * ════════════════════════════════════════
 *
 * 【責務】
 *   - buildGridViewModel: analysis → GridViewModel（onset-only canonical）
 *   - expandToSlots: render用 slot semantic 配列生成（onset|carry|empty）
 *   - expandCarryForward: @deprecated Phase57で expandToSlots に置き換え済み
 *   - resolveCollision:   同一スロット複数 onset の解決（render時）
 *   - Chart Mode UI の開閉・描画
 *
 * 【GridViewModel 設計原則】
 *   - onset-only: chord が始まるスロットのみ記録する
 *   - carry-forward は render 時のみ（GridViewModel への保存禁止）
 *   - onsets は常に配列（将来の collision 対応のため単一値化しない）
 *   - インデックスはすべて 0-based（UI表示時のみ +1）
 *
 * 【collision 解決優先順位（render時）】
 *   1. confidence が高い方
 *   2. duration が長い方（短時間ノイズ排除）
 *   3. time が遅い方（後勝ち）
 *
 * 【依存】
 *   - timing.js（createTimingModel）
 *   - app.js から initChartMode() で依存を注入する
 *
 * 【Chart Mode が触らないもの】
 *   project.lines / editor.js / perform.js / tapmode.js
 *
 * 【display projection について】
 *   capo 移調（表示用コード変換）は現在 editor.js / perform.js / chartmode.js
 *   それぞれで個別に行っている。
 *   analysis.raw / project.lines は常に canonical（移調なし）のまま保持すること。
 *   NOTE: chord display projection (capo transpose) is currently performed
 *   per-renderer. Future phases may centralize this into a shared display layer
 *   when N.C. / simile / slash bass / Roman numeral 等が加わる段階で統合を検討する。
 *
 * 【Phase57 slot DOM invariant（ChatGPT監査確認済み）】
 *   semantic slot: 常に固定（expandToSlots の結果）
 *   visual DOM slot: 全 slot（onset / carry / empty）を生成する（Phase57で復活）
 *   active state lookup は data-visual-slot-index 属性経由（Phase68でrename）。
 *     carry / empty 含む全 slot DOM が生成されるため逆引きは不要（Phase57で解決済み）。
 *   将来の click seek / beat hover 等も semantic slot（expandToSlots 結果）を参照する。
 *
 * 【Phase59/64 timing stabilization（normalized timing pipeline）】
 *   buildGridViewModel() は normalized を引数で受け取る（Phase64で変更）。
 *   normalized の生成責務は analysisLoader.js の loadAnalysis() が持つ。
 *   chartmode.js は project tree を直接読まない（OWNERSHIP INVARIANT）。
 *   normalized は app.js が project.analysis から取り出して注入する。
 *   診断結果（analyzeTiming）は window.__TIMING_DEBUG__ に常に書き込む。
 *   repair はデフォルト OFF（experimental）。
 */

import { createTimingModel } from './timing.js';
import { setSpeed } from './audio.js';



// ────────────────────────────────────────
// GridViewModel 構築
// ────────────────────────────────────────

/**
 * buildGridViewModel
 *
 * project.analysis から GridViewModel（onset-only canonical）を生成する。
 *
 * 【onset-only 規約】
 *   全スロットに chord を埋めない。
 *   onset のあるスロットのみ記録する。
 *   carry-forward（継続補完）は render 時のみ行う。
 *
 * @param {object} analysis  - project.analysis（loadAnalysis 済み）
 * @param {number} [audioDuration]
 * @returns {{ model: TimingModel, measures: object[] } | null}
 */
export function buildGridViewModel(analysis, audioDuration = null, opts = {}) {
  // [OWNERSHIP INVARIANT] analysis は app.js が project.analysis を注入する。
  // chartmode.js は project tree を直接読まない。
  // normalized は analysis.normalized（analysisLoader.js の loadAnalysis() が生成した runtime cache）。
  // NEVER rebuild normalized here — それは analysisLoader.js の責務。
  if (!analysis) return null;

  // normalized timing を analysis から取得する。
  // analysis.normalized が存在しない場合（旧データ等）はフォールバックとして
  // analysis 自体を timing source として使う（beats/downbeats はそのまま利用）。
  const cachedNormalized = analysis.normalized;

  // DevTools デバッグ用（将来の issue 報告・A案設計のデータ収集）
  window.__TIMING_DEBUG__ = {
    diagnostics: cachedNormalized?.diagnostics ?? null,
    repair:      cachedNormalized?.repair ?? null,
    normalized: {
      beats:     cachedNormalized?.beats ?? analysis.beats ?? [],
      downbeats: cachedNormalized?.downbeats ?? analysis.downbeats ?? [],
    },
  };

  // timing: normalized が存在すれば repair済みの beats/downbeats を使う。
  // chords / timeSignature は timing 非依存のため analysis から直接取得する。
  const beats         = cachedNormalized?.beats     ?? analysis.beats     ?? [];
  const downbeats     = cachedNormalized?.downbeats ?? analysis.downbeats ?? [];
  const timeSignature = analysis.timeSignature;
  const chords        = analysis.chords;

  // Phase72-B: repairRule（ユーザーが指定した手動タイミング補正の意図）。
  // [OWNERSHIP] repairRule の解釈・適用（anchor以降のmeasure再構築）は
  // timing.js の createTimingModel() 内部（applyAnchorRepair）が責務を持つ。
  // chartmode.js はここで運ぶだけで、解釈は一切行わない。
  // normalized（Phase59のdrift repair結果）とは別物・別経路。
  const repairRule = analysis.repairRule ?? null;

  const model = createTimingModel({
    beats,
    downbeats,
    timeSignature,
    resolutionPerBeat:  2,
    quantizeMode:       'nearest',
    anticipationWindow: 0.5,
    audioDuration,
    repairRule,
  });

  // fallback モード: コード列のみ（グリッドなし）
  if (model.mode === 'fallback') {
    return { model, measures: [], repairPerMeasure: new Map() };
  }

  const slotsPerMeasure = model.slotsPerMeasure;

  // 小節配列を初期化（onset-only: slots は空配列でスタート）
  // endTime は detectPickupMeasure() / click seek での measure 長さ計算に必須。
  // getMeasure(mi) から startTime / endTime / confidence を取得する。
  const measures = Array.from({ length: model.measureCount }, (_, mi) => {
    const m = model.getMeasure(mi);
    return {
      index:      mi,           // 0-based
      startTime:  m.startTime,
      endTime:    m.endTime,    // pickup 判定・seek に必須
      confidence: m.confidence,
      slots:      [],           // { slotIndex, onsets[] } onset ありのみ追加
    };
  });

  // N / 空コードを除外してから quantize
  const validChords = (chords || []).filter(c =>
    c.chord && c.chord !== 'N' && c.chord.length > 0
  );

  for (const c of validChords) {
    const q = model.quantize(c.start);

    if (q.measure < 0 || q.measure >= measures.length) continue;

    const measure = measures[q.measure];
    const slotIndex = q.slot;  // 0-based, within measure

    if (slotIndex < 0 || slotIndex >= slotsPerMeasure) continue;

    // 既存 slot を探す
    let slot = measure.slots.find(s => s.slotIndex === slotIndex);
    if (!slot) {
      slot = { slotIndex, onsets: [] };
      measure.slots.push(slot);
    }

    // onset を追加（collision 対応・常に配列で持つ）
    // [Phase74-C] _id を伝播させる（解析エディタのクリック選択に必要）
    slot.onsets.push({
      chord:      c.chord,
      id:    c._id ?? null,
      time:       c.start,
      duration:   c.end - c.start,
      confidence: q.confidence,
    });
  }

  // slots を slotIndex 順にソート
  for (const measure of measures) {
    measure.slots.sort((a, b) => a.slotIndex - b.slotIndex);
  }

  // repairPerMeasure: measure index → repair状態のマップ
  // _renderChartGrid() でdata-repair-state付与に使用
  const repairPerMeasureArr = cachedNormalized?.repair?.perMeasure ?? [];
  const repairPerMeasure    = new Map(repairPerMeasureArr.map(e => [e.index, e]));

  return { model, measures, repairPerMeasure };
}

// ────────────────────────────────────────
// collision 解決（render時）
// ────────────────────────────────────────

/**
 * resolveCollision
 *
 * 同一スロットに複数の onset がある場合に表示する1つを選ぶ。
 *
 * 優先順位:
 *   1. confidence が 'high' の方
 *   2. duration が長い方（短時間ノイズ排除）
 *   3. time が遅い方（後勝ち）
 *
 * @param {object[]} onsets
 * @returns {object}  選ばれた onset
 */
export function resolveCollision(onsets) {
  if (onsets.length === 1) return onsets[0];

  return onsets.reduce((best, current) => {
    // 1. confidence 優先
    if (best.confidence === 'high' && current.confidence !== 'high') return best;
    if (current.confidence === 'high' && best.confidence !== 'high') return current;
    // 2. duration 優先（長い方）
    if (current.duration !== best.duration) {
      return current.duration > best.duration ? current : best;
    }
    // 3. time 優先（後勝ち）
    return current.time > best.time ? current : best;
  });
}

// ────────────────────────────────────────
// Phase68: pickup-aware visual projection helpers
// ────────────────────────────────────────
//
// 【全体像】
//   canonical timing space（timing.js / quantize / beats）
//       ↓ projection adapter（この区画の関数群）
//   visual slot space（render / highlight / playhead target）
//
//   canonical timing は一切変更しない。
//   projection は measure 0（pickup measure）の表示位置調整に限定される。
//
// 【単一変換源】
//   actual slot index → visual slot index の変換は
//   projectPickupSlotIndex() に集約する。
//   expandToSlots()（rendering）と updateChartPlayback()（highlight）の
//   両方がこれを使うことで、表示と再生位置のズレを防ぐ。
//
// 【out of scope（Phase68では行わない）】
//   - playhead の連続位置補正（getBeatPosition は canonical のまま）
//   - mode === 'beat-only' での pickup 対応（canonical measure 自体の
//     1小節分ズレ問題は別issue。Phase68は mode === 'full' 限定）

const PICKUP_EPS = 1e-6;

/**
 * getMeasureBeatCount
 *
 * measure の実際の拍数を beats[] から数える。
 * canonical の measure.beatCount（timeSignature固定値）とは異なる。
 *
 * 【EPS について】
 *   floating precision により beat === measure.endTime が
 *   隣接measureへ誤帰属することを防ぐため EPS を使う。
 *
 * 【この関数が触らないもの】
 *   timing.js / GridViewModel.measures — 参照のみ
 *   canonical measure.beatCount は変更しない
 *
 * @param {object}   measure - { startTime, endTime }
 * @param {number[]} beats   - グローバル beat タイムスタンプ配列（昇順想定）
 * @returns {number}  measure区間内に入るbeat数
 */
function getMeasureBeatCount(measure, beats) {
  let count = 0;
  for (const b of beats) {
    if (b + PICKUP_EPS < measure.startTime) continue;
    if (b >= measure.endTime - PICKUP_EPS) break;
    count++;
  }
  return count;
}

/**
 * shouldApplyPickupProjection
 *
 * pickup-aware visual projection を適用すべきか判定する。
 * mode/isPickup/timeSignature の事前条件は呼び出し側（_renderChartGrid）の
 * pickupCtx 構築時に確認済み。この関数は実拍数のみを判定する。
 *
 * @param {object} params
 * @param {number} params.actualBeats    - getMeasureBeatCount() の結果
 * @param {number} params.referenceBeats - timeSignature.numerator
 * @returns {boolean}
 */
function shouldApplyPickupProjection({ actualBeats, referenceBeats }) {
  return actualBeats > 0 && actualBeats < referenceBeats;
}

/**
 * computeLeadingOffset
 *
 * pickup measure の先頭に挿入する projection-empty slot 数を計算する。
 * resolutionPerBeat は slotsPerMeasure / referenceBeats から内部導出する
 * （structural invariant のため外部から渡さない）。
 *
 * @param {object} params
 * @param {number} params.actualBeats     - getMeasureBeatCount() の結果
 * @param {number} params.referenceBeats  - timeSignature.numerator
 * @param {number} params.slotsPerMeasure - model.slotsPerMeasure
 * @returns {number}  leadingOffset（visual slot数）
 */
function computeLeadingOffset({ actualBeats, referenceBeats, slotsPerMeasure }) {
  const resolutionPerBeat = slotsPerMeasure / referenceBeats;
  return (referenceBeats - actualBeats) * resolutionPerBeat;
}

/**
 * projectPickupSlotIndex
 *
 * pickup measure の actual slot index を visual slot index へ変換する。
 *
 * 【単一変換源】
 *   この変換は expandToSlots()（rendering）と
 *   updateChartPlayback()（playback highlight）の
 *   両方で同一でなければならない。
 *   別々に実装すると render と highlight の視覚的ズレが発生する。
 *
 * 【右詰め基準】
 *   末尾側（visualSlotIndex = slotsPerMeasure-1）が安定するように ceil を使う。
 *
 * @param {object} params
 * @param {number} params.actualSlotIndex - 0..slotsPerMeasure-1
 * @param {number} params.slotsPerMeasure
 * @param {number} params.leadingOffset
 * @returns {number}  visualSlotIndex（leadingOffset..slotsPerMeasure-1）
 */
export function projectPickupSlotIndex({ actualSlotIndex, slotsPerMeasure, leadingOffset }) {
  const visualSpan = slotsPerMeasure - leadingOffset;
  if (visualSpan <= 0) return leadingOffset;

  const normalized = (actualSlotIndex + 1) / slotsPerMeasure;
  return leadingOffset + Math.ceil(normalized * visualSpan) - 1;
}

/**
 * remapPickupOnsetMap
 *
 * pickup measure の onsetMap（actualSlotIndex基準）を
 * visualSlotIndex基準へ再マップする。
 *
 * 【visual remap の考え方】
 *   actualSlotIndex 0..(slotsPerMeasure-1) の範囲を
 *   visualSlotIndex leadingOffset..(slotsPerMeasure-1) の範囲へ圧縮する
 *   （projectPickupSlotIndex() を使用）。
 *   複数の actualSlotIndex が同じ visualSlotIndex に集約される場合は
 *   resolveCollision() で代表 onset を1つに絞る。
 *
 * 【IMPORTANT: carry regeneration はこの関数の責務外】
 *   この関数は onsetMap（onsetのみ）の再マップに限定する。
 *   canonical carry duration は actualSlotIndex 空間に基づくため、
 *   carry を直接 remap すると pickup 圧縮後に
 *   duration の重複・伸長が発生する。
 *   carry は呼び出し側（expandToSlots）が
 *   visual空間で onset ownership から再生成すること。
 *
 * @param {Map<number, object>} actualOnsetMap - actualSlotIndex → resolved onset
 * @param {number} slotsPerMeasure
 * @param {number} leadingOffset
 * @returns {Map<number, object>}  visualSlotIndex → resolved onset
 */
function remapPickupOnsetMap(actualOnsetMap, slotsPerMeasure, leadingOffset) {
  const visualSpan = slotsPerMeasure - leadingOffset;
  if (visualSpan <= 0) return new Map(); // 異常値ガード

  // visualSlotIndex → 集約対象の onset 配列
  const grouped = new Map();

  for (const [actualSlotIndex, onset] of actualOnsetMap) {
    if (!onset) continue;

    const visualSlotIndex = projectPickupSlotIndex({
      actualSlotIndex,
      slotsPerMeasure,
      leadingOffset,
    });

    if (!grouped.has(visualSlotIndex)) grouped.set(visualSlotIndex, []);
    grouped.get(visualSlotIndex).push(onset);
  }

  const result = new Map();
  for (const [visualSlotIndex, onsets] of grouped) {
    result.set(
      visualSlotIndex,
      onsets.length === 1 ? onsets[0] : resolveCollision(onsets)
    );
  }
  return result;
}

// ────────────────────────────────────────
// slot semantic expansion（render時のみ・保存禁止）
// ────────────────────────────────────────

/**
 * expandToSlots
 *
 * GridViewModel（onset-only canonical）を render 用 slot semantic 配列に展開する。
 *
 * 【slot type discriminated union】
 *   onset: { type:'onset', measureIndex, beatIndex, chord, durationSlots }
 *     - chord は canonical（capo 変換しない）
 *     - durationSlots = このonsetを含めて何slot継続するか（1以上）
 *     - 将来の duration rendering / sustain line のために予約
 *   carry: { type:'carry', measureIndex, beatIndex, sourceSlotIndex }
 *     - chord を複製しない（ownership = onset slot）
 *     - sourceSlotIndex = measure local index（0始まり）
 *     - 将来の cross-measure sustain では sourceMeasureIndex を追加予定
 *   empty: { type:'empty', measureIndex, beatIndex }
 *     - 曲頭でまだ chord が現れていない slot
 *     - null / undefined ではなく明示的 semantic
 *   empty (projection, Phase68): { type:'empty', projectionEmpty:true, measureIndex }
 *     - pickup measure の visual leading slot
 *     - beatIndex を持たない（実beatではないため timing authority を持たない）
 *     - hover / cursor / seek の対象外（render側で data-visual-slot-index を付与しない）
 *
 * 【設計原則】
 *   - この関数の戻り値を GridViewModel に保存しないこと（render 時のみ生成）
 *   - carry slot は chord を複製しない（duplication 禁止）
 *   - slot 位置は CSS Grid が管理（slot が left% 等を持たない）
 *   - sourceSlotIndex は measure local index に限定（cross-measure は将来拡張）
 *
 * 【durationSlots の定義】
 *   「このonsetを含めて何slot継続するか」
 *   単発: 1 / 2拍継続: 2 / 3拍継続: 3 ...
 *   carry count ではないので注意（0始まりではない）
 *
 * 【Phase68: pickup-aware visual projection】
 *   pickupCtx?.enabled === true の場合、measure 0（mi===0）のみ以下を行う：
 *     1. actual slot space（measure.slots / actualSlotIndex）で onsetMap構築
 *     2. remapPickupOnsetMap() で visual slot space へ圧縮（onsetのみ）
 *     3. visual slot space 上で leadingOffset 個の projection-empty を先頭に配置
 *     4. visual slot space 上で carry を再生成
 *        （IMPORTANT: actual carry を直接 remap しない。
 *         canonical carry duration は actual slot space に基づくため、
 *         そのまま visual slot space へ持ち込むと
 *         圧縮後に duration の重複・伸長が発生する）
 *
 *   canonical timing（measure.startTime/endTime, beats, quantize結果）は
 *   一切変更しない。この関数の戻り値のみが visual slot space を表す
 *   （pickup measureに限る。他のmeasureは actual === visual）。
 *
 * @param {object[]} measures       - GridViewModel.measures
 * @param {number}   slotsPerMeasure
 * @param {object|null} pickupCtx
 * @param {boolean}     pickupCtx.enabled       - projection適用フラグ（_renderChartGrid側で確定済み）
 * @param {number}      pickupCtx.leadingOffset - projection-empty slot数（_renderChartGrid側で計算済み）
 * @returns {object[]}  slot semantic 配列（onset | carry | empty）
 */
export function expandToSlots(measures, slotsPerMeasure, pickupCtx = null) {
  const result = [];

  // onset が最後に現れた slot の情報（carry の source 追跡用）
  let lastOnsetMeasureLocal = null;  // measure 内 slot index（measure local）
  let lastOnsetChord        = null;  // onset chord（carry 検証用）
  let lastOnsetId           = null;  // [Phase77] onset の _id（carryへのdata-chord-id伝播用）
  let lastOnsetResultIndex  = -1;   // result[] 内の onset slot index（durationSlots 更新用）

  for (const measure of measures) {
    const mi = measure.index;

    // ── Phase68: pickup measure（mi===0）の visual projection ──────
    // pickupCtx.enabled は _renderChartGrid() 側で
    // mode/isPickup/timeSignature/actualBeats を確認済みの最終フラグ。
    // leadingOffset も _renderChartGrid() 側で一度だけ計算済み
    // （chartState.pickupLeadingOffset と同じ値。単一情報源）。
    const usesPickupProjection = (mi === 0 && pickupCtx?.enabled);
    const leadingOffset = usesPickupProjection ? pickupCtx.leadingOffset : 0;

    if (usesPickupProjection) {
      // ════════════════════════════════════════════════════
      // pickup measure — actual slot space → visual slot space
      //
      // canonical timing（measure.slots / quantize結果）は
      // 一切変更しない。この measure の result[] への push のみが
      // visual slot space を表す。
      // ════════════════════════════════════════════════════

      // Step A: actual slot space で onsetMap を構築（既存と同じ手順）
      const actualOnsetMap = new Map(
        measure.slots.map(s => [s.slotIndex, resolveCollision(s.onsets)])
      );

      // Step B: visual slot space へ remap（onsetのみ。collision解決込み）
      const visualOnsetMap = remapPickupOnsetMap(
        actualOnsetMap,
        slotsPerMeasure,
        leadingOffset
      );

      // Step C & D: visual slot space 上で result[] を構築
      // si は visualSlotIndex（0..slotsPerMeasure-1）として扱う。
      //   0..leadingOffset-1        → projection-empty
      //   leadingOffset..(N-1)      → visualOnsetMap を参照し
      //                                onset / carry / empty を再判定
      //
      // 【IMPORTANT: carry regeneration】
      //   visual slot space 内で「直前の visual onset」を追跡する
      //   ローカル変数（外側の lastOnsetXxx とは独立）を使う。
      //   canonical carry（actual slot space）は直接 remap しない。
      //   carry duration は actual slot space に基づくため、
      //   そのまま visual slot space へ持ち込むと
      //   圧縮後に duration の重複・伸長が発生する。
      //   onset ownership のみが projection 対象であり、
      //   carry ownership は visual slot space で再生成する。
      let pickupLastOnsetLocal       = null;
      let pickupLastOnsetChord       = null;
      let pickupLastOnsetId          = null;  // [Phase77] carryへのdata-chord-id伝播用
      let pickupLastOnsetResultIndex = -1;

      for (let si = 0; si < slotsPerMeasure; si++) {
        if (si < leadingOffset) {
          // ── projection-empty slot ────────────────────────
          // 実beatではない（曲のこの時点に対応する time が存在しない）。
          // beatIndex を持たない（timing authority を持たないことを
          // データレベルで保証する）。
          // hover / playback highlight / seek の対象外（render側で
          // data-visual-slot-index を付与しないことにより保証）。
          result.push({
            type: 'empty',
            projectionEmpty: true,
            measureIndex: mi,
          });
          continue;
        }

        const onset = visualOnsetMap.get(si);

        if (onset) {
          // ── visual onset slot ────────────────────────────
          if (pickupLastOnsetResultIndex >= 0) {
            const prevSlot = result[pickupLastOnsetResultIndex];
            prevSlot.durationSlots = result.length - pickupLastOnsetResultIndex;
          }

          // NOTE: beatIndex is visual slot space under pickup projection.
          // Do not treat as canonical quantized timing index.
          // canonical timing authority は measure.slots / actualSlotIndex 側にあり、
          // この関数はそれを公開しない（pickup measureに限る）。
          const slotData = {
            type:          'onset',
            measureIndex:  mi,
            beatIndex:     si,
            chord:         onset.chord,    // canonical（capo 変換しない）
            id:       onset.id ?? null,  // [Phase74-C] 編集UIのクリック選択用
            durationSlots: 1,              // 暫定値。次の onset 到達時に更新
          };
          result.push(slotData);

          pickupLastOnsetLocal       = si;
          pickupLastOnsetChord       = onset.chord;
          pickupLastOnsetId          = onset.id ?? null;
          pickupLastOnsetResultIndex = result.length - 1;

        } else if (pickupLastOnsetChord !== null) {
          // ── visual carry slot（visual slot space で再生成）──
          // NOTE: beatIndex is visual slot space under pickup projection.
          result.push({
            type:            'carry',
            measureIndex:    mi,
            beatIndex:       si,
            sourceSlotIndex: pickupLastOnsetLocal,  // visual slot space 上の index
            sourceChordId:   pickupLastOnsetId,     // [Phase77] 解析エディタのクリック選択用
          });

        } else {
          // ── visual empty slot（projection-empty ではない）──
          // visualOnsetMap に該当 onset がなく、まだ visual onset も
          // 現れていない（曲頭で chord 未確定の通常 empty と同義）
          result.push({
            type:         'empty',
            measureIndex: mi,
            beatIndex:    si,
          });
        }
      }

      // pickup measure の最後の onset の durationSlots を確定
      if (pickupLastOnsetResultIndex >= 0) {
        const prevSlot = result[pickupLastOnsetResultIndex];
        prevSlot.durationSlots = result.length - pickupLastOnsetResultIndex;
      }

      // ── 次の measure への carry 継承 ──────────────────────
      // pickup measure の最後の visual onset を「直前の onset」として継承する。
      //
      // lastOnsetResultIndex は -1 にリセットする:
      //   durationSlots の deferred-finalization は
      //   「次の onset 到達時に直前 onset の durationSlots を確定する」モデル。
      //   pickup measure 内で durationSlots は確定済みのため、
      //   次 measure（mi=1）の最初の onset 到達時に
      //   誤って pickup measure 内の onset を再確定してはならない。
      lastOnsetMeasureLocal = pickupLastOnsetLocal;
      lastOnsetChord        = pickupLastOnsetChord;
      lastOnsetId           = pickupLastOnsetId;  // [Phase77] 次measureのcarryへ継承
      lastOnsetResultIndex  = -1;

      continue; // 次の measure へ
    }

    // ════════════════════════════════════════════════════
    // 既存の通常経路（actual slot space === visual slot space）
    // ════════════════════════════════════════════════════

    // onset map: slotIndex → resolved onset
    const onsetMap = new Map(
      measure.slots.map(s => [s.slotIndex, resolveCollision(s.onsets)])
    );

    for (let si = 0; si < slotsPerMeasure; si++) {
      const onset = onsetMap.get(si);

      if (onset) {
        // ── onset slot ──────────────────────────────────────
        // 直前の onset の durationSlots を確定する
        // （次の onset が来た時点で「ここまでが継続」と分かる）
        if (lastOnsetResultIndex >= 0) {
          // 現在の result index との差分が前 onset の durationSlots
          const prevSlot = result[lastOnsetResultIndex];
          const currentResultIndex = result.length;
          prevSlot.durationSlots = currentResultIndex - lastOnsetResultIndex;
        }

        const slotData = {
          type:          'onset',
          measureIndex:  mi,
          beatIndex:     si,
          chord:         onset.chord,    // canonical（capo 変換しない）
          id:            onset.id ?? null,  // [Phase74-C] 編集UIのクリック選択用
          durationSlots: 1,              // 暫定値。次の onset 到達時に更新
        };
        result.push(slotData);
        lastOnsetMeasureLocal = si;
        lastOnsetChord        = onset.chord;
        lastOnsetId           = onset.id ?? null;
        lastOnsetResultIndex  = result.length - 1;

      } else if (lastOnsetChord !== null) {
        // ── carry slot ──────────────────────────────────────
        // chord は複製しない。sourceSlotIndex は measure local index
        result.push({
          type:            'carry',
          measureIndex:    mi,
          beatIndex:       si,
          sourceSlotIndex: lastOnsetMeasureLocal,  // measure local（0始まり）
          sourceChordId:   lastOnsetId,            // [Phase77] 解析エディタのクリック選択用（小節またぎ含む）
        });

      } else {
        // ── empty slot ──────────────────────────────────────
        // 曲頭でまだ chord が現れていない（null ではなく明示 semantic）
        result.push({
          type:         'empty',
          measureIndex: mi,
          beatIndex:    si,
        });
      }
    }
  }

  // 最後の onset の durationSlots を確定（曲末尾）
  if (lastOnsetResultIndex >= 0) {
    const prevSlot = result[lastOnsetResultIndex];
    prevSlot.durationSlots = result.length - lastOnsetResultIndex;
  }

  return result;
}

/**
 * expandCarryForward
 *
 * @deprecated Phase57 で expandToSlots() に置き換え。
 *   _renderChartGrid が Step2 で slot-loop 化されたら削除する。
 *   現時点では旧 renderer との互換維持のため残置。
 *
 * @param {object[]} measures  - GridViewModel.measures
 * @param {number}   slotsPerMeasure
 * @returns {{ measureIndex: number, slotIndex: number, chord: string | null }[]}
 */
export function expandCarryForward(measures, slotsPerMeasure) {
  const result = [];
  let lastChord = null;

  for (const measure of measures) {
    const onsetMap = new Map(
      measure.slots.map(s => [s.slotIndex, resolveCollision(s.onsets)])
    );

    for (let si = 0; si < slotsPerMeasure; si++) {
      const onset = onsetMap.get(si);
      if (onset) {
        lastChord = onset.chord;
      }
      result.push({
        measureIndex: measure.index,
        slotIndex:    si,
        chord:        lastChord,
      });
    }
  }

  return result;
}

// ────────────────────────────────────────
// Chart Mode UI state
// ────────────────────────────────────────

// コード名 compact 表示の文字数閾値（layout heuristic）
const COMPACT_CHORD_LENGTH = 8;

// ────────────────────────────────────────────────────
// Phase68: pickup measure の projection-empty slot に表示する休符glyph
// pure visual projection（canonical tokenではない・project.linesに保存しない）。
// 8分休符を簡略化したSVG。currentColor使用でテーマ追従（dark/silver/blue対応）。
// aria-hidden: 休符glyphは装飾であり、screen readerに読み上げさせない
//   （projection-empty slot自体がtiming authorityを持たないため）。
// ────────────────────────────────────────────────────
const PICKUP_REST_GLYPH_SVG = `<svg class="chart-rest-glyph" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 4 L15 10 L11 14 Q14 14 14 17 Q14 20 11 20 Q8 20 8 17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const chartState = {
  active:   false,
  viewModel: null,  // buildGridViewModel の戻り値
  lastScrolledMeasure: -1,

  // Phase68: pickup-aware visual projection
  // measure0にprojection適用時のleadingOffset（visual slot数）。
  // 0 の場合は projection非適用（updateChartPlaybackでのremap不要）。
  // _renderChartGrid() 呼び出し毎に再計算・更新される。
  // projection authorityはここに集約される（expandToSlots/updateChartPlayback共通）。
  pickupLeadingOffset: 0,

  // Phase74-C: 解析編集モードの選択状態（表示用）
  // [OWNERSHIP] 選択の正本は app.js の analysisEditor.selection。
  // ここはハイライト描画のためのローカル表示状態（描画のたびに app.js から同期される）。
  selectedChordIds: new Set(),

  // Phase77後半: editPoint（挿入位置）マーカー（表示用）
  // [OWNERSHIP] 正本は app.js の analysisEditor.selection.editPoint。
  // { measureIndex, slotIndex } または null。
  // TODO(Phase78): [BOUNDARY DECORATOR] へ統合予定（暫定実装）。
  editPointMarker: null,

  // [Phase78.1 Hotfix] 直前にクリックしたセルの記録。
  // [UI INTERACTION CACHE — NOT AN AUTHORITY]
  // これは selection や editPoint のような正本ではなく、クリックハンドラが
  // 「同じセルへの2回目のクリックかどうか」を判定するためだけのUI判定専用キャッシュ。
  // 継続セル（同一chordIdが複数小節にまたがる）で、chordIdだけを条件にすると
  // 別のセルをクリックしただけでも「同じコードへの2回目」と誤判定され、
  // 意図せずeditPointへ入ってしまう不具合があったため、
  // slotIndex/measureIndexまで一致する場合のみ「同じセル」とみなすようにする。
  // { chordId, slotIndex, measureIndex } または null。
  _lastClickedSlot: null,
};

/**
 * setTooltipEnabled — tooltip の ON/OFF を切り替える
 * app.js の表示メニューから呼ぶ。
 * @param {boolean} enabled
 */
export function setTooltipEnabled(enabled) {
  _tooltipEnabled = enabled;
  if (!enabled) _hideTooltip();
}

/**
 * setSelectedChordIds — 選択中コードのハイライト描画を更新する（Phase74-C）
 *
 * [OWNERSHIP] 選択状態の正本は app.js の analysisEditor.selection。
 * ここは描画用のローカル表示状態を更新するだけ。
 * 呼び出し後は renderChartMode() で再描画が必要。
 *
 * @param {string[]} ids - 選択中の chord._id の配列
 */
export function setSelectedChordIds(ids) {
  chartState.selectedChordIds = new Set(ids);
}

/**
 * setEditPointMarker — editPointマーカー（表示用）を更新する
 *
 * [OWNERSHIP] 正本は app.js の analysisEditor.selection.editPoint。
 * ここは描画用のローカル表示状態を更新するだけ。
 * 呼び出し後は renderChartMode() で再描画が必要。
 *
 * @param {{measureIndex: number, slotIndex: number}|null} marker
 */
export function setEditPointMarker(marker) {
  chartState.editPointMarker = marker ?? null;
}

// ────────────────────────────────────────
// 注入変数
// ────────────────────────────────────────

let _getAnalysis      = null;  // () => project.analysis（header/fallback 表示用）
let _getNormalized    = null;  // () => project.analysis?.normalized（timing pipeline 用）
let _getAudioEl       = null;  // () => aEl
let _getAudioDuration = null;  // () => aEl.duration
let _getCapo          = null;  // () => number（カポ値）
let _transposeChord   = null;  // (chord, semitones) => string
let _seekTo           = null;  // (time: number) => void（app.js が aEl.currentTime を設定）
let _findChord        = null;  // (chord) => entry（tooltip diagram 用）
let _drawDiagram      = null;  // (frets, barre, options) => SVG string（tooltip diagram 用）

// Phase72-B: manual timing correction コールバック
// [OWNERSHIP] repairRule の保存・project.analysis 更新・Chart 再描画は
// app.js が責務を持つ。chartmode.js は「ユーザーが何を選んだか」を
// コールバック経由で通知するだけで、persistence layer に直接触らない。
let _onSetRepairRule   = null;  // (beatTime: number) => void
let _onClearRepairRule = null;  // () => void

// Phase74-C: 解析編集モード連携
// Phase76-A: 第2引数にshiftKey押下有無を追加（範囲選択用）
let _onChordSelected   = null;        // (id: string, isShiftKey: boolean) => void
let _isEditingAnalysis = () => false; // () => boolean（編集モード中かどうかをapp.jsへ問い合わせる）
// Phase77後半: editPoint（挿入位置）確定リクエスト
// ownerIdはコード起因のクリック時のみ渡す（空セルクリック時はnull＝
// 時刻ベースでbuffer側がオーナーを特定する）
let _onEditPointRequested = null; // (ownerId: string|null, measureIndex: number, slotIndex: number) => void

// ── tooltip state ──────────────────────────────────────────
// [EPHEMERAL UI] tooltip は chartState に authority を持たない。
// hover event → render だけで完結する。state 化しない。
let _tooltipEl        = null;  // single instance tooltip DOM（body直下）
let _tooltipBound     = false; // event delegation 登録済みフラグ（idempotent guard）
let _tooltipEnabled   = true;  // ON/OFF（app.js が localStorage から初期化）

// リスナー重複登録防止フラグ（hot reload / re-init 対策）
let _gridClickSeekBound = false;

// ── perf instrumentation（Phase70-A）──────────────────────
// [DEBUG LAYER INVARIANT] runtime state はここ（chartmode.js）が所有する。
// __CS_DEBUG__.perf は getPerfState() の getter projection のみ（state非所有）。
//
// _lastFrameTime: instrumentation内部専用（dt計算用）。
//   getPerfState() の公開対象外。
//
// 計測スコープ: Chart Mode が open 中のみ（_rafLoop と同じ）。
// open毎に _resetPerfState() でリセットされる
//   （tab inactive → open 直後の巨大dtがstall判定に混入するのを防ぐため、
//    リセット後の最初のフレームは dt 計測をスキップする）。
const LONG_FRAME_THRESHOLD_MS = 33; // 30fps相当（1フレーム遅延の目安）
const LONG_FRAME_LOG_MAX       = 20; // リングバッファ上限

let _lastFrameTime = null; // performance.now()基準。null = 計測スキップ（リセット直後）

let _perfState = {
  lastRAFDelta: null,  // 直前フレームのdt（ms）
  maxRAFDelta:  null,  // セッション内の最大dt（ms）
  longFrames:   0,     // LONG_FRAME_THRESHOLD_MS超えの累積カウント
  longFrameLog: [],    // 直近 LONG_FRAME_LOG_MAX 件の { timestamp, delta }
};

/**
 * _resetPerfState — perf instrumentation を初期状態へ戻す
 * openChartMode() から呼ぶ。
 */
function _resetPerfState() {
  _lastFrameTime = null;
  _perfState = {
    lastRAFDelta: null,
    maxRAFDelta:  null,
    longFrames:   0,
    longFrameLog: [],
  };
}

/**
 * _recordFrame — _rafLoop から毎フレーム呼ぶ。dtを計測しperfStateへ反映する。
 * リセット直後（_lastFrameTime===null）の最初のフレームは計測をスキップする。
 */
function _recordFrame(now) {
  if (_lastFrameTime == null) {
    _lastFrameTime = now;
    return;
  }
  const delta = now - _lastFrameTime;
  _lastFrameTime = now;

  _perfState.lastRAFDelta = delta;
  _perfState.maxRAFDelta  = _perfState.maxRAFDelta == null
    ? delta
    : Math.max(_perfState.maxRAFDelta, delta);

  if (delta > LONG_FRAME_THRESHOLD_MS) {
    _perfState.longFrames++;
    _perfState.longFrameLog.push({ timestamp: now, delta });
    if (_perfState.longFrameLog.length > LONG_FRAME_LOG_MAX) {
      _perfState.longFrameLog.shift();
    }
  }
}

/**
 * getPerfState — perf instrumentation の getter projection（export）
 *
 * [DEBUG LAYER INVARIANT] state は所有せず、shallow clone を返す。
 * longFrameLog は配列のため、参照漏れ防止のため個別にコピーする。
 */
export function getPerfState() {
  return {
    ..._perfState,
    longFrameLog: [..._perfState.longFrameLog],
  };
}
// ──────────────────────────────────────────────────────────

// ── rAF playback loop ──────────────────────────────────────
// Chart Mode が open 中のみ走る描画ループ。
//
// authority 分離:
//   audio engine (aEl.currentTime) = source of truth
//   rAF                            = visual update authority
//   timeupdate                     = line highlight / perform 等の通知のみ
//
// interpolation / 補間は行わない。
// 毎フレーム aEl.currentTime を読むだけ。
// → playbackRate / seek / tab throttle に対して安全。
//
// pause / seeked / ended 時は app.js が単発で updateChartPlayback() を呼ぶ。

let _rafId      = null;   // requestAnimationFrame の戻り値
let _rafRunning = false;  // ループ稼働フラグ

function _startRafLoop() {
  if (_rafRunning) return;          // 多重起動ガード（open連打・re-init 対策）
  cancelAnimationFrame(_rafId);     // 念のため既存 ID をキャンセル
  _rafRunning = true;
  _rafLoop();
}

function _stopRafLoop() {
  _rafRunning = false;
  cancelAnimationFrame(_rafId);
  _rafId = null;
}

function _rafLoop() {
  if (!_rafRunning) return;
  _recordFrame(performance.now());
  const aEl = _getAudioEl?.();
  if (aEl) updateChartPlayback(aEl.currentTime);
  _rafId = requestAnimationFrame(_rafLoop);
}
// ──────────────────────────────────────────────────────────

/**
 * initChartMode
 *
 * app.js から依存を注入する。
 *
 * @param {object} deps
 * @param {Function} deps.getAnalysis        - () => project.analysis
 * @param {Function} deps.getAudioEl         - () => aEl
 * @param {Function} deps.getAudioDuration   - () => aEl.duration
 * @param {Function} deps.getCapo            - () => number（現在のカポ値）
 * @param {Function} deps.transposeChord     - (chord, semitones) => string
 * @param {Function} [deps.seekTo]           - (time: number) => void（Phase60: click seek）
 *                                             app.js が aEl.currentTime を設定する責務を持つ。
 *                                             chartmode.js は aEl に直接触らない。
 * @param {Function} [deps.onSetRepairRule]  - (beatTime: number) => void（Phase72-B）
 *                                             右クリック「ここを小節頭にする」選択時に呼ぶ。
 *                                             app.js が保存・再描画を担う。
 * @param {Function} [deps.onClearRepairRule]- () => void（Phase72-B）
 *                                             右クリック「補正を解除」選択時に呼ぶ。
 *                                             app.js が null保存・再描画を担う。
 */
export function initChartMode({ getAnalysis, getNormalized, getAudioEl, getAudioDuration, getCapo, transposeChord, seekTo, findChord, drawDiagram, tooltipEnabled, onSetRepairRule, onClearRepairRule, onChordSelected, isEditingAnalysis, onEditPointRequested }) {
  _getAnalysis       = getAnalysis;
  _getNormalized     = getNormalized;
  _getAudioEl        = getAudioEl;
  _getAudioDuration  = getAudioDuration;
  _getCapo           = getCapo;
  _transposeChord    = transposeChord;
  _seekTo            = seekTo ?? null;
  _findChord         = findChord  ?? null;
  _drawDiagram       = drawDiagram ?? null;
  _tooltipEnabled    = tooltipEnabled ?? true;
  _onSetRepairRule   = onSetRepairRule  ?? null;
  _onClearRepairRule = onClearRepairRule ?? null;

  // Phase74-C: 解析編集モード連携
  // [OWNERSHIP] 編集state（analysisEditor）はapp.jsが持つ。
  // chartmode.jsはクリック検出と選択ハイライト描画のみを担当する。
  _onChordSelected   = onChordSelected ?? null;
  _isEditingAnalysis = isEditingAnalysis ?? (() => false);
  _onEditPointRequested = onEditPointRequested ?? null;

  // Phase60: click seek イベント登録
  _setupGridClickSeek();
}

// ────────────────────────────────────────
// Phase67: hover chord diagram tooltip
// ────────────────────────────────────────
//
// [設計原則]
//   ephemeral UI: chartState に authority を持たない。
//   hover event → render だけで完結。state 化しない。
//   single instance: body 直下に1個だけ tooltip DOM を持つ。
//   delegation: chart-grid root への pointerover/out で委譲（idempotent）。
//   data-chord: 表示済み chord 名（projection 済み）を authority とする。
//              tooltip 側は capo 再適用しない（二重 projection 防止）。

/**
 * _initTooltip — tooltip DOM を body 直下に生成する
 * openChartMode() から呼ぶ。
 */
function _initTooltip() {
  if (_tooltipEl) return; // 既に存在する場合はスキップ
  const el = document.createElement('div');
  el.className = 'chart-diag-tooltip';
  el.style.display = 'none';
  document.body.appendChild(el);
  _tooltipEl = el;
}

/**
 * _destroyTooltip — tooltip DOM を body から削除する
 * closeChartMode() から呼ぶ。orphan DOM 防止。
 */
function _destroyTooltip() {
  if (_tooltipEl) {
    _tooltipEl.remove();
    _tooltipEl = null;
  }
}

/**
 * _showTooltip — tooltip を表示する
 * @param {string} chord  data-chord から取得した表示済み chord 名
 * @param {DOMRect} anchorRect  anchor element の getBoundingClientRect()
 */
function _showTooltip(chord, anchorRect) {
  if (!_tooltipEl || !_findChord || !_drawDiagram) return;

  const entry = _findChord(chord);
  if (!entry || !entry.data?.v?.length) {
    _hideTooltip();
    return;
  }

  // NOTE: tooltip は現在 first variant を使用。
  // 将来 variant selection policy を統一予定（右パネルとの整合）。
  const vr = entry.data.v[0];
  if (!vr) { _hideTooltip(); return; }

  const svg = _drawDiagram(vr.f, vr.b ?? 0, { scale: 0.9 });

  // コード名 title + SVG diagram
  // title responsibility は tooltip shell 側（renderer に持たせない）
  const safeChord = chord.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  _tooltipEl.innerHTML = `<div class="chart-diag-tooltip-title">${safeChord}</div>${svg}`;

  // 先に visible にして実サイズを取得（overflow 判定のため）
  _tooltipEl.style.visibility = 'hidden';
  _tooltipEl.style.display    = 'block';

  const tipRect = _tooltipEl.getBoundingClientRect();
  const MARGIN  = 8;

  // 基本位置: anchor の中央下
  let left = anchorRect.left + (anchorRect.width / 2) - (tipRect.width / 2);
  let top  = anchorRect.bottom + MARGIN;

  // 右 overflow → 左方向にずらす
  if (left + tipRect.width > window.innerWidth) {
    left = window.innerWidth - tipRect.width - MARGIN;
  }
  // 左 overflow guard
  if (left < MARGIN) left = MARGIN;
  // 下 overflow → anchor の上側へ
  if (top + tipRect.height > window.innerHeight) {
    top = anchorRect.top - tipRect.height - MARGIN;
  }
  // 上 overflow guard
  if (top < MARGIN) top = MARGIN;

  _tooltipEl.style.left       = left + 'px';
  _tooltipEl.style.top        = top  + 'px';
  _tooltipEl.style.visibility = 'visible';
}

/**
 * _hideTooltip — tooltip を非表示にする
 */
function _hideTooltip() {
  if (_tooltipEl) {
    _tooltipEl.style.display    = 'none';
    _tooltipEl.style.visibility = 'visible'; // 次回表示用にリセット
  }
}

/**
 * _setupTooltipEvents — chart-grid に tooltip イベントを委譲登録する（idempotent）
 * openChartMode() → _initTooltip() の後に呼ぶ。
 *
 * pointerover/out + relatedTarget guard を使用する。
 * 理由: pointerenter は bubble しないため delegation 不可。
 *       pointerover は bubble するため root での委譲と相性が良い。
 */
function _setupTooltipEvents() {
  if (_tooltipBound) return; // idempotent guard

  const grid = document.getElementById('chart-grid');
  if (!grid) return;

  grid.addEventListener('pointerover', e => {
    if (!_tooltipEnabled) return;

    const to = e.target.closest('.chart-chord-name[data-chord]');
    if (!to) {
      _hideTooltip();
      return;
    }

    // 移動元も同じ chord-name なら無視（chord 内の細かい移動）
    const from = e.relatedTarget?.closest?.('.chart-chord-name[data-chord]');
    if (from === to) return;

    // carry-forward で span が小節をまたいで広がっている場合、
    // テキスト表示部分以外はhover無効にする。
    // scrollWidth = テキストの実際の内容幅（overflow前の幅）を使用。
    // getBoundingClientRect().width より正確にテキスト幅を反映する。
    const rect = to.getBoundingClientRect();
    const MARGIN = 16; // テキスト右側の余白
    const textZone = to.scrollWidth + MARGIN;
    if (e.clientX > rect.left + textZone) {
      _hideTooltip();
      return;
    }

    _showTooltip(to.dataset.chord, to.getBoundingClientRect());
  });

  grid.addEventListener('pointerout', e => {
    const from = e.target.closest('.chart-chord-name[data-chord]');
    if (!from) return;

    // 移動先も同じ chord-name なら無視（chord 内の細かい移動）
    const to = e.relatedTarget?.closest?.('.chart-chord-name[data-chord]');
    if (to === from) return;

    _hideTooltip();
  });

  _tooltipBound = true;
}

// ────────────────────────────────────────
// Phase60: click seek
// ────────────────────────────────────────

/**
 * _setupGridClickSeek
 *
 * chart-grid への click イベントを委譲登録する（1回のみ）。
 * .chart-measure クリック → normalized measure model の startTime → _seekTo() 経由でシーク。
 *
 * 【seek authority ルール（Phase60確立）】
 *   chartmode.js は raw downbeats を直接参照しない。
 *   normalized timing pipeline の結果として生成された measure model の
 *   startTime のみを seek 基準とする。
 *   これにより将来の pickup correction / repair projection / manual timing override が
 *   seek 動作に自動的に反映される。
 *
 * 【click target ルール】
 *   e.target.closest('.chart-measure') に固定する。
 *   chart-slot / chart-chord-name / playhead overlay など内部構造の変更に依存しない。
 *   measureIndex は data-measure-index 属性のみから取得する。
 *
 * 【重複登録防止】
 *   _gridClickSeekBound フラグで hot reload / re-init 時のリスナー増殖を防ぐ。
 *   event delegation のため listener は1個で全 measure に追従する。
 */
function _setupGridClickSeek() {
  if (_gridClickSeekBound) return;

  const grid = document.getElementById('chart-grid');
  if (!grid) return;

  _gridClickSeekBound = true;

  grid.addEventListener('click', e => {

    // ── Phase74-C: 編集モード中はコード選択を優先する ──
    // [Phase77] onset（.chart-chord-name）・carry（.chart-slot、小節またぎ含む）の
    // 両方をdata-chord-id属性のみで判定する（DOM構造への依存をなくす）。
    // [Phase77後半] 二段階クリックモデル：
    //   1クリック目 → 選択（従来通り）
    //   既に単独選択中のコードへの2クリック目 → editPoint（挿入位置）へ移行
    //   data-chord-idを持たない空セル（曲頭の無音区間等）→ 直接editPointへ
    //   （空セルには「選択」という概念が無いため2段階を経ない）
    if (_isEditingAnalysis() && _onChordSelected) {
      const chordEl   = e.target.closest('[data-chord-id]');
      const measureEl = e.target.closest('.chart-measure[data-measure-index]');
      const measureIndex = measureEl ? Number(measureEl.dataset.measureIndex) : null;

      // [Phase78.2 Hotfix] slotIndexをDOM祖先(closest)からではなく、
      // クリック座標から算出するよう変更する。
      //
      // 理由: onsetのコード名ラベル(.chart-chord-name)はCSSで
      // --duration-slots 個分の幅までposition:absoluteで右へ伸びる
      // （同一小節内で複数拍にまたがって視覚的に表示されるため）。
      // しかしDOM構造上は、そのラベルは常にonset自身のslot（通常beatIndex=0）
      // の子要素のままである。
      // そのため、視覚的に離れた拍（例: 4拍目）をクリックしても、
      // closest('.chart-slot[data-visual-slot-index]')で辿ると
      // 必ずonset自身のslotIndexに解決されてしまい、
      // 同一小節内でのeditPoint位置指定が常にonset付近になる
      // バグがあった（実機フィードバックで発覚。「時間が足りません」の頻発として現れていた）。
      //
      // [PROJECTION INVARIANT維持] projectionEmpty slot（pickup小節の
      // 先頭埋め草）は、クリック座標がその領域に入った場合は
      // 従来通りslotIndexをnullのまま扱い、interaction対象外にする
      // （architecture.md §9.5の不可侵性を維持する）。
      let slotIndex = null;
      if (measureEl && !e.target.closest('.chart-slot--projection-empty')) {
        const spm = chartState.viewModel?.model?.slotsPerMeasure;
        if (spm) {
          const rect = measureEl.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          slotIndex = Math.min(Math.max(Math.floor(ratio * spm), 0), spm - 1);
        }
      }

      if (chordEl) {
        const chordId = chordEl.dataset.chordId;
        if (chordId) {
          // [Phase78.1 Hotfix] 継続セル（同一chordIdが複数小節にまたがる）で、
          // 別のセルをクリックしただけなのにeditPointへ入ってしまう不具合を修正。
          // 「同じコード」だけでなく「直前クリックと同じセル（slotIndex/measureIndex）」
          // である場合のみ、2クリック目＝editPointとみなす。
          const last = chartState._lastClickedSlot;
          const isSameSingleSelection = !e.shiftKey
            && chartState.selectedChordIds.size === 1
            && chartState.selectedChordIds.has(chordId)
            && last
            && last.chordId === chordId
            && last.slotIndex === slotIndex
            && last.measureIndex === measureIndex;

          chartState._lastClickedSlot = { chordId, slotIndex, measureIndex };

          if (isSameSingleSelection && _onEditPointRequested
              && measureIndex !== null && slotIndex !== null) {
            _onEditPointRequested(chordId, measureIndex, slotIndex);
            return;
          }
          _onChordSelected(chordId, e.shiftKey);
          return;
        }
      }

      // data-chord-idを持たない＝空セル（曲頭の無音区間等）。
      // オーナーはtime基準でapp.js側のbufferが特定するためownerId=nullで渡す。
      if (_onEditPointRequested && measureIndex !== null && slotIndex !== null) {
        _onEditPointRequested(null, measureIndex, slotIndex);
        return;
      }

      // 編集モード中はコード以外のクリックでseekさせない
      return;
    }

    // ── 通常時: クリックシーク ──
    if (!_seekTo) return;

    // click target ルール: .chart-measure 全域で固定（内部構造変更に依存しない）
    const measureEl = e.target.closest('.chart-measure');
    if (!measureEl) return;

    const mi = Number(measureEl.dataset.measureIndex);
    if (!Number.isFinite(mi)) return;

    const vm = chartState.viewModel;
    if (!vm?.model || vm.model.mode === 'fallback') return;

    // seek authority: normalized pipeline の結果として生成された measure model を参照する
    // raw downbeats を直接使わない（将来の correction / override が自動反映されるため）
    const startTime = vm.model.getMeasure(mi)?.startTime;
    if (!Number.isFinite(startTime)) return;  // NaN / undefined ガード（degraded analysis 対策）

    _seekTo(startTime);
  });
}

// ────────────────────────────────────────
// Phase72-B: 右クリックコンテキストメニュー（manual timing correction UI）
// ────────────────────────────────────────
//
// [設計原則]
//   ephemeral UI: chartState に authority を持たない。
//   右クリック event → メニュー表示 → 選択 → コールバック通知 で完結。
//   repairRule の保存・project.analysis 更新・再描画は app.js の責務。
//
// [slot → beatTime 変換の根拠]
//   repairRule.beatTime は raw.beats に実在する値（Phase72-A確定）。
//   クリックしたスロットが属する「拍の頭」の時刻を求めるため:
//     1. data-visual-slot-index から「measure内の何拍目か」を計算
//        （resolutionPerBeat=2なら slot/2 の整数部が拍番号）
//     2. measure.startTime から beats[] 上の対応インデックスを求める
//     3. beats[startBeatIdx + beatInMeasure] = beatTime
//   後半スロット（beat0の0.5秒後等）を右クリックしても、
//   その拍の頭の時刻が正しく取得される。

let _contextMenuEl      = null;  // single instance（body直下）
let _contextMenuBound   = false; // idempotent guard

/**
 * _getBeatTimeFromSlot
 *
 * クリックされたスロットから repairRule.beatTime を逆引きする。
 *
 * @param {number} measureIndex      - 0-based measure index
 * @param {number} visualSlotIndex   - 0-based visual slot index（within measure）
 * @param {object} model             - TimingModel（createTimingModel の戻り値）
 * @param {number[]} beats           - analysis.beats（raw.beats をsanitize済み）
 * @param {object} timeSignature     - analysis.timeSignature（{ numerator, denominator }）
 * @returns {number|null}  beatTime（raw.beats 上の値）または null（逆引き失敗）
 */
function _getBeatTimeFromSlot(measureIndex, visualSlotIndex, model, beats, timeSignature) {
  const measure = model.getMeasure(measureIndex);
  if (!measure) return null;

  // measure.startTime に対応する beats[] のインデックスを求める
  // [ASSUMPTION] measure.startTime は必ず beats[] のいずれかと一致する
  //（applyAnchorRepair が after.push(beats[i]) で生成するため）
  const EPS = 1e-6;
  const startBeatIdx = beats.findIndex(b => Math.abs(b - measure.startTime) < EPS);
  if (startBeatIdx === -1) return null;  // invariant violation

  // [Phase72-B 修正: ChatGPTレビュー指摘対応]
  // resolutionPerBeat は measure.beatCount（repair後は小節ごとに変わりうる）
  // からではなく、timeSignature.numerator（固定値）から算出する。
  // model.slotsPerMeasure = timeSignature.numerator × resolutionPerBeat
  // （createTimingModel 内で固定の timeSignature を使って算出されているため、
  //   repairによる不揃い小節があっても resolutionPerBeat 自体は変わらない）
  const numerator = timeSignature?.numerator || 4;
  const resolutionPerBeat = model.slotsPerMeasure / numerator;

  // visual slot index → measure 内の拍番号
  const beatInMeasure = Math.floor(visualSlotIndex / resolutionPerBeat);

  const globalBeatIdx = startBeatIdx + beatInMeasure;
  return beats[globalBeatIdx] ?? null;
}

/**
 * _getExactTimeFromSlot — グリッド座標（measureIndex, visualSlotIndex）から
 * サブビート精度の実時刻を算出する（Phase77後半・editPoint用）。
 *
 * _getBeatTimeFromSlot() との違い：
 *   _getBeatTimeFromSlot()は拍単位に丸める（repairRule.beatTimeがraw.beats[]の
 *   実在値でなければならないという別の制約のため）。
 *   本関数はeditPoint（挿入位置指定）用に、小節の開始/終了時刻を
 *   スロット比率で線形補間し、サブビート位置を保持する。
 *
 * [KNOWN LIMITATION] pickup小節（visual slot space ≠ canonical slot space）では
 * 厳密な逆変換ではなく近似値になる（projectPickupSlotIndexの逆関数が未実装のため）。
 * 実曲でのpickup検証は既存のOpen Item（current-issues.md参照）と同様、未実施。
 *
 * @param {number} measureIndex
 * @param {number} visualSlotIndex
 * @param {object} model - TimingModel（createTimingModel の戻り値）
 * @returns {number|null}
 */
function _getExactTimeFromSlot(measureIndex, visualSlotIndex, model) {
  const measure = model.getMeasure(measureIndex);
  if (!measure) return null;
  const slotsPerMeasure = model.slotsPerMeasure;
  if (!slotsPerMeasure) return null;
  const ratio = visualSlotIndex / slotsPerMeasure;
  return measure.startTime + (measure.endTime - measure.startTime) * ratio;
}

/**
 * getTimeForGridPosition — app.js側から呼び出すための公開ラッパー。
 * [OWNERSHIP] TimingModelの生成・保持はchartmode.jsの責務（app.jsは直接触らない）。
 * editPointは{measureIndex, slotIndex}のみを保持し（[EDIT POINT AUTHORITY]）、
 * splitTimeが必要なコマンド実行の直前に、この関数を都度呼び出して算出する。
 *
 * @param {number} measureIndex
 * @param {number} visualSlotIndex
 * @returns {number|null}
 */
export function getTimeForGridPosition(measureIndex, visualSlotIndex) {
  const vm = chartState.viewModel;
  if (!vm?.model || vm.model.mode === 'fallback') return null;
  return _getExactTimeFromSlot(measureIndex, visualSlotIndex, vm.model);
}

/**
 * _showContextMenu
 *
 * 右クリックメニューを表示する。
 *
 * @param {number}   beatTime   - 「ここを小節頭にする」で設定するbeatTime
 * @param {boolean}  hasRepair  - 現在補正が設定されているか（解除項目の表示制御）
 * @param {number}   clientX    - クリック位置X（viewport座標）
 * @param {number}   clientY    - クリック位置Y（viewport座標）
 */
function _showContextMenu(beatTime, hasRepair, clientX, clientY) {
  _hideContextMenu();  // 既存を閉じてから生成

  const menu = document.createElement('div');
  menu.className = 'chart-context-menu';

  // 「ここを小節頭にする」項目
  const setItem = document.createElement('div');
  setItem.className = 'chart-context-item';
  setItem.textContent = '📍 ここを小節頭にする';
  setItem.addEventListener('click', () => {
    _hideContextMenu();
    _onSetRepairRule?.(beatTime);
  });
  menu.appendChild(setItem);

  // 「補正を解除」項目（補正中の場合のみ表示）
  if (hasRepair) {
    // Phase72-C: 項目間の区切り線（hasRepairの時のみ必要）
    const divider = document.createElement('div');
    divider.className = 'chart-context-divider';
    menu.appendChild(divider);

    const clearItem = document.createElement('div');
    clearItem.className = 'chart-context-item chart-context-item--clear';
    clearItem.textContent = '🔄 小節補正を解除';
    clearItem.addEventListener('click', () => {
      _hideContextMenu();
      _onClearRepairRule?.();
    });
    menu.appendChild(clearItem);
  }

  // 位置決め（viewport右端・下端からはみ出さないよう調整）
  menu.style.position = 'fixed';
  menu.style.zIndex   = '9999';
  menu.style.left     = clientX + 'px';
  menu.style.top      = clientY + 'px';
  document.body.appendChild(menu);
  _contextMenuEl = menu;

  // 右端・下端 overflow 補正（DOM追加後にサイズが確定するため）
  const rect = menu.getBoundingClientRect();
  const MARGIN = 8;
  if (rect.right > window.innerWidth) {
    menu.style.left = (clientX - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (clientY - rect.height) + 'px';
  }
}

/**
 * _hideContextMenu — コンテキストメニューを非表示にして DOM を削除する
 */
function _hideContextMenu() {
  if (_contextMenuEl) {
    _contextMenuEl.remove();
    _contextMenuEl = null;
  }
}

/**
 * _setupContextMenu
 *
 * contextmenu イベントを document に委譲登録する（idempotent、一度だけ呼ばれる）。
 * openChartMode() から呼ぶ。
 *
 * [Phase72-B 修正: ChatGPTレビュー指摘対応]
 *   grid要素に直接 addEventListener する方式は、#chart-grid のDOMが
 *   何らかの理由で再生成された場合（innerHTML全置換ではなく要素自体の
 *   差し替えが将来発生した場合）、イベントが古い要素に残ったままになり
 *   「右クリックメニューが突然出なくなる」不具合になりうる。
 *   document への委譲に切り替えることで、grid要素のライフサイクルに
 *   依存しない構造にする。Chart Mode が非アクティブな時は
 *   chartState.active のガードで無効化する。
 */
function _setupContextMenu() {
  if (_contextMenuBound) return;
  _contextMenuBound = true;

  // contextmenu イベントを document に委譲登録
  document.addEventListener('contextmenu', e => {
    if (!chartState.active) return;       // Chart Mode 非アクティブなら無視
    if (!_onSetRepairRule) return;         // コールバック未注入なら無視

    // .chart-slot を対象とする（projectionEmpty slot は data-visual-slot-index がないため自然に除外される）
    const slotEl    = e.target.closest('.chart-slot[data-visual-slot-index]');
    const measureEl = e.target.closest('.chart-measure[data-measure-index]');
    if (!slotEl || !measureEl) return;

    e.preventDefault();  // ブラウザ標準メニューを抑制

    const mi             = Number(measureEl.dataset.measureIndex);
    const visualSlotIdx  = Number(slotEl.dataset.visualSlotIndex);
    if (!Number.isFinite(mi) || !Number.isFinite(visualSlotIdx)) return;

    const vm = chartState.viewModel;
    if (!vm?.model || vm.model.mode === 'fallback') return;

    const analysis = _getAnalysis?.();
    if (!analysis) return;

    // slot → beatTime 逆引き
    const beatTime = _getBeatTimeFromSlot(mi, visualSlotIdx, vm.model, analysis.beats ?? [], analysis.timeSignature);
    if (beatTime == null) return;

    const hasRepair = !!analysis.repairRule;
    _showContextMenu(beatTime, hasRepair, e.clientX, e.clientY);
  });

  // メニュー外クリックで閉じる
  document.addEventListener('click', e => {
    if (_contextMenuEl && !_contextMenuEl.contains(e.target)) {
      _hideContextMenu();
    }
  });

  // Escape でも閉じる
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _contextMenuEl) {
      _hideContextMenu();
    }
  });
}

// ────────────────────────────────────────
// Phase74-C: 編集モードトグルボタン
// ────────────────────────────────────────

/**Phase74-Cに削除予定のためコメントアウト
 * _setupEditModeBtn — Chart Modeヘッダーに編集モードトグルボタンを追加する
 *
 * openChartMode() から呼ぶ（idempotent）。
 * ボタンは #chart-header 内に1つだけ生成される。
 * クリック時は app.js 側の beginAnalysisEdit / endAnalysisEdit を
 * _onChordSelected と同様にコールバック経由で呼ぶのではなく、
 * ここでは DOM イベントを発火するだけにする。
 * app.js 側の btn-analysis-edit ハンドラーが実際の処理を担う。
 */


/**
 * updateChartEditModeUI — 編集モードの状態に合わせてヘッダーUIを更新する
 *
 * beginAnalysisEdit / endAnalysisEdit 後に app.js から呼ぶ。
 * @param {boolean} editing
 */


// ────────────────────────────────────────
// Chart Mode 開閉
// ────────────────────────────────────────

/**
 * openChartMode
 *
 * Chart Mode オーバーレイを開く。
 * buildGridViewModel を実行して chartState.viewModel をセットする。
 */
export function openChartMode() {
  const analysis = _getAnalysis?.();
  if (!analysis) return;

  const duration = _getAudioDuration?.() || null;
  // [OWNERSHIP] analysis は app.js が project.analysis を注入する。
  // chartmode.js は project tree を直接読まない。
  // analysis.normalized が runtime cache として含まれている（analysisLoader.js で生成済み）。
  chartState.viewModel = buildGridViewModel(analysis, duration);

  chartState.active = true;
  const overlay = document.getElementById('chart-overlay');
  if (overlay) {
    overlay.hidden = false;
  }

  _resetPerfState(); // perf instrumentation をこのセッション用にリセット（Phase70-A）
  _startRafLoop();  // rAF playback loop 開始（visual update authority）
  _buildTransport();
  _initTooltip();
  _setupTooltipEvents();
  _setupContextMenu();
  // 描画は呼び出し側（app.js）が renderChartMode を起点として渡す
}

/**
 * rebuildChartViewModel
 *
 * Phase72-B: repairRule 変更後に viewModel だけを再構築する。
 * openChartMode() と異なり、オーバーレイの表示・rAF・transport・
 * イベント登録は行わない（Chart Mode が既に開いている前提）。
 *
 * [使用ケース]
 *   right-click → 「ここを小節頭にする」または「補正を解除」
 *   → app.js が repairRule を更新 → この関数で viewModel 再構築
 *   → renderChartMode() で再描画
 *
 * @returns {boolean} 再構築成功:true / analysis なし:false
 */
export function rebuildChartViewModel(overrideAnalysis = null) {
  // [Phase74-C] overrideAnalysis が渡された場合はそれを使う（解析編集モード用）。
  // 通常時は _getAnalysis() で project.analysis を取得する。
  const analysis = overrideAnalysis ?? _getAnalysis?.();
  if (!analysis) return false;
  const duration = _getAudioDuration?.() || null;
  chartState.viewModel = buildGridViewModel(analysis, duration);
  return true;
}

/**
 * closeChartMode
 */
export function closeChartMode() {
  _stopRafLoop();  // rAF playback loop 停止（active=false の前に止める）
  _hideTooltip();  // tooltip 非表示
  _destroyTooltip(); // tooltip DOM 削除（orphan DOM 防止）
  chartState.active = false;
  chartState.lastScrolledMeasure = -1;
  const overlay = document.getElementById('chart-overlay');
  if (overlay) {
    overlay.hidden = true;
  }
}

// ────────────────────────────────────────
// Chart Mode 描画
// ────────────────────────────────────────

/**
 * renderChartMode
 *
 * Chart Mode の全体を描画する。
 * mode に応じて full / beat-only / fallback の表示を切り替える。
 *
 * @param {{ measuresPerRow?: number }} [options]
 */
export function renderChartMode({ measuresPerRow = 3, editing = false } = {}) {
  if (!chartState.active) return;

  const vm = chartState.viewModel;
  const analysis = _getAnalysis?.();

  _renderChartHeader(vm, analysis, editing);
  _renderChartGrid(vm, analysis, { measuresPerRow });
  _applyEditPointMarker();
}

/**
 * _applyEditPointMarker — chartState.editPointMarker をDOMへ反映する（暫定実装）
 *
 * [Phase77後半・暫定] 現状は毎回の再描画後にclass付け替えのみを行う簡易実装。
 * TODO(Phase78): [BOUNDARY DECORATOR] へ統合し、境界ハンドル等と統一的に扱う。
 */
function _applyEditPointMarker() {
  document.querySelectorAll('.chart-slot--edit-point')
    .forEach(el => el.classList.remove('chart-slot--edit-point'));

  const marker = chartState.editPointMarker;
  if (!marker) return;

  const measureEl = document.querySelector(
    `.chart-measure[data-measure-index="${marker.measureIndex}"]`
  );
  if (!measureEl) return;

  const slotEl = measureEl.querySelector(
    `.chart-slot[data-visual-slot-index="${marker.slotIndex}"]`
  );
  if (slotEl) slotEl.classList.add('chart-slot--edit-point');
}

/**
 * _renderChartHeader
 *
 * ヘッダー（曲情報・mode警告）を描画する。
 */
function _renderChartHeader(vm, analysis, editing = false) {
  const el = document.getElementById('chart-header-info');
  if (!el) return;

  if (!analysis) {
    el.innerHTML = '<span class="chart-warn">⚠️ 解析データがありません</span>';
    return;
  }

  const mode = vm?.model?.mode ?? 'fallback';
  const bpm  = analysis.bpm ? `BPM: ${Math.round(analysis.bpm)}` : '';
  const ts   = analysis.timeSignature
    ? `${analysis.timeSignature.numerator}/${analysis.timeSignature.denominator}`
    : '';

  const modeWarning = {
    'full':      '',
    'beat-only': '<span class="chart-warn">⚠️ 小節線は推定です</span>',
    'fallback':  '<span class="chart-warn">⚠️ タイミング解析不可</span>',
  }[mode] ?? '';

  const capo = _getCapo?.() ?? 0;
  const key  = document.getElementById('proj-key')?.value?.trim() ?? '';
  let capoInfo = '';
  if (capo > 0) {
    capoInfo = key
      ? `Capo ${capo} → Concert: ${_transposeChord(key, capo)}`
      : `Capo ${capo}`;
  }
  // Phase72-C: 補正適用中バッジ（projection only・chartStateに状態を持たせない）
const repairBadge = analysis.repairRule
    ? `<span class="chart-header-repair-badge">📍 小節補正中</span>`
    : '';

  // [Phase74-C] 編集中バッジ
  // app.js から editing 引数で受け取る。chartmode.js は状態を持たない。
  const editingBadge = editing
    ? `<span class="chart-header-edit-badge">✎ 編集中</span>`
    : '';

  el.innerHTML = [bpm, ts, capoInfo, repairBadge, editingBadge, modeWarning].filter(Boolean).join(' &nbsp;|&nbsp; ');

  // [Phase74-C] 編集ボタンのamber色切り替え
  // ヘッダーに関する表示はすべてこの関数が担当する（責務の一本化）
  const editBtn = document.getElementById('btn-analysis-edit');
  if (editBtn) editBtn.classList.toggle('chart-edit-btn--active', editing);

  // transport のカポラベルも同期（renderChartMode 呼び出し毎に追従）
  _syncCapoLabel();
}

/**
 * _renderChartGrid
 *
 * コードグリッドを描画する。
 * full / beat-only: 小節グリッド（slot-centric renderer）
 * fallback:         コード列（均等配置・小節線なし）
 *
 * 【Phase57 renderer 設計原則】
 *   slot owns timing semantic — CSS Grid owns layout
 *
 *   measure = grouping container + stacking context（playhead overlay用）
 *   slot    = timing semantic unit（beatIndex / chord ownership）
 *   CSS Grid = visual placement authority（position: static）
 *   playhead = continuous overlay（measure直下 absolute）
 *
 *   chord label は onset slot のみ生成。
 *   carry / empty は DOM label を生成しない。
 *   slot が left% 等の位置情報を持たない（CSS Grid に委譲）。
 */
function _renderChartGrid(vm, analysis, { measuresPerRow = 3 } = {}) {
  const container = document.getElementById('chart-grid');
  if (!container) return;
  container.innerHTML = '';

  if (!vm || !analysis) {
    _renderFallbackGrid(container, analysis);
    return;
  }

  const { model, measures, repairPerMeasure = new Map() } = vm;

  if (model.mode === 'fallback') {
    _renderFallbackGrid(container, analysis);
    return;
  }

  // display projection: capo 移調を表示時のみ適用
  // analysis.raw / GridViewModel の chord は canonical のまま保持する
  const capo = _getCapo?.() ?? 0;

  // Phase61: pickup measure 判定（1回のみ実行）
  // 弱起小節（曲が拍の途中から始まる）の場合、小節0の番号を "0" にする
  // 以降の小節は 1, 2, 3 ... と連番（通常と変わらず）
  const isPickup = detectPickupMeasure(measures);

  // ────────────────────────────────────────────────────
  // Phase68: pickup-aware visual projection の事前計算
  //
  // 【projection authority の集約】
  //   leadingOffset はここで一度だけ計算し、
  //   - chartState.pickupLeadingOffset（updateChartPlayback が参照）
  //   - pickupCtx.leadingOffset（expandToSlots が参照）
  //   の両方に渡す。これにより render と highlight が同じ値を使う。
  //
  // 【fail-closed】
  //   timeSignature.numerator が無い場合は projection を適用しない
  //   （4/4 等への暗黙fallbackはしない。拍構造不明のまま
  //    projection すると誤った右詰めになるため）。
  //
  // 【適用条件（AND）】
  //   - model.mode !== 'beat-only'（'full' 相当。'fallback' は既に return 済み）
  //   - measures[0] が pickup と判定されている（isPickup）
  //   - 実際の拍数(actualBeats)が基準拍数(referenceBeats)より少ない
  //
  // 【非対象（out of scope）】
  //   mode === 'beat-only' での pickup 対応は別issue
  //   （canonical measure grouping 自体が pickup を考慮していないため、
  //    visual projection だけでは解決できない。architecture.md 参照）
  // ────────────────────────────────────────────────────
  let pickupLeadingOffset = 0;
  const numerator = analysis.timeSignature?.numerator;

  if (numerator && model.mode !== 'beat-only' && isPickup && measures[0]) {
    const beats = analysis.normalized?.beats ?? analysis.beats ?? [];
    const actualBeats0 = getMeasureBeatCount(measures[0], beats);

    if (shouldApplyPickupProjection({ actualBeats: actualBeats0, referenceBeats: numerator })) {
      pickupLeadingOffset = computeLeadingOffset({
        actualBeats: actualBeats0,
        referenceBeats: numerator,
        slotsPerMeasure: model.slotsPerMeasure,
      });
    }
  }

  // updateChartPlayback() からの参照用（visual slot remap の単一情報源）
  chartState.pickupLeadingOffset = pickupLeadingOffset;

  const pickupCtx = (pickupLeadingOffset > 0)
    ? { enabled: true, leadingOffset: pickupLeadingOffset }
    : null;

  // slot semantic 配列を生成（expandToSlots: onset | carry | empty）
  // chord は複製しない。carry は sourceSlotIndex 参照のみ。
  const allSlots = expandToSlots(measures, model.slotsPerMeasure, pickupCtx);

  // measure ごとにグループ化（slot.measureIndex でマッピング）
  const slotsByMeasure = new Map();
  for (const slot of allSlots) {
    if (!slotsByMeasure.has(slot.measureIndex)) {
      slotsByMeasure.set(slot.measureIndex, []);
    }
    slotsByMeasure.get(slot.measureIndex).push(slot);
  }

  // 行ごとに描画
  for (let rowStart = 0; rowStart < measures.length; rowStart += measuresPerRow) {
    const rowEl = document.createElement('div');
    rowEl.className = 'chart-row';

    for (let mi = rowStart; mi < Math.min(rowStart + measuresPerRow, measures.length); mi++) {
      const measureEl = document.createElement('div');
      measureEl.className = 'chart-measure';
      if (model.mode === 'beat-only') {
        measureEl.classList.add('chart-measure--estimated');
      }
      measureEl.dataset.measureIndex = mi;

      // ── Phase59: timing diagnosis data attributes ─────────────
      // data-confidence / data-repair-state を付与する。
      // 将来の tooltip / debug export / click inspect に使用。
      // repairPerMeasure は buildGridViewModel() のスコープから参照する。
      const measureConf = measures[mi]?.confidence ?? 'high';
      measureEl.dataset.confidence = measureConf;
      const repairEntry = repairPerMeasure[mi];
      if (repairEntry) {
        measureEl.dataset.repairState = repairEntry.state;
        if (repairEntry.state === 'repaired') {
          measureEl.classList.add('chart-measure--drift-repaired');
        } else if (repairEntry.state === 'rejected') {
          measureEl.classList.add('chart-measure--drift-rejected');
        }
      } else {
        measureEl.dataset.repairState = 'original';
      }

      // 小節番号（display numbering semantics）
      // measure identity（mi）と表示番号は getDisplayMeasureNumber() で分離する。
      // pickup / alternate numbering 等の policy 変更はヘルパー側で管理する。
      const numEl = document.createElement('div');
      numEl.className = 'chart-measure-num';
      numEl.textContent = String(getDisplayMeasureNumber(mi, isPickup));
      measureEl.appendChild(numEl);

      // ── playhead overlay ──────────────────────────────────
      // measure 直下の continuous playback position indicator。
      // slot の子ではない（slot は timing semantic unit であり playhead を所有しない）。
      // playback 中は style.left のみ更新（DOM 再生成しない）。
      // 停止時: timeupdate が止まるため最後の位置に静止したまま残る（仕様A）。
      const playheadEl = document.createElement('div');
      playheadEl.className = 'chart-playhead';
      measureEl.appendChild(playheadEl);
      // _playheadEl 参照を保持（updateChartPlayback から参照）
      measureEl._playheadEl = playheadEl;

      // ── スロットコンテナ ──────────────────────────────────
      // CSS Grid で slot 数に応じた均等配置（位置は slot が持たない）
      // slot DOM は全て生成する（carry / empty 含む）。
      // grid-auto-flow: row のデフォルトで1行に収まることを保証する。
      // chord label の幅は CSS変数 --duration-slots で制御する（span 方式は使わない）。
      const slotsEl = document.createElement('div');
      slotsEl.className = 'chart-slots';
      slotsEl.style.gridTemplateColumns = `repeat(${model.slotsPerMeasure}, 1fr)`;

      // ── slot loop ──────────────────────────────────────────
      // 全 slot（onset / carry / empty）の DOM を生成する。
      // slot DOM invariant: DOM slot count = semantic slot count（beatIndex と一致）
      // chord label の幅拡張は grid-column: span ではなく CSS変数 --duration-slots で行う。
      // これにより Grid 折り返しが発生しない。
      const measureSlots = slotsByMeasure.get(mi) ?? [];
      for (const slot of measureSlots) {
        const slotEl = document.createElement('div');
        slotEl.className = 'chart-slot';

        // ────────────────────────────────────────────────────
        // Phase68: projection-empty slot
        // pickup measure の visual leading slot（実beatではない）。
        // - data-visual-slot-index は付与しない
        //   （hover / playback highlight / seek の対象外にする）
        // - beat頭区切り線（chart-slot--beat）も付与しない
        //   （slot.beatIndex を持たないため算出不可）
        // - 休符glyphを表示し、「ここは演奏されない」ことを視覚化する
        // - canonical timingやtoken streamには存在しない
        //   pure visual projection（前提: slot.beatIndex は undefined）
        // ────────────────────────────────────────────────────
        if (slot.projectionEmpty) {
          slotEl.classList.add('chart-slot--projection-empty');
          slotEl.innerHTML = PICKUP_REST_GLYPH_SVG;
          slotsEl.appendChild(slotEl);
          continue;
        }

        // Phase68: data-slot-index → data-visual-slot-index へ rename。
        // 通常measureでは actual slot index === visual slot index。
        // pickup measure（Phase68後半で導入）では projection後の visual index になる。
        slotEl.dataset.visualSlotIndex = slot.beatIndex;

        // beat 頭スロット（beatIndex が偶数 = 1拍目相当）に区切り線
        if (slot.beatIndex % 2 === 0) {
          slotEl.classList.add('chart-slot--beat');
        }

        // switch(slot.type) で exhaustive dispatch（if(!slot) 禁止）
        switch (slot.type) {
          case 'onset': {
            slotEl.classList.add('chart-slot--onset');

            // CSS変数 --duration-slots で chord label の表示幅を制御する。
            // label は position:absolute でslot左端から右へ伸びる。
            // 1slot分: 100% / 4slot分: 400% のように計算する。
            // grid-column: span は使わない（Grid折り返し防止）。
            slotEl.style.setProperty('--duration-slots', slot.durationSlots);

            const chordEl = document.createElement('span');
            chordEl.className = 'chart-chord-name';
            // display projection: render 時のみ capo 移調（canonical は変更しない）
            const display = (capo !== 0 && _transposeChord)
              ? _transposeChord(slot.chord, -capo)
              : slot.chord;
            chordEl.textContent = display;
            // data-chord: 表示済みchord名（projection済み）を格納する。
            // tooltip 側は findChord(chord) のみ使用し、capo 再適用しない
            // （二重 projection 防止 / tooltip は projection authority を持たない）。
            chordEl.dataset.chord = display;
            // [Phase74-C] data-chord-id: 解析エディタのクリック選択用。
            // raw.chords の _id をそのまま持たせる（projectionしない・編集対象の識別子）。
            if (slot.id) {
              chordEl.dataset.chordId = slot.id;
            }
            // [Phase74-C] 選択中ハイライト
            if (slot.id && chartState.selectedChordIds.has(slot.id)) {
              chordEl.classList.add('chart-chord-name--selected');
            }
            // data-chord: 表示済みchord名（projection済み）を格納する。
            // tooltip 側は findChord(chord) のみ使用し capo 再適用しない。
            // （二重 projection 防止 / tooltip は projection authority を持たない）
            chordEl.dataset.chord = display;

            // compact 表示（8文字以上 → font-size 縮小・行高維持）
            if (display.length >= COMPACT_CHORD_LENGTH) {
              chordEl.classList.add('chart-chord-name--compact');
            }

            slotEl.appendChild(chordEl);
            break;
          }

          case 'carry':
            // carry slot: DOM は生成するが chord label を持たない。
            // onset の chord label が CSS で carry 領域へ伸びるため視覚的に継続して見える
            // （同一小節内はこれで既にクリック可能）。
            // opacity ではなく class のみ（opacity は子要素に継承されるため使わない）。
            slotEl.classList.add('chart-slot--carry');
            // [Phase77] 小節をまたぐ継続セルは onset の chord label DOM が届かないため、
            // このslot自身にdata-chord-idを持たせて選択可能にする。
            // ハイライト表示（chart-chord-name--selected相当）は今回のスコープ外
            // （クリック可否のみを対象とする）。
            if (slot.sourceChordId) {
              slotEl.dataset.chordId = slot.sourceChordId;
            }
            break;

          case 'empty':
            // empty slot: 曲頭でまだ chord が現れていない
            slotEl.classList.add('chart-slot--empty');
            break;

          // 将来: case 'simile': / case 'repeat-start': 等をここに追加
        }

        slotsEl.appendChild(slotEl);
      }

      measureEl.appendChild(slotsEl);
      rowEl.appendChild(measureEl);
    }

    container.appendChild(rowEl);
  }
}

// ────────────────────────────────────────
// Phase61: pickup measure 検出
// ────────────────────────────────────────

/**
 * detectPickupMeasure
 *
 * 曲が小節途中から始まる弱起（pickup measure）かどうかを判定する。
 *
 * 【判定条件: 2条件 AND】
 *   条件A: measures[0] の長さ < normalized median measure length × 0.75
 *   条件B: measures[1] 以降の長さが中央値の ±30% 以内（正常範囲の確認）
 *
 * 【median 基準を採用する理由】
 *   measures[1] を基準にすると intro drift / early jitter / tempo settle delay で
 *   false positive が増える。全小節の中央値を基準にすることで安定する。
 *
 * 【available range のみ使用】
 *   短曲（小節数が少ない）でも measures.slice(1) の全件を使うため
 *   measures[1〜3] の固定参照はしない。
 *
 * 【この関数が触らないもの】
 *   timing.js / GridViewModel / analysis.raw — 参照のみ
 *
 * @param {object[]} measures  - GridViewModel.measures
 * @returns {boolean}
 */
function detectPickupMeasure(measures) {
  if (measures.length < 2) return false;

  // 旧project互換ガード（Phase61 hotfix）:
  // 保存済み viewModel には endTime が存在しない場合がある。
  // endTime が欠損している状態で計算すると NaN が混入し renderer が停止する。
  // endTime が揃っている場合のみ pickup 判定を実行する。
  if (!measures.every(
    m => Number.isFinite(m?.startTime) && Number.isFinite(m?.endTime)
  )) {
    return false;
  }

  // measures[1] 以降の長さを取得（available range 全件）
  const restLengths = measures.slice(1).map(m => m.endTime - m.startTime);
  if (!restLengths.length) return false;

  // normalized median measure length を計算
  const sorted = [...restLengths].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median || median <= 0) return false;

  // 条件A: 小節0 が median の 75% 未満
  const m0len = measures[0].endTime - measures[0].startTime;
  const condA = m0len < median * 0.75;

  // 条件B: measures[1] 以降が中央値の ±30% 以内（正常範囲の確認）
  // rubato intro / free tempo intro での false positive 抑制
  const checkCount = Math.min(restLengths.length, 4);  // 最大4小節で確認
  const condB = restLengths.slice(0, checkCount).every(
    len => Math.abs(len - median) / median < 0.30
  );

  return condA && condB;
}

/**
 * getDisplayMeasureNumber
 *
 * measure index（identity）を表示番号（display numbering semantics）に変換する。
 *
 * 【measure identity と display numbering の分離（Phase61で確立）】
 *   mi は GridViewModel の index（0-based identity）。
 *   表示番号は numbering policy によって変わる semantic layer。
 *   renderer 内で直接 mi+1 等を計算しないこと。
 *
 * 将来の alternate numbering / rehearsal-local numbering / section reset numbering は
 * この関数を拡張するか、opts を追加することで対応する。
 *
 * @param {number}  mi        - measure index（0-based）
 * @param {boolean} isPickup  - pickup measure 判定結果
 * @returns {number}  表示番号
 */
function getDisplayMeasureNumber(mi, isPickup) {
  if (isPickup) return mi;       // pickup: 0→0, 1→1, 2→2 ...
  return mi + 1;                 // 通常:   0→1, 1→2, 2→3 ...
}

/**
 * _renderFallbackGrid
 *
 * fallback モード: コード列を均等配置で表示する。
 * 小節線なし・timing semantic なし。
 */
function _renderFallbackGrid(container, analysis) {
  if (!analysis?.chords?.length) {
    container.innerHTML = '<div class="chart-empty">コードデータがありません</div>';
    return;
  }

  const validChords = analysis.chords.filter(c => c.chord && c.chord !== 'N');
  const listEl = document.createElement('div');
  listEl.className = 'chart-fallback-list';

  // display projection: capo 移調を表示時のみ適用（canonical は変更しない）
  const capo = _getCapo?.() ?? 0;

  for (const c of validChords) {
    const el = document.createElement('div');
    el.className = 'chart-fallback-chord';
    el.textContent = (capo !== 0 && _transposeChord)
      ? _transposeChord(c.chord, -capo)
      : c.chord;
    listEl.appendChild(el);
  }

  container.appendChild(listEl);
}

// ────────────────────────────────────────
// 再生同期（playback highlight）
// ────────────────────────────────────────

/**
 * updateChartPlayback
 *
 * 再生時刻に応じて現在の小節・スロットをハイライトする。
 * aEl の timeupdate から呼ばれる。
 *
 * @param {number} currentTime
 */
export function updateChartPlayback(currentTime) {
  if (!chartState.active || !chartState.viewModel) return;

  const { model } = chartState.viewModel;
  if (model.mode === 'fallback') return;

  const q = model.quantize(currentTime);

  // 既存ハイライトを解除
  document.querySelectorAll('.chart-measure--active').forEach(el => {
    el.classList.remove('chart-measure--active');
  });
  document.querySelectorAll('.chart-slot--active').forEach(el => {
    el.classList.remove('chart-slot--active');
  });

  // 現在の小節をハイライト
  const measureEl = document.querySelector(
    `.chart-measure[data-measure-index="${q.measure}"]`
  );
  if (measureEl) {
    // 順序: active class 付与 → playhead left 更新（逆順だとチラつく）
    measureEl.classList.add('chart-measure--active');

    // playhead 位置を更新（left% のみ。DOM再生成しない）
    // getBeatPosition: timing authority が 0.0〜1.0 を返す
    // chartmode はそれを left% に変換するだけ（timing interpretation をしない）
    // 停止時: timeupdate が止まるため playhead はその位置に静止したまま残る（仕様A）
    // _playheadEl: measure 直下 overlay（Phase57: _beatCursorEl から改名）
    if (measureEl._playheadEl && model.getBeatPosition) {
      const pos = model.getBeatPosition(currentTime);
      measureEl._playheadEl.style.left = `${pos * 100}%`;
    }

    // 現在の slot をハイライト
    // slot DOM invariant が復活したため、q.slot は常に DOM に対応する（carry 含む）
    //
    // NOTE: Playhead position（上の left%）は canonical timing space のまま。
    // Pickup projection は discrete slot highlighting のみを remap する。
    // Continuous visual timeline remapping（playheadの連続補正）は
    // playback authority と visual projection を結合させてしまうため
    // Phase68では意図的に対象外とする。
    //
    // Phase68: q.measure === 0 かつ pickup projection 適用中の場合のみ、
    // q.slot（canonical actual slot index）を visual slot index へ変換する。
    // projectPickupSlotIndex() は expandToSlots() の remapPickupOnsetMap()
    // と同じ変換式（単一情報源）。
    let visualSlot = q.slot;
    if (q.measure === 0 && chartState.pickupLeadingOffset > 0) {
      visualSlot = projectPickupSlotIndex({
        actualSlotIndex: q.slot,
        slotsPerMeasure: model.slotsPerMeasure,
        leadingOffset:   chartState.pickupLeadingOffset,
      });
    }
    const slotEl = measureEl.querySelector(
      `.chart-slot[data-visual-slot-index="${visualSlot}"]`
    );
    if (slotEl) slotEl.classList.add('chart-slot--active');

    // ★ 小節が変わった時だけ中央スクロール
    if (q.measure !== chartState.lastScrolledMeasure) {
      chartState.lastScrolledMeasure = q.measure;
      measureEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  _updateTransport(currentTime);

}

// ════════════════════════════════════════
// MINI TRANSPORT
// ════════════════════════════════════════

// seek 競合防止フラグ
let _isSeeking = false;

// 音量ミュート解除用の退避値（localStorage不使用・session only）
// [VOLUME AUTHORITY] truth source = aEl.volume。この変数はミュート→解除時の
// 「復元先」を記憶するだけで、aEl.volume自体の管理は持たない。
let _previousVolume = 80;  // percent integer（0-100）

/**
 * _buildTransport
 * #chart-header 直後に mini transport を生成する。
 * 既存 transport がある場合は重複生成しない。
 */
function _buildTransport() {
  if (document.getElementById('chart-transport')) return;

  const transport = document.createElement('div');
  transport.id = 'chart-transport';

  transport.innerHTML = `
    <button id="chart-play-btn" class="chart-play-btn" title="再生 / 一時停止">▶</button>
    <div id="chart-seek-wrap" class="chart-seek-wrap">
      <div id="chart-seek-track" class="chart-seek-track">
        <div id="chart-seek-fill" class="chart-seek-fill"></div>
      </div>
      <input id="chart-seek-in" class="chart-seek-in" type="range"
             min="0" max="1000" value="0" step="1">
    </div>
    <span id="chart-time-display" class="chart-time-display">0:00 / 0:00</span>
    <div class="chart-speed-cluster">
      <input id="chart-speed-sel" class="chart-speed-sel" type="range"
             min="50" max="150" value="100" step="1">
      <span id="chart-speed-label" class="chart-speed-label">100%</span>
      <button id="chart-speed-reset" class="chart-speed-reset" type="button" title="100%にリセット">↺</button>
    </div>
    <div class="chart-vol-cluster">
      <button id="chart-vol-btn" class="chart-vol-btn" title="音量">🔊</button>
      <input id="chart-vol-sel" class="chart-vol-sel" type="range"
             min="0" max="100" value="80" step="1" title="音量">
    </div>
    <div class="chart-capo-cluster">
      <button id="chart-capo-down" class="chart-capo-btn" title="カポを下げる">－</button>
      <span id="chart-capo-label" class="chart-capo-label">Capo 0</span>
      <button id="chart-capo-up" class="chart-capo-btn" title="カポを上げる">＋</button>
    </div>
  `;

  const header = document.getElementById('chart-header');
  header.insertAdjacentElement('afterend', transport);

  _setupTransportEvents(transport);
}

/**
 * _setupTransportEvents
 * transport のイベントハンドラーを登録する。
 * aEl の play/pause listener は持たない（_updateTransport で polling）。
 */
function _setupTransportEvents(transport) {
  const aEl = _getAudioEl();

  // ── 再生 / 一時停止 ──
  const playBtn = transport.querySelector('#chart-play-btn');
  playBtn.addEventListener('click', () => {
    if (aEl.paused) aEl.play();
    else            aEl.pause();
  });

  // ── シークバー ──
  const seekIn   = transport.querySelector('#chart-seek-in');
  const seekFill = transport.querySelector('#chart-seek-fill');

  seekIn.addEventListener('pointerdown', () => { _isSeeking = true; });

  seekIn.addEventListener('input', () => {
    if (!aEl.duration) return;
    const pct            = seekIn.value / 1000;
    aEl.currentTime      = pct * aEl.duration;
    seekFill.style.width = `${pct * 100}%`;   // ドラッグ中も fill を追従
  });

  const endSeeking = () => { _isSeeking = false; };
  seekIn.addEventListener('pointerup',     endSeeking);
  seekIn.addEventListener('pointercancel', endSeeking);
  seekIn.addEventListener('change',        endSeeking);
  seekIn.addEventListener('blur',          endSeeking);

  // ── 速度スライダー ──
  const speedSel     = transport.querySelector('#chart-speed-sel');
  const speedLabel   = transport.querySelector('#chart-speed-label');
  const speedReset   = transport.querySelector('#chart-speed-reset');
  const mainSpeedSel = document.getElementById('speed-sel');

  // メイン画面の現在速度を初期値として反映
  // [UNIT FIX] mainSpeedSel.value は既に percent integer（例: 100）。
  // playbackRate float（例: 1.0）ではないため *100 してはいけない。
  // 旧コードは *100 していたため 100→10000→clamp(max=150) で常に150になっていた。
  //
  // [RANGE MISMATCH GUARD] Chart slider の通常レンジは 50-150（Chart Mode向けに
  // 意図的に絞った値）。canonical speed authority（setSpeed）は 25-300 を許容するため、
  // 現在値がこのレンジ外の場合はスライダーのmin/maxを一時的に動的拡張し、
  // 「表示だけclampされて実際の速度と食い違う」状態を防ぐ。
  // 通常使用時（50-150の範囲内）はこのガードは発火せず、既存の見た目のまま。
  //
  // [NOTE] これはChart Modeを開いた瞬間の初期反映専用。
  // 開いている間の継続的な同期はsetSpeed()側のChart projection
  // （audio.js, Phase71-A）が担当する。
  if (mainSpeedSel) {
    const currentPct = Math.round(parseFloat(mainSpeedSel.value));
    if (Number.isFinite(currentPct)) {
      if (currentPct > Number(speedSel.max)) speedSel.max = currentPct;
      if (currentPct < Number(speedSel.min)) speedSel.min = currentPct;
      speedSel.value = currentPct;
    }
  }
  speedLabel.textContent = `${speedSel.value}%`;

  speedSel.addEventListener('input', () => {
    const pct = parseInt(speedSel.value);
    speedLabel.textContent = `${pct}%`;
    // [SPEED UI SYNC] setSpeed()がaEl.playbackRateの設定と、
    // 通常モード（#speed-sel / #speed-reset）・TAPモード（#tov-speed等）・
    // 演奏モード（#perform-speed）・Chart Mode自身の表示同期を一括して行う。
    setSpeed(pct);
  });

  // ── 速度リセット ──
  // [SPEED RESET] canonical mutation trigger。setSpeed(100)のみを呼び、
  // 表示projectionはsetSpeed()内で一括処理される（chart独自reset authorityを作らない）。
  // setSpeed()がChart自身のUI（#chart-speed-sel/#chart-speed-label）も
  // projection対象に含むため（audio.js, Phase71-A）、reset後の表示も自動的に揺れない。
  speedReset.addEventListener('click', () => {
    setSpeed(100);
  });

// ── 音量バー（Phase74-A） ──
  // [VOLUME AUTHORITY] truth source = aEl.volume のみ。
  // _previousVolume はミュート解除時の復元先（session only・localStorage不使用）。
  const volBtn = document.getElementById('chart-vol-btn');
  const volSel = document.getElementById('chart-vol-sel');
  if (volSel && volBtn) {
    // 初期値を現在の aEl.volume に同期
    const initVol = aEl.muted ? 0 : Math.round(aEl.volume * 100);
    volSel.value = initVol;
    _updateChartVolBtn(volBtn, initVol);

    volSel.addEventListener('input', () => {
      const v = parseInt(volSel.value);
      aEl.volume = v / 100;
      aEl.muted  = (v === 0);
      // [PREVIOUS VOLUME] 非0音量なら常に更新する。
      // こうすることで「スライダー80→40→ミュート→解除」で40に戻る
      // 一般的なオーディオプレーヤーと同じ挙動になる（ChatGPT指摘②対応）。
      if (v > 0) _previousVolume = v;
      _updateChartVolBtn(volBtn, v);
    });

    volBtn.addEventListener('click', () => {
      if (aEl.muted || aEl.volume === 0) {
        // ミュート解除: 退避値に戻す
        const r = _previousVolume;
        aEl.muted    = false;
        aEl.volume   = r / 100;
        volSel.value = r;
        _updateChartVolBtn(volBtn, r);
      } else {
        // ミュート: 現在値を退避してからミュート
        _previousVolume = Math.round(aEl.volume * 100);
        aEl.muted    = true;
        aEl.volume   = 0;
        volSel.value = 0;
        _updateChartVolBtn(volBtn, 0);
      }
    });
  }

  // ── カポ変更（Phase74-A） ──
  // [CAPO AUTHORITY] #capo が唯一の authority。
  // Chart内ボタンは #capo の value を変更して change イベントを発火するだけ。
  // app.js の既存 capo change ハンドラーが動き、editor / perform / chart が連動する。
  //
  // [RANGE] #capo の min/max 属性から読む。未設定時は 0/11 にフォールバック。
  // ハードコードしないことで将来の -2〜11 拡張時も自動追従する（ChatGPT指摘④対応）。
  //
  // [LISTENER SAFETY] _buildTransport() は idempotent（chart-transport 存在時は即 return）
  // のため、このリスナーは Chart Mode の lifetime で1回しか登録されない。
  // 重複登録の心配はない（ChatGPT指摘①確認済み）。
  const capoEl   = document.getElementById('capo');
  const capoDown = document.getElementById('chart-capo-down');
  const capoUp   = document.getElementById('chart-capo-up');
  if (capoEl && capoDown && capoUp) {
    const getCapoRange = () => ({
      min: parseInt(capoEl.min !== '' ? capoEl.min : '0'),
      max: parseInt(capoEl.max !== '' ? capoEl.max : '12'),
    });

    capoDown.addEventListener('click', () => {
      const { min } = getCapoRange();
      const cur = parseInt(capoEl.value) || 0;
      if (cur <= min) return;
      capoEl.value = cur - 1;
      capoEl.dispatchEvent(new Event('change'));
    });

    capoUp.addEventListener('click', () => {
      const { max } = getCapoRange();
      const cur = parseInt(capoEl.value) || 0;
      if (cur >= max) return;
      capoEl.value = cur + 1;
      capoEl.dispatchEvent(new Event('change'));
    });
  }

  // カポ変更時に transport 内ラベルを追従させる。
  // renderChartMode() 経由の同期に加えて、capo change イベントを直接 listen することで
  // 「capo変更だけ起きて再描画されないケース」でもラベルが正確に追従する。
  // [LISTENER SAFETY] _buildTransport() idempotent のため重複登録なし。
  document.getElementById('capo')?.addEventListener('change', _syncCapoLabel);
}

/**
 * _updateTransport
 * updateChartPlayback() から毎フレーム呼ばれる。
 * 再生アイコンを polling で更新。isSeeking 中はシークバー位置を更新しない。
 */
function _updateTransport(currentTime) {
  const aEl = _getAudioEl();
  if (!aEl || !aEl.duration) return;

  // 再生アイコン（polling 方式）
  const playBtn = document.getElementById('chart-play-btn');
  if (playBtn) {
    playBtn.textContent = aEl.paused ? '▶' : '⏸';
  }

  // シークバー（isSeeking 中はスキップ）
  if (!_isSeeking) {
    const pct      = currentTime / aEl.duration;
    const seekIn   = document.getElementById('chart-seek-in');
    const seekFill = document.getElementById('chart-seek-fill');
    if (seekIn)   seekIn.value         = Math.round(pct * 1000);
    if (seekFill) seekFill.style.width = `${pct * 100}%`;
  }

  // 時刻表示
  const timeDisplay = document.getElementById('chart-time-display');
  if (timeDisplay) {
    timeDisplay.textContent = `${_fmt(currentTime)} / ${_fmt(aEl.duration)}`;
  }
}

/**
 * _updateChartVolBtn — 音量値に応じてアイコンを更新（Phase74-A）
 * @param {HTMLElement} btn
 * @param {number} val - 0-100
 */
function _updateChartVolBtn(btn, val) {
  const n = parseInt(val);
  btn.textContent = n === 0 ? '🔇' : n < 40 ? '🔉' : '🔊';
}

/**
 * _syncCapoLabel — transport内のカポラベルをエディター側の現在値に同期（Phase74-A）
 * capo change イベントから呼ばれる。renderChartMode() とは独立して動作する。
 */
function _syncCapoLabel() {
  const label  = document.getElementById('chart-capo-label');
  const capoEl = document.getElementById('capo');
  if (!label || !capoEl) return;
  label.textContent = `Capo ${parseInt(capoEl.value) || 0}`;
}

/**
 * _fmt — 秒数を "M:SS" 形式に変換
 */
function _fmt(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}