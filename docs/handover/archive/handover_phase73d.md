# 引き継ぎ: Phase73-D完了 — Legacy Project Import / empty autosave guard

## 作業状態
- ブランチ: phase73-d
- 直前作業: Phase73-C完了（Project DB Library UI 実装）

---

## 完了したこと

### 1. ライブラリへの一括インポート導線

| 変更 | 内容 | ファイル |
|---|---|---|
| `PICKER_IDS.projectImport` 追加 | 用途別ピッカーID方針（Phase60.5）に準拠 | project.js |
| `importProjectRecords(projects, uiStates)` 追加 | parse済み project + uiState 配列をDBへ投入。衝突確認・件数集計を担う | project.js |
| `_handleImportProjectFiles()` 追加 | File読込 / JSON.parse / deserializeProject / importProjectRecords 呼び出し / toast / renderLibrary() | app.js |
| ファイルメニュー import ハンドラ追加 | `btn-import-projects` / `file-import-projects`（fallback）のイベント登録 | app.js |
| ファイルメニュー項目追加 | `📥 ライブラリにプロジェクトファイルをインポート…` | index.html |
| fallback input 追加 | `<input id="file-import-projects" multiple>` | index.html |

### 2. 空プロジェクトの autosave 抑止（Phase73-D 追補）

起動直後の空 `createEmptyProject()` 状態が autosave によってライブラリへ「無題」として
登録され続ける不具合を修正。

`autoSaveLocal()` の `setTimeout` コールバック内先頭に empty project guard を追加。

---

## 実装上の重要判断（設計ポイント）

### import の保存経路を saveProjectToDB() に統一

当初案では `importProjectRecords()` 内で直接 `db.put()` していたが、
これを `saveProjectToDB(project, uiState)` 再利用に変更した。

**理由:**

- `saveProjectToDB()` は内部で `serializeProject(project, uiState)` を呼ぶ。
  `key` / `tempo` は `project` オブジェクトではなく `uiState` 側に存在するため、
  `uiState` を渡さずに `db.put()` すると `key` / `tempo` がレコードに入らない。
- 保存経路を二重管理にすると、将来 `saveProjectToDB()` の仕様が変わった時に
  import 経路だけ取り残されるリスクがある。

### deserializeProject() の uiState を保持する

`deserializeProject(raw)` は `{ project, uiState }` を返す。
import 経路で `const { project: proj } = deserializeProject(raw)` のように
`uiState` を捨てると上記の `key` / `tempo` 欠落が発生する。

`_handleImportProjectFiles()` では `{ project: proj, uiState }` の両方を保持し、
`importProjectRecords(projects, uiStates)` に渡す構造にした。

### empty project guard の置き場所

`autoSaveLocal()` の外側（`clearTimeout(asT)` より前）に guard を置くと
タイマー競合が発生し、正当な autosave がキャンセルされる副作用があった。

guard は必ず `setTimeout` コールバックの**先頭内**に置くこと。

---

## 確定した invariant

```
[LEGACY IMPORT IDENTITY POLICY]
同一 project.id が既存DBにある場合は skip（上書きしない）
import は lineage merge ではない

[LEGACY IMPORT SAVE PATH]
import でも project core data の保存は saveProjectToDB(project, uiState) を再利用する
import 専用の raw db.put() 直書きはしない
key / tempo の書き込みは serializeProject() 経由で保証される

[LEGACY IMPORT SCOPE]
取り込み対象は project core data のみ
audio / chord / analysis の移行はスコープ外

[IMPORT RESULT VISIBILITY]
success / skip / failure 件数を toast で必ず表示する

[EMPTY PROJECT GUARD]
起動直後の空 createEmptyProject() 状態では autosave で DB 登録しない
ガードは autoSaveLocal() の setTimeout コールバック内先頭で評価する
hasMeta 判定: title / artist / chord_source は trim() ベース、audio は存在判定
line 内容判定: lyric / time / chords / repeat の実スキーマベースで行う
```

---

## current-issues.md 更新

- 今回 close した issue（`[CLOSE BY DELETION]`）:
  - 「FSA保存ファイルのProject DBへの取り込み導線」

- Phase73-D 追補で同時修正した不具合（current-issues に open issue として存在していなかったため削除対象なし。本 handover に完了記録を残す）:
  - 起動時 autosave による空プロジェクトのゴミ登録

- 将来候補（current-issues には残さない・必須残件ではなく拡張候補）:
  - audio / chord / analysis の完全移行
  - import 元ファイルの保存日時継承
  - 未開封 project.json 群の一括スキャン登録

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| 複数 project.json を選択 → ライブラリに一括登録 | ✅ |
| 同一 project.id を再インポート → スキップ | ✅ |
| 不正 JSON を混入 → エラー件数に計上・他は正常登録 | ✅ |
| 結果 toast に登録/スキップ/エラー件数が表示される | ✅ |
| 起動直後（空プロジェクト）で「無題」がライブラリに増殖しない | ✅ |
| コンテンツ入力後の autosave は正常に動作する | ✅ |

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
