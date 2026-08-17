# 引き継ぎ: Phase121完了 — Debug Session Recorder（Mutation Recording基盤）

## 作業状態
- 直前作業: Phase120完了（repairRule変更時のChart表示巻き戻り修正）

---

## 1. Purpose（目的）

実機テスト時の「何が起きたか分からない」問題に対応するため、Analysis Editorの
mutation操作を時系列で記録し、人間可読なDebug Reportとして出力できる基盤を
新設する。

[重要] 本フェーズは「Debug Session Recorder」という最終目的（ユーザーの
操作状況を再現できる診断ログ）の完成ではない。実装後の実機テストで、
Command Layer起点のMutation記録だけでは「何が変わったか」は分かっても
「どう操作してそこに至ったか」が再現できないことが実証された。これは
Phase121の失敗ではなく、Mutation Recording基盤の実装完了を経て初めて
判明した、Debug Session Recorder全体の設計上の知見である。最終目的の
達成はPhase122（Semantic Interaction Recording）で継続する。

---

## 2. Scope（今回やったこと）

- `js/debugSessionRecorder.js` 新設。既存Debug Layer（`__CS_DEBUG__`）とは
  独立したAuthorityとして、Semantic Event履歴をメモリ上にのみ保持
- `app.js`: 18種類のCommand Layer起点イベント（addChord/deleteSelection/
  undo/redo/Section系4コマンド等）への記録差し込み
- `index.html`: 「デバッグ」menu-group新設（既存表示メニューと同じパターン）
- Recording state: 手動Start/Stop、デフォルトOFF、メモリのみ保持
- 出力: 人間可読テキストのみ（Copy Debug Report → クリップボード）

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **Semantic Interaction Event（クリック・ドラッグ等のユーザー操作記録）**
  最終目的の中核だが、chartmode.js側への手入れが必須になり規模が
  MVPを超えるため、Phase122へ分離した。
- **Section境界移動（updateSectionBoundary）のstartChordId/endChordId記録**
  実機テストでReportの情報不足が指摘されたが、Interaction Event側で
  「どちらの境界を・どの操作方法で・どこからどこへ」動かしたかという
  意味的な操作情報として設計し直す方が自然なため、今回はsnapshot項目を
  拡張しない（4. Findings参照。Phase122で必ず解決する）。
- **JSON Export**（当初設計時点で見送り済み）

---

## 4. Findings（判明した知見）

- 実機テストで、Section境界移動を2回行った際のReportが
  `updateSectionBoundary / result: ok` のみで差分情報が一切出ない
  ことが判明した。現在のsnapshotは`sections.length`（Section数）
  のみを見ており、境界移動では数が変わらないため差分なしに見える。
  この不足は、Mutation Recordingの実装ミスではなく、「Mutationの
  結果」と「ユーザーが何を操作したか」という異なる2種類の情報を
  同じ記録層で扱おうとしたことに起因する、設計レベルの制約である。
  Phase122でSemantic Interaction Event（例: ドラッグ開始/終了、
  ステッパークリック）として記録することで解決する。
- `splitChord()`（app.js）はapp.js・chartmode.jsのどちらからも
  呼び出し箇所が存在しないことを実コード確認で確定した（デッドコード）。
  Recorderへの記録自体は追加済みだが、実際に発火する経路がない。
  Phase121のスコープ外の既存の技術的負債として記録するのみとする。

---

## 5. 確立した設計原則

### [DEBUG SESSION RECORDER AUTHORITY]

Debug Session Recorderは、デバッグセッション中のSemantic Event履歴を
一時的に所有する。既存のDebug Layer（`__CS_DEBUG__`・[DEBUG LAYER
INVARIANT]）とは別Authorityである。Debug Layerが「stateを一切所有せず
観測するだけ」であるのに対し、Recorderは「イベント履歴」という新しい
データを所有する。

### [RECORDER PRIVACY BOUNDARY]（Phase121で確立）

Recorderが記録してよい範囲は「意味のあるユーザー操作の単位」に限定し、
自由入力・機微情報は記録しない。

```
記録してよい: 「Section 3を選択」「境界を右へ移動」「Ctrl+Z」等の
              セマンティックな操作単位
記録しない:   キー入力そのもの、検索文字列、ユーザーが入力した自由文、
              クリック座標そのもの
```

これはプライバシー・ブランドイメージへの配慮に基づく。本アプリは
将来の公開を視野に入れており、「開発者の監視機能」ではなく「ユーザー
自身が問題を再現・報告しやすくする診断機能」という位置づけを
Recorder全体の設計思想として維持する。「キーロガー」という語・概念は
設計文書・実装のどちらからも排除する。

Recordingは常時ONではなく、ユーザーによる明示的なStart/Stopのみで
動作し、メモリ上にのみ保持する（persistence layerに一切保存しない）。
この「ユーザー主導・セッション限定」という構造自体が、監視ではなく
診断であることを裏付ける設計上の根拠となる。

### [MUTATION RECORDING SCOPE]（Phase121で確立）

Phase121時点のRecorderはCommand Layer起点の「データが変わった瞬間」
のみを記録する。クリック・選択・画面遷移等、データを変えない操作は
記録しない。理由: Command LayerはResult Protocol（`{ ok, reason? }`）
という既存の統一形状を持ち、記録位置（Command呼び出し直後・副作用の
直前）が実装上明確だったため。

### [RECORDER CALL SITE RULES]（Phase121で確立・実コード調査により確定）

Command Layer関数そのものではなく、app.js側の「ユーザー操作単位」の
ラッパー関数から記録する。以下3つの例外パターンが実コード調査で判明:

1. **内部委譲**: `cutSelectionCommand`が内部で`copySelectionCommand`+
   `deleteSelectionCommand`に委譲する。Recorderは委譲先ではなく、
   呼び出し元で1イベントとして記録する。
2. **共有Command**: `updateChordCommand`は`replaceCurrentMatch`（検索置換）と
   `openChordRenameSelector`（手動リネーム）の両方から呼ばれる。
   `updateChord()`内部ではなく、呼び出し元ごとに異なるevent名
   （`replace`/`renameChord`）で記録する。
3. **連続呼び出し**: `moveBoundary()`はドラッグ中に連続呼び出しされる。
   `_handleBoundaryDragStart`でbeforeを保持し、`_handleBoundaryDragEnd`で
   1回だけ記録することで、ドラッグ全体を1イベントにまとめる。

この3パターンはPhase122のSemantic Interaction Event設計でも
再利用できる判断基準になる見込み。

---

## 6. Remaining Issues（残課題）

- Section境界移動のReportに意味的な操作情報（どちらの境界を・どの
  操作方法で・どこからどこへ）が不足している（4. Findings参照）。
  **Phase122で必ず解決する**（見送りではなく次フェーズへの明示的な
  引き継ぎ）。
- `splitChord()`が未使用のデッドコードである可能性が高い
  （Phase121のスコープ外。将来の棚卸し候補）。

---

## 7. Next Phase（次フェーズ開始位置）

**Phase122: Debug Session Recorder — Reproducible Diagnostic Session**

Phase121のMutation Recording基盤の上に、Semantic Interaction Event
（クリック・ドラッグ等の意味のある操作単位）を記録する層を追加し、
最終目的である「問題が発生した状況を後から理解・再現できる診断
セッション」へ拡張する。

方針（Phase121の実機テスト・設計議論から確定済み）:
- 単なる「クリックログ」ではなく、Mutation Eventと組み合わせて
  「操作 → 結果」が一続きに読める記録を目指す
- 記録範囲は[RECORDER PRIVACY BOUNDARY]に従う（自由入力・座標等は対象外）
- Section境界移動を具体例として、意味的な操作結果
  （例: `boundary: end, from: chord_12, to: chord_13, operation: step-right`）
  が最終的に取得できることを目標とする
- chartmode.js側の調査（pointerdown/click等のイベント捕捉箇所の
  棚卸し）から着手する

---

## 実機確認

```
□ 「デバッグ」メニューがヘッダーに表示される → OK
□ Recording開始 → Section境界編集 → Recording停止 →
  Debug Reportをコピー → クリップボードに正しいテキストが入る → OK
□ ドラッグによる境界移動が1イベントとして記録される → OK
□ splitChord()の発火経路 → 存在しないことを実コードで確認（未使用）
```

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - splitChord()が未使用のデッドコードである可能性（6. Remaining Issues参照）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: splitChord()が未使用のデッドコードである可能性
  状態: 未確認・優先度低
  内容: app.js・chartmode.jsのどちらからも呼び出し箇所が見つからない。
  Phase121のDebug Recorder実装時に発見。削除するか、将来のカーソル位置
  分割機能で使う予定があるか確認が必要（コード内コメントには「将来
  カーソル位置分割を追加する場合もsplitChord()自体は変更不要」との
  記載があり、意図的に残されている可能性もある）。

#### MODIFY
- No changes.

#### CLOSE
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Debug Session Recorder — Mutation Recording基盤（Phase121・
    Command Layer起点の18種類のイベントを記録するMVPを実装。
    最終目的（操作の再現可能な診断セッション）はPhase122で継続。
    実機テストにより、Mutation記録のみでは操作再現に情報不足があると
    判明し、Phase122をSemantic Interaction Recordingとして計画）

- Future Candidates: 次候補を更新
  ```
  Phase122候補: Debug Session Recorder — Reproducible Diagnostic Session
  （Semantic Interaction Event記録の追加。chartmode.js側の調査から着手）
  ```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
