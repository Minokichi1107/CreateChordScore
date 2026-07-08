# フェーズ進行状況

> 最終更新: Phase74-E完了時点

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

### Phase50 — Chart Mode mini transport 追加
- `_buildTransport()` / `_setupTransportEvents()` / `_updateTransport()` 追加
- playback authority を `updateChartPlayback()` に集約（aEl listener を transport に持たせない）
- seek 競合防止パターン確立（`_isSeeking` フラグ + 4点解除）
- speed slider の双方向同期（chart↔main）
- blue テーマ文字色補正・silver テーマ active highlight 修正
- theme.css の `:root` ブロック構造バグ修正（変数・セレクター混入問題）

### Phase51 — Chart Mode CSS局所整理
- `CHART MODE OVERRIDES` セクション新設（theme.css）
- silver 特例を silverブロック内から Chart Mode セクションへ移動
- semantic variable layer と component override layer を物理的に分離
- 変更なし（relocation + コメント整理のみ）

### Phase52 — transient preview restore 実装
- modal close 後、diagLocked 状態の右パネル表示を復元する処理を実装
- 退避 → commit / rollback パターンを確立
- 適用条件: `locked === true && chord !== null` の場合のみ restore
- confirm操作（コード追加・バーライン追加）はすべて commit 扱い
- Phase39-2 の「open時にunlockする」方針は維持

### Phase53 — insertion cursor navigation in AddChord modal
- `mkInsertBtn` → `mkCursorSlot`（`+` ボタンを `|` カーソルスロットに置き換え）
- `navigateInsertCursor()` 追加（同行内 + 行またぎ ArrowLeft/ArrowRight **カーソル移動**）
- insertAt = editor cursor semantic として確立（click=直接配置・Arrow=navigation・Enter=commit）
- `.insert-cursor-wrap` / `.insert-cursor` CSS（点滅・hover薄表示）
- modal subsystem boundary 維持（token mutation は editor core 層として分離）
- ※ 行またぎ**コード移動**（`moveChordAcrossLines`）は未実装・将来フェーズへ分離

### Phase54 — Chart Mode 3列/4列切替 + measure-based chord projection
- `renderChartMode({ measuresPerRow })` 引数注入方式（renderer が persistence を持たない）
- `openChartMode()` を transition のみに分離（render authority を app.js へ）
- **chord name を measure 基準の absolute 配置へ変更**（slot-scoped → measure-scoped）
  - before: chord name が slot width に拘束（4拍子8スロット → 1/8 セル幅）
  - after: `.chart-measure` 基準の `position: absolute` で小節幅いっぱいに展開
- `COMPACT_CHORD_LENGTH = 8` 定数化・compact 表示導入（行高維持）
- ホバーツールチップ（body直下JS生成・overflow:hidden を突き抜け）
- `chart-slot--onset` 削除（analysis semantic を performance UI から除去）
- `chartMeasuresPerRow` localStorage 永続・3列/4列切替ボタン追加

### Phase55 — capo lifecycle 修正 + AddChord UI改善 + Chart コード重なり修正
- capo reset lifecycle invariant 確立（restore → reset → ingest の順序保証）
- `loadChordData()` 冒頭で `_prevCapo` 分を逆算して canonical に戻す処理を追加
- AddChord モーダルの ✕ ボタンを hover-only 表示に変更
- Chart Mode 1小節内複数コードの重なりを slotIndex 比率配置で解消

### Phase56 — Chart Mode beat cursor + capo info theme token
- `getBeatPosition(t)` を timing.js に追加（0.0〜1.0 の小節内拍位置）
- Chart Mode に playhead（beat cursor）追加（measure直下 continuous overlay）
- `--chart-beat-cursor` / `--capo-info-color` CSS変数を3テーマに追加
- `showCapoInfo()` を `--capo-info-color` token 経由に変更

### Phase57 — Chart Mode slot-semantic renderer
- `expandToSlots()` 新設（onset | carry | empty discriminated union）
- slot DOM invariant 復活（全 slot DOM を常に生成）
- `--duration-slots` CSS変数で chord label の visual expansion を制御
- `grid-column: span` を廃止（Grid折り返し問題の根本解決）
- `_beatCursorEl` → `_playheadEl` 改名
- `expandCarryForward()` deprecated化

### Phase58 — capo lifecycle stabilization + Chart header capo info
- `loadChordData()` に `isRestore` フラグ追加（IndexedDB restore経路での capo reset 副作用排除）
- Chart header に `Capo N → Concert: X` 表示を追加（`_renderChartHeader()` 拡張）
- `project.capo` が正式 schema field であることを確認（normalizeProject）
- initModals の `getCapo` authority 不整合を記録（将来の projection migration 前に統一必須）

### Phase59 — timing diagnostics and normalization pipeline
- `analyzeTiming()` 追加（drift 診断・failure taxonomy。副作用なし・常に実行）
- `repairDownbeats()` 追加（continuity-aware repair。experimental・default OFF）
- `buildNormalizedTimingAnalysis()` 追加（全 consumer の入口。pure function）
- `buildGridViewModel()` を normalized timing pipeline 経由に変更
- `window.__TIMING_DEBUG__` を常に書き込み（DevTools 診断用）
- measure DOM に `data-confidence` / `data-repair-state` 属性追加
- Issue #45「小節頭ズレ」の failure taxonomy 確立（Type A/B/C/D の分類）

### Phase60 — Chart Mode click seek
- `_seekTo` コールバック注入（app.js が aEl.currentTime を設定・playback authority 維持）
- `_setupGridClickSeek()` 追加（chart-grid への click event delegation）
- seek authority 確立: createTimingModel() が生成した normalized measure model の startTime のみを参照（raw downbeats 禁止）
- seekTo = transport mutation boundary（chartmode.js は transport state を持たない）
- click target を `.chart-measure` 全域に固定（内部DOM構造変更耐性）
- `_gridClickSeekBound` フラグでリスナー重複防止
- NaN ガード（degraded / partial analysis 対策）
- `.chart-measure { cursor: pointer; }` 追加（Chart Mode CSS セクション）

### Phase60.5 — File picker folder memory
- `PICKER_IDS` 定数を project.js に export（用途別 picker id の一元管理）
- 音声・コード・プロジェクト読み込みを `showOpenFilePicker` に移行
- `showSaveFilePicker` に `id: PICKER_IDS.projectSave` 追加
- 用途別フォルダ記憶（audio / chord / projectOpen / projectSave を分離）
- `AbortError` ガード（キャンセル時の console error 防止）
- FSA API 非対応ブラウザへの `<input type="file">` フォールバック
- ※ Phase64 で実コード適用（Phase60.5はhandover記録のみで適用漏れがあった）

### Phase61 — pickup measure numbering correction
- `detectPickupMeasure()` 追加（2条件AND判定・median 基準・available range 全件）
- `getDisplayMeasureNumber()` 追加（measure identity と display numbering semantics の分離）
- pickup 判定: 小節0 → "0"、以降 1, 2, 3 ...（通常は 1, 2, 3 ...）
- 旧スキーマ互換ガード（endTime 欠損時は pickup 判定スキップ）
- timing.js / app.js / CSS 変更なし
- hotfix: 旧project で Chart Mode が開かないバグ修正（endTime 欠損による NaN）
- ※ endTime 未付与の根本原因は Phase64 で修正

### Phase62 — project identity semantics + 新規プロジェクトとして保存
- project identity semantics を確立（保存 / 別名保存 / 新規プロジェクトとして保存の UUID lifecycle 定義）
- ファイルメニューに「🆕 新規プロジェクトとして保存」追加（新UUID発行・lineage 分岐）
- fix: 同一アーティストの複数曲で project.id が重複する問題（IndexedDB asset 混在）
- filename ≠ project identity の原則確立

### Phase63 — playback UX stabilization + restore lifecycle fix
- capo restore バグ修正: `isRestore` フラグを IndexedDB chord 復元経路へ適用（※ Phase64で実コード確定）
- rAF playback loop 導入: `_startRafLoop()` / `_stopRafLoop()` / `_rafLoop()` を chartmode.js に追加
- timeupdate → updateChartPlayback 削除（rAF が visual update authority に）
- pause / seeked / ended 単発更新追加（最終位置の正確な反映）
- playback authority 3層分離確立（audio engine / notification / visual update）
- hotfix: initChartMode への seekTo 注入漏れ修正（Phase60からの既存バグ）

### Phase64 — timing model rehydration redesign（保存データ復元の再設計）
- **4層 architecture contract 確立**:
  - Layer 1: Persistence Domain（analysis.raw = 唯一の永続化 canonical source）
  - Layer 2: Runtime Cache（project.analysis.normalized = 永続化禁止・serialize禁止）
  - Layer 3: Chart Mode Runtime Domain（chartmode.js ownership）
  - Layer 4: UI Projection（capo依存はここだけ）
- `loadAnalysis()` 戻り値に `raw` と `normalized` を追加
- `buildNormalizedTimingAnalysis()` を chartmode.js → analysisLoader.js へ移動（rebuild 責務の集約）
- `buildGridViewModel()` 引数を analysis 全体に統一
- `endTime` を measures[] 初期化時に付与（Phase61 hotfix の根本原因を修正）
- restore ordering contract を loadProj() にコメントで明示（①〜⑥ invariant）
- Phase63の `isRestore` フラグを実コードへ適用（3箇所の適用漏れを修正）
- Phase60.5 の `showOpenFilePicker` 移行を実コードへ適用（audio/chord/project open の3経路）
- audio MIME タイプ修正（`'audio/*'` → 個別 MIME タイプ・Chrome 要件対応）
- **教訓**: 「handover に書いてある」と「実コードに反映済み」は別問題。実コード audit が必要。

### Phase65 — restore-aware asset authority normalization
- `assetState {audioLoaded, chordLoaded, restoreSettled}` を導入（asset loaded状態の唯一のauthority）
- `setAudioLoaded()` / `setChordLoaded()` / `_evaluateBannerState()` を確立
- `checkReloadBannerDone()`（DOM-as-authority）を削除
- `loadChordData` を ingest 専用化（asset authority確立は呼び出し側の責務）
- `restoreSettled` guard で restore transaction 中の banner flicker を防止
- autosave restore eligibility 修正（`lines=[]` の metadata-only project も復元対象に）
- Phase65で設計・差分確定、Phase66で実コードへ統合適用

### Phase66 — debug observability consolidation
- Phase65 の変更を実コードへ適用
- TEMP REPAIR ブロック（`__CS_TRANSPOSE__` 等）を削除
- `window.__CS_DEBUG__` を導入（getter projectionパターン：timing / project / chart / perf / dumpInvariants）
- `window.__TIMING_DEBUG__` を削除（`__CS_DEBUG__.timing` getterに統合）
- テスト運用ルール確立（通常テスト と fault injection test の分離）
- 差分適用ルール確立（関数単位置換・`node --check`・`git diff`必須）

### Phase67 — Chart Mode hover chord diagram
- Chart Mode のコード名hoverで小型ダイアグラムをtooltip表示
- single tooltip instance（body直下・lifecycle-bound）
- ephemeral UI設計（chartStateにtooltip authorityを持たせない）
- scrollWidth guardでcarry-forward領域の誤hoverを抑制
- 表示メニューにON/OFF追加・`Shift+D`ショートカット・localStorage永続

### Phase68 — Chart Mode pickup-aware visual projection
- **canonical timing space ≠ visual projection space** の分離を確立
- `projectPickupSlotIndex()` を単一変換源として導入
- `data-slot-index` → `data-visual-slot-index` にrename
- `projectionEmpty` slot type追加（timing authorityを持たない休符表示）
- `chartState.pickupLeadingOffset` をprojection authorityとして集約
- scope: `mode==='full'` のみ（`beat-only`は別issue）
- synthetic test（FORCE_PICKUP_DEBUG）で動作確認済み・実曲pickup検証は保留

### Phase69 — Chart slot active highlight stabilization
- `.chart-slot--active` CSS追加（outline主体・低alpha・3テーマ共通）
- Phase68 projection layerのboundary audit（JS変更なし）
- `projectionEmpty` exclusionがDOM invariantで構造的に保証されていることを確認
- 「slot-level projection-aware playback highlighting」の確立

---

## 現在地

- Phase74-E完了
- Project DB機能は一通り完成（IndexedDB Repository・Library UI・Restore Authority）
- Analysis Editorは基盤完成（表示・選択・Undo/Redo・境界編集）
- 次フェーズでは単一コード編集機能（追加・削除・コード名編集）に着手予定

---

## Phase70〜74の主な成果

- **Phase70: Chart Mode安定化**
  デバッグ基盤強化（`__CS_DEBUG__.perf` projection化）・Chart Mode speed同期修正
- **Phase71: Playback Authority整理**
  speed authority統一（演奏モードのbypass解消）・reset trigger追加（4UI統一）
- **Phase72: Timing Correction基盤**
  Correction Authority設計・repairRule実装（`anchorDownbeat`方式による小節頭の手動補正）
- **Phase73: Project DB**
  IndexedDB Project Repository・Library UI・Restore Authority分離
  （`lastOpenedProjectId`）・Legacy Project Import
- **Phase74: Analysis Editor基盤**
  解析編集UI（buffer/history/選択状態）・Undo/Redo・
  個別コード境界移動（`moveBoundary()`）・キー競合修正

---

## Phase65〜69の主な成果（参考）

- asset loaded状態のauthority確立（assetState・Phase65で設計/Phase66で実適用）
- `window.__CS_DEBUG__` によるruntime observability layer確立（Phase66）
- Chart Mode hover chord diagram（ephemeral UI）（Phase67）
- **canonical timing space ≠ visual projection space の分離確立**（Phase68）
- projection layer boundary validation・slot active highlighting（Phase69）

---

## Phase60〜64の主な成果（参考）

- Chart Mode click seek 実装（normalized measure model の startTime authority）（Phase60）
- 用途別ファイルピッカーフォルダ記憶（PICKER_IDS）（Phase60.5）
- Chart Mode pickup measure 番号補正（detectPickupMeasure / getDisplayMeasureNumber）（Phase61）
- project identity semantics 確立・新規プロジェクトとして保存（Phase62）
- rAF playback loop 導入・playback authority 3層分離（Phase63）
- **4層 architecture contract 確立**（Persistence / Runtime Cache / Chart Runtime / UI Projection）（Phase64）
- handover記録と実コードの乖離を複数発見・修正（Phase64の重要な成果）

---

## 次フェーズ候補

詳細は `current-issues.md` のバックログを参照。

### 最優先：Analysis Editor（解析編集エディタ）の完成

Phase74（C〜E）でChart Mode解析編集の基盤（表示・選択・Undo/Redo・
個別境界移動）が完成した。区切りは `selection.chordIds` が単数か複数か。

```
単一コード編集（次フェーズ）:
  コード追加 / 削除 / コード名編集 / 境界調整の仕上げ / 削除後の自動選択

複数コード編集（その次）:
  範囲選択 / Copy・Cut・Paste / 複数削除 / 分割・結合
  （selection.chordIdsが配列である設計はこのフェーズの複数選択を見据えたもの）

Analysis Editor完成後: ドキュメント整理フェーズ
  README / architecture.md / current-issues.md / phase-status.md を
  「Analysis Editor」完成形として一括更新

（必要なら）その後: UXブラッシュアップ
  操作感・アイコン・配置・ショートカット・細かなバグ修正
```

フェーズ番号（75/76等）はここでは固定しない。作業の粒度によって
75A/75B等に分裂する可能性があるため、区切りの名前（単一コード編集 /
複数コード編集）で管理する。

### その他継続（Phase69以前からの積み残し）

- 実曲pickup検証（コスト低・Phase68/69の最終確認。projection-empty + slot--activeの組み合わせを実際のpickup曲で確認）
- `__CS_DEBUG__` perf instrumentation（パフォーマンス計測基盤・Phase66-B・継続。chartmode.jsに `_perfState` を持たせ getter projection化。beat cursorが一瞬停止する現象の調査前提）
- Chart Mode並列表示（設計フェーズが必要。projection layer boundaryに新しいsubsystem boundaryを追加するため、着手前に設計フェーズ必須）
- mode==='beat-only'でのpickup対応（別issue・将来）
- beat cursorの一瞬停止・数ビートジャンプ（Phase65で観察・原因未特定）

Issue #45 継続対応:
- Type A/C: A案（手動修正UI）設計フェーズ（大規模）
- Type D: 発生ケース収集後に B案（repairDownbeats）の有効性検証

将来（大規模設計フェーズが必要）:
- timing model rehydration schema contract（保存データ復元の仕組み・schema versioning / migration層）
- moveChordAcrossLines（Chart 関連作業後に実装予定）
- Issue #26: Beat/Grid 対応（bars[] 構造移行）
- keyboard-first chord entry（キーボード操作優先のコード入力・insertion model 再設計）
- capo projection 統合（destructive model → projection model 移行）
- app.js 分割（Issue #49）
