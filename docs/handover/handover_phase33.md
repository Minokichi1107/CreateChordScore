# 引き継ぎ: Phase33へ — ドキュメント整備完了

> 詳細設計は docs/architecture/ の各ドキュメントを参照。
> このファイルは「現行仕様の圧縮版」として機能する。

---

## 1. 作業状態

- ブランチ: main（Phase32・Issue #29マージ済み）
- 直前作業: ドキュメント整備（architecture.md / ui-rules.md / phase-status.md / current-issues.md）

### 新規作成ドキュメント
| ファイル | 配置 |
|---|---|
| architecture.md | docs/architecture/ |
| ui-rules.md | docs/architecture/ |
| phase-status.md | docs/ |
| current-issues.md | docs/ |

---

## 2. 現在の設計原則

詳細は `docs/architecture/architecture.md` / `docs/architecture/ui-rules.md` 参照。

### モジュール
- `app.js` がオーケストレーター。モジュール間の連携は app.js 経由を原則とする
- モジュール間の直接操作禁止
- `project.js` はデータ管理・シリアライズに限定（UI操作を含まない）
- `utils.js` / `helpers.js` は作らない

### CSS
- テーマ依存色は `theme.css` に集約。他ファイルへの色の記述禁止
- 色・背景・borderは原則CSS変数経由（`var(--surface-base)` 等）
- `components.css` に残存するテーマ依存色は順次 `theme.css` へ移管（未完了）

### 開発ルール
- 機能追加を依頼された場合、すぐに実装しない。仕様確認→提案→承認後に実装
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止。段階的変更のみ
- 改善提案は後出し禁止。設計段階でまとめて提示

---

## 3. 次フェーズ候補（バックログ優先順）

詳細は `docs/current-issues.md` 参照。

1. プロジェクトDBライブラリタブ追加（右パネル）
2. TAPボタン色設計（semantic color再設計・直指定解消）
3. components.css整理（テーマ依存色の theme.css への移管）
4. Issue #27 メタリックテーマ描画方式の見直し

---

## 4. 既知の危険領域

### app.js
- オーケストレーター役割を持つ。責務を増やす変更は慎重に
- 状態（project / uiState / audioState）はここに集中管理されている

### idb.js
- 最低構成（GC・schema migration・compression なし）
- asset種類追加: key形式 `${projectId}:${type}` に新typeを追加するだけ
- schema変更が必要な場合は `DB_VERSION` をインクリメントして `onupgradeneeded` を更新

### CSS theme layer
- `components.css` にテーマ依存色が残存（`.tov-chord-tag` 等）
- 移管作業中に他のスタイルを破壊しないよう段階的に進める

### chord lookup
- lookup経路は `findChord()` に統一済み。`CHORD_DB` 直参照は禁止
- `lookupChord()` は互換ラッパーとして残存

---

## 5. 未確定事項

- `components.css` テーマ依存色の完全移管後の構成
- IndexedDB の将来スキーマ（現在は最低構成）
- 右パネルDBライブラリの具体的なUI設計（Phase13着手時に仕様策定）

---

## 6. 現在の未解決設計課題

設計がまだ固まっていない領域。単なるTODOではなく、着手前に設計判断が必要。

### メタリックテーマ描画方式（Issue #27）
CSS + テクスチャのハイブリッド方式を検討中。
filter / backdrop-filter 依存削減の方向性は固まっているが実装方針未確定。
本格化したら `docs/theme-rendering-architecture.md` へ昇格。

### persistence ownership
IndexedDB（idb.js）と project.js の責務境界。
現状は idb.js がasset専用、project.js がJSONシリアライズ担当で分離されているが、
将来のDBライブラリ追加時に ownership が揺れる可能性がある。

### components.css完全分離
移管対象が散在しており、一括変更は破壊リスクが高い。
段階的移管の完了条件・終了判定が未確定。
