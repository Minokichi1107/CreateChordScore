# フェーズ進行状況

> 最終更新: Phase44完了時点

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
- `updateDiagRight` を右パネル更新の正式APIとして確立
- hover guard 2箇所（renderPalette / createEditorCallbacks）

#### Phase34-2: 左パネル自動折りたたみ
- ブレークポイント: 960px未満でauto collapse
- 状態変数3つを導入（leftCollapsedManual / leftCollapsedAuto / leftExpandedOverride）
- `applyLeftCollapsed()` API追加
- manual状態はlocalStorage永続・auto状態は毎回viewport判定

#### Phase34-1b: UI・キー操作実装
- Lキー（→Phase39-2でShift+Lに変更）: diagLock toggle
- Escキー: modal close優先 → diagLock解除
- ヘッダービジュアル: `CHORD DIAGRAM 🔒`（amber色、visibility切替方式）
- `onChordHover` callback追加（editor.js）
- `docs/keybindings.md` 新設

### Phase35 — Theme Layer Cleanup
- ui-rules.md に token階層ルール（§5〜§7）追記
- Primitive層にRGB値変数追加
- Semantic層に interaction state token追加
- Component alias層にTAP専用token追加
- `components.css` のテーマ依存直指定を token参照へ整理
- UI変更なし・CSS ownership整理フェーズ

### Phase36 — Hover Overlay Interaction Redesign

#### Phase36-1: hover popup停止
- `onChordHover` から `showPopup` 呼び出しを削除
- hover → 右パネル更新のみに縮退（二重preview解消）
- `showPopup` / `hidePopup` callback・`mouseleave` ハンドラ削除
- popup DOM・CSS・関数本体は意図的保留（次フェーズで削除）

#### Phase36-2: click semantics再設計
- dblclick → longpress（400ms）に変更
- click即時実行に戻し modal open 遅延を解消
- `onChordDblClick` callback名は維持（app.js変更なし）

#### Phase36-3: diagLock解除 gesture追加
- 右パネル `.phdr` 長押し（400ms）→ `unlockDiag()`
- lock / unlock gesture の対称化
- mousedown時・timer発火時の二重チェックで ESC race condition 対策

#### Phase36-4: diag-toggle / diagOn 削除
- `diag-toggle` ボタン（index.html）削除
- `diagOn` state・復元処理・イベントハンドラ削除
- `editor.js` destructuring から `diagOn` 削除

### Phase37 — popup削除・TAP閉じるボタン hover feedback

#### Phase37-1: popup削除
- `showPopup` / `hidePopup` 関数本体削除（app.js）
- `popEl` / `popT` 変数削除（app.js）
- `#popup` DOM削除（index.html）
- popup関連CSS削除（layout.css）
- Phase36-1で「使わなくした」残り作業を完了

#### Phase37-2: TAP閉じるボタン hover feedback
- `#btn-tapmode-close:hover` を3テーマに追加（theme.css）
- darkテーマの `--surface-hover` を `.04` → `.08` に調整（視認性改善）
- セレクタ分離: `#tap-ov-tapbtn` と `#btn-tapmode-close` を独立ルールに

### Phase38 — 設計フェーズ（chordEntry / token stream / simile）

#### Phase38-1: chordEntry.js 責務境界・DI方針確定
- chordEntry subsystem の境界・DI シグネチャ設計
- preview layer 3層分離設計（hover / locked / modal transient）
- `forcePreviewChord` / `restoreDiagAfterTransientPreview` 命名確定

#### Phase38-2: 入力系UX統合設計
- keyboard editing model 確定（Enter/Escape/IME guard）
- simile token 設計（`{type:'simile', bars:1|2}`）
- `editorSimileStyle` / `performSimileStyle` 分離設計
- interaction hierarchy 再設計（primary=キーボード / secondary=cursor / tertiary=マウス）
- token shorthand 方針（`/`→barline、`ss`→sim. 等・将来）

#### Phase38-3: line mutation 拡張準備
- `moveChordAcrossLines` を app.js 内関数として確定（A案）
- `onChordKeyNav` callback 接続面設計

### Phase39-0 — token abstraction cleanup

#### 作業内容
- `tokens.js` 新設（musical token stream の domain-level utility）
  - `isChordToken` / `isSepToken` / `isSimileToken` / `tokenToText`
  - `isChordToken` はプロパティ存在判定（`'chord' in token`）
  - `isSepToken` は旧形式 `c.chord === '/'` 互換維持
- `modals.js` 修正（`c.chord` 直読み2箇所を `tokenToText` 経由に変更）
- `undefined` 表示バグ修正確認済み

#### 性質
- UI変更なし・ロジック変更なし
- token architecture migration の最初の実装
- `c.chord` 直読み禁止文化の起点

### Phase39-1 — chordEntry.js 切り出し

#### 作業内容
- `chordEntry.js` 新設（`openAddChord` の app.js からの切り出し）
- DI化（`initChordEntry`）・アクセサ渡しパターン確立
- `forcePreviewChord` をトップレベルに追加（preview layer API の起点）
- IME guard 追加（`e.isComposing`）
- `openAddChord` 内の transient preview を `forcePreviewChord` 経由に変更
  （`currentDiagChord` / `diagLockedChord` を書き換えない設計）
- app.js から約150行削減

#### 性質
- UI変更なし・ロジック変更なし（IME guardのみ新規挙動）
- 構造変更フェーズ

### Phase39-2 — unlock on open / isChordLikeInput / Shift+L

#### Phase39-2a: unlock on open
- AddChord modal open 時に `unlockDiag()` を呼ぶ（B案採用）
- A案（restore方式）は不採用：modal close時に突然元コードへ戻る体験が不自然
- `forcePreviewChord` は将来の preview layer 多層化向けに app.js トップレベルへ予約残置
- DI更新: `forcePreviewChord` を外し `unlockDiag` / `onPreviewChord` を追加

#### Phase39-2b: isChordLikeInput 導入
- IMEイベント制御（isComposing / compositionend）から domain validation へ設計転換
- `isChordLikeInput(v)` をモジュールスコープに新設
- `addChord` / `onPreviewChord` の両方で共通利用
- ♭（U+266D）/ ♯（U+266F）等の音楽記号は通過
- 日本語・A-G以外で始まる文字列は遮断
- 先頭のみ検証の暫定実装（末尾検証強化は current-issues.md へ積み残し）

#### Phase39-2c: Lキー → Shift+L
- 単独Lキーが lyric-input と常時衝突していたため Shift+L に変更
- INPUT/TEXTAREA ガードを削除（Shift+L はテキスト入力と干渉しない）
- 演奏モード中は引き続き無視

### Phase39-3 — editor.js / perform.js への tokenToText / isSepToken 適用

#### 作業内容
- `editor.js` に `import { isSepToken, tokenToText }` 追加
- sep判定を `isSepToken(c)` に統一（旧形式 `c.chord==='/'` 互換を吸収）
- chord表示を `tokenToText(c)` 経由に変更（DOM表示のみ）
- `perform.js` に同様の変更を適用
- lookup key (`c.chord`) と display (`tokenToText(c)`) の責務分離確立
- `const chordName = c.chord` / `const displayName = tokenToText(c)` で明示的に分離

#### 性質
- UI変更なし・ロジック変更なし
- rendering abstraction 適用フェーズ

### Phase39-4 — barline canonical 化

#### 作業内容
- `tokens.js`: `isSepToken()` に `type:'barline'` 条件追加
- `tokens.js`: ヘッダーコメントに canonical / legacy / deprecated の3層を明記
- `app.js` / `chordEntry.js`: 生成5箇所を `{ type:'barline' }` に変更
- `app.js` / `chordEntry.js`: 判定3箇所を `isSepToken()` に変更
- `app.js` に `import { isSepToken }` 追加、`chordEntry.js` に同追加
- storage migration は今回行わない（旧データは `isSepToken()` で透過的に扱う）

#### 性質
- UI変更なし・ロジック変更なし（保存データの canonical 形式が変わる）
- separator token の musical semantic 化
- Issue #26（Beat/Grid）への将来の移行パスを確保

### Phase39-5 — chordEntry subsystem 接続完成

#### 作業内容
- `app.js` に `import { initChordEntry, openAddChord }` 追加
- `app.js`: `forcePreviewChord()` をトップレベルに追加（現在未使用・preview layer 予約）
- `app.js`: 旧 `openAddChord` 本体を削除（約150行削減）
- `app.js`: `initChordEntry({...})` を `initModals` 直後に追加
- Phase39-1 の incomplete migration を修正・subsystem ownership 確定


### Phase40 — Chart Mode 設計フェーズ
- project.analysis.raw データ構造確定
- analysisLoader.js / timing.js / chartmode.js の設計確定
- TimingModel 動作モード（full / beat-only / fallback）設計
- GridViewModel onset-only 設計・collision resolution 設計

### Phase41 — Chart Mode 実装
- chordmini_fetch.py に beats / downbeats / meta 出力追加
- analysisLoader.js 新設（validate / sanitize / normalize）
- timing.js 新設（TimingModel・quantize・getMeasure）
- chartmode.js 新設（GridViewModel・renderChartMode・playback sync）
- project.js に analysis raw-only serialize 追加
- replacementMap.json 新設（140件の chord name 置換辞書）

### Phase42 — Analysis Persistence Redesign
- analysis を project.json から外部ファイル（analysis/{id}.json）に分離
- project.json には hasAnalysis フラグのみ保持
- degraded mode / analysis missing バナー実装
- 旧形式 migration（埋め込み analysis → 外部ファイル自動変換）
- server.py に analysis 保存 API 追加
- Issue #48（loadChordData regression）修正

### Phase42.5 — 環境整備・Git運用改善
- VSCode 検索除外設定・不要ファイル削除
- 個人データ .gitignore 追加
- app.js 未使用 import・重複リスナー削除
- バックアップバッチ・起動バッチ修正
- Git interactive rebase 運用確立

### Phase43 — Chart Mode カポ反映（Issue #48）
- analysis.raw = 実音 canonical / editor 表示 = フォーム音 の原則確立
- chartmode.js に getCapo / transposeChord 注入
- _renderChartGrid / _renderFallbackGrid に -capo projection 追加
- app.js の capo change イベントに Chart Mode 再描画追加
- display projection NOTE（per-renderer・将来統合予定）をコードに追記

### Phase44 — Token Semantic Stabilization
- Step1: undo / contamination audit・analysis.raw 保護確認・architecture.md §8 追記
- Step2: no_chord token semantic 化（{ type:'no_chord' }）・migration・バグ4件修正
- Step2.5: c.chord 直参照 audit・[LOOKUP-KEY] コメント統一
- Step3: tokens.js に TOKEN SEMANTIC 定義表・DISPLAY PROJECTION 非可逆性追記
- Step4: perform.js / editor.js に projection responsibility NOTE 追記
- hotfix: perform.js の isChordToken import 漏れ修正（Step3 動作確認時発覚）

### Phase45 — 行挿入ボタン上下両方向対応
- `onLineInsert` を `onLineInsertAbove` / `onLineInsertBelow` に分離
- [↑] 挿入 [↓] グループUI追加（`.la-insert-wrap` / `.la-insert-label`）
- 全行でdisabledなし・同一UI

### Phase46 — Project Metadata Schema Migration
- `project.title` → `project.artist` + `project.title` に分離
- `normalizeProject` / `createEmptyProject` / `buildProjectFilename` 新設
- `serializeProject` / `deserializeProject` / `resetProject` / `loadProj` 更新
- ヘッダーにアーティスト名入力欄追加
- 旧形式（title only）backward compatibility 保証

### Phase47 — Header Menu Consolidation & Input Layout Fix
- ヘッダーメニューを6→4に統合（ファイル・編集・表示・ツール）
- `btn-open-settings-theme` 命名規則確立（`btn-open-settings-*` パターン）
- `.header-left` / `.project-meta` flex修正
- blur時先頭表示（`scrollLeft = 0`）

### Phase48 — フロートメニュー位置改善
- `.line-acts` を `position:absolute` → `grid-column:1/-1` で行下展開に変更
- `z-index:10` 削除
- `:focus-within` 対応（キーボード操作中も展開）

### Phase49 — 表示メニュー有効化（左・右パネルトグル）
- 表示メニュー「◧ 左パネル」「◨ 右パネル」を有効化
- `rightHidden` 変数・`applyRightHidden()` / `updateViewMenuChecks()` 追加
- `Shift+{` / `Shift+}` キーボードショートカット追加（`e.key` 基準・JIS対応）
- `body.right-hidden` CSS追加（`grid-template-columns` 明示切替）
- `localStorage` 永続（`rightHidden` キー）
- `left-collapsed + right-hidden` 組み合わせ対応

### Phase49.5 — Chart Mode視認性向上
- `MEASURES_PER_ROW`: 4 → 3（1行3小節化・固定）
- Chart chordフォントを JetBrains Mono に変更（12px・letter-spacing: 0.02em）
- `nowrap` + `text-overflow: ellipsis`（折り返し防止・長コード省略）
- silverテーマ専用コントラスト補正（暗背景・白文字・小節番号半透明）

---

## 現在地

- Phase49完了・棚卸し済み（Phase45〜49.5）
- Phase45〜49.5 の主な成果:
  - 行挿入ボタン上下両方向対応（Phase45）
  - `project.artist` / `project.title` 分離・schema migration（Phase46）
  - ヘッダーメニュー統合（Phase47）
  - フロートメニュー位置改善（Phase48）
  - 表示メニュー左・右パネルトグル有効化（Phase49）
  - Chart Mode視認性向上（Phase49.5）

---

## 次フェーズ候補

詳細は `current-issues.md` のバックログを参照。

軽量UI改善系（比較的独立・実装しやすい）:
- 行またぎコード移動（token array boundary mutation）
- Chart Mode 小節数切り替え（3列/4列・表示メニュー連動）

Chart Mode 拡張系:
- Chart Mode 並列表示（設計フェーズが必要）
- Chart Mode に mini transport（audio controls）追加
- Chart Mode ビート単位フォーカス（playback engine 拡張）

将来（大規模設計フェーズが必要）:
- Issue #26: Beat/Grid 対応（bars[] 構造移行）
- keyboard-first chord entry（insertion model 再設計）
- capo projection 統合（destructive model → projection model 移行）
- app.js 分割（Issue #49）
