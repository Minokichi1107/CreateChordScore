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
 * shiftSelectionRange()（[RANGE SHIFT AUTHORITY]）を使う。
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
 * [RANGE SHIFT AUTHORITY]（Phase77後半で確立）
 * shiftSelectionRange(deltaSec) は、選択範囲全体を「中身の長さを保ったまま」
 * 平行移動する。境界編集（moveBoundary）と異なり、選択範囲内部の各要素は
 * すべて同じ量だけ平行移動するだけで、個々の長さは変化しない。
 * 選択範囲の外側2つの境界（前の隣接コードとの間・次の隣接コードとの間）だけが
 * 実際に伸縮する。範囲が曲の先頭または末尾を含む場合は実行不可
 * （吸収先の隣接コードが存在しないため）。
 * 内部実装はmoveBoundary()を再利用する（境界更新の唯一の窓口という原則を維持）。
 *
 * TODO(Phase78): [BOUNDARY DECORATOR]
 * Chart Mode上のハンドル・editPointマーカーは「コード要素の装飾」ではなく
 * 「編集対象位置（Boundary / EditPoint）の視覚表現」として扱う。
 * 描画ロジックを編集機能から独立させ、chartmode.js内に
 * Boundary Decoratorとして責務を分離する（境界ハンドル・editPointマーカーを
 * 同じ描画システムで統一的に扱う）。今回（Phase77）は機能実装のみ行う。
 */
const analysisEditor = {
  active:    false,  // 編集モード中かどうか
  buffer:    null,   // ChordEvent[]（_id付き）の作業コピー
  history:   [],      // Undo用スナップショットスタック
  future:    [],       // Redo用スナップショットスタック
  // selection: 各フィールドの役割は上記コメント群参照。
  selection: { chordIds: [], boundaryIndex: null, anchorChordId: null, editPoint: null },
  clipboard: null,    // Phase74-E（コピー＆ペースト）用・現在未使用
  dirty:     false,   // 未保存変更フラグ
};

/**
 * resetAnalysisEditor — analysisEditor を初期状態へ戻す
 * Cancel / Save成功 / Project切替 / Chart Mode終了、すべてこの関数で統一する。
 */
function resetAnalysisEditor() {
  analysisEditor.active    = false;
  analysisEditor.buffer    = null;
  analysisEditor.history   = [];
  analysisEditor.future    = [];
  analysisEditor.clipboard = null;
  analysisEditor.dirty     = false;
  _refreshSelection([]);
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
  const ids = chordIds !== undefined ? chordIds : analysisEditor.selection.chordIds;
  const buffer = analysisEditor.buffer;

  // [EDIT POINT LIFETIME] selection（chordIds）が変化する経路は常にここを通るため、
  // editPointのクリアもここに集約する（chordIdsとeditPointは排他）。
  analysisEditor.selection.editPoint = null;

  // [INVARIANT] buffer上の時系列順に正規化し、buffer上に実在しないIDは除外する
  const validIds = buffer ? buffer.filter(c => ids.includes(c._id)).map(c => c._id) : [];

  if (validIds.length === 0) {
    analysisEditor.selection.chordIds = [];
    analysisEditor.selection.boundaryIndex = null;
    analysisEditor.selection.anchorChordId = null;
    return;
  }

  analysisEditor.selection.chordIds = validIds;

  // [Phase77後半・確定] boundaryIndexは「選択範囲の左側の境界」のみ。
  // 単一選択は「範囲の長さ1」として自動的に同じロジックで扱われる（特別扱い不要）。
  // 右側の境界を動かす操作は冗長と判断し廃止（範囲シフトで代替可能）。
  // [SELECTION EDIT TARGETS]
  // boundaryIndexは現在編集対象となっている位置を表す一時的なUI状態（派生情報）である。
  // chordIdsとbufferから常に再計算可能であり、永続化の対象にしない
  // （editPoint導入時も同じ原則を適用する）。
  {
    const firstIdx = buffer.findIndex(c => c._id === validIds[0]);
    analysisEditor.selection.boundaryIndex = firstIdx > 0 ? firstIdx - 1 : null;
  }

  // anchorChordId解決
  const currentAnchor = analysisEditor.selection.anchorChordId;
  if (anchorChordId !== undefined) {
    analysisEditor.selection.anchorChordId = anchorChordId;
  } else if (currentAnchor && validIds.includes(currentAnchor)) {
    // 既存anchorが新しい選択範囲に含まれる場合は維持する
    // （Shift+クリックで範囲を広げても起点は変わらない）
  } else {
    analysisEditor.selection.anchorChordId = validIds[validIds.length - 1];
  }
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
  const buffer = analysisEditor.buffer;
  const i1 = buffer?.findIndex(c => c._id === anchorChordId) ?? -1;
  const i2 = buffer?.findIndex(c => c._id === targetChordId) ?? -1;

  if (i1 === -1 || i2 === -1) {
    _refreshSelection([targetChordId], targetChordId);
    return;
  }

  const lo = Math.min(i1, i2);
  const hi = Math.max(i1, i2);
  const ids = buffer.slice(lo, hi + 1).map(c => c._id);
  // anchorChordIdは明示せず省略する → 既存anchor（anchorChordId、hi/lo内に含まれる）を維持
  _refreshSelection(ids);
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
  analysisEditor.dirty = false;
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
  shiftSelectionRange,
  setEditPoint,
  clearEditPoint,
  addChordAtEditPoint,
  selectChordRange,
  deleteSelection,
  copySelection,
  cutSelection,
  pasteSelection,
  mergeSelection,
  undoEdit,
  redoEdit,
  validateAnalysis,
  get state() { return analysisEditor; },
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
  analysisEditor.history.push(structuredClone(analysisEditor.buffer));
  analysisEditor.future = [];
  analysisEditor.dirty = true;
}

/**
 * updateChord — 指定IDのコードのプロパティを更新する
 * @param {string} id - chord._id
 * @param {{ chord?: string, start?: number, end?: number }} patch
 */
function updateChord(id, patch) {
  if (!isAnalysisEditing()) return;
  const c = analysisEditor.buffer.find(c => c._id === id);
  if (!c) return;  // 存在しないIDなら何もしない（無駄なUndo履歴を防ぐ）

  _pushHistory();
  Object.assign(c, patch);
  _refreshEditorView();
}

/**
 * _isNoChordEntry — Analysis Editorのbufferエントリがno_chord（無音）プレースホルダーか判定
 *
 * ChordMini解析結果には無音区間が chord:'N'（表記ゆれ含む）という
 * 通常のコードエントリと同じ形（{chord, start, end, _id}）で入っている。
 * 表記ゆれの正規化ロジックは既存のimportChordJson内の同種処理と揃えてある
 * （括弧・ドット・空白除去→大文字化→'N'/'NC'と比較）。
 *
 * [NOTE] project.lines側のtoken semantic（{type:'no_chord'}）とは別物。
 * Analysis Editorのbufferは常に文字列chordプロパティを持つフラットな配列であり、
 * ここではその文字列を見て判定する。
 */
function _isNoChordEntry(c) {
  if (!c || !c.chord) return false;
  const normalized = String(c.chord).trim().toUpperCase()
    .replace(/\./g, '').replace(/\s/g, '').replace(/[()]/g, '');
  return normalized === 'N' || normalized === 'NC';
}

/**
 * _pickAbsorbingNeighbor — 削除ブロックの吸収先を決定する（Phase76-Bで確定）
 *
 * [設計変更の経緯]
 * 当初は「削除対象がbuffer先頭（index 0）かどうか」で吸収方向を決めていたが、
 * 曲頭のno_chord（無音）プレースホルダーがbuffer[0]に存在するケースで、
 * 「ユーザーが最初の実コードから選択して削除した」つもりが「先頭ではない」
 * と判定され、無音コードに左吸収されて実コードが消えたように見えるバグとして発覚。
 * （Phase76-Bの複数削除テストで発見・ChatGPTレビューで方針確定）
 *
 * [新ルール] 「index 0かどうか」ではなく「左隣が吸収可能な実コードかどうか」で判定する。
 *   左隣が実コード → 左吸収（従来通り。大半のケースはこちら）
 *   左隣がno_chord、または左隣が存在しない → 右吸収
 *   右隣も存在しない（左右どちらも使えない） → 消去法で左隣を採用
 *     （no_chordであっても、他に吸収先の選択肢がないため）
 *
 * @param {Array} buffer
 * @param {number} lo - 削除ブロック先頭のindex
 * @param {number} hi - 削除ブロック末尾のindex（単一削除の場合は lo と同じ値を渡す）
 * @returns {{ absorbing: object, direction: 'left'|'right' }}
 */
function _pickAbsorbingNeighbor(buffer, lo, hi) {
  const left = lo > 0 ? buffer[lo - 1] : null;
  const right = hi < buffer.length - 1 ? buffer[hi + 1] : null;

  if (left && !_isNoChordEntry(left)) return { absorbing: left, direction: 'left' };
  if (right) return { absorbing: right, direction: 'right' };
  return { absorbing: left, direction: 'left' }; // 右もない場合の最終フォールバック
}

/**
 * deleteChord — 指定コードを削除し、時間領域を隣接コードへ吸収する
 *
 * [DELETE INVARIANTS] この関数が保証すること
 *   1. コードは最低1件残す（残り1件の場合は削除せず何もしない）。
 *   2. 吸収方向は _pickAbsorbingNeighbor() が決める
 *      （左隣が実コードなら左吸収・no_chordや先頭なら右吸収。Phase76-Bで確定）。
 *   3. 隙間や重なりを作らない（吸収後、隣接コード同士は連続する）。
 *   4. Undo単位はこの関数全体で1回（_pushHistory()をここで1回だけ呼ぶ）。
 *   5. 吸収したコードを自動選択する。削除は選択の継続先が一意に決まる操作
 *      （吸収した側を選ぶ以外の選択肢がない）ため、_refreshSelection() と
 *      setSelectedChordIds() の両方をこの関数自身が呼ぶ（呼び出し側に委ねない。
 *      Phase75のsplitChord()利用箇所で発生した「setSelectedChordIds()呼び忘れ」
 *      バグの再発を構造的に防ぐため）。
 *
 * @param {string} id - chord._id
 * @returns {string|null} 吸収したコードの_id。削除しなかった場合はnull。
 */
function deleteChord(id) {
  if (!isAnalysisEditing()) return null;

  const idx = analysisEditor.buffer.findIndex(c => c._id === id);
  if (idx === -1) return null;

  // [INVARIANT 1] 最低1件は残す
  if (analysisEditor.buffer.length <= 1) {
    toast('最後の1つのコードは削除できません');
    return null;
  }

  const target = analysisEditor.buffer[idx];
  _pushHistory();  // [INVARIANT 4] Undo単位はここで1回のみ

  // [INVARIANT 2] 吸収方向の決定（Phase76-B: index0判定 → 実コード判定に変更）
  const { absorbing, direction } = _pickAbsorbingNeighbor(analysisEditor.buffer, idx, idx);

  if (direction === 'left') {
    absorbing.end = target.end;      // [INVARIANT 3] 左隣の終了を後ろへ伸ばす
  } else {
    absorbing.start = target.start;  // [INVARIANT 3] 右隣の開始を前へ伸ばす
  }

  analysisEditor.buffer.splice(idx, 1);

  _refreshSelection([absorbing._id]);   // [INVARIANT 5] パネル表示用の選択情報
  setSelectedChordIds([absorbing._id]); // [INVARIANT 5] Chart Mode側のハイライト表示用の選択情報
  _refreshEditorView();
  return absorbing._id;
}

/**
 * deleteSelection — 選択中コードをまとめて削除する（Phase76-B）
 *
 * [DESIGN] 範囲選択（selectChordRange）は常にbuffer上の連続区間しか作らない
 * という前提の上に立つ操作。選択範囲を「1つの連続ブロック」として扱い、
 * deleteChord()と同じ吸収ルールを拡張して適用する。
 *
 * [DELETE SELECTION INVARIANTS] この関数が保証すること
 *   1. 選択が単一（1件）の場合は deleteChord() にそのまま委譲する
 *      （吸収ルールの実装を1箇所に保つ・Phase75からのロジック重複を避ける）。
 *   2. 選択範囲は buffer 上で連続していることを前提とするが、
 *      万一崩れていた場合は防御的に検知し、削除せずtoastで知らせる
 *      （selectChordRangeの前提が壊れた場合の安全弁）。
 *   3. 削除後、最低1件はコードを残す（残らない場合は削除せず何もしない）。
 *   4. 吸収方向は _pickAbsorbingNeighbor() が決める
 *      （左隣が実コードなら左吸収・no_chordや先頭なら右吸収。deleteChord()と同じ判定を共有する）。
 *   5. Undo単位はこの関数全体で1回。
 *   6. 吸収したコードを自動選択する（selection/chartState両方をこの関数が同期する。
 *      呼び出し側に委ねない設計はdeleteChord()と同じ・Phase75の教訓を踏襲）。
 *
 * @returns {string|null} 吸収したコードの_id。削除しなかった場合はnull。
 */
function deleteSelection() {
  if (!isAnalysisEditing()) return null;

  const selectedIds = analysisEditor.selection.chordIds;
  if (selectedIds.length === 0) return null;
  if (selectedIds.length === 1) return deleteChord(selectedIds[0]); // [INVARIANT 1]

  const buffer = analysisEditor.buffer;
  const indices = selectedIds
    .map(id => buffer.findIndex(c => c._id === id))
    .filter(i => i !== -1)
    .sort((a, b) => a - b);

  if (indices.length === 0) return null;

  const lo = indices[0];
  const hi = indices[indices.length - 1];

  // [INVARIANT 2] 連続区間であることの防御的確認
  if (hi - lo + 1 !== indices.length) {
    toast('選択範囲が連続していないため削除できません');
    return null;
  }

  const removeCount = hi - lo + 1;

  // [INVARIANT 3] 最低1件は残す
  if (buffer.length - removeCount < 1) {
    toast('すべてのコードは削除できません');
    return null;
  }

  const blockStart = buffer[lo];
  const blockEnd = buffer[hi];
  _pushHistory(); // [INVARIANT 5] Undo単位はここで1回のみ

  // [INVARIANT 4] 吸収方向の決定（Phase76-B: index0判定 → 実コード判定に変更）
  const { absorbing, direction } = _pickAbsorbingNeighbor(buffer, lo, hi);

  if (direction === 'left') {
    absorbing.end = blockEnd.end;
  } else {
    absorbing.start = blockStart.start;
  }

  buffer.splice(lo, removeCount);

  _refreshSelection([absorbing._id], absorbing._id); // [INVARIANT 6]
  setSelectedChordIds([absorbing._id]);               // [INVARIANT 6]
  _refreshEditorView();
  return absorbing._id;
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
 * clipboard構造:
 *   { version: 1, chords: [{ chord, ratio }, ...] }
 *   version: 将来のフィールド追加（sourceDuration等）に備えた互換性用。現状は未使用。
 *
 * @returns {boolean} コピーが成功したか（選択が空・不正な場合はfalse）
 */
function copySelection() {
  if (!isAnalysisEditing()) return false;

  const selectedIds = analysisEditor.selection.chordIds;
  if (selectedIds.length === 0) return false;

  const buffer = analysisEditor.buffer;
  // selection.chordIdsは既にbuffer上の時系列順（_refreshSelectionで正規化済み）
  const selectedChords = selectedIds
    .map(id => buffer.find(c => c._id === id))
    .filter(Boolean);

  if (selectedChords.length === 0) return false;

  const totalDuration = selectedChords.reduce((sum, c) => sum + (c.end - c.start), 0);
  if (totalDuration <= 0) {
    toast('コピーできません（不正な時間データです）');
    return false;
  }

  analysisEditor.clipboard = {
    version: 1,
    chords: selectedChords.map(c => ({
      chord: c.chord,
      ratio: (c.end - c.start) / totalDuration,
    })),
  };

  toast(`${selectedChords.length}件コピーしました`);
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

  const copied = copySelection();
  if (!copied) return null; // [INVARIANT] コピー失敗時はDeleteを実行しない

  return deleteSelection();
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

  const clipboard = analysisEditor.clipboard;
  if (!clipboard || !clipboard.chords || clipboard.chords.length === 0) {
    toast('コピーされたコードがありません');
    return null;
  }

  const selectedIds = analysisEditor.selection.chordIds;
  if (selectedIds.length === 0) return null;

  const buffer = analysisEditor.buffer;
  const indices = selectedIds
    .map(id => buffer.findIndex(c => c._id === id))
    .filter(i => i !== -1)
    .sort((a, b) => a - b);

  if (indices.length === 0) return null;

  const lo = indices[0];
  const hi = indices[indices.length - 1];

  // [INVARIANT] 連続区間であることの防御的確認
  if (hi - lo + 1 !== indices.length) {
    toast('選択範囲が連続していないため貼り付けできません');
    return null;
  }

  const targetStart = buffer[lo].start;
  const targetEnd = buffer[hi].end;
  const targetDuration = targetEnd - targetStart;

  if (targetDuration <= 0) {
    toast('貼り付けできません（不正な時間データです）');
    return null;
  }

  _pushHistory();

  // クリップボードのratioを貼り付け先の枠の長さへ配分し、新しいコード群を生成
  let cursor = targetStart;
  const newChords = clipboard.chords.map((entry, i) => {
    const isLast = i === clipboard.chords.length - 1;
    const start = cursor;
    // [INVARIANT] 最後のコードだけtargetEndへ直接合わせ、誤差の蓄積を吸収する
    const end = isLast ? targetEnd : cursor + entry.ratio * targetDuration;
    cursor = end;
    return {
      chord: entry.chord,
      start,
      end,
      confidence: 1,
      _id: crypto.randomUUID(),
    };
  });

  buffer.splice(lo, hi - lo + 1, ...newChords);

  const newIds = newChords.map(c => c._id);
  _refreshSelection(newIds, newIds[newIds.length - 1]); // [INVARIANT] 新しいコード群を自動選択
  setSelectedChordIds(newIds);
  _refreshEditorView();
  return newIds;
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

  const selectedIds = analysisEditor.selection.chordIds;
  if (selectedIds.length < 2) return null; // [INVARIANT] 結合には2件以上必要

  const buffer = analysisEditor.buffer;
  const indices = selectedIds
    .map(id => buffer.findIndex(c => c._id === id))
    .filter(i => i !== -1)
    .sort((a, b) => a - b);

  if (indices.length < 2) return null;

  const lo = indices[0];
  const hi = indices[indices.length - 1];

  // [INVARIANT] 連続区間であることの防御的確認（deleteSelection/pasteSelectionと同じ考え方）
  if (hi - lo + 1 !== indices.length) {
    toast('選択範囲が連続していないため結合できません');
    return null;
  }

  const first = buffer[lo];
  const last = buffer[hi];

  _pushHistory();

  const merged = {
    chord: first.chord,       // [DESIGN] 先頭コードの名前を自動採用
    start: first.start,
    end: last.end,
    confidence: 1,
    _id: crypto.randomUUID(),
  };

  buffer.splice(lo, hi - lo + 1, merged);

  _refreshSelection([merged._id], merged._id); // [INVARIANT] 結合結果を自動選択
  setSelectedChordIds([merged._id]);
  _refreshEditorView();
  return merged._id;
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
 * Invariant:
 *   left.end と right.start は常に同じ値になるよう更新する。
 *
 * 範囲チェックはこの関数の責務ではない（呼び出し側が判断する）。
 *
 * @returns {number|null} 適用された時刻。境界が存在しなければnull。
 */
function moveBoundary(boundaryIndex, newTime) {
  if (!isAnalysisEditing()) return null;
  const left  = analysisEditor.buffer[boundaryIndex];
  const right = analysisEditor.buffer[boundaryIndex + 1];
  if (!left || !right) return null;

  left.end    = newTime;
  right.start = newTime;
  return newTime;
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

  // chordIdsとeditPointは排他。_refreshSelection([])経由ではなく直接クリアする
  // （_refreshSelection()を呼ぶとeditPoint自体も道連れでクリアされてしまうため）。
  analysisEditor.selection.chordIds = [];
  analysisEditor.selection.boundaryIndex = null;
  analysisEditor.selection.anchorChordId = null;
  analysisEditor.selection.editPoint = { ownerId: resolvedOwnerId, measureIndex, slotIndex };

  // [UI SYNC] chartmode.js側の選択キャッシュも同時にクリアする
  // （Phase75の「選択の二重管理・同期漏れ」の教訓を踏まえ、この関数自身が両方を担う）。
  setSelectedChordIds([]);
  _refreshEditorView();
}

/**
 * clearEditPoint — editPointを解除する（Escキー等から呼ばれる）
 */
function clearEditPoint() {
  if (analysisEditor.selection.editPoint === null) return;
  analysisEditor.selection.editPoint = null;
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

  showChordSelector({
    title: 'コードを追加',
    initialChord: owner.chord,
    onSelect: (selected) => {
      const newId = splitChord(owner._id, splitTime);
      if (!newId) { toast('この位置には追加できません（時間が足りません）'); return; }
      updateChord(newId, { chord: selected.name });
      // 成功時: 新規コードを単独選択する（[EDIT POINT LIFETIME] により
      // _refreshSelection()経由でeditPointは自動的にクリアされる）。
      _refreshSelection([newId]);
      setSelectedChordIds([newId]);
      _refreshEditorView();
    },
    // onCancel省略: 何も呼ばれず、splitChord()にも到達しないためeditPointは維持される
  });
}

/**
 * splitChord — 指定コードを splitTime で2つに分割する（コード追加の実体・Phase75）
 *
 * [SPLIT INVARIANTS] この関数が保証すること
 *   1. splitTime が対象コードの (start, end) の範囲外（両端含む）なら、
 *      何もせず null を返す（duration 0 のコードを作らない）。
 *   2. 左側コードは元の _id・chord名を維持する（end だけ splitTime に書き換わる）。
 *   3. 右側コードは新しい _id（crypto.randomUUID()）を持つ新規オブジェクトとして生成される。
 *   4. 右側コードの chord名は左側と同じ値をコピーする
 *      （呼び出し側が showChordSelector() → updateChord() で直後に上書きする前提。
 *      この関数自身はコード名の確定処理を持たない）。
 *   5. 左右のコードは時間的に隙間なく連続する（left.end === right.start === splitTime）。
 *   6. Undo単位はこの関数全体で1回（_pushHistory()をここで1回だけ呼ぶ。
 *      呼び出し側で追加の_pushHistory()を呼ばないこと）。
 *   7. buffer の配列長が変わる操作のため、_refreshSelection() を呼ぶ（[AE-4]）。
 *      ただし選択自体を新しいコードへ切り替えるかどうかは呼び出し側の責務
 *      （呼び出し側は返り値の chordId を使って改めて _refreshSelection([id]) すること）。
 *
 * @param {string} chordId - 分割対象のコードの _id
 * @param {number} splitTime - 分割点の時刻（秒）
 * @returns {string|null} 新しく生成された右側コードの _id。失敗時は null。
 */
function splitChord(chordId, splitTime) {
  if (!isAnalysisEditing()) return null;

  const idx = analysisEditor.buffer.findIndex(c => c._id === chordId);
  if (idx === -1) return null;

  const target = analysisEditor.buffer[idx];
  // [INVARIANT 1] 範囲チェック（両端含む＝duration 0を防ぐ）
  if (!(splitTime > target.start && splitTime < target.end)) return null;

  _pushHistory();  // [INVARIANT 6] Undo単位はここで1回のみ

  // [INVARIANT 3・4] 右側は新規_id・chord名は左側からコピー
  const rightChord = { ...target, _id: crypto.randomUUID(), start: splitTime };
  // [INVARIANT 2・5] 左側はend更新のみ。right.start === splitTime === left.end
  target.end = splitTime;

  analysisEditor.buffer.splice(idx + 1, 0, rightChord);

  _refreshSelection();  // [INVARIANT 7・AE-4] buffer長が変わったため選択キャッシュを再同期
  _refreshEditorView();
  return rightChord._id;
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
  showChordSelector({
    title: 'コード名を変更',
    initialChord: chord.chord,
    onSelect: (selected) => {
      updateChord(chord._id, { chord: selected.name });
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
 * shiftSelectionRange — 選択範囲全体を「中身の長さを保ったまま」平行移動する（UIコマンド層）
 * [RANGE SHIFT AUTHORITY]（Phase77後半で確立）
 * shiftSelectedBoundary()（境界そのものを編集＝選択範囲内の長さが変わる）とは異なり、
 * 選択範囲内の各要素は全て同じ量だけ平行移動するだけで、個々の長さは変化しない。
 * 実際に伸縮するのは選択範囲の外側2つの境界（前後の隣接コードとの間）のみ。
 *
 * 選択範囲が曲の先頭または末尾を含む場合は実行不可（吸収先の隣接コードが
 * 存在しないため。timeline全体が常に隙間なく連続しているという不変条件を守るには、
 * 両端に吸収先が必要）。
 *
 * 内部実装はmoveBoundary()を再利用する（[BOUNDARY EDIT AUTHORITY]：
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
  const firstIdx = buffer.findIndex(c => c._id === ids[0]);
  const lastIdx  = buffer.findIndex(c => c._id === ids[ids.length - 1]);

  if (firstIdx <= 0 || lastIdx >= buffer.length - 1) {
    toast('曲の端のコードを含むため、これ以上移動できません');
    return;
  }

  const prevChord = buffer[firstIdx - 1];
  const nextChord = buffer[lastIdx + 1];
  const newBlockStart = buffer[firstIdx].start + deltaSec;
  const newBlockEnd   = buffer[lastIdx].end + deltaSec;

  if (newBlockStart <= prevChord.start || newBlockEnd >= nextChord.end) {
    toast('隣のコードがこれ以上短くできないため移動できません');
    return;
  }

  _pushHistory();

  // 選択範囲内部を丸ごとdeltaSecだけ平行移動。
  // 内部の要素同士の境界は全要素が同じ量だけ動くため自動的に連続性が保たれる。
  for (let i = firstIdx; i <= lastIdx; i++) {
    buffer[i].start += deltaSec;
    buffer[i].end   += deltaSec;
  }
  // 外側2つの境界はmoveBoundary()を再利用して更新する
  // （内部ループで既に同じ値になっているが、更新経路を1箇所に統一するため呼び出す）。
  moveBoundary(firstIdx - 1, newBlockStart);
  moveBoundary(lastIdx, newBlockEnd);

  _refreshEditorView();
}

/**
 * undoEdit — 直前の編集操作を取り消す
 */
function undoEdit() {
  if (!isAnalysisEditing()) return;
  if (!analysisEditor.history.length) return;
  analysisEditor.future.push(structuredClone(analysisEditor.buffer));
  analysisEditor.buffer = analysisEditor.history.pop();
  _refreshSelection();
  _refreshEditorView();
}

/**
 * redoEdit — undoEdit() で取り消した操作をやり直す
 */
function redoEdit() {
  if (!isAnalysisEditing()) return;
  if (!analysisEditor.future.length) return;
  analysisEditor.history.push(structuredClone(analysisEditor.buffer));
  analysisEditor.buffer = analysisEditor.future.pop();
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
function renderAnalysisEditorPanel() {
  // [NOTE] innerHTML を毎回再生成するためイベントも毎回再結線する（重複登録なし）

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

  // ── Phase77後半: editPointモード（他の全ての行より優先して分岐・早期return） ──
  // [Phase77後半・確定] editPoint中は「編集位置」「＋ Add Here」「キャンセル」の
  // 最小限のUIのみ表示する。個別移動・範囲シフト・編集（変更/削除等）は非表示にし、
  // 「ボタンが多すぎて何ができるか分からない」問題（実機確認で指摘済み）を再発させない。
  // 貼り付け（Paste Insert）ボタンはPhase78で実装する時に追加する（今回は作らない）。
  {
    const editPoint = analysisEditor.selection.editPoint;
    if (editPoint) {
      const owner = analysisEditor.buffer.find(c => c._id === editPoint.ownerId);
      const time = getTimeForGridPosition(editPoint.measureIndex, editPoint.slotIndex);
      const posLabel = owner
        ? `${owner.chord} の途中（${time != null ? time.toFixed(3) : '?'}秒）`
        : '不明な位置';

      panel.innerHTML = `
        <div class="aep-row">
          <span class="aep-section-label">編集位置</span>
          <span class="aep-chord-info">${posLabel}</span>
        </div>
        <div class="aep-row">
          <button class="aep-btn aep-btn--primary" id="aep-add-here">＋ Add Here</button>
          <button class="aep-btn" id="aep-editpoint-cancel">キャンセル</button>
        </div>
      `;

      document.getElementById('aep-add-here')?.addEventListener('click', () => {
        addChordAtEditPoint();
      });
      document.getElementById('aep-editpoint-cancel')?.addEventListener('click', () => {
        clearEditPoint();
      });
      return;
    }
  }

  // 選択中コードを取得
  // [Phase76-A] 複数選択時はselectedId/chordをnullのまま扱う
  // （単一選択専用の操作＝境界移動・追加・変更・単体削除は複数選択時には出さない。
  //  複数選択専用の操作＝複数削除・Copy/Cut/Paste・Mergeは今後のPhaseで追加する）。
  const selectedIds = analysisEditor.selection.chordIds;
  const isMultiSelect = selectedIds.length > 1;
  const selectedId = !isMultiSelect ? (selectedIds[0] ?? null) : null;
  const chord = selectedId
    ? (analysisEditor.buffer.find(c => c._id === selectedId) ?? null)
    : null;
  // [Phase77後半・確定] 個別移動＝単一選択専用／範囲シフト＝複数選択専用に出し分ける。
  // 理由：個別移動は内部的に「選択範囲の先頭コード1つ」だけを操作するため、
  // 複数選択時に使うと「先頭だけ動く」という違和感が生じる（実機確認で発覚）。
  // 範囲シフトは単一選択でも動作しうるが、単一コードの伸縮は個別移動で
  // 十分カバーできるため、両方を同時に出す必要はないと判断した。
  const hasLeftBoundary = analysisEditor.selection.boundaryIndex !== null;
  // 範囲シフトは選択範囲が曲の先頭・末尾を含まない時のみ有効
  // （shiftSelectionRange()内のガードと対応する表示用フラグ）
  const firstSelId = selectedIds[0];
  const lastSelId  = selectedIds[selectedIds.length - 1];
  const firstSelIdx = firstSelId ? analysisEditor.buffer.findIndex(c => c._id === firstSelId) : -1;
  const lastSelIdx  = lastSelId  ? analysisEditor.buffer.findIndex(c => c._id === lastSelId)  : -1;
  const canRangeShift = isMultiSelect
    && firstSelIdx > 0
    && lastSelIdx < analysisEditor.buffer.length - 1;

  // ── Phase74-C: 選択コードの情報表示（読み取り専用） ──
  // Phase76-A: 複数選択時は「N件選択中」を表示する
  const chordInfo = chord
    ? `<div class="aep-chord-info">
         <span class="aep-chord-name">${chord.chord}</span>
         <span class="aep-chord-time">${chord.start.toFixed(3)}秒 〜 ${chord.end.toFixed(3)}秒</span>
       </div>`
    : isMultiSelect
      ? `<div class="aep-chord-info">${selectedIds.length}件選択中</div>`
      : `<div class="aep-chord-info aep-chord-info--empty">コードをクリックして選択してください</div>`;

  // ── Phase74-E: 個別移動（単一選択専用・Phase77後半で複数選択時は無効化） ──
  const boundaryControls = isMultiSelect
    ? `<span class="aep-shift-note">複数選択中はこの操作は使えません（範囲シフトをご利用ください）</span>`
    : !chord
      ? `<span class="aep-shift-note">コードを選択してください</span>`
      : !hasLeftBoundary
        ? `<span class="aep-shift-note">先頭のコードを含むため境界がありません</span>`
        : `<div class="aep-shift-btns">
             <button class="aep-btn aep-btn--shift" id="aep-bnd-m05">← 0.5秒</button>
             <button class="aep-btn aep-btn--shift" id="aep-bnd-m01">← 0.1秒</button>
             <button class="aep-btn aep-btn--shift" id="aep-bnd-p01">→ 0.1秒</button>
             <button class="aep-btn aep-btn--shift" id="aep-bnd-p05">→ 0.5秒</button>
           </div>`;

  // ── [RANGE SHIFT AUTHORITY]: 範囲シフト（複数選択専用） ──
  const rangeShiftControls = !isMultiSelect
    ? `<span class="aep-shift-note">複数選択中のみ利用できます（範囲選択してください）</span>`
    : !canRangeShift
      ? `<span class="aep-shift-note">曲の端のコードを含むため、これ以上移動できません</span>`
      : `<div class="aep-shift-btns">
           <button class="aep-btn aep-btn--shift" id="aep-rng-m05">← 0.5秒</button>
           <button class="aep-btn aep-btn--shift" id="aep-rng-m01">← 0.1秒</button>
           <button class="aep-btn aep-btn--shift" id="aep-rng-p01">→ 0.1秒</button>
           <button class="aep-btn aep-btn--shift" id="aep-rng-p05">→ 0.5秒</button>
         </div>`;

  // ── Phase75: 編集アクション（追加・変更・削除） ──
  // Phase76-B: 複数選択時は複数削除ボタンを表示する
  // Phase76-C: コピーは単一選択・複数選択どちらでも使える
  // Phase76-D: 切り取り（Cut）も単一・複数どちらでも使える。cutSelection()が内部で
  //            単一/複数を吸収するため、ボタンidは共通の #aep-cut を両方で使う
  // Phase76-E: 貼り付け（Paste）はclipboardに内容がある場合のみ表示する。
  //            pasteSelection()も単一/複数を内部で吸収するため #aep-paste を共通で使う
  const hasClipboard = !!(analysisEditor.clipboard && analysisEditor.clipboard.chords?.length);
  const pasteBtn = hasClipboard
    ? `<button class="aep-btn" id="aep-paste">📄 貼り付け</button>`
    : '';

  const editActions = chord
    ? `<div class="aep-shift-btns">
         <button class="aep-btn" id="aep-add">＋ 追加</button>
         <button class="aep-btn" id="aep-rename">✎ 変更</button>
         <button class="aep-btn" id="aep-copy">📋 コピー</button>
         <button class="aep-btn" id="aep-cut">✂ 切り取り</button>
         ${pasteBtn}
         <button class="aep-btn aep-btn--danger" id="aep-delete-chord">🗑 削除</button>
       </div>`
    : isMultiSelect
      ? `<div class="aep-shift-btns">
           <button class="aep-btn" id="aep-copy">📋 コピー（${selectedIds.length}件）</button>
           <button class="aep-btn" id="aep-cut">✂ 切り取り（${selectedIds.length}件）</button>
           ${pasteBtn}
           <button class="aep-btn" id="aep-merge">🔗 結合（${selectedIds.length}件）</button>
           <button class="aep-btn aep-btn--danger" id="aep-delete-selection">🗑 削除（${selectedIds.length}件）</button>
         </div>`
      : `<span class="aep-shift-note">コードを選択してください</span>`;

  // ── Phase74-C UI ──
  panel.innerHTML = `
    <div class="aep-row aep-row--info">
      <span class="aep-section-label">選択中のコード</span>
      ${chordInfo}
    </div>
    <div class="aep-row aep-row--shift">
      <span class="aep-section-label">全体シフト</span>
      <span class="aep-shift-note">全コードのタイミングを一括でずらします</span>
      <div class="aep-shift-btns">
        <button class="aep-btn aep-btn--shift" id="aep-shift-m05">← 0.5秒</button>
        <button class="aep-btn aep-btn--shift" id="aep-shift-m01">← 0.1秒</button>
        <button class="aep-btn aep-btn--shift" id="aep-shift-p01">→ 0.1秒</button>
        <button class="aep-btn aep-btn--shift" id="aep-shift-p05">→ 0.5秒</button>
      </div>
    </div>
    <div class="aep-row aep-row--boundary">
      <span class="aep-section-label">個別移動</span>
      ${boundaryControls}
    </div>
    <div class="aep-row aep-row--boundary">
      <span class="aep-section-label">範囲シフト</span>
      ${rangeShiftControls}
    </div>
    <div class="aep-row aep-row--edit">
      <span class="aep-section-label">編集</span>
      ${editActions}
    </div>
    <div class="aep-row aep-row--actions">
      <button class="aep-btn" id="aep-undo">↩ 元に戻す</button>
      <button class="aep-btn" id="aep-redo">↪ やり直し</button>
      <span class="aep-spacer"></span>
      <button class="aep-btn" id="aep-cancel">キャンセル</button>
      <button class="aep-btn aep-btn--save" id="aep-save"
        ${analysisEditor.dirty ? '' : 'disabled'}>保存して閉じる</button>
    </div>
  `;

  // ── Phase74-C: イベント結線（全体シフト・Undo/Redo・保存・キャンセル） ──
  document.getElementById('aep-shift-m05')?.addEventListener('click', () => shiftAll(-0.5));
  document.getElementById('aep-shift-m01')?.addEventListener('click', () => shiftAll(-0.1));
  document.getElementById('aep-shift-p01')?.addEventListener('click', () => shiftAll(0.1));
  document.getElementById('aep-shift-p05')?.addEventListener('click', () => shiftAll(0.5));
  document.getElementById('aep-bnd-m05')?.addEventListener('click', () => shiftSelectedBoundary(-0.5));
  document.getElementById('aep-bnd-m01')?.addEventListener('click', () => shiftSelectedBoundary(-0.1));
  document.getElementById('aep-bnd-p01')?.addEventListener('click', () => shiftSelectedBoundary(0.1));
  document.getElementById('aep-bnd-p05')?.addEventListener('click', () => shiftSelectedBoundary(0.5));
  document.getElementById('aep-rng-m05')?.addEventListener('click', () => shiftSelectionRange(-0.5));
  document.getElementById('aep-rng-m01')?.addEventListener('click', () => shiftSelectionRange(-0.1));
  document.getElementById('aep-rng-p01')?.addEventListener('click', () => shiftSelectionRange(0.1));
  document.getElementById('aep-rng-p05')?.addEventListener('click', () => shiftSelectionRange(0.5));
  document.getElementById('aep-add')?.addEventListener('click', () => {
    if (!chord) return;
    // 初期実装: 均等2分割のみ（将来カーソル位置分割を追加する場合もsplitChord()自体は変更不要）
    const splitTime = (chord.start + chord.end) / 2;
    showChordSelector({
      title: 'コードを追加',
      initialChord: chord.chord,
      onSelect: (selected) => {
        const newId = splitChord(selectedId, splitTime);
        if (!newId) return;  // 万一splitTimeが不正だった場合は何もしない
        updateChord(newId, { chord: selected.name });
        _refreshSelection([newId]);   // ① パネル表示用の選択情報
        setSelectedChordIds([newId]); // ② Chart Mode側のハイライト表示用の選択情報（同期漏れ修正）
        _refreshEditorView();
      },
      // onCancel省略: 何も呼ばれず、splitChord()にも到達しないため状態は一切変化しない
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
  document.getElementById('aep-copy')?.addEventListener('click', () => {
    copySelection();
    // [NOTE] Copyはbufferを変更しないためUndo履歴には積まれない。
    // 選択状態も変えないため_refreshEditorView()等の呼び出しは不要
    // （copySelection()内のtoast表示のみで完結する）。
  });
  document.getElementById('aep-cut')?.addEventListener('click', () => {
    // [NOTE] cutSelection()内部でcopySelection()→deleteSelection()の順に呼ぶため、
    // 選択状態・Chart表示の同期はdeleteSelection()（またはdeleteChord()）側が担う。
    cutSelection();
  });
  document.getElementById('aep-paste')?.addEventListener('click', () => {
    // [NOTE] 選択状態・Chart表示の同期はpasteSelection()自身が担う
    pasteSelection();
  });
  document.getElementById('aep-merge')?.addEventListener('click', () => {
    // [NOTE] 確認ダイアログなし・即実行（deleteChord等と同じ方針。Phase76-F）
    mergeSelection();
  });
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
mOv.addEventListener('click',e=>{if(e.target===mOv)closeMod();});
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
    if (e.ctrlKey && e.key === 'z') {
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

    // Escape: modal close を優先、次に diagLock 解除
    // INPUT/TEXTAREA フォーカス中でも diagLock 解除は動作させる
    if (e.key === 'Escape') {
      if (document.getElementById('modal-ov').classList.contains('open')) {
        closeMod();
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
      if (!inTextInput && e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteSelection();
      }
      if (!inTextInput && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSelection();
      }
    }

    // ArrowLeft/ArrowRight: 個別移動（解析編集モード中・選択中コードの左境界・Phase77で右境界から変更）
    if (isAnalysisEditing() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      const step  = e.shiftKey ? 0.5 : 0.1;
      const delta = (e.key === 'ArrowLeft') ? -step : step;
      shiftSelectedBoundary(delta);
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
      return (a.artist || '').localeCompare(b.artist || '', 'ja');
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