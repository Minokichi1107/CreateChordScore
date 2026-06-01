# 引き継ぎ: Phase33完了

## 作業状態
- ブランチ: main
- 直前作業: Phase33-3完了（openChordEdit切り出し・openAddChord保留）

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

---

### Phase33-2: diagram modal群の切り出し

#### modals.js への追加
- `openAddDiagramModal({ defaultChord })`
- `openEditDiagramModal({ chord, id, variant })`
- 内部helper: `buildDiagramForm()` / `updatePreview()`

#### 設計ポイント
- `chords.js` への直接依存を排除（app.js経由に統一）
- `getPreviewSvg({ frets, barre })` : SVG文字列を受け取るだけ（payload object化）
- `onAddDiagram` / `onUpdateDiagram` : app.js が mutation + refresh を担当
- preview更新はmodal内部で完結（local UI state）

#### initModals追加注入
```
getPreviewSvg:    ({ frets, barre }) => drawDiagram(frets, barre),
getCapo:          () => project.capo ?? 0,
generateId:       () => crypto.randomUUID(),
onAddDiagram:     (name, variant) => { ... },
onUpdateDiagram:  (chord, id, patch) => { ... },
getDiagCallbacks: () => getDiagCallbacks(),
```

#### 注意点（getDiagCallbacks内のonEdit）
- `findChord()` ではなく `getChordEntry()` + `.data.v` を使う

---

### Phase33-3: openChordEdit切り出し

#### modals.js への追加
- `openChordEdit({ chord, onConfirm, onDelete })`

#### initModals追加注入
```
onPreviewChord: (chord) => setDiagRight(chord, getCapo()),
```

#### 設計ポイント
- `onPreviewChord(chord)` : 抽象callbackで右パネルpreview更新を依頼
  - modals.js は「preview更新したい」とだけ通知する
  - `setDiagRight` / `getCapo` を modal側に持ち込まない
- input value の HTML直埋め回避: `el.value = chord` を `onOpen` 内でセット
- mutation（palette追加・chord書き換え・splice）は全て app.js 側 callback で担当

#### app.js の変更点
- `openChordEdit(idx, ci)` 関数を削除
- `createEditorCallbacks()` 内 `onChordEdit` を callback形式に書き換え
- `initModals({...})` に `onPreviewChord` を追加

---

### openAddChord — 意図的保留

**「切り出し失敗」ではなく「将来 subsystem 候補として意図的保留」**

分析の結果、`openAddChord` は軽量modalとは性質が根本的に異なることが判明した。

```
openAddChord の実態:
  - ライブ編集型（操作のたびに project.lines を直接書き換え）
  - キャンセルが存在しない（完了ボタンなしで即確定）
  - insertAt state管理
  - preview UI の再描画タイミング制御
  → 「フォームdialog」ではなく「mini chord editor」
```

modals.js への完全収納を試みると、将来こうなる：

```
modals.js
  ├ repeat modal      ← 軽量
  ├ copy modal        ← 軽量
  ├ diagram modal     ← 中量
  └ chord editor      ← 異物（性質が根本的に異なる）
```

将来の機能拡張（キー入力主体・他行転送・記号入力）まで見ると、
独立 subsystem として育てる方が自然。

**将来の方向性: `chordEntry.js` として独立**
```
chordEntry.js（将来）
  ├ openAddChord
  ├ insertAt state管理
  ├ preview rendering
  ├ keyboard handling
  ├ 他行コード転送
  └ live editing flow
```

現時点では `app.js` に残留。

---

## modals.js 依存注入パターン（重要・継続ルール）

```
【良い注入】目的限定のもの
  getAudioTime: () => aEl.currentTime   ← 単一責務・読み取り専用
  onPreviewChord: (chord) => { ... }    ← 抽象callback（内部実装を隠蔽）
  onConfirm: (value) => { ... }         ← callback通知

【悪い注入】広域stateの丸渡し
  getProject()   ← modal側が何でも触れる状態になる
  getUiState()   ← state mutation散乱の原因
  setDiagRight   ← 内部実装を直接渡している（抽象化できていない）
```

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

## バックログ（Phase34以降・責務別整理）

### 1. chord editor / line editing 系
将来的に `chordEntry.js` および `editor.js` 拡張と関係する。

- **openAddChord subsystem化**: `chordEntry.js` として独立（上記参照）
- **挿入ボタン上下両方向対応**: 現在の `insertAt` が片方向のみ。cursor的な insertion control へ
- **行またぎコード移動**: 先頭コード→前行末尾 / 末尾コード→次行先頭。
  通常画面（inline editing）側での実装が望ましい。
  `project.lines` 編集APIが必要。`openAddChord` subsystem化とセットで設計すること。
  ※ modal内の小機能として実装すると line mutation が modal subsystem に漏れるため注意。

### 2. responsive UI 系
- **左パネル自動折りたたみ**: ウィンドウ縮小時に自動collapse。
  現状の `leftCollapsed`（ユーザー意思）と自動collapse（responsive状態）を
  将来的に `manualCollapsed` / `autoCollapsed` として分離することを検討。
- **狭幅時フロートUI**: `+コード` `+/` 等のフロートが狭幅時に編集を阻害。
  focus行以外の位置（行外ガター等）への移動を検討。

### 3. diagram interaction 系
- **ダイアグラム固定操作**: 現状はhover ownership のみ。
  ダブルクリック等で右パネルに固定する `diagLocked` 状態を導入。
  hover preview と locked preview を状態として分離する設計が必要。
  `uiState` に `diagLocked: false` を追加する方向。

### 4. import normalization 系
- **非正規コード置換**: chordminiからのJSONインポート時の非正規コード名を解読・置換。
  canonical chord / alias resolution の延長線上にある。
  import normalization pipeline として設計。

### 5. 既存バックログ（継続）
- **TAPボタン色設計**: ボタン体系統一・semantic color再設計（`#2b54af` 直指定の解消）
- **components.css整理**: テーマ依存色の残存箇所をtheme.cssへ移管
- **プロジェクトDBライブラリタブ**: 右パネルへの追加（優先度低）
- **Issue #27**: メタリックテーマ描画方式の見直し

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
