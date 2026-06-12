# 引き継ぎ: Phase68（進行中） — Chart Mode pickup-aware alignment

## 作業状態
- ブランチ: phase68-pickup-alignment
- 直前作業: Phase67完了（Chart Mode hover chord diagram）

---

## micro-log
（フェーズ完了時に下記へ整理し、本セクションは削除してよい）

### Step1-4: pickup projection infrastructure 準備

- 変更: chartmode.js に pickup projection 用の helper 関数群を追加
  - `getMeasureBeatCount()` / `shouldApplyPickupProjection()` /
    `computeLeadingOffset()` / `projectPickupSlotIndex()`（export） /
    `remapPickupOnsetMap()`
  - reason: pickup measure の「actual slot space → visual slot space」変換を
    単一の変換源（projectPickupSlotIndex）に集約するため。
    expandToSlots()（rendering）と updateChartPlayback()（highlight）の
    両方が同じ変換を使うことで、表示と再生位置のズレを防ぐ。
  - invariant: canonical timing（timing.js / quantize / beats）は変更しない。
    projection は measure 0 の表示位置調整に限定する。
  - 現時点ではこれらの関数は未使用（呼び出し元はStep5で追加）。

- 変更: chartState に `pickupLeadingOffset: 0` を追加
  - reason: projection authority（leadingOffset）を _renderChartGrid() に
    集約し、expandToSlots() と updateChartPlayback() の両方から
    同じ値を参照できるようにするため。
  - 現時点では参照箇所なし。

- 変更: DOM属性 `data-slot-index` → `data-visual-slot-index` へ rename
  （_renderChartGrid() のslot生成部・updateChartPlayback()のセレクタ・
   ヘッダーコメント の3箇所）
  - reason: pickup projection導入後、`beatIndex`（およびDOM属性値）が
    canonical timing index ではなく visual slot index になるケースが
    生まれるため、「slotIndex = canonical」という誤認を防ぐ目的で
    属性名を visual であることが分かる名前に変更した。
  - invariant: `measure.slots[].slotIndex`（timing.js / GridViewModel側の
    canonical概念）はrename対象外。DOM属性のみ変更。
  - 動作確認: 通常曲（pickupなし）4曲でChart Mode再生・slot highlight・
    playhead・列数切替に問題なし。

- 変更: `_renderChartGrid()` のslot loopに `slot.projectionEmpty` 分岐を追加
  （PICKUP_REST_GLYPH_SVG定数も追加）
  - reason: pickup measure の visual leading slot（実beatではない領域）に
    休符glyphを表示するための受け皿。
  - invariant: projectionEmpty slotは `beatIndex` を持たない
    （timing authorityを持たないことをDOMレベルで保証するため、
     data-visual-slot-index も chart-slot--beat も付与しない）。
  - 現時点では `expandToSlots()` が `projectionEmpty: true` のslotを
    生成する経路がないため、この分岐は到達不可（dead code）。
    Step5で到達可能になる。

- CSS追加（components.cssへの反映待ち・このhandoverには未反映）
  - `.chart-slot--projection-empty`
  - `.chart-rest-glyph`

### checkpoint

- node --check: OK
- 通常曲4曲で動作確認済み（rename起因の問題なし）
- pickup projection は未発火（Step5で導入）
- 「どこで壊れたか」の切り分けのため、この時点でcommit推奨
  （commit message例: `refactor(chartmode): prepare pickup projection infrastructure`）

---

## 次の作業（Step5予定）

- `expandToSlots()` に `pickupCtx` 引数を追加し、measure0のpickup分岐
  （actual onsetMap構築 → remapPickupOnsetMap → projection-empty挿入 →
   visual空間でのcarry再生成）
- `_renderChartGrid()` でのpickupCtx構築・leadingOffset計算・
  chartState.pickupLeadingOffset更新
- `updateChartPlayback()` でのslot highlight用 actual→visual変換
  （playheadは対象外。canonical timing spaceのまま：コメントで明記）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
