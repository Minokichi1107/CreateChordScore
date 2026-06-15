# 引き継ぎ: Phase68完了 — Chart Mode pickup-aware visual projection

## 作業状態
- ブランチ: phase68-pickup-alignment
- 直前作業: Phase67完了（Chart Mode hover chord diagram）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| pickup projection helper群追加 | `getMeasureBeatCount()` / `shouldApplyPickupProjection()` / `computeLeadingOffset()` / `projectPickupSlotIndex()`（export） / `remapPickupOnsetMap()` | js/chartmode.js |
| `chartState.pickupLeadingOffset` 追加 | projection authorityの単一情報源。`_renderChartGrid()`が計算し、`expandToSlots()`と`updateChartPlayback()`が共通参照 | js/chartmode.js |
| `data-slot-index` → `data-visual-slot-index` rename | slot DOM属性名を「visual slot space」であることが分かる名前に変更（canonical `measure.slots[].slotIndex`とは別概念） | js/chartmode.js |
| `expandToSlots()` に pickup projection 分岐追加 | measure0かつ`pickupCtx.enabled`の場合のみ、actual onsetMap → `remapPickupOnsetMap()` → projection-empty挿入 → visual空間でcarry再生成 | js/chartmode.js |
| `projectionEmpty` slot type追加 | `{ type:'empty', projectionEmpty:true, measureIndex }`。`beatIndex`を持たない（timing authorityなし） | js/chartmode.js |
| 休符glyph描画 | `PICKUP_REST_GLYPH_SVG`定数。`slot.projectionEmpty`の場合、`data-visual-slot-index`を付与せずSVG休符を表示 | js/chartmode.js |
| `updateChartPlayback()` にslot highlight remap追加 | `q.measure===0 && chartState.pickupLeadingOffset>0`の場合のみ、`projectPickupSlotIndex()`でactual→visual変換 | js/chartmode.js |
| CSS追加 | `.chart-slot--projection-empty` / `.chart-rest-glyph` | css/components.css |

---

## 確定した設計原則

### Phase68の位置づけ（architecture上の節目）

```
Phase68は「pickup小節の見た目調整」に見えるが、
実態としては Chart Mode が

  「timing authority直結UI」
  → 「projection-aware rendering UI」

へ進化した節目である。

確立した canonical timing space ≠ visual projection space の分離は、
pickup対応専用の仕組みではなく、measure内のslot配置を歪める
projection adapterという汎用構造である。

現時点のprojection layerは「measure内slot再配置」に最適化されている。
将来的に以下のような機能へ拡張できる可能性がある（未確定）:
  - tuplet compression（連符の視覚的圧縮表示）
  - swing visualization（スイング感の視覚化）
  - polymeter overlay（複合拍子の重ね表示）

rubato visualization / humanized timing display のような
continuous timing distortionは、discrete slot単位の構造とは
性質が異なるため、同じ仕組みで一般化できるかは別途検討が必要。
```

### canonical timing space ≠ visual projection space（Phase68で確立）

```
canonical timing space（timing.js / quantize / beats）— 変更なし・authority
  measure.slots[].slotIndex   : actual slot index
  model.quantize(time)        : { measure, slot }（actual）
  model.getBeatPosition(time) : 0.0〜1.0（actual空間の比率）

        │ projection adapter（chartmode.js限定）
        ▼

visual projection space — 表示・highlightのみ
  data-visual-slot-index
  expandToSlots()の onset/carry/empty配置
  updateChartPlaybackのslot highlight対象
```

canonical timing（measure.startTime/endTime, beats, quantize結果）は一切変更しない。
projection は measure 0（pickup measure）の表示位置調整に限定される。

### 単一変換源: projectPickupSlotIndex()

```
actual slot index → visual slot index の変換は
projectPickupSlotIndex() に集約する。

expandToSlots()（rendering）と updateChartPlayback()（highlight）の
両方がこれを使うことで、表示と再生位置のズレを防ぐ。

右詰め基準（末尾slotが安定するよう ceil を使用）。
```

### projection authority の集約

```
_renderChartGrid() で leadingOffset を一度だけ計算
    ↓
chartState.pickupLeadingOffset ─┬→ updateChartPlayback()
pickupCtx.leadingOffset ────────┴→ expandToSlots()
```

### carry regeneration invariant（重要・将来壊されやすい）

```
IMPORTANT:
canonical carry（actual slot space）は直接 remap しない。
canonical carry duration は actual slot space に基づくため、
そのまま visual slot space へ持ち込むと
圧縮後に duration の重複・伸長が発生する。

onset ownership のみが projection 対象であり、
carry ownership は visual slot space で再生成する。

durationSlots の deferred-finalization:
  pickup measure内でdurationSlotsは確定済みのため、
  次measure（mi=1）の最初のonset到達時に
  誤ってpickup measure内のonsetを再確定しないよう
  lastOnsetResultIndexを-1にリセットする。
```

### projectionEmpty slotの不可侵性

```
projectionEmpty slot（実beatではない領域）は:
  - beatIndex を持たない（timing authorityを持たないことをデータレベルで保証）
  - data-visual-slot-index を付与しない（DOM属性レベルで保証）
  - chart-slot--beat（区切り線）も付与しない
  - hover / playback highlight / seek の対象外

「存在しない拍をクリックするとseekできる」等のsemantic bugを防ぐため、
将来この不可侵性を緩める変更（projectionEmptyへのdata属性追加等）は
慎重にレビューすること。
```

### スコープ境界: mode === 'beat-only' は対象外

```
Phase68は mode === 'full'（downbeats検出成功）限定。

mode === 'beat-only' での pickup 対応は別issue
（canonical measure grouping自体がpickupを考慮していないため、
 visual projectionだけでは解決できない。1小節分のmeasureグルーピングズレが
 起きる可能性がある）。
```

### out of scope: playheadの連続位置補正

```
NOTE:
Playhead position（continuous left%）は canonical timing space のまま。
Pickup projectionはdiscrete slot highlightingのみをremapする。

Continuous visual timeline remapping（playheadの連続補正）は
playback authorityとvisual projectionを結合させてしまうため
Phase68では意図的に対象外とする。
```

---

## 動作確認結果

### projection engine単体検証（強制テスト・FORCE_PICKUP_DEBUG）

`detectPickupMeasure()`の判定をバイパスし、measure0を強制的に
「実2拍のpickup measure」として扱うデバッグフラグで検証した
（検証後は完全に削除済み）。

| チェック項目 | 結果 |
|---|---|
| projection-empty slot生成（休符glyph・左側leadingOffset個） | OK |
| visual onset/carryの右詰め配置（remapPickupOnsetMap） | OK |
| playback highlightのactual→visual remap（一時的に`.chart-slot--active`へoutline CSSを追加して可視化） | OK（outline枠は常にBm側=visual4~7のみで移動。projection-empty側には一度も出現しない） |
| playheadのvisual空間整合 | OK |
| 通常measure（小節2以降）への影響 | なし |

### 通常曲（pickupなし）での既存動作確認（Step3: rename直後）

```
data-slot-index → data-visual-slot-index rename後、
通常曲4曲でChart Mode再生・slot highlight・playhead・列数切替に問題なし
```

---

## 積み残し・保留

### 実曲pickup検証（pending）

```
状態: synthetic test（強制デバッグ）は完了。
      real-world integration sample（実際のpickup曲）での検証は未実施。

理由: 手元の楽曲が全て小節1から始まる曲（pickupなし）だったため。

今回のsynthetic testで以下が確認済み:
  - canonical timing space ≠ visual projection spaceの分離が機能している
  - expandToSlots() / projectPickupSlotIndex() / updateChartPlayback() /
    data-visual-slot-index の4系統が連動して正しく動作する
  - detectPickupMeasure()自体はPhase61で別途確立済み（今回の対象外）

実曲pickupが見つかった際に、表示・再生の最終確認を行うことを推奨する。

【追記】projection-empty glyphのスタイル調整（未確認）

```
.chart-slot--projection-empty の opacity を 0.45 → 0.7、
color を var(--text-muted) → var(--text-secondary) に変更済み
（休符glyphが薄すぎて視認できなかったため）。

これも実際に projection-empty が描画される状態
（= pickup measureを持つ曲）でないと見た目を確認できないため、
上記の実曲pickup検証と合わせて確認すること。

もし opacity 0.7 でもまだ薄い場合は、
dashed border併用案も検討する:
  border-left: 1px dashed var(--border-ui);
```
```

### .chart-slot--active のCSS欠落（Phase68範囲外で発見）

```
状態: 未対応（separate issue）

現象: updateChartPlayback()はJS側で`.chart-slot--active`クラスを
      slotEl.classList.add()しているが、対応するCSSが存在しない。
      （以前から未実装だった可能性が高い。Phase68が壊したものではない）

影響: slot単位のハイライトが視覚的に表示されない。
      measure単位のハイライト（.chart-measure--active）は正常に機能している。

今回はPhase68検証のために一時CSS（outline）を追加して可視化したが、
検証後に削除済み。

今回のPhase68確認はこの一時CSSにより行ったため、
.chart-slot--activeのCSSが正式に存在しない状態でも
projection自体（remapロジック）の正しさは確認できている。

将来対応する場合: current-issues.mdへ追記し、UI改善issueとして扱う。
```

### mode === 'beat-only' でのpickup対応

```
状態: 未着手（別issue）

canonical measure grouping自体がpickupを考慮していないため、
visual projectionだけでは解決できない。
architecture.md §9（4層architecture contract）参照。
```

---

## 次フェーズ候補

- `.chart-slot--active` CSS追加（UI改善・実装コスト小）
- 実曲pickupでの最終確認（楽曲が見つかった時点で）
- debug API整理（Phase66から継続）
- Chart Mode 並列表示（設計フェーズが必要）

---

## backlog continuity

### Chart Mode 系

- pickup-aware measure numbering: 完了（Phase61）
- pickup-aware visual projection（alignment）: implementation complete / real-song verification pending（Phase68）
- mode==='beat-only'でのpickup対応: 別issue（将来）
- Chart/editor 並列表示: 設計フェーズが必要

### timing pipeline 系

- canonical timing space / visual projection space の分離: **確立（Phase68）**
  → measure内slot再配置のprojection adapterとして機能。
     将来的な拡張可能性を持つ（tuplet表示・swing visualization等。
     continuous timing distortion系は別途検討が必要）

---

## commit message

```
feat(chartmode): pickup-aware visual slot projection

helpers (new, unused until wired below):
- add getMeasureBeatCount() / shouldApplyPickupProjection() /
  computeLeadingOffset() / remapPickupOnsetMap()
- add projectPickupSlotIndex() (export) as the single conversion source
  between actual slot space and visual slot space

chartState:
- add pickupLeadingOffset (projection authority, computed once in
  _renderChartGrid, shared by expandToSlots and updateChartPlayback)

DOM:
- rename data-slot-index -> data-visual-slot-index
  (canonical measure.slots[].slotIndex is unaffected)

expandToSlots():
- add pickupCtx param (default null, backward compatible)
- measure 0 pickup branch: actual onsetMap -> remapPickupOnsetMap ->
  visual space -> projection-empty leading slots -> carry regenerated
  in visual space (canonical carry is never remapped directly)
- add projectionEmpty slot type ({ type:'empty', projectionEmpty:true,
  measureIndex }, no beatIndex -> no timing authority)

_renderChartGrid():
- compute pickupLeadingOffset once (fail-closed on missing
  timeSignature.numerator; mode==='beat-only' excluded)
- render projection-empty slots with rest glyph (PICKUP_REST_GLYPH_SVG),
  no data-visual-slot-index, no beat separator

updateChartPlayback():
- remap q.slot (actual) -> visual slot via projectPickupSlotIndex()
  for measure 0 highlight only
- playhead position intentionally remains in canonical timing space
  (continuous remap out of scope)

css/components.css:
- add .chart-slot--projection-empty / .chart-rest-glyph

[PROJECTION INVARIANT]
  canonical timing (timing.js / quantize / beats) is never modified.
  projection is limited to measure 0 display positioning.
  projectionEmpty slots carry no timing authority (no beatIndex,
  no data-visual-slot-index, excluded from hover/seek/highlight).

scope: mode === 'full' only. mode === 'beat-only' deferred (separate issue,
canonical measure grouping itself doesn't account for pickup).

verified via forced pickup debug path (synthetic test):
projection-empty rendering, visual right-alignment, playback highlight
remap, playhead alignment all confirmed correct. Real-world pickup song
verification still pending (no pickup songs available in test set).
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
