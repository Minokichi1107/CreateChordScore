# 引き継ぎ: Phase51完了 — Chart Mode CSS局所整理

## 作業状態
- ブランチ: main（マージ済み）
- commit: `bde3912` refactor: Phase51 — Chart Mode CSS局所整理

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| CHART MODE OVERRIDESセクション新設 | 旧 CHART TRANSPORT セクションを置き換え | css/theme.css |
| silver特例を移動 | silverブロック内のchart-measure系4ルールをChart Modeセクションへ relocation | css/theme.css |
| コメント整備 | `semantic定義禁止` / `component override のみ` を明文化 | css/theme.css |

---

## 確定した設計原則

### CHART MODE OVERRIDESセクションのルール
- ここには component override のみ置く（selector + value）
- semantic定義禁止（変数定義は各テーマの `:root` / `body[data-theme]` 側）
- 将来のテーマ追加・Chart機能拡張はこのセクションに追記する

### セクション構成
```
CHART MODE OVERRIDES
  ├ 共通 component override（全テーマ）
  ├ silver特例（コントラスト補正）
  └ blue特例（text visibility補正）
```

### 変数 vs override の分離
```
各テーマブロック（:root / body[data-theme="silver"] 等）
  → semantic variable 定義のみ
  → --chart-seek-track / --chart-seek-fill 等の変数はここ

CHART MODE OVERRIDES セクション
  → selector + value の component override のみ
  → chart-measure / chart-chord-name 等の実ルールはここ
```

---

## 変更の性質

- selector変更なし
- value変更なし
- specificity変更なし
- cascade順序変更なし
- relocation + コメント整理のみ

---

## 動作確認済み（Phase51完了時点）

| テーマ | active highlight | transport text | chord text | 結果 |
|---|---|---|---|---|
| silver | 青・明確に見える | 視認OK | 白文字 | ✅ |
| dark | 青枠・コントラストあり | 視認OK | 白文字 | ✅ |
| blue | 青・明確に見える | 視認OK | 文字色OK | ✅ |

---

## 背景・経緯

Phase50（Chart Mode mini transport追加）で急速に増えたChart関連CSSが
theme.css内に「症状別対処」として散在していた。

具体的には：
- `body[data-theme="silver"]` ブロック内に chart-measure 系 selector が混入
- `COMPONENT OVERRIDES — CHART TRANSPORT` と silver特例が別々のセクションに分断
- Phase50で一度発生した `:root` ブロック崩壊（selector混入）の再発リスク

今回の整理で：
- semantic variable layer と component override layer が物理的に分離
- Chart Mode関連の override が1セクションに局所化
- 「Chartに何か追加するときはここを見る」が成立する状態に

---

## 積み残し・保留

特になし。Phase51の全修正は完結している。

---

## 次フェーズ候補

### A. Chart Mode measures-per-row 切り替え（中規模・設計フェーズが必要）
`MEASURES_PER_ROW` を定数→引数化。表示メニューに 3列/4列 トグル追加。
render関数の引数追加が呼び出し元に波及するため設計フェーズが必要。

### B. 行またぎコード移動（中規模）
先頭コード→前行末尾 / 末尾コード→次行先頭への移動。
`moveChordAcrossLines` として app.js 内に設計済み（Phase38-3）。

### C. transient preview restore（小規模）
chordEntry.js の modal close 後に diagLockedChord を右パネルに再表示。
`restoreDiagAfterTransientPreview()` を app.js に追加・closeMod() から呼ぶ。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
