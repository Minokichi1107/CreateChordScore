# 引き継ぎ: Phase54完了 — Chart Mode 3列/4列切替 + measure-based chord projection

## 作業状態

* ブランチ: main
* commit: `feat: Phase54 chart mode layout toggle and measure-based chord projection`

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `renderChartMode({ measuresPerRow })` | シグネチャ変更・引数注入方式 | js/chartmode.js |
| `_renderChartGrid(vm, analysis, { measuresPerRow })` | `MEASURES_PER_ROW` を引数から取得 | js/chartmode.js |
| `openChartMode()` 責務分離 | render 呼び出しを削除（transition のみに） | js/chartmode.js |
| `COMPACT_CHORD_LENGTH = 8` | compact 閾値を定数化（layout heuristic） | js/chartmode.js |
| compact 表示 | 8文字以上のコード名を縮小（font-size: 10px） | js/chartmode.js |
| `chart-chord-name` absolute 配置 | スロット幅 → 小節幅基準へ変更（根本修正） | css/components.css |
| ホバーツールチップ | body直下JS生成（overflow:hidden を突き抜け） | js/chartmode.js / css/components.css |
| `chart-slot--onset` 削除 | onset背景マーカーを演奏UIから除去 | js/chartmode.js |
| `chartMeasuresPerRow` | localStorage永続・persistence 責務を app.js に | js/app.js |
| `#chart-col-switcher` UI | 3列/4列切替ボタン（ヘッダー内） | index.html / css/components.css |
| render trigger 統一 | open時・capo変更時・列数切替時を app.js に集約 | js/app.js |

---

## 確定した設計原則

### render authority の分離

```txt
openChartMode()   = mode transition のみ
                    （viewModel構築 + overlay表示 + transport初期化）

renderChartMode() = projection rendering
                    呼び出しは app.js が責務を持つ
```

render trigger はすべて app.js 側に集約：

| trigger | owner |
|---|---|
| chart open | app.js |
| capo change | app.js |
| column change | app.js |

### measure-based chord projection（今回の根本修正）

```txt
before: chord name が slot width に拘束されていた
        → 4拍子8スロットなら 1/8 セル幅しかもらえない

after:  chord name を position: absolute で小節基準に昇格
        → .chart-measure を基準に left/right/bottom で展開
```

これにより今後 subdiv 増加・6/8・syncopation でスロット密度が上がっても
コード名の可読性が崩れない。

### measuresPerRow 注入方式

```txt
persistence:        app.js（localStorage）
menu UI / state:    app.js
layout projection:  chartmode.js
row grouping:       chartmode.js
```

renderer 内で localStorage を読まない（renderer が persistence authority を持たない）。

将来の拡張：

```js
renderChartMode({
  measuresPerRow,
  beatGrid,        // 将来
  densityMode,     // 将来
})
```

### onset visualization の撤去

```txt
chart-slot--onset（薄い背景マーカー）を削除。

理由:
  analysis semantic（コードチェンジイベント）が
  performance semantic（演奏ビュー）に混入していた。

hasOnset 変数は carry-forward 判定（chart-chord--carried）
のために内部に保持。
```

### compact 表示の方針

```txt
COMPACT_CHORD_LENGTH = 8 文字以上で縮小。
行高は変えない（playback follow / active highlight の位置を維持するため）。
ホバー時にツールチップで完全表示。
ellipsis は維持（重なり防止）。
```

今回採用しなかった案とその理由：

| 案 | 不採用理由 |
|---|---|
| wrap | 行高可変 → active follow が不安定化 |
| overflow visible（全セル） | 後続セルと重なり後続コードが隠れる |
| flex-grow | measure width ≠ 時間感覚になる |
| adaptive 3列 fallback | measureIndex → row が固定式でなくなる |

---

## 積み残し・保留

### COMPACT_CHORD_LENGTH の調整

現在 `8` は heuristic。今後以下のケースで調整が必要になる可能性がある：

* 3列時は不要（セル幅が広いため）
* mobile 表示時は閾値を下げる
* フォントサイズ変更時

現段階では列数に関係なく一律適用。

### compact 表示の将来リファクタリング

現在 `.chart-chord-name--compact` は `<span>` に直接付与しているが、
将来 chord 表示が `root / tension` 分離や accidental styling に進んだ場合、
wrapper 単位（`.chart-chord`）へ compact 責務を移す可能性がある。

### ツールチップ lifecycle

現在は `initChartMode()` で一回生成・mousemove 委譲。
将来 hot reload / re-init が入る場合は二重リスナー化しないよう注意。

### chart-slot--onset（将来のdebug overlay）

onset 背景は削除したが、`hasOnset` 判定は renderer 内に残している。
将来 `表示 > onset markers` のような overlay toggle が来た場合に再利用できる。

---

## 次フェーズ候補

### A. moveChordAcrossLines（editor core mutation）

先頭コード→前行末尾 / 末尾コード→次行先頭への移動。

注意：editor core mutation layer の問題になるため、
modal subsystem 内の小機能として実装しない。

### B. transient preview restore

Phase52 で実装済み。将来の Add Simile / Inline Edit / Transpose Preview でも
退避→commit/rollback パターンを再利用できる雛形として確立されている。

### C. Chart Mode mini transport enhancement

既存 mini transport の機能拡張。
将来的に:
- compact layout
- transport detach
- playback authority 分離
- follow mode
などを検討。

### D. Chart Mode 並列表示

設計フェーズが必要（editor renderer / chart renderer の single source of truth）。

---

## current-issues 変更

以下を完了扱いとする：

* `Chart Mode 小節数切り替え（Phase49.5より持ち越し）` → **Phase54 で実装完了**

---

## commit message

```txt
feat: Phase54 chart mode layout toggle and measure-based chord projection
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
