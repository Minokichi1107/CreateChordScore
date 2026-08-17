# 引き継ぎ: Phase120完了 — 小節頭補正変更後のChart表示巻き戻りバグ修正

## 作業状態
- ブランチ: phase120-repair-rule-buffer-sync
- 直前作業: Phase119完了（Undo/Redo Mutation Feedback）

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `onSetRepairRule` | `rebuildChartViewModel(); renderChartMode({...})` の個別呼び出しを `_refreshEditorView()` へ統一 | app.js |
| `onClearRepairRule` | 同上 | app.js |

## 原因

`current-issues.md`に「観察中・原因未特定」として記録されていた
「編集中に小節頭補正を変更するとChart表示が編集前の状態に戻る」を調査し、
原因を特定した上で修正した。

```
[原因]
onSetRepairRule() / onClearRepairRule() が、getCurrentChordSource()
（Chart Modeが参照すべきコードデータを決める唯一の分岐点。
「編集中はanalysisEditor.buffer／非編集中はproject.analysis.raw」を
切り替える）を経由しない、引数なしのrebuildChartViewModel()を
呼び出していた。

rebuildChartViewModel(overrideAnalysis = null) は引数省略時、内部で
project.analysis（_getAnalysis()の戻り値）を参照する。これは
編集中のanalysisEditor.bufferを反映したliveAnalysis（通常経路が
組み立てるbuffer-aware analysis）ではない。そのためAnalysis Editor
編集中にrepairRuleを変更すると、bufferへの編集内容が無視され、
Chart Modeの表示だけが「編集前の状態」で再構築されていた。

[Undoで「戻る」ように見えていた理由]
undoEdit()は正規の再描画経路である_refreshEditorView()を呼ぶため、
その時点で初めてbuffer基準の描画に復帰していた。つまりbuffer自体は
一度も失われておらず、Chart Mode Projection層のみの不具合だった
（current-issues.mdの「データ自体が失われているのか、表示のみの問題かは
未切り分け」という記述に対する回答＝後者だった）。
```

## 設計判断

### [判断] `_refreshEditorView()`への統一（A案）を採用

```
結論: 個別にliveAnalysisを組み立てる案（B案）ではなく、既存の正規再描画
      経路である_refreshEditorView()を呼ぶ形に統一した。

理由: 通常の編集操作（追加・削除・Undo/Redo等）は全て_refreshEditorView()
      経由でChart Modeと同期されている。repairRule変更ハンドラだけが
      この経路を迂回していたことが今回の不具合の本質であり、B案
      （個別にliveAnalysisを組み立てる）は同種の迂回を新たに1箇所
      増やすだけで、将来また同じパターンの不具合を作りかねない。
      既存のAuthority/Projection経路へ合流させる方がPhase114以降の
      設計方針（既存Authorityを迂回して個別に状態を組み立てない）とも
      一致する。

事前安全性確認: 実装前に_refreshEditorView()および呼び出し先
      （setEditPointMarker/setSearchMatches/_syncSectionPreviewVisibility/
      renderSectionBar/renderAnalysisEditorPanel）を実コードで確認し、
      以下に競合がないことを確認した。
        - search同期: Derived Cacheの再計算のみ（Authority書き換えなし）
        - Section Bar同期: isAnalysisEditing()がfalseなら早期return
        - autosave: 関与なし
        - history: pushHistory()呼び出しなし
        - selection: 読み取りのみ（editPointの再同期のみ）
        - timing/normalized: liveAnalysisはproject.analysisをspreadして
          chords/raw.chordsのみ上書きする方式のため、repairRule/normalized
          は正しく引き継がれる
        - 非同期処理: _refreshEditorView()自体は同期関数。内部で見つかった
          唯一のawaitは保存ボタンのイベントリスナー登録（実行ではない）
```

### 副次的に解消された問題

`onSetRepairRule`/`onClearRepairRule`は`renderChartMode()`呼び出し時に
`editing: isAnalysisEditing()`を渡していなかった（Phase106で確立された
`[RENDER CONTEXT INVARIANT]`への違反）。`_refreshEditorView()`は内部で
これを正しく渡すため、個別の追加修正なしに自然に解消された。

## 確定した設計原則

新規Named Invariantの追加・変更なし。既存の`getCurrentChordSource()`
（Single Switch Point）・`_refreshEditorView()`（正規再描画経路）・
`[RENDER CONTEXT INVARIANT]`（Phase106）を、repairRule変更ハンドラにも
正しく適用しただけ。

## Out of Scope

- `getCurrentChordSource()`を経由しない他の呼び出し箇所の網羅的な棚卸し
  （今回はcurrent-issues.mdに記録されていた当該事象のみを対象として
  調査・修正した。同様の迂回経路が他に存在するかの網羅的監査は
  実施していない。将来のTheme Audit的な棚卸しで改めて検討する）

## 実機確認

```
□ 編集中に小節頭補正を変更 → 編集内容を維持したまま小節頭のみ移動 → OK
□ Undo → 正常に機能 → OK
□ Redo → 正常に機能 → OK
```

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue:
  - 編集中に小節頭補正を変更すると表示が編集前の状態に戻る（要調査）
    （Phase103棚卸し時に報告・Phase120で原因特定・解消。
    onSetRepairRule/onClearRepairRuleがgetCurrentChordSource()を
    経由しない再描画を呼んでいたことが原因。_refreshEditorView()への
    統一で解消。副次的に`editing`引数欠落も解消）
- 今回新規に積み残したissue: なし

## 積み残し・保留バグ

なし

## 次フェーズ候補

現時点で明確な次点候補は積み残しておらず、Phase121は新規の要望・
発見事項ベースで選定する。

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- 編集中に小節頭補正を変更すると表示が編集前の状態に戻る（要調査）
  （Phase103棚卸し時に報告・Phase120で解消。原因は
  onSetRepairRule/onClearRepairRuleが`getCurrentChordSource()`
  （Single Switch Point）を経由しない引数なしの`rebuildChartViewModel()`
  を呼んでいたこと。Analysis Editor編集中もbuffer変更が無視され、
  常にproject.analysis.raw（未編集）から再構築されていた。buffer自体は
  一度も失われておらず、Chart Mode Projection層のみの不具合だった。
  正規の再描画経路`_refreshEditorView()`への統一で解消。副次的に
  `editing: isAnalysisEditing()`引数欠落（`[RENDER CONTEXT INVARIANT]`）
  も解消）

#### ADD
- No changes.

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ 小節頭補正変更後のChart表示巻き戻りバグ修正（Phase120・
    onSetRepairRule/onClearRepairRuleが`getCurrentChordSource()`を
    経由しない再描画を呼んでいたことが原因。正規経路`_refreshEditorView()`
    への統一で解消。副次的に`editing`引数欠落（`[RENDER CONTEXT
    INVARIANT]`）も解消）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 120 | 小節頭補正変更後のChart表示巻き戻りバグ修正（原因: repairRule
    変更ハンドラが`getCurrentChordSource()`という Single Switch Point を
    経由しない再描画を呼んでいたため、編集中のbuffer変更が無視されていた。
    修正: 正規再描画経路`_refreshEditorView()`への統一。buffer自体は
    無事でChart Mode Projection層のみの不具合だった） | app.js |

- Future Candidates: 変更なし（次候補は新規の要望・発見事項ベースで選定）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
