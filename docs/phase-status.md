# フェーズ進行状況

> 最終更新: Phase103完了時点（Phase99〜103を反映）

---

## 1. Current Status（現在地）

```
Completed（完了済み）
---------------------
✓ Project Repository（IndexedDB・Library UI・Restore Authority）
✓ Chart Mode（Timing Pipeline・Pickup Projection・Playback Authority・
  Collision Indicator）
✓ Analysis Editor（単一編集・複数編集・Position Editing・Decorator Layer・
  Search Engine・Chord Projection API・Representation Translation Layer・
  セッション層（Session Layer）／コマンド層（Command Layer）分離）
✓ ドキュメント棚卸し + 再構成（Phase81）
✓ UI視認性・記号衝突修正（Phase85）
✓ CSS Ownership Split（Phase86・components.cssをモジュール所有権別6ファイルへ分離）
✓ Analysis Editor セッション層／コマンド層（Session Layer / Command Layer）抽出（Phase86-2〜89・app.js肥大化対応）
✓ Search Navigation Session層抽出（Phase90）
✓ Chart Mode Collision Indicator P1 v1（Phase91調査・Phase92実装）
✓ Analysis Editor Evolution（Phase93〜97）:
  Boundary Handle Drag Editing → Playback-aware Editing UX →
  Chart Modeクリックの選択+シーク一般化 → Boundary Handle Hover +
  Direct Drag → Decorator Inventory整理・Visual Hierarchy確立 →
  Selection Hit-Test統一・Search Enharmonic対応（詳細は「3. Phase
  Timeline」参照）
✓ Section Architecture Design（Phase98・Design Freeze。実装はPhase99以降）
✓ current-issues軽量課題2件解消（Phase99・ライブラリ順序退行／音声停止問題）
✓ Section Session Layer（Phase100-A・非永続・Command API・Validation・Lazy Reconcile）
✓ Section Editor MVP（Phase101-1〜3・Section Bar・作成・Rename・Delete。
  Preview/選択状態/Undo統合/永続化は当時未実装）
✓ Section Preview Decorator（Phase102・selectionとは独立したChart Mode上のハイライト）
✓ Section Preview 視覚言語の独立化（Phase102-B・[DECORATOR LEGIBILITY PRINCIPLE]採用）
✓ Section永続化（Phase103・analysis.raw.sections。Section機能が
  Specification→Session→UI→Preview→Persistenceまで一巡し実用レベルに到達）

Current Work（現在の作業: なし・次フェーズ候補は「3. Future Candidates」参照）
------------------------------------------------------------
Phase99〜103が完了し、5フェーズ棚卸し（本更新）を実施済み。
次の主候補はP1 Section History Integration（Future Candidates参照）。
```

---

## 2. Major Milestones（機能別マイルストーン）

「この機能はどのPhaseで成熟したか」を機能軸で把握するための一覧。
各Phaseの実装詳細は「3. Phase Timeline」または `docs/handover/archive/` を参照。

### Chart Mode

| Phase | 内容 |
|---|---|
| 41 | 初版実装（analysisLoader.js/timing.js/chartmode.js新設） |
| 43 | カポ display projection model確立 |
| 54 | measure-based chord projection |
| 57 | slot-semantic renderer（onset/carry/empty discriminated union） |
| 59 | timing diagnostics and normalization pipeline確立 |
| 63 | playback authority 3層分離（rAF loop導入） |
| 64 | 4層 architecture contract 確立（Persistence/Runtime Cache/Chart Runtime/UI Projection） |
| 68〜69 | pickup-aware visual projection（canonical ≠ visual space分離） |
| 91〜92 | Collision Indicator（同一量子化スロット衝突（quantized slot collision）の可視化・P1 v1・normal path限定） |
| 93 | Boundary Handle Drag Editing（クリック＋矢印キーに加え、ドラッグでの境界移動を追加） |
| 95-A1 | 通常クリック全体への「選択+シーク」一般化 |
| 95-A2 | Boundary Handle Hover + Direct Drag（selection非依存の境界編集） |
| 96〜97 | Decorator Inventory棚卸し・Visual Hierarchy確立／Selection Hit-Test統一／Search Engine Enharmonic対応 |

### Project Repository / Persistence

| Phase | 内容 |
|---|---|
| 32 | IndexedDB導入（idb.js新設） |
| 42 | Analysis Persistence Redesign（analysis外部ファイル分離） |
| 62 | project identity semantics確立（UUID lifecycle） |
| 65〜66 | assetState導入・debug observability layer確立 |
| 73 | Project DB完成（IndexedDB Project Repository・Library UI） |

### Analysis Editor

| Phase | 内容 |
|---|---|
| 74 | 編集基盤（buffer/history/選択状態・Undo/Redo・境界移動） |
| 75 | 単一コード編集（追加・変更・削除） |
| 76 | 複数コード編集（範囲選択・Copy/Cut/Paste/Merge） |
| 77 | Position Editing導入（editPoint・Add Here） |
| 78 | Footer UI刷新（deriveEditorMode・4 Groups構成） |
| 79 | Decorator Layer完成（Selection Highlight・Boundary Handle・EditPoint Marker） |
| 80 | Search Engine（検索・置換） |
| 82 | Chord Projection API確立（`toDisplayChord()`/`toCanonicalChord()`・Capo Projection Boundary） |
| 83 | Chart Mode編集UX改善（Enter⇔Rename分岐）・検索IME正規化・検索case-sensitive化 |
| 84 | Representation Translation Layer確立（`toReadableChord()`/`fromReadableChord()`・ChordMini生表記の吸収） |
| 86-2 | Session Authority抽出（analysisSession.js新設）・Ctrl/Cmd+クリックeditPoint確定・AddChord Enterバグ修正 |
| 87 | コマンド層（Command Layer）抽出（analysisCommands.js新設・copy/cut/delete/paste/merge） |
| 88 | コマンド層（Command Layer）拡張（updateChord/splitChord/moveBoundary） |
| 89 | Add Chord Transaction統合（addChordCommand・Issue #46解消） |
| 90 | Search Navigation Session層抽出（activateSearchIndex） |
| 94 | Playback-aware Editing UX（B4 Scroll Recovery・C1 Selection Measure Span）・Header Visual Language整理（Green=編集ワークフロー系／Amber=編集補助系） |
| 98 | Section Specification（仕様固定・Design Freeze。データモデル・Authority Scope・ライフサイクル確定。実装なし） |
| 100-A | Section Session Layer（非永続・Validation・Reconcile・Command API。History非対応は意図的） |
| 101-1〜3 | Section Editor MVP（Section Bar・作成ダイアログ・Rename/Delete管理メニュー） |
| 102 | Section Preview Decorator（selectionとは独立したChart Mode上のハイライト） |
| 102-B | Section Preview視覚言語の独立化（[DECORATOR LEGIBILITY PRINCIPLE]採用） |
| 103 | Section永続化（analysis.raw.sections）。実機検証でdirty・Section Preview残留の2バグを発見・修正 |

### 基盤・アーキテクチャ整理

| Phase | 内容 |
|---|---|
| 0〜9 | Git基盤・モジュール分割・状態管理整備 |
| 13〜17 | CSS変数体系・semantic token設計・theme設計原則確定 |
| 20〜27 | コード名正規化・CHORD_DB access layer整理 |
| 28〜31 | CSS責務分離完成 |
| 39 | token stream設計・chordEntry.js切り出し |
| 44 | Token Semantic Stabilization |
| 81 | ドキュメント棚卸し + 再構成（README/architecture/phase-status/current-issues全面整理） |
| 85 | UI視認性・記号衝突修正（Blue theme fret色・Repeat badge記号衝突解消） |
| 86 | **CSS Ownership Split**（components.cssをchart/analysis-editor/library/chord-entry/modal/tapmodeの6ファイルへ分離。分割基準は「DOMを生成するモジュールの所有権」。architecture.md §3参照） |
| 91 | Chart Mode Rendering collision semanticsの確定（調査フェーズ・修正コミットなし。resolveCollision()のタイブレーク（tie-break）規則を実測で確定） |
| 92 | **Chart Mode Collision Indicator（P1 v1）**（同一quantized slot衝突をhiddenCount/Amberドットで可視化。Rendering-only・normal-path-only。architecture.md §9.5参照） |
| 96〜97 | **Decorator Design Principles確立**（[ONE INTENT, ONE PRIMARY DECORATOR]・[VISUAL HIERARCHY]・[THEME LAYER RESPONSIBILITY]。Chart Mode上の全Decoratorを棚卸しし、Intent（伝えたい意味）軸で整理。architecture.md §12参照） |
| 98 | Section Subsystem仕様固定（データモデル・Authority Scope・境界コード増減ルール・ライフサイクル。詳細はsection-model.md参照） |
| 100-A | Section Session Layer（reconcile()による整合性維持。[SECTION SESSION CONSISTENCY INVARIANT]確立） |
| 102-B | **[DECORATOR LEGIBILITY PRINCIPLE]採用**（編集ツールとしての視認性をテーマとの調和より優先。architecture.md §12参照） |
| 103 | **[PERSISTENCE OWNERSHIP PRINCIPLE]・[EDITOR RESET AUTHORITY]明文化**（ownershipと保存場所の分離／Analysis Editor限定stateの一元リセット。architecture.md §12参照） |

---

## 3. Future Candidates（次フェーズ候補）

詳細は `current-issues.md` のバックログを参照。

### Section Subsystem Progress（Phase100-Aより継続・優先度付き）

```
S. Specification            — Phase98完了
A. Session Layer            — Phase100-A完了
B. Editor UI（作成/Rename/Delete） — Phase101-1〜3完了
   Preview Decorator        — Phase102・102-B完了
   Persistence              — Phase103完了

P1  Section History Integration（Section Undo/Redo対応）
    Section系Command（create/rename/updateBoundary/delete）はUndo非対応の
    まま（[SECTION HISTORY INTEGRATION]）。History機構がbuffer専用の
    snapshotであるため、SectionをHistoryへ含めるには機構自体の拡張が必要。
    Section機能がSpecification→Session→UI→Preview→Persistenceまで
    一巡した現在、最後の主要な未完了事項（Phase103 handover参照）

P2  Boundary reassignment
    境界コード削除時、隣接コードへの自動付け替え（section-model.md §4.3
    ケースB）は未実装。現在reconcile()は常にSection自体を削除する
    （ケースC相当）のみ

P3  Section Selection State
    selectedSectionId等。History Integration（P1）と合わせて設計する方針

P4  チップ本体クリック時の挙動拡張
    現状はPreview表示/解除のトグルのみ
```

### Future Features（新機能・優先順位未定）

```
・実音（canonical）そのものでの検索モード（Phase97発見）
  現在の検索欄は「画面表示名（capo適用後）」で検索する設計。
  実音そのものを直接入力して検索したいニーズがあれば、検索モード
  切替UIを将来検討する（current-issues.md参照）

・Correction Badgeの開発者情報トグル化（Phase96 Decorator Inventory
  整理で再確認）
  小節補正バッジは解析アルゴリズム調整時のみ有用。デフォルト非表示化を
  将来検討する

・Selectionの水玉テクスチャ（Phase96で試作→撤回）
  小節またぎの継ぎ目・テーマ依存色・z-index重なり順の3問題が同時に
  発生し撤回。再挑戦する場合はcarryセルを跨る継ぎ目問題の根本解決から
  着手すること（current-issues.md参照）
```

### Technical Debt（技術的負債・既存挙動の見直し）

```
・Known Design Gap（Analysis EditorとChart Mode ViewModelのモデル不一致）の解消
  buildGridViewModel()がNを表示前に除外する設計を見直す

・Boundary Handle / Playheadの表示条件見直し（検索モード中の減光等）

・CSS再構成の残タスク（Phase86でモジュール分割は完了。
  silverの--color-green-rgb欠落・components.css残置35ブロックの
  再監査等は引き続きopen。詳細はcurrent-issues.md参照）

・Pickup-aware Collision Indicator（P1 v2）
  Phase92のCollision Indicatorはnormal path限定。pickup measureの
  remapPickupOnsetMap()内で発生するStage2 collision（視覚圧縮による
  合流衝突）はhiddenCountを合算しておらず未可視化のまま
  （architecture.md §9.5「PICKUP COLLISION SCOPE INVARIANT」参照）

・clipboardのセッションスコープ見直し（Phase86-2/87で発見・未対応）
  analysisEditor.clipboardが編集セッションをまたいで永続化される仕様。
  「アプリ内クリップボード」として正式化するか設計議論が必要

・Result型（CommandResult）のJSDoc typedef共有ファイル化（優先度低）
  現状はanalysisCommands.js冒頭のコメントのみ

・__analysisEditorDebugの正式な扱い（Phase87で発見）
  「[TEMP DEBUG] 削除すること」とコメントされたままPhase74から現在まで
  DevTools経由の実質的公開APIとして使われ続けている。削除するか、
  正式なdebug APIとしてarchitecture.md §5.5に昇格させるか要検討

・置換ショートカットUX（Phase88で発見・未確定）
  置換直後、入力欄にフォーカスが残った状態でのCtrl+Zがブラウザ標準の
  テキストUndoと衝突しやすい（既存のinTextInputガードによる仕様）。
  「元に戻す」ボタンでは正常動作。UXとして改善余地があるか検討候補

・検索欄の入力仕様（画面表示名ベース）が直感的でない可能性（Phase97発見）
  capo適用中に実音（canonical）をそのまま検索欄へ入力すると、意図と
  異なる結果になる（バグではなく仕様）。案内方法の具体案（プレース
  ホルダー等）は着手時に改めて検討する

・Boundary Handle Dragのpointercancel経路が未検証（Phase93〜95-A2で継続）
  ウィンドウ外へのドラッグ・OSジェスチャ介入等での発火経路が実機で
  未踏のまま。理論上は問題ないはずだが検証待ち
```

### Watch List（継続監視中・原因未特定）

```
・「緑の棒」バグ（原因未特定・次回発生時にDevToolsで実測）
・replaceCurrentAndAdvance()のbackward方向の簡略化（意図的な仕様・バグではない）
```

---

## Appendix: Phase Timeline（詳細履歴）

必要な時のみ参照する。古いフェーズは索引表のみ、直近フェーズは詳細を記載。

### Phase01〜60（概要のみ・詳細は `docs/handover/archive/phaseXX-YY/`）

<details>
<summary>Phase01-60 を展開（10フェーズ単位でさらに折りたたみ）</summary>

<details>
<summary>Phase01-13</summary>

| Phase | 概要 |
|---|---|
| 0 | 環境・Git基盤（Git導入・GitHub連携・初期フォルダ整理） |
| 1〜2 | イベント構造整理（setupEventHandlers()への統合） |
| 3〜5 | モジュール分割（app.js → audio.js/editor.js/csvImporter.js/chords.js） |
| 6〜9 | 状態管理・アーキテクチャ整備（resetProject()・Ctrl+S・Alt+N実装） |
| 10 | Artist・Meterフィールド追加（一部ロールバック） |

</details>

<details>
<summary>Phase14-20</summary>

| Phase | 概要 |
|---|---|
| 10〜11 | Performance Mode UI改善（小節線表示・compact-mode・行数最適化） |
| 12 | モジュール分離・TAP Mode改善（perform.js/replace.js/tapmode.js分離） |
| 13〜15 | CSS変数体系・semantic token設計導入 |
| 16 | modal component化・CSS ownership確立 |
| 17 | base.css分離計画・theme設計原則確定（Primitive/Semantic/Component層） |
| 18 | 各種機能拡張・仕様整理（行挿入位置・コード名正規化仕様策定） |
| 19 | ダイアグラム編集・削除拡張（storage schema v2 migration） |
| 20 | コード名正規化 lookup layer導入（normalizeChordName/findChord） |

</details>

<details>
<summary>Phase21-30</summary>

| Phase | 概要 |
|---|---|
| 21〜24 | lookup canonical化・storage migration v3 |
| 25〜26 | CHORD_DB access layer整理（mutation API導入） |
| 27 | canonical invariant修正（custom diagram storage） |
| 28〜31 | CSS責務分離完成（base/theme/layout/components/state/perform） |

</details>

<details>
<summary>Phase31-40</summary>

| Phase | 概要 |
|---|---|
| 32 | IndexedDB導入・演奏モード改善（idb.js新設） |
| 33 | modals.js切り出し・dependency injection確立 |
| 34 | diagLocked（右パネル固定）・左パネル自動折りたたみ |
| 35 | Theme Layer Cleanup（token階層ルール確立） |
| 36 | Hover Overlay Interaction Redesign |
| 37 | popup削除・TAP閉じるボタン hover feedback |
| 38 | 設計フェーズ（chordEntry / token stream / simile設計） |
| 39-0〜39-6 | token abstraction・chordEntry.js切り出し・barline canonical化 |
| 40 | Chart Mode 設計フェーズ |

</details>

<details>
<summary>Phase41-50</summary>

| Phase | 概要 |
|---|---|
| 41 | Chart Mode 実装（analysisLoader.js/timing.js/chartmode.js新設） |
| 42 | Analysis Persistence Redesign（analysis外部ファイル分離） |
| 42.5 | 環境整備・Git運用改善 |
| 43 | Chart Mode カポ反映（display projection model確立） |
| 44 | Token Semantic Stabilization（no_chord token semantic化） |
| 45 | 行挿入ボタン上下両方向対応 |
| 46 | Project Metadata Schema Migration（artist/title分離） |
| 47 | Header Menu Consolidation & Input Layout Fix |
| 48 | フロートメニュー位置改善 |
| 49〜49.5 | 表示メニュー有効化・Chart Mode視認性向上 |
| 50 | Chart Mode mini transport 追加 |

</details>

<details>
<summary>Phase51-60</summary>

| Phase | 概要 |
|---|---|
| 51 | Chart Mode CSS局所整理 |
| 52 | transient preview restore 実装 |
| 53 | insertion cursor navigation in AddChord modal |
| 54 | Chart Mode 3列/4列切替 + measure-based chord projection |
| 55 | capo lifecycle修正 + AddChord UI改善 + Chartコード重なり修正 |
| 56 | Chart Mode beat cursor + capo info theme token |
| 57 | Chart Mode slot-semantic renderer |
| 58 | capo lifecycle stabilization + Chart header capo info |
| 59 | timing diagnostics and normalization pipeline（Issue #45 taxonomy確立） |
| 60〜60.5 | Chart Mode click seek・File picker folder memory |

</details>

</details>

### Phase61〜80（詳細）

<details>
<summary>Phase61-70 を展開</summary>

#### Phase61 — pickup measure numbering correction
- `detectPickupMeasure()` 追加（2条件AND判定）
- `getDisplayMeasureNumber()` 追加（measure identity と display numbering semantics の分離）
- hotfix: 旧project で Chart Mode が開かないバグ修正（endTime 欠損による NaN）

#### Phase62 — project identity semantics + 新規プロジェクトとして保存
- project identity semantics 確立（保存/別名保存/新規プロジェクトとして保存のUUID lifecycle定義）
- filename ≠ project identity の原則確立

#### Phase63 — playback UX stabilization + restore lifecycle fix
- rAF playback loop 導入（`_startRafLoop()` / `_stopRafLoop()`）
- playback authority 3層分離確立（audio engine / notification / visual update）

#### Phase64 — timing model rehydration redesign
- **4層 architecture contract 確立**（Persistence / Runtime Cache / Chart Runtime / UI Projection）
- 教訓: 「handoverに書いてある」と「実コードに反映済み」は別問題。実コードauditが必要

#### Phase65 — restore-aware asset authority normalization
- `assetState {audioLoaded, chordLoaded, restoreSettled}` 導入
- `checkReloadBannerDone()`（DOM-as-authority）を削除

#### Phase66 — debug observability consolidation
- `window.__CS_DEBUG__` 導入（getter projectionパターン）
- TEMP REPAIRブロック削除・差分適用ルール確立

#### Phase67 — Chart Mode hover chord diagram
- コード名hoverで小型ダイアグラムをtooltip表示（ephemeral UI）

#### Phase68 — Chart Mode pickup-aware visual projection
- **canonical timing space ≠ visual projection space** の分離を確立
- `projectPickupSlotIndex()` を単一変換源として導入

#### Phase69 — Chart slot active highlight stabilization
- `.chart-slot--active` CSS追加・projection layerのboundary audit

#### Phase70〜74 — Chart Mode安定化 / Project DB / Analysis Editor基盤
- Phase70: デバッグ基盤強化（`__CS_DEBUG__.perf` projection化）
- Phase71: Playback Authority整理（speed authority統一）
- Phase72: Timing Correction基盤（repairRule・anchorDownbeat方式）
- Phase73: Project DB（IndexedDB Project Repository・Library UI・Restore Authority分離）
- Phase74（C〜E）: Analysis Editor基盤（buffer/history/選択状態・Undo/Redo・個別コード境界移動）

</details>

<details>
<summary>Phase71-80 を展開</summary>

#### Phase75 — 単一コード編集（追加・変更・削除）
- `splitChord()` / `openChordRenameSelector()` / `deleteChord()`（隣接吸収・自動選択）新設
- バグ発見・修正: 追加時のハイライト同期漏れ（selectedChordIdsの二重管理が原因）

#### Phase76 — 複数コード編集
- 範囲選択（Shift+クリック）・複数削除・Copy/Cut/Paste/Merge・ショートカット拡充
- 「Nバグ」（無音プレースホルダーの吸収方向誤判定）を発見・修正

#### Phase77 — 位置編集（Position Editing）の導入
- editPoint基盤・二段階クリックモデル・Add Here（既存splitChord()の再利用）
- 個別移動の対象を右側境界→左側境界へ変更（[BOUNDARY EDIT AUTHORITY]確立）

#### Phase78 — Footer UI刷新 + クリック/位置計算バグ修正
- `deriveEditorMode()` / Action Registry / 4 Groups構成確立
- Hotfix: 継続セルの誤editPoint化・同一小節内での位置計算バグ

#### Phase79 Sprint1 — Paste Insert（そのまま貼り付け）
- clipboard構造をversion2へ拡張・Paste Origin概念導入・上書き方式5分類確立

#### Phase79 Sprint2 — Decorator Layer完成
- Sprint2-1: Selection Highlight実装・Forward Wall Model最終化
- Sprint2-2: Boundary Handle・EditPoint Marker統一描画
- [DECORATOR ADDITION RULE] [DECORATOR VISUAL LANGUAGE PRINCIPLE] 確立
- Known Design Gap発見（Nがbufferでは実在するがChart Mode表示モデルでは除外される不一致）

#### Phase80 — Search Engine（検索・置換）実装
- searchChords()（pure function）・Engine/UI層分離
- Search Highlightの色調整3回の末に「新色を増やさない」方針へ収束
- [DECORATOR VISUAL LANGUAGE PRINCIPLE] をSearch Engineにも適用し確立を再確認

</details>

<details>
<summary>Phase81-86 を展開</summary>

#### Phase81 — ドキュメント棚卸し + 再構成
- docs/prompts/削除・docs/draft/docs/testing/をlegacy/へ仕分け
- README.md全面更新（読み始めガイド新設）・architecture.md §0新設
- phase-status.md/current-issues.mdを機能索引型・5分類型へ再構成

#### Phase82 — Analysis Editor Chord Projection Boundary
- `toDisplayChord()` / `toCanonicalChord()`（chords.js）新設
- Footer/Rename/AddChord/Search/Replaceの5経路をProjection API経由に統一
- バグ修正: `capo`未取得によるグローバル変数フォールバック事故

#### Phase83 — Chart Mode編集UX改善 + 検索バグ修正
- 単一選択中のEnterでRename分岐追加・ダイアグラムモーダル誤クローズ修正
  （mousedown+click両方が背景要素上の場合のみ閉じる方式へ）
- 検索IME正規化・検索case-sensitive化（m7/M7区別の原則に統一）
- Findings: `sanitizeChords()`とchords.jsの同名`normalizeChordName()`の
  混同を発見・整理。ChordMini生表記漏れ（Representation Layer未整備）を発見

#### Phase84 — Representation Translation Layer
- `loadReplacementMap()` / `toReadableChord()` / `fromReadableChord()`新設
- Findings: `transposeChord()`が度数ベースのオンコード表記を正しく移調できない
  ことを実装確認で発見。表示方向・検索方向の変換順序を訂正
  （表示=P(R(x)) の逆関数関係から検索方向の誤りを実証）

#### Phase85 — UI視認性・記号衝突修正
- Blue theme `--diag-stroke` を暗色に修正・Repeat badge記号衝突解消
  （「×N回 ✕」→「N回 ✕」・区切り線でラベルと削除操作を分離）
- [DECORATOR VISUAL LANGUAGE PRINCIPLE]と同じ原則をeditor.js側にも適用

#### Phase86 — CSS Ownership Split（Sprint A）+ トークン正規化
- CSS棚卸し: components.css全131セレクタの所有モジュールを実参照ベースで確定
- トークン正規化: `--color-blue-rgb`のsilver/blue欠落を修正・未使用トークン3件削除
- **CSS分割の原則を確立**: 「分割単位はDOMを生成するモジュールの所有権で決める。
  見た目の種類では決めない」（architecture.md §3参照）
- components.cssを chart.css / analysis-editor.css / library.css /
  chord-entry.css / modal.css / tapmode.css の6ファイルへ分離
- Findings: 複数行コメントの解析バグを機械分割スクリプトの試作時に自己発見・修正。
  「分解→再結合→原本と完全一致」を検証してから本番分割を実行する手順を確立
- TAP mode 404はブラウザキャッシュが原因と判明（ファイル・分割自体は健全）

</details>

<details>
<summary>Phase87-92 を展開</summary>

#### Phase86-2 — Analysis Editor Session Authority抽出 + Ctrl/Cmd EditPoint + AddChord Enterバグ修正
- `analysisSession.js`新設。`createAnalysisSession()` / `resetSessionFields()` /
  `pushHistory()` / `undoBuffer()` / `redoBuffer()` / `refreshSelection()` /
  `selectRange()` / `setEditPointFields()` / `clearEditPointField()`を実装
- app.js側の該当関数を薄いラッパー化（DOM/audio/Chart runtime副作用はapp.js残置）
- UX追加: Ctrl/Cmd+クリックで二段階クリックモデルをバイパスし即editPoint確定
- バグ修正: AddChordモーダルのEnter確定直後に別モーダルが誤って再オープンする問題
  （`e.stopPropagation()`追加。原因はDOM除去とイベントbubbling順序の競合）
- Findings: undoEdit/redoEditは想定と異なり「past/futureスタック」方式だった。
  reset系関数は当初の想定より副作用が多かった（setSearchMatches等が同居）

#### Phase87 — Analysis Editor コマンド層（Command Layer）抽出
- `analysisCommands.js`新設。copy/cut/delete/paste/merge系5関数を移設予定が、
  実コード監査でdeleteChord()・buildPastePlan/commitPastePlanも対象に拡大
- Result Protocol確立: `{ ok, reason?, selectedChordIds?, count? }`統一形状
- [BOUNDARY INVARIANT]確立: セッション層／コマンド層（Session/Command Layer）は副作用を一切持たない
- Findings: `pasteSelection()`が計画/適用分離（buildPastePlan型）を経由していない
  独立構造だったことを実コード監査で発見・スコープに追加
- Findings: `__analysisEditorDebug`が「隠れた公開API」として機能していたことを発見。
  bindラッパーで契約維持

#### Phase88 — コマンド層（Command Layer）拡張（updateChord / splitChord / moveBoundary）
- `moveBoundaryCommand`（低レベルprimitive・Result Protocol対象外）・
  `updateChordCommand` / `splitChordCommand`（呼び出し側6箇所は無修正）を追加
- Issue #46発見: Add Here/aep-addのUndoが2段階に分かれる潜在バグ
  （Phase75由来・Phase88の抽出自体が原因ではないと判定）
- 置換Undoの「効かない」報告を調査 → `inTextInput`ガードによる仕様と判明。
  UX上のストレスは断定せず将来検討候補として保留

#### Phase89 — Add Chord Transaction統合（Issue #46対応）
- `addChordCommand()`新設。split+renameを1トランザクション化し
  pushHistory()を1回に統合（[UNDO TRANSACTION INVARIANT]確立）
- splitChordCommand/updateChordCommandは呼び出さずロジックを局所複製
  （既存2関数のシグネチャ・挙動を変えないため）
- Findings: 個別移動ボタンで極小duration化したコードをaep-add分割すると
  隣接コードの描画に隠れる現象を新規発見（Phase91調査の起点）

#### Phase90 — Search Navigation の Session層抽出
- `activateSearchIndex()`新設（analysisSession.js）。検索結果のwrap-around
  index計算のみを抽出。selection同期・Chart Mode同期・audio seek・
  DOM再描画は無変更でapp.js側に残置
- 設計原則確定: 検索移動はbufferを変更せずhistoryも積まない「navigation」
  であり、コマンド層（Command Layer）ではなくセッション層（Session Layer）に分類する

#### Phase91 — Chart Mode Rendering Collision Semanticsの確定（調査フェーズ）
- Phase89で発見した「極小duration chord表示重なり」を調査。修正コミットなし
- 原因確定: `quantizeTime()`（最近傍slot方式）により極小duration分割onsetが
  同一slotIndexへ量子化され、`resolveCollision()`のタイブレーク（tie-break）
  （confidence→duration→time）で片方が描画から脱落することを実測ログで確定
- 一時ログ（`[TEMP DEBUG][Phase91]`）追加→実測→削除の手順を徹底
- 設計判断: 「Commandで弾く（P2）」より「Projection制約として可視化する（P1）」を
  採用候補に決定。Command層がChart Runtimeの量子化解像度を知る結合を避けるため

#### Phase92 — Chart Mode Collision Indicator（P1 v1）
- `expandToSlots()`のnormal pathを`{ chosen, hiddenCount }`形状へ拡張
- Rendererに`.chart-slot-collision`（Amber系ドット・title属性のみ）を追加
- スコープをnormal pathのみに限定（pickup measureの`remapPickupOnsetMap()`は
  無変更）。理由: pickup measureには「同一slot衝突」と「視覚圧縮による合流衝突」
  という意味論の異なる2種類の衝突が存在し、安易に合算すると原因の異なる現象を
  1つのメトリクスに潰してしまうため（[PICKUP COLLISION SCOPE INVARIANT]確立）
- 実機確認済み。差分は`chartmode.js`5ブロック・`chart.css`1ルールのみ

</details>

<details>
<summary>Phase93-98 を展開 — Analysis Editor Evolution（境界編集 → 演奏連動UX → クリック統一 → Decorator整理 → Section仕様固定）</summary>

Phase93〜98は、Boundary編集の操作性向上（Phase93・95-A2）→ 演奏と編集の
連動UX（Phase94・95-A1）→ Chart Mode全体の視覚設計の整理（Phase96〜97）→
次の拡張（Section）の仕様固定（Phase98）という、一連の流れとして繋がっている。

```
Phase93   Boundary Handle Drag Editing
    │       境界移動をクリック/矢印キーに加えドラッグ対応
    ▼
Phase94   Playback-aware Editing UX + Header Visual Language整理
    │       演奏スクロールの賢さ向上・選択範囲の小節数表示・色の役割分担確立
    ▼
Phase95-A1  Chart Modeクリックの「選択+シーク」一般化
    │         通常クリックでも検索結果クリックと同じ挙動に統一
    ▼
Phase95-A2  Boundary Handle Hover + Direct Drag
    │         選択操作を経ずhoverだけで境界ドラッグ可能に
    ▼
Phase96   Decorator Inventory棚卸し・Visual Hierarchy確立
    │       「装飾が多すぎて分からない」を Intent軸で整理
    ▼
Phase97   Selection Hit-Test統一・Search Enharmonic対応
    │       Decorator整理中に見つかった副作用バグを修正
    ▼
Phase98   Section Specification（仕様固定・Design Freeze）
            次の拡張（Section機能）の実装前設計を完了
```

#### Phase93 — Boundary Handle Drag Editing
- `.chart-slot--boundary-handle`上でのpointerdown/move/up/cancelを委譲登録。
  8px閾値でクリックとドラッグを分岐
- 座標→時刻変換は既存の`getTimeForGridPosition()`を再利用（新規実装なし）
- ドラッグ確定時のみ`_pushHistory()`を1回だけ呼び、以降の`moveBoundary()`
  連続呼び出しはhistoryを積まない
- 壁到達時はボタン/矢印キー（toastで拒否）と異なり、`shiftSelectionRange()`
  と同じ「トーストなしで静かにclamp」方式を採用
- 確立した原則: pointer capture後は`e.target`が使えない（`document.
  elementFromPoint()`で代替）。ドラッグは`requestBoundaryShift()`を
  経由せず専用入口を新設（`moveBoundary()`という唯一の窓口は維持）

#### Phase94 — Playback-aware Editing UX + Header Visual Language整理
- B4 Scroll Recovery: 手動スクロール後は一定時間（デフォルト5秒）自動追従を
  抑止。ただし再生行が画面内に戻れば即座に自動追従を再開する2経路方式
- C1 Selection Measure Span: 選択範囲の小節数をフッターに表示
  （当初ヘッダー表示で実装したが、実機フィードバックによりフッター
  表示へ作り直し。chartmode.js側の変更は最終的に全て撤回）
- ヘッダー視覚言語整理: 「編集中」表示の色衝突（Amber同士）を、
  Green=編集ワークフロー系／Amber=編集補助系という役割分担の確立で解消
  （4段階の試行錯誤を経て、「色の強弱」ではなく「意味のカテゴリ分け」が
  本質的解決だったと判明）
- Section Data Layer構想が本フェーズの雑談から派生し、`section-model.md`
  として別ファイルへ切り出し（Phase98で仕様固定）

#### Phase95-A1 — Chart Modeクリックの「選択+シーク」一般化
- `onChordSelected`コールバックの通常クリック分岐に、検索結果クリックと
  同じ「選択+シーク」処理を追加（app.js 1箇所の修正のみ）
- 設計原則確立: 「どのコードを見ているか」と「どこを聴いているか」を
  常に一致させる。Shift+クリック・editPoint確定は対象外（除外）

#### Phase95-A2 — Boundary Handle Hover + Direct Drag
- `_getChordBufferIndex(chordId)`を新設し、selection非依存でhoverから
  直接ドラッグ可能に
- 3段階の実機検証で安定化: ①「セル全体」当たり判定→誤ドラッグ多発
  →②左端10pxへ縮小→③setPointerCapture遅延化。この過程で「onsetセルに
  data-chord-idがない」という独立した不具合も並行して発覚（Phase97で
  本格修正）
- 教訓: 「1つ直せば全部直るはず」と早期断定せず、都度実機で再検証する
  姿勢が複数の独立原因の発見につながった

#### Phase96 — Decorator Inventory棚卸し・Visual Hierarchy確立
- 発端: Chart Modeの視覚装飾（拍線・選択・境界ハンドル・再生位置表示等）が
  増えすぎ、「一つ一つは正しいが全体として分かりにくい」という課題が浮上
- 全Decoratorを Intent（伝えたい意味）・Layer・Primary/Secondary・
  Exclusiveで整理したDecorator Inventoryを確立（architecture.md §12参照）
- [ONE INTENT, ONE PRIMARY DECORATOR]・[VISUAL HIERARCHY]原則を新設
- 具体的調整: Boundary Handle選択版を廃止しhover版へ統合／Active Slot・
  Active MeasureをPlayheadより弱い表現へ調整／Selectionの水玉テクスチャは
  技術的問題（継ぎ目・テーマ依存色・z-index）が同時発生し撤回
- Findings: Active Measureの背景塗り撤回がsilverテーマだけ反映されない
  不具合を発見。theme.css側の独立オーバーライドが原因と判明し、
  [THEME LAYER RESPONSIBILITY]原則制定のきっかけとなった

#### Phase97 — Selection Hit-Test統一・Search Engine Enharmonic対応
- 「セル上部クリックでeditPointになる」不具合を実機DOM検証で追跡し、
  重畳していた2つの原因を発見・修正（onsetセルへのdata-chord-id欠落・
  `.chart-measure-num`の当たり判定過大）
- setPointerCaptureのタイミング起因のクリック誤判定も発見・修正
- 「置換を繰り返すと検索が0件になる」報告を実機デバッグAPIで調査。
  報告現象の直接原因はセッション途中のCapo変更（仕様通り）だったが、
  調査過程でCapo往復変換由来の異名同音表記不一致という独立の潜在バグを
  発見し、`normalizeEnharmonic()`（検索マッチング専用）で修正

#### Phase98 — Section Specification（仕様固定・Design Freeze）
- section-model.md §9の未解決事項に回答し、Sectionの正式仕様を確定
- データモデル: `{ id, type, name, startChordId, endChordId }`
  （`id`は「Section Identity」であることを明記）
- 境界コード増減ルール確定（内部追加は自動包含／境界削除は隣接コードへ
  付け替え／0コードになったらSection自体を削除）
- [SECTION INVARIANTS]を新設（既存の[BOUNDARY INVARIANT]等と同じ役割）
- Authority Scope確定: 「analysisEditor.bufferが正本」ではなく
  「Analysis Editor Session限定のAuthority」と明文化（ChatGPTレビュー
  反映。将来Project Repositoryへ昇格する際の書き直しコストを下げるため）
- ライフサイクル仕様確定（生成/更新/削除。更新はSession Layerが責務を
  持ち、API設計はPhase99で決定。暗黙削除は親コマンドのUndoトランザク
  ションに含める）
- `section-model.md`に`[DOCUMENT AUTHORITY]`を新設（「唯一の正本」では
  なく「設計判断を集約する設計ドキュメント」という表現。architecture.md
  との役割分担を維持するための調整）
- architecture.mdへの影響箇所（§3/4/9/11/12/13）を洗い出し。実際の反映は
  Phase99実装着手時に行う
- 実装（Section Data Layer本体）はPhase99以降。コード変更は本フェーズでは無し

</details>

<details>
<summary>Phase99-103 を展開 — Section Data Layer本体（Session → UI → Preview → Persistence）</summary>

Phase99〜103は、Phase98で仕様固定したSectionサブシステムを実装に落とし込む
一連の流れである。途中Phase99だけはSectionと無関係の軽量課題解消だが、
Section関連作業の合間の「一息」として位置づけられる。

```
Phase99     current-issues軽量課題2件解消（Section作業とは無関係）
    ▼
Phase100-A  Section Session Layer（非永続・Validation・Reconcile・Command API）
    ▼
Phase101-1〜3  Section Editor MVP（Section Bar・作成・Rename/Delete）
    ▼
Phase102    Section Preview Decorator
    ▼
Phase102-B  Section Preview 視覚言語の独立化（[DECORATOR LEGIBILITY PRINCIPLE]）
    ▼
Phase103    Section永続化（Specification→Session→UI→Preview→Persistenceが一巡）
```

#### Phase99 — current-issues軽量課題2件の解消
- ライブラリ：曲を開くと同じアーティスト内で先頭へ移動する退行を解消。
  `getSortedProjects()`の`'artist'`分岐へ`title`タイブレーク（tie-break）を追加
  （原因: `Array.sort()`の安定ソート特性により、`autoSaveLocal()`が更新する
  `updatedAt`降順の元配列順がそのまま同名artist内の順序に漏れ出ていた）
- バックアップ中に音声が止まらない問題を解消。`pagehide`イベントで`aEl.pause()`
  を呼ぶよう追加（`visibilitychange`は他タブ参照等の通常利用まで止めてしまう
  ためChatGPTレビューで却下・`pagehide`に限定）
- 確立した原則：【表示ソートは決定的であるべき】（Deterministic Display Sort）。
  グルーピングキーが同値の場合は必ず明示的な二次キーで決定する

#### Phase100-A — Section Session Layer実装
- `analysisSession.js`へ`session.sections`・`validateSectionInvariants()`・
  `reconcile()`・`getSections()`を新設。`analysisCommands.js`へ
  `createSectionCommand`/`renameSectionCommand`/`updateSectionBoundaryCommand`/
  `deleteSectionCommand`の4コマンドを新設
- reconcileは「読み取り時のLazy評価」方式を採用（`getSections()`呼び出しの
  たびに`reconcile()`実行）。Chord側のCommandに一切手を入れずに済み、
  依存方向を「Chord→Section」の一方向に保てる
- [SECTION SESSION CONSISTENCY INVARIANT]を確立：Sectionコレクションは
  必ず`getSections()`経由でのみ読む
- 境界コード削除時の自動付け替え（§4.3ケースB）は実装せず、常にSection削除
  （ケースC相当）とした。CorrectnessはケースCのみで満たされ、ケースBは
  UX最適化のため次フェーズへ委ねた
- Section CommandsはHistoryへ意図的に不参加（[SECTION HISTORY INTEGRATION]）。
  既存History機構がbuffer専用snapshotであり、Section変更を伴うと壊れた
  Undo挙動になるため。実装中に発見した制約（仕様確定段階では見えなかった）
- 永続化・UI・Selection State・History統合はすべて意図的にOut of Scope

#### Phase101-1〜2 — Section Editor MVP（Section Bar・作成ダイアログ）
- `#chart-header`と`#chart-grid`の間に読み取り専用のSection一覧バーを新設
- 作成ダイアログ（種類11種プルダウン・自動採番＋手動編集追従ルール・範囲固定表示）
- [FIXED RANGE]：作成対象のstart/endはダイアログを開いた時点のselectionで確定
- 単一コードのSectionも正当（`startChordId === endChordId`）

#### Phase101-3 — Rename / Delete 管理メニュー
- Sectionチップへ▼メニュー追加（Rename/Delete）。Escape優先順位へ
  Section▼メニューを割り込ませ（①Modal最優先の直後）
- チップ本体クリックは101-3では意図的に無効化（101-4のPreview用に予約）
- [実機確認で発見・修正] Escapeでメニューを閉じた後もfocus outlineが
  ▼ボタンに残る不具合を`_closeSectionMenu()`への`blur()`追加で解消

#### Phase102 — Section Preview Decorator
- チップ本体クリックでSection範囲をChart Mode上にハイライト表示
  （selectionとは独立した別state。`_previewSectionId`はapp.js ephemeral）
- 当初はSelectionトークンを流用した色で実装

#### Phase102-B — Section Preview 視覚言語の独立化
- Selectionと重なると判別しづらい課題が実機確認で判明し、専用のゴールド系
  トークンへ変更（色相は3テーマ共通・alpha値のみテーマ別）
- **[DECORATOR LEGIBILITY PRINCIPLE]を採用**：編集ツールとして、Decoratorは
  意味の伝達を最優先し、テーマとの調和より視認性を優先してよい。
  [THEME LAYER RESPONSIBILITY]（Phase97）とは別の関心事であり、競合時は
  本原則を優先する

#### Phase103 — Section永続化
- `analysis.raw.sections`へ永続化。`beginAnalysisEdit()`でSessionへ読込・
  `saveAnalysisEdit()`でSessionから書き戻し。`saveAnalysisFile()`等の
  既存APIは無変更（rawオブジェクトの参照透過性を利用）
- **[PERSISTENCE OWNERSHIP PRINCIPLE]を明文化**：ownership（生成元）と
  storage location（保存場所）は必ずしも一致しない。保存場所は永続化
  スキーマとの一貫性・実装コストの最小化で決めてよい
- 実機検証で2件の既存バグを発見・修正：
  - dirtyフラグがSection操作で立たない（Phase100-A由来。dirtyが
    `pushHistory()`の副作用としてのみ実装されていたため）
  - Section Previewが編集終了後も残留する（Phase102由来。
    `resetAnalysisEditor()`への登録漏れ）
- **[EDITOR RESET AUTHORITY]を明文化**：Analysis Editor限定のephemeral
  stateは必ず`resetAnalysisEditor()`（唯一のリセット窓口）へ登録する
- Section機能がSpecification→Session→UI→Preview→Persistenceまで一巡し、
  実用レベルに到達

</details>

---

