# 引き継ぎ: Phase89完了 — Add Chord Transaction統合（Issue #46対応）

> ChatGPTレビュー済み。Phase89完了と判断。

## 作業状態
- ブランチ: phase89-add-chord-transaction（想定。実ブランチ名は運用に合わせて読み替え）
- 直前作業: Phase88完了（Command Layer拡張：updateChord/splitChord/moveBoundary）

---

## 1. Purpose（目的）

Phase88で発見されたIssue #46（Add Here / aep-addでコードを追加すると、
Undoが2段階に分かれる）を解消する。

`splitChord()` → `updateChord()` の直列呼び出しでは、それぞれが独立して
`pushHistory()` を呼ぶため、ユーザーからは1回の操作に見える「コードを追加」が
内部的にはUndo単位2回に分かれていた。これを1回のUndo単位へ統合する。

---

## 2. Scope（今回やったこと）

```
① analysisCommands.jsにaddChordCommand()を新設
   ・splitChordCommand / updateChordCommandは呼び出さず、
     同じロジックを局所的に複製した上でpushHistory()を1回だけ呼ぶ
   ・右側（新規）コードのchord名は生成時点で確定させる
     （updateChordCommand相当の処理をsplit処理に統合）
   ・refreshSelection()をCommand内で実行（新規コードを単独選択）

② app.jsにaddChord()ラッパーを新設
   ・setSelectedChordIds()（Chart Mode同期）・_refreshEditorView()を実行

③ 呼び出し側2箇所を置換
   ・addChordAtEditPoint()
   ・aep-addボタンハンドラ
   いずれも「splitChord→updateChord→_refreshSelection→setSelectedChordIds→
   _refreshEditorView」の5行を、addChord()の1行へ置換した

④ 実機確認（4パターン）
   ・Add Here → Undo1回で分割前に戻る
   ・aep-add → Undo1回で分割前に戻る
   ・新規コードへの選択・Chart Modeハイライト同期
   ・Add Here範囲外時のtoast表示・状態不変
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・splitChordCommand / updateChordCommand本体の変更
  → 他4箇所（replaceCurrentMatch等）が依存しているため、シグネチャ・
    挙動とも無変更とした。addChordCommandは独立した新規関数として、
    ロジックのみ局所的に複製する方針を採った。

・Chart Mode側の表示バグ（極小duration chordの表示重なり）の調査・修正
  → 実機確認中に発見したが、addChordCommandのstate mutation（range check）
    には問題がなく、原因はChart Mode側（chartmode.js）の描画にあると
    推測される。Phase89のスコープ（Undo transaction統合）とは別軸のため、
    調査・修正は将来フェーズへ切り出す（詳細は§6/§7）。

・current-issues.mdの更新タイミング
  → README `[ISSUE TRUTH SOURCE INVARIANT]` に従い、issueのopen/closeは
    handover作成時点（本handover）で確定する。実ファイル（current-issues.md）
    への反映は、本handoverの内容をtruth sourceとして次回ドキュメント更新
    （5フェーズ棚卸し）時に同期する。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `addChordCommand`新設 | 分割＋リネームを1トランザクションで実行。`pushHistory()`を1回だけ呼ぶ。`{ ok, newId, reason? }`を返す（`reason`は`'not-found'`\|`'invalid-range'`） | analysisCommands.js |
| `addChord()`ラッパー新設 | Command呼び出し＋Chart Mode同期（`setSelectedChordIds`）＋`_refreshEditorView()` | app.js |
| `addChordAtEditPoint()`置換 | 5行（splitChord/updateChord/_refreshSelection/setSelectedChordIds/_refreshEditorView）を`addChord()`の1行へ置換 | app.js |
| `aep-add`ハンドラ置換 | 同上 | app.js |
| import追加 | `addChordCommand`をanalysisCommands.jsからimport | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] addChordCommandはsplitChordCommand/updateChordCommandを呼び出さず、ロジックを局所的に複製する

```
結論:
  再利用案（splitChordCommand() → updateChordCommand()を内部で順に呼ぶ）は
  不採用とし、両者と同じロジックをaddChordCommand内に複製する形にした。

理由:
  splitChordCommand/updateChordCommandはいずれも内部でpushHistory()を
  独立して呼ぶ。これらをそのまま順に呼ぶと、結局pushHistoryが2回走り
  Issue #46を解消できない。「historyを積まない内部版」を別途用意すると
  APIが二重化し保守性が落ちる。DRY違反に見えるが、これはUndo transaction
  boundaryを明示するための意図的な複製であり、既存の2関数のシグネチャ・
  挙動を変えない（他4箇所への影響回避）という制約の下で、最も影響範囲が
  小さく既存契約を維持できる方法として採用した。
```

### [UNDO TRANSACTION INVARIANT]（今回確立・architecture.md/current-issues.md反映候補）

```
ユーザーから「1回の操作」と認識される編集は、内部的に複数のbuffer mutation
を伴っても pushHistory() は1回でなければならない。

Phase79のcommitPastePlan（Paste系）で確立した原則を、Add Here / aep-add系
（コード追加操作）にも同様に適用したもの。将来「分割+α」のような複合操作を
追加する際も、この原則を踏襲する。
```

### [判断] app.js側の責務分離はPhase87/88のパターンをそのまま踏襲

```
結論:
  analysisCommands.js側はstate mutation + refreshSelection + Result返却のみ。
  setSelectedChordIds()（Chart Mode同期）・_refreshEditorView()（DOM再描画）は
  app.js側のaddChord()ラッパーに集約した。

理由:
  [BOUNDARY INVARIANT]（Phase87で確立）を維持するため。Command層がDOM/
  Chart runtimeに触れないという既存境界を今回も一切崩していない。
```

### [判断] 失敗時メッセージの非対称性は現状維持

```
結論:
  addChordAtEditPoint: 失敗時にtoast「この位置には追加できません」を表示
  aep-add: 失敗時は無言（return のみ）
  という既存の非対称な挙動をそのまま踏襲した。

理由:
  Phase87のcutSelectionと同じ方針（アーキテクチャ整理とUX変更を混在させない）。
  今回のスコープはUndo transaction統合のみであり、UXの統一は対象外。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### aep-addは常に中間点分割のため、range check failureのテスト対象にならない

```
実機検証④（Add Hereで時間が足りない位置に追加した場合の失敗テスト）を
当初aep-add（＋ボタン）で試みたが、これは失敗しなかった。

原因: aep-addのsplitTimeは常に (chord.start + chord.end) / 2 で算出される
中間点であり、コードのdurationが0でない限り必ず(start, end)の範囲内に
収まる。つまりaep-addの実装上、range check（[INVARIANT 1]相当）は
原理的に失敗し得ない。

「範囲外の時刻」を生成しうるのはeditPointのグリッド座標から独立に
splitTimeを算出するAdd Here（addChordAtEditPoint）のみであり、
range check failureの検証は必ずAdd Here側で行う必要がある。
この区別は将来同様のテスト設計をする際の再発防止知見として残す。
```

### 個別移動ボタンで極小durationにしたコードをaep-addで分割すると、表示が重なる（原因未特定・Chart Mode側と推測）

```
実機確認の過程で、個別移動ボタンによりコードの幅を極端に狭めた
（duration≈0だが0ではない）状態でaep-add（中間点分割）を実行すると、
分割自体はaddChordCommandのrange checkを正常に通過して成功するが、
新規コードが隣接コードの描画に隠れて見えなくなる現象を発見した。

分割はstate上は正しく実行されている（duration 0のコードは生成されない・
range checkが機能している）ため、Phase89のaddChordCommand側の問題ではないと
判断した。原因はChart Mode側（chartmode.js）の極小duration時のslot幅計算に
あると推測されるが、静的コード確認では未特定。次回発生時に
`window.__CS_DEBUG__.chart`で実測し、事実ベースで原因を切り分ける方針。
```

---

## 7. Remaining Issues（残課題）

```
・Chart Mode: 極小duration chordの表示重なり（新規発見）
  状態: 観察中（原因未特定・再現条件は判明）
  内容: 個別移動ボタンでコードの幅を極端に狭めた状態でaep-add（中間点分割）を
  実行すると、分割自体は成功するが新規コードが隣接コードの描画に隠れることがある。
  addChordCommand側のrange checkは正常に機能しており、原因はChart Mode側の
  slot幅計算にあると推測される。次回発生時にwindow.__CS_DEBUG__.chartで実測して
  原因を切り分ける。

・Issue #46（Add Here/aep-addのUndoが2段階になる）
  状態: 本フェーズで解消済み（実機確認4パターンで確認済み）
  current-issues.mdからの削除は次回5フェーズ棚卸し時に実施
  （詳細は末尾セクション参照）
```

---

## 8. Next Phase（次フェーズ開始位置）

```
Phase89でIssue #46は解消済み。次フェーズの候補は明確な優先順位が
まだ確定していないため、current-issues.md「5. Future Features」
「ロードマップ」を参照して選定する。

新規発見事項として、以下を次の作業機会の候補に追加する:
・Chart Mode極小duration chord表示重なりの原因調査
  （着手時はwindow.__CS_DEBUG__.chartでの実測を先に行うこと。
  静的コード推論のみでの原因断定はしない、という既存ルールに従う）
```

---

## 9. Files Changed（変更ファイル一覧）

```
analysisCommands.js
  ・addChordCommand()を新設（moveBoundaryCommandの直前に配置）
  ・理由: Add Chord操作のUndo transaction統合（本フェーズの主目的）

app.js
  ・analysisCommands.jsからのimportにaddChordCommandを追加
  ・addChord()ラッパーを新設（splitChord()の直後に配置）
  ・addChordAtEditPoint() / aep-addボタンハンドラの本体を
    addChord()呼び出しへ置換
  ・理由: 上記と同じ。DOM/Chart runtime副作用はaddChord()ラッパー側に集約
```

---

## 10. Micro Log

- 実装前に既存のsplitChordCommand/updateChordCommand（analysisCommands.js）を
  実コード確認し、両者が独立してpushHistory()を呼ぶ構造であることを確定
  してから設計を決定した（Phase87/88の教訓を踏襲）
- ChatGPTレビューにより、再利用案（split→update呼び出し）ではなく
  ロジック複製案を採用する方針を確定
- node --checkによる構文検証・CRLF維持を両ファイルで確認
- 実機確認4パターン（Add Here Undo/aep-add Undo/選択同期/範囲外toast）を
  すべて確認。うち範囲外toastの検証は、当初aep-addで試みたが失敗せず、
  aep-addが常に中間点分割であるため原理的にrange check failureを
  再現できないことが判明し、Add Here側での再検証に切り替えて確認した
- 実機確認の過程で、個別移動ボタン→極小duration→aep-add分割という
  組み合わせでChart Mode側の表示重なりを新規発見。Phase89のスコープ外と
  判断し、原因調査は将来フェーズへ切り出した

---

## current-issues.md更新（該当issueがある場合）

> 通常運用（handover作成時に反映）とは異なり、今回はたかっちさんの指示により
> 5フェーズごとの棚卸し時にまとめて反映する。以下は次回棚卸し時の反映内容。

- 今回closeしたissue（次回棚卸し時にcurrent-issues.mdから削除）:
  - Issue #46 — Add Here / aep-addのUndoが2段階になる（Phase89で解消）

- 今回新規に積み残したissue（次回棚卸し時にcurrent-issues.mdへ追加）:
  ```
  #### Chart Mode: 極小duration chordの表示重なり
  状態: 観察中（原因未特定・再現条件は判明）
  内容: 個別移動ボタンでコードの幅を極端に狭めた（duration≈0だが0ではない）状態で
  aep-add（中間点分割）を実行すると、分割自体は成功するが、新規コードが隣接コードの
  描画に隠れて見えなくなることがある。addChordCommand側のrange check（Phase89）は
  正常に機能しており、原因はChart Mode側（chartmode.js）の極小duration時の
  slot幅計算にあると推測される。次回発生時にwindow.__CS_DEBUG__.chartで実測して
  原因を切り分ける方針。
  ```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
