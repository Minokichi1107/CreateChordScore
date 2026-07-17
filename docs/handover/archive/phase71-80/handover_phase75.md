# 引き継ぎ: Phase75完了 — 単一コード編集（追加・変更・削除）

## 作業状態
- 直前作業: Phase74-E完了（個別コード境界移動機能 + 矢印キー競合修正）
- ブランチ: phase75-a-analysis-edit（想定・実際のブランチ名に合わせて読み替え）

---

## 1. Purpose（目的）

Analysis Editor（解析編集エディタ）に、単一コード（`selection.chordIds`が単数の間）に閉じる編集操作
「追加・変更・削除」を実装する。Phase74（C〜E）で確立した編集基盤・境界移動の上に、
コードそのものを増減・改名できるようにする。

区切りの基準（Phase74-E時点で確定済み）：
`selection.chordIds` が単数のうちに完結する編集はPhase75、複数選択が絡む編集（範囲選択・
Copy/Cut/Paste・分割・結合）はPhase76以降とする。

---

## 2. Scope（今回やったこと）

```
・chordEntry.js から showChordSelector() を新設（単一コード選択用の軽量モーダル）
・splitChord(chordId, splitTime) を新設（コード追加の実体）
・openChordRenameSelector(chord) を新設（コード名変更の実体）
・編集パネルへ [追加][変更][削除] ボタンを接続
・deleteChord() を書き換え（隣接コードへの時間吸収 + 自動選択を追加）
・Phase74-Dの未使用デッドコード（#aep-chord等・DOM要素が存在せず一度も実行されなかった
  コード）を削除
・実機テスト中に発見した選択状態の同期漏れバグを修正（詳細はFindings参照）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・追加位置のカーソル指定（再生位置での分割）
  → 「4. Implementation」「7. Remaining Issues」参照。意図的な保留であり実装漏れではない。

・コード名クリックによる変更起動
  → 「変更」ボタンのみ実装。同じ openChordRenameSelector(chord) を呼ぶだけで
    後から追加できる設計にしてある（chordEntry.js側の変更は不要）。

・削除確認ダイアログ
  → 確認なし・即削除・Undo/Redoを正式な復旧手段とする方針を確定済み。
    DAW/MIDIエディタ系ツールの操作感（Delete→即反映→Undo可能）を踏襲。

・openAddChord()自体のリファクタリング
  → 現物確認の結果、openAddChord()は「コードを1つ選ぶダイアログ」ではなく
    「複数コードを連続追加し続けられる常駐モーダル（insertAtカーソル・
    プレビュー一覧・小節線追加を持つ、行編集そのものを担うサブシステム）」
    であることが判明。無理に共通化せず、パレットHTML生成（buildPaletteHtml）
    という本当に共通な部分のみを抽出するに留めた（詳細はFindings参照）。

・複数選択・範囲選択・Copy/Cut/Paste・分割・結合
  → Phase76以降のスコープ。

・current-issues.md / phase-status.md への正式反映
  → 5フェーズごと or 大きな節目の棚卸しでまとめて行う運用のため、Phase76完了時に実施。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `buildPaletteHtml()` 新設 | パレットボタンHTML生成のpure function。openAddChord()とshowChordSelector()の共通部分 | chordEntry.js |
| `openAddChord()` | パレットHTML生成部分のみ`buildPaletteHtml()`呼び出しに置換。挙動は完全に同一（回帰確認済み） | chordEntry.js |
| `showChordSelector()` 新設 | 単一コードを選ぶ軽量モーダル。テキスト入力+パレット+Enter確定+Escapeキャンセル。`isChordLikeInput()`/`isNoChordInput()`をopenAddChord()と共有し、正規化方針（保存時は正規化しない・Phase20のon-the-fly normalize方式）を踏襲 | chordEntry.js |
| `splitChord(chordId, splitTime)` 新設 | コード追加の実体。7つの不変条件をコメント化（範囲チェック・左右連続性・Undo単位1回・`_refreshSelection()`呼び出し等） | app.js |
| `openChordRenameSelector(chord)` 新設 | コード名変更の実体。「変更」ボタンと将来のコード名クリックの共通入口として集約 | app.js |
| `deleteChord(id)` 書き換え | 6つの不変条件を追加（最低1件は残す・左隣吸収・先頭のみ右隣・隙間なし・Undo単位1回・自動選択） | app.js |
| 編集パネルUI | 「編集」行を新設し `[＋追加][✎変更][🗑削除]` を追加。`aep-chord-note`（別フェーズ対応予定の注記）を削除 | app.js |
| Phase74-Dデッドコード削除 | `#aep-chord`/`#aep-start`/`#aep-end`/`#aep-delete`への未接続リスナー（対応DOM要素が存在せず一度も実行されていなかった）を削除し、実際に動くコードに置き換え | app.js |

### 追加ボタンの分割点（初期実装）

```javascript
const splitTime = (chord.start + chord.end) / 2;  // 均等2分割のみ
```

将来のカーソル位置分割は、`splitChord()`自体の変更は不要で、この1行を
`再生カーソルの現在時刻`に差し替えるだけで対応できる設計にしてある
（「7. Remaining Issues」参照）。

### 削除の吸収ルール

```
通常:               [ Am | C(削除) | G ]  →  [ Am........... | G ]
先頭コード削除時:    [ C(削除・先頭) | G ]  →  [ G(先頭まで伸びる) ]
```

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] `openAddChord()` は変更せず、共通化はパレットHTML生成のみに限定

```
結論:
  当初「openAddChord()を内部でshowChordSelector()を呼ぶだけに変更する」
  という設計を検討していたが、現物のコードを確認した結果、それは適切でない
  と判断を改めた。

理由:
  openAddChord()は「コードを1つ選ぶダイアログ」ではなく、insertAtカーソル・
  プレビュー一覧・小節線追加・行またぎナビゲーションを持つ「行編集そのもの
  を担うサブシステム」だった。無理に共通化すると、これらの既存機能が破綻し、
  「リファクタリングのみ・挙動を変えない」という前提が崩れる。

採用した方針:
  本当に共通な部分（パレットボタンのHTML生成）だけを buildPaletteHtml()
  というpure functionとして抽出した。UIロジック（何が起きるか）は
  openAddChord() / showChordSelector() それぞれが個別に持つ。
```

### [判断] コード追加時、分割の確定は選択完了後（キャンセル時に無変化を保証）

```
結論:
  ＋ボタン → showChordSelector() → ユーザーがコード名を確定 → splitChord()
  → updateChord() という順序にした。
  「showChordSelector() → 即splitChord() → 名前選択」という逆順は採用しなかった。

理由:
  逆順だとEscキーでキャンセルした場合に「split済みだが名前は元のまま」
  という中途半端な状態が残ってしまう。commit（確定）時にのみsplit()を
  呼ぶことで、「キャンセル時は状態が一切変化しない」という不変条件を守れる。
  これはPhase74で積み上げてきた「編集操作はユーザーの確定操作でのみ
  状態を変更する」という考え方に沿っている。
```

### [判断] `showChordSelector()` は正規化を行わない（openAddChord()と同一基準）

```
結論:
  showChordSelector()は isChordLikeInput() / isNoChordInput() による
  バリデーションのみを行い、normalizeChordName()等の追加正規化はしない。

理由:
  このプロジェクトの既存設計（Phase20・A案）は「保存時は正規化しない・
  CHORD_DB参照時にのみnormalizeChordName()を通す」というon-the-fly
  normalize方式。showChordSelector()だけ別ルールにすると、Analysis Editor
  で入力したコードだけ品質基準が変わってしまう。

  transposeChord()がルート音の大文字を前提にしている点（小文字ルートは
  変換されず放置される）についても、openAddChord()の既存バリデーション
  （isChordLikeInput()が大文字ルートのみ許可）と同一基準を踏襲することで、
  新たなリスクを持ち込んでいない（既存と同水準）ことを確認済み。
```

### [判断] `deleteChord()` は選択の同期（`_refreshSelection` / `setSelectedChordIds`）を関数自身が担う

```
結論:
  splitChord()は選択の切り替えを呼び出し側（追加ボタンのハンドラ）に
  委ねる設計にしたが、deleteChord()は逆に、関数自身が
  _refreshSelection()とsetSelectedChordIds()の両方を呼ぶ設計にした。

理由:
  splitChord()の場合、「新しくできた右側を選択するかどうか」は呼び出し
  文脈によって変わりうる（将来別の呼び出し元が現れる可能性がある）。
  一方deleteChord()の場合、削除された時点で元の選択は必ず無効になり、
  「吸収した側を選択する」以外の選択肢が実質的にない。
  そのため、この関数自身が両方の同期を担った方が安全（下記Findingsの
  バグの再発防止にもなる）と判断した。
```

### [判断] 最後の1件は削除不可

```
結論:
  analysisEditor.buffer.length <= 1 の場合、deleteChord()は何もせず
  トースト表示のみ行う。

理由:
  コード0件を許容すると、選択状態・Chart Mode表示・validateAnalysis()等
  複数箇所にnull分岐が増える。ユーザーにとっても誤削除のリスクが高い
  操作のため、最低1件を保証する方が安全と判断した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### バグ発見：追加時の選択ハイライトが同期しない

```
現象:
  ＋ボタンでコードを追加すると、編集パネルの「選択中のコード」表示は
  新しくできた右側のコードを正しく指しているのに、Chart Mode上の
  アンバー枠（ハイライト）は古い位置のまま動かなかった。

原因:
  選択状態は2箇所に保持されている。
    ① analysisEditor.selection（app.js・パネル表示用）
       → _refreshSelection() で更新
    ② chartState.selectedChordIds（chartmode.js・ハイライト表示用）
       → setSelectedChordIds() で更新
  通常のコードクリック時（onChordSelected）は①②両方を呼んでいるが、
  今回実装した追加ボタンのハンドラは①（_refreshSelection）のみを呼び、
  ②（setSelectedChordIds）の呼び出しを忘れていた。

  この2系統の選択キャッシュが存在すること自体は、current-issues.mdに
  以前から「selectedChordIds型不整合の疑い」として記録されていた懸念と
  同根の構造である。

修正:
  追加ボタンのハンドラに setSelectedChordIds([newId]) を追加。
  さらに、deleteChord()については同種のバグを構造的に防ぐため、
  関数自身が①②両方を呼ぶ設計に変更した（5. Design Decisions参照）。

再発防止の観点:
  「選択を切り替える処理を書くときは、_refreshSelection()と
  setSelectedChordIds()を必ずセットで呼ぶ」という点を、次フェーズ
  （複数選択・範囲選択）の実装時にも意識する必要がある。

教訓: Analysis Editorでは「選択状態」は analysisEditor.selection と
chartState.selectedChordIds の2系統で管理されている。新しい編集操作で
選択を変更する場合は、この2系統の同期が必要かどうかを必ず確認すること。
```

### 調査：openAddChord()の実態確認

```
当初、ChatGPTとの設計レビューでは「openAddChord()がshowChordSelector()を
内部利用する」という設計を検討していたが、実コード（chordEntry.js）を
確認した結果、openAddChord()は複数コード連続追加・行またぎカーソル移動・
小節線追加を持つ、想定より遥かに複雑なサブシステムであることが判明した。

この発見を受けて設計を修正した（5. Design Decisions参照）。
「現物を見ずに設計だけで進めると誤った前提のまま実装してしまう」という、
このプロジェクトの既存の教訓（Phase64の「handover記録と実コードの乖離」等）
と同種の事例。
```

---

## 7. Remaining Issues（残課題）

```
・追加位置のカーソル指定（再生カーソル位置での分割）
  状態: 未実装（意図的な保留・仕様変更ではない）
  現在: 「＋追加」は常に選択中コードの均等2分割のみ。
  [重要] splitChord()自体はmidpoint固定の関数ではない。
    固定なのは追加ボタンのハンドラ内にある以下の1行（UI側）だけである。
      const splitTime = (chord.start + chord.end) / 2;
    splitChord(chordId, splitTime) 自体は任意の時刻を受け取れる汎用関数
    として設計済みのため、上記1行を再生カーソルの現在時刻に差し替える
    だけでカーソル位置分割に対応できる。splitChord()自体・
    showChordSelector()側の変更は不要。
  次のアクション: UIの追加のみで対応可能。次フェーズ以降で希望があれば着手。

・コード名クリックによる変更起動
  状態: 未実装（意図的な保留）
  設計: openChordRenameSelector(chord) が既に共通入口として存在するため、
        コード名ラベルにクリックイベントを追加し、この関数を呼ぶだけで
        対応できる。

・aep-btn--danger のCSS
  状態: 対応不要と判明
  内容: 削除ボタンの赤系スタイルはcomponents.css/theme.cssに既存定義
        済みであることを確認した（token階層ルールにも準拠済み）。
        追加のCSS変更は不要。
```

---

## 8. Next Phase（次フェーズ開始位置）

区切りの基準（Phase74-Eで確定・変更なし）：`selection.chordIds`が単数か複数か。

```
Phase76（複数コード編集）:
  範囲選択 / Copy・Cut・Paste / 複数削除 / 分割・結合
  （selection.chordIdsが配列である設計はこのフェーズの複数選択を
  見据えたもの・Phase74-Eより）

Phase76完了後:
  current-issues.md / phase-status.md をまとめて更新
  （Phase75分・Phase76分の両方をこのタイミングで正式反映する）
```

---

## 9. Files Changed（変更ファイル一覧）

```
js/chordEntry.js
  ・buildPaletteHtml() 追加
    理由: openAddChord()とshowChordSelector()の共通部分（パレット表示）
    をpure functionとして抽出するため
  ・openAddChord() のパレットHTML生成部分をbuildPaletteHtml()呼び出しに置換
    理由: 重複コードの解消。挙動は完全に同一（回帰確認済み）
  ・showChordSelector() 新設
    理由: Analysis Editorの「追加」「変更」から使う、単一コード選択用の
    軽量モーダルとして新設

js/app.js
  ・import文に showChordSelector 追加
    理由: chordEntry.jsから新設した関数を利用するため
  ・splitChord(chordId, splitTime) 新設
    理由: コード追加の実体。moveBoundary()と同じ層のEditing Commandとして追加
  ・window.__analysisEditorDebug に splitChord 追加
    理由: 既存のデバッグexportパターンを踏襲するため
  ・openChordRenameSelector(chord) 新設
    理由: 「変更」ボタンと将来のコード名クリックの共通処理として集約するため
  ・deleteChord(id) 書き換え
    理由: 隣接コードへの時間吸収・自動選択・最低1件保証を追加するため
  ・renderAnalysisEditorPanel() 内、editActions・chordInfo変更
    理由: 「編集」行（追加・変更・削除ボタン）の追加、
    「別フェーズで対応予定」注記の削除のため
  ・Phase74-Dの未使用デッドコード削除
    理由: 対応するDOM要素（#aep-chord等）が存在せず一度も実行されて
    いなかったコードを、実際に動く実装に置き換えたため
```

---

## 10. Micro Log

- 現物のchordEntry.jsを確認し、openAddChord()が単純な「1つ選ぶダイアログ」
  ではなく複雑な常駐モーダルであることが判明→設計をopenAddChord()非破壊の
  方針に修正（Phase75）
- 正規化（normalizeChordName）とtransposeChord()の大文字ルート前提を調査し、
  showChordSelector()がopenAddChord()と同一のバリデーション基準を踏襲する
  方針で問題ないことを確認（Phase75）
- 実機テストで、追加ボタン使用時にハイライト（アンバー枠）とパネル表示が
  別のコードを指す不具合を発見。selectedChordIdsの二重管理
  （analysisEditor.selection / chartState.selectedChordIds）の同期漏れが
  原因と特定し、setSelectedChordIds()の呼び出し追加で修正（Phase75）
- 上記バグの再発防止として、deleteChord()は選択同期を関数自身が担う設計に
  変更（splitChord()は呼び出し側に委ねる設計のまま維持・使い分けの理由は
  Design Decisions参照）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
