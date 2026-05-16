# 引き継ぎ: Phase33へ — Phase12・Issue #29完了

## 作業状態
- ブランチ: main（phase32・issue29-audio-restore マージ済み・削除済み）
- 直前作業: Phase12 + Issue #29 完了

---

## 今回の完了内容

### Phase12: 演奏モードヘッダーへのカポ番号表示
- `index.html`: `#perform-capo-display` を `#perform-title` の直後に追加
- `theme.css`: `--color-red: #ff7c7c` を全テーマに統一、`#perform-capo-display` スタイル追加
- `perform.js`: ノータッチ（ロジックは実装済みだったため）

### Issue #29: プロジェクトロード時のaudio/chord_source自動復元
- `js/idb.js` 新規作成（IndexedDB操作層）
  - DB名: `ChordScoreDB` / store: `assets`
  - key形式: `${projectId}:audio` / `${projectId}:chord`
  - value形式: `{ data: Blob|string, filename: string, updatedAt: number }`
  - 関数: `initDB` / `saveAsset` / `loadAsset` / `deleteAssets`
- `js/project.js`: `project.id`（UUID）を serialize/deserialize に追加
- `js/app.js`:
  - `project` 初期値・`resetProject()` に `crypto.randomUUID()` 追加
  - `loadProj()` に `project.id = newProject.id` 追加
  - audio/chord選択時に `saveAsset()` を呼ぶ保存トリガー追加
  - `loadProj()` 末尾に IndexedDB からの asset 復元処理を追加
  - `showReloadBanner()` は asset が見つからない場合のフォールバックとして残存

---

## CSS責務ルール（継続）

| ファイル | 責務 |
|---|---|
| base.css | reset / normalize / 非テーマ依存構造 |
| theme.css | テーマ差分のみ（color / background / shadow / border-color） |
| layout.css | 配置・構造（colorを含まない） |
| components.css | UI形状（shape / layout）。color/backgroundはtheme.cssへ |
| state.css | 汎用stateクラスのみ |
| perform.css | 演奏モード固有 |

---

## バックログ（Phase33以降の優先順）

1. **Phase13**: 右パネルにプロジェクトDBライブラリタブ追加
2. **TAPボタン色設計**: ボタン体系統一・semantic color再設計（`#2b54af` 直指定の解消）
3. **components.css整理**: テーマ依存色の残存箇所をtheme.cssへ移管
4. **Issue #27**: メタリックテーマ描画方式の見直し（Phase33〜35級）

---

## 重要な設計ルール（継続）

- 機能追加を依頼された場合、すぐに実装しない。仕様確認→提案→承認後に実装
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止。段階的変更のみ
- 改善提案は後出し禁止。設計段階でまとめて提示
- uiモジュール間の直接依存禁止（app.js経由）
- project.js は persistence layer に限定
- utils.js / helpers.js は作らない

## idb.js 設計上の注意（将来拡張時）
- 現状は最低構成（GC・schema migration・compression なし）
- asset種類を増やす場合は key形式 `${projectId}:${type}` に新typeを追加するだけ
- schema変更が必要な場合は `DB_VERSION` をインクリメントして `onupgradeneeded` を更新
