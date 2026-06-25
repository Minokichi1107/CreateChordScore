# 引き継ぎ: Phase73-C完了 — Project DB Library UI 実装

## 作業状態
- ブランチ: phase73-c
- 直前作業: Phase73-B完了（Project DB サブシステム実装）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| import 追加 | `listProjects` / `deleteProject` を project.js から追加 | app.js |
| import 追加 | `deleteAssets` を idb.js から追加 | app.js |
| 起動時復元の切替 | `restoreLastProjectOnStartup()` を新設・DOMContentLoaded を async 化・listProjects() 経由に変更 | app.js |
| 純粋関数追加 | `getSortedProjects(projects, sortBy)` / `formatUpdatedAt(ms)` | app.js |
| ライブラリUI本体 | `renderLibrary()` / `setRightTab()` / `initLibrary()` を追加 | app.js |
| autoSaveLocal修正 | `await saveProjectToDB()` 完了後に `renderLibrary().catch(console.error)` を呼ぶよう修正 | app.js |
| 右パネル構造変更 | タブ行・#panel-library・#panel-diagram ラッパーを追加 | index.html |
| CSS追加 | タブ・ライブラリ一覧・削除ボタン・hidden制御 | components.css |

---

## 確定した設計原則

### [RESTORE AUTHORITY INVARIANT]

```
起動時復元の truth source は IndexedDB "projects" store。

restoreLastProjectOnStartup() は listProjects() の先頭レコードを復元する。
この先頭レコードは updatedAt DESC で並んだ最新保存プロジェクトである。

現行実装では loadProj() 末尾で autoSaveLocal() が必ず走るため、
「開いたプロジェクトは直後に updatedAt が更新される」。
そのため実運用上は「最後に開いたプロジェクト」に近い挙動になる。

ただし、厳密には復元基準は lastOpenedProjectId ではなく updatedAt 最大 である。
将来 loadProj() から autoSaveLocal() を外す／遅延化する／保存条件を変更する場合は、
この前提が崩れるため、復元方式を lastOpenedProjectId ベースに再設計すること。

[listProjects() 依存注意]
restoreLastProjectOnStartup() は listProjects() の返却順に依存する。
listProjects() のデフォルトソート（updatedAt DESC）を変更する場合は、
restoreLastProjectOnStartup() 側も同時に見直すこと。
```

### [LIBRARY DELETE INVARIANT]

```
現在開いているプロジェクト（project.id と一致するもの）は削除不可。

理由:
  削除した直後も画面上では開いたままになり、
  「表示中だが IndexedDB 上は存在しない」中間状態の
  ハンドリングが別途必要になるため。

UI実装:
  削除ボタンに disabled 属性を付与。
  クリックしても deleteProject / deleteAssets に進まない。
```

### [LIBRARY SYNC]

```
renderLibrary() は saveProjectToDB() の await 完了後に
fire-and-forget（.catch(console.error)）で呼ぶ。
保存完了後に発火するが、一覧描画の完了順序までは保証しない。
```

### [LIBRARY DELETE SCOPE]

```
削除時に消えるもの:
  ① projects store のレコード（deleteProject）
  ② assets store の audio/chord（deleteAssets）

削除されないもの:
  ③ analysis/{id}.json（server.py に削除 API がないため残置）

これは Phase73-C の現実装の記録であり、
analysis も削除対象に含めるかは後続フェーズで判断する。
```

### [LEGACY PROJECT IMPORT]

```
過去に「ファイル → 保存」した project.json は IndexedDB 未登録のため
ライブラリには自動表示されない。

「ファイル → 開く」で一度開くと:
  loadProj() 末尾の autoSaveLocal() → saveProjectToDB() が走り
  IndexedDB に登録される → 次回からライブラリに表示される。

実コード確認済み（app.js: loadProj() 末尾で autoSaveLocal() が必ず実行）。
未開封ファイルの一括登録は未実装（次フェーズ候補）。
```

---

## 右パネルのDOM構造（確定）

```
<aside id="panel-right">
  <div id="right-tabs">
    <button id="tab-library" class="right-tab active">LIBRARY</button>
    <button id="tab-diagram" class="right-tab">DIAGRAM</button>
  </div>

  <div id="panel-library">          ← 初期表示
    <div class="library-toolbar">
      <span class="library-toolbar-label">保存済みプロジェクト</span>
      <select id="library-sort">...</select>
    </div>
    <div class="library-list" id="library-list"><!-- JS生成 --></div>
  </div>

  <div id="panel-diagram" hidden>   ← 初期は非表示
    .phdr / #diag-search / #diag-panel / #diag-footer（既存・変更なし）
  </div>
</aside>
```

タブ状態は localStorage["cs.rightTab"] に永続化。初回起動時は "library"。

---

## localStorage キー一覧（Phase73-C 追加分）

| キー | 値 | 用途 |
|---|---|---|
| cs.rightTab | 'library' \| 'diagram' | 前回選択タブの記憶 |
| cs.librarySortBy | 'updatedAt' \| 'title' \| 'artist' | 前回ソート順の記憶 |

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| ライブラリ一覧に曲が表示される | ✅ |
| DIAGRAMタブでダイアグラムが正常に表示される | ✅ |
| LIBRARY ↔ DIAGRAM タブ切替が動く | ✅ |
| ソート切替（更新日時・タイトル・アーティスト順）で並び順が変わる | ✅ |
| ブラウザ再起動後に前回のタブが復元される | ✅ |
| 別の曲をクリックすると切り替わる | ✅ |
| 削除できる・現在開いている曲は disabled | ✅ |
| 起動時復元に正しい曲（updatedAt 最大）が出る | ✅ |

---

## current-issues.md 更新

- 今回 close した issue:
  - 「プロジェクトDBライブラリタブ追加」（完全完了）
  - 「autosave 復元経路の不整合（Phase73-B 残件）」（IndexedDB 経路に切替完了）

- 今回新規に積み残した issue:
  - **Legacy project import 導線**（状態: 未設計）
    過去に手動保存した project.json を一括でライブラリに登録する機能。
    「ファイル → 開く」で1件ずつ開けば自動登録される（実コード確認済み）が、
    未開封ファイルの一括登録は未実装。
    最小案: 複数 project.json を選択 → deserialize → saveProjectToDB()
    拡張案: 既存ID衝突時の扱いを決める（上書きしない・updatedAt比較など）

---

## 次フェーズ候補（有力）

### 候補A: ライブラリ安定化 / Legacy import

- 過去 project.json の一括登録
- 既存 ID 衝突時の扱い整理
- 「ファイル → 開く」時の自動登録UIフィードバック追加

### 候補B: 運用観察で出た Library UX 改善

- ライブラリ上での現在プロジェクト視認性改善
- 必要なら検索・絞り込みの先行実装

### 将来（Phase73-E 以降）

- アーティスト別グループ表示
- あ行・か行グループ表示（日本語50音順）
- 検索欄
- lastOpenedProjectId の独立管理（updatedAt への依存を解消）
- analysis ファイルの削除API追加（server.py 拡張）

※ 次フェーズの優先順位は運用観察を経てから確定する。
  Phase73-C 完了直後の時点では候補A・Bはいずれも有力であり、
  どちらを先にするかは使い勝手の実態を見て判断する。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
