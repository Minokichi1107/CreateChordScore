# 引き継ぎ: Phase69完了 — Chart slot active highlight stabilization

## 作業状態
- ブランチ: main
- 直前作業: Phase68完了（Chart Mode pickup-aware visual projection）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `.chart-slot--active` CSS追加 | outline主体・低alphaのslot単位アクティブハイライトを追加。3テーマ共通（`--color-blue-rgb` はPrimitive層で共通定義済みのため個別記述不要） | css/components.css |
| 配置位置 | `.chart-slot--projection-empty` セクションの直前に配置（semantic continuityのため） | css/components.css |
| JS変更 | **なし**（後述の理由により不要と判断） | — |

```css
.chart-slot--active {
  outline: 1px solid rgba(var(--color-blue-rgb), .55);
  outline-offset: -1px;
  background: rgba(var(--color-blue-rgb), .06);
  border-radius: 2px;
}
```

---

## 確定した設計原則

### Phase69の本質: playback active ownershipの監査（Phase68 boundary validation）

```
Phase69は見た目上はCSS追加のみの小規模変更だが、
設計continuity的には「Phase68で確立したprojection layerの
boundaryが正しく機能しているか」を検証するフェーズだった。

監査対象:
  1. visual slot authority      → expandToSlots()
  2. active ownership            → updateChartPlayback()
  3. projectionEmpty exclusion invariant
```

### projectionEmpty exclusionは既に構造的に完成していた（重要）

```
Phase69で確認した事実:

  updateChartPlayback() は
    `.chart-slot[data-visual-slot-index="${visualSlot}"]`
  というselectorでactive対象のslotを取得する。

  projectionEmpty slot（expandToSlots内）は
    result.push({ type:'empty', projectionEmpty:true, measureIndex: mi })
  として生成され、render側（_renderChartGrid）は
    if (slot.projectionEmpty) {
      slotEl.classList.add('chart-slot--projection-empty');
      ... (data-visual-slot-index を付与しない)
      continue;
    }
  という分岐でDOM生成する。

  → querySelector('[data-visual-slot-index="N"]') は
    projectionEmpty slotに構造的にマッチし得ない。

結論:
  「問題が起きなかったから guard を書かなかった」のではなく、
  「guard が不要になるよう DOM authority が Phase68 時点で
   既に設計済みだった」。

  semantic exclusion は runtime condition
  （例: if (!slot.projectionEmpty) ...）ではなく、
  DOM invariant（data-visual-slot-index の不在）によって
  保証される。

  projectionEmpty exclusion の ownership は render DOM generation 側
  （expandToSlots / _renderChartGrid）にあり、
  playback 側（updateChartPlayback）はこの DOM contract を
  前提として動作する。

  そのため Phase69では updateChartPlayback() /
  expandToSlots() へのコード変更を一切行わなかった。
```

### projection-aware playback highlightingの確立（CSS selectorへの浸透）

```
Phase68までは:
  actual slot space vs visual slot space の分離は
  JS（projectPickupSlotIndex / remapPickupOnsetMap）の話だった。

Phase69で確認した事実:
  active ownership selector は既に
  `.chart-slot[data-visual-slot-index="${visualSlot}"]` を使用していた
  （updateChartPlayback() は Phase68時点でこの形になっていた）。

  Phase69で変更したのは CSS のみ（.chart-slot--active の追加）。
  その結果、playback highlight（表示層）も
  visual slot space を対象とした projection-aware な振る舞いとして
  視覚的に成立した。

  つまり Phase69 は selector を変更したフェーズではなく、
  既に projection-aware だった ownership に対して
  視覚的フィードバック（CSS）を与えたフェーズである。

  「slot-level projection-aware playback highlighting」の確立
  （未来の continuous playhead remap / tuplet projection /
   swing visualization 等を含む完成ではない。
   それらは別途将来の拡張として扱う）。
```

### slot active のレイヤー構造（視覚的役割分離）

```
1. playhead（continuous motion）
     「時間が連続的に流れている」
     現時点では canonical timing space のまま（measure内 left%）

2. slot active（離散的 beat focus・Phase69で追加）
     「今この拍にいる」
     visual slot space（data-visual-slot-index）を対象

3. measure active（broad context）
     「この小節が今鳴っている」
     .chart-measure--active（背景・border）

slot active は outline主体・低alpha(.06)に抑え、
measure activeの「面」の上に載る二次的・離散的フォーカスとして
layer competitionを避けている。

blue themeはsaturationが強くなりやすいため、
background alphaは初期案の.10から.06へ引き下げた。
```

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| 再生中、現在の拍に薄い青枠が表示される | ✅ |
| pickupなし曲での通常動作（4小節+1行目スクリーンショットで確認） | ✅ |
| carry slot（chord labelなし）上でのactive表示（枠のみ） | ✅（想定通り・違和感なし） |
| projectionEmpty slotへのactive非表示 | ✅（構造的に到達不可。Phase68 synthetic testで既に確認済みのprojection-empty exclusionと一致） |

---

## 積み残し・保留

### 実曲pickup検証（Phase68から継続）
```
状態: 未着手
内容: projection-empty slot + slot--active の組み合わせを
      実際のpickup曲で最終確認する。
      Phase68 synthetic test（FORCE_PICKUP_DEBUG）では
      projection-empty側にactiveが一度も出現しないことを確認済み。
      Phase69のCSS追加後も同様の構造のため、再検証コストは低い。
```

### debug API整理（Phase66から継続）
```
状態: 未着手
内容: window.__CS_DEBUG__ への統合（perf instrumentation等）。
```

### Chart Mode並列表示（設計フェーズが必要）
```
状態: 設計前
注意: Phase68/69で確立したprojection layerのboundaryは
      まだ新しく、ここに subsystem boundary を追加する
      Chart Mode並列表示を勢いで実装すると、
      projection layerを壊すリスクが高い。
      着手前に設計フェーズを必ず挟むこと。
```

---

## 次フェーズ候補（優先順位）

1. 実曲pickup検証（コスト低・Phase68/69の最終確認）
2. debug API整理（Phase66から継続・実装コスト小）
3. Chart Mode並列表示（設計フェーズが必要・優先度は他より低い）

---

## commit message

```
feat(chartmode): Phase69 chart slot active highlight stabilization

css/components.css:
- add .chart-slot--active (outline-based, low-alpha)
  - outline: 1px solid rgba(var(--color-blue-rgb), .55)
  - outline-offset: -1px
  - background: rgba(var(--color-blue-rgb), .06)
  - border-radius: 2px
- placed adjacent to .chart-slot--projection-empty section
  for semantic continuity

js/chartmode.js:
- no changes required after boundary audit
  (active ownership selector already used
   [data-visual-slot-index], pre-existing since Phase68)

[AUDIT RESULT]
  playback active ownership uses
  `.chart-slot[data-visual-slot-index="${visualSlot}"]`.
  projectionEmpty slots never receive data-visual-slot-index
  (expandToSlots / _renderChartGrid, Phase68), so this selector
  cannot match them structurally.

  semantic exclusion is guaranteed by DOM invariant
  (absence of data-visual-slot-index), not by runtime
  conditionals. No guard code added.

[DESIGN NOTE]
  slot active = discrete beat focus, layered above
  measure active (broad context) and below playhead
  (continuous motion). outline-first to avoid layer
  competition; background alpha kept low (.06) for
  blue theme.

  CSS selector now operates in visual slot space
  ([data-visual-slot-index]), establishing
  slot-level "projection-aware playback highlighting"
  (selector itself was already projection-aware since Phase68;
  Phase69 added the visual feedback layer).
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
