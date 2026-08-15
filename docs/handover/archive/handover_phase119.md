# 引き継ぎ: Phase119完了 — Undo/Redo Mutation Feedback（変更箇所の一時ハイライト）

## 作業状態
- ブランチ: phase119-undo-redo-navigation-feedback
- 直前作業: Phase118完了（Undo/Redo後の変更箇所ナビゲーション・Mutation Region方式）

---

## 1. Purpose（目的）

Phase118の実機検証で発見された課題「Undo/Redo後にscrollToChord()が発火するが、
瞬間移動のため『どこから どこへ 移動したか』が分かりにくい」
（current-issues.md Future Features「Undo/Redo Navigation Feedback」・
Phase118で発見・設計方向は決定済みだった）に対応する。

対象chordIdへ一時的な視覚フィードバックを追加し、Undo/Redoの着地点を
ユーザーが認識しやすくする。

---

## 2. Scope（今回やったこと）

- `app.js`: Undo/Redo実行時にMutation Feedback（対象セルの一時的な
  パステル背景フェード）を表示する仕組みを新設
- `app.js`: Undo/Redo実行時にSelectionを明示的に解除する挙動へ変更
  （VSCode風。Undo/Redo直後の開始時点でMutation FeedbackとSelectionが
  同一セルで重ならないようにするため）
- `chartmode.js`: `chartState.mutationFeedbackChordId`（Projection）・
  `setMutationFeedback()` / `clearMutationFeedback()`（更新窓口）を新設
- `chart.css`: `.chart-slot--mutation-feedback`（背景フェードアニメーション）
  を新設
- `theme.css`: `--color-mutation-feedback-bg`（新規token・3テーマ共通）を新設

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **Mutation Feedbackの表示時間延長・恒久表示化**
  実機検証で「400msで消えるのが少し気になる」というフィードバックが
  あったが、代替案（次のUndo/Redoまで残す・別操作で消す等）はいずれも
  影響範囲が大きい、または「使いづらい」というほどの問題ではないと
  判断し、今回は400msのまま確定した（6. Findings参照）。
- **他の編集操作（クリック選択・通常のCommand実行等）でのMutation
  Feedback解除**
  タイマーによる自動解除と`resetAnalysisEditor()`経由の解除のみ対応する。
  それ以外の操作（コード選択・新規編集等）でMutation Feedbackを即座に
  消す処理は追加していない。そのため、Undo/Redo直後にSelectionを明示
  解除した後でも、タイマーが満了する前（短時間の間）に別の操作で改めて
  Selectionされた場合は、Mutation FeedbackとSelectionが同一セルへ
  一時的に重なりうる（[限界]。5. Design Decisions／7. Remaining Issues
  参照）。表示時間が短いため実用上の影響は小さいと判断し、今回は
  対応範囲に含めなかった。
- **`__CS_DEBUG__`へのMutation Feedback timer観測用getter追加**
  デバッグ性向上の提案はあったが、Phase119のスコープ外として見送った。
  将来必要になれば別Phaseで検討する。

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `_mutationFeedbackChordId` / `_mutationFeedbackTimerId` 新設 | Authority（app.js ephemeral）。History・永続化とは無関係 | app.js |
| `_setMutationFeedback()` 新設 | 対象chordIdへセット＋400ms後に自動解除するタイマー管理。連続Undo/Redoでは既存タイマーをclearしてから張り直す | app.js |
| `_clearMutationFeedbackImmediate()` 新設 | タイマーを待たず即座に解除。`resetAnalysisEditor()`専用。renderは呼ばない | app.js |
| `undoEdit()` / `redoEdit()` 修正 | Selectionを明示的に解除（`_refreshSelection([])` + `setSelectedChordIds([])`）→ Mutation Feedbackセット → 描画 → scroll、の順に変更 | app.js |
| `resetAnalysisEditor()` 修正 | Mutation Feedbackのtimer/Authority/Projectionをまとめてクリアする呼び出しを追加（[EDITOR RESET AUTHORITY]） | app.js |
| `chartState.mutationFeedbackChordId` 新設 | Runtime Projection。単一chordIdのみ保持（Set不要） | chartmode.js |
| `setMutationFeedback()` / `clearMutationFeedback()` 新設 | chartState更新のみ。render・タイマー管理は一切行わない | chartmode.js |
| slotループへのクラス付与 | `ownerId === chartState.mutationFeedbackChordId` の場合 `.chart-slot--mutation-feedback` を付与 | chartmode.js |
| `.chart-slot--mutation-feedback` 新設 | `background-color`を`--color-mutation-feedback-bg`→`transparent`へ400msでフェードするアニメーション。`prefers-reduced-motion`ガードあり | chart.css |
| `--color-mutation-feedback-bg` 新設 | 3テーマ（default/silver/blue）それぞれに個別調整した値を定義 | theme.css |

変更行数: app.js +109/-2、chartmode.js +42、chart.css +26、theme.css +27。
`analysisSession.js`（`computeMutationFocusChordId()`本体）は本フェーズを
通じて一切変更していない。`node --check`（app.js/chartmode.js）・CSS括弧
対応チェック・CRLF維持確認済み。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] 初版（輪郭box-shadowパルス）から背景フェード方式への変更

```
結論: Selectionと同一セルで共存させる設計（輪郭パルス・box-shadow）を
      廃し、Undo/Redo時にSelectionを明示的に解除した上で背景フェールで
      表現する方式（VSCode風）へ全面的に変更した。

理由: 初版は「SelectionとMutation Feedbackが同じセルに同時表示されうる」
      前提で設計し、疑似要素の衝突（EditPointが既に::before/::afterを
      使用している）を避けるためbox-shadowを採用していた。実機検証で
      「Selection背景が消えるように見える」という報告があり、調査の
      結果は再現しなかったものの、そもそも「Undo/Redo後もSelectionが
      残る」という前提自体をやめれば、Undo/Redo直後の開始時点では
      この種の視認性問題が起きなくなる（400msのフェード中に別の操作で
      新たにSelectionされた場合は依然として重なりうる。7. Remaining
      Issues／[限界]参照）。ユーザーからVSCodeのUndo/Redo演出（対象行の
      背景フェード・選択とは独立した一時的ハイライト）を参考にする
      提案があり、これに合わせて設計を全面変更した。
```

### [判断] Undo/Redo後にSelectionを明示的に解除する

```
結論: undoEdit()/redoEdit()内で_refreshSelection([])を呼び、Selectionを
      常に空にする。Phase118時点の_refreshSelection()（引数なし）は
      「既存の選択をbufferと再照合するだけ（有効なら維持）」という
      挙動だった。

理由: ユーザーからVSCodeのUndo/Redo時の表示を参考にする提案があり、
      対象位置への移動と一時的な視覚フィードバックを組み合わせる方向を
      採用した。Selectionを解除することで、Undo/Redo直後の開始時点に
      おけるMutation Feedbackとの視覚的な共存問題を回避できる（常時の
      排他を保証するものではない。6. Findings参照）。

影響: editorMode（deriveEditorMode(selection)）がUndo/Redo直後は
      常に'idle'になる。Footer側の追加対応は不要（selection.chordIdsを
      見て自動的に導出されるため）。
```

### [判断] タイマーの所有者はapp.js

```
結論: Mutation Feedbackの表示時間（400ms）はapp.js側のsetTimeoutで
      管理する。chartmode.js側（setMutationFeedback/clearMutationFeedback）
      はchartStateを更新するだけで、時間管理を一切行わない。

理由: 「いつまで表示するか」はUI lifecycle制御であり、chartmode.jsは
      Rendererとして「渡された値を表示するだけ」の責務に留めるべき
      （[DECORATOR ADDITION RULE]の既存原則をそのまま適用）。
```

### [判断] 疑似要素ではなくbackground-color直接アニメーションを採用

```
結論: ::before/::afterではなく、.chart-slot--mutation-feedback自体に
      background-colorのkeyframesアニメーションを適用する。

理由: EditPointが既に::before・::afterの両方を使用しており、
      Boundary Handleも::beforeを使用している。疑似要素は1要素につき
      各1つしか持てないため、将来同一セルに複数Decoratorが重なる
      ケースで静かに上書きされるリスクがあった（Selection解除により
      初版で懸念していたSelectionとの共存問題は解消したが、疑似要素の
      競合問題自体は独立した懸念のため、この判断は維持した）。
      background-colorはclassの直接プロパティとして重ね掛けできるため、
      この衝突を構造的に回避できる。
```

### [判断] 新規token `--color-mutation-feedback-bg` の追加

```
結論: 既存色（Selection=緑・Boundary/Collision/Section Preview=Amber・
      EditPoint=紫・Playback=青）の流用はせず、新規tokenを追加した。

理由: 既存5色相はすべて別の意味で使用中であり、流用すると
      [ONE INTENT, ONE PRIMARY DECORATOR]に反する。特にSelection（緑・
      アクアマリン系）は色相的に真のシアンと近く、青系トークンとの
      混同リスクが高い。3テーマ確認の結果、「blue」テーマ自体の背景が
      スカイブルー系（--surface-base: #c8dff0等）であることが判明し、
      青系トークンをそのまま使うと背景に埋没するリスクがあったため、
      blueテーマのみ彩度・明度を大きく上げた深い青緑（deep teal）に
      調整した（EditPoint/Selectionが辿った既存の per-テーマ調整
      パターンを踏襲）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

- **`_refreshSelection()`の引数なし呼び出しの実際の意味を発見した。**
  `refreshSelection()`（analysisSession.js）は
  `const ids = chordIds !== undefined ? chordIds : session.selection.chordIds;`
  という分岐を持ち、引数省略時は「既存の選択をbufferと再照合するだけ
  （有効なら維持）」という意味だった。Phase118のundoEdit()/redoEdit()は
  この引数なし呼び出しを使っており、「Undo後も選択は残る」という
  仕様だったことが実コード確認で判明した。この発見により、「Selection
  解除のための新しい関数を作る」のではなく「既存呼び出しの引数を
  `[]`に変えるだけ」という最小差分の実装方針が確定した。
- **`undoEdit()`/`redoEdit()`には元々`setSelectedChordIds()`の呼び出しが
  存在しなかった。** `_refreshSelection()`（Session Layer側の正本更新）
  と`setSelectedChordIds()`（chartState側・描画用Projectionの同期）は
  別々の呼び出しが必要な設計だが、Phase118時点のundoEdit()/redoEdit()は
  前者のみを呼んでおり、後者を呼んでいなかった。実害は乏しかったと
  見られる（多くのUndo/Redoで選択が有効なまま保たれるケースが多いため
  同期漏れが表面化しにくい）が、潜在的な設計上のギャップだった。
  今回`clearCurrentSelection()`と同じペアの呼び出しとして追加した。
- **Selection背景が消えるように見えたという実機報告は、再現手順を
  変えて再試行しても再現しなかった。** 原因は特定できなかったが、
  今回の設計変更（Undo/Redo時にSelectionを明示的に解除する）により、
  少なくともUndo/Redo直後の開始時点では「SelectionとMutation
  Feedbackが同一セルに同時存在する」状況は起きなくなった。ただし
  これは恒久的な排他を保証するものではない点に注意（[限界]。7.
  Remaining Issues参照）。
- **「blue」テーマの背景色自体が青系である**ことが、新規token追加の
  過程で判明した。EditPointが辿った過去の教訓（「暗く彩度の低い色は
  周囲の色相の影響を受けやすい」）と同種の懸念であり、テーマごとの
  個別調整が必要になった。

---

## 7. Remaining Issues（残課題）

**[限界・既知の挙動] Mutation FeedbackとSelectionの重なりは、Undo/Redo
直後の開始時点でのみ回避される。**
Undo/Redo実行時にSelectionを明示解除するのは「その瞬間」のみであり、
その後タイマー満了までの短時間の間に別のコードをクリックする等で
新たにSelectionが発生した場合、Mutation FeedbackとSelectionは同一セルで
一時的に重なりうる。これはバグではなく、他操作によるMutation Feedback
の即時解除を今回実装しなかったこと（3. Out of Scope参照）に伴う既知の
挙動であり、対応不要と判断している（表示時間が短いため実用上の影響は
小さい）。

Phase119のスコープ内で、上記以外の残課題はなし。

以下は実機検証中に挙がった意見であり、今回は「現状維持」と判断した
うえでFuture Issueとして記録しておく。

```
意見: Mutation Feedbackが短時間で消えるのが少し気になる
状態: 見送り（3. Out of Scope参照）
内容: ユーザー視点では「使いづらい」というほどの問題ではなく、
Undo/Redoの着地点が分かりやすくなったこと自体は明確な改善という
評価だった。代替案（次のUndo/Redoまで残す・クリック等の別操作で
消す）はそれぞれ影響範囲や設計上のトレードオフがあり、今回は
「改善のための改善」を避け、現状（タイマーによる短時間フェード）で
凍結する判断とした。再要望があれば改めて検討する。
```

---

## 8. Next Phase（次フェーズ開始位置）

現時点で明確な次点候補は積み残しておらず、Phase120は新規の要望・
発見事項ベースで選定する。

---

## 9. Files Changed（変更ファイル一覧）

```
js/app.js
  ・_mutationFeedbackChordId / _mutationFeedbackTimerId を新設
    理由: Mutation Feedbackの正本（Authority）とタイマーハンドルを
    保持するため
  ・_setMutationFeedback() / _clearMutationFeedbackImmediate() を新設
    理由: タイマー管理（セット・連続実行時の張り替え・即時解除）を
    1箇所に集約するため
  ・undoEdit() / redoEdit() を修正
    理由: Selection明示解除・Mutation Feedback表示・scrollToChord()の
    呼び出し順序を確立するため。computeMutationFocusChordId()自体は
    無変更
  ・resetAnalysisEditor() へ_clearMutationFeedbackImmediate()呼び出しを追加
    理由: [EDITOR RESET AUTHORITY]に従い、編集セッション終了時に
    timer/Authority/Projectionを確実にクリアするため

js/chartmode.js
  ・chartState.mutationFeedbackChordId を新設
    理由: Mutation FeedbackのRuntime Projectionを保持するため
  ・setMutationFeedback() / clearMutationFeedback() を新設
    理由: chartState更新の唯一の窓口とするため（[DECORATOR ADDITION RULE]）
  ・_renderChartGrid()のslotループへクラス付与ロジックを追加
    理由: 対象chordIdのセルへ.chart-slot--mutation-feedbackを付与するため

css/chart.css
  ・.chart-slot--mutation-feedback / @keyframes chart-mutation-feedback-fade を新設
    理由: 背景フェードアニメーションを表現するため。prefers-reduced-motion
    ガードも同時に追加

css/theme.css
  ・--color-mutation-feedback-bg を3テーマへ新設
    理由: 既存5色相（Selection/Boundary/Collision/Section Preview/
    EditPoint/Playback）と区別される専用色が必要だったため
```

---

## 10. Micro Log

- 初期設計: 輪郭box-shadowパルス方式で実装（Selectionとの共存を前提）。
  `--border-focus`（3テーマ既存）を流用し新規token不要な設計として着手
- 実機検証で「Selection背景が消える」という報告を受け、原因調査を実施。
  再現手順を変えて再試行したが再現せず（6. Findings参照）
- ユーザーからVSCodeのUndo/Redo演出を参考にする提案を受け、設計を
  全面的に見直し。「Selectionを明示的に解除する」という前提へ転換
- 実コード確認（[grep/view before assert]）の結果、_refreshSelection()の
  引数なし呼び出しの実際の意味・setSelectedChordIds()呼び出しの欠落を
  発見（6. Findings参照）。これにより最小差分の実装方針が確定
- 背景フェード方式（.chart-slot--mutation-feedback）へ実装を差し替え。
  疑似要素の衝突リスクを避けるためbackground-color直接アニメーションを採用
- 新規token追加にあたり3テーマのtheme.cssを確認。「blue」テーマの背景色が
  青系であることを発見し、テーマごとの個別調整が必要と判断
- 一度「Phase118へ完全復元する」方向で作業を進めたが（git reset --hard）、
  ユーザーから「Mutation Feedbackの価値は残っている。400msで消える点が
  少し気になっただけ」というフィードバックを受け、Phase119版
  （Mutation Feedback実装込み）を正式採用する方針へ再度確定
- 実装確定後、git diff / git diff --check / node --check / CSS括弧対応 /
  CRLF維持 / Selection明示解除の適用範囲、を最終確認。いずれも問題なし

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue:
  - Undo/Redo Navigation Feedback（変更箇所の一時ハイライト。Phase118で
    発見・Phase119で解消。当初の設計案（輪郭パルス）から、Selection
    明示解除＋背景フェード方式（VSCode風）へ変更して確定）
- 今回新規に積み残したissue: なし
  （「400msで消える点が気になる」という意見は3. Out of Scope /
  7. Remaining Issuesに記録のうえ見送りと判断済み。再要望があれば
  改めてIssue化する）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- Undo/Redo Navigation Feedback（変更箇所の一時ハイライト。Phase118で
  発見・Phase119で解消。Undo/Redo実行時にSelectionを明示的に解除し
  （VSCode風の挙動）、対象コードのセルを400ms程度パステル背景で
  フェード表示する方式で実装した。`computeMutationFocusChordId()`
  （Phase118・analysisSession.js）は無変更のままSingle Source of Truth
  として再利用。新規token`--color-mutation-feedback-bg`（theme.css・
  3テーマ）を追加）

#### ADD
- No changes.

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Undo/Redo Mutation Feedback（Phase119・Undo/Redo実行時にSelectionを
    明示解除したうえで、対象コードのセルを400ms程度パステル背景で
    フェード表示。`computeMutationFocusChordId()`（Phase118）は無変更で
    再利用。新規token`--color-mutation-feedback-bg`を3テーマへ追加）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 119 | Undo/Redo Mutation Feedback（Undo/Redo実行時にSelectionを
    明示的に解除し、対象コードのセルを400ms程度パステル背景でフェード
    表示する方式（VSCode風）で実装。初版（輪郭box-shadowパルス・
    Selectionと共存させる設計）から実機検証を経て設計変更。
    `computeMutationFocusChordId()`・History・Mutation semantics自体は
    無変更） | app.js / chartmode.js / chart.css / theme.css |

- Future Candidates: 変更なし（次候補は新規の要望・発見事項ベースで選定）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
