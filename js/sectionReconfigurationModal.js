/**
 * Section reconfiguration Stage 1 modal (Phase150).
 * UI only — does not mutate analysisEditor.sections until onAdopt succeeds.
 */
import {
  draftSectionChordSpans,
  updateDraftSection,
  setDraftSectionEndByChordIndex,
  deleteDraftSectionAt,
  diagnoseDraftSection,
  diagnoseDraftSections,
  classifySectionDiagForUi,
  isDraftDirty,
  undoDraft,
  redoDraft,
  splitDraftAtChordIndex,
  mergeDraftWithPrevious,
} from './sectionReconfiguration.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const REASON_LABEL = {
  'missing-section': 'Sectionデータがありません',
  'invalid-section-id': 'IDが不正です',
  'invalid-section-type': '種類が不正です',
  'invalid-section-name': '名前が不正です',
  'missing-startChordId': '開始コードIDがありません',
  'missing-endChordId': '終了コードIDがありません',
  'start-chord-not-found': '開始コードが見つかりません',
  'end-chord-not-found': '終了コードが見つかりません',
  'start-not-found': '開始コードが見つかりません',
  'end-not-found': '終了コードが見つかりません',
  'start-after-end': '開始が終了より後です',
  'duplicate-section-id': 'Section IDが重複しています',
  'overlaps-previous': '前のSectionと重複しています',
  'gap-before': '前のSectionとの間に隙間があります',
  'first-section-not-at-start': '先頭Sectionが曲の開始にありません',
  'last-section-not-at-end': '末尾Sectionが曲の終端にありません',
  'not-in-time-order': '時間順になっていません',
  'section-invalid': '不正なSectionです',
  'last-section-end-fixed': '最後のSectionの終端は移動できません',
  'crosses-next-section-end': '次のSectionの終端を越える移動はできません',
  'no-room-for-next': '次のSectionの余地がありません',
  'end-before-start': '開始より前には設定できません',
  'section-too-short': 'Sectionは1コード以上必要です',
  'bad-index': 'Section番号が不正です',
  'bad-chord': 'コード位置が不正です',
  'section-not-in-order': '有効な隣接Sectionとして扱えません',
  'neighbour-invalid': '直後のSectionが不正なため境界を移動できません',
  'unlocated-invalid-section': '位置を特定できない不正Sectionがあるため境界を移動できません',
  'split-not-inside': '分割位置がSection内部ではありません',
  'no-previous-section': '結合する前のSectionがありません',
  'sections-overlap': 'Sectionが重複しているため結合できません',
  'gap-between-sections': 'Section間に隙間があるため結合できません',
  'incomplete-section-fields': '名称または種類が未設定のSectionがあります',
};

/**
 * @param {object} p
 * @param {Function} p.openModal
 * @param {Function} p.mkMBtn
 * @param {object} p.draft
 * @param {Array} p.buffer
 * @param {Array<{value:string,label:string}>} p.sectionTypes
 * @param {(draft:object)=>Promise<{ok:boolean,message?:string}>} p.onAdopt
 * @param {(reason:string)=>void} p.onClose
 * @param {(opts:{startSec:number,endSec:number})=>void} [p.onTestPlay]
 * @param {()=>void} [p.onTestStop]
 * @param {()=>void} [p.onKeyShield]
 * @param {()=>void} [p.onKeyUnshield]
 * @param {(msg:string, choices:{label:string,value:string}[])=>Promise<string>} [p.confirmChoice]
 */

/**
 * Build independent HTML banners for structural vs incomplete draft issues.
 * Pure (no DOM): returns '' | one banner | two banners concatenated.
 * @param {Array} diagList rows from diagnoseDraftSections()
 * @param {{ reasonLabel?: Record<string,string>, escapeHtml?: (s:any)=>string }} [opts]
 */
export function buildDraftIssueBannersHtml(diagList, opts = {}) {
  const escFn = opts.escapeHtml || (s => String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
  const RL = opts.reasonLabel || {};
  const label = (r) => RL[r] || r;
  const list = Array.isArray(diagList) ? diagList : [];
  const structural = list.filter(x => x && x.structurallyValid === false);
  const incomplete = list.filter(x => x && x.structurallyValid !== false && x.complete === false);
  const parts = [];
  if (structural.length) {
    const lines = structural.map(x => {
      const labels = (x.structuralReasons || x.reasons || []).map(label).join('、');
      const repair = x.repairableByBoundary
        ? '（境界の調整で修復できる場合があります）'
        : '（削除が必要です）';
      return `<li data-invalid-index="${x.index}">Section ${x.index + 1}: ${escFn(labels)}${repair}</li>`;
    }).join('');
    parts.push(`<div class="sr1-invalid" role="alert">
      <div class="sr1-invalid-title">構造的に不正なSectionがあります。採用前に解消してください。</div>
      <ul class="sr1-invalid-list">${lines}</ul>
    </div>`);
  }
  if (incomplete.length) {
    const lines = incomplete.map(x => {
      const labels = (x.completenessReasons || []).map(label).join('、');
      return `<li data-incomplete-index="${x.index}">Section ${x.index + 1}: ${escFn(labels || '名称または種類が未設定')}（採用前に入力してください）</li>`;
    }).join('');
    parts.push(`<div class="sr1-incomplete-banner" role="status">
      <div class="sr1-invalid-title">名称または種類が未設定のSectionがあります（編集は継続できます）。</div>
      <ul class="sr1-invalid-list">${lines}</ul>
    </div>`);
  }
  return parts.join('');
}

export function openSectionReconfigurationModal(p) {
  const {
    openModal, mkMBtn, draft, buffer, sectionTypes,
    onAdopt, onClose, onTestPlay, onTestStop, onKeyShield, onKeyUnshield, confirmChoice,
    generateSectionName, formatChord,
  } = p;

  let sectionIdx = 0;
  /** UI-only: name field typed this visit; not written to Draft until change/blur. */
  let nameInputSoftLock = false;
  /**
   * Play start position (blue). Click/arrows update immediately — no separate confirm.
   * playConfirmed is kept in sync for testPlay() start index.
   */
  let playCandidate = 0;
  let playConfirmed = 0;
  /** Index used when current testPlay() started; restored on end. */
  let playStartIdx = null;
  /** Number of chords to play (1..8). */
  let playChordCount = 4;
  let isPlaying = false;
  /** 'normal' | 'split' — orange marker is split-only (no independent boundary mode). */
  let uiMode = 'normal';
  /** Chord index: last chord of front half when splitting (splitDraftAtChordIndex). */
  let splitCandidate = null;
  /** Candidate at the moment split-position mode was entered; restored on cancel / play mode. */
  let splitCandidateAtModeEnter = null;
  /**
   * Split position = start chord index of the *new* (back) Section.
   * executeSplit maps to splitDraftAtChordIndex(..., endChordIndex = splitCandidate - 1).
   */
  /** Chord grid column count (PC base 6; responsive 3–4). */
  let gridCols = 6;
  /** Live playback highlight: buffer index of chord currently sounding (null if not playing). */
  let playingChordIdx = null;
  let busy = false;
  let message = '';
  let root = null;
  let closed = false;
  let keyHandler = null;
  let closing = false; // re-entrancy guard

  function spans() {
    return draftSectionChordSpans(draft, buffer);
  }

  function currentSpan() {
    const sp = spans();
    if (!sp.length) return null;
    if (sectionIdx >= sp.length) sectionIdx = sp.length - 1;
    if (sectionIdx < 0) sectionIdx = 0;
    return sp[sectionIdx] || null;
  }

  function ensurePlayInSection() {
    const s = currentSpan();
    if (!s || s.start < 0) { playCandidate = 0; playConfirmed = 0; return; }
    if (playCandidate < s.start || playCandidate > s.end) playCandidate = s.start;
    playConfirmed = playCandidate;
    if (splitCandidate != null) {
      const c = clampSplitCandidate(splitCandidate);
      // clampSplitCandidate is defined below; only adjust when out of range
      if (c != null) splitCandidate = c;
    }
  }

  function setPlayPos(idx) {
    const s = currentSpan();
    if (s && s.start >= 0) {
      playCandidate = Math.max(s.start, Math.min(s.end, idx));
    } else {
      playCandidate = Math.max(0, Math.min(buffer.length - 1, idx));
    }
    playConfirmed = playCandidate;
  }

  /** Valid split positions: first chord of back half → indices (start+1) .. end inclusive. */
  function clampSplitCandidate(idx) {
    const s = currentSpan();
    if (!s || s.start < 0 || s.end <= s.start) return null;
    return Math.max(s.start + 1, Math.min(s.end, idx));
  }

  function chordIndexAtTime(tSec) {
    if (!Number.isFinite(tSec) || !buffer.length) return null;
    for (let i = 0; i < buffer.length; i++) {
      const start = Number(buffer[i]?.start);
      if (!Number.isFinite(start)) continue;
      let end = Number(buffer[i]?.end);
      if (!Number.isFinite(end)) {
        const next = Number(buffer[i + 1]?.start);
        end = Number.isFinite(next) ? next : start + 1e6;
      }
      if (tSec >= start && tSec < end) return i;
    }
    // After last chord start
    const last = buffer.length - 1;
    const ls = Number(buffer[last]?.start);
    if (Number.isFinite(ls) && tSec >= ls) return last;
    return null;
  }

  function updatePlayingHighlight(idx) {
    if (!root) root = document.getElementById('sr1-root');
    if (!root) return;
    root.querySelectorAll('.sr1-chord.sr1-playing').forEach((el) => {
      el.classList.remove('sr1-playing');
      el.querySelector('.sr1-mark-playing')?.remove();
    });
    if (idx == null || idx < 0) return;
    const btn = root.querySelector(`.sr1-chord[data-i="${idx}"]`);
    if (!btn) return;
    btn.classList.add('sr1-playing');
    if (!btn.querySelector('.sr1-mark-playing')) {
      const mark = document.createElement('span');
      mark.className = 'sr1-mark sr1-mark-playing';
      mark.setAttribute('aria-hidden', 'true');
      btn.appendChild(mark);
    }
    try {
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch { /* ignore */ }
  }

  function resetPlayToSectionStart() {
    const s = currentSpan();
    if (!s || s.start < 0) { playCandidate = 0; playConfirmed = 0; return; }
    setPlayPos(s.start);
  }

  function stopPlayIfNeeded() {
    if (!isPlaying && playStartIdx == null) {
      playingChordIdx = null;
      onTestStop?.();
      return;
    }
    playingChordIdx = null;
    isPlaying = false;
    playStartIdx = null;
    onTestStop?.();
  }

  /** Stop playback before any Draft structure mutation. */
  function beforeStructuralEdit() {
    stopPlayIfNeeded();
    applyNameTypeFromInputs();
  }

  function chordLabel(c) {
    if (!c) return '?';
    if (typeof formatChord === 'function') {
      try { return formatChord(c); } catch { /* fall through */ }
    }
    if (c.chord) return String(c.chord);
    return '(空)';
  }

  function invalidBannerHtml() {
    return buildDraftIssueBannersHtml(diagnoseDraftSections(draft, buffer), {
      reasonLabel: REASON_LABEL,
      escapeHtml: esc,
    });
  }

  function computeGridCols() {
    // PC base 6; narrow ~3–4. Prefer host width when available.
    let w = 900;
    try {
      const host = document.getElementById('sr1-root') || document.getElementById('m-body');
      if (host && host.clientWidth) w = host.clientWidth;
      else if (typeof window !== 'undefined' && window.innerWidth) w = window.innerWidth;
    } catch (_) { /* ignore */ }
    if (w < 480) return 3;
    if (w < 720) return 4;
    return 6;
  }

  function sectionPanelHtml() {
    const sec = draft.sections[sectionIdx];
    if (!sec) return '<p class="sag-errors">Section がありません</p>';
    const diagList = diagnoseDraftSections(draft, buffer);
    const diag = diagList[sectionIdx] || diagnoseDraftSection(sec, buffer);
    const typeOpts = (sectionTypes || []).map(t =>
      `<option value="${esc(t.value)}" ${t.value === sec.type ? 'selected' : ''}>${esc(t.label)}</option>`
    ).join('');
    const kind = classifySectionDiagForUi(diag);
    let invalidNote = '';
    if (kind === 'structural-invalid') {
      invalidNote = `<div class="sr1-sec-invalid">構造的に不正: ${esc((diag.structuralReasons || diag.reasons || []).map(r => REASON_LABEL[r] || r).join('、'))}
       <button type="button" class="sec-btn sr1-danger" id="sr1-delete-sec">削除</button></div>`;
    } else if (kind === 'incomplete-fields') {
      invalidNote = `<div class="sr1-sec-incomplete">名称・種類が未設定（採用前に入力）</div>`;
    }
    const playOn = uiMode === 'normal';
    const splitOn = uiMode === 'split';
    return `
      <div class="sr1-header">
        <div class="sr1-header-left">
          <span class="sr1-sec-idx">Section ${sectionIdx + 1} / ${draft.sections.length}</span>
          <label class="sr1-field sr1-field-inline">名前
            <input type="text" class="mi sr1-name" value="${esc(sec.name)}" autocomplete="off" />
          </label>
          <label class="sr1-field sr1-field-inline">種類
            <select class="mi sr1-type">${typeOpts}</select>
          </label>
        </div>
        <div class="sr1-mode-toggle" role="group" aria-label="操作対象">
          <button type="button" class="sr1-mode-btn sr1-mode-play ${playOn ? 'is-active' : ''}" id="sr1-mode-play" aria-pressed="${playOn}">
            <span class="sr1-leg-play"></span>再生位置
          </button>
          <button type="button" class="sr1-mode-btn sr1-mode-split ${splitOn ? 'is-active' : ''}" id="sr1-mode-split" aria-pressed="${splitOn}">
            <span class="sr1-leg-bound"></span>分割位置
          </button>
        </div>
        ${invalidNote}
      </div>`;
  }

  function chordsHtml() {
    const sp = spans();
    const active = sp[sectionIdx];
    const structOk = active && active.start >= 0 && active.end >= active.start;
    const boundaryEnds = new Set(sp.filter(s => s.start >= 0 && s.end >= s.start).map(s => s.end));
    gridCols = computeGridCols();
    const cols = gridCols;
    const n = buffer.length;
    const rows = Math.max(1, Math.ceil(n / cols));
    const rowHtml = [];
    for (let r = 0; r < rows; r++) {
      const cells = [];
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (i >= n) {
          cells.push('<span class="sr1-chord-spacer" aria-hidden="true"></span>');
          continue;
        }
        const chord = buffer[i];
        const inSec = structOk && i >= active.start && i <= active.end;
        const isPlay = i === playCandidate;
        const isSplitCand = uiMode === 'split' && splitCandidate === i;
        const isPlayingChord = playingChordIdx === i;
        const isBoundary = boundaryEnds.has(i);
        const cls = [
          'sr1-chord',
          inSec ? 'sr1-in-sec' : '',
          isPlay ? 'sr1-play-cand sr1-play-conf' : '',
          isSplitCand ? 'sr1-split-cand' : '',
          isPlayingChord ? 'sr1-playing' : '',
          isBoundary ? 'sr1-boundary' : '',
        ].filter(Boolean).join(' ');
        const markers = [
          isPlay ? '<span class="sr1-mark sr1-mark-play" aria-hidden="true"></span>' : '',
          isSplitCand ? '<span class="sr1-mark sr1-mark-split" aria-hidden="true"></span>' : '',
          isPlayingChord ? '<span class="sr1-mark sr1-mark-playing" aria-hidden="true"></span>' : '',
        ].join('');
        cells.push(
          `<button type="button" class="${cls}" data-i="${i}" role="option" aria-selected="${isPlay}">` +
          `<span class="sr1-chord-label">${esc(chordLabel(chord))}</span>${markers}</button>`
        );
      }
      rowHtml.push(
        `<div class="sr1-chord-row" role="presentation">` +
        `<span class="sr1-row-num" aria-hidden="true">${r + 1}</span>` +
        `<div class="sr1-chord-row-cells" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${cells.join('')}</div></div>`
      );
    }
    return `<div class="sr1-chords-wrap"><div class="sr1-chord-grid" tabindex="0" role="listbox" aria-label="コード進行">${rowHtml.join('')}</div></div>`;
  }

  function playHintHtml() {
    const sp = currentSpan();
    const endIdx = (sp && sp.start >= 0)
      ? Math.min(sp.end, playConfirmed + playChordCount - 1)
      : playConfirmed;
    let modeNote = '';
    if (uiMode === 'split') {
      modeNote = '<div class="sr1-mode-banner sr1-mode-split" role="status">分割位置の変更中 — 「分割」で実行、「キャンセル」で開始時の位置に戻します</div>';
    }
    return `${modeNote}`;
  }

  function bodyHtml() {
    const canUndo = (draft.undoStack?.length || 0) > 0;
    const canRedo = (draft.redoStack?.length || 0) > 0;
    const splitOn = uiMode === 'split';
    const canSplitExec = splitOn && splitCandidate != null;
    return `
      <div id="sr1-root" class="sr1-root">
        ${sectionPanelHtml()}
        ${invalidBannerHtml()}
        ${playHintHtml()}
        ${chordsHtml()}
        <div class="sr1-panels">
          <section class="sr1-panel sr1-panel-play ${!splitOn ? 'is-active' : ''}" aria-label="再生位置">
            <h4 class="sr1-panel-title">再生位置${!splitOn ? '<span class="sr1-active-tag" aria-label="操作中">操作中</span>' : ''}</h4>
            <div class="sr1-panel-actions">
              <button type="button" class="sec-btn" id="sr1-play-left" title="再生位置を左へ">←</button>
              <button type="button" class="sec-btn" id="sr1-play-right" title="再生位置を右へ">→</button>
              <button type="button" class="sec-btn" id="sr1-play">テスト再生</button>
              <label class="sr1-play-count-field">
                <span class="sr1-play-count-label">長さ（コード数）</span>
                <input type="number" class="mi sr1-play-count" min="1" max="8" value="${playChordCount}" />
              </label>
            </div>
          </section>
          <section class="sr1-panel sr1-panel-bound ${splitOn ? 'is-active' : ''}" aria-label="分割位置">
            <h4 class="sr1-panel-title">分割位置${splitOn ? '<span class="sr1-active-tag" aria-label="操作中">操作中</span>' : ''}</h4>
            <div class="sr1-panel-actions">
              <button type="button" class="sec-btn" id="sr1-split-left" title="分割位置を左へ" ${splitOn ? '' : 'disabled'}>←</button>
              <button type="button" class="sec-btn" id="sr1-split-right" title="分割位置を右へ" ${splitOn ? '' : 'disabled'}>→</button>
              <button type="button" class="sec-btn" id="sr1-split-edit">分割位置を変更</button>
              <button type="button" class="sec-btn sr1-btn-split-primary" id="sr1-split-exec" ${canSplitExec ? '' : 'disabled'}>分割</button>
              <button type="button" class="sec-btn" id="sr1-split-cancel" ${splitOn ? '' : 'disabled'}>キャンセル</button>
            </div>
          </section>
        </div>
        <div class="sr1-aux-toolbar" aria-label="構造編集">
          <button type="button" class="sec-btn" id="sr1-prev-sec" ${sectionIdx <= 0 ? 'disabled' : ''}>← Section</button>
          <button type="button" class="sec-btn" id="sr1-next-sec" ${sectionIdx >= draft.sections.length - 1 ? 'disabled' : ''}>Section →</button>
          <button type="button" class="sec-btn" id="sr1-merge" ${sectionIdx <= 0 ? 'disabled' : ''}>前と結合</button>
          <button type="button" class="sec-btn" id="sr1-undo" ${canUndo ? '' : 'disabled'}>Undo</button>
          <button type="button" class="sec-btn" id="sr1-redo" ${canRedo ? '' : 'disabled'}>Redo</button>
        </div>
        <div id="sr1-msg" class="sag-errors sr1-msg" role="status">${esc(message)}</div>
        <p class="sr1-keys-hint">クリックで位置選択 · ←→ 移動 · Space 再生 · Esc 分割キャンセル／閉じる</p>
      </div>`;
  }

  function fullRedraw() {
    if (closed) return;
    const host = document.getElementById('sr1-root');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = bodyHtml();
    const next = wrap.firstElementChild;
    host.replaceWith(next);
    root = next;
    bind();
    scrollCursorIntoView();
  }

  function scrollCursorIntoView() {
    root?.querySelector('.sr1-play-cand, .sr1-split-cand')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function applyNameTypeFromInputs() {
    const nameEl = root?.querySelector('.sr1-name');
    const typeEl = root?.querySelector('.sr1-type');
    const sec = draft.sections[sectionIdx];
    if (!sec) return;
    const patch = {};
    const opts = {};
    if (nameEl && nameEl.value !== sec.name) {
      patch.name = nameEl.value;
      opts.fromUserNameEdit = true;
    }
    if (typeEl && typeEl.value !== sec.type) {
      patch.type = typeEl.value;
      // Only auto-rename when the user has not locked the name
      if (!sec.nameUserEdited && !nameInputSoftLock && typeof generateSectionName === 'function') {
        opts.defaultNameForType = generateSectionName;
      }
    }
    if (Object.keys(patch).length) {
      updateDraftSection(draft, sec.id, patch, opts);
    }
    // Always clear soft lock after processing the name field for this section.
    // Even when the typed value equals the Draft name (no patch.name / no undo),
    // the lock must not carry over to another section or block later auto-naming.
    nameInputSoftLock = false;
  }

  /** Live type change: update name immediately when not user-edited */
  function onTypeChangeLive() {
    const typeEl = root?.querySelector('.sr1-type');
    const nameEl = root?.querySelector('.sr1-name');
    const sec = draft.sections[sectionIdx];
    if (!sec || !typeEl) return;
    const newType = typeEl.value;
    if (newType === sec.type) return;
    const opts = {};
    const patch = { type: newType };
    const nameLocked = !!sec.nameUserEdited || nameInputSoftLock;
    if (!nameLocked && typeof generateSectionName === 'function') {
      opts.defaultNameForType = generateSectionName;
    }
    updateDraftSection(draft, sec.id, patch, opts);
    // Reflect new name into the input without marking as user-edited again
    if (nameEl && !draft.sections[sectionIdx].nameUserEdited && !nameInputSoftLock) {
      nameEl.value = draft.sections[sectionIdx].name;
    }
  }

  function deleteCurrentInvalid() {
    beforeStructuralEdit();
    const sec = draft.sections[sectionIdx];
    if (!sec) return;
    const diagList = diagnoseDraftSections(draft, buffer);
    const diag = diagList[sectionIdx];
    if (!diag || diag.structurallyValid) {
      message = '構造的に有効なSectionの削除はStage1では行いません';
      fullRedraw();
      return;
    }
    const r = deleteDraftSectionAt(draft, sectionIdx);
    if (!r.ok) {
      message = `削除できません（${REASON_LABEL[r.reason] || r.reason}）`;
    } else {
      message = '不正SectionをDraftから削除しました';
      if (sectionIdx >= draft.sections.length) sectionIdx = Math.max(0, draft.sections.length - 1);
      resetPlayToSectionStart();
    }
    fullRedraw();
  }

  function testPlay() {
    applyNameTypeFromInputs();
    const sp = currentSpan();
    if (!sp || sp.start < 0) return;
    ensurePlayInSection();
    const startIdx = playConfirmed;
    const endIdx = Math.min(sp.end, startIdx + playChordCount - 1);
    const c0 = buffer[startIdx];
    const c1 = buffer[endIdx];
    const startSec = Number(c0?.start);
    const endSec = Number(c1?.end ?? c1?.start);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      message = 'このコードに再生用の時刻がありません';
      fullRedraw();
      return;
    }
    // Capture start index for this playback session (not mutated by mid-play confirm)
    playStartIdx = startIdx;
    isPlaying = true;
    playCandidate = startIdx;
    playingChordIdx = startIdx;
    fullRedraw();
    const finishPlay = () => {
      isPlaying = false;
      playingChordIdx = null;
      if (playStartIdx != null) playCandidate = playStartIdx;
      playStartIdx = null;
      if (!closed) fullRedraw();
      else updatePlayingHighlight(null);
    };
    onTestPlay?.({
      startSec,
      endSec,
      onEnded: finishPlay,
      onTime: (tSec) => {
        if (closed || !isPlaying) return;
        const idx = chordIndexAtTime(tSec);
        if (idx !== playingChordIdx) {
          playingChordIdx = idx;
          updatePlayingHighlight(idx);
        }
      },
    });
  }

  function enterSplitMode() {
    stopPlayIfNeeded();
    applyNameTypeFromInputs();
    const sp = currentSpan();
    // splitCandidate = start of back Section (next-section start). Front ends at splitCandidate-1.
    if (!sp || sp.start < 0 || sp.end <= sp.start) {
      message = 'この Section は分割できません';
      fullRedraw();
      return;
    }
    // Keep existing split position when switching modes; do not derive from play position.
    let next = splitCandidate != null ? clampSplitCandidate(splitCandidate) : null;
    if (next == null) {
      // Default: mid-section start of back half (not play position)
      next = clampSplitCandidate(Math.floor((sp.start + sp.end + 1) / 2));
    }
    if (uiMode !== 'split') {
      splitCandidate = next;
      splitCandidateAtModeEnter = next;
    } else if (splitCandidate == null) {
      splitCandidate = next;
      splitCandidateAtModeEnter = next;
    } else {
      splitCandidate = clampSplitCandidate(splitCandidate);
    }
    uiMode = 'split';
    message = '分割位置は次のSectionの開始コードです（「分割」で実行）';
    fullRedraw();
  }

  /** Move candidate only while already in split-position mode. Does not enter mode. */
  function moveSplitCandidate(delta) {
    if (uiMode !== 'split' || splitCandidate == null) return;
    const next = clampSplitCandidate(splitCandidate + delta);
    if (next == null) return;
    splitCandidate = next;
    fullRedraw();
  }

  /** Cancel split-position editing: restore candidate at mode enter, leave mode. No Section change. */
  function cancelSplitMode() {
    if (uiMode === 'split') {
      splitCandidate = splitCandidateAtModeEnter;
    }
    uiMode = 'normal';
    splitCandidate = null;
    splitCandidateAtModeEnter = null;
    message = '';
    fullRedraw();
  }

  /** Switch to play mode; same cancel semantics for pending split-position edits. */
  function enterPlayMode() {
    if (uiMode === 'split') {
      splitCandidate = splitCandidateAtModeEnter;
      splitCandidate = null;
      splitCandidateAtModeEnter = null;
    }
    uiMode = 'normal';
    message = '';
    fullRedraw();
  }

  function executeSplit() {
    beforeStructuralEdit();
    if (splitCandidate == null) {
      message = '分割位置を選択してください';
      fullRedraw();
      return;
    }
    // UI stores next-section start; API wants last chord of front half
    const endChordIndex = splitCandidate - 1;
    const r = splitDraftAtChordIndex(draft, sectionIdx, endChordIndex, buffer);
    if (!r.ok) {
      message = `分割できません（${REASON_LABEL[r.reason] || r.reason}）`;
      fullRedraw();
      return;
    }
    uiMode = 'normal';
    splitCandidate = null;
    splitCandidateAtModeEnter = null;
    sectionIdx = r.backIndex;
    resetPlayToSectionStart();
    message = '分割しました。後半Sectionの名称・種類を入力してください';
    fullRedraw();
  }

  async function mergeWithPrevious() {
    beforeStructuralEdit();
    const list = diagnoseDraftSections(draft, buffer);
    const cur = list[sectionIdx];
    if (!cur || !cur.structurallyValid) {
      message = '現在のSectionを結合できません';
      fullRedraw();
      return;
    }
    const positioned = list.filter(r => r.structurallyValid && r.start >= 0)
      .slice().sort((a, b) => a.start - b.start || a.index - b.index);
    const ord = positioned.findIndex(r => r.index === sectionIdx);
    if (ord <= 0) {
      message = '前のSectionがありません';
      fullRedraw();
      return;
    }
    const prev = positioned[ord - 1];
    const prevSec = draft.sections[prev.index];
    const curSec = draft.sections[sectionIdx];
    const msg = `次のSectionを結合しますか？\n\n前: ${prevSec.name || '(名称未設定)'} [${prev.start + 1}〜${prev.end + 1}]\n現在: ${curSec.name || '(名称未設定)'} [${cur.start + 1}〜${cur.end + 1}]`;
    const choice = await (confirmChoice
      ? confirmChoice(msg, [{ label: '結合', value: 'ok' }, { label: 'キャンセル', value: 'cancel' }])
      : (window.confirm(msg.replace(/\\n/g, '\n')) ? 'ok' : 'cancel'));
    if (choice !== 'ok') return;
    const r = mergeDraftWithPrevious(draft, sectionIdx, buffer);
    if (!r.ok) {
      message = `結合できません（${REASON_LABEL[r.reason] || r.reason}）`;
      fullRedraw();
      return;
    }
    sectionIdx = r.mergedIndex;
    resetPlayToSectionStart();
    message = '結合しました';
    fullRedraw();
  }

  /** Listener / playback / shield only — does not touch parent Draft state. */
  function cleanupListeners() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    onKeyUnshield?.();
    onTestStop?.();
  }

  /**
   * Unified close. Idempotent.
   * @param {'cancel'|'adopt'|'esc'|'external'} reason
   * @param {{skipConfirm?:boolean}} [opts]
   * @returns {Promise<boolean>} true if closed
   */
  async function requestClose(reason, opts = {}) {
    if (closed) return true;
    if (closing) return false;
    closing = true;
    try {
      if (reason === 'adopt') {
        closed = true;
        cleanupListeners();
        onClose?.(reason);
        return true;
      }

      // F3: flush in-progress name/type before dirty check
      applyNameTypeFromInputs();

      if (!opts.skipConfirm && isDraftDirty(draft)) {
        const choice = confirmChoice
          ? await confirmChoice('Section設定の変更を破棄して閉じますか？', [
              { label: '破棄して閉じる', value: 'discard' },
              { label: '編集を続ける', value: 'stay' },
            ])
          : (window.confirm('Section設定の変更を破棄して閉じますか？') ? 'discard' : 'stay');
        if (choice !== 'discard') {
          closing = false;
          return false;
        }
      }
      closed = true;
      cleanupListeners();
      onClose?.(reason);
      return true;
    } finally {
      if (!closed) closing = false;
    }
  }

  function onKeyDown(e) {
    if (closed || !document.getElementById('sr1-root')) return;
    const tag = (e.target && e.target.tagName) || '';
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Esc — cancel split mode first; otherwise close path
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (uiMode === 'split') {
        cancelSplitMode();
        return;
      }
      requestClose('esc').then(() => {});
      return;
    }

    // Tab / Shift+Tab move section even when focus is in name/type fields
    if (e.code === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      applyNameTypeFromInputs();
      nameInputSoftLock = false;
      stopPlayIfNeeded();
      if (uiMode === 'split') cancelSplitMode();
      if (e.shiftKey) sectionIdx = Math.max(0, sectionIdx - 1);
      else sectionIdx = Math.min(Math.max(0, draft.sections.length - 1), sectionIdx + 1);
      resetPlayToSectionStart();
      fullRedraw();
      return;
    }

    if (inField) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        beforeStructuralEdit();
        if (undoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        e.stopPropagation();
        beforeStructuralEdit();
        if (redoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      testPlay();
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.code === 'ArrowLeft' ? -1 : 1;
      if (uiMode === 'split') {
        moveSplitCandidate(delta);
      } else {
        setPlayPos(playCandidate + delta);
        fullRedraw();
      }
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (uiMode === 'split') executeSplit();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ['x', 'X', 'v', 'V', 'z', 'Z', 'y', 'Y'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        beforeStructuralEdit();
        if (undoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
      } else if ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
        beforeStructuralEdit();
        if (redoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
      }
    }
  }

  function bind() {
    root = document.getElementById('sr1-root');
    if (!root) return;
    root.querySelectorAll('.sr1-chord').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        if (uiMode === 'split') {
          const next = clampSplitCandidate(i);
          if (next == null) {
            message = 'この位置では分割できません';
            fullRedraw();
            return;
          }
          splitCandidate = next;
          message = `分割位置: コード ${splitCandidate + 1}（ここから次のSection）`;
          fullRedraw();
          return;
        }
        // Normal: blue play position moves immediately (no confirm)
        setPlayPos(i);
        fullRedraw();
      });
    });
    root.querySelector('#sr1-prev-sec')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      if (uiMode === 'split') cancelSplitMode();
      sectionIdx = Math.max(0, sectionIdx - 1);
      resetPlayToSectionStart();
      fullRedraw();
    });
    root.querySelector('#sr1-next-sec')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      if (uiMode === 'split') cancelSplitMode();
      sectionIdx = Math.min(Math.max(0, draft.sections.length - 1), sectionIdx + 1);
      resetPlayToSectionStart();
      fullRedraw();
    });
    root.querySelector('#sr1-play')?.addEventListener('click', testPlay);
    root.querySelector('#sr1-play-left')?.addEventListener('click', () => {
      setPlayPos(playCandidate - 1);
      fullRedraw();
    });
    root.querySelector('#sr1-play-right')?.addEventListener('click', () => {
      setPlayPos(playCandidate + 1);
      fullRedraw();
    });
    root.querySelector('.sr1-play-count')?.addEventListener('change', (ev) => {
      let n = Number(ev.target.value);
      if (!Number.isFinite(n)) n = 4;
      playChordCount = Math.max(1, Math.min(8, Math.round(n)));
      ev.target.value = String(playChordCount);
      fullRedraw();
    });
    root.querySelector('#sr1-mode-play')?.addEventListener('click', () => enterPlayMode());
    root.querySelector('#sr1-mode-split')?.addEventListener('click', () => enterSplitMode());
    root.querySelector('#sr1-split-edit')?.addEventListener('click', () => enterSplitMode());
    root.querySelector('#sr1-split-exec')?.addEventListener('click', () => executeSplit());
    root.querySelector('#sr1-split-left')?.addEventListener('click', () => moveSplitCandidate(-1));
    root.querySelector('#sr1-split-right')?.addEventListener('click', () => moveSplitCandidate(1));
    root.querySelector('#sr1-split-cancel')?.addEventListener('click', () => cancelSplitMode());
    root.querySelector('#sr1-merge')?.addEventListener('click', () => { mergeWithPrevious(); });
    root.querySelector('#sr1-undo')?.addEventListener('click', () => {
      beforeStructuralEdit();
      if (undoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
    });
    root.querySelector('#sr1-redo')?.addEventListener('click', () => {
      beforeStructuralEdit();
      if (redoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
    });
    root.querySelector('#sr1-delete-sec')?.addEventListener('click', deleteCurrentInvalid);
    root.querySelector('.sr1-name')?.addEventListener('change', () => applyNameTypeFromInputs());
    root.querySelector('.sr1-type')?.addEventListener('change', () => onTypeChangeLive());
    root.querySelector('.sr1-name')?.addEventListener('input', () => {
      // Soft-lock auto type→name in UI only. Do NOT mutate Draft.sections here —
      // nameUserEdited is committed on change/blur via applyNameTypeFromInputs
      // (single undo entry). Avoids dirtying undo baselines on every keystroke.
      nameInputSoftLock = true;
    });
  }

  resetPlayToSectionStart();
  onKeyShield?.();
  keyHandler = onKeyDown;

  openModal({
    title: 'Section設定',
    body: bodyHtml(),
    // Outside click must not close. Escape may be routed here with source==='escape'.
    onRequestClose: (source) => {
      if (source === 'overlay' || source == null || source === 'unknown') {
        return; // outside click / unknown — ignore
      }
      if (source === 'escape') {
        requestClose('esc').then((ok) => {
          // closeMod is performed by parent closeSectionReconfiguration onClose path
        });
      }
    },
    onOpen: () => {
      // F1: if already closed (e.g. project switch during 80ms delay), do not register
      if (closed) return;
      root = document.getElementById('sr1-root');
      bind();
      if (keyHandler) document.addEventListener('keydown', keyHandler, true);
      scrollCursorIntoView();
    },
    buttons: (close) => {
      const cancelBtn = mkMBtn('キャンセル', '', async () => {
        if (busy || closed) return;
        applyNameTypeFromInputs();
        const ok = await requestClose('cancel');
        if (ok) close();
      });
      const adoptBtn = mkMBtn('採用', 'ok', async () => {
        if (busy || closed) return;
        applyNameTypeFromInputs();
        busy = true;
        adoptBtn.disabled = true;
        const result = await onAdopt(draft);
        busy = false;
        if (result?.ok) {
          await requestClose('adopt', { skipConfirm: true });
          close();
          return;
        }
        message = result?.message ?? '採用できませんでした';
        adoptBtn.disabled = false;
        fullRedraw();
      });
      return [cancelBtn, adoptBtn];
    },
  });

  /**
   * Parent-facing API:
   * - cleanup(): remove listeners / stop play / unshield only (no confirm, no onClose)
   * - forceClose(): cleanup + onClose('external') for project switch
   */
  return {
    cleanup: () => {
      if (closed && !keyHandler) return;
      closed = true;
      cleanupListeners();
    },
    forceClose: () => {
      if (closed && !keyHandler) {
        onClose?.('external');
        return Promise.resolve(true);
      }
      return requestClose('external', { skipConfirm: true });
    },
  };
}
