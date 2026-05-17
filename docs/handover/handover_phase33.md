# 引き継ぎ: Phase33進行中

## 作業状態
- ブランチ: main
- 直前作業: Phase33-1完了（modals.js切り出し）

---

## 今回の完了内容

### Phase33-1: modals.js切り出し（time / repeat / copy）

#### 新設: `js/modals.js`
- `initModals({ openModal, closeModal, mkMBtn, toast, getAudioTime })` による依存注入パターン
- `openTimeModal({ idx, line, onConfirm, onDelete })`
- `openRepeatModal({ idx, line, onConfirm, onDelete })`
- `openCopyModal({ fromIdx, line, lines, onCopy })`

#### 設計原則（確立済み）
```
modals.js の責務
  └ UI lifecycle（open/close）
  └ interaction lifecycle（confirm/cancel）
  └ callback通知のみ

app.js の責務
  └ state mutation（project.lines の書き換え）
  └ refreshEditor()
  └ モーダル土台DOM（mOv/mTit/mBody/mBtns）の ownership
```

#### app.js の変更点
- `openModal({ title, body, onOpen, buttons })` ラッパー追加
- `initModals()` 呼び出し追加（DOMContentLoaded内）
- 旧3関数（openTimeModal / openRepeatModal / openCopyModal）削除
- `createEditorCallbacks()` 内の呼び出し側を callback渡し形式に書き換え

#### ドキュメント
- `project_instructions.md` に設計議論ルール追記
  （平易な説明・図解・ownership明示を必須とするルール）

---

## 次のステップ

### Phase33-2（次回）: diagram modal群の切り出し
- `openAddDiagramModal`
- `openEditDiagramModal`
- 同じ依存注入パターンで modals.js に追加

### Phase33-3（その後）: chord modal群（依存が重い・最後）
- `openAddChord`
- `openChordEdit`

---

## modals.js 依存注入パターン（重要・継続ルール）

```
【良い注入】目的限定のもの
  getAudioTime: () => aEl.currentTime  ← 単一責務・読み取り専用
  onConfirm: (value) => { ... }        ← callback通知

【悪い注入】広域stateの丸渡し
  getProject()   ← modal側が何でも触れる状態になる
  getUiState()   ← state mutation散乱の原因
```

---

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

1. **Phase33-2**: diagram modal群の切り出し（openAddDiagramModal / openEditDiagramModal）
2. **Phase33-3**: chord modal群の切り出し（openAddChord / openChordEdit）
3. **編集効率化・UI修正**: 編集体験の改善系（詳細は current-issues.md 参照）
4. **TAPボタン色設計**: ボタン体系統一・semantic color再設計（`#2b54af` 直指定の解消）
5. **components.css整理**: テーマ依存色の残存箇所をtheme.cssへ移管
6. **Phase13**: 右パネルにプロジェクトDBライブラリタブ追加（優先度低・後回し）
7. **Issue #27**: メタリックテーマ描画方式の見直し

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
