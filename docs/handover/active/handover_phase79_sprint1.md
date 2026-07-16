# 引き継ぎ: Phase79 Sprint1完了 — Paste Insert（そのまま貼り付け）

## 作業状態
- 直前作業: Phase78完了（Footer UI刷新 + クリック/位置計算バグ修正）
- ブランチ: phase79-sprint1-paste-insert（想定・実際のブランチ名に合わせて読み替え）

---

## micro-log

（このセクションは本文に統合済みのため削除可）

---

## 1. Purpose（目的）

Analysis Editorに「そのまま貼り付け（Ctrl+V）」を新設する。
既存の「範囲に合わせて貼り付け」（Phase76・pasteSelection、比率ベース）は
選択範囲へ収める操作だが、今回追加したのはコピー時点の**絶対的な拍位置・長さを
そのまま復元して貼り付ける**操作。ユーザー（たかっち氏）から「絶対位置と
小節拍の長さを維持したまま貼り付けを基本機能としたい」という要望があり、
Ctrl+V（標準）をこちらに割り当てることで決着した。

---

## 2. Scope（今回やったこと）

```
・clipboard構造をversion 2へ拡張（offsetSec / durationSec / totalDurationSec追加）
・getPasteOrigin() 新設（selectionもeditPointも同じ「起点」として扱う）
・buildPastePlan() 新設（検証専用の純粋関数・5分類の上書きロジック）
・commitPastePlan() 新設（Planの一括適用・Undo単位を1回に集約）
・pasteAbsolute() 新設（Ctrl+Vの本体）
・Ctrl+V / Ctrl+Shift+V の役割分担を確定（起点ベース）
・Analysis Editor専用のUndo/Redoショートカット追加（Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z）
・既存のCtrl+Z（importUndo）を解析編集モード中は無効化（キー競合防止）
・Group3 Action RegistryにPaste Insert関連ボタンを追加
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Decorator Layer（Selection Highlightの継続セル対応含む）
  → Sprint2へ。実機テスト中に発見された「継続セルまでハイライトされず、
    選択範囲が認知しづらい」という課題も、Sprint2でDecorator Layerの
    最優先項目として正式に扱う（詳細は「7. Remaining Issues」参照）。
    応急的なCSSでの部分対応はしない（ChatGPTレビューで却下・後述）。

・クリック体系の再設計（Sprint3）
  → 今回は着手せず。

・Capo表示統一（Sprint4）
  → 今回は着手せず。

・Clipboardの拍ベース化
  → 検討したが、TimingModelがimmutable・BPM変更機能が存在しない・
    clipboardがセッション限定という前提から、秒（sec）で保存する方針を
    採用（詳細は「5. Design Decisions」参照）。将来「曲を跨ぐPaste」が
    必要になった場合に再検討する。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `copySelection()` 拡張 | clipboardをversion 2へ拡張。`ratio`（既存・Fit Paste用）に加え `offsetSec` / `durationSec`（新規・Paste Insert用）、`totalDurationSec`（曲末チェック用）を追加 | app.js |
| `getPasteOrigin()` 新設 | 「そのまま貼り付け」の起点となる実時刻を返す。editPoint／選択コード開始位置のどちらでも同じ関数で扱える | app.js |
| `buildPastePlan()` 新設 | 純粋関数。bufferを変更せず、曲末チェック＋5分類の上書き計画のみを返す | app.js |
| `commitPastePlan()` 新設 | Planをbufferへ一括適用。`_pushHistory()`を1回だけ呼ぶことでUndo単位を1操作に保つ | app.js |
| `pasteAbsolute()` 新設 | Ctrl+Vの本体。origin取得→plan生成→検証→commit の流れを統括 | app.js |
| キーボードハンドラ | `Ctrl+V`→`pasteAbsolute()`、`Ctrl+Shift+V`→`pasteSelection()`（既存）に分岐 | app.js |
| `Ctrl+Z`（既存・importUndo） | 解析編集モード中（`isAnalysisEditing()`）は無効化 | app.js |
| Undo/Redoショートカット新設 | `Ctrl+Z`→`undoEdit()`、`Ctrl+Y` または `Ctrl+Shift+Z`→`redoEdit()`（解析編集モード専用） | app.js |
| `getGroup3Actions()` | `PASTE`を`PASTE_FIT`（範囲に合わせて貼り付け）に改名し、`PASTE_ABS`（そのまま貼り付け）を追加。single/multi/edit-pointの各モードに配置 | app.js |
| ボタン結線 | `aep-paste-absolute-primary`（edit-pointモードのPrimary Action）・`aep-paste-absolute`（single/multiモードのその他▼内）の2箇所にイベントを結線 | app.js |
| Undo/Redoボタン | `title`属性にショートカット表記を追加（`元に戻す（Ctrl+Z）` 等） | app.js |
| デバッグexport | `window.__analysisEditorDebug`に`pasteAbsolute` / `getPasteOrigin` / `buildPastePlan`を追加 | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Clipboardは秒（sec）で保存する（拍ベースは採用しない）

```
結論:
  offsetSec / durationSec / totalDurationSecはすべて秒単位で保存する。
  拍（beat）やスロット単位への変換は行わない。

理由:
  拍ベースの方が一般論としては「BPMが変わっても意味が保たれる」という
  利点があるが、このプロジェクトには以下の前提がある：
    ・TimingModel（raw.beats / raw.downbeats）はimmutable
    ・BPMをユーザーが後から修正する機能は存在しない
    ・clipboardはセッション限定（プロジェクトを跨いで永続化されない）
  この3条件により、「後でBPMが変わって拍の意味が変わる」という
  リスクが実質的に存在しない。むしろこのプロジェクトでは秒が
  実質的なcanonicalとして扱える（ChatGPTレビューで確定）。
  将来「曲を跨ぐPaste」等が必要になった場合は、その時点でversionを
  上げて拍ベースの情報を追加する拡張性は確保してある。
```

### [判断] Paste Origin という概念の導入

```
[PASTE ORIGIN DEFINITION]
Paste Origin = editPoint、または選択中コードの中でbuffer上最も早い
コードの開始時刻（chord.start）。表示上の見た目（DOM上のセル境界・
視覚的な左端）とは無関係の、データ上の実時刻である。

結論:
  selectionもeditPointも、Ctrl+Vにとっては同じ「起点」でしかない、
  という設計原則を導入した（getPasteOrigin()として実装）。

理由（実機テストでの気づき・ChatGPTとの議論で確定）:
  当初「選択範囲＝貼り付け対象」という一般的なテキストエディタの
  メンタルモデルで設計案を検討していたが、たかっち氏から
  「選択やeditPointは貼り付けの開始位置を示すだけで、範囲を示す
  ものではない」という実際の使用感の指摘があり、設計を修正した。
  この気づきにより、「範囲に合わせて貼り付け」（範囲が必要）と
  「そのまま貼り付け」（起点だけで足りる）という役割分担が
  明確になった。
```

### [判断] Ctrl+V / Ctrl+Shift+Vの役割分担（起点ベース）

```
状態          | Ctrl+V（そのまま貼り付け）      | Ctrl+Shift+V（範囲に合わせて貼り付け）
-------------|-------------------------------|--------------------------------
editPoint中   | ✅ editPointから開始            | ❌ 無効（範囲が無いため）
単一選択中     | ✅ 選択コードの開始位置から開始    | ✅ そのコードの範囲へfit（既存）
複数選択中     | ✅ 範囲先頭から開始              | ✅ 範囲へfit（既存）
idle         | ❌ 無効                        | ❌ 無効

理由:
  「そのまま貼り付け」は起点だけで動作が完結する（範囲の概念が不要）。
  「範囲に合わせて貼り付け」は逆に範囲そのものが必須のため、editPoint
  （範囲を持たない）では無効とした。
```

### [判断] 上書き方式・5分類（4分類から拡張）

```
[DESIGN] 上書き方式（5分類）
  完全内包                                → 削除
  左だけ重なる（開始側にまたがる）            → end短縮
  右だけ重なる（終了側にまたがる）            → start移動
  貼付範囲が既存コード内部に完全に収まる（分断） → 既存コードを前後2つへ分割
  範囲外                                  → 変更なし

経緯:
  当初Claudeが提示した設計は4分類だったが、ChatGPTレビューで
  「1コードの内部に貼り付け範囲がすっぽり収まるケース」が
  欠落していることが指摘された（例: 長いコード1つの中間に
  短い範囲を貼り付けるケース）。このケースは「左だけ」「右だけ」
  重なる処理を同時に満たすため、単独の5番目の分類として明示した。

[ID POLICY]（分断ケース限定）
  分断は実質的に「既存コード1件を2件の新規コードへ置き換える」操作
  である。splitChord()（左側は元_idを維持する設計）とは意図が異なり、
  Paste側では前後どちらも新規_idを発行し、元の_idは再利用しない
  （ChatGPTレビューで確定）。

[GUARD]
  貼り付け区間が曲の終端（buffer末尾のend）を超える場合は中止する。
  部分的にだけ適用することはしない（部分適用による中途半端な状態を防ぐ）。

[EPSILON対応]
  境界判定にEPS(1e-6)を導入。浮動小数点誤差による意図しない極小分割・
  誤判定を防止。「コピー元と全く同じ長さの区間への貼り付け」で
  余計な分割が発生しないことを実機確認済み。
```

### [判断] Paste Plan方式（検証と適用の分離）

```
結論:
  buildPastePlan()（純粋関数・bufferを変更しない）と
  commitPastePlan()（実際にbufferへ適用）を分離した。

理由（ChatGPTレビュー）:
  この形にすると、曲末チェック等の検証で失敗した場合、
  buildPastePlan()の時点でreturnでき、bufferは一切変更されない
  （[CANCEL INVARIANT]と同じ、確定操作のみが状態を変える方針を踏襲）。
  将来のDuplicate・Pattern Insert・Humanize等も同じ
  「Plan生成→検証→commit」のパターンで実装できる拡張性がある。

[UNDO INVARIANT]（新規追加）
  Pasteは内部で複数の編集（削除・短縮・移動・追加）を行っても、
  Undo履歴には必ず1操作として記録する（_pushHistory()を1回だけ呼ぶ）。
  将来のDuplicate/Pattern Insert等も同じ原則を踏襲する。
```

### [判断] 既存Ctrl+Z（importUndo）を解析編集モード中は無効化

```
背景:
  Phase18由来の「CSVインポート時のUndo」機能が、既存のグローバル
  Ctrl+Zハンドラとして存在していた（importUndoStack）。
  Analysis Editor自身のUndo（undoEdit）とキーが重複していた。

結論:
  isAnalysisEditing()がtrueの間は、importUndo側のCtrl+Z処理を
  スキップするようガード条件を追加した。

理由:
  2つのUndo機構が同じキーを取り合うと、「今どちらのUndoが動くか」
  が分かりにくくなる。解析編集モード中はAnalysis Editor側のUndoを
  優先させるのが自然。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 実機テストで発見：Undo後に選択が「クリックして編集」（idle）に戻る現象

```
現象:
  Paste実行後（新しいコードが選択された状態）でUndoを押すと、
  選択パネルが「クリックして編集」（idle表示）に戻ってしまう。
  一見バグに見えたため、たかっち氏から質問があった。

調査結果:
  バグではなく、Phase74-Eで確立済みの既存設計通りの挙動と判明。

  undoEdit()は _refreshSelection()（引数なし）を呼ぶ。この関数は
  「現在選択中のIDが、Undo後のbufferに実在するか」を毎回検証する。
  Pasteで生成したコードは新規の crypto.randomUUID() を持つため、
  Undoでbufferが貼り付け前の状態に巻き戻ると、そのIDはもう
  bufferに存在しない。よって _refreshSelection() は「選択対象が
  消えた」と正しく判定し、選択をidleへ戻す。

  これはPaste専用の挙動ではなく、削除・結合など他の編集操作の
  Undoでも同様に発生する、既存の一貫した設計（Phase74-E:
  「選択中のコードがbufferに残っていれば選択を維持し、消えていた
  場合のみ選択解除する」）。

結論: 対応不要（既存invariant通りの正しい動作）。
```

### 実機テストで発見：継続セルまでハイライトが伸びず、選択範囲が認知しづらい

```
現象:
  複数コードを選択した際、amber枠がonsetセル（コード名が表示されている
  セル）にしか付かず、そのコードが実際に何拍分続いているのかが
  視覚的に分かりにくい。Copy/Pasteの操作時に「どこまでコピーされて
  いるか」の把握が難しい、という指摘があった。

位置づけ:
  Phase78 handoverで既に「Decorator Layer」として積み残されていた
  課題（「コード選択はセル全体を背景色でハイライトする」「継続コードは
  継続範囲全体を1つの選択領域として表現する」という設計方針）と
  完全に一致する。Sprint1の実機テストにより、Phase78で立てた設計方針が
  実際の使用感でも裏付けられた形になる。

対応方針（ChatGPTレビューで確定）:
  応急的なCSS対応（carryセルにも.chart-slot--selectedを付けるだけ、等）
  は採用しない。理由は、Sprint2でDecorator Layerを正式導入する際に
  DOM構造・描画ロジックが二重管理になり、応急CSSを全部剥がす
  「後で捨てる実装」になってしまうため。Sprint2で最初から
  正式設計として実装する。
```

---

## 7. Remaining Issues（残課題）

Sprint2（Decorator Layer）で対応する。優先順位は以下の通り（ChatGPT・たかっち氏合意）。

```
① Selection Highlight（最優先・今回の実機テストで裏付けられた課題）
   継続セル込みで「1つの選択領域」を3段階で表現する:
     ・継続セルも含めた薄いamber背景
     ・コード全体（onset〜継続セルの連続区間）を1本の外枠で囲む
     ・onsetセル（コード名表示位置）だけ少し濃く強調

   [対象範囲の確認事項（ChatGPTレビューで確定）]
   ハイライト対象は「通常のcarryセル」のみ。projectionEmpty
   （pickup小節の空白セル・Phase68〜69）は対象外とする。
   projectionEmptyは「コードが存在しない」ことを示す表示のため、
   選択領域として塗ると「そこにもコードがある」という誤解を招く。
   [PROJECTION INVARIANT]（architecture.md §9.5）を維持する。

   [実装上の技術的課題（Sprint2着手時に検討）]
   CSSの個別border指定だけでは「連続区間の先頭・中間・末尾」で
   枠の見た目が破綻する（二重線・不自然な角丸等）。
   隣接するcarryセルの連続区間を検出し、区間の先頭/中間/末尾で
   異なる装飾クラスを付与するロジックが必要
   （chartmode.jsのexpandToSlots() / _renderChartGrid()側の変更が
   必要になる見込み）。

② Boundary Handle
   個別移動ハンドルの統一描画（Phase77由来の暫定CSSを正式化）

③ EditPoint Marker
   editPointマーカーの統一描画（Phase77由来の暫定CSSを正式化）
```

Phase78から持ち越しの「範囲シフトが選択範囲外へ影響する疑い」（未再調査）は
Sprint2着手時、Boundary Handle実装の前に優先確認すること（Phase78 handover参照）。

---

## 8. Validation（動作確認結果）

実機テストで確認済み。

| 項目 | 結果 |
|---|---|
| 完全一致貼り付け（コピー元と同じ長さの区間へ貼り付け） | ✅ 余計な分割は発生しない |
| 連続Ctrl+V（3回） | ✅ Undoが3回で正しく戻る |
| Ctrl+Z（Analysis Editor Undo） | ✅ importUndoとの競合なし |
| Ctrl+Y / Ctrl+Shift+V（Redo） | ✅ 両方とも動作。OS/ブラウザ標準機能との衝突は未検出（継続観察） |
| Undo後の選択状態 | ✅ 仕様通り（idleへ戻る。詳細は「6. Findings」） |

未実施:
```
・分断ケース（1コードの内部への貼り付け）の実機テスト
  → 次回セッションで優先確認すること
・曲末を超える貼り付けの実機テスト（エラーメッセージ表示確認）
```

---

## 9. Next Phase（次フェーズ開始位置）

```
Phase79 Sprint2: Decorator Layer

新しいチャットで再開する（プロジェクトのhandover運用ルール通り）。
アップロードするもの:
  ・本handover（handover_phase79_sprint1.md）
  ・最新のapp.js（Sprint1の変更を適用したもの）
  ・chartmode.js
  ・（あれば）components.css

着手順序（優先順位）:
  ① Selection Highlight（continuationセルのハイライト・3段階表現）
  ② Boundary Handle
  ③ EditPoint Marker

Sprint2着手時、まず確認すること:
  ・Phase78から持ち越しの「範囲シフトが選択範囲外へ影響する疑い」の再調査
  ・実コード（chartmode.jsのexpandToSlots / _renderChartGrid）を
    grep/viewしてから設計を具体化する（推測で進めない）
```

---

## 10. Files Changed（変更ファイル一覧）

```
js/app.js
  ・copySelection() 拡張（clipboard version 2: offsetSec/durationSec/totalDurationSec追加）
  ・getPasteOrigin() 新設
  ・buildPastePlan() 新設
  ・commitPastePlan() 新設
  ・pasteAbsolute() 新設
  ・キーボードハンドラ: Ctrl+V/Ctrl+Shift+Vの分岐追加
  ・キーボードハンドラ: 既存Ctrl+Z（importUndo）に!isAnalysisEditing()ガード追加
  ・キーボードハンドラ: Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z（Analysis Editor Undo/Redo）追加
  ・getGroup3Actions(): PASTE→PASTE_FITへ改名、PASTE_ABS新設、edit-pointモードへ追加
  ・renderAnalysisEditorPanel(): getGroup3Actions('edit-point',...)呼び出しのhasClipboard修正
  ・renderAnalysisEditorPanel(): aep-paste-absolute-primary / aep-paste-absolute のイベント結線
  ・Undo/Redoボタンのtitle属性にショートカット表記追加
  ・window.__analysisEditorDebug に pasteAbsolute/getPasteOrigin/buildPastePlan追加
```

---

## 11. Micro Log

- ChatGPTとの設計レビューを通じ、「選択もeditPointも貼り付けにとっては
  同じ起点でしかない」という設計原則（Paste Origin）を確立
- 当初4分類だった上書きロジックに、ChatGPTレビューで「1コード内部への
  分断」ケースが漏れていることを指摘され5分類に拡張
- 分断ケースのID発行方針について、当初は左側に元IDを再利用する実装
  だったが、ChatGPTレビューで「両方新規ID・元IDは削除」に修正
- 実機テストで「Undo後に選択がidleに戻る」現象が報告されたが、調査の
  結果Phase74-E由来の既存設計通りの正しい動作と判明（バグではない）
- 実機テストで「継続セルまでハイライトが伸びず選択範囲が分かりにくい」
  という指摘があり、Phase78 handoverで既に積み残されていたDecorator
  Layerの課題と一致することを確認。応急CSS対応はせず、Sprint2で
  正式実装する方針をChatGPTレビューで確定
- 既存のCtrl+Z（Phase18由来のimportUndo機構）とAnalysis Editor自身の
  Undoがキー競合することを実装時に発見し、isAnalysisEditing()ガードで解消

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
