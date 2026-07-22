# フェーズ進行状況

> 最終更新: Phase92完了時点

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

Current Work（現在の作業: なし・次フェーズ候補は「3. Future Candidates」参照）
------------------------------------------------------------
Phase87〜92が完了し、5フェーズ棚卸し（本更新）を実施済み。
次の主候補は未確定（Future Candidates参照）。
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

---

## 3. Future Candidates（次フェーズ候補）

詳細は `current-issues.md` のバックログを参照。

### Future Features（新機能・優先順位未定）

```
・Boundary Handleのドラッグ操作（現在はクリックによる境界移動のみ）
```

### Technical Debt（技術的負債・既存挙動の見直し）

```
・Known Design Gap（Analysis EditorとChart Mode ViewModelのモデル不一致）の解消
  buildGridViewModel()がNを表示前に除外する設計を見直す

・通常のChart Modeクリック全体への「選択+シーク」一般化
  （検索結果クリック限定分はPhase80で実装済み）

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
```

### Watch List（継続監視中・原因未特定）

```
・「緑の棒」バグ（原因未特定・次回発生時にDevToolsで実測）
・replaceCurrentAndAdvance()のbackward方向の簡略化（意図的な仕様・バグではない）
・ライブラリ：曲を開いた後、同一アーティスト内で選択行が先頭へジャンプする（退行の疑い・未調査）
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

---
