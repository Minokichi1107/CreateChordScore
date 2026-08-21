# フェーズ進行状況

> 最終更新: Phase123-C2完了時点（Phase119〜123-C2を反映）

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
✓ Section永続化（Phase103・analysis.raw.sections）
✓ Section History Integration（Phase104・Section系4コマンドをUndo/Redo
  対象化。history/futureのスナップショット形状を{buffer, sections}へ拡張）
✓ Section Navigation（Phase105・チップクリックで選択+スクロール。
  [NAVIGATION OWNERSHIP]確立）
✓ Section Boundary Editing UI（Phase106・境界ステッパーUIから
  updateSectionBoundaryCommand()を初めて接続。[RENDER CONTEXT INVARIANT]
  発見・確立）
✓ Section Preview UX Polish（Phase107・Preview解除を専用ボタンから
  チップ再クリックのトグル方式へ）
✓ Section Boundary Reassignment（Phase108・単一削除時の境界コード
  自動付け替え。[BOUNDARY REMAP AUTHORITY]確立。Section Data Layerが
  基盤機能として完結）
✓ Compound Mutation Boundary Resolution（Phase109〜111・複数選択削除／
  Merge／pasteSelectionCommand／Ctrl+V(pasteAbsolute)の4経路すべてで
  Section境界のreconciliationが完結。[COMPOUND MUTATION BOUNDARY
  RESOLUTION PRINCIPLE]・[SECTION EXTENT GUARD]確立、[BOUNDARY REMAP
  AUTHORITY]は統合・廃止）
✓ 選択解除ボタン（×）Footer再描画漏れ修正（Phase112・Section機能とは
  無関係の独立UIバグ。clearCurrentSelection()のelse分岐に
  _refreshEditorView()呼び出しを追加）
✓ Section境界メニューのHit-Test横取りバグ修正（Phase113・
  .sec-chip--previewingのtransformが生成するstacking contextにより、
  境界ステッパー/Rename/Deleteボタンのクリックが下層#chart-gridの
  .chart-slotに奪われていた不具合を解消。#section-barへ明示的な
  z-indexを付与）
✓ merge実行時のSection削除確認UX（Phase114・[SECTION EXTENT GUARD]
  発動時にのみ確認モーダルを表示。_evaluateSectionMutation()共有化に
  より reconcile()との判定ロジック二重実装を回避）
✓ 置換直後のCtrl+Z UX改善（Phase115・replaceUndoPendingフラグと
  フォーカス条件により、置換欄にフォーカスが残ったままのCtrl+Zを
  アプリ側Undoとして扱えるようにした。既存inTextInputガードの
  通常ロジックは無変更）
✓ __analysisEditorDebugの正式化整理（Phase116・mutation系35関数を
  全撤去し、観測専用のstate/editorModeのみ__CS_DEBUG__.analysisEditor
  へ統合。DevTools経由でのCommand Layer直接操作経路を廃止）
✓ isChordLikeInput()末尾検証強化（Phase117・正規表現へ末尾アンカーと
  文字クラスのホワイトリストを追加。構文検証／意味論検証の責務分離を
  維持したまま構文側の判定精度のみ強化）
✓ Undo/Redo後の変更箇所ナビゲーション（Phase118・
  computeMutationFocusChordId()新設。Undo/Redo実行前後のbuffer比較
  のみからNavigation対象を導出するMutation Region方式を採用。History
  snapshotの形状は無変更。Section系コマンドは自動的に対象外）
✓ Undo/Redo Mutation Feedback（Phase119・Undo/Redo実行時にSelectionを
  明示解除したうえで、対象コードのセルを400ms程度パステル背景で
  フェード表示。computeMutationFocusChordId()（Phase118）は無変更で
  再利用。新規token--color-mutation-feedback-bgを3テーマへ追加）
✓ 小節頭補正変更後のChart表示巻き戻りバグ修正（Phase120・
  onSetRepairRule/onClearRepairRuleがgetCurrentChordSource()を
  経由しない再描画を呼んでいたことが原因。正規経路_refreshEditorView()
  への統一で解消。副次的にediting引数欠落（[RENDER CONTEXT
  INVARIANT]）も解消）
✓ Debug Session Recorder — Mutation Recording基盤（Phase121・
  Command Layer起点の21種類のイベントを記録するMVPを実装。
  Alt+RによるGlobal shortcut・Recording中インジケータを追加し、
  Chart/Perform/TAP等の全画面overlay表示中でも操作可能にした。
  実機テストにより、Mutation記録のみでは操作再現に情報不足があると
  判明し、Phase122をSemantic Interaction Recordingとして計画）
✓ Debug Session Recorder — Diagnostic Timeline設計固定（Phase122・
  コード変更なし。Recorderの最終目的を「操作記録」から「ユーザー操作
  起点の内部イベント・状態遷移の因果関係追跡」として再定義し、
  docs/debug-recorder-design.mdへ設計を確定。Named Invariant6件を
  確立。実装はPhase123へ）
  ※Phase122 handoverには通常のDeferred Documentation定型文が
  存在しなかったため、この項目は今回の棚卸しで補完した。
✓ Mutation Attempt Recording（Phase123-A・Command Layer拒否（12箇所）・
  moveBoundaryCommandのnumber|null変換（1箇所）・app.js側独自ガード
  拒否（11箇所）をDiagnostic Timelineへ記録するよう拡張。全Command
  Layer関数で拒否分岐がpushHistory()より前にあることを検証した上で
  after=beforeを採用。history/future記録はPhase123-Bへ分離）
✓ history/future の before→after 記録（Phase123-B・
  snapshotState()の共通フィールドとしてhistoryLength/futureLengthを
  追加。opts経由のopt-in指定は不要（差分フォーマッタが変化なしを
  自動抑制するため）。app.js側は無改修）
✓ Debug Session Recorder — Phase123-A補正（Phase123-C1・pasteAbsolute()
  へMutation Attempt Recordingを追加。reconcile()を実Factsで呼ぶ5経路の
  記録漏れを解消）
✓ Debug Session Recorder — reconcile診断情報の記録（Phase123-C1・
  snapshotSections()/diffSections()新設。reconcile()を実Factsで呼ぶ
  5経路でSectionのremoved/remappedを記録。sectionsCount（個数のみ）
  では検知できなかった境界remapを、変更前→変更後の具体値付きで
  診断可能にした。共通snapshot fieldにはせず、該当5経路専用の
  別枠として実装）
✓ Debug Session Recorder — Render Event（描画イベント）の記録
  （Phase123-C2・[RENDER PATH VISIBILITY]のうちMutation-triggered
  render範囲を実装。recordRender()（debugSessionRecorder.js）を
  新設し、_refreshEditorView(mutationEvent)の明示的パラメータ渡し
  により、18箇所のMutation-triggered呼び出し＋updateChord経由2箇所＋
  ドラッグ特殊系1箇所でRender Event（path/source/trigger）を記録
  可能にした。Section Preview等の非Mutation renderはLevel3の原則に
  従い対象外のまま維持）
✓ Render Context Invariant Compliance（Phase124・Phase123-C2で発見
  された`renderChartMode()`呼び出し元4箇所のediting欠落を解消。
  影響範囲をヘッダーUI（編集中バッジ・編集ボタンactive表示）に
  限定できることをコード追跡で確認し、render経路自体の整理は
  行わなかった）

Current Work（現在の作業: なし・次フェーズ候補は「3. Future Candidates」参照）
------------------------------------------------------------
Phase119〜123-C2が完了し、5フェーズ棚卸し（本更新）を実施済み。
Phase119はUndo/Redo着地点への一時ハイライトを実装し、Phase120は
repairRule変更後のChart表示巻き戻りバグを解消した。Phase121〜123では
Debug Session Recorder（Diagnostic Timeline）を実装した
（Mutation Recording基盤 → 設計固定 → Mutation Attempt Recording →
history/future記録 → reconcile診断 → Render Event記録）。
Phase124ではPhase123-C2で発見された[RENDER CONTEXT INVARIANT]違反
4箇所を解消し、Diagnostic Timeline v1完成後の最初の「本体復帰」
フェーズとして完了した（次の5フェーズ棚卸しはPhase124〜128予定）。

[決定事項] Debug Session Recorder（Diagnostic Timeline）は
Phase123-C2（Render Event記録）をもって「v1」として区切り、凍結する。
render経路識別の残スコープ・repairRule/capo変更の記録・セッション
lifecycle記録は、実運用のバグ調査で情報不足が判明した場合にのみ着手する
（current-issues.md §1.5参照）。理由: デバッグ機能自体の開発が目的化
することを避け、Phase124以降はアプリ本体の機能・UX改善へ復帰するため。
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
| 104 | Section History Integration（history/futureを{buffer,sections}複合スナップショット化。Section系4コマンドがUndo/Redo対象に） |
| 105 | Section Navigation（チップクリック=選択+スクロール+Preview。[NAVIGATION OWNERSHIP]確立） |
| 106 | Section Boundary Editing UI（境界ステッパー実装・[RENDER CONTEXT INVARIANT]発見） |
| 107 | Section Preview UX Polish（Preview解除をトグル方式へ） |
| 108 | Section Boundary Reassignment（単一削除時の境界自動付け替え。[BOUNDARY REMAP AUTHORITY]確立） |
| 109 | Compound Mutation Boundary Resolution（delete/merge限定。reconcile()のFactsを刷新し[COMPOUND MUTATION BOUNDARY RESOLUTION PRINCIPLE]・[SECTION EXTENT GUARD]確立。[BOUNDARY REMAP AUTHORITY]を統合・廃止） |
| 110 | Compound Mutation Boundary Resolution（Paste対応拡大。pasteSelectionCommandへreconciliation拡大。replacement Factsを2値化しdelete/merge/pasteを統一的に扱えるように。Ctrl+V経路は未対応のまま） |
| 111 | Compound Mutation Boundary Resolution（Ctrl+V対応拡大。buildPastePlan()/commitPastePlan()へreconciliation拡大。単一コード内完結ペーストをN=1特殊系として統合） |
| 112 | 選択解除ボタン（×）Footer再描画漏れ修正（clearCurrentSelection()のelse分岐に_refreshEditorView()欠落。Section機能とは無関係） |
| 113 | Section境界メニューのHit-Test横取りバグ修正（.sec-chip--previewingのtransformが独自stacking contextを生成し、.sec-chip-menuのz-indexが#chart-grid側と比較されなくなっていた。#section-barへz-index明示で解決） |
| 114 | merge実行時のSection削除確認UX（predictSectionImpact()・previewMergeSectionImpact()新設。_buildMergeFacts()をpreview/execute共通の唯一のFacts生成元とし、_evaluateSectionMutation()をreconcile()と共有することで判定ロジックの二重実装を回避。analysisSession.js/analysisCommands.js/modals.js/app.js） |
| 115 | 置換直後のCtrl+Z UX改善（analysisEditor.search.replaceUndoPending新設。フラグ単独ではなくフォーカス位置とのAND条件とすることで、別UIへのフォーカス移動時に誤ってUndoを奪う問題を回避。Undo実行時にフラグを消費しない設計により、置換欄にフォーカスがある限りCtrl+Z連打で多段Undoが可能。app.js） |
| 116 | `__analysisEditorDebug`の正式化整理（Phase74-Cから残置されていたmutation系35関数の直接公開を撤去。観測専用のstate/editorModeのみ__CS_DEBUG__.analysisEditorへ統合。timing.raw/normalizedの既存live reference方針に揃え、cloneはしない設計判断。app.js） |
| 117 | `isChordLikeInput()` 末尾検証強化（先頭ルートのみ検証していた正規表現に末尾までの文字クラス検証を追加。CHORD_DB全サフィックス列挙ではなくホワイトリスト方式を採用し、将来のCHORD_DB拡張との同期保守を回避。chordEntry.js） |
| 118 | Undo/Redo後の変更箇所ナビゲーション（computeMutationFocusChordId()新設。swap前後のbufferを`_id`基準で比較し、変更区間の和集合（Mutation Region）の中心に最も近いコードへscrollToChord()する方式。History snapshot（{buffer, sections}）・scrollToChord()本体は無変更。個別コマンドの知識を持たない汎用diff方式のため、Section系コマンドは自動的に対象外となる。analysisSession.js/app.js） |
| 119 | Undo/Redo Mutation Feedback（Undo/Redo実行時にSelectionを明示的に解除し、対象コードのセルを400ms程度パステル背景でフェード表示する方式（VSCode風）で実装。初版（輪郭box-shadowパルス・Selectionと共存させる設計）から実機検証を経て設計変更。computeMutationFocusChordId()・History・Mutation semantics自体は無変更） | app.js / chartmode.js / chart.css / theme.css |
| 120 | 小節頭補正変更後のChart表示巻き戻りバグ修正（原因: repairRule変更ハンドラがgetCurrentChordSource()という Single Switch Point を経由しない再描画を呼んでいたため、編集中のbuffer変更が無視されていた。修正: 正規再描画経路_refreshEditorView()への統一。buffer自体は無事でChart Mode Projection層のみの不具合だった） | app.js |
| 121 | Debug Session Recorder — Mutation Recording基盤（debugSessionRecorder.js新設。Command Layer起点21種類のイベントを記録。実機テストでChart/Perform等の全画面overlayがヘッダーメニューを覆い操作不能になる問題を発見し、Alt+R Global shortcut化＋Recording中インジケータ（z-index調整含む）で対応） | app.js / debugSessionRecorder.js / index.html / state.css |
| 122 | Debug Session Recorder — Diagnostic Timeline設計固定（debug-recorder-design.md新設。Design Freezeのみでコード変更なし。Timeline Eventの粒度等、複数の実装論点はPhase123へ持ち越し） | debug-recorder-design.md（新規ドキュメントのみ） |
| 123-A | Mutation Attempt Recording（debug-recorder-design.md [MUTATION ATTEMPT RECORDING]の実装。Command拒否・app.js側事前バリデーション拒否をTimelineへ記録。Timeline Event粒度は「1 Mutation Attempt = 1 Event + diagnostic fields」に確定。updateChord()内部拒否・replaceAllMatches一部拒否・updateSectionBoundary拒否はUI側到達困難と判明） | app.js |
| 123-B | history/future の before→after 記録（debug-recorder-design.md [STATE TRANSITION OVER STATE VALUE]の実装。snapshotState()の共通フィールド化により、Mutation Attempt Recording（Phase123-A）の呼び出し箇所を一切変更せずにUndo/Redoスタック深さの遷移を記録可能にした） | debugSessionRecorder.js |
| 123-C1 | Debug Session Recorder — reconcile診断情報の記録（debug-recorder-design.md [MUTATION ATTEMPT RECORDING]続編。snapshotSections()/diffSections()新設。reconcile()を実Factsで呼ぶ5経路（deleteChord/deleteSelection/pasteSelection/pasteAbsolute/mergeSelection）でSection変化を診断。pasteAbsolute()のMutation Attempt Recording記録漏れも同時に補正） | app.js / debugSessionRecorder.js |
| 123-C2 | Debug Session Recorder — Render Event（描画イベント）の記録（debug-recorder-design.md [RENDER PATH VISIBILITY]の実装。Mutation-triggered renderのみを対象とし、独立イベント種別（event:'render'）として単一Timelineへ記録。recordRender()の1箇所に生成ロジックを集約。調査過程で[RENDER CONTEXT INVARIANT]違反4箇所を発見（current-issues.md参照）） | app.js / debugSessionRecorder.js |
| 124 | Render Context Invariant Compliance（[RENDER CONTEXT INVARIANT]（Phase106）への準拠を完了。renderChartMode()全8呼び出し元を再監査し、saveAnalysisEdit()／capo変更ハンドラ／Chart Modeを開くボタン／列数切替ボタンの4箇所へediting: isAnalysisEditing()を追加。editingは_renderChartHeader()内でのみ使用され、GridViewModelの描画データには無関係であることを確認） | app.js |

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
| 105 | **[NAVIGATION OWNERSHIP]確立**（Section Navigationのスクロール責務分離）・**ドキュメント更新ポリシー確定**（Named Invariant即時反映ルール。docs/handover/README.md参照） |
| 106 | **[RENDER CONTEXT INVARIANT]確立**（renderChartMode()呼び出し規約。デフォルト引数によるレイアウト崩壊バグの発見から。architecture.md §9参照） |
| 108 | **[BOUNDARY REMAP AUTHORITY]確立**（reconcile()はbufferから付け替え先を推測しない・呼び出し元が明示的に伝える。architecture.md §12参照） |

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
   History Integration      — Phase104完了
   Navigation               — Phase105完了
   Boundary Editor UI       — Phase106完了
   UX Polish                — Phase107完了
   Boundary Reassignment（単一削除） — Phase108完了
   Boundary Reassignment（複数削除／Merge／Paste／Ctrl+V） — Phase109〜111完了

単一Mutationを対象としたSection Data Layer（基盤機能）はPhase98〜108を
通じて実用レベルに到達し、複合Mutation対応もPhase109〜111で完結した。
残る発展方向は以下の2つ:

P1  Section境界共有の正式サポート
    同一chordIdを複数Sectionのstart/endが共有できるようにする独立Epic
    （current-issues.md Future Features参照）。

P2  Section UX Epic
    Section機能をAnalysis Editor専用から全モード共通の楽曲構造レイヤーへ
    発展させる構想（current-issues.md参照）。
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
```

### Debug Session Recorder — Diagnostic Timeline v1 凍結後の保留事項

```
Phase123-C2をもってDiagnostic Timelineを「v1」として一区切りとし凍結した。
残りのスコープ（render経路識別の残スコープ・repairRule/capo変更の記録・
セッションlifecycle記録）は、実運用のバグ調査で情報不足が判明した場合に
のみ着手する（current-issues.md §1.5参照。机上の追加はしない）。

Phase124以降は次候補を新規の要望・発見事項ベースで選定する
（「Debug Recorderの次を作る」こと自体をPhase124の目的にしない）。
```

### Technical Debt（技術的負債・既存挙動の見直し）

```
・Known Design Gap（Analysis EditorとChart Mode ViewModelのモデル不一致）の解消
  buildGridViewModel()がNを表示前に除外する設計を見直す

・Boundary Handle / Playheadの表示条件見直し（検索モード中の減光等）

・CSS再構成の残タスク（Phase86でモジュール分割は完了。
  silverの--color-green-rgb欠落・components.css残置35ブロックの
  再監査等は引き続きopen。詳細はcurrent-issues.md参照）

・clipboardのセッションスコープ見直し（Phase86-2/87で発見・未対応）
  analysisEditor.clipboardが編集セッションをまたいで永続化される仕様。
  「アプリ内クリップボード」として正式化するか設計議論が必要

・Result型（CommandResult）のJSDoc typedef共有ファイル化（優先度低）
  現状はanalysisCommands.js冒頭のコメントのみ

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

<details>
<summary>Phase104-108 を展開 — Section Data Layer完結（History → Navigation → Boundary Editor → UX Polish → Boundary Reassignment）</summary>

Phase104〜108は、Phase103までに実用レベルへ到達したSection機能を、
最後の未完了事項（History・Navigation・境界編集UI）まで仕上げ、
実機フィードバックに基づくUX調整（Phase107）を経て、最後に残った
仕様上の欠落（Phase98で定義されたケースB・境界コード削除時の
自動付け替え）を解消するまでの一連の流れである。

```
Phase104   Section History Integration
    │        Section系4コマンドをpushHistory()経由でUndo/Redo対象化
    ▼
Phase105   Section Navigation
    │        チップクリック=選択+スクロール+Preview。[NAVIGATION OWNERSHIP]確立
    ▼
Phase106   Section Boundary Editing UI
    │        境界ステッパー実装。実機検証で[RENDER CONTEXT INVARIANT]を発見
    ▼
Phase107   Section Preview UX Polish
    │        Preview解除を専用ボタンからチップ再クリックのトグル方式へ
    ▼
Phase108   Section Boundary Reassignment
             境界コード削除時の隣接コードへの自動付け替え（単一削除）。
             [BOUNDARY REMAP AUTHORITY]確立。Section Data Layer完結
```

#### Phase104 — Section History Integration
- history/futureのスナップショット形状を、buffer単体から
  `{ buffer, sections }`へ拡張（`_snapshotSession()`新設）
- Section系4コマンド（create/rename/updateBoundary/delete）へ
  `pushHistory()`を追加。呼び出し位置は既存Command（deleteChordCommand等）
  と完全に同じ規則（バリデーション通過後・実際の変更の直前）に統一
- Phase103で個別追加していた`state.dirty = true`は削除し、
  `pushHistory()`内の`session.dirty = true`へ一本化（二重管理の解消）
- app.js側は無変更で要件を満たした：`undoEdit()`/`redoEdit()`が
  無条件に`_refreshEditorView()`→`renderSectionBar()`を呼ぶ既存フローが
  そのままSection Bar再描画・Preview/メニューの残留防止ガードに対応できた

#### Phase105 — Section Navigation
- `scrollToChord(chordId)`新設（chartmode.js。指定chordIdの位置まで
  DOMスクロールするだけの責務）
- クリック挙動を`_setSectionPreview()`（トグル式）から`_selectSection()`
  （常に選択+スクロール+Preview）へ変更。トグルOFFは一旦廃止
- `_previewSectionId`の意味を「Previewの対象」から「現在選択中のSection
  （Navigation Target）」へ拡張（新規state追加はせず1つの変数のまま）
- **[NAVIGATION OWNERSHIP]を確立**：`scrollToChord()`はスクロールのみを
  責務とし、Section/Playback/Preview/Selectionを一切知らない
- **ドキュメント更新ポリシーを確定**：Named Invariant（`[XXX]`形式）の
  新設・意味変更・廃止は即時にarchitecture.mdへ反映する、という運用
  ルールをdocs/handover/README.mdへ新設（判断基準のブレを解消するため）

#### Phase106 — Section Boundary Editing UI
- Section▼メニューへ境界ステッパー（「◀ 開始 ▶」「◀ 終了 ▶」）を追加し、
  Phase104で実装済みだったが未接続だった`updateSectionBoundaryCommand()`
  を初めてUIから呼び出し可能にした
- `_previewSection()`（選択同期のみ）と`_selectSection()`（選択同期+
  Navigation）を分離。▼メニューを開く操作はNavigateしない
- ★[重要発見] Section境界編集に付随して画面が意図せず動く不具合を実機検証で
  発見。真因は`renderChartMode()`の引数省略によるレイアウト崩壊
  （デフォルト値measuresPerRow=3で一瞬再描画され、直後に正しい列数へ
  戻る際のscrollHeight変動）。Phase102由来の既存バグ（3箇所）だった
- **[RENDER CONTEXT INVARIANT]を確立**：`renderChartMode()`を呼び出す
  全箇所は`{ measuresPerRow, editing }`を必ず明示的に渡す

#### Phase107 — Section Preview UX Polish
- 一度実装した専用「Preview解除」ボタンを撤回し、Phase105で廃止していた
  トグル方式（チップ再クリックで解除）へ復帰。実機検証で「解除ボタンの
  位置が分かりにくい」というフィードバックを受けた判断（Phase105の判断が
  誤りだったわけではなく、実使用評価に基づく仕様見直し）
- `.sec-chip--previewing`クラスでPreview中チップの押し込み表現を追加
  （既存token組を転用・新規token追加なし）
- `_previewSection()`/`_clearSectionPreview()`の再描画漏れ
  （`renderSectionBar()`未呼び出し）を修正

#### Phase108 — Section Boundary Reassignment
- section-model.md §4.3ケースB（境界コード削除時の隣接コードへの自動
  付け替え）を実装。Phase100-A時点でTODO化されていた最後の仕様欠落
- `reconcile()`へ第2引数`{ chordIdRemap: Map<oldId, newId> }`を追加
  （省略時は従来通りケースCのみ。後方互換）
- `deleteChordCommand()`から、削除時点で判明する「削除id→吸収先id」の
  対応を`reconcile()`へ渡すよう変更。survivor決定ロジック自体は既存の
  `_pickAbsorbingNeighbor()`（Phase75由来）をそのまま利用
- **[BOUNDARY REMAP AUTHORITY]を確立**：reconcile()はbuffer上の隣接
  関係から付け替え先を推測しない。呼び出し元が削除の事実として明示的に
  渡す（ChatGPTレビューで確立）
- start==end（単一コードSection）を特殊ケースとして扱わず、start/endへの
  独立したremap適用の自然な結果として説明する一般化した設計を採用
- スコープを単一コード削除（deleteChordCommand）のみに限定。複数選択
  削除・Merge・Paste経由の境界削除は仕様未確定のため対象外とし、
  「Compound Mutation対応」として新Issueへ分離（current-issues.md参照）

</details>

---

