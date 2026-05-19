# フェーズ進行状況

> 最終更新: Phase35完了時点

---

## 完了フェーズ

### Phase0 — 環境・Git基盤
Git導入・GitHub連携・初期フォルダ整理

### Phase1〜2 — イベント構造整理
setupEventHandlers() への統合・UI操作系イベント集約（save / load / new / import）

### Phase3〜5 — モジュール分割
app.js を audio.js / editor.js / csvImporter.js / chords.js へ分割
方針: 「リファクタリング中はロジック変更禁止、移動のみ」

### Phase6〜9 — 状態管理・アーキテクチャ整備
resetProject() / Ctrl+S / Alt+N 実装
setupEventHandlers() 整備・アーキテクチャドキュメント化・コードクリーンアップ

### Phase10 — Artist・Meterフィールド追加（一部ロールバック）
フィールドの保存・ロード不具合多発のため Phase9 状態へロールバック

### Phase10〜11 — Performance Mode UI改善
- 小節線 `/` 表示対応（type:"sep" / chord:"/" 互換実装）
- 横並びレイアウト導入・compact-mode導入
- 表示行数・行間最適化
- drag/スクロール改善・repeat表示修正

### Phase12 — モジュール分離・TAP Mode改善
- perform.js / replace.js / tapmode.js を app.js から分離（app.js 約400行削減）
- フォントスケール機能追加（--perform-font-scale）
- ダイアグラム横向き化・SVGサイズ問題修正
- static/follow モード分離・スクロール競合制御
- TAP Mode: 選択UI改善（Ctrl+click / Shift+click / 一括操作）
- Git 歌詞ファイル履歴削除（git filter-repo）

### Phase13〜15 — CSS変数体系・semantic token設計
- CSS変数体系整理開始・semantic token設計導入
- theme.css 責務整理開始
- components.css からの責務分離着手
- modal UI共通化開始

### Phase16 — modal component化・CSS ownership確立
- modal role classes 導入（.modal-caption / .modal-section-label 等）
- repeat-stepper / copy-list / diagram-string-grid component化
- inline style整理・削減
- CSS ownershipルール確定（layout / spacing / typography / semantic color / component visual → CSS）

### Phase17 — base.css分離計画・theme設計原則確定
- inline style残存箇所の分類・保留理由整理
- base.css 分離計画策定
- theme.css 設計原則確定（Primitive層 / Semantic層 / Component層）
- Component層での直書き禁止方針確立

### Phase18 — 各種機能拡張・仕様整理
- 行挿入位置を「後ろ」に変更
- コード挿入位置指定UI追加（モーダル内 splice位置指定）
- コードパレット移調機能追加（session only・capo非連動）
- JSONタイムスタンプからコード自動登録（undo対応）
- コード名正規化仕様策定

### Phase19 — ダイアグラム編集・削除拡張
- custom diagram の編集・削除・Undo実装
- export / import 対応
- storage schema v2 migration（variant id導入）
- builtin / custom 責務分離（builtin=読み取り専用）
- loadCustomDiagrams: destructive rebuild 方式

### Phase20 — コード名正規化 lookup layer導入
- normalizeChordName(raw) 導入
- findChord() 導入（normalize → canonical lookup）
- builtin重複（CM7等）を Xmaj7 へ統一・削除
- A案採用（onザフライnormalize・storage migrationは後回し）

### Phase21〜24 — lookup canonical化・storage migration
- lookupChord() を findChord() の互換ラッパーへ変更
- normChord() 廃止
- storage migration v3
- import canonical化
- custom diagram追加バグ修正
- split view時の中央パネル縮小問題調査

### Phase25〜26 — CHORD_DB access layer整理
- CHORD_DB 直参照をゼロ化（app.js → mutation/lookup API → CHORD_DB）
- mutation API 導入（addCustomDiagram / removeCustomDiagram / updateCustomDiagram）
- external resource reconnect 問題顕在化（Issue #29の前身）

### Phase27 — canonical invariant修正
- custom diagram storage の canonical崩壊を修正
- write path 全経路に normalize 適用
- fingerprint dedup 導入
- メタリックテーマ描画方式問題顕在化（Issue #27）

### Phase28〜31 — CSS責務分離完成
- base / theme / layout / components / state / perform への完全分離
- semantic token整理・theme.css 大規模整理
- perform text token整理・theme architecture 安定化

### Phase32 — IndexedDB導入・演奏モード改善
- 演奏モードヘッダーへのカポ番号表示
- IndexedDB導入（idb.js）・audio/chord_source 自動復元（Issue #29）
- docs整備開始

### Phase33 — modals.js切り出し・dependency injection確立
- modals.js 新設（time / repeat / copy / diagram / chordEdit）
- dependency injection パターン確立（initModals）
- openChordEdit: onPreviewChord による抽象callback導入
- openAddChord: ライブ編集型のため app.js に意図的残留（将来 chordEntry.js 化を想定）

### Phase34 — diagLocked（右パネル固定）

#### Phase34-1a: state導入・hover抑止
- `diagLocked` / `diagLockedChord` / `currentDiagChord` 追加（独立let変数）
- `lockDiag` / `unlockDiag` / `canUpdateDiagFromHover` / `updateDiagRight` API追加
- `updateDiagRight` を右パネル更新の正式APIとして確立（app.js内でsetDiagRight直接呼び出しをゼロ化）
- hover guard 2箇所（renderPalette / createEditorCallbacks）

#### Phase34-2: 左パネル自動折りたたみ
- ブレークポイント: 960px未満でauto collapse
- 状態変数3つを導入（独立let変数）:
  - `leftCollapsedManual`: <<ボタン操作（localStorage永続）
  - `leftCollapsedAuto`: resize自動（runtime only）
  - `leftExpandedOverride`: narrow時の一時展開（runtime only）
- `applyLeftCollapsed()` API追加
- resizeイベントハンドラ追加
- manual状態はlocalStorage永続・auto状態は毎回viewport判定

#### Phase34-1b: UI・キー操作実装
- Lキー: diagLock toggle（INPUT/TEXTAREA・演奏モード中はguard）
- Escキー: modal close優先 → diagLock解除
- ヘッダービジュアル: `CHORD DIAGRAM 🔒`（amber色、visibility切替方式）
- `onChordHover` callback追加（editor.js）: setDiagRight + showPopup を一元管理・guard適用
- dblclick: 保留（click/modal競合による複合問題。hover overlay redesignと合わせて将来対応）
- `docs/keybindings.md` 新設（Lキー・Escキー含む全キーバインド管理台帳）

### Phase35 — Theme Layer Cleanup

#### 作業内容
- ui-rules.md に token階層ルール（§5〜§7）追記
- Primitive層にRGB値変数追加（`--color-green-rgb` 等）
- Semantic層に interaction state token追加（`--surface-selected` / `--surface-hover` / `--surface-playing` / `--border-selected` / `--border-focus`）
- Component alias層にTAP専用token追加（`--tap-surface-tapped` / `--tap-surface-current` / `--tap-btn-surface` / `--tap-chord-tag-*` 3個）
- `components.css` のテーマ依存直指定を role確認の上 token参照へ整理（`.mac-insert-btn.active` 系は意図的保留）
- `#2b54af`（blue theme TAP btn）を `--tap-btn-surface` として token 化

#### 性質
- UI変更なし・ロジック変更なし
- CSS ownership整理フェーズ
- silver含む全テーマでregression確認済み

---

## 現在地

- Phase35完了・mainブランチ
- theme token階層設計確立済み（Primitive / Semantic / Component alias）
- CSS責務分離完了・components.css のテーマ依存直指定を整理済み
- diagLocked・左パネル自動折りたたみ実装済み

---

## 次フェーズ候補

詳細は `current-issues.md` のバックログを参照。

優先度中：
- TAP閉じるボタン hover feedback（`--surface-hover` 適用）
- pause icon alignment

将来（設計議論が必要）：
- hover overlay interaction redesign（Phase36）
- openAddChord subsystem化（chordEntry.js）
- 行またぎコード移動
