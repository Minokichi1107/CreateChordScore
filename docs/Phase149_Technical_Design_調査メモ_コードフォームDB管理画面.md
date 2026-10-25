# Phase149 — Technical Design（技術設計）調査メモ
## Code Diagram DB管理画面（Issue #119）

- 状態：既存実装の読み取り調査。設計確定・実装開始ではない。
- 対象：`js/app.js`、`js/chords.js`。GitHub default branch上の内容を確認。
- Product Intent / UI/UX:
  - [Product Intent](./Phase149_Product_Intent_%E3%82%B3%E3%83%BC%E3%83%89%E3%83%95%E3%82%A9%E3%83%BC%E3%83%A0DB%E7%AE%A1%E7%90%86%E7%94%BB%E9%9D%A2.md)
  - [UI/UX Design](./Phase149_UI_UX_Design_%E3%82%B3%E3%83%BC%E3%83%89%E3%83%95%E3%82%A9%E3%83%BC%E3%83%A0DB%E7%AE%A1%E7%90%86%E7%94%BB%E9%9D%A2.md)

## 1. 確認できた現行実装

### 1.1 データの正本と保存形式
- Built-in（組み込み）フォームの定義元は `js/chords.js` 内の `CHORD_DB`。
- Custom（ユーザー登録）フォームは `localStorage` の `cs_customDiags` に保存される。
- 保存データは `{ version: 2, chords: ... }` 形式。
- Custom variantには `id`、フォーム名 `n`、指位置 `f)、必要に応じて `b` / `bs` が含まれる。
- Runtime（実行時）ではBuilt-inとCustomが同じ `CHORD_DB` に反映されるが、保存・編集可否の正本は分かれている。
- `loadCustomDiagrams()` は保存データを読み込み、canonical化（正規化）と重複排除を行い、必要に応じて保存データを修復する。

### 1.2 既存Undo（取り消し）
- `js/chords.js` に `diagPushUndo()`、`diagUndo()`、`diagUndoSize()` がある。
- Undoは `cs_customDiags` の文字列スナップショットを保持し、上限は10件。
- `diagUndo()` は保存データを復元するが、Runtime側の再読み込みは呼び出し元が行う。現行UIの呼び出し元ではUndo成功後に `refreshDiagrams()` を実行している。
- 既存Undoを管理画面から再利用できる可能性は高い。ただし、管理画面からの編集・削除・Importのどの操作でUndoスナップショットを積むか、Undo後の一覧更新・選択復元は設計が必要。

### 1.3 既存の削除経路
- `js/app.js` の `deleteDiagramVariant(chord, id)` は、Undoスナップショットを積み、Custom variantを削除し、保存、`refreshDiagrams()`、通知を行う。
- この関数は既存の右パネル経路に結びついているため、管理画面から直接利用する場合は副作用とUI更新の責務を確認する。

### 1.4 Import／Export
- `exportCustomDiagrams()` は `cs_customDiags` の保存文字列をそのままJSONファイル `chordscore_diagrams.json` として出力する。保存データがなければ通知して終了する。
- `importCustomDiagrams(file)` はJSONを読み、`version` と `chords` の存在を確認する。
- Importではコード名をcanonical化し、同じコードの保存先bucketを使う。
- 現行の重複判定は、variant IDまたは `n + f + b` のfingerprint（識別用指紋）が一致した場合にスキップする。fingerprintに `bs` は含まれない。
- 重複は上書きせずスキップし、新規追加数を通知する。
- UndoスナップショットはImport処理の終盤、保存直前に積まれている。
- これはProduct Intentの「Import時に重複するフォームがあれば上書きして一本化」と一致していない。Importの上書き条件・ID維持・`bs` の扱いを決めてから変更する必要がある。
- Exportは既存保存データを直接出力するため、管理画面から再利用する場合もファイル形式を変えない方針と整合する。

### 1.5 既存追加・編集
- `js/app.js` から `initModals()` に `onAddDiagram` と `onUpdateDiagram` のコールバックを渡している。
- 追加は `addCustomDiagram()` → 保存 → `refreshDiagrams()`。
- 編集は `diagPushUndo()` → `updateCustomDiagram()` → 保存 → `refreshDiagrams()`。
- 既存の追加・編集モーダルを再利用する余地がある。ただし、現在のコールバックは右パネルの更新を前提にしている可能性があるため、管理画面から呼び出した際に右パネルや選択状態へ意図しない副作用がないか確認が必要。
- 今回確認した範囲では、管理画面用の独立したDB一覧・検索・分類UIは確認できていない。

## 2. 設計上の論点（未確定）

1. 管理画面を既存画面にどのように接続し、既存のモーダル・保存関数をどこまで再利用するか。
2. 管理画面用一覧を `CHORD_DB` runtime viewから構築するか、Built-inとCustomの正本を明示的に分けて表示モデルを作るか。
3. Importの重複照合を、ID一致とフォーム内容一致のどちらに優先させるか。内容一致時に既存IDを維持するか、インポート側IDを採用するか。
4. Importで内容一致のフォームが複数存在した場合に、どれを残すか。一本化の単位が同じコード名内であることを明示するか。
5. fingerprintに含める値（特に `bs`）とフォーム名 `n` の扱い。
6. フォームの4グループ並び順を決めるために、CustomとBuilt-inで共通に使える判定情報。
7. 削除Undoを既存の10件スナップショットへ接続する際、他画面でのUndo操作との関係をどう扱うか。
8. 管理画面を閉じた後のデータ更新と、現在のコード表示／右パネルの再描画をどう同期するか。
9. 既存の追加・編集モーダルが要求するcallback/contextを管理画面から安全に供給する方法。

## 3. 初期の再利用見立て

| 項目 | 現時点の見立て | 注意点 |
|---|---|---|
| Built-in/Customの読取 | 既存データを再利用可能 | Runtime統合データと正本の区別を維持 |
| 追加・編集モーダル | 再利用候補 | 既存右パネルへの副作用を確認 |
| 保存関数 | 再利用候補 | IDと保存形式を維持 |
| Undoスナップショット | 再利用候補 | 管理画面の選択状態は別途復元 |
| Export | ほぼ再利用可能 | 空データ時の現行動作をどう扱うか |
| Import | そのままでは要件不一致 | 重複をスキップしており、上書き・一本化の仕様が必要 |
| 一覧・検索・Root/Type分類 | 新規UI/表示モデルが必要 | 元データの変更を伴わない表示処理にする |
| 並び順4グループ | 新規判定ロジックが必要な可能性 | 正確な境界は未確定 |

## 4. 次の調査・設計作業

- `addCustomDiagram`、`updateCustomDiagram`、`removeCustomDiagram`、`getChordEntry`、既存モーダルの契約を確認する。
- HTML/CSSのToolsメニュー、モーダルDOM、右パネルのフォーム図描画・更新経路を確認する。
- Issue #14、#93、#114との関連を照合し、variant identityや編集責務の重複を確認する。
- その後、管理画面の起動・閉じ方、表示モデル、状態管理、Import上書きルール、Undo接続を設計案として提示する。
- 実装は、技術設計を確認・承認するまで開始しない。
