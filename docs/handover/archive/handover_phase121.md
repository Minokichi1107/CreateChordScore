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
- `app.js`: 21種類のCommand Layer起点イベント（addChord/deleteSelection/
  undo/redo/Section系4コマンド/shiftAll/shiftSelectionRange等）への
  記録差し込み
- `index.html`: 「デバッグ」menu-group新設（既存表示メニューと同じパターン）
- Recording state: 手動Start/Stop、デフォルトOFF、メモリのみ保持
- 出力: 人間可読テキストのみ（Copy Debug Report → クリップボード）
- **[実機テストを受けての追加実装]** `Alt+R`（Global shortcut）による
  Recording Start/Stopのトグル。Debugメニューのボタンとロジックを共通化
  （`_toggleRecording()`に集約）
- **[実機テストを受けての追加実装]** `#debug-rec-indicator`（Recording中
  のみ表示する「● REC」インジケータ）を新設。Chart/Perform/TAP等の
  全画面overlayより手前に固定表示されるよう`z-index`を調整（4. Findings
  参照）

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
- **Copy Debug Reportのショートカット化**（Alt+R等）
  Start/Stopのみショートカット化し、Copyは従来通りDebugメニューからの
  操作に限定する。Recording停止後、落ち着いて操作する想定のため
  ショートカット化の優先度は低いと判断した。
- **常時表示のRECインジケータ**
  Recording OFF時は完全に非表示とし、ON時のみ表示する。「主張が強い
  表示は避けたい」という要望を踏まえ、UIへの圧迫を最小限にした。

---

## 4. Findings（判明した知見）

### Mutation Recordingの記録漏れ（実機テスト後のコードレビューで発見）

- 実機テストで、Section境界移動を2回行った際のReportが
  `updateSectionBoundary / result: ok` のみで差分情報が一切出ない
  ことが判明した。現在のsnapshotは`sections.length`（Section数）
  のみを見ており、境界移動では数が変わらないため差分なしに見える。
  この不足は、Mutation Recordingの実装ミスではなく、「Mutationの
  結果」と「ユーザーが何を操作したか」という異なる2種類の情報を
  同じ記録層で扱おうとしたことに起因する、設計レベルの制約である。
  Phase122でSemantic Interaction Event（例: ドラッグ開始/終了、
  ステッパークリック）として記録することで解決する。
- コードレビュー（ChatGPT指摘）を受けて`_pushHistory()`を呼ぶ全箇所を
  機械的に洗い出したところ、`shiftAll()`（全体シフト・Ctrl+Shift+Arrow）
  と`shiftSelectionRange()`（範囲シフト）の2件でRecorder記録が漏れて
  いたことが判明し、実装漏れとして修正した。実装当初、Command Layerを
  経由しない独自mutation（`_pushHistory()`を自前で呼ぶ関数）の網羅性
  確認が不十分だったことが原因。
- `after`側snapshotの計算が、Recording OFF時も無条件に評価されていた
  （`before`側は`_recIsRecording()`で条件分岐していたが`after`側は
  していなかった）。「Recording OFF時のコストをゼロにする」という
  設計思想とコードの実態が矛盾していたため、21箇所すべてを機械的に
  統一した。
- `splitChord()`（app.js）はapp.js・chartmode.jsのどちらからも
  呼び出し箇所が存在しないことを実コード確認で確定した（デッドコード）。
  Recorderへの記録自体は追加済みだが、実際に発火する経路がない。
  Phase121のスコープ外の既存の技術的負債として記録するのみとする。

### UI到達性の問題（実機テストで発見・設計変更に至った）

- **[重大発見]** 当初「デバッグメニューからRecording Start/Stop・
  Copy Debug Reportを操作する」設計だったが、実機テストで
  **Chart Mode表示中はデバッグメニュー自体が操作不能**であることが
  判明した。`#chart-overlay`が`fixed, z-index:300`の全画面要素であり、
  ヘッダー（`<header id="header">`。デバッグメニューを含む）を完全に
  覆ってしまうため。演奏モード（`#perform-overlay`）・TAPモード
  （`#tap-overlay`）も同様に独自の全画面オーバーレイ構造を持つ。
  Recorderで記録したい操作の大半はChart Mode表示中に発生するため、
  「最も使いたい場面でRecorderを操作できない」という実用上の欠陥
  だった。
- 対応として、Recording Start/Stopを`Alt+R`のGlobal shortcut化した。
  `document.addEventListener('keydown', ...)`はDOM全体に登録されて
  おり、overlayによるCSS上の重なりに関わらず発火することを実コードで
  確認済み（既存の`Alt+N`と同じ仕組み）。
- インジケータ（`#debug-rec-indicator`）を新設し、Recording中かどうかを
  視覚的に示す必要が生じた（ショートカットだけでは「押しても効いて
  いるか分からない」問題があるため）。当初`z-index:400`で実装したが、
  実機テストで**演奏モード表示中はインジケータが見えない**ことが発覚。
  `perform.css`確認の結果、`#perform-overlay`が`z-index:9999`という
  突出した値を持っていたことが原因と判明し、インジケータ側を
  `z-index:10000`へ引き上げて解決した。`perform.css`側の値は変更して
  いない（既存overlayの重なり順設計への影響を避けるため）。
- 実装過程で、機械的なコード置換の際に閉じ括弧`}`の対応関係を誤り、
  一時的に構文エラーを作ってしまったことがあった。`node --check`で
  即座に検出・修正済み（既存コードへの実害はなし）。

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

### [RECORDER GLOBAL ACCESSIBILITY]（Phase121・実機テストを受けて確立）

Debug Recorderの操作手段（Start/Stop）は、Chart/Perform/TAP等の
全画面overlay表示中でも到達可能でなければならない。理由は、
Recorderが記録したい操作の大半がこれらのoverlay表示中に発生するため
（Analysis Editorの編集操作はChart Mode内、等）。

対応方針として、UIボタンを各overlay内に複製するのではなく、
Global keyboard shortcut（`Alt+R`）を採用した。`document`に登録された
`keydown`ハンドラはCSSの重なり順（z-index）に影響されず発火するため、
overlay側（chartmode.js/perform.js/tapmode.js等）に一切手を入れずに
済む。これはRecorderのAuthorityをapp.js/debugSessionRecorder.jsのみに
限定するという既存方針とも一致する。

視覚的フィードバック（`#debug-rec-indicator`）を追加する場合も、
各overlayの外側（DOM上は独立した要素）に配置し、`z-index`のみで
最前面表示を保証する。ただし、overlay側が突出した`z-index`を持つ
場合（例: `#perform-overlay`の`z-index:9999`）、確実に上回る値を
明示的に設定する必要がある。将来Recorder関連の視覚要素を追加する際は、
既存overlayの`z-index`を事前に確認すること。

---

## 6. Remaining Issues（残課題）

- Section境界移動のReportに意味的な操作情報（どちらの境界を・どの
  操作方法で・どこからどこへ）が不足している（4. Findings参照）。
  **Phase122で必ず解決する**（見送りではなく次フェーズへの明示的な
  引き継ぎ）。
- `splitChord()`が未使用のデッドコードである可能性が高い
  （Phase121のスコープ外。将来の棚卸し候補）。
- **[新規]** TAPモード（`#tap-overlay`）のz-indexは未確認のまま。
  演奏モードで実際に起きた「z-index:9999によりインジケータが隠れる」
  問題と同種の事象が、TAPモードでも発生する可能性がある。次回TAPモード
  表示中に`Alt+R`の動作を確認すること。
- **[新規・スコープ外]** ブルーテーマの演奏モード「✕ 閉じる」ボタンが
  視認できないバグを発見した（実機テスト中の報告）。`perform.css`の
  `#btn-perform-close`が`--surface-btn-close`という専用トークンを
  使用しており、`theme.css`側のブルーテーマ定義で背景色と文字色
  （`--text-secondary`）が近い色になっている可能性が高い（`theme.css`
  未確認のため推測）。Phase121（Debug Recorder）とは無関係の既存バグ
  のため、別フェーズで`theme.css`を確認の上対応する。
- **[新規・要実機確認]** macOSで`Option+R`が特殊文字（®）を生成する
  キーボード配列が存在し、その場合`e.key`が`'r'`ではなく`'®'`として
  渡ってくる可能性がある（`Alt+N`が抱える既知の制約と同種）。開発環境
  がWindows中心のため今回は確定させず、Mac実機での確認が取れ次第
  `keybindings.md`へ反映する。

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
□ Alt+R（通常画面）→ 右上に「● REC」が表示される → OK
□ Alt+R（Chart Mode表示中）→ 同様に表示される → OK
□ Alt+R（演奏モード表示中）→ 当初NG（z-index:9999問題）→
  z-index:10000へ修正後 → OK
□ もう一度Alt+R → インジケータが消える → OK
□ デバッグメニューの「Recording開始」ボタンとAlt+Rで状態が同期する → OK
□ テキスト入力中にAlt+Rを押しても誤発火しない → OK
△ TAPモード表示中のAlt+R動作 → 未確認（6. Remaining Issues参照）
```

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - splitChord()が未使用のデッドコードである可能性
  - TAPモードのz-index未確認
  - ブルーテーマの演奏モード閉じるボタン視認性バグ
  - macOSでOption+Rが特殊文字を生成する可能性（Alt+Nと同種の制約）

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

- 見出し: TAPモード（#tap-overlay）のz-index未確認
  状態: 未確認・優先度低
  内容: Phase121でDebug Recorderのインジケータ（#debug-rec-indicator）
  を実装する過程で、演奏モード（z-index:9999）表示中にインジケータが
  隠れる問題を発見・修正した。同種の問題がTAPモードでも起きないか、
  次回TAPモード表示中にAlt+Rの動作を確認すること。

- 見出し: ブルーテーマの演奏モード「✕ 閉じる」ボタンが視認できない
  状態: 未確認・原因推測のみ（perform.css確認済み・theme.css未確認）
  内容: Phase121の実機テスト中に発見（Recorderとは無関係の既存バグ）。
  `#btn-perform-close`が`--surface-btn-close`という専用トークンを
  使用しており、ブルーテーマでは背景色と`--text-secondary`（文字色）
  が近い色になっている可能性が高い。theme.cssを確認の上、別フェーズで
  対応する。

- 見出し: macOSで Alt+R（Option+R）が特殊文字を生成する可能性
  状態: 未確認・要Mac実機確認
  内容: Phase121でRecording Start/Stopのショートカットとして`Alt+R`を
  採用したが、macOSのキーボード配列によっては`Option+R`が`®`という
  特殊文字を生成し、`e.key`が`'r'`ではなく`'®'`として渡ってくる
  可能性がある（既存の`Alt+N`が抱える制約と同種。keybindings.md参照）。
  開発環境がWindows中心のため今回は確定させず、Mac実機での確認が取れ
  次第keybindings.mdへ反映する。

#### MODIFY
- No changes.

#### CLOSE
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Debug Session Recorder — Mutation Recording基盤（Phase121・
    Command Layer起点の21種類のイベントを記録するMVPを実装。
    Alt+RによるGlobal shortcut・Recording中インジケータを追加し、
    Chart/Perform/TAP等の全画面overlay表示中でも操作可能にした。
    最終目的（操作の再現可能な診断セッション）はPhase122で継続。
    実機テストにより、Mutation記録のみでは操作再現に情報不足があると
    判明し、Phase122をSemantic Interaction Recordingとして計画）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 121 | Debug Session Recorder — Mutation Recording基盤（
    debugSessionRecorder.js新設。Command Layer起点21種類のイベントを
    記録。実機テストでChart/Perform等の全画面overlayがヘッダーメニューを
    覆い操作不能になる問題を発見し、Alt+R Global shortcut化＋
    Recording中インジケータ（z-index調整含む）で対応。最終目的は
    Phase122（Semantic Interaction Recording）へ継続）
    | app.js / debugSessionRecorder.js / index.html / state.css |

- Future Candidates: 次候補を更新
  ```
  Phase122候補: Debug Session Recorder — Reproducible Diagnostic Session
  （Semantic Interaction Event記録の追加。chartmode.js側の調査から着手）
  ```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
