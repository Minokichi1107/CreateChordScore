/**
 * ════════════════════════════════════════
 * ChordScore Editor - Main Application
 * ════════════════════════════════════════
 * 
 * 【アプリケーション構造】
 * 
 * app.js (このファイル)
 *  - アプリ全体の統合・調整
 *  - Global State管理
 *  - イベントハンドラー集約
 *  - モーダル制御
 *  - TAPモード制御
 * 
 * chords.js
 *  - コードデータベース
 *  - ダイアグラム描画
 *  - カポ転調
 * 
 * editor.js
 *  - 譜面UI描画（renderLines）
 *  - 行ハイライト
 *  - スクロール制御
 * 
 * audio.js
 *  - 音声再生制御
 *  - TAP入力
 *  - 再生位置同期
 * 
 * project.js
 *  - プロジェクト保存/読み込み
 *  - シリアライズ/デシリアライズ
 * 
 * csvImporter.js
 *  - CSV/JSONパース
 * 
 * analysisLoader.js
 *  - analysis.raw の validate / sanitize / normalize
 *  - project.analysis への render-safe 構造の生成
 *  - beats / downbeats / timeSignature / chords の安全変換
 * 
 * modals.js
 *  - モーダルのUI lifecycle と interaction lifecycle を担当
 *  - state mutation は行わず、onConfirm / onDelete / onCopy で app.js へ通知する
 *  - モーダル土台（mOv/mTit/mBody/mBtns）は app.js が持ち、initModals() で注入する
 *
 * 
 * 【データフロー】
 * 
 * 1. ユーザー操作
 *     ↓
 * 2. Event Handler (setupEventHandlers)
 *     ↓
 * 3. State更新 (project, focLine, etc.)
 *     ↓
 * 4. 再描画トリガー (refreshEditor / renderTovLines)
 *     ↓
 * 5. UI反映 (renderLines / DOM更新)
 * 
 * 【責務配置ルール】
 * 
 * app.jsに置くもの:
 *  - Global State
 *  - setupEventHandlers
 *  - モーダル制御
 *  - TAPモード制御
 *  - State初期化（resetProject）
 * 
 * app.jsに置かないもの:
 *  - DOM描画ロジック → editor.js
 *  - コード変換 → chords.js
 *  - 音声制御 → audio.js
 *  - ファイルI/O → project.js
 */

// ════════════════════════════════════════
// IMPORTS
// ════════════════════════════════════════
import {
  CHORD_DB,
  CHORD_DB_BUILTIN_KEYS,
  drawDiagram,
  showDiagramPanel,
  setDiagRight,
  diagKey,
  diagKeyDecode,
  saveCustomDiagrams,
  loadCustomDiagrams,
  diagPushUndo,
  diagUndo,
  diagUndoSize,
  transposeChord,
  normalizeEnharmonic,
  toDisplayChord,
  toCanonicalChord,
  toReadableChord,
  fromReadableChord,
  loadReplacementMap,
  normalizeChordInput,
  normalizeChordName,
  findChord,
  getChordEntry,
  addCustomDiagram,
  removeCustomDiagram,
  updateCustomDiagram
} from './chords.js';

import {
  normalizeProject,
  createEmptyProject,
  serializeProject,
  deserializeProject,
  saveProjectToFile,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  PICKER_IDS,
  saveProjectToDB,
  getProject,
  listProjects,
  deleteProject,
  importProjectRecords,          // Phase73-D 追加
} from './project.js';

import {
  initAudioEngine,
  fmt,
  setSpeed,
  flashLine,
} from './audio.js';

import {
  mkLine,
  addChordToLine,
  highlightLine,
  scrollEditorToRow,
  renderLines
} from './editor.js';

import {
  parseCSV,
  parseJSON
} from './csvImporter.js';

import {
  initTapMode,
  updateTovTime,
  resetTovFocus
} from './tapmode.js';

import {
  initReplace,
} from './replace.js';

import {
  initPerformMode,
  openPerformMode,
  closePerformMode,
  renderPerformLines,
  updatePerformFocus,
  updatePerformPlayer,
  nextPerformPage,
  prevPerformPage,
  performState
} from './perform.js';

import { initDB, saveAsset, loadAsset, deleteAssets } from './idb.js';

import {
  initModals,
  openTimeModal,
  openRepeatModal,
  openCopyModal,
  openAddDiagramModal,
  openEditDiagramModal,
  openChordEdit,
} from './modals.js';

import { isSepToken, isNoChordToken } from './tokens.js';

import { initChordEntry, openAddChord, showChordSelector } from './chordEntry.js';

import { loadAnalysis, saveAnalysisFile, loadAnalysisFile, sanitizeChords } from './analysisLoader.js';

import {
  createAnalysisSession,
  resetSessionFields,
  pushHistory as pushHistorySession,
  undoBuffer,
  redoBuffer,
  refreshSelection,
  selectRange,
  setEditPointFields,
  clearEditPointField,
  activateSearchIndex,
  getSections, // Phase101-1: Section Bar読み取り専用表示用
} from './analysisSession.js';

import {
  deleteChordCommand,
  deleteSelectionCommand,
  copySelectionCommand,
  cutSelectionCommand,
  pasteSelectionCommand,
  buildPastePlan,
  commitPastePlan,
  mergeSelectionCommand,
  moveBoundaryCommand,
  updateChordCommand,
  splitChordCommand,
  addChordCommand,
  createSectionCommand, // Phase101-2
  renameSectionCommand, // Phase101-3
  deleteSectionCommand, // Phase101-3
  updateSectionBoundaryCommand, // Phase106
} from './analysisCommands.js';

import {
  initChartMode,
  openChartMode,
  closeChartMode,
  updateChartPlayback,
  chartState,
  renderChartMode,
  rebuildChartViewModel,
  setTooltipEnabled,
  getPerfState,
  setSelectedChordIds,
  setEditPointMarker,
  setSearchMatches,
  setSectionPreview, // Phase102
  scrollToChord, // Phase105
  getTimeForGridPosition,
} from './chartmode.js';

// ════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════
/**
 * アプリケーション全体の状態管理
 * 
 * 【責務】
 * - プロジェクトデータ（lines, title, audio, etc.）
 * - UIフォーカス状態（focLine, tapIdx, tovFocusIdx）
 * - Audio要素とURL管理
 * - モーダル/ポップアップDOM参照
 * - 置換バー状態
 * 
 * 【データフロー】
 * State更新 → refreshEditor/renderTovLines → UI反映
 * 
 * 【ルール】
 * - 直接変更可能だが、resetProject()で初期化推奨
 */

// プロジェクトデータ
let project = createEmptyProject();
let palette = [];
let paletteTranspose = 0; // session only、-6〜+6、循環
let focLine = -1;
// DESIGN CONSTRAINT: importUndoStack stores chord form snapshots
// (i.e. transposed values at the time of import, not actual pitch).
// Correctness is NOT guaranteed if capo is changed after import.
// Reason: capo change directly mutates c.chord (destructive model),
// so a snapshot taken at capo=0 becomes stale after capo changes.
// NOTE: analysis.raw canonical data is NOT affected by this constraint.
// Full resolution requires migrating capo to a projection-only model
// (architecture debt — see capo mutation state in architecture.md).
let importUndoStack = [];

// Audio関連
const aEl = document.getElementById('audio-el');
let _aURL = null;
let tapIdx = -1;


// UI状態
let _prevCapo = 0;

// diagLocked state（将来 uiState 統合時に移行予定）
let diagLocked = false;
let diagLockedChord = null;

// 右パネル現在表示中コード（Lキー用 source of truth）
let currentDiagChord = null;

// AddChord modal open 前の diagLock 退避（cancel rollback用）
let _savedDiagState = null;

// 左パネル折りたたみ state
// leftCollapsedManual: <<ボタン操作（localStorage永続）
// leftCollapsedAuto:   1440px未満でauto collapse（runtime only）
// leftExpandedOverride: narrow時にユーザーが手動展開中（runtime only）
let leftCollapsedManual = false;
let leftCollapsedAuto = false;
let leftExpandedOverride = false;
let rightHidden = false;  // 右パネル非表示フラグ（localStorage永続）

// ファイル保存
let _fileHandle = null;

// ════════════════════════════════════════
// ANALYSIS EDITOR（Phase74-C）
// ════════════════════════════════════════
/**
 * 【解析エディタ state】
 *
 * [EDITOR INVARIANT]
 * 編集モード中（analysisEditor.active === true）は
 * analysis.raw.chords を直接変更してはならない。
 * すべての編集は analysisEditor.buffer に対して行う。
 * analysis.raw.chords が更新されるのは
 * validateAnalysis() を通過した Save 実行時のみである。
 */
/**
 * [SELECTION STRUCTURE OVERVIEW]（editPoint実装前の整理・Phase77後半で確定）
 * selectionが保持する情報を役割ごとに整理する。
 *
 *   chordIds       [DERIVED CACHE] 選択対象そのもの（唯一の入力に近い値）。
 *                   buffer上の時系列順に正規化済み。他の全フィールドは
 *                   これとbufferから_refreshSelection()が導出する。
 *   anchorChordId  [DERIVED CACHE] Shift+クリック範囲選択の起点（Phase76-A）。
 *                   単一選択時はchordIds[0]と同じ。
 *   boundaryIndex   [SELECTION EDIT TARGETS] 選択範囲の左側の境界（個別移動対象）。
 *                   ↑ chordIdsが変われば自動的に再計算される派生値。
 *                   選択範囲が曲の先頭を含む場合はnull。
 *                   [Phase77後半・仕様確定] 右側の境界を動かす操作は、
 *                   ユーザー体験として冗長と判断し実装しない
 *                   （範囲シフトで同等以上のことができるため）。
 *   editPoint       [SELECTION EDIT TARGETS]（Phase77後半で実装）
 *                   挿入系コマンド（＋追加・現時点では貼り付け挿入は未実装）の対象位置。
 *                   { ownerId, measureIndex, slotIndex } または null。
 *                   chordIdsとは排他（どちらか一方のみ有効。setEditPoint()/
 *                   _refreshSelection()の両方が、もう一方を必ずクリアする）。
 *
 * この4種のフィールドはすべて「今どこを編集しようとしているか」を表す
 * 派生状態であり、chordIds（と明示的なanchorChordId）以外は
 * _refreshSelection()経由でのみ更新する。永続化は一切しない
 * （[SELECTION EDIT TARGETS]参照）。
 */
/**
 * [BOUNDARY EDIT AUTHORITY]（Phase77で確立・Phase77後半で「右端」を廃止）
 * 個別移動（境界編集）は、常に「選択範囲の左側の境界」を編集する。
 * これは「境界そのもの」の編集であり、境界を動かすとそれを挟む両側の要素
 * （left.end / right.start）が対等に更新される（どちらか一方が「主」で
 * どちらかが「従」という関係ではない）。
 *
 * 単一選択（範囲の長さ1）は特別扱いではなく、この一般化の中の1ケースにすぎない
 * （boundaryIndexは選択範囲の最初のコードのindexをfirstIdxとした時、
 * 常にfirstIdx-1を指す。範囲が曲の先頭を含む場合はnull）。
 *
 * [Phase77後半・設計判断] 当初「右側の境界」も同様に実装したが、
 * ユーザー視点で冗長と判断し撤去した。範囲全体を平行移動したい場合は
 * shiftSelectionRange()（[FORWARD WALL MODEL]）を使う。
 *
 * moveBoundary(boundaryIndex, newTime)自体は「境界を挟む2要素」という汎用処理のみを持ち、
 * どちらが「選択中」かという意味付けは持たない（意味付けは_refreshSelection()の
 * boundaryIndex算出のみが担う）。
 *
 * [SELECTION EDIT TARGETS]
 * selection.boundaryIndex・selection.editPoint は、現在編集対象と
 * なっている位置を表す一時的なUI状態である。これらは派生情報であり、
 * 現在のchordIdsやTimingModelから再計算可能である場合は再計算を優先し、
 * 永続化の対象とはしない。
 *
 * [EDIT POINT AUTHORITY]（Phase77後半で確立）
 * selection.editPoint は「挿入系コマンドの対象位置」を表す唯一の状態である。
 * editPoint は ownerId と visual グリッド座標 (measureIndex, slotIndex) のみを保持する。
 * 実時刻（splitTime）は保持しない。splitTime はコマンド実行時に
 * getTimeForGridPosition()（chartmode.js）経由でTimingModelから都度算出する。
 * これにより、pickup projection・TimingModel更新後も editPoint が
 * 古い時刻を保持することを防ぐ。
 * chordIdsとeditPointは排他（どちらか一方のみ有効。setEditPoint()/_refreshSelection()
 * の両方が、もう一方を必ずクリアする）。
 *
 * [EDIT POINT LIFETIME]（Phase77後半で確立）
 * editPoint は永続化されない一時的なUI状態（ephemeral UI state）である。
 * 以下のいずれかが起きた時点で必ずクリアされる：
 *   ・選択（chordIds）が変化した時（_refreshSelection()経由）
 *   ・project切替・Chart Modeの再構築
 * コマンド（＋追加・貼り付け等）はeditPointを消費してよいが、
 * シリアライズ（保存・Undo履歴のスナップショット等）の対象にしてはならない。
 *
 * [FORWARD WALL MODEL]（Phase77後半で導入・Phase79後半で複数回改訂・最終形）
 * shiftSelectionRange(deltaSec) は、選択範囲全体を平行移動する。境界編集
 * （moveBoundary）と異なり、選択範囲内部の各要素は基本的に同じ量だけ平行移動
 * するだけで、個々の長さは変化しない。可変なのは選択範囲の直前のコード
 * （prevChord.endのみ）と選択範囲の末尾コード（tailChord.startのみ）の2箇所だけで、
 * それ以外（選択範囲内部・nextChord）は方向に関わらず一切変更しない。
 * 左右で「どこを触るか」が変わらないため、追加の状態管理（Origin-Anchored方式）
 * を持たずに実現している。
 * 範囲が曲の先頭または末尾を含む場合は実行不可（prevChord/tailChordが存在しないため）。
 * 内部実装はmoveBoundary()を再利用する（境界更新の唯一の窓口という原則を維持）。
 * 詳細はshiftSelectionRange()本体のdocstringを参照。
 *
 * TODO(Phase78): [BOUNDARY DECORATOR]
 * Chart Mode上のハンドル・editPointマーカーは「コード要素の装飾」ではなく
 * 「編集対象位置（Boundary / EditPoint）の視覚表現」として扱う。
 * 描画ロジックを編集機能から独立させ、chartmode.js内に
 * Boundary Decoratorとして責務を分離する（境界ハンドル・editPointマーカーを
 * 同じ描画システムで統一的に扱う）。今回（Phase77）は機能実装のみ行う。
 */
// [Phase86-2 Sprint B] Session Authority（buffer/history/future/selection/search）は
// analysisSession.js へ移管。ここでは生成のみ行う（形は完全に維持。挙動変更なし）。
const analysisEditor = createAnalysisSession();

/**
 * resetAnalysisEditor — analysisEditor を初期状態へ戻す
 * Cancel / Save成功 / Project切替 / Chart Mode終了、すべてこの関数で統一する。
 */
function resetAnalysisEditor() {
  resetSessionFields(analysisEditor);
  setSearchMatches([]);
  _refreshSelection([]);
  // [Phase103-bugfix] Section Previewは_previewSectionId（app.js ephemeral）が
  // 正本のため、resetSessionFields()の対象外。Selection/Searchと同じ「唯一の
  // リセット窓口」に揃えるため、ここで明示的にクリアする（Phase102実装時の漏れ）。
  _previewSectionId = null;
  setSectionPreview([]);
}

/**
 * _refreshSelection — selectionの唯一の同期窓口（Phase76-Aで複数選択対応に拡張）
 *
 * selectionは派生状態。chordIds（と明示されたanchorChordId）だけが入力であり、
 * boundaryIndex・実際に反映されるchordIds・anchorChordIdの解決は必ずここで行う
 * （他の場所で直接書き換えない）。
 *
 * [INVARIANT] chordIdsはbuffer上の時系列順に正規化して格納する
 * （逆順クリックで渡された場合も並び替える）。
 * [INVARIANT]（Phase77後半で確定）boundaryIndexは単一選択・複数選択のどちらでも
 * 意味を持つ（選択範囲の左側の境界）。選択範囲が曲の先頭を含む場合はnull。
 * 右側の境界は対象外（範囲シフトshiftSelectionRange()で代替）。
 *
 * @param {string[]} [chordIds] - 新しい選択として確定するID配列。
 *   省略時は今のchordIdsをbufferと照合し直すだけ（Undo/Redo/削除後の再同期用）。
 * @param {string|null} [anchorChordId] - 範囲選択の起点を明示的に設定したい場合のみ指定する
 *   （通常クリック時）。省略時は「既存anchorが新しい選択に含まれていればそれを維持し、
 *   含まれていなければ選択の末尾を新しいanchorにする」というフォールバックで解決する
 *   （Shift+クリックで既存anchorを保ったまま範囲を広げるケースに対応）。
 */
function _refreshSelection(chordIds, anchorChordId) {
  // [Phase86-2 Sprint B] 実体は analysisSession.js の refreshSelection() へ移管。
  // ここは既存呼び出し箇所（4,900行超に散在）を変更しないための薄いラッパー。
  refreshSelection(analysisEditor, chordIds, anchorChordId);
}

/**
 * selectChordRange — Shift+クリックによる範囲選択（UIコマンド層・Phase76-A）
 *
 * anchorChordIdからtargetChordIdまでのbuffer上の連続区間を選択する。
 * 逆順（後ろ→前へのShiftクリック）にも対応する（内部で時系列順に正規化される）。
 *
 * [NOTE] anchorが見つからない場合（bufferから消えている等）は、
 * 通常クリックと同じ単一選択にフォールバックする。
 *
 * @param {string} anchorChordId
 * @param {string} targetChordId
 */
function selectChordRange(anchorChordId, targetChordId) {
  // [Phase86-2 Sprint B] 実体は analysisSession.js の selectRange() へ移管。
  selectRange(analysisEditor, anchorChordId, targetChordId);
}

/**
 * isAnalysisEditing — 編集モード中かどうかを判定する
 * 将来「ロック」「読み取り専用」等の状態が増えてもこの関数だけ修正すればよい。
 */
function isAnalysisEditing() {
  return analysisEditor.active;
}

/**
 * getCurrentChordSource — Chart Modeが参照すべきコードデータを返す
 *
 * [SINGLE SWITCH POINT]
 * Chart Modeのコードデータ参照はこの関数1箇所に集約する。
 * buildGridViewModel() 等は通常時/編集時の違いを意識しない。
 */
function getCurrentChordSource() {
  return isAnalysisEditing()
    ? analysisEditor.buffer
    : (project.analysis?.raw?.chords ?? []);
}

/**
 * canBeginAnalysisEdit — 編集開始可能かどうかを判定する
 * 将来「保存中」「編集ロック中」等の条件が増えてもここに集約する。
 */
function canBeginAnalysisEdit() {
  return !!project.analysis?.raw?.chords;
}

/**
 * beginAnalysisEdit — 解析編集モードを開始する
 *
 * analysis.raw.chords をディープコピーしてバッファを作る。
 * 以降の編集はすべて analysisEditor.buffer に対して行われる。
 */
function beginAnalysisEdit() {
  if (!canBeginAnalysisEdit()) {
    toast('解析データがありません');
    return;
  }
  if (isAnalysisEditing()) return;  // 二重開始ガード

  analysisEditor.active = true;
  analysisEditor.buffer = structuredClone(project.analysis.raw.chords);
  analysisEditor.history = [];
  analysisEditor.future  = [];
  analysisEditor.sections = structuredClone(project.analysis.raw.sections ?? []);
  analysisEditor.dirty = false;
  analysisEditor.search = { open: false, query: '', replaceText: '', matches: [], activeIndex: null, focusRequested: false };
  setSearchMatches([]);
  _refreshSelection([]);

  _refreshEditorView();
  toast('🛠 解析編集モードを開始しました');
}

/**
 * endAnalysisEdit — 解析編集モードを終了する（Cancel）
 *
 * buffer を破棄し、analysis.raw.chords には一切触れない。
 * Chart Modeは通常表示（raw.chords）へ戻る。
 */
function endAnalysisEdit() {
  if (!isAnalysisEditing()) return;

  resetAnalysisEditor();
  setSelectedChordIds([]);
  _refreshEditorView();
  toast('編集をキャンセルしました');
}

// [TEMP DEBUG] Phase74-C 動作確認用。実装完了後に削除すること。
window.__analysisEditorDebug = {
  beginAnalysisEdit,
  endAnalysisEdit,
  saveAnalysisEdit,
  getCurrentChordSource,
  updateChord,
  deleteChord,
  shiftAll,
  moveBoundary,
  splitChord,
  shiftSelectedBoundary,
  requestBoundaryShift,
  shiftSelectionRange,
  setEditPoint,
  clearEditPoint,
  addChordAtEditPoint,
  selectChordRange,
  deleteSelection,
  copySelection,
  cutSelection,
  pasteSelection,
  pasteAbsolute,
  getPasteOrigin,
  // [Phase87] buildPastePlanはanalysisCommands.js側でstateが第1引数になったため、
  // DevTools側の呼び出し契約（originTime, clipboardの2引数）を変えないようbindする。
  buildPastePlan: (originTime, clipboard) => buildPastePlan(analysisEditor, originTime, clipboard),
  mergeSelection,
  undoEdit,
  redoEdit,
  validateAnalysis,
  searchChords,
  openSearchBar,
  closeSearchBar,
  searchGoToNext,
  searchGoToPrev,
  replaceCurrentMatch,
  replaceCurrentAndAdvance,
  replaceAllMatches,
  get state() { return analysisEditor; },
  get editorMode() { return deriveEditorMode(analysisEditor.selection); }, // [Phase78 Sprint1]
};

// ════════════════════════════════════════
// ANALYSIS EDITOR - VALIDATION
// ════════════════════════════════════════

/**
 * validateAnalysis — 保存前の整合性チェック（Phase74-C）
 *
 * チェック項目（最小限）:
 *   - コード名が空でないか
 *   - start < end か
 *   - start が昇順か（直前のコードより開始時刻が早くないか）
 *
 * @param {object[]} chords - analysisEditor.buffer
 * @returns {string[]} エラーメッセージの配列（空配列ならOK）
 */
function validateAnalysis(chords) {
  const errors = [];

  if (!Array.isArray(chords)) {
    return ['コードデータが不正です'];
  }

  chords.forEach((c, i) => {
    if (!c.chord || c.chord.trim() === '') {
      errors.push(`${i + 1}番目: コード名が空です`);
    }
    if (c.start >= c.end) {
      errors.push(`${i + 1}番目（${c.chord}）: 開始時刻が終了時刻以降になっています`);
    }
  });

  for (let i = 1; i < chords.length; i++) {
    if (chords[i].start < chords[i - 1].start) {
      errors.push(`${i + 1}番目（${chords[i].chord}）: 直前のコードより開始時刻が早くなっています`);
    }
  }

  return errors;
}

// ════════════════════════════════════════
// ANALYSIS EDITOR - EDIT API
// ════════════════════════════════════════

/**
 * _pushHistory — 編集操作前のスナップショットをhistoryへ積む
 *
 * [INVARIANT] すべての編集API（updateChord/deleteChord/shiftAll等）は
 * buffer書き換えの直前に必ずこれを呼ぶこと。
 * 新規編集が発生したら future（Redoスタック）は破棄する
 * （標準的なUndo/Redoの挙動: Undo後に新しい編集をすると、Redo履歴は消える）。
 */
function _pushHistory() {
  // [Phase86-2 Sprint B] 実体は analysisSession.js の pushHistory() へ移管。
  pushHistorySession(analysisEditor);
}

/**
 * updateChord — 指定IDのコードのプロパティを更新する
 *
 * [Phase88 Sprint B] state mutationの実体は analysisCommands.js の
 * updateChordCommand() へ移管。この関数はDOM再描画のみを担う薄いラッパー。
 * シグネチャ・「呼べば画面まで更新される」という既存の呼び出し契約
 * （replaceCurrentMatch/addChordAtEditPoint/openChordRenameSelector/aep-add等、
 * 4箇所が依存）は変更しない。
 *
 * @param {string} id - chord._id
 * @param {{ chord?: string, start?: number, end?: number }} patch
 */
function updateChord(id, patch) {
  if (!isAnalysisEditing()) return;
  const r = updateChordCommand(analysisEditor, id, patch);
  if (!r.ok) return;
  _refreshEditorView();
}

/**
 * deleteChord — 指定コードを削除し、時間領域を隣接コードへ吸収する
 *
 * [Phase87] 実体は analysisCommands.js の deleteChordCommand() へ移管。
 * ここはstate mutation結果を受けてUI副作用（toast/Chart同期/再描画）を行う薄いラッパー。
 *
 * @param {string} id - chord._id
 * @returns {string|null} 吸収したコードの_id。削除しなかった場合はnull。
 */
function deleteChord(id) {
  if (!isAnalysisEditing()) return null;

  const r = deleteChordCommand(analysisEditor, id);
  if (!r.ok) {
    if (r.reason) toast(r.reason);
    return null;
  }

  setSelectedChordIds(r.selectedChordIds);
  _refreshEditorView();
  return r.selectedChordIds[0];
}

/**
 * deleteSelection — 選択中コードをまとめて削除する（Phase76-B）
 *
 * [Phase87] 実体は analysisCommands.js の deleteSelectionCommand() へ移管。
 * ここはstate mutation結果を受けてUI副作用を行う薄いラッパー。
 *
 * @returns {string|null} 吸収したコードの_id。削除しなかった場合はnull。
 */
function deleteSelection() {
  if (!isAnalysisEditing()) return null;

  const r = deleteSelectionCommand(analysisEditor);
  if (!r.ok) {
    if (r.reason) toast(r.reason);
    return null;
  }

  setSelectedChordIds(r.selectedChordIds);
  _refreshEditorView();
  return r.selectedChordIds[0];
}

/**
 * copySelection — 選択中コードをクリップボードへコピーする（Phase76-C）
 *
 * [DESIGN] クリップボードには絶対時刻ではなく「コード名」と「選択範囲全体に対する
 * 相対的な長さの比率（ratio）」を保存する。これにより、Paste先の時間枠の長さが
 * コピー元と異なっていても、比率を保ったまま自然に伸縮して配置できる（Phase76設計より）。
 *
 * [NOTE] Copyはbufferを読み取るだけの操作（読み取り専用）。
 * 選択がbuffer上で連続している前提はPaste側の責務であり、ここではチェックしない。
 *
 * clipboard構造（Phase79でversion 2へ拡張）:
 *   {
 *     version: 2,
 *     totalDurationSec,     // コピー範囲全体の長さ（秒）。曲末チェック等に使う
 *     chords: [{ chord, ratio, offsetSec, durationSec }, ...]
 *   }
 *   ratio                : 範囲に合わせて貼り付け（pasteSelection・Ctrl+Shift+V）が使う。
 *                           選択範囲全体に対する相対的な長さの比率（Phase76由来・変更なし）。
 *   offsetSec/durationSec : そのまま貼り付け（pasteAbsolute・Ctrl+V、Phase79）が使う。
 *                           コピー範囲先頭からの相対時刻・長さ（秒）。
 *   [DESIGN] 秒で保存する理由（Phase79設計レビューで確定）:
 *   TimingModelはimmutable・BPM変更機能は存在せず・clipboardはセッション限定のため、
 *   このプロジェクトでは秒が実質的なcanonicalとして扱える。将来「曲を跨ぐPaste」等が
 *   必要になった場合は、その時点でversionを上げて拍ベースの情報を追加する。
 *
 * @returns {boolean} コピーが成功したか（選択が空・不正な場合はfalse）
 */
function copySelection() {
  if (!isAnalysisEditing()) return false;

  // [Phase87] 実体は analysisCommands.js の copySelectionCommand() へ移管。
  const r = copySelectionCommand(analysisEditor);
  if (!r.ok) {
    if (r.reason) toast(r.reason);
    return false;
  }

  toast(`${r.count}件コピーしました`);
  return true;
}

/**
 * cutSelection — 選択中コードを切り取る（Copy + Delete・Phase76-D）
 *
 * [DESIGN] cutSelection()自体は独自ロジックを持たない。
 * copySelection() と deleteSelection() を内部で呼ぶだけ（ChatGPTレビューで確定した方針）。
 * こうすることで、Copy/Deleteそれぞれの修正がそのままCutにも反映される。
 *
 * [INVARIANT] Copyが失敗した場合はDeleteを行わない
 * （「コピーだけ失敗して削除は実行された」という中途半端な状態を作らないため）。
 *
 * [NOTE] Undo履歴にはdeleteSelection()（内部的にはdeleteChord()）の
 * _pushHistory()による1回分だけが積まれる。Copy自体は状態を変更しないため
 * Undo対象にならない（copySelection()と同じ理由）。
 *
 * @returns {string|null} 吸収したコードの_id（deleteSelectionの戻り値をそのまま返す）。
 *   何もしなかった場合はnull。
 */
function cutSelection() {
  if (!isAnalysisEditing()) return null;
  if (analysisEditor.selection.chordIds.length === 0) return null;

  // [Phase87] 実体は analysisCommands.js の cutSelectionCommand() へ移管。
  // [Q2確定事項] toast挙動は現状維持：成功時は「N件コピーしました」のみ表示し、
  // 削除成功時は無言のまま（deleteSelection()と同じ、既存UX）。
  const r = cutSelectionCommand(analysisEditor);

  // [既存挙動の再現] コピー成功時は常にtoast（deleteの成否に関わらず。
  // 元実装がcopySelection()/deleteSelection()を別々に自己完結呼び出ししていたため）。
  if (r.count != null) toast(`${r.count}件コピーしました`);

  if (!r.ok) {
    if (r.reason) toast(r.reason);
    return null;
  }

  setSelectedChordIds(r.selectedChordIds);
  _refreshEditorView();
  return r.selectedChordIds[0];
}

/**
 * pasteSelection — クリップボードの内容を選択中コードの時間枠へ「置き換え」で貼り付ける（Phase76-E）
 *
 * [DESIGN] Paste = Replace専用（Insertではない）。選択中コード（単一・複数どちらでも）の
 * 時間枠全体を、クリップボードのコード列で置き換える。将来「挿入貼り付け」が欲しくなっても
 * それは別コマンド（Paste Insert等）として追加する（ChatGPTレビューで確定した方針）。
 *
 * クリップボードの各コードはratio（コピー時点での相対時間比率）を持つため、
 * 貼り付け先の枠の長さがコピー元と異なっていても、比率を保ったまま伸縮して配置される。
 *
 * [INVARIANT] 選択範囲はbuffer上で連続していることが前提（selectChordRangeの保証）。
 * 崩れていた場合は防御的に検知し、貼り付けずtoastで知らせる（deleteSelectionと同じ考え方）。
 * [INVARIANT] 最後に生成するコードのendは浮動小数点誤差を避けるため、
 * 貼り付け先の枠のendへ直接合わせる（ratio計算の累積誤差を最後だけ吸収する）。
 * [INVARIANT] 貼り付け後、新しく生成されたコード群を自動選択する
 * （deleteChord/deleteSelectionと同じ「選択の継続先が一意に決まる操作は
 * 関数自身が選択同期を担う」という方針）。
 * [INVARIANT] Undo単位はこの関数全体で1回。
 *
 * @returns {string[]|null} 新しく生成されたコードの_id配列。失敗した場合はnull。
 */
function pasteSelection() {
  if (!isAnalysisEditing()) return null;

  // [Phase87] 実体は analysisCommands.js の pasteSelectionCommand() へ移管。
  const r = pasteSelectionCommand(analysisEditor);
  if (!r.ok) {
    if (r.reason) toast(r.reason);
    return null;
  }

  setSelectedChordIds(r.selectedChordIds);
  _refreshEditorView();
  return r.selectedChordIds;
}

/**
 * getPasteOrigin — 「そのまま貼り付け」の起点となる実時刻を返す（Phase79）
 *
 * [PASTE ORIGIN DEFINITION]
 * Paste Origin = editPoint、または選択中コードの中でbuffer上最も早い
 * コードの開始時刻（chord.start）。表示上の見た目（DOM上のセル境界・視覚的な
 * 左端）とは無関係の、データ上の実時刻である。
 * editPointの場合は getTimeForGridPosition()（chartmode.js）の戻り値を
 * その都度算出して使う（[EDIT POINT AUTHORITY]と同じ方式）。
 *
 * [SELECTION EDIT TARGETS]
 * selectionもeditPointも、この関数にとっては同じ「起点」でしかない
 * （Phase79設計レビューで確定した原則）。範囲に合わせて貼り付け
 * （pasteSelection）は逆に範囲そのものが必要なため、この関数を使わない。
 *
 * @returns {number|null} 起点の実時刻（秒）。idle等で取得できない場合はnull。
 */
function getPasteOrigin() {
  const selection = analysisEditor.selection;
  if (selection.editPoint) {
    return getTimeForGridPosition(selection.editPoint.measureIndex, selection.editPoint.slotIndex);
  }
  if (selection.chordIds.length > 0) {
    // chordIdsは_refreshSelectionでbuffer上の時系列順に正規化済みのため、
    // 先頭が「選択中で最も早いコード」になる。
    const buffer = analysisEditor.buffer;
    const first = buffer.find(c => c._id === selection.chordIds[0]);
    return first ? first.start : null;
  }
  return null; // idle
}

/**
 * pasteAbsolute — 「そのまま貼り付け」（Ctrl+V・Phase79）
 *
 * [Phase87] buildPastePlan() / commitPastePlan() の実体は analysisCommands.js へ移管。
 * ここはオーケストレーター：起点取得（getPasteOrigin、chartmode.js参照のためapp.js残置）→
 * plan作成 → 適用 → toast/Chart同期/再描画、という一連の副作用を担う。
 *
 * @returns {string[]|null} 新しく生成されたコードの_id配列。失敗時はnull。
 */
function pasteAbsolute() {
  if (!isAnalysisEditing()) return null;

  const clipboard = analysisEditor.clipboard;
  if (!clipboard || !clipboard.chords || clipboard.chords.length === 0) {
    toast('コピーされたコードがありません');
    return null;
  }

  const origin = getPasteOrigin();
  const plan = buildPastePlan(analysisEditor, origin, clipboard);
  if (!plan.ok) {
    toast(plan.reason);
    return null;
  }

  const r = commitPastePlan(analysisEditor, plan);
  setSelectedChordIds(r.selectedChordIds);
  _refreshEditorView();
  toast(`${r.count}件貼り付けました`);
  return r.selectedChordIds;
}

/**
 * mergeSelection — 連続する複数選択コードを1つに結合する（Phase76-F・Phase76最後の機能）
 *
 * [DESIGN] 結合対象は連続選択のみ（selectChordRangeの前提と同じ）。
 * 結合後のコード名は先頭コードの名前を自動採用する。気に入らなければ
 * 続けて「変更」ボタン（openChordRenameSelector、Phase75）でリネームできる。
 *
 * [INVARIANT] 確認ダイアログなし・即実行。Undo/Redoが正式な復旧手段
 * （deleteChord等、Phase75から一貫した方針）。
 * [INVARIANT] 選択が2件未満の場合は何もしない（結合する対象がないため）。
 * [INVARIANT] 結合後、新しく生成された1件を自動選択する。
 * [INVARIANT] Undo単位はこの関数全体で1回。
 *
 * @returns {string|null} 結合後の新しいコードの_id。結合しなかった場合はnull。
 */
function mergeSelection() {
  if (!isAnalysisEditing()) return null;

  // [Phase87] 実体は analysisCommands.js の mergeSelectionCommand() へ移管。
  const r = mergeSelectionCommand(analysisEditor);
  if (!r.ok) {
    if (r.reason) toast(r.reason);
    return null;
  }

  setSelectedChordIds(r.selectedChordIds);
  _refreshEditorView();
  return r.selectedChordIds[0];
}

// ════════════════════════════════════════
// ANALYSIS EDITOR - SEARCH（Phase80）
// ════════════════════════════════════════
//
// [ENGINE / UI 分離]（ChatGPTレビューで確定）
//   searchChords()      … Search Engine（pure function）。「見つける」だけ。
//   searchGoToNext/Prev … UI層。「そこへ移動する」（選択+シーク）はAnalysis
//                          Editorの責務であり、Engine自体には持たせない。
//   これにより将来、歌詞検索・ライブラリ検索等が同じsearchChords()の
//   考え方（buffer→matchIds）を再利用しやすくなる。

/**
 * searchChords — buffer内から完全一致するコードを検索する（Search Engine・pure function）
 *
 * [対象] analysisEditor.buffer の chord文字列（正本）のみ。capo変換後の
 * 表示名（transposeChord適用後）は対象外（Sprint2-2 handoverで確定済みの方針）。
 * 大文字小文字は区別しない（trim + toUpperCase比較）。
 *
 * [Phase97] ルート音の異名同音（Eb/D#等）はnormalizeEnharmonic()で吸収してから
 * 比較する。capo往復変換（画面入力→toCanonicalChord）の結果が、bufferの実際の
 * 綴りと異なるシャープ/フラット表記になるケースがあり（実機検証で確認・
 * transposeRoot()の表記決定が入力文字列のb/#有無に依存するため）、
 * 単純な文字列完全一致だと「音は同じなのに見つからない」事態が起きていた。
 * suffix（m7/M7等）の大文字小文字区別はこれまで通り変更しない。
 *
 * @param {Array} buffer - analysisEditor.buffer
 * @param {string} query - 検索文字列
 * @returns {string[]} 一致したchordの_id配列（buffer順）
 */
function searchChords(buffer, query) {
  const q = String(query ?? '').trim();
  if (!q || !buffer) return [];
  const qKey = normalizeEnharmonic(q);
  // [Phase83] case-sensitiveへ変更。findChord()/CHORD_DBのlookupと同じ原則
  // （m7とM7は別物）に統一する。大文字小文字を区別しないと、例えば
  // "AM7"で検索した際に意味の異なる"Am7"まで誤ヒットし、全置換時に
  // 意図しないコードまで書き換えてしまう危険があった。
  return buffer
    .filter(c => normalizeEnharmonic(String(c.chord ?? '').trim()) === qKey)
    .map(c => c._id);
}

/**
 * openSearchBar / closeSearchBar — 検索バーの表示切替（Ctrl+F / ✕ボタン / Escape）
 */
function openSearchBar() {
  if (!isAnalysisEditing()) return;
  analysisEditor.search.open = true;
  analysisEditor.search.focusRequested = true;
  _refreshEditorView();
}
function closeSearchBar() {
  analysisEditor.search = { open: false, query: '', replaceText: '', matches: [], activeIndex: null, focusRequested: false };
  setSearchMatches([]);
  _refreshEditorView();
}

/**
 * _activateSearchMatch — 検索結果のうちindex番目を「選択+シーク」する（UI層）
 *
 * [設計] 検索結果のクリック/Next/Prevは、既存のselection authorityと
 * seek機構（aEl.currentTime）にそのまま乗せる。検索専用の選択・シーク機構は
 * 新設しない（既存のinitChartMode注入のseekTo callbackと同じ書き方で
 * aEl.currentTimeを直接設定する）。
 *
 * [Phase90] wrap-around index計算 + search.activeIndex確定のstate mutationは
 * analysisSession.js の activateSearchIndex() へ委譲（Session Authority）。
 * ここに残るのはselection同期・Chart Mode同期・audio seek・DOM再描画という
 * 副作用のみ（history非対象・pushHistory()は元々呼ばれていない）。
 *
 * @param {number} index - matches配列内のindex（範囲外はラップアラウンド）
 */
function _activateSearchMatch(index) {
  const id = activateSearchIndex(analysisEditor, index);
  if (id == null) return;
  _refreshSelection([id]);
  setSelectedChordIds([id]);
  const chord = analysisEditor.buffer.find(c => c._id === id);
  if (chord) aEl.currentTime = chord.start;
  _refreshEditorView();
}

function searchGoToNext() {
  const { activeIndex } = analysisEditor.search;
  _activateSearchMatch(activeIndex === null ? 0 : activeIndex + 1);
}
function searchGoToPrev() {
  const { activeIndex } = analysisEditor.search;
  _activateSearchMatch(activeIndex === null ? 0 : activeIndex - 1);
}

/**
 * replaceCurrentMatch — 現在フォーカス中の検索結果1件を置換する
 *
 * [設計] updateChord()をそのまま呼ぶ。updateChord()は既にbuffer authorityへの
 * 唯一の書き込み窓口（_pushHistory→Object.assign→_refreshEditorView）として
 * Phase74-Cで確立済みのため、置換専用の別ロジックを重複させない。
 */
function replaceCurrentMatch(newName) {
  if (!isAnalysisEditing()) return;
  if (!String(newName ?? '').trim()) return; // 空文字での置換は行わない
  const { matches, activeIndex } = analysisEditor.search;
  if (activeIndex === null || !matches[activeIndex]) return;
  updateChord(matches[activeIndex], { chord: newName });
}

/**
 * replaceCurrentAndAdvance — 現在の検索結果を置換し、次/前のヒットへ移動する
 * （Phase80・実機フィードバックにより常設の置換欄からEnter/Shift+Enterで
 * 呼べるようにした。ボタンからの「置換」もこの関数を通す＝direction:1固定）。
 *
 * [既知の簡略化] 置換によりコード名がqueryと一致しなくなった場合、matchesは
 * 1つ前に詰まる（削除したのと同じ効果）。そのため置換前と同じactiveIndexが
 * 自然に「次のヒット」を指すようになる（forward方向は正しく動作する）。
 * backward（Shift+Enter）方向でこの「詰まり」が起きた場合、本来の「前へ」より
 * 1つ手前が飛ばされる可能性がある。個人用ツールの利用頻度に対して、
 * 削除前のindex集合を保持する厳密な再計算を行うコストは見合わないため、
 * この簡略化を許容する。
 *
 * @param {1|-1} direction - 1: 置換して次へ／-1: 置換して前へ
 */
function replaceCurrentAndAdvance(direction) {
  if (!isAnalysisEditing()) return;
  const { matches, activeIndex, replaceText } = analysisEditor.search;
  if (activeIndex === null || !matches[activeIndex] || !String(replaceText ?? '').trim()) return;
  const targetId = matches[activeIndex];
  // [Phase82] replaceTextは表示名。bufferへの書き込みは実音でなければならないため、
  // ここでtoCanonicalChord()を通す（Rename/AddChordと同じ変換境界）。
  // [Phase83] IME全角混入対策でnormalizeChordInput()を先に通す。
  replaceCurrentMatch(toCanonicalChord(normalizeChordInput(replaceText), getCapo())); // buffer更新 → _refreshEditorView()でmatches再計算・クランプ済み
  const stillMatches = analysisEditor.search.matches.includes(targetId);
  const newIndex = analysisEditor.search.activeIndex;
  if (stillMatches) {
    // 置換後も同じクエリに一致する（例: 大文字小文字の書き直しのみ等）→ 明示的に前後へ移動
    _activateSearchMatch(newIndex + direction);
  } else if (analysisEditor.search.matches.length) {
    // 上記[既知の簡略化]参照。クランプ済みのactiveIndexをそのままアクティブ化する
    // （選択+シークをその位置に同期させるため）。
    _activateSearchMatch(newIndex ?? 0);
  }
}

/**
 * replaceAllMatches — 検索でヒットした全コードを一括置換する
 *
 * [UNDO INVARIANT] Undo単位はこの関数全体で1回。updateChord()をループ呼びしない
 * （ループ呼びするとヒット件数分Undo履歴が積まれ、Paste/Merge等で確立した
 * 「一括操作はUndo 1回」という既存原則が崩れるため。commitPastePlan()と同じ
 * 「_pushHistory()を1回だけ呼び、bufferへ直接書き込む」パターンを踏襲する）。
 *
 * @param {string} newName
 * @returns {number} 置換した件数
 */
function replaceAllMatches(newName) {
  if (!isAnalysisEditing()) return 0;
  if (!String(newName ?? '').trim()) return 0; // 空文字での置換は行わない
  const { matches } = analysisEditor.search;
  if (!matches.length) return 0;
  const targetIds = new Set(matches);
  _pushHistory();
  for (const c of analysisEditor.buffer) {
    if (targetIds.has(c._id)) c.chord = newName;
  }
  _refreshEditorView();
  return targetIds.size;
}

/**
 * shiftAll — 全コードの開始・終了時刻を一括でシフトする
 *
 * duration（end - start）を保持したままシフトする。
 * start が 0 未満にならないようガードする（end は duration を保って追従）。
 *
 * @param {number} deltaSec - シフト量（秒）。正の値で後ろへ、負の値で前へ。
 */
function shiftAll(deltaSec) {
  if (!isAnalysisEditing()) return;
  _pushHistory();
  analysisEditor.buffer.forEach(c => {
    const duration = c.end - c.start;
    // [CLAMP NOTE] start が0未満になる場合は0にクランプする。
    // この時 duration は保持されるが、クランプされた分だけ
    // 実際のシフト量は deltaSec より小さくなる（意図的な仕様）。
    c.start = Math.max(0, c.start + deltaSec);
    c.end   = c.start + duration;
  });
  _refreshEditorView();
}

/**
 * moveBoundary — 境界更新API（境界を変更する唯一の窓口）
 *
 * [Phase88 Sprint A] 実体は analysisCommands.js の moveBoundaryCommand() へ移管。
 * シグネチャ・戻り値・[BOUNDARY EDIT AUTHORITY]（唯一の窓口という原則）は変更なし。
 * historyもDOMもここでは扱わない（呼び出し側の責務。moveBoundaryCommandのdocstring参照）。
 *
 * @returns {number|null} 適用された時刻。境界が存在しなければnull。
 */
function moveBoundary(boundaryIndex, newTime) {
  if (!isAnalysisEditing()) return null;
  return moveBoundaryCommand(analysisEditor, boundaryIndex, newTime);
}

/**
 * setEditPoint — editPoint（挿入位置）を確定する（UIコマンド層）
 * [Phase77後半] chartmode.jsのクリックハンドラから呼ばれる。
 *
 * @param {string|null} ownerId - クリックされたセルのオーナーコードid。
 *   コードクリック起因（2回目クリック）ならchartmode.js側で確定済みの値を渡す。
 *   空セルクリック（data-chord-idを持たないセル）の場合はnullを渡し、
 *   この関数側で時刻からbufferを検索してオーナーを特定する。
 * @param {number} measureIndex
 * @param {number} slotIndex
 */
function setEditPoint(ownerId, measureIndex, slotIndex) {
  if (!isAnalysisEditing()) return;

  let resolvedOwnerId = ownerId;
  if (!resolvedOwnerId) {
    // 空セルクリック: クリック位置の実時刻を求め、その時刻を含むbufferエントリを
    // オーナーとする（buffer上は必ずどこかのエントリに属している。
    // 曲頭の無音区間等も'N'エントリとして実在するため）。
    const time = getTimeForGridPosition(measureIndex, slotIndex);
    if (time == null) { toast('この位置の時刻を取得できませんでした'); return; }
    const owner = analysisEditor.buffer.find(c => time >= c.start && time < c.end);
    if (!owner) { toast('この位置には既存データがありません'); return; }
    resolvedOwnerId = owner._id;
  }

  // [Phase86-2 Sprint B] state書き換えの実体は analysisSession.js の setEditPointFields()。
  setEditPointFields(analysisEditor, resolvedOwnerId, measureIndex, slotIndex);

  // [UI SYNC] chartmode.js側の選択キャッシュも同時にクリアする
  // （Phase75の「選択の二重管理・同期漏れ」の教訓を踏まえ、この関数自身が両方を担う）。
  setSelectedChordIds([]);
  _refreshEditorView();
}

/**
 * clearEditPoint — editPointを解除する（Escキー等から呼ばれる）
 */
function clearEditPoint() {
  // [Phase86-2 Sprint B] 実体は analysisSession.js の clearEditPointField()。
  if (!clearEditPointField(analysisEditor)) return;
  _refreshEditorView();
}

/**
 * addChordAtEditPoint — editPointの位置へ新規コードを1件挿入する（Add Here本体）
 * [Phase77後半]
 *
 * 実体はPhase75の「追加」ボタン（aep-add）と同じ splitChord() → updateChord() の
 * 組み合わせ。違いは splitTime が「選択中コードの中間点固定」ではなく、
 * editPointのグリッド座標から都度算出した時刻になる点のみ。
 *
 * [CANCEL INVARIANT] showChordSelector()でキャンセルした場合、splitChord()自体が
 * 呼ばれないため、bufferもeditPointも一切変化しない
 * （「編集操作はユーザーの確定操作でのみ状態を変更する」というPhase74以来の方針）。
 */
function addChordAtEditPoint() {
  const editPoint = analysisEditor.selection.editPoint;
  if (!editPoint) return;

  const owner = analysisEditor.buffer.find(c => c._id === editPoint.ownerId);
  if (!owner) { toast('この位置には既存データがありません'); return; }

  const splitTime = getTimeForGridPosition(editPoint.measureIndex, editPoint.slotIndex);
  if (splitTime == null) { toast('この位置の時刻を取得できませんでした'); return; }

  const capo = getCapo();
  showChordSelector({
    title: 'コードを追加',
    // [Phase84] 初期表示のみRepresentation→Projectionの順で適用。
    // 選択結果(selected.name)は新規に選ばれた値であり、Representation変換は
    // 不要（Rename等と同じ書き込み経路。設計上の理由はhandover_phase84参照）。
    initialChord: toDisplayChord(toReadableChord(owner.chord), capo),
    onSelect: (selected) => {
      // [Phase89] 分割+リネームをaddChord()で1Undo単位に統合（Issue #46対応）。
      // 新規コードの単独選択・editPointの自動クリアはaddChordCommand内部で行う。
      const newId = addChord(owner._id, splitTime, toCanonicalChord(selected.name, capo));
      if (!newId) { toast('この位置には追加できません（時間が足りません）'); return; }
    },
    // onCancel省略: 何も呼ばれず、addChord()にも到達しないためeditPointは維持される
  });
}

/**
 * splitChord — 指定コードを splitTime で2つに分割する（コード追加の実体・Phase75）
 *
 * [Phase88 Sprint B] state mutationの実体は analysisCommands.js の
 * splitChordCommand() へ移管（[SPLIT INVARIANTS]はそちらのdocstringに移設）。
 * この関数はDOM再描画のみを担う薄いラッパー。シグネチャ・戻り値
 * （新規コードの_id、失敗時null）・「呼べば画面まで更新される」という
 * 既存の呼び出し契約（addChordAtEditPoint/aep-add等、2箇所が依存）は変更しない。
 *
 * @param {string} chordId - 分割対象のコードの _id
 * @param {number} splitTime - 分割点の時刻（秒）
 * @returns {string|null} 新しく生成された右側コードの _id。失敗時は null。
 */
function splitChord(chordId, splitTime) {
  if (!isAnalysisEditing()) return null;
  const r = splitChordCommand(analysisEditor, chordId, splitTime);
  if (!r.ok) return null;
  _refreshEditorView();
  return r.newId;
}

/**
 * addChord — 「コードを追加」操作（分割＋リネーム）を1回のUndo単位で実行する
 * （Phase89新設・Issue #46対応）
 *
 * [Issue #46] 従来は splitChord() → updateChord() の直列呼び出しにより、
 * ユーザーからは1回の操作に見える「コードを追加」がUndo単位2回に分かれていた。
 * state mutationの実体は analysisCommands.js の addChordCommand() へ移管し、
 * この関数はChart Mode同期・DOM再描画のみを担う薄いラッパー。
 *
 * @param {string} chordId - 分割対象のコードの _id
 * @param {number} splitTime - 分割点の時刻（秒）
 * @param {string} newChordName - 新規コードに設定するchord名（canonical）
 * @returns {string|null} 新しく生成された右側コードの _id。失敗時は null。
 */
function addChord(chordId, splitTime, newChordName) {
  if (!isAnalysisEditing()) return null;
  const r = addChordCommand(analysisEditor, chordId, splitTime, newChordName);
  if (!r.ok) return null;
  setSelectedChordIds([r.newId]);  // Chart Mode側ハイライト表示用の選択情報
  _refreshEditorView();
  return r.newId;
}

/**
 * openChordRenameSelector — コード名変更ダイアログを開く（Phase75）
 *
 * [SINGLE ENTRY POINT] 「変更」ボタン・将来のコード名クリックの両方が
 * この関数を呼ぶだけで済むよう、ロジックをここに1箇所集約する。
 *
 * @param {object} chord - analysisEditor.buffer 内のコードオブジェクト（_id/chordを持つ）
 */
function openChordRenameSelector(chord) {
  if (!chord) return;
  const capo = getCapo();
  showChordSelector({
    title: 'コード名を変更',
    // [Phase84] 初期表示のみRepresentation→Projectionの順で適用（書き込み側は変更なし）。
    initialChord: toDisplayChord(toReadableChord(chord.chord), capo),
    onSelect: (selected) => {
      updateChord(chord._id, { chord: toCanonicalChord(selected.name, capo) });
      // [NOTE] 変更は既存コードの上書きのみ。buffer長は変わらないため
      // selection（chordIds/boundaryIndex）はどちらも変化しない
      // （splitChordのような_refreshSelection()呼び出しは不要）。
    },
    // onCancel省略: 何も呼ばれないため状態は一切変化しない
  });
}

/**
 * shiftSelectedBoundary — 選択範囲の左側の境界を相対量シフトする（UIコマンド層）
 * [Phase77後半・確定] 右側の境界を動かす操作は撤去した（ユーザー視点で冗長と判断）。
 * 範囲全体を平行移動したい場合はshiftSelectionRange()を使う。
 * 単一選択時は「範囲の長さ1」として同じロジックで扱われる（特別扱いなし）。
 * [UI MAPPING] 将来ドラッグ方式に変える際はこの関数だけ差し替えればよい。
 *
 * @param {number} deltaSec - シフト量（秒）。矢印キー/ボタン共通で使用。
 */
function shiftSelectedBoundary(deltaSec) {
  if (!isAnalysisEditing()) return;
  // [Phase77後半・確定] 個別移動は単一選択専用（UIも単一選択時のみ表示）。
  // 複数選択時は「選択範囲の先頭コードだけ動く」という違和感が生じるため、
  // 範囲シフト（shiftSelectionRange）へ誘導する。
  if (analysisEditor.selection.chordIds.length > 1) {
    toast('複数選択中は範囲シフトをご利用ください');
    return;
  }
  const boundaryIndex = analysisEditor.selection.boundaryIndex;
  if (boundaryIndex === null) { toast('コードを選択してください'); return; }

  const left  = analysisEditor.buffer[boundaryIndex];
  const right = analysisEditor.buffer[boundaryIndex + 1];
  const proposed = left.end + deltaSec;

  if (proposed <= left.start || proposed >= right.end) {
    toast('選択したコードの長さが0以下になるため移動できません');
    return;
  }

  _pushHistory();
  moveBoundary(boundaryIndex, proposed);
  _refreshEditorView();
}

/**
 * requestBoundaryShift — 矢印キー・ボタンによるBoundary Handle操作の入口
 * [Sprint2-2]
 *
 * shiftSelectedBoundary() への薄い委譲。
 *
 * [Phase93] ドラッグ操作はこの関数を経由しない。ドラッグはポインター位置から
 * 都度「絶対時刻」を算出するため、この関数が想定する「相対量（deltaSec）」の
 * インターフェースとは自然に噛み合わない（毎回deltaを逆算する方が複雑になる）。
 * そのため専用の入口（_handleBoundaryDragStart/_handleBoundaryDragMove/
 * _handleBoundaryDragEnd）を別途新設した。両者ともmoveBoundary()という
 * 唯一の窓口を経由する点は変わらない（[BOUNDARY EDIT AUTHORITY]維持）。
 *
 * @param {number} deltaSec - シフト量（秒）
 */
function requestBoundaryShift(deltaSec) {
  shiftSelectedBoundary(deltaSec);
}

/**
 * _computeSelectionMeasureSpan — 選択範囲の小節数を計算する（Phase94 C1）
 *
 * step = 1 / beatsPerMeasure で丸める（4/4では結果的に0.25になる。
 * 表示先は renderAnalysisEditorPanel()のフッターサマリー欄
 *。Chart Modeヘッダーは chartmode.js所有のためここでは触らない。
 *
 * @returns {{measures: number, text: string}|null}
 */
function _computeSelectionMeasureSpan() {
  const ids = analysisEditor.selection.chordIds;
  if (!ids || ids.length === 0) return null;

  const buffer = analysisEditor.buffer;
  // [INVARIANT] chordIdsはbuffer上の時系列順に正規化済み（_refreshSelection参照）
  const first = buffer.find(c => c._id === ids[0]);
  const last  = buffer.find(c => c._id === ids[ids.length - 1]);
  if (!first || !last) return null;

  const bpm = project.analysis?.bpm;
  const beatsPerMeasure = project.analysis?.timeSignature?.numerator || 4;
  if (!bpm) return null;

  const measureSeconds = (60 / bpm) * beatsPerMeasure;
  const rawMeasures = (last.end - first.start) / measureSeconds;

  const step = 1 / beatsPerMeasure;
  const rounded = Math.round(rawMeasures / step) * step;

  const text = rounded < 1
    ? `${Math.round(rounded * beatsPerMeasure)}拍`
    : `${parseFloat(rounded.toFixed(2))}小節`;

  return { measures: rounded, text };
}

/**

 * _getChordBufferIndex — chordIdからbuffer上のindexを返す（Phase95-A2）。
 *
 * [OWNERSHIP] bufferの唯一の問い合わせ窓口。chartmode.jsはbufferを
 * 直接持たないため、initChartMode()経由でこの関数をaccessorとして注入する
 * （getAnalysis/getNormalizedと同じ依存注入パターン）。
 * 将来 Map<id,index> 等へキャッシュ化する場合もこの関数の中身のみ差し替えれば良く、
 * chartmode.js側は無修正で済む。
 *
 * @param {string} chordId
 * @returns {number} 見つからなければ -1
 */
function _getChordBufferIndex(chordId) {
  return analysisEditor.buffer.findIndex(c => c._id === chordId);
}

/**
 * [Phase95-A2] Boundary Drag Runtime（ephemeral・selectionとは独立）
 *
 * [OWNERSHIP] ドラッグ中のみ存在する一時状態。analysisEditor.selectionは
 * 一切変更しない（「今選択中のコード」と「今ドラッグ中の境界」は別概念）。
 * null = 非ドラッグ中。
 * { chordId, boundaryIndex } | null
 */
let _boundaryDragState = null;

/**
 * _handleBoundaryDragStart — Boundary Handleドラッグ確定時に1回だけ呼ばれる
 * （Phase93・Phase95-A2でchordId起点へ変更）。
 * chartmode.jsのpointermoveハンドラが8pxしきい値を超えた瞬間に1回だけ呼ぶ。
 *
 * [Phase95-A2] selection.boundaryIndexへの依存を廃止し、渡されたchordIdから
 * その場でboundaryIndexを導出する。これにより「選択中とは別のコードの境界を
 * hoverから直接ドラッグする」ケースにも対応する（selectionは一切変更しない）。
 *
 * [UNDO TRANSACTION INVARIANT] ドラッグ全体を1回のUndo単位にするため、
 * historyはここで1回だけpushする。以降の_handleBoundaryDragMove()の
 * 連続呼び出しはhistoryを積まない（moveBoundaryCommandがこの前提
 * ＝ドラッグ中の連続呼び出しを想定して設計されているため。
 * analysisCommands.jsのdocstring参照）。
 *
 * @param {string} chordId - ドラッグ対象コードの_id（chartmode.jsのpointerdownで取得済み）
 */
function _handleBoundaryDragStart(chordId) {
  if (!isAnalysisEditing()) return;
  const idx = _getChordBufferIndex(chordId);
  if (idx <= 0) return; // 曲頭（左境界なし）・該当なしは対象外
  _boundaryDragState = { chordId, boundaryIndex: idx - 1 };
  _pushHistory();
}

/**
 * _handleBoundaryDragMove — ドラッグ中、対象slotが変化するたびに呼ばれる（Phase93）。
 * chartmode.js側でslot単位の間引き済みのため、この関数自体は間引きを行わない
 * （呼ばれた分だけ処理する）。
 *
 * [UI Constraint] shiftSelectedBoundary()と同じ理由（Chart Modeとの整合性）で
 * 最低1スロット分の長さを残す。ただし単発操作（button/矢印キー）と異なり
 * 連続呼び出し前提のため、壁に到達した場合はshiftSelectionRange()と同様、
 * トーストを出さずに静かにclampする（毎pointermoveでトーストが出るのを防ぐ）。
 *
 * @param {number} newTime - chartmode.jsが算出した候補時刻（絶対時刻）
 */
function _handleBoundaryDragMove(newTime) {
  if (!isAnalysisEditing() || !_boundaryDragState) return;
  const { boundaryIndex } = _boundaryDragState;

  const left  = analysisEditor.buffer[boundaryIndex];
  const right = analysisEditor.buffer[boundaryIndex + 1];
  if (!left || !right) return;

  const EPS = 1e-6;
  // [UI Constraint] Chart Modeとの整合性のため最低1スロット分は残す
  const minRemaining = _getMinSlotDuration(left.start) ?? EPS;
  const minTime = left.start + minRemaining;
  const maxTime = right.end - minRemaining;
  if (minTime >= maxTime) return; // 壁同士が反転＝これ以上動かせない

  const clamped = Math.min(Math.max(newTime, minTime), maxTime);

  moveBoundary(boundaryIndex, clamped);
  _refreshEditorView();
}

/**
 * _handleBoundaryDragEnd — pointerup/pointercancel時に1回だけ呼ばれる（Phase93）。
 *
 * [Phase95-A2] _boundaryDragStateをここでクリアする（次回ドラッグ開始時に
 * 古いboundaryIndexが残留しないようにするため）。
 * chartmode.js側のドラッグ内部state（_boundaryDrag等）の後始末は
 * chartmode.js自身の責務であり、ここでは行わない。
 *
 * 将来ghost line等の専用プレビューstateを導入する場合はここで後始末する
 * （[DECORATOR ADDITION RULE]に従い、chartState側にプレビュー専用フィールドと
 * 専用setterを追加した上でクリアする）。
 */
function _handleBoundaryDragEnd() {
  _boundaryDragState = null;
}

/**
 * _getMinSlotDuration — 指定時刻が属する小節の「1スロット分の時間長」を返す。
 * [UI Constraint] shiftSelectionRange()専用のヘルパー。
 * Chart ModeのresolveCollision()は、1スロット内で複数onsetが衝突した場合
 * durationの長い方を採用する。範囲シフトでprevChord/tailChordを理論上
 * ゼロ近くまで縮めると、この衝突解決により描画対象から脱落し、選択
 * ハイライト等も表示できなくなる。Forward Wall Model自体の仕様ではなく、
 * 現行のChart Modeレンダラーとの整合性を保つための制約として、
 * ここで最小残存長を計算する。
 * Chart Modeが未表示・fallbackモード等で取得できない場合はnullを返し、
 * 呼び出し側でEPSへフォールバックする。
 */
function _getMinSlotDuration(atTime) {
  const model = chartState.viewModel?.model;
  if (!model || typeof model.quantize !== 'function' || typeof model.getMeasure !== 'function') return null;
  const q = model.quantize(atTime);
  if (!q || q.measure == null || q.measure < 0) return null;
  const measure = model.getMeasure(q.measure);
  if (!measure || !model.slotsPerMeasure) return null;
  return (measure.endTime - measure.startTime) / model.slotsPerMeasure;
}

/**
 * shiftSelectionRange — 選択範囲全体を平行移動する（UIコマンド層）
 * [FORWARD WALL MODEL]（Phase79後半で確立・複数回の改訂を経て最終形）
 *
 * [DESIGN] prevChord.start と tailChord.end を固定し、prevChord.end と
 * tailChord.start のみを可変とすることで、追加の状態管理を持たずに
 * 範囲シフトを実現する。nextChordは常に不変。
 *
 *   可変なのは「選択範囲の直前のコード（prevChord）」と「選択範囲の末尾
 *   コード（tailChord）」の2つだけ。それ以外（選択範囲内部・nextChord）は
 *   方向に関わらず一切変更しない。左右で「どこを触るか」が変わらない。
 *
 *   右方向シフト（deltaSec > 0）:
 *     prevChord.end   : 伸びる（吸収）
 *     選択範囲の内部    : 完全に長さを保ったまま平行移動
 *     tailChord.start : 右へ移動（endは固定＝縮む）
 *     nextChord        : 一切変更しない
 *
 *   左方向シフト（deltaSec < 0）:
 *     prevChord.end   : 左へ移動（startは固定＝縮む）
 *     選択範囲の内部    : 完全に長さを保ったまま平行移動
 *     tailChord.start : 左へ移動（吸収）
 *     nextChord        : 一切変更しない
 *
 * 右→左（またはその逆）の単純な往復では数値が元に戻るが、これは
 * Undo/Split/Delete/Paste/Merge等、他の編集操作と組み合わせた場合の
 * 挙動まで保証するものではない。
 *
 * [内部境界の自動一致] 選択範囲内部の最後の要素（例: C#m）とtailChord（D）の
 * 境界は、両方に同じactualDeltaを加算するだけで自動的に一致する
 * （moveBoundary()の追加呼び出しは不要。同一の浮動小数点値に同一のdeltaを
 * 加算すれば結果もビット単位で一致するため）。
 *
 * [UI Constraint] 最低1スロット分の長さを残す（_getMinSlotDuration参照）。
 *
 * [INVARIANT] chordIdsはbuffer上の時系列順に正規化済み（_refreshSelection参照）のため、
 * ids[0] / ids[ids.length-1] をそのままfirst/lastとして利用できる（毎回のsort不要）。
 *
 * 境界更新にはmoveBoundary()を再利用する（[BOUNDARY EDIT AUTHORITY]：
 * 境界更新の唯一の窓口という原則を維持するため）。
 *
 * @param {number} deltaSec - シフト量（秒）。正で後ろへ、負で前へ。
 */
function shiftSelectionRange(deltaSec) {
  if (!isAnalysisEditing()) return;
  const ids = analysisEditor.selection.chordIds;
  if (ids.length === 0) { toast('コードを選択してください'); return; }
  // [Phase77後半・確定] 範囲シフトは複数選択専用（UIも複数選択時のみ表示）。
  // 単一コードの伸縮は個別移動（shiftSelectedBoundary）でカバーする。
  if (ids.length === 1) { toast('単一選択中は個別移動をご利用ください'); return; }

  const buffer = analysisEditor.buffer;
  // [INVARIANT] chordIdsはbuffer上の時系列順に正規化済み（_refreshSelection参照）
  const firstIdx = buffer.findIndex(c => c._id === ids[0]);
  const lastIdx  = buffer.findIndex(c => c._id === ids[ids.length - 1]);

  if (firstIdx <= 0 || lastIdx >= buffer.length - 1) {
    toast('曲の端のコードを含むため、これ以上移動できません');
    return;
  }

  const EPS = 1e-6;
  const prevChord = buffer[firstIdx - 1]; // 入口（endのみ可変）
  const tailChord = buffer[lastIdx];      // 出口（startのみ可変）

  const isForward = deltaSec > 0;
  const limitChord = isForward ? tailChord : prevChord;
  const limitLen = limitChord.end - limitChord.start;

  // [UI Constraint] Chart Modeとの整合性のため最低1スロット分は残す
  const minRemaining = _getMinSlotDuration(limitChord.start) ?? EPS;

  const actualDelta = isForward
    ? Math.min(deltaSec, Math.max(0, limitLen - minRemaining))
    : Math.max(deltaSec, -Math.max(0, limitLen - minRemaining));

  if (actualDelta === 0) return; // 壁に到達済み・トーストなしで静かに無視

  _pushHistory();

  // 選択範囲の内部（先頭〜末尾-1）を平行移動。方向による分岐は無い。
  for (let i = firstIdx; i < lastIdx; i++) {
    buffer[i].start += actualDelta;
    buffer[i].end   += actualDelta;
  }
  tailChord.start += actualDelta; // 出口: startのみ更新（endは不変）
  moveBoundary(firstIdx - 1, buffer[firstIdx].start); // 入口: prevChord.endのみ更新

  // [INVARIANT CHECK] actualDeltaはlimitLenでクランプ済みのため、
  // ここで負の長さになることは理論上あり得ない。もし発生したらactualDelta計算自体の
  // バグなので、黙って修正せずthrowして早期発見する（Defensive Clampは意図的に採用しない）。
  if (tailChord.end - tailChord.start < -EPS || prevChord.end - prevChord.start < -EPS) {
    throw new Error('[FORWARD WALL MODEL] invariant violated: negative chord length');
  }

  _refreshEditorView();
}

/**
 * undoEdit — 直前の編集操作を取り消す
 */
function undoEdit() {
  if (!isAnalysisEditing()) return;
  // [Phase86-2 Sprint B] buffer入替の実体は analysisSession.js の undoBuffer()。
  // history/future stack semanticsは変更していない（past/future stack方式のまま）。
  if (!undoBuffer(analysisEditor)) return;
  _refreshSelection();
  _refreshEditorView();
}

/**
 * redoEdit — undoEdit() で取り消した操作をやり直す
 */
function redoEdit() {
  if (!isAnalysisEditing()) return;
  if (!redoBuffer(analysisEditor)) return;
  _refreshSelection();
  _refreshEditorView();
}

/**
 * saveAnalysisEdit — 解析編集モードの内容を保存する
 *
 * 保存フロー:
 *   validateAnalysis() で整合性チェック
 *   ↓ OK
 *   analysis.raw.chords = buffer のコピー
 *   saveAnalysisFile() で永続化
 *   ↓ 成功
 *   project.analysis（確定済み）で再描画 → その後モード終了
 *   ↓ 失敗
 *   編集モードのまま継続（データ消失防止）
 */
async function saveAnalysisEdit() {
  if (!isAnalysisEditing()) return;

  const errors = typeof validateAnalysis === 'function'
    ? validateAnalysis(analysisEditor.buffer)
    : [];

  if (errors.length > 0) {
    toast(`⚠ 保存できません: ${errors[0]}`);
    return;
  }

  project.analysis.raw.chords = structuredClone(analysisEditor.buffer);
  project.analysis.chords = sanitizeChords(project.analysis.raw.chords);
  project.analysis.raw.sections = structuredClone(getSections(analysisEditor));
  const ok = await saveAnalysisFile(project.id, project.analysis.raw, project.analysis.repairRule ?? null);
  if (!ok) {
    toast('⚠ 保存に失敗しました。編集内容は失われていません');
    return;
  }

  // [ORDER] 確定済み project.analysis.raw.chords を使って先に再描画してから
  // モードを終了する。getCurrentChordSource() は raw.chords を見るため、
  // resetAnalysisEditor() の前後どちらでも同じ結果になるが、
  // 責務を明確にするため「保存確定→描画→モード終了」の順に固定する。
  rebuildChartViewModel();
  resetAnalysisEditor();
  setSelectedChordIds([]);
  renderChartMode({ measuresPerRow: chartMeasuresPerRow });
  renderAnalysisEditorPanel();
  renderSectionBar(); // Phase101-1
  toast('✅ 解析データを保存しました');
}

/**
 * _refreshEditorView — 編集モード中のChart Mode再描画（UI専用）
 *
 * [RESPONSIBILITY] DOM更新・Chart再描画のみを行う。
 * history / dirty / selection / buffer の変更はここでは行わない
 * （編集API側の責務）。
 */
function _refreshEditorView() {
  if (!chartState.active) return;
  if (!project.analysis) return;
  // [Phase77後半] editPointマーカー（表示用）を同期。
  // ここに集約することで、setEditPoint()/clearEditPoint()/_refreshSelection()
  // どの経路からeditPointが変化しても、次のrenderChartMode()呼び出し前に
  // 必ず最新状態へ同期される（Phase75の「選択の二重管理・同期漏れ」の教訓）。
  setEditPointMarker(analysisEditor.selection.editPoint);
  // [Phase96] Boundary Handle 選択版は廃止（hover版へ統合）。
  // 理由: Phase95-A2でhoverだけでも境界編集できるようになった時点で、
  // 「選択したから常時ハンドルが出る」という設計の存在意義が薄れていた
  // （Decorator Inventory棚卸しで整理・architecture.md §12参照）。
  // [Phase80] 検索結果（Derived Cache）を同期。matchesはquery+bufferから
  // 常に再計算できるキャッシュのため、唯一の再描画経路であるここで
  // まとめて再計算する（Boundary Handle/EditPointMarkerと同じ理由。
  // ミューテーション箇所ごとに個別に呼ぶと呼び忘れが起きるため）。
  if (analysisEditor.search.open) {
    // [Phase82] search.queryは表示名。Engine（searchChords）は実音のみを扱うため
    // ([SEARCH-1]〜[SEARCH-5]準拠)、ここで唯一の変換を行う。
    // [Phase83] IME入力等で混入する全角文字をnormalizeChordInput()で正規化。
    // [Phase84] 表示方向が canonical→toReadableChord→toDisplayChord の順である
    // ため、逆方向（検索）は必ずその逆順で戻す：
    //   normalizeChordInput() → toCanonicalChord()（Capoを戻す）
    //   → fromReadableChord()（Representationを戻す）
    // 順序を入れ替えると、Capo適用時のオンコード検索がbufferと一致しなくなる
    // （[REPRESENTATION BEFORE PROJECTION]・chords.js参照）。
    analysisEditor.search.matches = searchChords(
      analysisEditor.buffer,
      fromReadableChord(toCanonicalChord(normalizeChordInput(analysisEditor.search.query), getCapo()))
    );
    if (analysisEditor.search.activeIndex !== null
        && analysisEditor.search.activeIndex >= analysisEditor.search.matches.length) {
      analysisEditor.search.activeIndex = analysisEditor.search.matches.length ? 0 : null;
    }
  }
  setSearchMatches(analysisEditor.search.open ? analysisEditor.search.matches : []);
  // [Phase109] renderChartMode()（実際の描画）より前にSection Previewの
  // chordIdsを最新化しておく。従来はrenderSectionBar()（本関数の末尾で
  // 呼ばれる）内の_syncSectionPreviewVisibility()のみに任せていたが、
  // それだと「renderChartMode()が今回の描画で古いchordIdsを使ってしまい、
  // 次の操作でようやく反映される」という1描画分の遅延（ちらつき）が生じる
  // （Undo実行時に実機で発見）。renderSectionBar()側の呼び出しは
  // Section Bar UI自身の同期のため残置し、ここでの呼び出しと重複しても
  // 実害はない（冪等）。
  _syncSectionPreviewVisibility();
  const currentChords = getCurrentChordSource();
  const liveAnalysis = {
    ...project.analysis,
    chords: sanitizeChords(currentChords),
    raw: {
      ...project.analysis.raw,
      chords: currentChords,
    },
  };
  rebuildChartViewModel(liveAnalysis);
  renderChartMode({ measuresPerRow: chartMeasuresPerRow, editing: isAnalysisEditing() });
  renderAnalysisEditorPanel();
  renderSectionBar(); // Phase101-1
}

/**
 * SECTION_TYPES — Section作成ダイアログの種類プルダウン候補（Phase101-2）
 *
 * [OWNERSHIP] これはUI側の選択肢一覧であり、Sectionデータモデル自体の
 * Invariantではない（section-model.md §4.1のtypeは自由文字列）。
 * 将来の並び替え・Localization・追加はこの配列のみで完結する。
 */
const SECTION_TYPES = [
  { value: 'intro',       label: 'Intro' },
  { value: 'verse',       label: 'Verse' },
  { value: 'pre-chorus',  label: 'Pre-Chorus' },
  { value: 'chorus',      label: 'Chorus' },
  { value: 'post-chorus', label: 'Post-Chorus' },
  { value: 'bridge',      label: 'Bridge' },
  { value: 'solo',        label: 'Solo' },
  { value: 'interlude',   label: 'Interlude' },
  { value: 'break',       label: 'Break' },
  { value: 'outro',       label: 'Outro' },
  { value: 'other',       label: 'Other' },
];

/**
 * _generateSectionName — type選択時のname初期値を自動生成する（Phase101-2）
 *
 * 同typeの既存件数を数え、0件なら種類名そのまま、1件以上なら連番を付与する
 * （例: 初回"Verse"、2件目以降"Verse 2"）。
 */
function _generateSectionName(type) {
  const label = SECTION_TYPES.find(t => t.value === type)?.label ?? type;
  const count = getSections(analysisEditor).filter(s => s.type === type).length;
  return count === 0 ? label : `${label} ${count + 1}`;
}

/**
 * openSectionModal — Section作成ダイアログ（Phase101-2）
 *
 * [OWNERSHIP] type一覧・name自動採番等のSection固有ロジックはこの関数が持つ。
 * openModal()（app.js内の既存モーダル基盤）を呼ぶだけの薄いラッパーとする。
 * modals.js（project.lines専用の軽量モーダル群）には一切変更を加えない
 * （Analysis Editor概念をmodals.jsへ持ち込まないための意図的な切り分け）。
 *
 * [FIXED RANGE] start/endはこの関数が呼ばれた時点のselection.chordIdsで
 * 確定する。ダイアログを開いている間にselectionが変化しても、この確定値には
 * 影響しない。
 *
 * [ORDER] createSectionCommand()が成功した場合のみcloseする。失敗時は
 * モーダルを開いたままtoastでエラーを伝え、入力内容を保持する。
 */
function openSectionModal() {
  const selectedIds = analysisEditor.selection.chordIds;
  if (selectedIds.length === 0) return; // ボタン側でdisabled済みだが二重ガード

  // [FIXED RANGE] 開いた時点で確定（buffer上の時系列順はrefreshSelection()の
  // 不変条件により保証済みのため、先頭/末尾がそのままstart/endになる）
  const startChordId = selectedIds[0];
  const endChordId = selectedIds[selectedIds.length - 1];
  const buffer = analysisEditor.buffer;
  const startChord = buffer.find(c => c._id === startChordId);
  const endChord = buffer.find(c => c._id === endChordId);
  if (!startChord || !endChord) return;

  // [Phase84] Representation Translation Layerに準拠し、
  // canonical → toReadableChord() → toDisplayChord() の順で表示名へ変換する。
  const capo = getCapo();
  const startName = toDisplayChord(toReadableChord(startChord.chord), capo);
  const endName = toDisplayChord(toReadableChord(endChord.chord), capo);
  const count = selectedIds.length;

  let nameIsAutoGenerated = true;
  const defaultType = SECTION_TYPES[1].value; // 'verse'をデフォルト表示

  openModal({
    title: 'Sectionを作成',
    body: `
      <div class="modal-caption modal-section">
        範囲: ${count}コード（${startName} 〜 ${endName}）
      </div>
      <div class="modal-field-label">種類</div>
      <select id="sec-type-in" class="mi">
        ${SECTION_TYPES.map(t =>
          `<option value="${t.value}" ${t.value === defaultType ? 'selected' : ''}>${t.label}</option>`
        ).join('')}
      </select>
      <div class="modal-field-label" style="margin-top:8px">名前</div>
      <input type="text" id="sec-name-in" class="mi" value="${_generateSectionName(defaultType)}">
    `,
    onOpen: () => {
      const typeEl = document.getElementById('sec-type-in');
      const nameEl = document.getElementById('sec-name-in');
      // [type変更時のname追従ルール] nameが未編集のままなら自動生成値へ追従し、
      // 一度でも編集されたら以後は固定する（多くのUIが採用する挙動）。
      nameEl?.addEventListener('input', () => { nameIsAutoGenerated = false; });
      typeEl?.addEventListener('change', () => {
        if (nameIsAutoGenerated) nameEl.value = _generateSectionName(typeEl.value);
      });
      nameEl?.focus();
      nameEl?.select();
    },
    buttons: (close) => [
      mkMBtn('キャンセル', '', close),
      mkMBtn('作成', 'ok', () => {
        const type = document.getElementById('sec-type-in')?.value ?? defaultType;
        const name = document.getElementById('sec-name-in')?.value.trim() || _generateSectionName(type);
        const result = createSectionCommand(analysisEditor, { type, name, startChordId, endChordId });
        if (!result.ok) {
          toast(`⚠ Section作成に失敗しました: ${result.reason}`);
          return; // [ORDER] 失敗時はcloseしない・入力内容を保持する
        }
        close();
        _refreshEditorView();
        toast(`✅ Section「${name}」を作成しました`);
      }),
    ],
  });
}

/**
 * _openSectionMenuId — Section ▼メニューの開閉状態（Phase101-3）
 *
 * [SCOPE] 完全にapp.js限定のephemeral UI stateである。
 * session（analysisEditor.sections）にもanalysisSession.js/analysisCommands.js
 * にも一切触れない・渡さない（Command Layerからは不可視）。
 *
 * 同時に開けるのは1つのみ。既存のHeader Menu（initHeaderMenus・trigger/
 * closeAllMenus パターン）と同じ「トリガーでstopPropagation＋トグル、
 * document click で全閉じ」という設計を踏襲する。
 */
let _openSectionMenuId = null;

/**
 * _syncSectionMenuVisibility — _openSectionMenuId に応じてメニューDOMのhidden属性を同期する
 *
 * renderSectionBar() がinnerHTMLを再構築した直後にも呼ぶことで、
 * 再描画をまたいでメニューの開閉状態を保持する。対象のSectionが
 * 再描画後に存在しなくなっていた場合（reconcileによる削除等）は
 * _openSectionMenuId を自動的にnullへ戻す。
 */
function _syncSectionMenuVisibility() {
  let found = false;
  document.querySelectorAll('.sec-chip-menu').forEach(el => {
    const match = el.dataset.sectionId === _openSectionMenuId;
    el.hidden = !match;
    if (match) found = true;
  });
  if (_openSectionMenuId !== null && !found) _openSectionMenuId = null;
}

/**
 * _toggleSectionMenu — Section▼メニューの開閉（Phase101-3・Phase106でSelection連動化）
 *
 * [Phase106] メニューを開く操作は、そのSectionの選択（_selectSection）を
 * 必ず伴うようにした。理由: 境界ステッパー（◀開始▶／◀終了▶）は「今見えている
 * （ハイライトされている）Section」に対して操作するのが自然であり、逆に
 * Preview対象と異なるSectionの境界を誤って動かせてしまうのは人的ミスの温床
 * になる（実機フィードバックで指摘）。メニューを開く＝選択する、を1つの操作に
 * 統合することで、「今から編集しようとしている対象」を常に視覚的に
 * （ゴールドのPreviewハイライトで）確認できる状態にする。
 * メニューを閉じる操作（トグルOFF）はPreview状態を変更しない
 * （Escape/空白クリックでのPreview解除という既存経路と役割を分けるため）。
 */
function _toggleSectionMenu(sectionId) {
  const opening = _openSectionMenuId !== sectionId;
  _openSectionMenuId = opening ? sectionId : null;
  _syncSectionMenuVisibility();
  // [Phase106] メニューを開く操作は「誤編集防止のためのPreview同期」のみを行い、
  // 画面はスクロールしない（_selectSection()ではなく_previewSection()を呼ぶ）。
  // 詳細はコメント参照（_previewSection()の定義部）。
  if (opening) _previewSection(sectionId);
}

function _closeSectionMenu() {
  if (_openSectionMenuId === null) return;
  _openSectionMenuId = null;
  // [Phase101-3 hotfix] ▼ボタンはクリック時にfocusを受け取るため、メニューを
  // 閉じてもblur()しない限りブラウザ標準のfocus outlineだけが取り残される
  // （Escapeで閉じた際に実機で発見）。閉じる操作は必ずこの関数を経由するため、
  // ここに集約すれば全経路（Escape/外クリック/項目実行/トグル）で解消する。
  const active = document.activeElement;
  if (active?.classList?.contains('sec-chip-menu-btn')) active.blur();
  _syncSectionMenuVisibility();
}

// 外クリックで閉じる（Header Menuのdocument.addEventListener('click', () => closeAllMenus())と同一パターン）。
// ▼ボタン自身のclickはe.stopPropagation()でここへ到達させない（後述）。
document.addEventListener('click', () => {
  if (_openSectionMenuId !== null) _closeSectionMenu();
});

// [Phase102] Section Bar内の空白部分（ラベル・余白）クリックでPreview解除。
// チップ名・▼メニュー領域は個別ハンドラでe.stopPropagation()済みのため、
// ここに到達するのはbar自身への直接クリックのみ。document委譲で1回だけbindする
// （renderSectionBar()内でbar要素へ直接addEventListenerすると、再描画のたびに
// リスナーが蓄積してしまうため避けている）。
document.addEventListener('click', (e) => {
  const bar = e.target.closest('#section-bar');
  if (!bar) return;
  if (e.target === bar || e.target.classList.contains('sec-label')) {
    _clearSectionPreview();
  }
});

/**
 * resolveSectionChordIds — Section範囲（startChordId〜endChordId）を
 * chordId配列へ変換する（Phase102）
 *
 * [PURE FUNCTION] analysisEditor等のグローバル状態に依存しない。
 * bufferとsectionを引数で受け取るだけの純粋関数（ChatGPTレビュー反映）。
 * Preview専用ではなく、将来のNavigation/Export/Statistics等からも
 * 共通利用できるSectionユーティリティとして命名している。
 *
 * @param {Array} buffer - analysisEditor.buffer（コード配列）
 * @param {{startChordId: string, endChordId: string}} section
 * @returns {string[]} 区間内の chord._id 配列（start/endが見つからない場合は空配列）
 */
function resolveSectionChordIds(buffer, section) {
  const startIdx = buffer.findIndex(c => c._id === section.startChordId);
  const endIdx = buffer.findIndex(c => c._id === section.endChordId);
  if (startIdx === -1 || endIdx === -1) return [];
  return buffer.slice(startIdx, endIdx + 1).map(c => c._id);
}

/**
 * _previewSectionId — Section Navigation（現在選択中のSection）の対象。
 * 結果としてPreview（範囲閲覧表示）も兼ねる（Phase102で導入・Phase105で
 * 意味を拡張）。
 *
 * [Phase105] Phase102時点では「Previewの対象」のみを意味したが、チップ
 * クリックにNavigation（選択+スクロール）を統合したことに伴い、「現在
 * 選択中のSection」という意味も兼ねるようになった。実体（変数）は2つに
 * 分けず1つのまま拡張している（[PERSISTENCE OWNERSHIP PRINCIPLE]と同じ
 * 考え方＝意味の数と変数の数は一致させなくてよい）。
 *
 * [SCOPE] _openSectionMenuIdと同格の、完全にapp.js限定のephemeral UI stateである。
 * session（analysisEditor.sections）にもanalysisSession.js/analysisCommands.js
 * にも一切触れない・渡さない（Command Layerからは不可視）。History対象外・
 * 永続化しない。
 *
 * [Selection⇔Preview独立] SelectionはEditorの編集対象（正本はanalysisEditor.
 * selection）、Section Preview/Navigationは単なる閲覧状態。片方の変更が
 * 他方に影響しないことを意図的な仕様とする（Preview表示中でもコード編集を
 * 継続できる）。
 */
let _previewSectionId = null;

/**
 * _syncSectionPreviewVisibility — _previewSectionId が指すSectionが
 * 再描画後も存在するかを確認し、消えていればPreviewを解除する（Phase102）。
 * 存在する場合も、Derived Cacheであるsection Preview chordIdsを常に
 * 再計算する（Phase109）。
 *
 * [Phase109で修正] 従来はSectionの存在有無のみを見ていたが、Compound
 * Mutation（delete/merge等）によりSectionは生存したままstartChordId/
 * endChordIdだけが書き換わるケース（reconcile()によるBoundary Remap）
 * では何もしておらず、Previewが古いchordIdsを指したまま取り残される
 * バグがあった（実機報告により発見）。Phase106の境界編集UI
 * （updateSectionBoundaryCommand呼び出し元）では個別にこの再計算を
 * 行っていたが、delete/merge等の他経路には同じ対処がなかった。
 * ここで「Sectionが存在する限り常に最新のchordIdsへ同期する」よう
 * 一本化することで、以後の全てのCompound Mutationに自動的に対応する。
 *
 * _syncSectionMenuVisibility()と同型のガード。Rename/Delete等でSectionが
 * 変化した直後のrenderSectionBar()から必ず呼ぶ。
 */
function _syncSectionPreviewVisibility() {
  if (_previewSectionId === null) return;
  const sections = getSections(analysisEditor);
  const target = sections.find(s => s.id === _previewSectionId);
  if (!target) {
    _previewSectionId = null;
    setSectionPreview([]);
    // [Phase106で発見・修正] measuresPerRowを渡さないとrenderChartMode()の
    // デフォルト値（3）で描画され、ユーザーが選択中の列数（4列等）が一瞬
    // リセットされる。総高さが激変し「画面が動く」ように見える不具合の
    // 原因の1つだった（Phase102由来の既存バグ）。
    renderChartMode({ measuresPerRow: chartMeasuresPerRow, editing: isAnalysisEditing() });
    return;
  }
  setSectionPreview(resolveSectionChordIds(analysisEditor.buffer, target));
}

/**
 * _selectSection — チップ本体クリック時のSection選択（Navigation）（Phase105・
 * Phase107でトグル方式へ復帰）
 *
 * [Phase105] 当初「Navigationを兼ねる」役割拡張に伴いトグルOFFを廃止したが、
 * [Phase107] 実機検証の結果、「押し込まれたチップをもう一度押すと解除される」
 * という挙動の方が認知的に自然であり、専用の解除ボタンを別途置くよりも
 * UIとして引き算になる（ボタン要素を1つ減らせる）と判断し、トグル方式へ
 * 戻した。Escape/空白クリックでの解除は既存のまま併存する。
 *
 * 音声の再生位置（seek）には触れない。スクロールはあくまで視界の移動のみ
 * （Navigation と Playback の責務を混ぜない）。
 */
/**
 * _previewSection — Sectionの選択状態・Previewハイライトのみを同期する
 * （画面はスクロールしない）（Phase106修正版）
 *
 * [発見の経緯] 当初_toggleSectionMenu()は_selectSection()（Navigation込み）を
 * そのまま呼んでいたため、「▼メニューを開いただけで画面が中央寄せされる」
 * という実機フィードバックが繰り返し報告された。原因はSection境界編集
 * （_moveSectionBoundary）ではなく、メニューを開く操作に紛れ込んでいた
 * scrollToChord()だった（数値診断でboundary編集自体は画面を一切動かして
 * いないことを確認済み）。
 *
 * 「開いているメニュー＝選択中のSection」という整合性を保つための同期
 * （誤編集防止・[Phase106]）と、「画面を該当位置へ移動する」という
 * Navigation（Phase105）は本来別の関心事だったため、ここで分離する。
 *
 * @param {string} sectionId
 */
function _previewSection(sectionId) {
  if (_openSectionMenuId !== null && _openSectionMenuId !== sectionId) {
    _closeSectionMenu();
  }
  _previewSectionId = sectionId;
  const sections = getSections(analysisEditor);
  const target = sections.find(s => s.id === _previewSectionId);
  setSectionPreview(target ? resolveSectionChordIds(analysisEditor.buffer, target) : []);
  // [Phase106で発見・修正] measuresPerRowを渡さないとデフォルト値（3）で
  // 描画され、選択中の列数が一瞬リセットされる（詳細は
  // _syncSectionPreviewVisibility()のコメント参照）。
  renderChartMode({ measuresPerRow: chartMeasuresPerRow, editing: isAnalysisEditing() });
  // [Phase107バグ修正] 従来このタイミングでrenderChartMode()のみを呼んでいたため、
  // Chart Mode側（ゴールドハイライト）は更新されるがSection Bar自体（チップの
  // 押し込み表現・Preview解除ボタン）は再描画されず反映されなかった
  // （実機報告により発見）。Section Barの見た目は_previewSectionIdから導出される
  // Projectionであるため、状態変更のたびに再描画する必要がある。
  renderSectionBar();
}

/**
 * _selectSection — Sectionを選択し、その位置へNavigateする（Phase105・チップ名クリック用）
 *
 * [Phase106] Preview同期部分は_previewSection()へ委譲し、Navigation
 * （scrollToChord）はこの関数（明示的なチップ名クリック経由）のみが行う。
 * ▼メニューを開く操作（_toggleSectionMenu）は_previewSection()のみを呼び、
 * Navigateしない（上記コメント参照）。
 *
 * @param {string} sectionId
 */
function _selectSection(sectionId) {
  // [Phase107] 既にPreview中の同じSectionなら解除（トグルOFF）。
  // Navigateは行わない（既に見ている位置なので動かす必要がない）。
  if (_previewSectionId === sectionId) {
    _clearSectionPreview();
    return;
  }
  _previewSection(sectionId);
  const sections = getSections(analysisEditor);
  const target = sections.find(s => s.id === _previewSectionId);
  if (target) scrollToChord(target.startChordId);
}

/**
 * _clearSectionPreview — Preview解除（Escape・空白クリック用）（Phase102）
 */
function _clearSectionPreview() {
  if (_previewSectionId === null) return;
  _previewSectionId = null;
  setSectionPreview([]);
  // [Phase106で発見・修正] 詳細は_syncSectionPreviewVisibility()のコメント参照。
  renderChartMode({ measuresPerRow: chartMeasuresPerRow, editing: isAnalysisEditing() });
  // [Phase107バグ修正] _previewSection()と同じ理由。詳細はそちらのコメント参照。
  renderSectionBar();
}

/**
 * renderSectionBar — Section一覧を表示する（Phase101-1で新設・Phase101-2で作成UI追加・
 * Phase101-3でRename/Delete用▼メニュー追加）
 *
 * [SCOPE] チップ本体のクリックには101-3では意味を持たせない（101-4のPreview用に予約）。
 *
 * [OWNERSHIP] DOM生成はこの関数が担う。データの正本は
 * analysisSession.js の session.sections（[SECTION SESSION CONSISTENCY
 * INVARIANT]に従い getSections() 経由でのみ読む）。この関数自体はSection
 * 状態を変更しない（作成/変更/削除の実行はopenSectionModal() /
 * openSectionRenameModal() / openSectionDeleteConfirm() → 各Command）。
 */
function renderSectionBar() {
  const bar = document.getElementById('section-bar');
  if (!bar) return;

  if (!isAnalysisEditing()) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  const sections = getSections(analysisEditor);
  const buffer = analysisEditor.buffer || [];
  // [Phase101-2] 単一コードでも作成可能（startChordId === endChordIdも正当なSection）。
  const canCreate = analysisEditor.selection.chordIds.length >= 1;

  const chipsHtml = sections.length
    ? sections.map(s => {
        // [Phase106] 境界ステッパーのdisabled判定用にbuffer上のindexを求める。
        // updateSectionBoundaryCommand()側のvalidateSectionInvariants()が
        // 最終的な妥当性保証を持つため、ここでの判定はUI上の誤操作防止に限定する。
        const startIdx = buffer.findIndex(c => c._id === s.startChordId);
        const endIdx = buffer.findIndex(c => c._id === s.endChordId);
        const startLeftDisabled  = startIdx <= 0;
        const startRightDisabled = startIdx === -1 || endIdx === -1 || startIdx >= endIdx;
        const endLeftDisabled    = startIdx === -1 || endIdx === -1 || endIdx <= startIdx;
        const endRightDisabled   = endIdx === -1 || endIdx >= buffer.length - 1;
        // [Phase107] Preview中チップへ押し込み表現（.sec-chip--previewing）を付与する。
        // このチップは「押されているボタン」でもあり、再クリックで解除される
        // （トグル方式・_selectSection()参照）。_previewSectionId は既存の
        // Navigation/Preview正本（Phase105）をそのまま参照するだけで、新規stateは
        // 追加しない。
        const isPreviewing = s.id === _previewSectionId;
        return `
      <span class="sec-chip${isPreviewing ? ' sec-chip--previewing' : ''}" data-section-id="${s.id}">
        <span class="sec-chip-name">${s.name}</span>
        <button class="sec-chip-menu-btn" data-section-id="${s.id}" title="Sectionメニュー" aria-label="Sectionメニュー">▼</button>
        <div class="sec-chip-menu" data-section-id="${s.id}" hidden>
          <div class="sec-boundary-row">
            <button class="sec-boundary-btn" data-side="start" data-dir="-1" data-section-id="${s.id}" title="開始位置を1コード前へ" aria-label="開始位置を1コード前へ" ${startLeftDisabled ? 'disabled' : ''}>◀</button>
            <span class="sec-boundary-label">開始</span>
            <button class="sec-boundary-btn" data-side="start" data-dir="1" data-section-id="${s.id}" title="開始位置を1コード後へ" aria-label="開始位置を1コード後へ" ${startRightDisabled ? 'disabled' : ''}>▶</button>
          </div>
          <div class="sec-boundary-row">
            <button class="sec-boundary-btn" data-side="end" data-dir="-1" data-section-id="${s.id}" title="終了位置を1コード前へ" aria-label="終了位置を1コード前へ" ${endLeftDisabled ? 'disabled' : ''}>◀</button>
            <span class="sec-boundary-label">終了</span>
            <button class="sec-boundary-btn" data-side="end" data-dir="1" data-section-id="${s.id}" title="終了位置を1コード後へ" aria-label="終了位置を1コード後へ" ${endRightDisabled ? 'disabled' : ''}>▶</button>
          </div>
          <div class="sec-chip-menu-divider"></div>
          <button class="sec-chip-menu-item" data-action="rename" data-section-id="${s.id}">✎ 名前を変更</button>
          <button class="sec-chip-menu-item sec-chip-menu-item--danger" data-action="delete" data-section-id="${s.id}">🗑 削除</button>
        </div>
      </span>`;
      }).join('')
    : `<span class="sec-empty">未作成</span>`;

  bar.innerHTML = `
    <span class="sec-label">Sections</span>
    ${chipsHtml}
    <button class="sec-btn" id="sec-create-btn" title="選択中の範囲からSectionを作成" ${canCreate ? '' : 'disabled'}>＋ 作成</button>
  `;

  document.getElementById('sec-create-btn')?.addEventListener('click', openSectionModal);

  // [Phase105] チップ本体クリック → Section選択+スクロール+Preview（Navigation）。
  // Phase102時点はPreviewトグルのみだったが、トグルOFFを廃止しNavigationを
  // 統合した（解除はEscape/空白クリックのみ）。▼メニュー領域は別ハンドラで
  // 既にstopPropagationされるため、ここに到達するのは名前部分クリックのみ。
  bar.querySelectorAll('.sec-chip-name').forEach(nameEl => {
    nameEl.addEventListener('click', (e) => {
      e.stopPropagation();
      _selectSection(nameEl.closest('.sec-chip').dataset.sectionId);
    });
  });

  // Phase101-3: ▼メニューのトリガー（stopPropagationでdocument click listenerへ到達させない）
  bar.querySelectorAll('.sec-chip-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleSectionMenu(btn.dataset.sectionId);
    });
  });

  // [Phase106] 境界ステッパー（◀開始▶／◀終了▶）。1クリック = 隣接コード1つ分の移動。
  // Rename/Deleteと異なりモーダルへ遷移しないため、_closeSectionMenu()は呼ばない
  // （メニューを開いたまま連続クリックで微調整できるようにする・仕様確定事項）。
  bar.querySelectorAll('.sec-boundary-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const target = sections.find(s => s.id === btn.dataset.sectionId);
      if (!target) return; // reconcile等で既に消えている場合は何もしない
      _moveSectionBoundary(target, btn.dataset.side, parseInt(btn.dataset.dir, 10));
    });
  });

  // Phase101-3: メニュー項目の実行（Rename/Delete）
  bar.querySelectorAll('.sec-chip-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const sectionId = item.dataset.sectionId;
      const action = item.dataset.action;
      // [Menu → Modal遷移ルール] 先にMenuを閉じてからModalを開く（MenuとModalの
      // 同時存在状態を作らない。Escape優先順位をシンプルに保つための前提）。
      _closeSectionMenu();
      const target = sections.find(s => s.id === sectionId);
      if (!target) return; // reconcile等で既に消えている場合は何もしない
      if (action === 'rename') openSectionRenameModal(target);
      else if (action === 'delete') openSectionDeleteConfirm(target);
    });
  });

  // 再描画をまたいでメニュー開閉状態・Preview対象を保持する
  _syncSectionMenuVisibility();
  _syncSectionPreviewVisibility();
}

/**
 * _moveSectionBoundary — Section境界（開始/終了）を隣接コード1つ分だけ移動する
 * （Phase106・▼メニューの境界ステッパー用）
 *
 * [SCOPE] 1クリック = 隣接コード1つ分の移動に限定する（長押し連続送りは非対応。
 * 「1クリック=1コード=1Undo」を崩さないための意図的な仕様）。
 * 境界の可動範囲（交差禁止）の最終的な保証はupdateSectionBoundaryCommand()内の
 * validateSectionInvariants()が持つ。renderSectionBar()側のdisabled表示は
 * UI上の誤操作防止のための事前チェックに過ぎない。
 *
 * @param {object} section - { id, startChordId, endChordId, ... }
 * @param {'start'|'end'} side
 * @param {number} dir - 移動方向（-1: 前へ, 1: 後へ）
 */
function _moveSectionBoundary(section, side, dir) {
  const buffer = analysisEditor.buffer;
  if (!buffer) return;

  const currentChordId = side === 'start' ? section.startChordId : section.endChordId;
  const idx = buffer.findIndex(c => c._id === currentChordId);
  if (idx === -1) return;

  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= buffer.length) return;
  const newChordId = buffer[newIdx]._id;

  const patch = side === 'start' ? { startChordId: newChordId } : { endChordId: newChordId };
  const result = updateSectionBoundaryCommand(analysisEditor, section.id, patch);
  if (!result.ok) {
    toast(`⚠ 境界の移動に失敗しました: ${result.reason}`);
    return;
  }

  // [Phase106] Previewが有効な対象の境界が変わった場合、Preview側のchordIds
  // （Derived Cache）を再計算する。updateSectionBoundaryCommand()は同じsection
  // オブジェクト参照をmutateするため、この時点でsection.startChordId/endChordId
  // は既に新しい値になっている（Phase104 handoverで指摘されていた懸念が、
  // このUI実装によって初めて実際の経路として発生したため、ここで解消する）。
  if (_previewSectionId === section.id) {
    setSectionPreview(resolveSectionChordIds(buffer, section));
  }

  _refreshEditorView();

  // [Phase106] scrollToChord()は呼ばない。境界編集はNavigationではなく
  // 「その場の微調整」であり、画面は動かないのが正しい挙動（実測で確認済み。
  // 数値診断上、この関数自体は一度も画面を動かしていなかった。実際に画面が
  // 動いていた原因は▼メニューを開く操作側にあった。詳細は_previewSection()の
  // コメント参照）。
}

/**
 * _sectionRangeLabel — Sectionの範囲を表示用文字列にする（Phase101-3）
 *
 * [NOTE] openSectionModal()内の同種のロジックとは独立した新規ヘルパー。
 * 既存の動作確認済みコード（Phase101-2）への変更を避けるため、リファクタリングとしての
 * 統合はしない（project_instructions.md「リファクタリングと機能追加の混在禁止」に従う）。
 */
function _sectionRangeLabel(section) {
  const buffer = analysisEditor.buffer;
  const startChord = buffer?.find(c => c._id === section.startChordId);
  const endChord = buffer?.find(c => c._id === section.endChordId);
  if (!startChord || !endChord) return '(範囲不明)';
  const capo = getCapo();
  const startName = toDisplayChord(toReadableChord(startChord.chord), capo);
  const endName = toDisplayChord(toReadableChord(endChord.chord), capo);
  return startChord._id === endChord._id ? startName : `${startName} 〜 ${endName}`;
}

/**
 * openSectionRenameModal — Sectionの名前・種類を変更するダイアログ（Phase101-3）
 *
 * [OWNERSHIP] openSectionModal()と同じ方針：Section固有ロジックはこの関数が持ち、
 * openModal()（既存モーダル基盤）を呼ぶだけの薄いラッパーとする。範囲（start/end）は
 * 今回スコープ外のため表示のみ（[Out of Scope] 境界変更は101-3では扱わない）。
 *
 * [ORDER] renameSectionCommand()が成功した場合のみcloseする。失敗時は
 * モーダルを開いたままtoastでエラーを伝え、入力内容を保持する。
 */
function openSectionRenameModal(section) {
  const rangeLabel = _sectionRangeLabel(section);

  openModal({
    title: 'Sectionを変更',
    body: `
      <div class="modal-caption modal-section">
        範囲: ${rangeLabel}（範囲の変更は未対応）
      </div>
      <div class="modal-field-label">種類</div>
      <select id="sec-rename-type-in" class="mi">
        ${SECTION_TYPES.map(t =>
          `<option value="${t.value}" ${t.value === section.type ? 'selected' : ''}>${t.label}</option>`
        ).join('')}
      </select>
      <div class="modal-field-label" style="margin-top:8px">名前</div>
      <input type="text" id="sec-rename-name-in" class="mi" value="${section.name}">
    `,
    onOpen: () => {
      const nameEl = document.getElementById('sec-rename-name-in');
      nameEl?.focus();
      nameEl?.select();
    },
    buttons: (close) => [
      mkMBtn('キャンセル', '', close),
      mkMBtn('保存', 'ok', () => {
        const type = document.getElementById('sec-rename-type-in')?.value ?? section.type;
        const name = document.getElementById('sec-rename-name-in')?.value.trim() || section.name;
        const result = renameSectionCommand(analysisEditor, section.id, { type, name });
        if (!result.ok) {
          toast(`⚠ Section変更に失敗しました: ${result.reason}`);
          return; // [ORDER] 失敗時はcloseしない・入力内容を保持する
        }
        close();
        _refreshEditorView();
        toast(`✅ Section「${name}」を変更しました`);
      }),
    ],
  });
}

/**
 * openSectionDeleteConfirm — Section削除の確認ダイアログ（Phase101-3）
 *
 * Section CommandsはUndo/Redo非対応（[SECTION HISTORY INTEGRATION]・Phase100-A）
 * のため、確認ダイアログを必須とする。
 */
function openSectionDeleteConfirm(section) {
  const rangeLabel = _sectionRangeLabel(section);

  openModal({
    title: 'Sectionを削除',
    body: `
      <div class="modal-caption modal-section">
        「${section.name}」を削除します。この操作はUndoできません。
      </div>
      <div class="modal-field-label">範囲</div>
      <div class="modal-caption modal-section">${rangeLabel}</div>
    `,
    buttons: (close) => [
      mkMBtn('キャンセル', '', close),
      mkMBtn('削除', 'ok', () => {
        const result = deleteSectionCommand(analysisEditor, section.id);
        if (!result.ok) {
          toast(`⚠ Section削除に失敗しました: ${result.reason}`);
          return;
        }
        close();
        _refreshEditorView();
        toast(`🗑 Section「${section.name}」を削除しました`);
      }),
    ],
  });
}

/**
 * renderAnalysisEditorPanel — 解析編集パネルを描画する（Phase74-C）
 *
 * 編集モード中のみ表示。選択中コードのプロパティを編集できるパネルを
 * chart-grid の下部に固定表示する。
 *
 * [OWNERSHIP] DOM生成・イベント結線はこの関数が担う。
 * 選択状態の正本は analysisEditor.selection。
 */
// ============================================================
// Phase78 Sprint1: Footer構造刷新
// 設計原則は docs/design/phase78-footer-redesign.md 参照。
// ============================================================

/**
 * [EDITOR MODE PROJECTION]
 * UI Rendering only. Business logic must not branch on editorMode.
 *
 * editorMode は selection から導出される Projection である。
 * selection が唯一の Authority のまま変わらない。
 * editorMode 自体を state として保持・シリアライズしてはならない
 * （呼び出しの都度この関数で再計算する）。
 */
function deriveEditorMode(selection) {
  if (selection.editPoint) return 'edit-point';
  if (selection.chordIds.length === 1) return 'single';
  if (selection.chordIds.length >= 2) return 'multi';
  return 'idle';
}

/**
 * [SELECTION CLEAR]
 * 「選択解除」ボタンの唯一の窓口。
 * ユーザーには「コードを選んでいる」「位置を選んでいる」の区別しか見えないため、
 * どちらの状態でも同じ「選択解除」という1つの操作として振る舞う
 * （内部的にはeditPoint/選択の解除経路が異なるだけ）。
 */
function clearCurrentSelection() {
  if (analysisEditor.selection.editPoint) {
    clearEditPoint();
  } else {
    _refreshSelection([]);
    setSelectedChordIds([]);
  }
}

/**
 * [ACTION REGISTRY]
 * Group3（Primary Action）の"ボタン群"をmode別に宣言的に定義する。
 * 新しいコマンドを追加する際は、この定義に追加するだけでよく、
 * renderPrimaryActionGroup() 自体は変更不要にする。
 *
 * 個別移動／範囲シフトのボタンは「利用不可の理由」を含む複数の表示状態を持つ
 * 専用UIのため、このRegistryには含めず _renderShiftControls() で別途描画する。
 */
function getGroup3Actions(mode, ctx) {
  const { isMultiSelect, selectedIds, hasClipboard } = ctx;
  const n = selectedIds.length;

  const COPY  = { id: 'aep-copy',  icon: '📋', label: isMultiSelect ? `コピー（${n}）` : 'コピー', shortcut: 'Ctrl+C' };
  const CUT   = { id: 'aep-cut',   icon: '✂',  label: isMultiSelect ? `切り取り（${n}）` : '切り取り', shortcut: 'Ctrl+X' };
  // [Phase79] 貼り付けを2種類に分離。
  // PASTE_ABS   = 貼り付け上書き（コピー時点の拍位置・長さを維持・上書き方式・pasteAbsolute）
  // PASTE_FIT   = 範囲に合わせて貼り付け（選択範囲へ比率で再配置・既存pasteSelection・改名のみ）
  const PASTE_ABS = { id: 'aep-paste-absolute', icon: '📑', label: '貼り付け上書き', shortcut: 'Ctrl+V', disabled: !hasClipboard };
  const PASTE_FIT = { id: 'aep-paste', icon: '📄', label: '範囲に合わせて貼り付け', shortcut: 'Ctrl+Shift+V', disabled: !hasClipboard };
  const MERGE = { id: 'aep-merge', icon: '🔗', label: `結合（${n}）`, shortcut: 'Ctrl+J' };

  switch (mode) {
    case 'single':
      return {
        primary: [
          { id: 'aep-add',          icon: '＋', label: '追加', title: 'コードを追加' },
          { id: 'aep-rename',       icon: '✎',  label: '変更', title: 'コード名を変更' },
          { id: 'aep-delete-chord', icon: '🗑', label: '削除', title: 'このコードを削除', danger: true },
        ],
        // [Phase75由来] 結合(Merge)は単一選択では意味を持たない操作のため、
        // 単一選択時のその他▼には含めない（グレーアウトではなく非表示）。
        overflow: [COPY, CUT, PASTE_ABS, PASTE_FIT],
      };
    case 'multi':
      return {
        primary: [
          { id: 'aep-delete-selection', icon: '🗑', label: `削除（${n}）`, title: '選択したコードを削除', danger: true },
        ],
        overflow: [COPY, CUT, PASTE_ABS, PASTE_FIT, { divider: true }, MERGE],
      };
    case 'edit-point':
      return {
        primary: [
          { id: 'aep-add-here', icon: '＋', label: '挿入', title: 'この位置にコードを追加', primary: true },
          // [Phase79] editPoint中は「範囲」が無いため、貼り付け上書きのみ有効。
          // PASTE_ABSの定義（icon/label）をそのまま流用し、id/titleのみeditPoint用に上書きする
          // （表記の唯一の定義元をPASTE_ABSに一本化し、single/multiとeditPointでラベルがズレるのを防ぐ）
          { ...PASTE_ABS, id: 'aep-paste-absolute-primary', title: 'コピーした内容をこの位置へ貼り付け（上書き）' },
        ],
        overflow: [],
      };
    default: // idle
      return { primary: [], overflow: [] };
  }
}

function _renderActionButton(a) {
  const cls = ['aep-btn'];
  if (a.danger) cls.push('aep-btn--danger');
  if (a.primary) cls.push('aep-btn--primary');
  const title = a.title || a.label;
  return `<button class="${cls.join(' ')}" id="${a.id}" title="${title}" aria-label="${title}" ${a.disabled ? 'disabled' : ''}>${a.icon} ${a.label}</button>`;
}

function _renderOverflowItem(a) {
  if (a.divider) return `<div class="aep-overflow-divider"></div>`;
  return `<button class="aep-overflow-item" id="${a.id}" ${a.disabled ? 'disabled' : ''}>
      <span>${a.icon} ${a.label}</span>
      <span class="aep-shortcut">${a.shortcut || ''}</span>
    </button>`;
}

// [BOUNDARY DECORATOR仮実装・Sprint2でDecorator Layerへ統合予定]
// 個別移動／範囲シフトは「利用不可の理由」を持つため専用描画にする。
// 数字は表示せず矢印アイコン＋ツールチップで秒数を伝える（設計原則1）。
// caption: ホバー前でも「全体」「開始位置」「範囲」等の区別ができるよう添える短い見出し
// （実機フィードバックにより追加。ツールチップだけに頼ると初見で意味が伝わらないため）。
function _renderShiftControls(prefix, note, caption, variant) {
  if (note) return `<span class="aep-shift-note">${note}</span>`;
  const captionHtml = caption ? `<span class="aep-shift-caption">${caption}</span>` : '';
  // variant='global': 全体シフト（常に効く操作）を少し大きく・amber強調にし、
  // Primary Action内の個別移動／範囲シフトと見た目で区別する（実機フィードバック反映）。
  const sizeCls = variant === 'global' ? ' aep-btn--shift-lg' : '';
  return `<div class="aep-shift-group">
      ${captionHtml}
      <div class="aep-shift-btns">
        <button class="aep-btn aep-btn--shift${sizeCls}" id="${prefix}-mbig"   title="大きく前へ移動（0.5秒）"   aria-label="大きく前へ移動（0.5秒）">◀◀</button>
        <button class="aep-btn aep-btn--shift${sizeCls}" id="${prefix}-msmall" title="少し前へ移動（0.1秒）"     aria-label="少し前へ移動（0.1秒）">◀</button>
        <button class="aep-btn aep-btn--shift${sizeCls}" id="${prefix}-psmall" title="少し後ろへ移動（0.1秒）"   aria-label="少し後ろへ移動（0.1秒）">▶</button>
        <button class="aep-btn aep-btn--shift${sizeCls}" id="${prefix}-pbig"   title="大きく後ろへ移動（0.5秒）" aria-label="大きく後ろへ移動（0.5秒）">▶▶</button>
      </div>
    </div>`;
}

function _bindShiftControls(prefix, fn) {
  document.getElementById(`${prefix}-mbig`)?.addEventListener('click', () => fn(-0.5));
  document.getElementById(`${prefix}-msmall`)?.addEventListener('click', () => fn(-0.1));
  document.getElementById(`${prefix}-psmall`)?.addEventListener('click', () => fn(0.1));
  document.getElementById(`${prefix}-pbig`)?.addEventListener('click', () => fn(0.5));
}

// その他▼メニューの外側クリックで閉じるための1回限りのリスナー登録
// （renderAnalysisEditorPanel()はinnerHTMLを毎回再生成するため、
//   document.addEventListenerを都度登録すると重複するのでフラグで防止する）
let _aepOverflowCloseHandlerBound = false;
function _ensureAepOverflowCloseHandler() {
  if (_aepOverflowCloseHandlerBound) return;
  _aepOverflowCloseHandlerBound = true;
  document.addEventListener('click', (e) => {
    document.querySelectorAll('#analysis-editor-panel details.aep-overflow[open]').forEach(d => {
      if (!d.contains(e.target)) d.open = false;
    });
  });
}

function renderAnalysisEditorPanel() {
  // [NOTE] innerHTML を毎回再生成するためイベントも毎回再結線する（重複登録なし）
  _ensureAepOverflowCloseHandler();

  // パネルコンテナを取得または生成
  let panel = document.getElementById('analysis-editor-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'analysis-editor-panel';
    const overlay = document.getElementById('chart-overlay');
    if (!overlay) return;
    overlay.appendChild(panel);
  }

  // 編集モードでなければ非表示
  if (!isAnalysisEditing()) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  // [Phase80] innerHTML再生成でinputが作り直される前に、フォーカスの継続要否を
  // 判定しておく（「開いた直後」か「入力中の再描画」かのどちらかのみ復元する。
  // 毎回無条件にフォーカスすると、ユーザーが別セルをクリックした直後の
  // 再描画でフォーカスを奪い返してしまうため）。検索欄・置換欄のどちらに
  // フォーカスがあったかをid単位で覚えておき、同じ欄へ復元する。
  const _searchFocusIds = ['aep-search-input', 'aep-search-replace-input'];
  const searchFocusedId = document.activeElement?.id;
  const searchWasFocused = _searchFocusIds.includes(searchFocusedId);

  const selection = analysisEditor.selection;
  const mode = deriveEditorMode(selection);

  const selectedIds = selection.chordIds;
  const isMultiSelect = selectedIds.length > 1;
  const selectedId = !isMultiSelect ? (selectedIds[0] ?? null) : null;
  const chord = selectedId
    ? (analysisEditor.buffer.find(c => c._id === selectedId) ?? null)
    : null;

  // [Phase77後半・確定] 個別移動＝単一選択専用／範囲シフト＝複数選択専用。
  const hasLeftBoundary = selection.boundaryIndex !== null;
  const firstSelId = selectedIds[0];
  const lastSelId  = selectedIds[selectedIds.length - 1];
  const firstSelIdx = firstSelId ? analysisEditor.buffer.findIndex(c => c._id === firstSelId) : -1;
  const lastSelIdx  = lastSelId  ? analysisEditor.buffer.findIndex(c => c._id === lastSelId)  : -1;
  const canRangeShift = isMultiSelect
    && firstSelIdx > 0
    && lastSelIdx < analysisEditor.buffer.length - 1;

  const capo = getCapo();
  // Phase94 C1: 選択範囲の小節数。single/multiのみで使用
  const measureSpan = _computeSelectionMeasureSpan();

  // ── Group 1: Selection ──
  let selectionInfo;
  if (mode === 'edit-point') {
    const owner = analysisEditor.buffer.find(c => c._id === selection.editPoint.ownerId);
    const time = getTimeForGridPosition(selection.editPoint.measureIndex, selection.editPoint.slotIndex);
    // [Phase78 Sprint1 バグ修正] Layer4 Projection漏れ。owner.chordを生のまま表示していたため
    // capo設定時にグリッド表示（変換後）とラベル（生データ）で異なるコード名が出ていた。
    // [Phase84] Representation（toReadableChord）→ Projection（toDisplayChord）の順で適用。
    const ownerName = owner ? toDisplayChord(toReadableChord(owner.chord), capo) : '不明';
    selectionInfo = `<span class="aep-chord-info">${owner ? `${ownerName} の途中（${time != null ? time.toFixed(3) : '?'}秒）` : '不明な位置'}</span>`;
  } else if (mode === 'single') {
    // [Phase78 Sprint1 バグ修正] 同上。chord.chordを生のまま表示していた。
    // [Phase84] Representation→Projectionの順で適用。
    selectionInfo = `<span class="aep-chord-name">${toDisplayChord(toReadableChord(chord.chord), capo)}</span>
      <span class="aep-chord-time">${chord.start.toFixed(3)}秒 〜 ${chord.end.toFixed(3)}秒</span>
      ${measureSpan ? `<span class="aep-chord-span">${measureSpan.text}</span>` : ''}`;
  } else if (mode === 'multi') {
    selectionInfo = `<span class="aep-chord-info">${selectedIds.length}コード選択中</span>
      ${measureSpan ? `<span class="aep-chord-span">${measureSpan.text}</span>` : ''}`;
  } else {
    selectionInfo = `<span class="aep-chord-info aep-chord-info--empty">クリックして編集</span>`;
  }
  const clearBtn = mode === 'idle'
    ? ''
    : `<button class="aep-btn--clear" id="aep-clear-selection" title="選択を解除" aria-label="選択を解除">✕</button>`;

  // ── Group 2: Navigation（全体シフト・常時固定） ──
  // [実機フィードバック反映] Selection行と同じ行に統合し、行数を圧縮する。
  const navigationGroup = _renderShiftControls('aep-shift', null, '全体', 'global');

  // ── Group 3: Primary Action（mode依存） ──
  // [実機フィードバック反映] 以前は独立した1行だったが、右にWorkspaceを並べ
  // 1行（action-row）に統合する。amber背景の有無で「対象固有」と「共通操作」を区別する。
  let primaryInner = '';
  if (mode === 'single') {
    const shift = _renderShiftControls('aep-bnd', !hasLeftBoundary ? '先頭のコードを含むため境界がありません' : null, '開始位置');
    const { primary, overflow } = getGroup3Actions('single', { isMultiSelect, selectedIds, hasClipboard: !!(analysisEditor.clipboard?.chords?.length) });
    primaryInner = `<div class="aep-group aep-group--primary">
        ${shift}
        <div class="aep-group-divider"></div>
        ${primary.map(_renderActionButton).join('')}
        ${_renderOverflowMenu(overflow)}
      </div>`;
  } else if (mode === 'multi') {
    const shift = _renderShiftControls('aep-rng', !canRangeShift ? '曲の端のコードを含むため、これ以上移動できません' : null, '範囲');
    const { primary, overflow } = getGroup3Actions('multi', { isMultiSelect, selectedIds, hasClipboard: !!(analysisEditor.clipboard?.chords?.length) });
    primaryInner = `<div class="aep-group aep-group--primary">
        ${shift}
        <div class="aep-group-divider"></div>
        ${primary.map(_renderActionButton).join('')}
        ${_renderOverflowMenu(overflow)}
      </div>`;
  } else if (mode === 'edit-point') {
    const { primary } = getGroup3Actions('edit-point', { isMultiSelect: false, selectedIds: [], hasClipboard: !!(analysisEditor.clipboard?.chords?.length) });
    primaryInner = `<div class="aep-group aep-group--primary">
        ${primary.map(_renderActionButton).join('')}
      </div>`;
  }
  // idle: Primaryは非表示（primaryInner = ''のまま）

  // ── Group 4: Workspace（全mode共通表示。Phase78で常時表示に変更） ──
  const workspaceInner = `<div class="aep-group aep-group--workspace">
      <button class="aep-btn" id="aep-undo" title="元に戻す（Ctrl+Z）" aria-label="元に戻す">↩ 元に戻す</button>
      <button class="aep-btn" id="aep-redo" title="やり直し（Ctrl+Y）" aria-label="やり直し">↪ やり直し</button>
      <div class="aep-group-divider"></div>
      <button class="aep-btn aep-btn--end" id="aep-cancel" title="編集を終了して閉じます" aria-label="編集終了">編集終了</button>
      <button class="aep-btn aep-btn--save" id="aep-save" title="変更を保存して閉じます" aria-label="保存して閉じる"
        ${analysisEditor.dirty ? '' : 'disabled'}>保存して閉じる</button>
    </div>`;

  // ── Group: Search（Phase80・全mode共通表示） ──
  // [仕様] Ctrl+F または🔍ボタンで開閉。編集モードに関わらず常に使える
  // （検索対象はbuffer全体であり、選択状態とは無関係のため）。
  // [実機フィードバック反映] 置換欄はモーダルではなく常設入力欄にした
  // （17件を1件ずつモーダルで置換するのは操作量が多すぎるという指摘）。
  // 検証（isChordLikeInput等）はchordEntry.js側にあり、ここからは直接
  // 呼べないため、検索欄（query）と同じく無検証の自由入力として扱う
  // （誤入力してもUndoが正式な復旧手段という既存方針を踏襲）。
  const search = analysisEditor.search;
  const searchTotal = search.matches.length;
  const searchCountLabel = !search.query
    ? ''
    : (searchTotal ? `${(search.activeIndex ?? 0) + 1}/${searchTotal}` : '0件');
  const searchQueryAttr = String(search.query).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const replaceTextAttr = String(search.replaceText).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const canReplace = searchTotal > 0 && !!String(search.replaceText ?? '').trim();
  const searchBarInner = !search.open ? '' : `
    <div class="aep-row aep-group aep-group--search">
      <input class="aep-input" id="aep-search-input" type="text" autocomplete="off"
        placeholder="コード名で検索（実音・完全一致）" value="${searchQueryAttr}">
      <span class="aep-label">→</span>
      <input class="aep-input" id="aep-search-replace-input" type="text" autocomplete="off"
        placeholder="置換後のコード名" value="${replaceTextAttr}">
      <span class="aep-label">${searchCountLabel}</span>
      <button class="aep-btn" id="aep-search-prev" title="前へ（Shift+Enter）" aria-label="前へ" ${searchTotal ? '' : 'disabled'}>◀</button>
      <button class="aep-btn" id="aep-search-next" title="次へ（Enter）" aria-label="次へ" ${searchTotal ? '' : 'disabled'}>▶</button>
      <button class="aep-btn" id="aep-search-replace" title="現在のコードを置換（置換欄でEnter）" aria-label="置換" ${canReplace ? '' : 'disabled'}>置換</button>
      <button class="aep-btn" id="aep-search-replace-all" title="ヒットした${searchTotal}件をすべて置換" aria-label="全置換" ${canReplace ? '' : 'disabled'}>全置換（${searchTotal}）</button>
      <button class="aep-btn--clear" id="aep-search-close" title="検索を閉じる" aria-label="検索を閉じる">✕</button>
    </div>`;

  panel.innerHTML = `
    <div class="aep-row aep-group aep-group--selection">
      ${selectionInfo}
      ${clearBtn}
      <span class="aep-spacer"></span>
      <button class="aep-btn" id="aep-search-toggle" title="検索（Ctrl+F）" aria-label="検索">🔍</button>
      ${navigationGroup}
    </div>
    ${searchBarInner}
    <div class="aep-row aep-group--action-row">
      ${primaryInner}
      <span class="aep-spacer"></span>
      ${workspaceInner}
    </div>
  `;

  // ── イベント結線 ──
  document.getElementById('aep-clear-selection')?.addEventListener('click', clearCurrentSelection);
  _bindShiftControls('aep-shift', shiftAll);
  _bindShiftControls('aep-bnd', requestBoundaryShift);
  _bindShiftControls('aep-rng', shiftSelectionRange);

  document.getElementById('aep-add')?.addEventListener('click', () => {
    if (!chord) return;
    // 初期実装: 均等2分割のみ（将来カーソル位置分割を追加する場合もsplitChord()自体は変更不要）
    const splitTime = (chord.start + chord.end) / 2;
    showChordSelector({
      title: 'コードを追加',
      // [Phase84] 初期表示のみRepresentation→Projectionの順で適用。
      initialChord: toDisplayChord(toReadableChord(chord.chord), capo),
      onSelect: (selected) => {
        // [Phase89] 分割+リネームをaddChord()で1Undo単位に統合（Issue #46対応）。
        const newId = addChord(selectedId, splitTime, toCanonicalChord(selected.name, capo));
        if (!newId) return;  // 万一splitTimeが不正だった場合は何もしない
      },
      // onCancel省略: 何も呼ばれず、addChord()にも到達しないため状態は一切変化しない
    });
  });
  document.getElementById('aep-rename')?.addEventListener('click', () => {
    if (!chord) return;
    openChordRenameSelector(chord);
  });
  document.getElementById('aep-undo')?.addEventListener('click', undoEdit);
  document.getElementById('aep-redo')?.addEventListener('click', redoEdit);
  document.getElementById('aep-cancel')?.addEventListener('click', () => {
    if (analysisEditor.dirty && !confirm('変更を破棄しますか？')) return;
    endAnalysisEdit();
  });
  document.getElementById('aep-save')?.addEventListener('click', async () => {
    await saveAnalysisEdit();
  });
  document.getElementById('aep-delete-chord')?.addEventListener('click', () => {
    if (!chord) return;
    // [NOTE] 確認ダイアログなし・即削除（Undo/Redoが正式な復旧手段。Phase75で確定）
    deleteChord(chord._id);
  });
  document.getElementById('aep-delete-selection')?.addEventListener('click', () => {
    // [NOTE] 確認ダイアログなし・即削除（deleteChord()と同じ方針。Phase76-B）
    deleteSelection();
  });
  document.getElementById('aep-add-here')?.addEventListener('click', () => {
    addChordAtEditPoint();
  });
  // [Phase79] editPointモードのPrimary Actionに直接置かれる「そのまま貼り付け」
  // （single/multiモードでは.aep-overflow-item側のaep-paste-absoluteとして
  // 下のhandlersマップで扱う。IDを分けているのはモード間でのDOM重複を避けるため）。
  document.getElementById('aep-paste-absolute-primary')?.addEventListener('click', () => {
    pasteAbsolute();
  });
  // その他▼メニュー内の項目（クリック後にメニューを閉じる）
  panel.querySelectorAll('.aep-overflow-item').forEach(btn => {
    const handlers = {
      'aep-copy':  () => copySelection(),
      'aep-cut':   () => cutSelection(),
      'aep-paste-absolute': () => pasteAbsolute(),
      'aep-paste': () => pasteSelection(),
      'aep-merge': () => mergeSelection(),
    };
    const fn = handlers[btn.id];
    if (!fn) return;
    btn.addEventListener('click', () => {
      fn();
      btn.closest('details.aep-overflow')?.removeAttribute('open');
    });
  });
  // ── Search（Phase80） ──
  document.getElementById('aep-search-toggle')?.addEventListener('click', () => {
    if (search.open) closeSearchBar(); else openSearchBar();
  });
  if (search.open) {
    const searchInput = document.getElementById('aep-search-input');
    const replaceInput = document.getElementById('aep-search-replace-input');
    // [フォーカス復元] 「開いた直後」か「検索欄/置換欄で入力中の再描画」の
    // 場合のみ、直前にフォーカスしていたのと同じ欄へ復元する
    // （searchWasFocused / searchFocusedId / focusRequestedの判定は関数冒頭・
    // openSearchBar()参照）。
    if (searchWasFocused || search.focusRequested) {
      const idToFocus = _searchFocusIds.includes(searchFocusedId) ? searchFocusedId : 'aep-search-input';
      const elToFocus = document.getElementById(idToFocus);
      if (elToFocus) {
        elToFocus.focus();
        elToFocus.setSelectionRange(elToFocus.value.length, elToFocus.value.length);
      }
    }
    search.focusRequested = false;

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        // [Phase82] search.queryは表示名（ユーザー入力そのまま）を保持する。
        // Canonicalへの変換はsearchChords()を呼ぶ直前（_refreshEditorView内）に
        // 一元化する（入力の都度変換するとinput値と表示がループするため）。
        analysisEditor.search.query = e.target.value;
        analysisEditor.search.activeIndex = null; // クエリが変わったら現在位置をリセット
        _refreshEditorView();
      });
      // [キー割り当て・ChatGPTレビューで確定] 検索欄にフォーカス中のEnterは
      // 「次のヒットへ」（Shift+Enterは前へ）。置換欄側は別の意味を持つ
      // （下記replaceInputのkeydown参照）。
      searchInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (e.shiftKey) searchGoToPrev(); else searchGoToNext();
      });
    }
    if (replaceInput) {
      // [Phase80・実機フィードバック反映] 置換欄はモーダルを介さない常設フィールド。
      // 検索欄と異なり、入力のたびに_refreshEditorView()は呼ばない
      // （replaceTextはハイライト等どのDecoratorにも影響しない純粋なUI-local値のため、
      // 再描画してもすることがない。値はDOM側にすでに反映されているので、
      // 他の理由での再描画時にvalue属性へ反映されれば十分）。
      replaceInput.addEventListener('input', (e) => {
        // [Phase82] replaceTextも表示名のまま保持する（queryと同じ理由）。
        analysisEditor.search.replaceText = e.target.value;
      });
      // [キー割り当て・ChatGPTレビューで確定] 置換欄にフォーカス中のEnterは
      // 「置換して次へ」（Shift+Enterは「置換して前へ」）。
      replaceInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        replaceCurrentAndAdvance(e.shiftKey ? -1 : 1);
      });
    }
    document.getElementById('aep-search-prev')?.addEventListener('click', searchGoToPrev);
    document.getElementById('aep-search-next')?.addEventListener('click', searchGoToNext);
    document.getElementById('aep-search-close')?.addEventListener('click', closeSearchBar);
    document.getElementById('aep-search-replace')?.addEventListener('click', () => {
      replaceCurrentAndAdvance(1);
    });
    document.getElementById('aep-search-replace-all')?.addEventListener('click', () => {
      // [Phase82] replaceTextは表示名 → toCanonicalChord()で実音に変換してから渡す
      // [Phase83] IME全角混入対策でnormalizeChordInput()を先に通す。
      const n = replaceAllMatches(toCanonicalChord(normalizeChordInput(analysisEditor.search.replaceText), getCapo()));
      if (n) toast(`${n}件置換しました`);
    });
  }
}

function _renderOverflowMenu(items) {
  if (!items.length) return '';
  return `<details class="aep-overflow">
      <summary class="aep-btn" title="その他の操作" aria-label="その他の操作">その他 ▾</summary>
      <div class="aep-overflow-menu">
        ${items.map(_renderOverflowItem).join('')}
      </div>
    </details>`;
}

// Chart Mode 列数（localStorage永続）
let chartMeasuresPerRow = Number(localStorage.getItem('chartMeasuresPerRow')) || 3;

// モーダル要素
const mOv = document.getElementById('modal-ov');
const mTit = document.getElementById('m-title');
const mBody = document.getElementById('m-body');
const mBtns = document.getElementById('m-btns');

// TAPモードオーバーレイ
// tap mode state → tapmode.js に移動

// 自動保存タイマー
let asT = null;

// [PROJECT SWITCH LIFECYCLE] 非同期load競合防止（Phase73-B）
// 最後に開始されたload requestのみが書き込み権限を持つ。
let _loadGeneration = 0;

// トーストタイマー
let toastT = null;

// ----------------------------
// HELPER FUNCTIONS
// ----------------------------
function getCapo(){return parseInt(document.getElementById('capo').value)||0;}

// ── 左パネル折りたたみ API ────────────────
function applyLeftCollapsed() {
  const collapsed = (leftCollapsedManual || leftCollapsedAuto)
                    && !leftExpandedOverride;
  document.body.classList.toggle('left-collapsed', collapsed);
}

// ── 右パネル表示/非表示 API ──────────────────────
function applyRightHidden() {
  document.body.classList.toggle('right-hidden', rightHidden);
}

// ── 表示メニューのチェックマーク更新 ─────────────
// メニューを開くたびに現在の状態を反映する。
// 表示中 → ✔付き、非表示 → ✔なし
function updateViewMenuChecks() {
  const btnLeft  = document.getElementById('btn-toggle-left');
  const btnRight = document.getElementById('btn-toggle-right');
  if (!btnLeft || !btnRight) return;

  // 実際の表示状態を表示する（manual stateではない）
  // narrow時はauto-collapseにより manual=false でも closed になりうる
  const leftVisible = !document.body.classList.contains('left-collapsed');
  btnLeft.textContent  = (leftVisible  ? '✔ ' : '　') + '◧ 左パネル';
  btnRight.textContent = (!rightHidden ? '✔ ' : '　') + '◨ 右パネル';
}

// Chart Mode コード図ホバーのチェックマーク更新
function _updateChartDiagMenu(enabled) {
  const btn = document.getElementById('btn-toggle-chart-diag');
  if (!btn) return;
  btn.textContent = (enabled ? '✔ ' : '　') + '♬ Chart コード図';
}

window.addEventListener('resize', () => {
  const shouldAuto = window.innerWidth < 960;
  if (shouldAuto === leftCollapsedAuto) return; // 変化なし
  leftCollapsedAuto = shouldAuto;
  if (!shouldAuto) leftExpandedOverride = false; // 960以上でoverride reset
  applyLeftCollapsed();
});

// [PLAYBACK AUTHORITY] タブのリロード・クローズ・別ページ遷移時に音声を止める。
// バックアップバッチ実行等でタブが再起動されても再生し続けてしまう問題への対応（Phase99）。
// visibilitychange（単なるタブ切替）では止めない。コード譜を見ながら他タブを
// 参照する等の通常利用まで再生停止してしまい、UXを悪化させるため対象外とする。
// Chart ModeのrAFループ（chartmode.js内部・非公開）は表示更新のみのProjectionで
// あり、Authority（aEl）を止めればここでの目的は達成される（rAF停止は不要）。
window.addEventListener('pagehide', () => {
  if (!aEl.paused) aEl.pause();
});

// ── diagLock API ──────────────────────────
// diagLocked: hover更新を抑止し右パネルを固定する
// 将来 uiState 統合時: diagLocked / diagLockedChord を uiState へ移行

// 右パネル更新の正式API（app.js内でsetDiagRightを直接呼ばない）
// currentDiagChord を常に同期する責務を持つ
function updateDiagRight(chord, capo = getCapo()) {
  currentDiagChord = chord;
  setDiagRight(chord, capo, getDiagCallbacks());
}

function lockDiag(chord) {
  if (!chord) return;
  diagLocked = true;
  diagLockedChord = chord;
  updateDiagLockUI();
}
function unlockDiag() {
  diagLocked = false;
  diagLockedChord = null;
  updateDiagLockUI();
}

// ── cancel rollback API ──────────────────────────
// AddChord open 時に lock 状態を退避する
function saveDiagStateForModal() {
  _savedDiagState = {
    locked: diagLocked,
    chord:  diagLockedChord,
  };
}

// OK 確定時（コード追加・バーライン追加等）に退避を破棄する
function clearSavedDiagState() {
  _savedDiagState = null;
}

// Cancel / Escape / × 時に lock 状態を復元する
// lock していなかった場合は何もしない
function restoreOnCancel() {
  if (!_savedDiagState) return;
  const { locked, chord } = _savedDiagState;
  if (locked && chord) {
    updateDiagRight(chord);
    lockDiag(chord);
  }
  _savedDiagState = null;
}

function canUpdateDiagFromHover() {
  return !diagLocked;
}
function updateDiagLockUI() {
  const phdr = document.querySelector('#panel-right .phdr');
  if (!phdr) return;
  if (diagLocked) {
    phdr.classList.add('diag-locked');
  } else {
    phdr.classList.remove('diag-locked');
  }
}

// ── preview layer API ──────────────────
// diagLocked 中でも右パネルを一時更新する（diagLockedChord は書き換えない）
// chordEntry.js の transient preview から使用。
// updateDiagRight との違い: currentDiagChord を更新しないため
//   diagLock 状態が壊れない。modal close 後に lock が復元可能。
// 将来: beginTransientPreview() / endTransientPreview() に発展予定
function forcePreviewChord(chord) {
  setDiagRight(chord, getCapo(), getDiagCallbacks());
}

// ════════════════════════════════════════
// FILE LOADING
// ════════════════════════════════════════

async function loadChordData(data, filename, isRestore = false) {

  // ── capo restore ──────────────────────────────────────────
  // isRestore = true（IndexedDB 自動復元経路）の場合はスキップする。
  // loadProj() が uiState.capo で capo を正しく復元しているため、
  // ここで capo を 0 にリセットすると保存済みの capo 値が失われる。
  //
  // isRestore = false（manual ingest 経路）の場合のみ実行する:
  //   コードJSONはcanonical（capo=0）データ前提。
  //   import前にlinesのchordを現capo分だけ逆方向に戻してから
  //   capo stateを0にリセットする。
  //   （restore→reset→ingest の順序が重要）
  //
  // paletteはこの直後に新JSONから再生成されるためrestoreしない。
  // capo change: semitones = -diff なので
  // restore方向: +_prevCapo（逆算）
  if (!isRestore && _prevCapo !== 0) {
    const restoreSemitones = _prevCapo;
    (project.lines || []).forEach(line => {
      line.chords.forEach(c => {
        if (!c.chord) return;
        c.chord = transposeChord(c.chord, restoreSemitones);
      });
    });
  }

  // capo state リセット（3つセットで整合）
  // isRestore = true の場合はスキップ（loadProj が uiState.capo で管理しているため）
  if (!isRestore) {
    project.capo = 0;
    document.getElementById('capo').value = 0;
    _prevCapo = 0;
  }
  // ──────────────────────────────────────────────────────────

  project.chord_source=filename;
  const b=document.getElementById('chord-btn');b.textContent=filename;b.classList.add('loaded');
  // no_chord 系文字列（N / NC / N.C.）はパレットに含めない。
  // 文字列比較は import 経路のみ（内部 token は isNoChordToken で判定）。
  // normalize後（ドット・括弧除去・大文字化）で比較するため 'N.C.' / '(N.C)' 等も吸収する
  const NO_CHORD_STRS = new Set(['N', 'NC']);
  const all=(data.chords||[]).filter(c=>c&&!NO_CHORD_STRS.has(
    String(c).trim().toUpperCase().replace(/\./g,'').replace(/[()]/g,'')
  ));
  palette=[...new Set(all)];
  window._cn=data.chords||[];window._ct=data.times||[];

  // tempo・keyがあれば自動入力（空欄の場合のみ上書き）
  if(data.tempo){const bpmEl=document.getElementById('proj-bpm');if(!bpmEl.value)bpmEl.value=Math.round(data.tempo);}
  if(data.key){const keyEl=document.getElementById('proj-key');if(!keyEl.value)keyEl.value=data.key;}

  // Analysis ingestion / normalization layer
  //
  // [Phase72-B hotfix: isRestore=true 時は analysis 処理を完全スキップ]
  //   不具合: IndexedDB からのコード自動復元（isRestore=true）経路で
  //   project.analysis を再構築・再保存してしまい、loadProj() の①で
  //   既に正しく読み込み済みだった repairRule が null で
  //   上書き保存される事故が発生した（実機テストで発覚）。
  //
  //   [OWNERSHIP] analysis（raw / repairRule）の唯一の正本は
  //   analysis/{id}.json であり、loadProj() がそこから読み込む。
  //   IndexedDB に保存されているコードJSON内の analysis は
  //   「インポート時点のスナップショット」に過ぎず、復元時の
  //   authority にしてはならない。
  //
  //   isRestore=true（IndexedDB自動復元）の目的は
  //   コード進行データ（palette / chord_source 表示名）の復元のみ。
  //   analysis の復元は loadProj() が既に担当済みのため、
  //   ここで再度 loadAnalysis() / saveAnalysisFile() を呼ぶ必要はない。
  if (!isRestore) {
    project.analysis = await loadAnalysis(data.analysis ?? null);

    // analysis が存在すれば即保存
    // [REPAIR DISCARD POLICY 確定] 新規インポート（再解析含む）では
    // repairRule を渡さない（デフォルト null）。
    // 解析データ（raw.beats）が変わった場合、古い anchor の beatTime が
    // 新しい raw.beats に存在しない可能性が高く、repair を引き継ぐ方が
    // 危険なため、再インポート時は repairRule を破棄する方針（確定）。
    if (data.analysis?.raw) {
      const ok = await saveAnalysisFile(project.id, data.analysis.raw);
      if (ok) {
        project.hasAnalysis = true;
      } else {
        console.warn('[analysis] failed to persist analysis file. Chart Mode will not survive reload.');
      }
    }
  }

  // ★ palette UI 更新
  renderPalette();
  document.getElementById('pal-count').textContent = palette.length;

  // capo restore後のlines再描画
  refreshEditor();

  updateChartModeAvailability();

  // analysis 復元成功時にバナーを消す
  if (project.analysis) {
    const analysisBanner = document.getElementById('analysis-missing-banner');
    if (analysisBanner) analysisBanner.remove();
  }

  toast(`コード読み込み: ${palette.length}種`+(data.tempo?` / ${Math.round(data.tempo)}BPM`:'')+(data.key?` / ${data.key}`:''));
  checkReloadBannerDone();
  renderImportBtn();
}

function checkReloadBannerDone(){
  const banner=document.getElementById('reload-banner');
  if(!banner)return;
  const audioOk=aEl.src&&aEl.src!==window.location.href;
  const chordOk=palette.length>0||!project.chord_source;
  if(audioOk&&chordOk)banner.remove();
}

function renderImportBtn(){
  const old=document.getElementById('json-import-btn-wrap');if(old)old.remove();
  const cn=window._cn||[];const ct=window._ct||[];
  if(!cn.length||!ct.length)return;
  const hasTimed=project.lines.some(l=>l.time!=null);
  const wrap=document.createElement('div');
  wrap.id='json-import-btn-wrap';
  wrap.style.cssText='padding:4px 8px 6px';
  const btn=document.createElement('button');
  btn.id='json-import-btn';
  btn.className='file-btn';
  btn.style.cssText='width:100%;font-size:11px';
  btn.textContent='🎵 コードを行に自動登録';
  btn.disabled=!hasTimed;
  btn.title=hasTimed?'JSONのコードをタイムスタンプに基づいて行に登録':'タイムスタンプ付きの行がありません';
  btn.addEventListener('click',importChordsFromJson);
  wrap.appendChild(btn);
  // file-rowの「コード」ボタン行の直後に挿入
  const chordRow=document.getElementById('chord-btn').closest('.file-row');
  if(chordRow&&chordRow.parentNode)chordRow.parentNode.insertBefore(wrap,chordRow.nextSibling);
}

function importChordsFromJson(){
  const cn=window._cn||[];const ct=window._ct||[];
  if(!cn.length||!ct.length){toast('コードデータがありません');return;}

  // タイムスタンプ未設定行を補完（前後の有効timestampで線形補間）
  const lines=project.lines;
  const ts=lines.map(l=>l.time); // null含む

  // 有効tsのインデックスを収集
  const validIdx=ts.map((t,i)=>t!=null?i:-1).filter(i=>i>=0);
  if(!validIdx.length){toast('タイムスタンプ付きの行がありません');return;}

  // 各行の有効timestamp（補完済み）を計算
  const effTs=ts.map((t,i)=>{
    if(t!=null)return t;
    // 前後の有効インデックスを探す
    const prev=validIdx.filter(vi=>vi<i).pop();
    const next=validIdx.find(vi=>vi>i);
    if(prev==null&&next==null)return null;
    if(prev==null)return ts[next];
    if(next==null)return ts[prev];
    // 線形補間
    const span=next-prev;
    const frac=(i-prev)/span;
    return ts[prev]+(ts[next]-ts[prev])*frac;
  });

  // 既存コードがある行があれば上書き確認
  const hasExisting=lines.some(l=>l.chords.length>0);
  const doImport=(overwrite)=>{
    // import前スナップショットをundo stackへ
    importUndoStack.push(lines.map(l=>({...l,chords:l.chords.map(c=>({...c}))})));

    // 各行にコードを配置
    const newLines=lines.map(l=>({...l,chords:overwrite?[]:l.chords.map(c=>({...c}))}));
    cn.forEach((chord,ji)=>{
      if(!chord)return;
      const t=ct[ji];
      if(t==null)return;

      // no_chord 系文字列（N / NC / N.C. / (N.C) 等）は { type:'no_chord' } token として挿入する。
      // 文字列のまま保存しない（token semantic への移行）。
      // 括弧・ドット・空白を除去してから比較する。
      const normalized = String(chord).trim().toUpperCase()
        .replace(/\./g,'').replace(/\s/g,'').replace(/[()]/g,'');
      const isNc = normalized === 'N' || normalized === 'NC';

      // どの行に属するか判定: effTs[i] <= t < effTs[i+1]
      let target=-1;
      for(let i=0;i<newLines.length;i++){
        const cur=effTs[i];
        if(cur==null)continue;
        const nxt=effTs[i+1]??Infinity;
        if(t>=cur&&t<nxt){target=i;break;}
      }
      if(target<0)return;
      if (isNc) {
        // no_chord は token semantic で保存（文字列禁止）
        newLines[target].chords.push({ type: 'no_chord' });
      } else {
        // NOTE [LEGACY-RESIDUE]: offset is currently unused (always 0, never read).
        // This was an early attempt to record intra-measure chord position.
        // Future musical coordinate redesign (Issue #26) should replace this
        // with a proper bar/beat model rather than extending this field.
        newLines[target].chords.push({chord, offset:0});
      }
    });

    project.lines=newLines;
    refreshEditor();
    renderImportBtn(); // undo後にボタン状態を更新
    toast(`✅ コード自動登録完了 / Ctrl+Z で元に戻せます`);
  };

  if(hasExisting){
    mTit.textContent='上書き確認';
    mBody.innerHTML='<p style="margin:0;line-height:1.6">既存のコードがある行があります。<br>上書きして自動登録しますか？</p>';
    mBtns.innerHTML='';
    mBtns.appendChild(mkMBtn('キャンセル','',closeMod));
    mBtns.appendChild(mkMBtn('上書きして登録','ok',()=>{closeMod();doImport(true);}));
    mOv.classList.add('open');
  } else {
    doImport(false);
  }
}

// ════════════════════════════════════════
// PALETTE
// ════════════════════════════════════════
function renderPalette(){
  const filter=document.getElementById('pal-filter').value.toLowerCase();
  const c=document.getElementById('chord-pal');
  const filtered=palette.filter(ch=>transposeChord(ch,paletteTranspose).toLowerCase().includes(filter));
  c.innerHTML='';
  if(!filtered.length){c.innerHTML='<div style="color:var(--text-muted);font-size:11px;font-family:var(--font-mono)">なし</div>';return;}
  filtered.forEach(chord=>{
    const displayChord=transposeChord(chord,paletteTranspose);
    const btn=document.createElement('button');btn.className='pal-chord';btn.textContent=displayChord;
    btn.addEventListener('click',()=>handleAddChordToLine(displayChord));
    btn.addEventListener('mouseenter',()=>{
      if (!canUpdateDiagFromHover()) return;
      updateDiagRight(displayChord);
    });
    c.appendChild(btn);
  });
}

// ════════════════════════════════════════
// LINE MANAGEMENT（editor.js wrapper）
// ════════════════════════════════════════

// renderLines用のコールバック設定を生成
// ════════════════════════════════════════
// EDITOR
// ════════════════════════════════════════
/**
 * エディタUI制御とコールバック
 * 
 * 【責務】
 * - editor.jsへのコールバック提供
 * - State → UI State変換（getEditorUIState）
 * - 再描画トリガー（refreshEditor, callRenderLines）
 * 
 * 【データフロー】
 * ユーザー操作 → Callback → State更新 → refreshEditor → renderLines → UI
 */
/**
 * createEditorCallbacks 内の変更箇所
 *
 * 【変更の理由】
 *   旧: openTimeModal(idx) のように idx だけ渡していた
 *       → 関数内部で project.lines[idx] を直接触っていた（state mutation が modal 内に漏れていた）
 *
 *   新: line（読み取り専用）と onConfirm / onDelete を渡す
 *       → modal は「値を受け取って通知するだけ」
 *       → state mutation は callback 内（app.js側）で行う
 *
 * 【フロー図（新）】
 *   ユーザーが「セット」を押す
 *       ↓
 *   modals.js が onConfirm(time) を呼ぶ
 *       ↓
 *   app.js（この callback）が state を更新して refreshEditor()
 */

function createEditorCallbacks() {
  return {
    // ── onTimeClick（時刻なし → モーダルを開く）──
    onTimeClick: (idx, time) => {
      if (time != null) {
        aEl.currentTime = time;
        if (aEl.paused) aEl.play();
        toast(`▶ ${fmt(time, true)} にシーク`);
      } else {
        openTimeModal({
          idx,
          line: project.lines[idx],
          onConfirm: (time) => { project.lines[idx].time = time; refreshEditor(); },
          onDelete:  ()     => { project.lines[idx].time = null; refreshEditor(); },
        });
      }
    },
    // ── onTimeContextMenu（右クリック → 常にモーダルを開く）──
    onTimeContextMenu: (idx) => {
      openTimeModal({
        idx,
        line: project.lines[idx],
        onConfirm: (time) => { project.lines[idx].time = time; refreshEditor(); },
        onDelete:  ()     => { project.lines[idx].time = null; refreshEditor(); },
      });
    },
    onChordEdit: (idx, ci) => {
      openChordEdit({
        chord: project.lines[idx].chords[ci].chord,
        onConfirm: (v) => {
          addToPaletteIfNew(v);
          project.lines[idx].chords[ci].chord = v;
          refreshEditor();
        },
        onDelete: () => {
          project.lines[idx].chords.splice(ci, 1);
          refreshEditor();
        },
      });
    },
    onChordDblClick: (idx, ci, chord) => {
      closeMod();
      updateDiagRight(chord);
      lockDiag(chord);
    },
    onAddChord: (idx) => {
      openAddChord(idx);
    },
    // ── onRepeatClick ──
    onRepeatClick: (idx) => {
      openRepeatModal({
        idx,
        line: project.lines[idx],
        onConfirm: (count) => { project.lines[idx].repeat = { count }; refreshEditor(); },
        onDelete:  ()      => { project.lines[idx].repeat = null;       refreshEditor(); },
      });
    },
    onRepeatDelete: (idx) => {
      project.lines[idx].repeat = null;
      refreshEditor();
    },
    onChordDelete: (idx, ci) => {
      project.lines[idx].chords.splice(ci, 1);
      refreshEditor();
    },
    onSepClick: (idx, ci) => {
      project.lines[idx].chords.splice(ci, 1);
      refreshEditor();
    },
    onSepInsert: (idx, ci) => {
      project.lines[idx].chords.splice(ci + 1, 0, { type: 'barline' });
      refreshEditor();
    },
    onLineInsertAbove: (idx) => {
      project.lines.splice(idx, 0, mkLine());
      refreshEditor();
    },
    onLineInsertBelow: (idx) => {
      project.lines.splice(idx + 1, 0, mkLine());
      refreshEditor();
    },
    onLineDelete: (idx) => {
      project.lines.splice(idx, 1);
      refreshEditor();
    },
    onLyricFocus: (idx) => {
      focLine = idx;
      tapIdx = idx;
    },
    onLineClick: (idx) => {
      // 通常モード: focLineを更新
      focLine = idx;
      tapIdx = idx;
      
      // UI更新（autoSaveなし）
      renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
      
      // 歌詞inputにフォーカス
      setTimeout(() => {
        const inputs = document.querySelectorAll('.lyric-input');
        if (inputs[idx]) {
          inputs[idx].focus();
        }
      }, 0);
    },
    onLyricInput: (idx, value) => {
      project.lines[idx].lyric = value;
      autoSaveLocal();
    },
    onLyricEnter: (idx) => {
      project.lines.splice(idx + 1, 0, mkLine());
      renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
      setTimeout(() => {
        const ins = document.querySelectorAll('.lyric-input');
        if (ins[idx + 1]) ins[idx + 1].focus();
      }, 0);
    },
    onLyricBackspace: (idx) => {
      project.lines.splice(idx, 1);
      refreshEditor();
      setTimeout(() => {
        const ins = document.querySelectorAll('.lyric-input');
        if (ins[Math.max(0, idx - 1)]) ins[Math.max(0, idx - 1)].focus();
      }, 0);
    },
    onTapSet: (idx) => {
      tapIdx = idx;
      toast(`次のTAPで行${idx + 1}に時刻セット`);
    },
    // ── onCopyClick ──
    // onCopy の payload: { targets, replace, copyRepeat }
    //   targets    : コピー先の行インデックス配列
    //   replace    : true=上書き / false=追記
    //   copyRepeat : リピート記号もコピーするか
    onCopyClick: (idx) => {
      openCopyModal({
        fromIdx: idx,
        line:    project.lines[idx],
        lines:   project.lines,
        onCopy: ({ targets, replace, copyRepeat }) => {
          const src = project.lines[idx].chords.map(c => ({ ...c }));
          targets.forEach(ti => {
            project.lines[ti].chords = replace
              ? src.map(c => ({ ...c }))
              : [...project.lines[ti].chords, ...src.map(c => ({ ...c }))];
            if (copyRepeat && project.lines[idx].repeat) {
              project.lines[ti].repeat = { ...project.lines[idx].repeat };
            }
          });
          refreshEditor();
        },
      });
    },
    setDiagRight: (chord, capo) => {
      if (!canUpdateDiagFromHover()) return;
      updateDiagRight(chord, capo);
    },
    onChordHover: (chord) => {
      if (!canUpdateDiagFromHover()) return;
      updateDiagRight(chord);
    },
    updateStatus: () => {
      updateStatus();
    },
    toast: (msg) => {
      toast(msg);
    }
  };
}

// renderLinesのUI状態を生成
function getEditorUIState() {
  return {
    focLine,
    tapIdx,
    capo: getCapo(),
    fmt
  };
}

// エディタを再描画
function refreshEditor() {
  renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
  autoSaveLocal();
}

// エディタを再描画（自動保存なし）
function callRenderLines() {
  renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
}

// コード追加（パレットから）
function handleAddChordToLine(chord) {
  const result = addChordToLine(chord, project.lines, focLine, {
    onLinesChange: () => {
      renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
    }
  });
  
  focLine = result.focLine;
  
  if (result.needsRender) {
    refreshEditor();
  }
  
  setTimeout(() => {
    const ins = document.querySelectorAll('.lyric-input');
    if (ins[focLine]) ins[focLine].focus();
  }, 0);
}

// ════════════════════════════════════════
// MODAL SYSTEM
// ════════════════════════════════════════
function closeMod(){mOv.classList.remove('open');mBody.innerHTML='';mBtns.innerHTML='';}
// [Phase83] 背景クリックで閉じる判定をclickのみからmousedown+click両方が
// 背景上で発生した場合のみへ変更（仮説：入力欄内でのドラッグ選択が背景外で
// mouseupすると誤ってclickイベントがmOvをtargetにしてしまう問題への対策）。
let _mOvMouseDownOnOverlay = false;
mOv.addEventListener('mousedown', e => { _mOvMouseDownOnOverlay = (e.target === mOv); });
mOv.addEventListener('click', e => {
  if (e.target === mOv && _mOvMouseDownOnOverlay) closeMod();
  _mOvMouseDownOnOverlay = false;
});
function mkMBtn(txt,cls,fn){const b=document.createElement('button');b.className=`mbtn ${cls||''}`;b.textContent=txt;b.addEventListener('click',fn);return b;}

/**
 * openModal — modals.js へ注入するモーダル開閉ラッパー
 *
 * 【なぜこの関数が必要か】
 *   modals.js はモーダル土台のDOM（mOv/mTit/mBody/mBtns）を直接知らない。
 *   この関数が「土台への書き込み」と「modals.js からの呼び出し」を橋渡しする。
 *
 * 【フロー図】
 *   modals.js
 *     └ openModal({ title, body, onOpen, buttons }) を呼ぶ
 *           ↓
 *   app.js（この関数）
 *     └ mTit / mBody / mBtns に書き込む
 *     └ buttons(close) でボタン一覧を受け取り mBtns に追加
 *     └ mOv.classList.add('open') で表示
 *           ↓
 *   setTimeout → onOpen() でフォーカス等の後処理
 *
 * 【ownership】
 *   土台DOM の読み書き: app.js（この関数）が持つ
 *   中身の生成:         modals.js が持つ
 *   close の実行:       modals.js 内の各ボタンが close() を呼ぶ
 *                       close() の実体は closeMod()
 *
 * @param {object}   opts
 * @param {string}   opts.title   - モーダルのタイトル
 * @param {string}   opts.body    - 本文HTML
 * @param {Function} opts.onOpen  - DOM描画後に呼ばれる（フォーカス等）
 * @param {Function} opts.buttons - (close) => HTMLElement[] ボタン一覧を返す関数
 */
function openModal({ title, body, onOpen, buttons }) {
  mTit.textContent = title;
  mBody.innerHTML  = body;
  mBtns.innerHTML  = '';

  // close の実体は closeMod()
  // modals.js 側は close() として受け取り、土台DOMを知らずに閉じられる
  const close = () => closeMod();

  const btns = typeof buttons === 'function' ? buttons(close) : [];
  btns.forEach(btn => mBtns.appendChild(btn));

  mOv.classList.add('open');

  // DOMが描画された後にonOpenを実行
  // （フォーカス・イベント登録などはDOM生成後でないと動かないため）
  setTimeout(() => onOpen?.(), 80);
}

function addToPaletteIfNew(chord){
  if(chord&&chord!=='N'&&!palette.includes(chord)){
    palette.push(chord);
    renderPalette();
    document.getElementById('pal-count').textContent=palette.length;
  }
}

// ダイアグラム編集・削除
function refreshDiagrams(){
  loadCustomDiagrams();
  const cur = document.getElementById('diag-in').value.trim();
  showDiagramPanel(cur, getCapo(), getDiagCallbacks());
  const undoBtn = document.getElementById('btn-diag-undo');
  if(undoBtn) undoBtn.disabled = (diagUndoSize() === 0);
}

function getDiagCallbacks(){
  return {
     /**
     * onEdit callback
     *   diagram一覧の「編集」ボタンから呼ばれる。
     *   chord / id を受け取り、variant を lookup して modal に渡す。
     *   variant の取得は app.js が行う（modals.js に lookup させない）。
     */
    onEdit: (chord, id) => {
      const entry   = getChordEntry(chord);
      if (!entry) { toast('ダイアグラムが見つかりません'); return; }
      const variant = entry.data.v.find(v => v._id === id);
      if (!variant) { toast('ダイアグラムが見つかりません'); return; }
      openEditDiagramModal({ chord, id, variant });
    },
    onDelete: (chord, id) => deleteDiagramVariant(chord, id),
  };
}

function deleteDiagramVariant(chord, id){
  if(!getChordEntry(chord)) return;
  diagPushUndo();
  removeCustomDiagram(chord, id);
  saveCustomDiagrams();
  refreshDiagrams();
  toast('削除しました');
}

// ════════════════════════════════════════
// ダイアグラム export / import
function exportCustomDiagrams(){
  const saved = localStorage.getItem('cs_customDiags');
  if(!saved){ toast('カスタムダイアグラムがありません'); return; }
  const blob = new Blob([saved], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chordscore_diagrams.json';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function importCustomDiagrams(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try{
      const data = JSON.parse(e.target.result);
      if(!data.version || !data.chords) throw new Error();
      const current = JSON.parse(localStorage.getItem('cs_customDiags')||'{"version":2,"chords":{}}');
      let added = 0;
      for(const [k, variants] of Object.entries(data.chords)){
        // import側 key も canonical 化
        const canonical = normalizeChordName(diagKeyDecode(k));
        const storageKey = diagKey(canonical);
        if(!current.chords[storageKey]) current.chords[storageKey] = [];
        const bucket = current.chords[storageKey];
        const existIds = new Set(bucket.map(v => v.id));
        const existFps = new Set(bucket.map(v => `${v.n}|${(v.f||[]).join(',')}|${v.b ?? ''}`));
        for(const vr of variants){
          const fp = `${vr.n}|${(vr.f||[]).join(',')}|${vr.b ?? ''}`;
          if(existIds.has(vr.id) || existFps.has(fp)) continue;
          bucket.push(vr);
          existIds.add(vr.id);
          existFps.add(fp);
          added++;
        }
      }
      diagPushUndo();
      localStorage.setItem('cs_customDiags', JSON.stringify(current));
      refreshDiagrams();
      toast(`✅ ${added}件追加しました`);
    } catch(err){
      toast('❌ ファイルが未対応の形式です');
    }
  };
  reader.readAsText(file);
}



// ════════════════════════════════════════
// SAVE / LOAD（File System Access API対応）
// ════════════════════════════════════════

function getUIState() {
  // title / artist は project ownership。uiState には含めない（Phase46）
  return {
    capo:  parseInt(document.getElementById('capo').value) || 0,
    key:   document.getElementById('proj-key').value.trim(),
    tempo: parseInt(document.getElementById('proj-bpm').value) || 0,
  };
}

async function saveProject(forceNew = false) {
  const uiState = getUIState();
  const projectData = serializeProject(project, uiState);
  const result = await saveProjectToFile(projectData, _fileHandle, forceNew);

  if (result.success) {
    _fileHandle = result.fileHandle;
    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('st-save').textContent = result.fileName + ' ' + timestamp;
    toast(`💾 保存: ${result.fileName}`);
    autoSaveLocal();
    
    // フォールバック時のダウンロード処理（result.blobが存在する場合）
    if (result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  } else if (result.error && result.error.name !== 'AbortError') {
    toast('保存エラー: ' + result.error.message);
  }
}

async function saveProjectNew() {
  // [PROJECT IDENTITY SEMANTICS] filename ≠ project identity（Phase62）
  // 新UUIDを発行することで、同一ファイルから派生した別プロジェクトとして扱う。
  // IndexedDB assets（audio/chord）は旧IDに紐づいたまま残る（意図的）。
  project.id = crypto.randomUUID();
  _fileHandle = null;  // 強制的に新規ファイル保存ダイアログを出す

  await saveProject(true);
}

function showReloadBanner(audioName, chordName){
  // 既存バナーを削除
  const old=document.getElementById('reload-banner');if(old)old.remove();
  const banner=document.createElement('div');
  banner.id='reload-banner';
  banner.style.cssText='background:rgba(255,184,64,.12);border:1px solid var(--color-amber);border-radius:var(--r-md);padding:8px 10px;margin:0 0 8px;font-size:11px;font-family:var(--font-mono);color:var(--color-amber);';
  banner.innerHTML=`
    <div style="margin-bottom:5px;font-weight:600">📂 ファイルを再選択してください</div>
    ${audioName?`<div style="margin-bottom:3px;color:var(--text-secondary)">音声: ${audioName}
      <button onclick="document.getElementById('file-audio').click()" style="margin-left:6px;background:var(--surface-overlay);border:1px solid var(--border-ui);border-radius:3px;color:var(--text-secondary);cursor:pointer;font-family:var(--font-mono);font-size:10px;padding:2px 6px;">選択</button>
    </div>`:''}
    ${chordName?`<div style="color:var(--text-secondary)">コード: ${chordName}
      <button onclick="document.getElementById('file-chord').click()" style="margin-left:6px;background:var(--surface-overlay);border:1px solid var(--border-ui);border-radius:3px;color:var(--text-secondary);cursor:pointer;font-family:var(--font-mono);font-size:10px;padding:2px 6px;">選択</button>
    </div>`:''}
    <button onclick="document.getElementById('reload-banner').remove()" style="margin-top:5px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-family:var(--font-mono);font-size:10px;padding:0">✕ 閉じる</button>
  `;
  // editor-areaの先頭に挿入
  const ea=document.getElementById('editor-area');
  ea.insertBefore(banner, ea.firstChild);
}

// analysis missing バナー
function showAnalysisMissingBanner() {
  const old = document.getElementById('analysis-missing-banner');
  if (old) old.remove();

  const banner = document.createElement('div');
  banner.id = 'analysis-missing-banner';
  banner.style.cssText = [
    'background:rgba(255,184,64,.08)',
    'border:1px solid var(--color-amber)',
    'border-radius:var(--r-md)',
    'padding:8px 10px',
    'margin:0 0 8px',
    'font-size:11px',
    'font-family:var(--font-mono)',
    'color:var(--color-amber)',
  ].join(';');

  banner.innerHTML = `
    <div style="font-weight:600;margin-bottom:3px">
      ⚠ 解析データが見つかりません
    </div>
    <div style="color:var(--text-secondary)">
      Chart Mode は利用できません。
      解析データを再インポートしてください。
    </div>
    <button onclick="document.getElementById('analysis-missing-banner').remove()"
      style="margin-top:5px;background:none;border:none;
             color:var(--text-muted);cursor:pointer;
             font-family:var(--font-mono);font-size:10px;padding:0">
      ✕ 閉じる
    </button>
  `;

  const ea = document.getElementById('editor-area');
  if (ea) ea.insertBefore(banner, ea.firstChild);
}

function updateChartModeAvailability() {
  const btn = document.getElementById('btn-chart-mode');
  if (!btn) return;
  const enabled = !!project.analysis;
  btn.disabled = !enabled;
  btn.title = enabled ? '' : '解析データがありません';
}

// ════════════════════════════════════════
// STATE MANAGEMENT
// ════════════════════════════════════════
/**
 * プロジェクト状態の初期化と管理
 * 
 * 【責務】
 * - State完全リセット（resetProject）
 * - プロジェクト読み込み（loadProj）
 * - UI状態の保存/復元
 * 
 * 【データフロー】
 * resetProject/loadProj → State更新 → refreshEditor → UI反映
 * 
 * 【使用箇所】
 * - New Project
 * - Load Project
 * - Project読み込み時
 */

/**
 * プロジェクト状態を完全にリセット
 * New Project / Load Project の共通処理
 */
function resetProject() {
  // Project Data（createEmptyProject 経由で invariant 保証）
  project = createEmptyProject();
  
  palette = [];
  window._cn = [];
  window._ct = [];
  importUndoStack = [];
  const oldBtn=document.getElementById('json-import-btn-wrap');if(oldBtn)oldBtn.remove();
  _fileHandle = null;
  
  // Audio State
  if (_aURL) {
    URL.revokeObjectURL(_aURL);
    _aURL = null;
  }
  aEl.src = '';
  aEl.pause();
  aEl.currentTime = 0;
  
  // Focus State
  focLine = -1;
  tapIdx = -1;
  resetTovFocus();
  
  // UI Reset
  document.getElementById('project-artist').value = '';
  document.getElementById('project-title').value = '';
  document.getElementById('capo').value = 0;
  _prevCapo = 0;  // capo change イベントの diff 計算基準をリセット
  document.getElementById('proj-key').value = '';
  document.getElementById('proj-bpm').value = '';
  document.getElementById('diag-in').value = '';
  
  const lyricTa = document.getElementById('lyric-ta');
  if (lyricTa) lyricTa.value = '';
  
  const audioBtn = document.getElementById('audio-btn');
  const chordBtn = document.getElementById('chord-btn');
  
  audioBtn.textContent = 'クリックして選択';
  audioBtn.classList.remove('loaded');
  
  chordBtn.textContent = 'JSON / CSV';
  chordBtn.classList.remove('loaded');
  
  const tapBtn = document.getElementById('tap-btn');
  if (tapBtn) tapBtn.disabled = true;
  
  const linesCont = document.getElementById('lines-cont');
  if (linesCont) linesCont.innerHTML = '';
  
  const reloadBanner = document.getElementById('reload-banner');
  if (reloadBanner) reloadBanner.remove();

  const analysisBanner = document.getElementById('analysis-missing-banner');
  if (analysisBanner) analysisBanner.remove();
}

// ════════════════════════════════════════
// PROJECT OPERATIONS
// ════════════════════════════════════════

async function loadProj(data){
  // [PROJECT SWITCH LIFECYCLE]
  // generation採番は「最初の同期処理」として行う（Phase73-A確定事項）。
  // いかなる await より前に採番すること。
  // project.id をトークンにしない理由: 同一プロジェクトの連続loadを区別できないため。
  const myGeneration = ++_loadGeneration;

  // Reset existing state
  resetProject();
  
  const { project: newProject, uiState } = deserializeProject(data);
  
// Apply UI state（capo / key / tempo のみ）
  document.getElementById('capo').value = uiState.capo;
  document.getElementById('proj-key').value = uiState.key;
  document.getElementById('proj-bpm').value = uiState.tempo;
  _prevCapo = uiState.capo;

  // Apply project data
  // normalizeProject 経由で invariant 保証（field追加時の代入漏れ防止）
  // capo は uiState ownership だが serialize 互換のため project にも保持
  project = normalizeProject({
    ...newProject,
    capo:  uiState.capo,
    lines: (newProject.lines || []).map(l =>
      mkLine(l.lyric || '', l.time ?? null, l.chords || [], l.repeat || null)
    ),
  });

  // title / artist input を project から復元
  document.getElementById('project-artist').value = project.artist;
  document.getElementById('project-title').value  = project.title;

  // TOKEN MIGRATION: no_chord 文字列 → { type:'no_chord' }
  // 旧形式で保存された '(N.C)' / 'N' / 'NC' / 'N.C.' 等を
  // token semantic に変換する。
  // Phase44-Step2 以降の新規データはこの経路を通らない。
  //
  // [SERIALIZE PRINCIPLE] serialize は token object をそのまま保存する。
  // この migration は「旧形式文字列 → token object 変換」であり、
  // tokenToText() の逆引きではない。display projection は非可逆のため
  // 復元は必ず raw 文字列から token を生成する経路を使う。
  project.lines.forEach(line => {
    line.chords = line.chords.map(c => {
      if (c.type) return c; // 既に typed token（barline / no_chord 等）はスキップ
      if (!c.chord) return c;
      const n = String(c.chord).trim().toUpperCase()
        .replace(/\./g,'').replace(/\s/g,'').replace(/[()]/g,'');
      if (n === 'N' || n === 'NC') return { type: 'no_chord' };
      return c;
    });
  });

// ── restore ordering contract ──────────────────────────────────────────
  // ① deserializeProject()     lines / title / capo 復元
  // ② analysis/{id}.json 読込   raw のみ取得
  // ③ loadAnalysis({ raw })     normalized 生成（capo 非依存）
  //    → project.analysis = { raw, normalized, beats, downbeats, ... }
  // ④ capo UI 復元（_prevCapo = uiState.capo）← ③の後でよい（capo 非依存）
  // ⑤ audio / chord 自動復元   isRestore=true で capo reset スキップ
  // ⑥ refreshEditor()           全 runtime state が揃った後
  //
  // [TIMING INVARIANT] normalized は capo 非依存。
  //   capo 変更では normalized rebuild 不要。
  //   capo は UI Projection layer（_renderChartGrid の transposeChord）のみに影響する。
  // [PERSIST INVARIANT] project.analysis.normalized は serialize 禁止。
  //   serializeProject() は hasAnalysis フラグのみ保存する（project.js 参照）。
  // ──────────────────────────────────────────────────────────────────────
  // analysis load / migration
  if (newProject.hasAnalysis) {
    // 新形式: analysis/{id}.json から load
    // Phase72-B: loadAnalysisFile の戻り値が { raw, repairRule } に変更された。
    // repairRule（ユーザーの手動タイミング補正の意図）も同じ analysis オブジェクトに
    // 含めて loadAnalysis() へ渡す（raw と同じ階層・案I の構造）。
    const fileResult = await loadAnalysisFile(newProject.id);

    if (myGeneration !== _loadGeneration) return;  // [世代チェック①]

    project.analysis = await loadAnalysis(
      fileResult ? { raw: fileResult.raw, repairRule: fileResult.repairRule } : null
    );

    if (myGeneration !== _loadGeneration) return;  // [世代チェック②]

    if (!project.analysis) showAnalysisMissingBanner();

  } else if (data.analysis?.raw) {
    // 旧形式 migration: 埋め込み analysis を外部ファイルへ移行
    // [REPAIR DISCARD POLICY] 旧形式ファイルには repairRule は存在しないため、
    // saveAnalysisFile の repairRule 引数は渡さない（デフォルト null）。
    console.info('[analysis] migrating embedded analysis to external file');
    await saveAnalysisFile(newProject.id, data.analysis.raw);

    if (myGeneration !== _loadGeneration) return;  // [世代チェック③]

    newProject.hasAnalysis = true;   // ★ newProject も更新
    project.hasAnalysis    = true;
    project.analysis = await loadAnalysis(data.analysis);

    if (myGeneration !== _loadGeneration) return;  // [世代チェック④]

  } else {
    // analysis なし
    project.analysis = null;
  }

  updateChartModeAvailability();
  
  // Update file buttons
  const audioBtn = document.getElementById('audio-btn');
  const chordBtn = document.getElementById('chord-btn');
  
  if (newProject.audio) {
    audioBtn.textContent = newProject.audio;
    audioBtn.classList.add('loaded');
  }
  
  if (newProject.chord_source) {
    chordBtn.textContent = newProject.chord_source;
    chordBtn.classList.add('loaded');
  }
  
  refreshEditor();
  renderImportBtn();
  
  const curDiagChord = document.getElementById('diag-in').value.trim();
  if (curDiagChord) {
    showDiagramPanel(curDiagChord, getCapo(), getDiagCallbacks());
  }

  // IndexedDBからasset復元
  (async () => {
    let audioRestored = false;
    let chordRestored = false;

    // audio復元
    const audioAsset = await loadAsset(project.id, 'audio').catch(() => null);

    if (myGeneration !== _loadGeneration) return;  // [世代チェック⑤]

    if (audioAsset) {
      if (_aURL) URL.revokeObjectURL(_aURL);
      _aURL = URL.createObjectURL(audioAsset.data);
      aEl.src = _aURL;
      aEl.volume = parseFloat(document.getElementById('vol-slider')?.value || 80) / 100;
      const tapBtn = document.getElementById('tap-btn');
      if (tapBtn) tapBtn.disabled = false;
      audioRestored = true;
    }

    // chord復元
    const chordAsset = await loadAsset(project.id, 'chord').catch(() => null);

    if (myGeneration !== _loadGeneration) return;  // [世代チェック⑥]

    if (chordAsset) {
      let data;
      if (chordAsset.filename.endsWith('.csv')) {
        data = parseCSV(chordAsset.data, normalizeChordName);
      } else {
        data = parseJSON(chordAsset.data);
      }
      if (data) {
        loadChordData(data, chordAsset.filename, true);  // isRestore=true: capo reset をスキップ
        chordRestored = true;
      }
    }

    // 復元できなかったassetがあればバナー表示
    const needBanner =
      (!audioRestored && !!project.audio) ||
      (!chordRestored && !!project.chord_source);
    if (needBanner) {
      showReloadBanner(
        audioRestored ? null : project.audio,
        chordRestored ? null : project.chord_source
      );
    }
  })();

  // TOKEN MIGRATION の結果を IndexedDB に即書き戻す。
  // これにより次回の自動保存復元時も migration 済みデータが使われる。
  autoSaveLocal();
}

// ════════════════════════════════════════
// ⑤ 音量バー
// ════════════════════════════════════════
const volSlider=document.getElementById('vol-slider');
const volBtn=document.getElementById('vol-btn');

if(volSlider&&volBtn){
  // localStorageから音量を復元
  const savedVol=parseInt(localStorage.getItem('cs_vol'));
  const initVol=isNaN(savedVol)?80:savedVol;
  volSlider.value=initVol;
  aEl.volume=initVol/100;
  volBtn.textContent=initVol===0?'🔇':initVol<40?'🔉':'🔊';

  volSlider.addEventListener('input',()=>{
    const v=parseInt(volSlider.value)/100;
    aEl.volume=v;aEl.muted=(v===0);
    volBtn.textContent=v===0?'🔇':v<0.4?'🔉':'🔊';
    localStorage.setItem('cs_vol',volSlider.value);
  });
  volBtn.addEventListener('click',()=>{
    if(aEl.muted||aEl.volume===0){
      const r=parseInt(localStorage.getItem('cs_vol_pre'))||80;
      aEl.muted=false;volSlider.value=r;aEl.volume=r/100;
      volBtn.textContent=r<40?'🔉':'🔊';
    } else {
      localStorage.setItem('cs_vol_pre',volSlider.value);
      aEl.muted=true;volSlider.value=0;volBtn.textContent='🔇';
    }
  });
}

/**
 * _handleImportProjectFiles — Legacy Project Import の実処理
 *
 * app.js 側の責務:
 *   - File オブジェクトのテキスト読み込み
 *   - JSON.parse
 *   - deserializeProject() による正規化
 *   - importProjectRecords() 呼び出し
 *   - 結果toast / renderLibrary()
 *
 * project.js 側（importProjectRecords）の責務:
 *   - DB登録・衝突判定・件数集計
 *
 * @param {File[]} files
 */
async function _handleImportProjectFiles(files) {
  const projects = [];
  const uiStates = [];
  let parseFailures = 0;

  for (const file of files) {
    try {
      const text = await file.text();
      const raw  = JSON.parse(text);
      const { project: proj, uiState } = deserializeProject(raw);
      if (!proj.id) throw new Error('id missing');
      projects.push(proj);
      uiStates.push(uiState);
    } catch (e) {
      console.warn('[import] parse error:', file.name, e);
      parseFailures++;
    }
  }

  const result = await importProjectRecords(projects, uiStates);
  const totalFailure = result.failure + parseFailures;

  const parts = [];
  if (result.success  > 0) parts.push(`✅ ${result.success}件登録`);
  if (result.skip     > 0) parts.push(`⏭ ${result.skip}件スキップ（重複）`);
  if (totalFailure    > 0) parts.push(`❌ ${totalFailure}件エラー`);
  toast(parts.join(' / ') || 'インポート完了（0件）');

  renderLibrary().catch(console.error);
}

// ════════════════════════════════════════
// 自動保存
// ════════════════════════════════════════
function autoSaveLocal(){
  clearTimeout(asT);
  asT = setTimeout(async () => {
    // [EMPTY PROJECT GUARD] Phase73-D追補
    // 起動直後の createEmptyProject() 状態（何も入力されていない）では
    // DBに書き込まない。ゴミ登録防止。
    //
    // hasMeta: title / artist / chord_source は trim() で空白文字列を除外。
    //          audio はファイルパス文字列のため存在判定のみ。
    // hasLineContent: line の実スキーマ全フィールドで「内容あり」を判定。
    //          lines.length > 0 だけでは空行追加を有意データとみなすため使わない。
    //
    // ガードを setTimeout 内に置く理由:
    //   外側（clearTimeout より前）に置くとタイマー競合が生じ、
    //   正当な保存がキャンセルされる副作用があるため。
    const hasMeta = !!(
      project.title?.trim()       ||
      project.artist?.trim()      ||
      project.audio               ||
      project.chord_source?.trim()
    );
    const hasLineContent = project.lines.some(l =>
      l.lyric || l.time != null || l.chords.length > 0 || l.repeat != null
    );
    if (!hasMeta && !hasLineContent) return;

    const uiState = getUIState();

    // [PROJECT CORE AUTHORITY] IndexedDB が canonical source（Phase73-B）
    // saveToLocalStorage() から saveProjectToDB() に切替。
    // dual-authority禁止: autosaveの書き込み先は一元化する。
    await saveProjectToDB(project, uiState);

    const now = new Date();
    const timestamp = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    document.getElementById('st-save').textContent = timestamp;

    // [LIBRARY SYNC] saveProjectToDB 完了後に fire-and-forget で一覧を更新する。
    // 保存完了後に発火するが、一覧描画の完了順序までは保証しない。
    renderLibrary().catch(console.error);
  }, 1000);
}

function updateStatus(){
  document.getElementById('st-lines').textContent=project.lines.length;
  document.getElementById('st-chords').textContent=project.lines.reduce((s,l)=>s+l.chords.length,0);
  document.getElementById('st-timed').textContent=project.lines.filter(l=>l.time!=null).length;
}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2500);}

// ----------------------------
// EVENT HANDLERS SETUP
// ----------------------------

/**
 * setupEventHandlers()
 * 
 * UIイベント登録の集中管理
 * 
 * 【配置ルール】
 * - ユーザー操作イベントのみ登録する
 * - モーダル内部の動的イベントはここに置かない
 * - セクションは機能単位で分類する
 * - 各セクション内はUI配置順に並べる
 * 
 * 【セクション構成】
 * 1. File Events: ファイル選択・読み込み
 * 2. Palette Events: コードパレット操作
 * 3. Import Events: 歌詞テキスト取り込み
 * 4. Editor Events: 行追加
 * 5. Project Events: 保存・読み込み・新規
 * 6. Diagram Events: ダイアグラム表示制御
 * 7. Capo Events: カポ変更
 * 8. TAP Mode Events: TAPオーバーレイ
 * 9. Replace Events: 置換機能
 * 10. Project Meta Events: タイトル・Key・BPM
 * 11. Keyboard Events: ショートカットキー
 */
function setupEventHandlers() {
  // ============================================
  // File Events
  // ============================================
  // Audio file select button（Phase60.5: showOpenFilePicker でフォルダ記憶）
  // types に 'audio/*' は Chrome で認識されない → 拡張子で明示指定する
  // dispatchEvent 経由ではなく直接ファイル処理する（File オブジェクトは通常の File と同一）
  document.getElementById('audio-btn').addEventListener('click', async () => {
    if (window.showOpenFilePicker) {
      try {
        const [fh] = await window.showOpenFilePicker({
          id: PICKER_IDS.audio,
          types: [{
            description: 'Audio files',
            accept: {
              'audio/mpeg':  ['.mp3'],
              'audio/wav':   ['.wav'],
              'audio/mp4':   ['.m4a'],
              'audio/ogg':   ['.ogg'],
              'audio/flac':  ['.flac'],
            },
          }],
        });
        const file = await fh.getFile();
        if (_aURL) URL.revokeObjectURL(_aURL);
        _aURL = URL.createObjectURL(file);
        aEl.src = _aURL;
        project.audio = file.name;
        const b = document.getElementById('audio-btn');
        b.textContent = file.name;
        b.classList.add('loaded');
        const tapBtn = document.getElementById('tap-btn');
        if (tapBtn) tapBtn.disabled = false;
        aEl.volume = parseFloat(document.getElementById('vol-slider')?.value || 80) / 100;
        toast(`音声: ${file.name}`);
        checkReloadBannerDone();
        saveAsset(project.id, 'audio', { data: file, filename: file.name });
      } catch (err) {
        if (err.name === 'AbortError') return;
        document.getElementById('file-audio').click(); // FSA非対応時のfallback
      }
    } else {
      document.getElementById('file-audio').click();
    }
  });

  // Chord file select button（Phase60.5: showOpenFilePicker でフォルダ記憶）
  document.getElementById('chord-btn').addEventListener('click', async () => {
    if (window.showOpenFilePicker) {
      try {
        const [fh] = await window.showOpenFilePicker({
          id: PICKER_IDS.chord,
          types: [{ description: 'JSON/CSV', accept: { 'application/json': ['.json'], 'text/csv': ['.csv'] } }],
        });
        const file = await fh.getFile();
        const text = await file.text();
        let data;
        if (file.name.endsWith('.csv')) {
          data = parseCSV(text, normalizeChordName);
        } else {
          data = parseJSON(text);
          if (!data) { toast('JSONエラー'); return; }
        }
        loadChordData(data, file.name);
        saveAsset(project.id, 'chord', { data: text, filename: file.name });
      } catch (err) {
        if (err.name === 'AbortError') return;
        document.getElementById('file-chord').click(); // fallback
      }
    } else {
      document.getElementById('file-chord').click();
    }
  });

  // Chord file load (JSON/CSV)
  // file-chord の addEventListener の直前に追加
  document.getElementById('file-chord').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      let data;
      if(f.name.endsWith('.csv')) {
        data = parseCSV(ev.target.result, normalizeChordName);
      } else {
        data = parseJSON(ev.target.result);
        if (!data) {
          toast('JSONエラー');
          return;
        }
      }
      loadChordData(data,f.name);
      saveAsset(project.id, 'chord', { data: ev.target.result, filename: f.name });
    };
    r.readAsText(f,'utf-8');
    
    e.target.value = '';  // ★ これがないと同じファイルで change が発火しない
  });

  // Audio file load
  document.getElementById('file-audio').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    if(_aURL)URL.revokeObjectURL(_aURL);
    _aURL=URL.createObjectURL(f);aEl.src=_aURL;project.audio=f.name;
    const b=document.getElementById('audio-btn');b.textContent=f.name;b.classList.add('loaded');
    const tapBtn = document.getElementById('tap-btn');
    if(tapBtn) tapBtn.disabled=false;
    aEl.volume=parseFloat(document.getElementById('vol-slider')?.value||80)/100;
    toast(`音声: ${f.name}`);
    checkReloadBannerDone();
    saveAsset(project.id, 'audio', { data: f, filename: f.name });
  });

  // ============================================
  // Palette Events
  // ============================================
  // Palette filter
  document.getElementById('pal-filter').addEventListener('input',renderPalette);

  // Palette transpose
  document.getElementById('pal-tr-up').addEventListener('click',()=>{
    let next=paletteTranspose+1;
    if(next>6)next=-6;
    paletteTranspose=next;
    document.getElementById('pal-tr-val').textContent=paletteTranspose>0?`+${paletteTranspose}`:String(paletteTranspose);
    renderPalette();
  });
  document.getElementById('pal-tr-down').addEventListener('click',()=>{
    let next=paletteTranspose-1;
    if(next<-6)next=6;
    paletteTranspose=next;
    document.getElementById('pal-tr-val').textContent=paletteTranspose>0?`+${paletteTranspose}`:String(paletteTranspose);
    renderPalette();
  });

  // Custom chord add
  document.getElementById('custom-add').addEventListener('click',()=>{
    const inp=document.getElementById('custom-in');
    const val=inp.value.trim();if(!val)return;
    if(!palette.includes(val)){palette.push(val);renderPalette();document.getElementById('pal-count').textContent=palette.length;}
    handleAddChordToLine(val);inp.value='';toast(`"${val}" を追加してフォーカス行に挿入`);
  });
  document.getElementById('custom-in').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('custom-add').click();});

  // ============================================
  // Import Events
  // ============================================
  // Import lyrics (replace all)
  document.getElementById('btn-import').addEventListener('click',()=>{
    const t=document.getElementById('lyric-ta').value.trim();if(!t)return;
    const ls=t.split('\n').map(l=>l.trim()).filter(l=>l);
    project.lines=ls.map(l=>mkLine(l));refreshEditor();toast(`${ls.length}行を取り込みました`);
  });

  // Append lyrics
  document.getElementById('btn-append').addEventListener('click',()=>{
    const t=document.getElementById('lyric-ta').value.trim();if(!t)return;
    const ls=t.split('\n').map(l=>l.trim()).filter(l=>l);
    ls.forEach(l=>project.lines.push(mkLine(l)));refreshEditor();toast(`${ls.length}行を追記`);
  });

  // Clear all lines
  document.getElementById('btn-clearall').addEventListener('click',()=>{if(confirm('全行を削除しますか？')){project.lines=[];refreshEditor();}});

  // ============================================
  // Editor Events
  // ============================================
  // Add empty line
  document.getElementById('add-line-btn').addEventListener('click',()=>{
    project.lines.push(mkLine());refreshEditor();
    setTimeout(()=>{const ins=document.querySelectorAll('.lyric-input');if(ins.length)ins[ins.length-1].focus();},0);
  });

  // ============================================
  // Project Events
  // ============================================
  // Save project
  document.getElementById('btn-save').addEventListener('click', () => saveProject(false));

  // Save as
  document.getElementById('btn-saveas').addEventListener('click', () => saveProject(true));

  // 新規プロジェクトとして保存（Phase62: 新UUID発行・lineage分岐）
  document.getElementById('btn-savenew').addEventListener('click', () => saveProjectNew());

  // Open project（Phase60.5: showOpenFilePicker でフォルダ記憶）
  document.getElementById('btn-open').addEventListener('click', async () => {
    if (window.showOpenFilePicker) {
      try {
        const [fh] = await window.showOpenFilePicker({
          id: PICKER_IDS.projectOpen,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        const file = await fh.getFile();
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          loadProj(data);
          toast(`読み込み: ${file.name}`);
        } catch { toast('JSONエラー'); }
      } catch (err) {
        if (err.name === 'AbortError') return;
        document.getElementById('file-project').click(); // fallback
      }
    } else {
      document.getElementById('file-project').click();
    }
  });

  // Project file load（<input> fallback 経路）
  document.getElementById('file-project').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        loadProj(data);
        toast(`読み込み: ${f.name}`);
      }catch{toast('JSONエラー');}
      e.target.value = '';
    };
    r.readAsText(f);
  });

  // New project
  document.getElementById('btn-new').addEventListener('click',()=>{
    if(project.lines.length>0&&!confirm('編集内容を破棄して新規作成しますか？'))return;
    resetProject();
    renderPalette();
    refreshEditor();
    showDiagramPanel('', getCapo());
    clearLocalStorage();
    document.getElementById('st-save').textContent='-';
  });

  // UI: ダイアグラム入力
  document.getElementById('diag-in').addEventListener('input',e=>showDiagramPanel(e.target.value.trim(), getCapo(), getDiagCallbacks()));

  // UI: ダイアグラム追加ボタン
  const _diagBtn=document.getElementById('btn-add-diag');
  if(_diagBtn) _diagBtn.addEventListener('click', () =>
    openAddDiagramModal({
      defaultChord: document.getElementById('diag-in').value.trim()
    })
  );

  // ============================================
  // Capo Events
  // ============================================

  // カポ変更：前の値との差分で全コードを移調（確認なし・即時）
  document.getElementById('capo').addEventListener('change',()=>{
    const newCapo=parseInt(document.getElementById('capo').value)||0;
    const diff=newCapo-_prevCapo;
    if(diff===0)return;
    // カポが増える(0→2)＝同じ音を出すためコードフォームは下げる(-2半音)
    // カポが減る(2→0)＝コードフォームは上げる(+2半音)
    const semitones=-diff;
    project.lines.forEach(line=>{
      line.chords.forEach(c=>{
        if(isSepToken(c))return;
        if(isNoChordToken(c))return;  // no_chord は音高を持たないためスキップ
        c.chord=transposeChord(c.chord,semitones);
      });
    });
    palette=palette.map(ch=>transposeChord(ch,semitones));
    renderPalette();
    refreshEditor();
    _prevCapo=newCapo;
    autoSaveLocal();
    const cur=document.getElementById('diag-in').value.trim();
    if(cur) showDiagramPanel(cur, getCapo(), getDiagCallbacks());
    toast(`カポ${newCapo}: 全コードを${Math.abs(diff)}半音${diff>0?'下':'上'}に移調`);
    
    // Chart Mode が開いていれば表示を更新する
    // TODO: future optimization: separate chord label refresh from full chart rerender
    //       現在は DOM フル再構築。chart interaction が増えた段階で
    //       chord textContent の差分更新に切り替えることを検討する。
    if (chartState.active) renderChartMode({ measuresPerRow: chartMeasuresPerRow });
  });

  // ============================================
  // TAP Mode Events
  // ============================================
  


  // ============================================
  // Global Keyboard Events
  // ============================================
  // Ctrl+H で置換バー開閉
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.key==='h'){
      e.preventDefault();
      document.getElementById('btn-replace-open').click();
    }
  });

  // ============================================
  // Global Keyboard Shortcuts
  // ============================================
  document.addEventListener('keydown', e => {
    // Ctrl+S: 上書き保存 / Ctrl+Shift+S: 名前を付けて保存
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (e.shiftKey) {
        document.getElementById('btn-saveas').click();
      } else {
        document.getElementById('btn-save').click();
      }
    }
    
    // Alt+N: 新規作成
    if (e.altKey && e.key === 'n') {
      e.preventDefault();
      document.getElementById('btn-new').click();
    }

    // Ctrl+Z: import undo
    // [Phase79] 解析編集モード中はAnalysis Editor自身のUndo（下のisAnalysisEditing()
    // ブロック内・Ctrl+Z）が対象となるため、こちらは対象外とする（キー競合防止）。
    if (e.ctrlKey && e.key === 'z' && !isAnalysisEditing()) {
      if (importUndoStack.length) {
        e.preventDefault();
        project.lines = importUndoStack.pop();
        refreshEditor();
        renderImportBtn();
        toast('↩ コード自動登録を元に戻しました');
      }
    }

    // L: diagLock トグル（テキスト入力中・演奏モード中は無視）
    if (e.key === 'l' || e.key === 'L') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (document.getElementById('perform-overlay')?.hidden === false) return;
      if (diagLocked) {
        unlockDiag();
      } else {
        if (currentDiagChord) lockDiag(currentDiagChord);
      }
    }

    // Escape: modal close を優先、次に Section ▼メニュー、その次に diagLock 解除
    // INPUT/TEXTAREA フォーカス中でも diagLock 解除は動作させる
    if (e.key === 'Escape') {
      if (document.getElementById('modal-ov').classList.contains('open')) {
        closeMod();
        return;
      }
      // [Phase101-3] Section ▼メニューはModalの次に優先する。通常の遷移では
      // Rename/Delete押下時点で既にメニューは閉じているため（Menu→Modal遷移ルール）、
      // ここに到達するのは「メニューは開いているがModalは無い」場合のみ。
      if (_openSectionMenuId !== null) {
        _closeSectionMenu();
        return;
      }
      // [Phase102] Section Previewは▼メニューの次・検索バーより前。
      // Previewは単なる閲覧状態のため、編集系UI（▼メニュー）より弱く、
      // 検索バー（入力中の作業）より強い優先度に位置づける。
      if (_previewSectionId !== null) {
        _clearSectionPreview();
        return;
      }
      // [Phase80] 検索バーが開いていればEsc最優先で閉じる（入力欄にフォーカスが
      // あることが多いため、diagLock/editPointより先に判定する）。
      if (isAnalysisEditing() && analysisEditor.search.open) {
        closeSearchBar();
        return;
      }
      if (diagLocked) {
        unlockDiag();
        return;
      }
      // [Phase77後半] editPoint中のEsc → State0へ（editPoint解除）。
      // 追加ダイアログ（showChordSelector）を開いている間のEscはmodal-ov側で
      // 先に処理されるため、ここに到達するのは「editPointは立っているが
      // ダイアログは開いていない」状態のみ（[EDIT POINT LIFETIME]参照）。
      if (isAnalysisEditing() && analysisEditor.selection.editPoint !== null) {
        clearEditPoint();
        return;
      }
    }

    // Enter: editPoint中 → Add Here（addChordAtEditPoint）をキーボードから起動
    // [設計] addChordAtEditPoint()自体はshowChordSelector()（確認ダイアログ）を
    // 開くだけで、この時点でbuffer/editPointは一切変化しない（[CANCEL INVARIANT]）。
    // そのためEnter一発で呼んでも「うっかり確定」のリスクはない。
    // modal-ov が開いている間（ダイアログ内でコード名を確定するEnter）は
    // ここでは何もしない（Escapeの分岐と同じ判断基準・二重発火防止）。
    if (e.key === 'Enter') {
      if (document.getElementById('modal-ov').classList.contains('open')) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (isAnalysisEditing()) {
        const mode = deriveEditorMode(analysisEditor.selection);
        if (mode === 'edit-point') {
          e.preventDefault();
          addChordAtEditPoint();
          return;
        }
        // [Phase83] single選択中のEnter → コード名変更モーダル
        if (mode === 'single') {
          const chord = analysisEditor.buffer.find(
            c => c._id === analysisEditor.selection.chordIds[0]
          );
          if (chord) {
            e.preventDefault();
            openChordRenameSelector(chord);
            return;
          }
        }
      }
    }

    // Shift+BracketLeft: 左パネル トグル
    // Shift+BracketRight: 右パネル トグル
    // （e.code基準でJIS/US差を吸収。INPUT/TEXTAREA中は無視）
    if (e.shiftKey && e.key === '{') {   // Shift+[ 左パネル トグル
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      leftExpandedOverride = false;
      leftCollapsedManual = !leftCollapsedManual;
      applyLeftCollapsed();
      localStorage.setItem('leftCollapsed', leftCollapsedManual ? '1' : '0');
    }

    if (e.shiftKey && e.key === '}') {   // Shift+] 右パネル トグル
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      rightHidden = !rightHidden;
      applyRightHidden();
      localStorage.setItem('rightHidden', rightHidden ? '1' : '0');
    }

    // Shift+D: Chart Mode コード図ホバー ON/OFF（Chart Mode 中のみ）
    if (e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      if (!chartState.active) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const current = localStorage.getItem('cs.chartDiagHover') !== 'false';
      const next = !current;
      localStorage.setItem('cs.chartDiagHover', next ? 'true' : 'false');
      setTooltipEnabled(next);
      _updateChartDiagMenu(next);
      toast(next ? '🎸 コード図ホバー ON' : '🎸 コード図ホバー OFF');
    }

    // Phase76-G: 選択中コードの操作ショートカット（範囲選択・Copy/Cut/Paste・削除）
    // [NOTE] copySelection/cutSelection/pasteSelection/deleteSelectionは単一選択も
    // 内部で吸収するため、単一選択時にもこのショートカットがそのまま使える
    // （Phase75の単一削除に、今回初めてDelete/Backspaceキーが付いたことになる）。
    if (isAnalysisEditing()) {
      const tag = document.activeElement?.tagName;
      const inTextInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (!inTextInput && e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copySelection();
      }
      if (!inTextInput && e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        cutSelection();
      }
      // [Phase79] Ctrl+V＝そのまま貼り付け（起点のみ必要・pasteAbsolute）
      //           Ctrl+Shift+V＝範囲に合わせて貼り付け（範囲が必要・pasteSelection）
      if (!inTextInput && e.ctrlKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteAbsolute();
      }
      if (!inTextInput && e.ctrlKey && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteSelection();
      }
      if (!inTextInput && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSelection();
      }
      // [Phase79] Undo/Redoのキーボードショートカット。
      // 上の「Ctrl+Z: import undo」ブロックは解析編集モード中は無効化済みのため競合しない。
      // Redoは Ctrl+Y（Windows定番）・Ctrl+Shift+Z（Mac/一部Webアプリ定番）の両方に対応する。
      if (!inTextInput && e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoEdit();
      }
      if (!inTextInput && e.ctrlKey && (
        (e.key === 'y' || e.key === 'Y') ||
        (e.shiftKey && (e.key === 'z' || e.key === 'Z'))
      )) {
        e.preventDefault();
        redoEdit();
      }
      // [Phase80] Ctrl+F: 検索バーを開く。既に開いて入力欄にフォーカスがある
      // 場合はinTextInputガードにより素通りする（ブラウザ標準の検索と衝突しない）。
      if (!inTextInput && e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openSearchBar();
      }
    }

    // [Phase80] F3 / Shift+F3: 検索結果の次へ/前へ（フォーカス位置に関わらず動作）。
    // ChatGPTレビューで確定した条件: 検索バーが開いていて、かつヒットが
    // 1件以上ある時のみブラウザ標準のF3から奪う（ヒット0件の状態で奪う
    // メリットが無いため。inTextInputガードは使わない＝検索欄/置換欄に
    // フォーカスがあっても動作する、Windows検索UIと同じ操作感を優先する）。
    if (isAnalysisEditing() && analysisEditor.search.open && analysisEditor.search.matches.length > 0
        && (e.key === 'F3' || e.key === 'f3')) {
      e.preventDefault();
      if (e.shiftKey) searchGoToPrev(); else searchGoToNext();
    }

    // ArrowLeft/ArrowRight: 選択対象に応じて自動切り替え（Sprint2で確定）
    //   単一選択 → 個別移動（shiftSelectedBoundary・Phase77で右境界から左境界へ変更）
    //   複数選択 → 範囲シフト（shiftSelectionRange・Forward Wall Model）
    //   Shift併用 → 歩幅を0.1秒→0.5秒に拡大（対象は変わらない。ボタンの
    //              [←0.5秒][←0.1秒][→0.1秒][→0.5秒]と同じ刻み幅に統一）
    //   Ctrl+Shift併用 → 全体移動（shiftAll）。曲全体に影響する操作のため、
    //              誤操作防止の観点であえて重い修飾キーの組み合わせにした
    //              （選択数に関わらず全体移動を優先する）
    if (isAnalysisEditing() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      const step  = e.shiftKey ? 0.5 : 0.1;
      const delta = (e.key === 'ArrowLeft') ? -step : step;

      if (e.ctrlKey && e.shiftKey) {
        shiftAll(delta);
      } else if (analysisEditor.selection.chordIds.length > 1) {
        shiftSelectionRange(delta);
      } else {
        requestBoundaryShift(delta);
      }
    }
  });

  // ============================================
  // Perform Mode Events
  // ============================================
  document.getElementById('btn-perform-mode').addEventListener('click', openPerformMode);
  document.getElementById('btn-perform-close').addEventListener('click', closePerformMode);
  
  // 演奏モード: 再生/一時停止
  document.getElementById('perform-play-btn').addEventListener('click', () => {
    if (aEl.paused) aEl.play(); else aEl.pause();
  });
  
  // 演奏モード: シーク
  document.getElementById('perform-seek-in').addEventListener('input', e => {
    aEl.currentTime = (e.target.value / 1000) * aEl.duration;
  });
  
  // 演奏モード: 速度調整
  // [SPEED AUTHORITY] setSpeed() 経由に統一（Phase71-A）。
  // 通常モード / TAPモード / Chart Mode の speed UI と相互projection同期される。
  document.getElementById('perform-speed').addEventListener('input', e => {
    setSpeed(parseInt(e.target.value));
  });

  // 演奏モード: 速度リセット（Phase71-A仕上げ）
  // [SPEED RESET] canonical mutation trigger。setSpeed(100)のみ。
  document.getElementById('perform-speed-reset').addEventListener('click', () => {
    setSpeed(100);
  });
  
  // 演奏モード: 音量調整
  const volSliderPerform = document.getElementById('vol-slider-perform');
  const volBtnPerform = document.getElementById('vol-btn-perform');
  if (volSliderPerform && volBtnPerform) {
    volSliderPerform.addEventListener('input', e => {
      aEl.volume = e.target.value / 100;
      volBtnPerform.textContent = e.target.value > 0 ? '🔊' : '🔇';
    });
    
    volBtnPerform.addEventListener('click', () => {
      if (aEl.volume > 0) {
        aEl.volume = 0;
        volSliderPerform.value = 0;
        volBtnPerform.textContent = '🔇';
      } else {
        aEl.volume = 0.8;
        volSliderPerform.value = 80;
        volBtnPerform.textContent = '🔊';
      }
    });
  }
  
  // 演奏モード: ダイアグラム表示ON/OFF
  document.getElementById('perform-diag-toggle').addEventListener('change', e => {
    performState.diagOn = e.target.checked;
    const overlay = document.getElementById('perform-overlay');
    
    // ダイアグラムOFF時はコンパクトモード
    if (!e.target.checked) {
      overlay.classList.add('compact-mode');
    } else {
      overlay.classList.remove('compact-mode');
    }
    
    // 再レンダリング不要（CSSで制御）
  });

  // Phase94 B4: 演奏モード 自動スクロール復帰までの猶予時間
  const performScrollGraceSelect = document.getElementById('perform-scroll-grace');
  if (performScrollGraceSelect) {
    const savedGrace = localStorage.getItem('cs.perform.autoScrollGraceMs') || '5000';
    performScrollGraceSelect.value = savedGrace;
    performScrollGraceSelect.addEventListener('change', e => {
      localStorage.setItem('cs.perform.autoScrollGraceMs', e.target.value);
    });
  }

  // 演奏モード: フォントスケール
  document.getElementById('perform-font-scale').addEventListener('input', e => {
    performState.fontScale = parseFloat(e.target.value);
    document.getElementById('perform-overlay').style.setProperty(
      '--perform-font-scale',
      performState.fontScale
    );
    // ダイアグラムサイズも連動して再描画
    if (performState.diagOn) renderPerformLines();
  });
  
  // 演奏モード: モード切替
  const performModeRadios = document.querySelectorAll('input[name="perform-mode"]');
  if (performModeRadios.length > 0) {
    performModeRadios.forEach(radio => {
      radio.addEventListener('change', e => {
        performState.mode = e.target.value;
        // staticモードに切り替えた時はfocusIdxをリセット
        if (performState.mode === 'static') {
          performState.focusIdx = -1;
          document.querySelectorAll('.perform-line').forEach(el => el.classList.remove('focused'));
        }
        renderPerformLines();
      });
    });
  }
  
  // 演奏モード: ページ送りボタン
  const prevPageBtn = document.getElementById('perform-prev-page');
  const nextPageBtn = document.getElementById('perform-next-page');
  
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      prevPerformPage();
    });
  }
  
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      nextPerformPage();
    });
  }
  
  // 演奏モード: キーボードショートカット
  document.addEventListener('keydown', e => {
    if (!performState.active) return;
    
    // Space: 再生/一時停止
    if (e.code === 'Space') {
      e.preventDefault();
      if (aEl.paused) aEl.play(); else aEl.pause();
    }
    
    // 静止モード時のページ送り
    if (performState.mode === 'static') {
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prevPerformPage();
      }
      
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        nextPerformPage();
      }
    }
  });

  document.getElementById('btn-chart-mode')
    .addEventListener('click', () => {
      openChartMode();
      // 列数ボタンの active 状態を現在の設定に合わせる
      document.querySelectorAll('.chart-col-btn').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.cols) === chartMeasuresPerRow);
      });
      renderChartMode({ measuresPerRow: chartMeasuresPerRow });
    });

  document.getElementById('btn-chart-close')
    .addEventListener('click', () => {
      if (isAnalysisEditing()) {
        endAnalysisEdit();
      }
      closeChartMode();
    });

  // Phase74-C: 解析編集モードトグルボタン
  document.getElementById('btn-analysis-edit')
    ?.addEventListener('click', () => {
      if (isAnalysisEditing()) {
        endAnalysisEdit();
      } else {
        beginAnalysisEdit();
      }
    });

  document.getElementById('chart-col-switcher')
    .addEventListener('click', e => {
      const btn = e.target.closest('.chart-col-btn');
      if (!btn) return;
      const cols = Number(btn.dataset.cols);
      if (cols === chartMeasuresPerRow) return;

      chartMeasuresPerRow = cols;
      localStorage.setItem('chartMeasuresPerRow', cols);

      // ボタン active 切替
      document.querySelectorAll('.chart-col-btn').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.cols) === cols);
      });

      renderChartMode({ measuresPerRow: chartMeasuresPerRow });
    });
  
  // ============================================
  // Project Meta Events
  // ============================================
  document.getElementById('project-artist').addEventListener('input', e => {
    project.artist = e.target.value;
    autoSaveLocal();
  });
  document.getElementById('project-title').addEventListener('input', e => {
    project.title = e.target.value;
    autoSaveLocal();
  });
  document.getElementById('proj-key').addEventListener('input',autoSaveLocal);
  document.getElementById('proj-bpm').addEventListener('input',autoSaveLocal);

  // ============================================
  // Bottom Diagram Button
  // ============================================
  const btnAddDiagBottom=document.getElementById('btn-add-diag-bottom');
  if(btnAddDiagBottom) btnAddDiagBottom.addEventListener('click', () => {
    openAddDiagramModal({
      defaultChord: document.getElementById('diag-in').value.trim()
    });
  });

  document.getElementById('btn-diag-undo')?.addEventListener('click', () => {
    if(diagUndo()) refreshDiagrams();
  });
  document.getElementById('btn-diag-export')?.addEventListener('click', exportCustomDiagrams);
  const filediagImport = document.getElementById('file-diag-import');
  document.getElementById('btn-diag-import')?.addEventListener('click', () => filediagImport.click());
  filediagImport?.addEventListener('change', e => {
    importCustomDiagrams(e.target.files[0]);
    e.target.value = '';
  });

  // ダイアグラムロックの長押し解除
  const phdr = document.querySelector('#panel-right .phdr');
  let phdrPressTimer = null;

  phdr.addEventListener('mousedown', () => {
    if (!diagLocked) return;
    phdrPressTimer = setTimeout(() => {
      phdrPressTimer = null;
      if (!diagLocked) return;
      unlockDiag();
    }, 400);
  });
  phdr.addEventListener('mouseup', () => {
    clearTimeout(phdrPressTimer);
  });
  phdr.addEventListener('mouseleave', () => {
    clearTimeout(phdrPressTimer);
  });
  
  // ============================================
  // View Menu Events
  // ============================================

  // 表示メニューを開く直前にチェックマークを更新
  document.getElementById('menu-view')
    ?.closest('.menu-group')
    ?.querySelector('.menu-trigger')
    ?.addEventListener('click', updateViewMenuChecks, { capture: true });

  // 左パネル トグル
  document.getElementById('btn-toggle-left')?.addEventListener('click', () => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // leftCollapsedAuto は触らない（manual のみ操作）
    leftExpandedOverride = false;
    leftCollapsedManual = !leftCollapsedManual;
    applyLeftCollapsed();
    localStorage.setItem('leftCollapsed', leftCollapsedManual ? '1' : '0');
  });

  // 右パネル トグル
  document.getElementById('btn-toggle-right')?.addEventListener('click', () => {
    rightHidden = !rightHidden;
    applyRightHidden();
    localStorage.setItem('rightHidden', rightHidden ? '1' : '0');
  });

  // Chart コード図ホバー トグル（表示メニュー）
  document.getElementById('btn-toggle-chart-diag')?.addEventListener('click', () => {
    const current = localStorage.getItem('cs.chartDiagHover') !== 'false';
    const next = !current;
    localStorage.setItem('cs.chartDiagHover', next ? 'true' : 'false');
    setTooltipEnabled(next);
    _updateChartDiagMenu(next);
    toast(next ? '🎸 コード図ホバー ON' : '🎸 コード図ホバー OFF');
  });

  // ============================================
  // Header Menu Events (Phase29)
  // ============================================
  (function initHeaderMenus() {
    const triggers = document.querySelectorAll('.menu-trigger');

    // トリガークリック：排他open
    triggers.forEach(trigger => {
      trigger.addEventListener('click', e => {
        e.stopPropagation();
        const group  = trigger.closest('.menu-group');
        const isOpen = group.classList.contains('open');
        closeAllMenus();
        if (!isOpen) group.classList.add('open');
      });
    });

    // 外クリックで全閉じ
    document.addEventListener('click', () => closeAllMenus());

    // ドロップダウン内クリックで自動close
    document.querySelectorAll('.dropdown').forEach(dd => {
      dd.addEventListener('click', () => closeAllMenus());
    });

    function closeAllMenus() {
      document.querySelectorAll('.menu-group.open')
        .forEach(g => g.classList.remove('open'));
    }
    
  })();  

  // ============================================
  // Phase73-D: Legacy Project Import
  // ============================================
  // UIラベル: 「ライブラリにプロジェクトファイルをインポート…」
  // 内部機能名: Legacy Project Import
  // [PICKER_IDS] projectImport を使用（Phase60.5 の方針に準拠）
  // [AbortError] キャンセルは正常系として return
  // [FSA fallback] showOpenFilePicker 非対応ブラウザは <input> 経由

  document.getElementById('btn-import-projects').addEventListener('click', async () => {
    let files = [];

    if (window.showOpenFilePicker) {
      try {
        const handles = await window.showOpenFilePicker({
          id: PICKER_IDS.projectImport,
          multiple: true,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        files = await Promise.all(handles.map(h => h.getFile()));
      } catch (err) {
        if (err.name === 'AbortError') return;  // キャンセルは正常
        document.getElementById('file-import-projects').click();  // fallback
        return;
      }
    } else {
      document.getElementById('file-import-projects').click();
      return;
    }

    await _handleImportProjectFiles(files);
  });

  document.getElementById('file-import-projects').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    await _handleImportProjectFiles(files);
  });
  
}
/**
   * restoreLastProjectOnStartup — 起動時の最終プロジェクト復元
   * [RESTORE AUTHORITY INVARIANT]
   *   truth source = IndexedDB "projects" store の updatedAt 最大レコード。
   *   loadProj() 末尾で autoSaveLocal() が必ず走るため
   *   updatedAt 最大 = 最後に開いたプロジェクト が成立する。
   *   将来 autoSaveLocal() を loadProj() から削除・遅延化した場合は
   *   lastOpenedProjectId を別途持つ設計に移行すること。
   *   現状は「最後に保存されたプロジェクト」を復元する暫定仕様であり、
   *   厳密な「last opened project」とは異なる点に注意。
   */

async function restoreLastProjectOnStartup() {
  try {
    const projects = await listProjects();
    if (projects.length === 0) return;
    const latest = projects[0];
    const hasData = latest.id && (
      (latest.lines && latest.lines.length > 0) ||
      latest.title || latest.artist || latest.audio || latest.chord_source
    );
    if (!hasData) return;
    if (confirm(`前回の作業「${latest.title || '無題'}」(${(latest.lines || []).length}行) を復元しますか？`)) {
      const data = await getProject(latest.id);
      if (data) {
        await loadProj(data);
        toast('自動保存データを復元しました');
      }
    }
  } catch (e) {
    console.warn('[restore] IndexedDB 復元失敗:', e);
  }
}

// ----------------------------
// APP INITIALIZATION
// ----------------------------
window.addEventListener('DOMContentLoaded', async () => {
  // 左パネル折りたたみ
  const btnCollapse = document.getElementById('btn-left-collapse');
  // 初期化: localStorage → manual / viewport → auto
  leftCollapsedManual = localStorage.getItem('leftCollapsed') === '1';
  leftCollapsedAuto = window.innerWidth < 960;
  applyLeftCollapsed();

  // 右パネル初期化（localStorage復元）
  rightHidden = localStorage.getItem('rightHidden') === '1';
  applyRightHidden();

  if (btnCollapse) {
    btnCollapse.addEventListener('click', () => {
      const currentlyCollapsed = document.body.classList.contains('left-collapsed');
      if (currentlyCollapsed) {
        // 展開方向: override をセット（narrow時の一時展開）
        leftExpandedOverride = true;
        leftCollapsedManual = false;
      } else {
        // 折りたたみ方向: override をリセット
        leftExpandedOverride = false;
        leftCollapsedManual = true;
      }
      applyLeftCollapsed();
      localStorage.setItem('leftCollapsed', leftCollapsedManual ? '1' : '0');
    });
  }

  // 演奏モードを確実に非表示
  const performOverlay = document.getElementById('perform-overlay');
  if (performOverlay) {
    performOverlay.hidden = true;
    performOverlay.style.display = 'none';
  }
  
  // イベントハンドラー登録
  setupEventHandlers();
  
  // ① Audio Engine初期化
  const audioElements = {
    playBtn: document.getElementById('play-btn'),
    timeDisplay: document.getElementById('time-dis'),
    seekInput: document.getElementById('seek-in'),
    seekFill: document.getElementById('seek-fill'),
    tapBtn: document.getElementById('tap-btn'),
    curChord: document.getElementById('cur-chord'),
    btnM5: document.getElementById('btn-m5'),
    speedSel: document.getElementById('speed-sel'),
    speedReset: document.getElementById('speed-reset'),
    volSlider: document.getElementById('vol-slider'),
    volBtn: document.getElementById('vol-btn'),
    tovSpeed: document.getElementById('tov-speed'),
    tovSpeedLabel: document.getElementById('tov-speed-label'),
    performSpeed: document.getElementById('perform-speed'),
    performSpeedLabel: document.getElementById('perform-speed-label'),
  };

  const audioCallbacks = {
    onTimeUpdate: (time) => {
      highlightLine(time, project.lines);
    },
    onTap: (time) => {
      let idx = tapIdx;
      if (idx < 0 || idx >= project.lines.length) {
        idx = project.lines.findIndex(l => l.time == null);
      }
      if (idx < 0) idx = 0;
      if (idx < project.lines.length) {
        project.lines[idx].time = parseFloat(time.toFixed(3));
        tapIdx = idx + 1;
        callRenderLines();
        flashLine(idx);
        autoSaveLocal();
      }
    },
    onMetadataLoad: () => {
      // 必要に応じて追加処理
    },
    // [KEY OWNERSHIP GUARD] Chart Mode解析編集中は、audio.js側の
    // グローバル矢印キーショートカット（±5秒シーク）を無効化するための問い合わせ窓口。
    isEditingAnalysis: () => isAnalysisEditing(),
  };

  initAudioEngine(aEl, audioElements, audioCallbacks);

  // ④ Performance Mode 初期化
  initPerformMode(aEl, () => project.lines);

  // ④-2 TAP Mode 初期化
  initTapMode(aEl, {
    getLines:      () => project.lines,
    setLineTime:   (idx, time) => { project.lines[idx].time = time; },
    autoSaveLocal: autoSaveLocal,
    refreshEditor: refreshEditor,
    fmt:           fmt,
    setSpeed:      setSpeed,
    toast:         toast
  });

  // Audio timeupdate リスナー（initTapMode/initPerformModeの後に登録）
  aEl.addEventListener('timeupdate', updateTovTime);
  aEl.addEventListener('timeupdate', updatePerformFocus);
  aEl.addEventListener('timeupdate', updatePerformPlayer);
  aEl.addEventListener('timeupdate', () => updateChartPlayback(aEl.currentTime));

  // ⑤ Replace 初期化
  initReplace(
    () => project.lines,
    (lines) => { project.lines = lines; },
    {
      getFocLine:        () => focLine,
      scrollEditorToRow: scrollEditorToRow,
      addToPaletteIfNew: addToPaletteIfNew,
      refreshEditor:     refreshEditor,
      toast:             toast
    }
  );

  // ⑥ Modals 初期化
  /**
   * modals.js に「土台」と「ユーティリティ」を注入する
   *
   * 【注入するものと理由】
   *
   *   openModal    : modals.js がモーダルを開くための橋渡し関数
   *                  （土台DOMを直接触らせないため）
   *
   *   closeModal   : closeMod() のエイリアス
   *                  modals.js が close を呼べるようにする
   *
   *   mkMBtn       : フッターボタンの生成ヘルパー
   *                  ボタンスタイルを app.js 側に統一するため
   *
   *   toast        : トースト通知
   *                  modals.js 内でユーザーへのフィードバックに使う
   *
   *   getAudioTime : () => aEl.currentTime
   *                  openTimeModal の「▶ 現在位置」ボタン用
   *                  aEl（Audio要素）を直接渡さず、必要な値だけを渡す
   */
  
  initModals({
    // 33-1:
    openModal,
    closeModal: closeMod,
    mkMBtn,
    toast,
    getAudioTime: () => aEl.currentTime,
    getPreviewSvg: ({ frets, barre }) => drawDiagram(frets, barre),
    getCapo: () => project.capo ?? 0,
    generateId: () => crypto.randomUUID(),
    onAddDiagram: (name, variant) => {
      addCustomDiagram(name, variant);
      saveCustomDiagrams();
      refreshDiagrams();
    },
    onUpdateDiagram: (chord, id, patch) => {
      diagPushUndo();
      updateCustomDiagram(chord, id, patch);
      saveCustomDiagrams();
      refreshDiagrams();
    },
    getDiagCallbacks: () => getDiagCallbacks(),

    // 33-3:
    onPreviewChord: (chord) => updateDiagRight(chord),
  });

  // ⑦ ChordEntry 初期化（Phase39-5: chordEntry.js接続完成）
  initChordEntry({
    getLines:            () => project.lines,
    getPalette:          () => palette,
    getPaletteTranspose: () => paletteTranspose,
    addToPaletteIfNew,
    refreshEditor,
    openModal,
    closeModal:          closeMod,
    mkMBtn,
    toast,
    unlockDiag,
    onPreviewChord:      (chord) => updateDiagRight(chord),
    transposeChord,
    updateModalTitle: (text) => { mTit.textContent = text; },
    saveDiagStateForModal,
    clearSavedDiagState,
    restoreOnCancel,
  });

  // ⑧ ChartMode 初期化
  initChartMode({
    getAnalysis:      () => project.analysis,

    // [OWNERSHIP INVARIANT] chartmode.js は project tree を直接読まない。
    // normalized は app.js が project.analysis から取り出して注入する。
    // [TIMING INVARIANT] normalized は capo 非依存。
    //   capo 変更では normalized rebuild 不要。capo は UI Projection のみに影響する。
    getNormalized:    () => project.analysis?.normalized ?? null,

    getAudioEl:       () => aEl,
    getAudioDuration: () => aEl.duration,
    getCapo:          getCapo,
    transposeChord:   transposeChord,
    seekTo:           (time) => { aEl.currentTime = time; },

    // Phase67: hover chord diagram（Phase73-F で接続）
    findChord:        findChord,
    drawDiagram:      drawDiagram,
    tooltipEnabled:   localStorage.getItem('cs.chartDiagHover') !== 'false',

    // [Phase93] Boundary Handle ドラッグ編集コールバック
    // [OWNERSHIP] history push / moveBoundary() 呼び出し / 再描画は app.js が持つ。
    // chartmode.js は pointer gesture の検出と「候補の時刻」の通知だけを行う。
    onBoundaryDragStart: _handleBoundaryDragStart,
    onBoundaryDragMove:  _handleBoundaryDragMove,
    onBoundaryDragEnd:   _handleBoundaryDragEnd,

    // [Phase95-A2] Boundary Handle hover-reveal 用accessor
    // [OWNERSHIP] chartmode.jsはbufferを持たないため、chordId→index の問い合わせを
    // app.js側のこの関数経由で行う（getAnalysis/getNormalizedと同じ注入パターン）。
    getChordIndex: _getChordBufferIndex,

    // Phase72-B: manual timing correction コールバック
    // [OWNERSHIP] repairRule の保存・project.analysis 更新・再描画は app.js が持つ。
    // chartmode.js はユーザーが「何を選んだか」を通知するだけ。

    // 「ここを小節頭にする」: beatTime を受け取り、repairRule を保存して再描画
    onSetRepairRule: async (beatTime) => {
      if (!project.analysis) return;

      const prevRepairRule = project.analysis.repairRule ?? null;

      // 既存の補正がある場合は上書き確認
      if (prevRepairRule) {
        const confirmed = confirm(
          `現在の小節補正（${prevRepairRule.beatTime.toFixed(2)}秒）を\n` +
          `新しい位置（${beatTime.toFixed(2)}秒）に変更します。よろしいですか？`
        );
        if (!confirmed) return;
      }

      const newRepairRule = { version: 1, type: 'anchorDownbeat', beatTime };

      // [Phase72-B 修正: ChatGPTレビュー指摘対応]
      // 先に保存し、成功を確認してから project.analysis に反映する。
      // 保存失敗時に「画面だけ補正済みに見えて再読込で消える」という
      // 不整合（永続化されていないのにメモリ上だけ変わる）を防ぐ。
      const ok = await saveAnalysisFile(project.id, project.analysis.raw, newRepairRule);
      if (!ok) {
        toast('⚠ 保存に失敗しました。補正は反映されていません');
        return;
      }

      project.analysis.repairRule = newRepairRule;

      // viewModel を再構築してから再描画
      // （repairRule が変わるため measures が変わる。renderChartMode だけでは不十分）
      rebuildChartViewModel();
      renderChartMode({ measuresPerRow: chartMeasuresPerRow });
      toast('✅ 小節頭を補正しました');
    },

    // 「補正を解除」: repairRule を null にして保存・再描画
    onClearRepairRule: async () => {
      if (!project.analysis) return;

      // [Phase72-B 修正: ChatGPTレビュー指摘対応]
      // 先に保存し、成功を確認してから project.analysis に反映する。
      const ok = await saveAnalysisFile(project.id, project.analysis.raw, null);
      if (!ok) {
        toast('⚠ 保存に失敗しました。補正は解除されていません');
        return;
      }

      project.analysis.repairRule = null;

      // viewModel を再構築してから再描画
rebuildChartViewModel();
      renderChartMode({ measuresPerRow: chartMeasuresPerRow });
      toast('↩ 小節補正を解除しました');
    },

    // Phase74-C: 解析編集モード連携
    // Phase76-A: Shift+クリックによる範囲選択（連続区間のみ）に対応
    // [OWNERSHIP] 選択状態の正本は analysisEditor.selection（app.js）。
    // chartmode.jsはクリック検出（+shiftKey）のみ行い、ここへ通知する。
    onChordSelected: (chordId, isShiftKey) => {
      if (!isAnalysisEditing()) return;

      const anchorId = analysisEditor.selection.anchorChordId;
      if (isShiftKey && anchorId) {
        selectChordRange(anchorId, chordId);
      } else {
        // 通常クリック: 単一選択・起点(anchor)をクリックしたコードへ更新
        _refreshSelection([chordId], chordId);
        // [Phase95-A1] Chart Modeは演奏位置と編集位置を一致させる方針のため、
        // 検索結果クリック（_activateSearchMatch）と同じ「選択+シーク」に統一する。
        // Shift+クリック（範囲選択）は対象外（選択操作中にシークされると
        // 操作しづらくなるため、上のselectChordRange分岐には含めない）。
        const chord = analysisEditor.buffer.find(c => c._id === chordId);
        if (chord) aEl.currentTime = chord.start;
      }

      // [UI SYNC] setSelectedChordIds → _refreshEditorView() で
      // Chart再描画とPanel更新を一括で行う（更新経路の一本化）。
      setSelectedChordIds(analysisEditor.selection.chordIds);
      _refreshEditorView();
    },

    // chartmode.jsが編集モード中かどうかを問い合わせるための関数
    isEditingAnalysis: () => isAnalysisEditing(),

    // Phase77後半: editPoint（挿入位置）確定リクエスト
    // [OWNERSHIP] editPointの正本は analysisEditor.selection（app.js）。
    // chartmode.jsはクリック検出（二段階クリックモデルの判定）のみ行い、ここへ通知する。
    onEditPointRequested: (ownerId, measureIndex, slotIndex) => {
      setEditPoint(ownerId, measureIndex, slotIndex);
    },
  });

  // ⑨ Library 初期化（Phase73-C）
  initLibrary();

  // ② カスタムダイアグラム復元（右パネルに現在表示中のコードがあれば再描画）
  loadCustomDiagrams();
  const curDiagChord = document.getElementById('diag-in').value.trim();
  if(curDiagChord) showDiagramPanel(curDiagChord, getCapo(), getDiagCallbacks());

  // [Phase84] Representation Layer（chords.js）の唯一のロード地点。
  // restoreLastProjectOnStartup() の中で loadAnalysis() → sanitizeChords()
  // → toReadableChord() が呼ばれるため、その前に完了させる。
  // 他モジュールはロード状態を意識せず toReadableChord() / fromReadableChord()
  // を呼ぶだけでよい（未ロード時は素通しのフェイルセーフがあるため、
  // 万一失敗してもcrashしない）。
  await loadReplacementMap();

  await restoreLastProjectOnStartup();
  refreshEditor();
  renderPalette();
});

// ════════════════════════════════════════
// LIBRARY — 純粋関数（UI実装は Step 4）
// ════════════════════════════════════════

/**
 * getSortedProjects — プロジェクト配列をソートして返す（純粋関数）
 * @param {object[]} projects
 * @param {'updatedAt'|'title'|'artist'} sortBy
 * @returns {object[]}
 */
function getSortedProjects(projects, sortBy) {
  return [...projects].sort((a, b) => {
    if (sortBy === 'updatedAt') {
      return (b.updatedAt || 0) - (a.updatedAt || 0);  // 降順（新しい順）
    }
    if (sortBy === 'title') {
      return (a.title || '').localeCompare(b.title || '', 'ja');
    }
    if (sortBy === 'artist') {
      // [DETERMINISTIC SORT] artistが同名の場合、元の配列順（updatedAt由来）
      // に依存させない。titleをタイブレークにして常に同じ順序になるようにする
      // （Phase99: 同artist内で開いた曲が先頭へ移動する退行の修正）。
      const artistCmp = (a.artist || '').localeCompare(b.artist || '', 'ja');
      if (artistCmp !== 0) return artistCmp;
      return (a.title || '').localeCompare(b.title || '', 'ja');
    }
    return 0;
  });
}

/**
 * formatUpdatedAt — updatedAt（ミリ秒）を相対表示に変換
 * @param {number} ms
 * @returns {string}
 */
function formatUpdatedAt(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const min  = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);
  const day  = Math.floor(diff / 86400000);
  if (min < 1)   return 'たった今';
  if (min < 60)  return `${min}分前`;
  if (hour < 24) return `${hour}時間前`;
  if (day < 7)   return `${day}日前`;
  return new Date(ms).toLocaleDateString('ja-JP');
}

// ════════════════════════════════════════
// LIBRARY — UI本体（Phase73-C）
// ════════════════════════════════════════

// 現在のソート順（localStorage に永続化）
let _librarySortBy = localStorage.getItem('cs.librarySortBy') || 'updatedAt';

/**
 * renderLibrary — ライブラリ一覧を描画する
 */
async function renderLibrary() {
  const listEl = document.getElementById('library-list');
  if (!listEl) return;

  let projects;
  try {
    projects = await listProjects();
  } catch (e) {
    listEl.innerHTML = '<div class="library-empty">読み込みに失敗しました</div>';
    return;
  }

  if (projects.length === 0) {
    listEl.innerHTML = '<div class="library-empty">保存済みプロジェクトがありません</div>';
    return;
  }

  const sorted = getSortedProjects(projects, _librarySortBy);
  listEl.innerHTML = '';

  for (const p of sorted) {
    const isCurrent = (p.id === project.id);
    const item = document.createElement('div');
    item.className = 'library-item' + (isCurrent ? ' library-item--current' : '');
    item.dataset.id = p.id;

    // アーティスト名（空欄の場合は非表示）
    const artistHtml = p.artist
      ? `<span class="library-item-artist">${p.artist}</span>`
      : '';

    item.innerHTML = `
      <div class="library-item-main">
        <span class="library-item-current-mark">${isCurrent ? '▶' : '\u00a0'}</span>
        <div class="library-item-info">
          <div class="library-item-title">${p.title || '無題'}</div>
          ${artistHtml ? `<div class="library-item-meta">${artistHtml}</div>` : ''}
        </div>
      </div>
      <button class="library-item-delete"
        ${isCurrent ? 'disabled title="現在開いているプロジェクトは削除できません"' : 'title="削除"'}>🗑</button>
    `;

    // クリックで開く（現在のプロジェクトは何もしない）
    item.querySelector('.library-item-main').addEventListener('click', async () => {
      if (isCurrent) return;

      // [LOADING FEEDBACK] クリック直後にその行を選択状態にしてカーソルをprogressにする。
      // テキスト書き換えは「画面が落ち着かなくなる」懸念（ChatGPTレビュー）により採用しない。
      // analysis HTTPリクエスト + IndexedDB復元で体感ラグが発生するため
      // 「押せた」ことを視覚的に伝えるだけで十分とする。
      item.classList.add('library-item--loading');
      document.body.style.cursor = 'progress';

      try {
        const data = await getProject(p.id).catch(() => null);
        if (!data) { toast('読み込みに失敗しました'); return; }
        await loadProj(data);
        toast(`📂 ${p.title || '無題'} を開きました`);
        renderLibrary();
      } finally {
        document.body.style.cursor = '';
        item.classList.remove('library-item--loading');
      }
    });

    // 削除ボタン（現在のプロジェクトは disabled）
    const delBtn = item.querySelector('.library-item-delete');
    if (!isCurrent) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = p.title || '無題';
        if (!confirm(`「${name}」を削除します。\n音声・コードデータも削除されます。\nこの操作は元に戻せません。`)) return;
        try {
          await deleteProject(p.id);
          await deleteAssets(p.id);
          toast(`🗑 「${name}」を削除しました`);
          renderLibrary();
        } catch (err) {
          toast('削除に失敗しました');
          console.error('[library] delete error:', err);
        }
      });
    }

    listEl.appendChild(item);
  }
}

/**
 * setRightTab — 右パネルのタブを切り替える
 * @param {'library'|'diagram'} tab
 */
function setRightTab(tab) {
  const libPanel  = document.getElementById('panel-library');
  const diagPanel = document.getElementById('panel-diagram');
  const tabLib    = document.getElementById('tab-library');
  const tabDiag   = document.getElementById('tab-diagram');
  if (!libPanel || !diagPanel) return;

  const isLib = (tab === 'library');
  libPanel.hidden  = !isLib;
  diagPanel.hidden =  isLib;
  tabLib?.classList.toggle('active',  isLib);
  tabDiag?.classList.toggle('active', !isLib);
  localStorage.setItem('cs.rightTab', tab);

  if (isLib) renderLibrary();
}

/**
 * initLibrary — ライブラリの初期化（DOMContentLoaded から呼ぶ）
 */
function initLibrary() {
  // ソート切替
  document.getElementById('library-sort')?.addEventListener('change', e => {
    _librarySortBy = e.target.value;
    localStorage.setItem('cs.librarySortBy', _librarySortBy);
    renderLibrary();
  });

  // タブ切替ボタン
  document.getElementById('tab-library')?.addEventListener('click', () => setRightTab('library'));
  document.getElementById('tab-diagram')?.addEventListener('click', () => setRightTab('diagram'));

  // 前回のタブ状態を復元（初回は 'library'）
  const savedTab = localStorage.getItem('cs.rightTab') || 'library';
  setRightTab(savedTab);

  // ソートの選択状態を復元
  const sortEl = document.getElementById('library-sort');
  if (sortEl) sortEl.value = _librarySortBy;
}

// ── [TEMP REPAIR] Phase55 project data repair expose ──────
// 使用後は必ず削除すること
window.__CS_TRANSPOSE__ = transposeChord;
window.__CS_REFRESH__   = refreshEditor;
window.__CS_PROJECT__   = project;
window.__CS_CHARTSTATE__ = chartState;
window.__CS_REPAIR__    = (semitones) => {
  // semitones を明示指定、または capo UI値を使用
  const n = semitones !== undefined
    ? semitones
    : parseInt(document.getElementById('capo').value) || 0;
  console.log('[repair] semitones =', n, '/ lines =', project.lines.length);
  project.lines.forEach(line => {
    line.chords.forEach(c => {
      if (!c.chord) return;
      c.chord = transposeChord(c.chord, n);
    });
  });
  refreshEditor();
  console.log('[repair] complete');
};
// ──────────────────────────────────────────────────────────
// ════════════════════════════════════════
// DEBUG OBSERVABILITY LAYER（Phase66）
// [DEBUG LAYER INVARIANT] debug layer は state を所有しない。
// runtime state → getter projection → DevTools
// ════════════════════════════════════════
window.__CS_DEBUG__ = {

  get timing() {
    const a = project?.analysis ?? null;
    return {
      raw:           a?.raw                     ?? null,
      normalized:    a?.normalized              ?? null,
      diagnostics:   a?.normalized?.diagnostics ?? null,
      bpm:           a?.bpm                     ?? null,
      timeSignature: a?.timeSignature           ?? null,
    };
  },

  get project() {
    return {
      id:           project?.id            ?? null,
      title:        project?.title         ?? null,
      artist:       project?.artist        ?? null,
      hasAnalysis:  project?.hasAnalysis   ?? false,
      linesCount:   project?.lines?.length ?? 0,
      audio:        project?.audio         ?? null,
      chord_source: project?.chord_source  ?? null,
      capo:         getCapo(),
    };
  },

  get chart() {
    return {
      active:         chartState?.active ?? false,
      measuresPerRow: chartMeasuresPerRow,
    };
  },

  get perf() {
    return getPerfState();
  },

  dumpInvariants() {
    const snapshot = {
      project: this.project,
      timing:  this.timing,
      chart:   this.chart,
      perf:    this.perf,
    };

    const { project: p, timing: t, chart: c, perf: pf } = snapshot;

    console.group('=== ChordScore Invariants ===');

    console.group('[Project]');
    console.log('id:           ', p.id);
    console.log('title:        ', p.title, '/', p.artist);
    console.log('hasAnalysis:  ', p.hasAnalysis);
    console.log('linesCount:   ', p.linesCount);
    console.groupEnd();

    console.group('[Chart Mode]');
    console.log('active:        ', c.active);
    console.log('measuresPerRow:', c.measuresPerRow);
    console.groupEnd();

    console.group('[Timing]');
    console.log('bpm:           ', t.bpm);
    console.log('timeSignature: ', t.timeSignature);
    console.log('diagnostics:   ', t.diagnostics);
    console.groupEnd();

    console.group('[Perf]');
    console.log('lastRAFDelta:  ', pf.lastRAFDelta, 'ms');
    console.log('longFrames:    ', pf.longFrames);
    console.log('longFrameLog:  ', pf.longFrameLog);
    console.groupEnd();

    console.groupEnd();
    return snapshot;
  },
};