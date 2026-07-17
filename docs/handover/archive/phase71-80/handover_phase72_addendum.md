# 引き継ぎ: Phase72-B完了 — repairRule実装 + 右クリックUI + 統合バグ修正

## 作業状態
- ブランチ: (未定)
- 直前作業: Phase72-A完了（Correction Authority 設計フェーズ）

---

## 概要

Phase72-Aで確定した設計（repairRule = ユーザー意図の保存、anchorDownbeat方式）を
実装し、Chart Mode上の右クリックメニューから「ここを小節頭にする」「小節補正を解除」
を操作できるようにした。

実装はClaude（実装）・ChatGPT（レビュー）・たかっちさん（実機テスト・最終判断）の
三者往復で進行。レビューで2件の修正必須指摘・3件の確認推奨指摘を受け、
全て対応した上で実機テストへ進んだ。実機テストで2件の統合バグを新たに発見・修正した。

---

## 完了したこと

### 1. timing.js — applyAnchorRepair + quantizeTime修正

| 変更 | 内容 |
|---|---|
| `applyAnchorRepair(beats, downbeats, repairRule, timeSignature)` 新設 | pure function。anchor beat以降のdownbeatsをbeatsPerMeasure間隔で再生成。anchor beatがbeats[]に存在しない場合はconsole.error + no-op |
| `createTimingModel()` に `repairRule` 引数追加 | applyAnchorRepairの結果をbuildMeasuresへ渡す |
| `quantizeTime()` の measure特定ロジック刷新 | beatCount積み上げ方式 → measures[].startTime/endTime範囲判定方式に変更（不揃い小節に対応するため） |
| `beatIdx` 再計算バグ修正（ChatGPTレビュー指摘） | anticipationWindow吸着でnearestIdxが更新された後にbeatIdxを再計算するよう修正。修正前は吸着前のnearestIdxでbeatIdxが固定され、beatInMeasureが負値になる可能性があった |
| `findIndex` 比較を厳密一致に変更（ChatGPTレビュー指摘） | `b >= startTime - EPS` → `Math.abs(b - startTime) < EPS`。ASSUMPTION（measure.startTimeはbeats[]上に必ず存在する）をコメントで明記 |

### 2. analysisLoader.js — repairRule transport

| 変更 | 内容 |
|---|---|
| `saveAnalysisFile(projectId, raw, repairRule = null)` | repairRule引数追加・POSTペイロードに含める |
| `loadAnalysisFile(projectId)` 戻り値変更 | `raw` 直接返却 → `{ raw, repairRule }` を返却（旧形式ファイルはrepairRule: null） |
| `loadAnalysis(analysis)` | `analysis.repairRule` を抽出し、normalizedとは別の独立フィールドとして project.analysis に含める |

server.py の変更は不要（受け取ったJSONをそのまま永続化する既存実装のため）。

### 3. chartmode.js — 右クリックUI

| 変更 | 内容 |
|---|---|
| `_getBeatTimeFromSlot()` 新設 | クリックされたslotからmeasure.startTimeを起点にbeats[]を逆引きし、その拍の頭の時刻（beatTime）を返す |
| `resolutionPerBeat` 算出修正（ChatGPTレビュー指摘） | `measure.beatCount` から算出 → `timeSignature.numerator` から算出に変更。measureに依存しない値にすべきという設計指摘（実装上はbuildMeasuresがbeatCountを常にtimeSignature固定値で返すため実害はなかったが、設計としては誤りだった） |
| `_showContextMenu` / `_hideContextMenu` / `_setupContextMenu` 新設 | ephemeral UI（chartStateにauthorityを持たない、Phase67 tooltipと同じ思想）。document委譲方式（ChatGPTレビュー指摘①対応：grid要素のDOM再生成リスクを排除するため） |
| `rebuildChartViewModel()` 新設（export） | openChartMode()からviewModel再構築部分のみを切り出し。repairRule変更後の再描画に使用 |
| `initChartMode()` に `onSetRepairRule` / `onClearRepairRule` コールバック追加 | persistence・project.analysis更新はapp.js側の責務として注入 |

### 4. app.js — コールバック実装 + 統合バグ修正

| 変更 | 内容 |
|---|---|
| `onSetRepairRule` / `onClearRepairRule` 実装 | 上書き確認（confirm）・saveAnalysisFile・project.analysis更新・rebuildChartViewModel・renderChartMode・toast |
| `saveAnalysisFile` 戻り値チェック追加（ChatGPTレビュー指摘②対応） | 保存失敗時はproject.analysis.repairRuleを更新せずreturn。「画面だけ補正済みに見えるが実際は保存されていない」不整合を防止 |
| **[hotfix] loadChordData の isRestore=true 経路でanalysis処理を完全スキップ** | 詳細は「発見した統合バグ」セクション参照 |
| **[hotfix] 自動復元ダイアログの復元条件修正** | 詳細は「発見した統合バグ」セクション参照 |

---

## 発見した統合バグ（実機テストで発覚）

### バグ①: isRestore=true経路がrepairRuleを消失させる

```
[症状]
  ファイルメニュー「開く」でproject.jsonを開き直すと、
  Chart Modeの補正（repairRule）が消えて元の解析結果に戻ってしまう。

[原因]
  loadProj() の実行順序:
    ① analysis/{id}.json から正しいrepairRuleを読み込む
    ② IndexedDBに保存されているコードJSON（chord_source）を
       loadChordData(data, filename, isRestore=true) で自動復元

  loadChordData() は isRestore の値に関わらず無条件で
    project.analysis = await loadAnalysis(data.analysis ?? null);
    if (data.analysis?.raw) { saveAnalysisFile(project.id, data.analysis.raw); }
  を実行していた。

  これにより①で正しく読み込んだanalysis（repairRule含む）が、
  IndexedDB内のコードJSONに埋め込まれていた古いanalysisスナップショットで
  上書きされ、repairRuleなし（デフォルトnull）でanalysis.jsonへ
  再保存されてしまっていた。

[本質]
  IndexedDB復元（isRestore=true）はコード進行データ（palette / 
  chord_source表示名）の復元が目的であり、analysisの復元が目的ではない。
  にもかかわらずIndexedDB内のスナップショットがanalysisのauthorityを
  侵害していた（ChatGPTレビューでの指摘: 「IndexedDBがanalysisの
  authorityになってしまう瞬間が発生していた」）。

[修正]
  loadChordData() 内のanalysis関連処理（loadAnalysis呼び出し・
  saveAnalysisFile呼び出し）を if (!isRestore) { ... } で囲み、
  isRestore=true時は完全にスキップするよう変更。

  analysis（raw / repairRule）の唯一の正本は analysis/{id}.json で
  あり、loadProj() が既に読み込み済みであるため、isRestore=true 
  経路で再度組み立てる必要はない。

[副作用確認]
  isRestore=true経路の後続処理（updateChartModeAvailability等）が
  project.analysisの「存在有無」のみを見ており、再構築結果に
  依存していないことをgrepで確認済み。

  3つの呼び出し経路（手動インポート/旧形式migration/IndexedDB復元）
  のうち、今回スキップ対象にしたのはIndexedDB復元のみ。
  手動インポート・旧形式migrationは従来通り動作する。
```

### バグ②: 自動復元ダイアログがlines=0のプロジェクトで出ない

```
[症状]
  Chart Mode専用プロジェクト（歌詞行を1行も持たない、
  audio/chord_sourceのみのプロジェクト）でリロードすると、
  「前回の作業を復元しますか？」のダイアログが出ない。

[原因]
  自動復元の表示条件が
    if (saved && saved.lines && saved.lines.length > 0) { ... }
  となっており、lines=0のプロジェクトは復元対象から漏れていた。

[切り分けの経緯]
  当初repairRule消失バグの巻き添え（Phase72-Bの回帰）を疑ったが、
  実機テストでローカルストレージ（cs_auto）の中身を直接確認した結果、
  title/artist/audio/chord_source/hasAnalysisは全て正しく
  保存されており、lines: [] のみが空という状態だった
  （これはこのプロジェクトの性質上、最初からlinesが空である
  「正しい状態」であり、データ破損ではなかった）。

  たかっちさんの「過去の機能実装でも同様の問題があった」という
  証言により、メモリに記録されていたPhase65の修正
  （restored asset state synchronization: 
   「lines=0でもtitle/artist/audio/chord_sourceがあれば
    復元対象に含める」）を疑い、現在のapp.jsの条件式を確認したところ、
  古い条件式（lines.length > 0 のみ）のままだったことが判明した。

  [ChatGPTレビューでの指摘]
    「Phase65で直したはず」という記憶ベースの断定は危険であり、
    本当にPhase65時点でこの修正が存在したかはGit履歴・
    handover記録・phase-status.mdの確認なしには断定できない、
    との指摘を受けた。本記録ではこの指摘を踏まえ、断定を避け
    「メモリ上の記録と現在の実コードに差異があった」という
    事実ベースの記述に留める。

[修正]
  saved.id && (lines.length > 0 || title || artist || audio || 
  chord_source) を復元対象の条件とするよう変更。
  Chart Mode専用プロジェクト（linesが空）でも、他のメタデータが
  あれば「作業中だったプロジェクト」とみなし復元対象に含める。

[本質的な教訓]
  CreateChordScoreのプロジェクトは「歌詞中心」「コード中心」
  「Chart Mode専用」「Audio解析中心」など性質の異なる
  プロジェクトが混在する。
  lines（歌詞・コード譜本体）の有無だけを基準にした判定は、
  Chart Mode専用プロジェクトのような「linesが本質的に空」の
  ケースを継続的に見落とすリスクがある。
```

---

## 確定した設計原則（追加分）

```
[ANALYSIS AUTHORITY INVARIANT]
analysis（raw / repairRule）の唯一の正本は analysis/{id}.json。
project.json 内の chord_source（IndexedDB復元される
コードJSONスナップショット）に埋め込まれたanalysisは、
インポート時点のスナップショットに過ぎず、復元時のauthorityに
してはならない。

isRestore=true（IndexedDB自動復元）経路は、コード進行データ
（palette / chord_source表示名）の復元のみを責務とし、
analysisには一切触れない。analysisの復元はloadProj()が
既に担当済みである。

[RESTORE ELIGIBILITY INVARIANT]
自動復元（autosave restore）の対象判定は、lines.length > 0 
のみを基準にしてはならない。CreateChordScoreは「lines が
本質的に空であるプロジェクト」（Chart Mode専用等）が存在する
ため、title / artist / audio / chord_source 等の他のメタデータ
も判定基準に含めること。
```

---

## current-issues.md更新

- 今回closeしたissue:
  - 「Chart Mode timing correction（manual repair）」
    （Phase72-Aで追加されたissue。実装完了によりclose）

- 今回新規に積み残したissue:
  - なし（バグ②の修正により、Phase65相当の修正は再適用済み）

- 今回再確認が必要と判明した既存記録:
  - 「restored asset state synchronization」がphase-status.md /
    architecture.md上は「完了（Phase65設計・Phase66実適用）」と
    記載されているが、今回作業時点の実コードには反映されていな
    かった。Git履歴上いつ・なぜ巻き戻ったかは未調査。
    次回のコード監査（5フェーズ棚卸し等）で、記録上「完了」と
    なっている項目が実コードと一致しているかの抜き取り確認を
    推奨する。

---

## テスト運用への申し送り（重要）

ChatGPTレビューでの提案を踏まえ、今後の実機テストでは以下の
4パターンのプロジェクトを最低限の確認セットとして持つことを推奨する。

```
テスト用サンプルプロジェクト:
  1. lines あり・audio なし
  2. lines あり・audio あり
  3. lines なし・audio あり  ← 今回バグ②が発覚したパターン
  4. lines なし・audio なし
```

「lines が空の特殊プロジェクト」はテストから漏れやすく、
今回のように既存の復元ロジックが暗黙にlines.length > 0を
前提にしていると、Chart Mode専用プロジェクトのような利用法で
継続的に問題が顕在化する。新しい永続化・復元系の機能を追加する際は、
上記4パターンでの動作確認を基本セットに含めること。

---

## 動作確認済みシナリオ（実機テスト最終結果）

| シナリオ | 結果 |
|---|---|
| 補正なし曲で右クリック→「ここを小節頭にする」 | ✅ |
| 補正済み曲で別位置を右クリック→上書き確認ダイアログ | ✅ |
| 補正済み曲で「補正を解除」 | ✅ |
| ファイルメニュー「開く」での再オープン→repairRule保持 | ✅（hotfix①後） |
| 再解析（analysis再インポート）→repairRule自動破棄 | ✅ |
| lines=0プロジェクトでのリロード→自動復元ダイアログ表示 | ✅（hotfix②後） |

---

## 次フェーズ候補

```
Phase72-C（UX改善・後回し）:
  - コンテキストメニューの見た目調整（CSS未実装。現状は
    最低限のインラインスタイルのみで表示されている）
  - 補正適用中であることを示す視覚的インジケーター
  - 再計算タイミングの最適化

その他:
  - 「lines=0プロジェクト」の概念整理
    （Chart Mode専用プロジェクトという利用法が実態として
     定着しつつあるため、project.lines の意味づけ・
     UI上の扱いを将来的に見直す余地がある。優先度低）
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
