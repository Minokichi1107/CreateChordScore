# 引き継ぎ: Phase67完了 — Chart Mode hover chord diagram

## 作業状態
- ブランチ: main
- 直前作業: Phase66完了（debug observability consolidation）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| tooltip DOM 追加 | single instance / body直下 / _initTooltip / _destroyTooltip | js/chartmode.js |
| tooltip 表示/非表示 | _showTooltip(chord, anchorRect) / _hideTooltip() | js/chartmode.js |
| event delegation | chart-grid root への pointerover/out（idempotent guard付き） | js/chartmode.js |
| data-chord 全chord化 | compact限定 → 全 .chart-chord-name に data-chord 付与 | js/chartmode.js |
| hover hitbox 制限 | scrollWidth + 16px でテキスト幅外を無効化（carry-forward対策） | js/chartmode.js |
| relatedTarget guard | from === to で chord内移動による flicker 防止 | js/chartmode.js |
| lifecycle追加 | openChartMode→_initTooltip / closeChartMode→_destroyTooltip | js/chartmode.js |
| setTooltipEnabled export | ON/OFF 制御 | js/chartmode.js |
| initChartMode 拡張 | findChord / drawDiagram / tooltipEnabled を注入 | js/chartmode.js |
| tooltip title 追加 | chord名を tooltip 上部に表示（renderer責務に持ち込まない） | js/chartmode.js |
| 表示メニュー追加 | ✔ ♬ Chart コード図 ON/OFF（updateViewMenuChecks対応） | js/app.js / index.html |
| localStorage永続 | cs.chartDiagHover（デフォルト ON） | js/app.js |
| Shift+D ショートカット | Chart Mode中・通常時両対応 / toast表示 | js/app.js |
| CSS追加 | .chart-diag-tooltip / .chart-diag-tooltip-title | css/components.css |

---

## 確定した設計原則

### ephemeral UI（Phase67で確立）

```
tooltip は chartState に authority を持たない。
hover event → render だけで完結。state 化しない。

hover event
    ↓
_showTooltip(chord, anchorRect)
    ↓
findChord() → drawDiagram() → innerHTML
    ↓
position 計算（実サイズで overflow 判定）

chartState.activeHoverChord 等は作らない。
```

### data-chord は表示済み chord を格納する

```
_renderChartGrid() で transposeChord(rawChord, -capo) した
「表示用chord名」を data-chord に格納する。

tooltip 側は findChord(chord) のみ使用。
capo 再適用しない（二重 projection 防止）。

理由:
  hover している chord = 既に表示側の chord。
  tooltip layer が capo semantic を知る必要はない。
```

### scrollWidth による hover hitbox 制限

```
原因: carry-forward で .chart-chord-name span が
      最大1768px幅（複数小節分）に広がる。
      → 見た目上コードのない場所でもhoverが発火する。

対策: pointerover 時に
      e.clientX > rect.left + scrollWidth + 16px
      なら _hideTooltip() して無視。

scrollWidth の特性:
  overflow: hidden / ellipsis でも実際のテキスト内容幅を返す。
  zoom / font 変更に自動追従。

[重要] scrollWidth guard は interaction heuristic であり layout authority ではない。
  「テキスト幅付近のhoverだけ有効にする」暫定 interaction narrowing。
  正式な hitbox authority は将来の hover hitbox 分離フェーズで確立する。

将来候補:
  layout span と interaction span の分離
  <span class="chart-chord-name">       ← duration layout
    <span class="chart-chord-hit"        ← hover hitbox（将来）
          data-chord="Am7">Am7
    </span>
  </span>
```

### pointerover/out を採用した理由

```
event delegation（chart-grid root への単一リスナー）を使うため、
pointerenter / pointerleave ではなく pointerover / pointerout を採用。

理由: pointerenter / pointerleave は bubble しないため、
      root element での delegation が機能しない。
      pointerover / pointerout は bubble するため
      root への委譲と相性が良い。

flicker 対策: relatedTarget guard（from === to）で
      chord 内の細かい移動を無視。

この pattern は今後 tooltip 系 interaction を追加する際に再利用できる:
  event delegation を使う → pointerover/out + relatedTarget guard
```

### single tooltip instance

```
document.body に1個だけ tooltip DOM を生成。
hover のたびに DOM 生成しない。
chord 差し替え + position 更新のみ。

lifecycle:
  openChartMode()  → _initTooltip()（既存なら skip）
  closeChartMode() → _destroyTooltip()（orphan DOM 防止）

DOM 増殖確認:
  document.querySelectorAll('.chart-diag-tooltip').length === 1
```

### variant selection policy

```
tooltip は現在 first variant (v[0]) を使用。
将来 variant selection policy を統一予定（右パネルとの整合）。

// NOTE: tooltip は現在 first variant を使用。
// 将来 variant selection policy を統一予定（右パネルとの整合）。
const vr = entry.data.v[0];
```

---

## 動作確認済み項目

| 項目 | 結果 |
|---|---|
| chord hover → tooltip 表示 | ✅ |
| pointerout → 非表示 | ✅ |
| SVG diagram 表示 | ✅ |
| tooltip title（chord名）表示 | ✅ |
| capo 2 / 5 で projection 一致 | ✅ |
| lifecycle（open/close×3回）length=1 | ✅ |
| 表示メニュー ON/OFF + ✔連動 | ✅ |
| リロード後状態保持 | ✅ |
| Shift+D トグル | ✅ |
| Chart Mode中・通常時両対応 | ✅ |
| carry-forward 空白でhover無効 | ✅（scrollWidth guard）|
| relatedTarget flicker 防止 | ✅ |

---

## 積み残し・将来候補

### hover hitbox 分離（将来 Phase 候補）

```
現状: scrollWidth guard で carry-forward の誤 hover を制限。
将来: layout span と interaction span を DOM レベルで分離。

  <span class="chart-chord-name">       ← duration layout責務
    <span class="chart-chord-hit"        ← hover hitbox責務
          data-chord="Am7">Am7
    </span>
  </span>

効果:
  zoom / font 変更でもズレない
  touch long-press 対応への足がかり
  accessibility 改善
```

### tooltip variant selection policy（将来）

```
現在: first variant (v[0]) 固定
将来: 右パネルと同じ variant 選択ポリシーで統一
```

### tooltip cache（v2 以降）

```
現在: 毎 hover で drawDiagram() を呼ぶ（毎回生成）
将来: Map<normalizedChord, SVGString> cache で高速化
注意: cache は authority ではない（キャッシュミスでも正常動作を保証）
```

---

## 次フェーズ候補

```
Phase66-B: perf instrumentation
  chartmode.js に _perfState を追加
  _rafLoop で lastRAFDelta / longFrames を計測
  getPerfState() export → app.js getter projection
  priority: 低（beat cursor stall 調査用）
```

---

## commit message

```
feat: Phase67 Chart Mode hover chord diagram

chartmode.js:
- add single-instance tooltip DOM (_initTooltip / _destroyTooltip)
- add _showTooltip / _hideTooltip with real-size overflow detection
- add pointerover/out event delegation on chart-grid (idempotent)
- add relatedTarget guard (from === to) to prevent flicker
- add scrollWidth guard to disable hover on carry-forward empty area
- extend data-chord to all .chart-chord-name (was compact-only)
- add tooltip title (chord name above diagram)
- export setTooltipEnabled for ON/OFF control
- extend initChartMode: findChord / drawDiagram / tooltipEnabled injection
- add _initTooltip / _destroyTooltip to openChartMode / closeChartMode

app.js:
- add chartDiagHover state (localStorage: cs.chartDiagHover, default ON)
- inject findChord / drawDiagram / tooltipEnabled to initChartMode
- add btn-toggle-chart-diag event handler
- add Shift+D shortcut (toggle chord diagram / toast)
- update updateViewMenuChecks for chart diagram state

index.html:
- add btn-toggle-chart-diag to view menu

css/components.css:
- add .chart-diag-tooltip / .chart-diag-tooltip-title styles

[DESIGN PRINCIPLES]
  ephemeral UI: tooltip holds no chartState authority
  data-chord: stores projected chord name (no double-transpose)
  scrollWidth guard: limits hover hitbox to text area
  single instance: body-level tooltip, lifecycle-bound to Chart Mode
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
