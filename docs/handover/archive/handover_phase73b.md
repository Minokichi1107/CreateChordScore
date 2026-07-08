# 引き継ぎ: Phase73-B完了 — Project DB サブシステム実装

## 作業状態
- ブランチ: `phase73-b-project-db`
- 直前作業: Phase73-A完了（Project DB Architecture 設計フェーズ）

---

## 完了したこと

| 変更 | 内容 | ファイル | 確認方法 |
|---|---|---|---|
| DB_VERSION 1→2 | projects object store 追加のため | idb.js | DevTools IndexedDB確認済み |
| projects store 追加 | keyPath: "id" / by-updatedAt index付き | idb.js | DevTools IndexedDB確認済み |
| Repository API 追加 | `saveProjectToDB` / `getProject` / `listProjects` / `deleteProject` | project.js | 実機保存確認済み |
| import 追加 | `import { initDB } from './idb.js'` をファイル先頭に追加 | project.js | grep確認済み |
| autosave 切替 | `saveToLocalStorage()` → `saveProjectToDB()` | app.js | projects ストアにレコード確認済み |
| import 追加 | `saveProjectToDB` / `getProject` を import に追加 | app.js | grep確認済み |
| generation counter | `_loadGeneration` / `myGeneration` チェック6箇所 | app.js | grep確認済み |
| saveProjectNew() 復旧 | btn-savenew handler と関数本体を追加 | app.js | 異なるUUIDで保存確認済み |

---

## 実機確認結果

```
DevTools → Application → IndexedDB → ChordScoreDB → projects

Total entries: 9（複数曲の保存を確認）

レコード例:
  id:            "65a4dd7a-c88d-4a90-8a45-72d7781ff463"
  artist:        "テスト"
  title:         "テストプロジェクト"
  schemaVersion: 1
  createdAt:     (timestamp)
  updatedAt:     (timestamp)
```

---

## 確定した設計原則

### [PROJECT CORE AUTHORITY]

```
IndexedDB "projects" store が project core data の canonical source。

対象（project core data）:
  id / schemaVersion / title / artist / lines[]
  capo / key / tempo / audioFileName / chordSourceFileName
  hasAnalysis / createdAt / updatedAt

対象外（既存 authority のまま）:
  audio 実体      → idb.js assets store（既存）
  chord_source 実体 → idb.js assets store（既存）
  analysis 実体   → analysis/{id}.json（既存）
  customDiagrams  → localStorage（既存）
```

### [DB META SEPARATION]

```
createdAt / updatedAt / schemaVersion は Repository 層のみで管理する。
serializeProject() には混入しない。

理由:
  - FSA Export（project.json）に DB 運用情報が混入しない
  - serializeProject() の責務（プロジェクトデータの変換）を汚さない
  - Git 管理時に autosave のたびに差分が汚れない

実装:
  saveProjectToDB() 内で付加する
    record = { ...serializeProject(project, uiState), schemaVersion, createdAt, updatedAt }
```

### [INTERNAL / PUBLIC 分離]

```
_getRawRecord(id): 内部専用。生レコード（DBメタ含む）をそのまま返す。
getProject(id):    公開API。DBメタを除いた serializeProject() 互換データを返す。

分離する理由（Phase73-A ChatGPT指摘）:
  将来 getProject() の戻り値形式が変わっても、
  saveProjectToDB() 内の createdAt 継承ロジックが壊れないため。

使い分け:
  saveProjectToDB() 内部 → _getRawRecord()（createdAt 継承のため）
  loadProj() など外部    → getProject()（deserializeProject() に渡せる形）
```

### [PROJECT SWITCH LIFECYCLE]

```
最後に開始された project load request のみが、
現在の project state に対する書き込み権限を持つ。

実装: generation counter
  let _loadGeneration = 0;

  async function loadProj(data) {
    const myGeneration = ++_loadGeneration;  // 最初の同期処理として採番
    resetProject();

    // 各 await 直後に世代チェック
    const fileResult = await loadAnalysisFile(...);
    if (myGeneration !== _loadGeneration) return;  // 古いリクエストなら中断
    ...
  }

チェック箇所（6箇所）:
  ① loadAnalysisFile() 後
  ② loadAnalysis() 後
  ③ saveAnalysisFile() 後（旧形式 migration 経路）
  ④ loadAnalysis() 後（旧形式 migration 経路）
  ⑤ loadAsset(audio) 後
  ⑥ loadAsset(chord) 後

採番位置の原則:
  「関数が呼ばれた瞬間」に同期的に確定させる。
  いかなる await より前に採番すること。
  （await 後に採番すると、別リクエストが先に完了した場合に保護が効かない）

現状の保護効果:
  Phase73-B 時点では Library UI が未実装のため競合は実質起きない。
  Phase73-C（Library UI）実装後に本格的に機能する。
```

---

## 付随修正: saveProjectNew() 復旧

```
[経緯]
  index.html に btn-savenew ボタンが存在していたが、
  app.js に handler と関数本体が存在していなかった。

  handoverには Phase62 で実装済みの記録があり、
  index.html にもボタンが存在していたため、
  過去のどこかで app.js の内容が欠落したと推定される。
  （欠落の正確な時期は Git 履歴を要確認）

[復旧内容]
  1. setupEventHandlers() 内に handler 追加:
     document.getElementById('btn-savenew')
       .addEventListener('click', () => saveProjectNew());

  2. saveProjectNew() 関数を saveProject() 直後に追加:
     async function saveProjectNew() {
       // [PROJECT IDENTITY SEMANTICS] 新UUID発行でlineage分岐
       project.id = crypto.randomUUID();
       _fileHandle = null;
       await saveProject(true);
     }

[動作確認]
  異なる UUID で2つのファイルが保存されることを実機確認済み。
```

---

## current-issues.md 更新

- 今回 close した issue:
  - 「プロジェクトDBライブラリタブ追加」の状態を「実装完了（Phase73-B）」に更新
    （Repository API・autosave・generation counter すべて実機確認済み）

- 今回新規に積み残した issue:
  - なし

---

## 積み残し・次フェーズ候補

### Phase73-C（UI実装フェーズ）

```
実装が必要なもの:
  - ライブラリ一覧UI（右パネルまたは専用オーバーレイ）
  - listProjects() を呼んでレコード一覧を表示
  - getProject(id) → loadProj() でプロジェクト切替
  - deleteProject(id) + deleteAssets(id) での削除UI
  - resetProject() のタイミング（UX確認後に決定）

設計上の注意:
  - generation counter（Step4）がここで本格的に機能する
  - Project 切替時に analysis / audio / chord が正しく切り替わるか確認が必要
  - 「開いた時に自動登録」導線（FSA保存ファイルのDB取り込み）は別issue
```

### autosave の復元経路

```
現在の復元経路（変更あり）:
  Before: localStorage["cs_auto"] → loadFromLocalStorage() → loadProj()
  After:  IndexedDB["projects"] → （未実装）

[注意]
  autoSaveLocal() の書き込み先は IndexedDB に切り替わったが、
  起動時の自動復元（DOMContentLoaded 内の loadFromLocalStorage()）は
  まだ localStorage を参照したまま。

  Phase73-C で listProjects() から最終更新プロジェクトを復元する
  経路に切り替える予定。それまでは二重管理の状態が続く。
  （localStorage の cs_auto は引き続き書き込まれていないため、
   起動時の復元ダイアログは今後表示されなくなる点に注意）
```

---

## 実装確認ルール（Phase73-B で確立・project_instructions.md に追記済み）

```
状態判定:
  「未実装」「存在しない」と断定する前に、必ず実コード確認（grep/view）を行う。
  確認できていない場合は「未確認」と表現する。
  推測と確認結果を明確に区別する。

ステップ完了宣言:
  以下のいずれかを満たした場合のみ Step 完了と宣言する:
    - grep / view による実コード確認
    - 実機動作確認
    - ユーザー報告 + 実コード確認の両方

確認フロー:
  実装状態を確認したい場合:
    たかっちさん → grep コマンドを実行して結果を貼る
    Claude      → 結果を見て状態を判断・次の差分を提示

handover 記載区別:
  「設計完了」/「実装完了」/「実機確認済み」を必ず区別して記載する。

教訓（Phase73-B）:
  「アップロードされたファイルに無い ≠ ローカルに無い」
  アップロード前のキャッシュを見て「未実装」と誤判断するケースがあった。
  grep 結果または最新ファイルのアップロードで必ず確認すること。
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
