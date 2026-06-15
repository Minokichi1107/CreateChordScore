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
  PICKER_IDS
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

import { initDB, saveAsset, loadAsset } from './idb.js';

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

import { initChordEntry, openAddChord } from './chordEntry.js';

import { loadAnalysis, saveAnalysisFile, loadAnalysisFile } from './analysisLoader.js';

import {
  initChartMode,
  openChartMode,
  closeChartMode,
  updateChartPlayback,
  chartState,
  renderChartMode,
  setTooltipEnabled,
  getPerfState,
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

// Chart Mode 列数（localStorage永続）
let chartMeasuresPerRow = Number(localStorage.getItem('chartMeasuresPerRow')) || 3;
let chartDiagHover = localStorage.getItem('cs.chartDiagHover') !== '0'; // デフォルト ON

// モーダル要素
const mOv = document.getElementById('modal-ov');
const mTit = document.getElementById('m-title');
const mBody = document.getElementById('m-body');
const mBtns = document.getElementById('m-btns');

// TAPモードオーバーレイ
// tap mode state → tapmode.js に移動

// 自動保存タイマー
let asT = null;

// トーストタイマー
let toastT = null;

// ── asset loaded authority ────────────────────────────────────────────
// assetState: audio / chord のロード済み状態の唯一の authority（source of truth）
// DOM class / aEl.src / palette.length は assetState を「反映する」だけ。
// DOM 状態を authority として参照してはいけない（DOM = projection のみ）。
//
// restoreSettled:
//   通常は true。loadProj() 開始時だけ false にし、
//   async restore 完了後に true へ戻す。
//   false の間は _evaluateBannerState() が早期 return し、
//   transient phase でのバナー誤表示を防ぐ。
//   manual ingest は restore transaction ではないため、restoreSettled を操作しない。
let assetState = {
  audioLoaded:    false,
  chordLoaded:    false,
  restoreSettled: true,   // 通常状態は settled（loadProj 開始時だけ false）
};

// ----------------------------
// HELPER FUNCTIONS
// ----------------------------
function getCapo(){return parseInt(document.getElementById('capo').value)||0;}

// ── asset loaded authority API ────────────────────────────────────────
// [ASSET AUTHORITY INVARIANT]
// バナー表示・ボタン状態は assetState の純粋な projection（UI projection）。
// DOM class / aEl.src / palette.length を authority として参照してはいけない。
// この API を通じてのみ assetState を更新し、UI を同期させること。
// Phase65 で確立。将来の autosave restore / workspace reopen でも同一 API を使う。

/**
 * setAudioLoaded — audio asset のロード状態を更新し UI を同期する
 * @param {boolean} loaded
 * @param {string|null} filename
 * @param {{ silent?: boolean }} opts
 *   silent=true: _evaluateBannerState を呼ばない（resetProject 用）
 */
function setAudioLoaded(loaded, filename = null, { silent = false } = {}) {
  assetState.audioLoaded = loaded;
  const audioBtn = document.getElementById('audio-btn');
  const tapBtn   = document.getElementById('tap-btn');
  if (loaded && filename) {
    audioBtn.textContent = filename;
    audioBtn.classList.add('loaded');
    if (tapBtn) tapBtn.disabled = false;
  } else {
    audioBtn.textContent = 'クリックして選択';
    audioBtn.classList.remove('loaded');
    if (tapBtn) tapBtn.disabled = true;
  }
  if (!silent) _evaluateBannerState();
}

/**
 * setChordLoaded — chord asset のロード状態を更新し UI を同期する
 * @param {boolean} loaded
 * @param {string|null} filename
 * @param {{ silent?: boolean }} opts
 *   silent=true: _evaluateBannerState を呼ばない（resetProject 用）
 */
function setChordLoaded(loaded, filename = null, { silent = false } = {}) {
  assetState.chordLoaded = loaded;
  const chordBtn = document.getElementById('chord-btn');
  if (loaded && filename) {
    chordBtn.textContent = filename;
    chordBtn.classList.add('loaded');
  } else {
    chordBtn.textContent = 'JSON / CSV';
    chordBtn.classList.remove('loaded');
  }
  if (!silent) _evaluateBannerState();
}

/**
 * _evaluateBannerState — バナー表示要否を assetState から評価する（UI projection）
 *
 * [PROJECTION INVARIANT]
 * バナーの表示/非表示は assetState + project metadata の純粋な投影であり、
 * DOM 状態を authority として使ってはいけない。
 * restoreSettled=false の間（restore transaction 中）は評価をスキップし、
 * transient phase でのバナー誤表示・flicker を防ぐ。
 *
 * showReloadBanner は冒頭で既存バナーを remove してから生成するため
 * 連続呼び出しでも duplicate DOM は発生しない（idempotent）。
 */
function _evaluateBannerState() {
  // restore transaction 中は評価しない（両方の結果が出てから評価する）
  if (!assetState.restoreSettled) {
    return;
  }

  const audioNeeded = !!project.audio         && !assetState.audioLoaded;
  const chordNeeded = !!project.chord_source  && !assetState.chordLoaded;

  if (!audioNeeded && !chordNeeded) {
    const banner = document.getElementById('reload-banner');
    if (banner) banner.remove();
    return;
  }

  showReloadBanner(
    audioNeeded ? project.audio        : null,
    chordNeeded ? project.chord_source : null,
  );
}

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
  const btnChartDiag = document.getElementById('btn-toggle-chart-diag');
  if (!btnLeft || !btnRight) return;

  // 実際の表示状態を表示する（manual stateではない）
  // narrow時はauto-collapseにより manual=false でも closed になりうる
  const leftVisible = !document.body.classList.contains('left-collapsed');
  btnLeft.textContent     = (leftVisible     ? '✔ ' : '　') + '◧ 左パネル';
  btnRight.textContent    = (!rightHidden     ? '✔ ' : '　') + '◨ 右パネル';
  if (btnChartDiag) {
    btnChartDiag.textContent = (chartDiagHover ? '✔ ' : '　') + '♬ Chart コード図';
  }
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
  // chord-btn の表示更新は setChordLoaded() が担う（呼び出し側の責務）。
  // loadChordData は ingest 専用のため DOM 操作を行わない。
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
  project.analysis = await loadAnalysis(data.analysis ?? null);

  // analysis が存在すれば即保存
  if (data.analysis?.raw) {
    const ok = await saveAnalysisFile(project.id, data.analysis.raw);
    if (ok) {
      project.hasAnalysis = true;
    } else {
      console.warn('[analysis] failed to persist analysis file. Chart Mode will not survive reload.');
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
  // banner 評価は呼び出し側（setChordLoaded / async IIFE 末尾）が担う。
  // loadChordData は ingest 専用であり runtime authority の確立は行わない。
  renderImportBtn();
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
  
  // asset authority リセット（silent=true で _evaluateBannerState を抑制）
  // restoreSettled は loadProj 開始時に false にするため、ここでは true に戻す。
  assetState.restoreSettled = true;
  setAudioLoaded(false, null, { silent: true });
  setChordLoaded(false, null, { silent: true });
  
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
    const raw = await loadAnalysisFile(newProject.id);
    project.analysis = await loadAnalysis(raw ? { raw } : null);
    if (!project.analysis) showAnalysisMissingBanner();

  } else if (data.analysis?.raw) {
    // 旧形式 migration: 埋め込み analysis を外部ファイルへ移行
    console.info('[analysis] migrating embedded analysis to external file');
    await saveAnalysisFile(newProject.id, data.analysis.raw);
    newProject.hasAnalysis = true;   // ★ newProject も更新
    project.hasAnalysis    = true;
    project.analysis = await loadAnalysis(data.analysis);

  } else {
    // analysis なし
    project.analysis = null;
  }

  updateChartModeAvailability();

  // ボタン表示: ファイル名をセット（実際のロード済みかは async restore 後に確定）
  // loaded クラスはここでは付けない。assetState 経由で restore 後に確定させる。
  const audioBtn = document.getElementById('audio-btn');
  const chordBtn = document.getElementById('chord-btn');
  if (newProject.audio)        audioBtn.textContent = newProject.audio;
  if (newProject.chord_source) chordBtn.textContent = newProject.chord_source;

  refreshEditor();
  renderImportBtn();
  
  const curDiagChord = document.getElementById('diag-in').value.trim();
  if (curDiagChord) {
    showDiagramPanel(curDiagChord, getCapo(), getDiagCallbacks());
  }

  // IndexedDB から asset 復元
  // [RESTORE TRANSACTION]
  //   restoreSettled=false の間は _evaluateBannerState() が評価をスキップする。
  //   両方のアセットの restore 試行が完了した後に restoreSettled=true にして
  //   1回だけ banner 評価を行う。これにより transient phase でのバナー誤表示を防ぐ。
  assetState.restoreSettled = false;
  (async () => {
    // audio 復元
    const audioAsset = await loadAsset(project.id, 'audio').catch(() => null);
    if (audioAsset) {
      if (_aURL) URL.revokeObjectURL(_aURL);
      _aURL = URL.createObjectURL(audioAsset.data);
      aEl.src = _aURL;
      aEl.volume = parseFloat(document.getElementById('vol-slider')?.value || 80) / 100;
      // silent=true: restoreSettled=false なので _evaluateBannerState は走らない
      setAudioLoaded(true, audioAsset.filename, { silent: true });
    }

    // chord 復元
    const chordAsset = await loadAsset(project.id, 'chord').catch(() => null);
    if (chordAsset) {
      let chordData;
      if (chordAsset.filename.endsWith('.csv')) {
        chordData = parseCSV(chordAsset.data, normalizeChordName);
      } else {
        chordData = parseJSON(chordAsset.data);
      }
      if (chordData) {
        await loadChordData(chordData, chordAsset.filename, true);  // isRestore=true: capo reset をスキップ
        // loadChordData = ingest 専用。runtime authority はここで明示的に確立する。
        setChordLoaded(true, chordAsset.filename, { silent: true });
      }
    }

    // restore transaction 完了 → banner 評価を1回だけ実行
    assetState.restoreSettled = true;
    _evaluateBannerState();
  })();

  // TOKEN MIGRATION の結果を LocalStorage に即書き戻す。
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

// ════════════════════════════════════════
// 自動保存
// ════════════════════════════════════════
function autoSaveLocal(){
  clearTimeout(asT);
  asT = setTimeout(() => {
    const uiState = getUIState();
    const projectData = serializeProject(project, uiState);
    const result = saveToLocalStorage(projectData);
    if (result.success) {
      document.getElementById('st-save').textContent = result.timestamp;
    }
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
        aEl.volume = parseFloat(document.getElementById('vol-slider')?.value || 80) / 100;
        setAudioLoaded(true, file.name);   // assetState 更新 + UI 同期 + banner 評価
        toast(`音声: ${file.name}`);
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
        setChordLoaded(true, file.name);   // assetState 更新 + UI 同期 + banner 評価
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
      setChordLoaded(true, f.name);   // assetState 更新 + UI 同期 + banner 評価
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
    aEl.volume=parseFloat(document.getElementById('vol-slider')?.value||80)/100;
    setAudioLoaded(true, f.name);   // assetState 更新 + UI 同期 + banner 評価
    toast(`音声: ${f.name}`);
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
    // Ctrl+S: 保存
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      document.getElementById('btn-save').click();
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

    // Shift+D: Chart コード図 ON/OFF トグル
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      chartDiagHover = !chartDiagHover;
      localStorage.setItem('cs.chartDiagHover', chartDiagHover ? '1' : '0');
      setTooltipEnabled(chartDiagHover);
      toast(`Chart コード図: ${chartDiagHover ? 'ON' : 'OFF'}`);
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
  document.getElementById('perform-speed').addEventListener('input', e => {
    const speed = parseInt(e.target.value) / 100;
    aEl.playbackRate = speed;
    document.getElementById('perform-speed-label').textContent = `${e.target.value}%`;
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
    .addEventListener('click', closeChartMode);

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
  // 既存の btn-toggle-right の下に追加
  document.getElementById('btn-toggle-chart-diag')?.addEventListener('click', () => {
    chartDiagHover = !chartDiagHover;
    localStorage.setItem('cs.chartDiagHover', chartDiagHover ? '1' : '0');
    setTooltipEnabled(chartDiagHover);
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
}

// ----------------------------
// APP INITIALIZATION
// ----------------------------
window.addEventListener('DOMContentLoaded',()=>{
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
    }
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
    findChord:        findChord,
    drawDiagram:      (frets, barre, opts) => drawDiagram(frets, barre, opts),
    tooltipEnabled:   chartDiagHover,
  });

  // ② カスタムダイアグラム復元（右パネルに現在表示中のコードがあれば再描画）
  loadCustomDiagrams();
  const curDiagChord = document.getElementById('diag-in').value.trim();
  if(curDiagChord) showDiagramPanel(curDiagChord, getCapo(), getDiagCallbacks());

  
  // 自動保存データの復元
  // lines が空でも title / artist / audio / chord_source があれば復元対象とする。
  // （lines=[] のプロジェクトも作業中データとして扱う）
  const saved = loadFromLocalStorage();
  const hasSavedData = saved && saved.id && (
    (saved.lines && saved.lines.length > 0) ||
    saved.title || saved.artist || saved.audio || saved.chord_source
  );
  if (hasSavedData) {
    if (confirm(`前回の作業「${saved.title || '無題'}」(${(saved.lines||[]).length}行) を復元しますか？`)) {
      loadProj(saved);
      toast('自動保存データを復元しました');
    }
  }
  refreshEditor();renderPalette();
});


// ════════════════════════════════════════
// DEBUG API
// ════════════════════════════════════════
// [READ ONLY] 観測・診断専用。state mutation 禁止。
// 使い方（DevTools Console）:
//   window.__CS_DEBUG__.dumpInvariants()
//   window.__CS_DEBUG__.timing
//   window.__CS_DEBUG__.project
//   window.__CS_DEBUG__.chart
// 詳細: docs/debug-guide.md
// ────────────────────────────────────────
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
      assetState:   { ...assetState },
    };
  },

  get chart() {
    return {
      active:         chartState?.active ?? false,
      measuresPerRow: chartMeasuresPerRow,
    };
  },

  // perf instrumentation（Phase70-A）
  // chartmode.js が _perfState を所有・getPerfState() で getter projection。
  // __CS_DEBUG__.perf は state を持たない（timing/project/chart と同じ原則）。
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

    console.group('[Asset State]');
    console.log('audioLoaded:   ', p.assetState.audioLoaded,
                ' ←', p.audio ?? '(none)');
    console.log('chordLoaded:   ', p.assetState.chordLoaded,
                ' ←', p.chord_source ?? '(none)');
    console.log('restoreSettled:', p.assetState.restoreSettled);
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
    console.log('maxRAFDelta:   ', pf.maxRAFDelta, 'ms');
    console.log('longFrames:    ', pf.longFrames);
    console.log('longFrameLog:  ', pf.longFrameLog);
    console.groupEnd();

    console.groupEnd();
    return snapshot;
  },
};