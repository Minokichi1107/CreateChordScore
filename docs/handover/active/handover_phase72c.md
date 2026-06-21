# 引き継ぎ: Phase72-C完了 — Correction UI 仕上げ（メニュー・バッジ）

## 作業状態
- ブランチ: (未定)
- 直前作業: Phase72-B完了（repairRule実装 + 右クリックUI + 統合バグ修正）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| 右クリックメニューのテーマ統合 | `.chart-context-menu` / `.chart-context-item` / `.chart-context-item--clear` / `.chart-context-divider` を新設。`.chart-diag-tooltip`（Phase67）と同じtoken（surface-overlay / border-ui / r-md / shadow-md）を使用 | css/components.css |
| 項目間の区切り線 | `hasRepair`時のみ`.chart-context-divider`をDOMに追加（`margin:4px 10px`で左右の枠に接しないよう調整） | js/chartmode.js（`_showContextMenu`） |
| 補正適用中バッジ | `analysis.repairRule`の有無のみを見て「📍 小節補正中」をヘッダーに表示。`var(--surface-selected)` / `var(--border-selected)`（Phase35のamber強調token）を流用 | css/components.css, js/chartmode.js（`_renderChartHeader`） |

---

## 確定した設計原則

```
[BADGE CONTENT PRINCIPLE]
バッジは「補正が有効かどうか」という状態の有無のみを表示する。
anchor beatの絶対時刻（beatTime）はバッジ本体には表示しない。

理由: ユーザーが知りたいのは「補正中かどうか」であり、
「なぜその時刻なのか」はバッジ単体では説明できない情報のため、
中途半端に数値だけ見せると逆に意味が伝わりにくくなる
（ChatGPTレビューでの指摘・設計時に採用）。

将来「いつ補正したか」を見たくなった場合は、badgeへのhover
tooltipとして追加するのが筋が良いと判断。今回は未着手・
current-issues.mdへの起票もしない（下記参照）。

[BADGE IS PURE PROJECTION]
バッジは新しいstateを一切持たない。

  repairRule（analysis.json） → _renderChartHeader() → バッジ表示

の一方向projectionであり、chartStateにもどこにも保存しない。
Phase65（assetState）・Phase68（visual projection layer）と同じ
「projectionはstateを持たない」原則に従う。

[EXISTING TOKEN / COMPONENT REUSE PRINCIPLE]
新しいUI部品を作る際は、まず「似た性質の既存コンポーネントが
ないか」を先に確認する方針で進めた。

  右クリックメニュー → .chart-diag-tooltip と同じ性質
    （bodyに浮かぶ・ephemeral・use-once-then-discard）
    → 同じtokenをそのまま流用

  補正中バッジ      → 既存の surface-selected / border-selected
    （amber強調という意味は既にPhase35で確立済み）
    → 新しいrgba直書きを増やさず流用

結果として、今回の変更で新しい色（token）を1つも増やしていない。
```

---

## current-issues.md更新

- 今回closeしたissue: なし（current-issues.mdにこのスコープを指す既存項目がなかったため）
- 今回新規に積み残したissue: なし
  - 「再計算タイミングの最適化」（repairRule変更時のフル再描画 → 差分更新）は
    検討の結果、issueとして起票しないことに決定した。理由:
    - 実機確認で体感上のストレスなし（たかっちさん確認済み）
    - 現状の「repairRule変更 → 全再構築」は実装が単純・authorityが明確・
      デバッグしやすいという利点があり、差分更新化は逆に
      「どのmeasureが影響範囲か」「headerは？」「tooltip/selection状態は？」
      という管理対象を増やし複雑化させるトレードオフがある
    - 数百小節規模の巨大譜面で実際に重くなった場合にのみ再検討する、
      という単なるアイデアに留め、current-issues.mdには記載しない

---

## 積み残し・保留

なし。Phase72-B addendumで挙がっていた「バッジ前後の `|` が窮屈に見えるかも」
という懸念は、実機確認（screenshot）の結果、問題なしと確認された。

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| 右クリックメニュー（区切り線あり・darkテーマ） | ✅ 実機screenshot確認済み |
| 補正中バッジの表示（BPM/拍子/Capo情報と並んでヘッダーに表示） | ✅ 実機screenshot確認済み |
| バッジ前後の `\|` の見た目（窮屈さの懸念） | ✅ 問題なしと確認 |

silver/blueテーマでの実機確認は未実施（既存tokenを流用しているため理論上は
問題ないはずだが、次回それぞれのテーマでChart Modeを開いた際に確認推奨）。

---

## 次フェーズ候補

Phase72（A/B/C）はこれで完了。phase-status.md / architecture.md への正式反映は
次の棚卸し（Phase75前後）でまとめて行う方針（docs/handover/README.md参照）。

次フェーズの優先順位はPhase69 handoverの記録を踏襲:

1. 実曲pickup検証（Phase68/69の最終確認・コスト低）
2. `__CS_DEBUG__` perf instrumentation（Phase66-B・継続）
3. Chart Mode並列表示（設計フェーズが必要）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
