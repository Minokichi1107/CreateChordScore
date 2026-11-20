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
  /** Play candidate (click/arrow); never used as Section boundary. */
  let playCandidate = 0;
  /** Confirmed play start chord index. */
  let playConfirmed = 0;
  /** Index used when current testPlay() started; restored on end. */
  let playStartIdx = null;
  /** Number of chords to play (1..8). */
  let playChordCount = 4;
  let isPlaying = false;
  /** 'normal' | 'boundary' | 'split' */
  let uiMode = 'normal';
  /** Boundary selection: last chord of current section (B-method). */
  let boundaryCandidate = null;
  /** Chord index for split front-end (within current section). */
  let splitCandidate = null;
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
    if (playConfirmed < s.start || playConfirmed > s.end) playConfirmed = s.start;
    if (boundaryCandidate != null && (boundaryCandidate < s.start || boundaryCandidate > s.end)) {
      boundaryCandidate = s.end;
    }
  }

  function resetPlayToSectionStart() {
    const s = currentSpan();
    if (!s || s.start < 0) { playCandidate = 0; playConfirmed = 0; return; }
    playCandidate = s.start;
    playConfirmed = s.start;
  }

  function stopPlayIfNeeded() {
    if (!isPlaying && playStartIdx == null) {
      onTestStop?.();
      return;
    }
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
    return `
      <div class="sr1-section-meta">
        <span class="sr1-sec-idx">Section ${sectionIdx + 1} / ${draft.sections.length}</span>
        <label class="sr1-field sr1-field-inline">名前
          <input type="text" class="mi sr1-name" value="${esc(sec.name)}" autocomplete="off" />
        </label>
        <label class="sr1-field sr1-field-inline">種類
          <select class="mi sr1-type">${typeOpts}</select>
        </label>
        ${invalidNote}
      </div>`;
  }

  function chordsHtml() {
    const sp = spans();
    const active = sp[sectionIdx];
    const structOk = active && active.start >= 0 && active.end >= active.start;
    const boundaryEnds = new Set(sp.filter(s => s.start >= 0 && s.end >= s.start).map(s => s.end));
    return `<div class="sr1-chords-wrap">
      <div class="sr1-chords" tabindex="0" role="listbox" aria-label="コード進行">
      ${buffer.map((c, i) => {
        const inSec = structOk && i >= active.start && i <= active.end;
        const isPlayCand = i === playCandidate;
        const isPlayConf = i === playConfirmed;
        const isBoundCand = uiMode === 'boundary' && boundaryCandidate === i;
        const isSplitCand = uiMode === 'split' && splitCandidate === i;
        const isBoundary = boundaryEnds.has(i);
        const cls = [
          'sr1-chord',
          inSec ? 'sr1-in-sec' : '',
          isPlayCand ? 'sr1-play-cand' : '',
          isPlayConf ? 'sr1-play-conf' : '',
          isBoundCand ? 'sr1-bound-cand' : '',
          isSplitCand ? 'sr1-split-cand' : '',
          isBoundary ? 'sr1-boundary' : '',
        ].filter(Boolean).join(' ');
        const markers = [
          isPlayConf || isPlayCand ? '<span class="sr1-mark sr1-mark-play" aria-hidden="true"></span>' : '',
          isBoundCand ? '<span class="sr1-mark sr1-mark-bound" aria-hidden="true"></span>' : '',
          isSplitCand ? '<span class="sr1-mark sr1-mark-split" aria-hidden="true"></span>' : '',
        ].join('');
        return `<button type="button" class="${cls}" data-i="${i}" role="option" aria-selected="${isPlayCand}"><span class="sr1-chord-label">${esc(chordLabel(c))}</span>${markers}</button>`;
      }).join('')}
      </div>
    </div>`;
  }

  function playHintHtml() {
    const sp = currentSpan();
    const endIdx = (sp && sp.start >= 0)
      ? Math.min(sp.end, playConfirmed + playChordCount - 1)
      : playConfirmed;
    let modeNote = '';
    if (uiMode === 'split') {
      modeNote = '<div class="sr1-mode-banner" role="status">分割位置を選択中 — 前半の最後のコードをクリックし「分割実行」。Escでキャンセル</div>';
    } else if (uiMode === 'boundary') {
      modeNote = '<div class="sr1-mode-banner sr1-mode-boundary" role="status">境界選択中 — Sectionに含める最後のコードを選び「境界を確定」。Escでキャンセル</div>';
    }
    const sec = draft.sections[sectionIdx];
    const secLabel = sec ? (sec.name || '（名称未設定）') : '';
    return `${modeNote}
      <div class="sr1-status-bar">
        <span class="sr1-status-play">再生 ${playChordCount}コード · 開始 #${playConfirmed + 1}（候補 #${playCandidate + 1}）→ #${endIdx + 1}</span>
        <span class="sr1-status-sec">Section ${sectionIdx + 1}/${draft.sections.length} ${esc(secLabel)}</span>
        <span class="sr1-legend"><span class="sr1-leg-play"></span>再生位置 <span class="sr1-leg-bound"></span>境界候補</span>
      </div>`;
  }

  function bodyHtml() {
    const canUndo = (draft.undoStack?.length || 0) > 0;
    const canRedo = (draft.redoStack?.length || 0) > 0;
    const boundActive = uiMode === 'boundary';
    return `
      <div id="sr1-root" class="sr1-root">
        <p class="sr1-lead">コード進行を確認し、再生位置と Section 境界を設定します。採用するまで保存済み Section は変わりません。</p>
        ${sectionPanelHtml()}
        ${invalidBannerHtml()}
        ${playHintHtml()}
        ${chordsHtml()}
        <div class="sr1-panels">
          <section class="sr1-panel sr1-panel-play" aria-label="再生位置の設定">
            <h4 class="sr1-panel-title">再生位置の設定</h4>
            <p class="sr1-panel-desc">コードをクリックして開始位置を選び、「再生位置決定」で確定します。</p>
            <div class="sr1-panel-actions">
              <button type="button" class="sec-btn" id="sr1-play-left" title="再生位置候補を左へ">←</button>
              <button type="button" class="sec-btn" id="sr1-play-right" title="再生位置候補を右へ">→</button>
              <button type="button" class="sec-btn sr1-btn-play-primary" id="sr1-play-confirm">再生位置決定</button>
              <button type="button" class="sec-btn" id="sr1-play">テスト再生</button>
              <label class="sr1-field sr1-field-inline">コード数
                <input type="number" class="mi sr1-play-count" min="1" max="8" value="${playChordCount}" />
              </label>
            </div>
          </section>
          <section class="sr1-panel sr1-panel-bound ${boundActive ? 'is-active' : ''}" aria-label="Section境界の設定">
            <h4 class="sr1-panel-title">Section 境界の設定</h4>
            <p class="sr1-panel-desc">${boundActive
              ? '境界候補（オレンジ）を選び「境界を確定」してください。'
              : '「ここを区切り」で境界選択モードに入り、Section に含める最後のコードを選びます。'}</p>
            <div class="sr1-panel-actions">
              <button type="button" class="sec-btn" id="sr1-set-end">${boundActive ? '境界を確定' : 'ここを区切り'}</button>
              <button type="button" class="sec-btn" id="sr1-boundary-cancel" ${boundActive ? '' : 'hidden'}>キャンセル</button>
            </div>
          </section>
        </div>
        <div class="sr1-aux-toolbar" aria-label="構造編集">
          <button type="button" class="sec-btn" id="sr1-prev-sec">← Section</button>
          <button type="button" class="sec-btn" id="sr1-next-sec">Section →</button>
          <button type="button" class="sec-btn" id="sr1-split">${uiMode === 'split' ? '分割実行' : '分割'}</button>
          <button type="button" class="sec-btn" id="sr1-split-cancel" ${uiMode === 'split' ? '' : 'hidden'}>分割キャンセル</button>
          <button type="button" class="sec-btn" id="sr1-merge">前と結合</button>
          <button type="button" class="sec-btn" id="sr1-undo" ${canUndo ? '' : 'disabled'}>Undo</button>
          <button type="button" class="sec-btn" id="sr1-redo" ${canRedo ? '' : 'disabled'}>Redo</button>
        </div>
        <div id="sr1-msg" class="sag-errors sr1-msg" role="status">${esc(message)}</div>
        <p class="sr1-keys-hint">←→ 候補移動 · Space 再生 · Tab Section · Enter 確定 · Esc キャンセル／閉じる</p>
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
    root?.querySelector('.sr1-play-cand, .sr1-play-conf, .sr1-bound-cand, .sr1-split-cand')?.scrollIntoView({ block: 'nearest', inline: 'center' });
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

  function isLastStructSection() {
    const list = diagnoseDraftSections(draft, buffer);
    const positioned = list
      .filter(r => r.structurallyValid && r.start >= 0)
      .slice()
      .sort((a, b) => a.start - b.start || a.index - b.index);
    if (!positioned.length) return true;
    return positioned[positioned.length - 1].index === sectionIdx;
  }

  function enterBoundaryMode() {
    stopPlayIfNeeded();
    applyNameTypeFromInputs();
    if (uiMode === 'split') cancelSplitMode();
    const sp = currentSpan();
    if (!sp || sp.start < 0) {
      message = 'このSectionでは境界を設定できません';
      fullRedraw();
      return;
    }
    if (isLastStructSection()) {
      message = '最終Sectionの終端は曲の終わりに固定されています。内側で分ける場合は「分割」を使ってください';
      fullRedraw();
      return;
    }
    uiMode = 'boundary';
    boundaryCandidate = sp.end;
    message = '境界選択中: 現在のSectionに含める最後のコードを選んでください';
    fullRedraw();
  }

  function cancelBoundaryMode() {
    uiMode = 'normal';
    boundaryCandidate = null;
    message = '';
    fullRedraw();
  }

  function confirmBoundary() {
    beforeStructuralEdit();
    if (boundaryCandidate == null) {
      message = '境界位置を選択してください';
      fullRedraw();
      return;
    }
    if (isLastStructSection()) {
      message = '最終Sectionの終端は変更できません。分割を利用してください';
      uiMode = 'normal';
      boundaryCandidate = null;
      fullRedraw();
      return;
    }
    const r = setDraftSectionEndByChordIndex(draft, sectionIdx, boundaryCandidate, buffer);
    if (!r.ok) {
      message = `境界を設定できません（${REASON_LABEL[r.reason] || r.reason}）`;
      fullRedraw();
      return;
    }
    if (r.split) {
      // Should not happen for non-last; treat as error to avoid implicit split
      // Revert is complex; refuse was preferred — if split returned, undo
      undoDraft(draft);
      message = '最終Sectionの暗黙分割は行いません。「分割」を使用してください';
      uiMode = 'normal';
      boundaryCandidate = null;
      fullRedraw();
      return;
    }
    uiMode = 'normal';
    boundaryCandidate = null;
    message = '境界を更新しました';
    ensurePlayInSection();
    fullRedraw();
  }

  function setEndAtCursor() {
    // Button toggles: enter mode / confirm boundary
    if (uiMode === 'boundary') confirmBoundary();
    else enterBoundaryMode();
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
    fullRedraw();
    const finishPlay = () => {
      isPlaying = false;
      if (playStartIdx != null) playCandidate = playStartIdx;
      playStartIdx = null;
      if (!closed) fullRedraw();
    };
    onTestPlay?.({
      startSec,
      endSec,
      onEnded: finishPlay,
    });
  }

  function enterSplitMode() {
    stopPlayIfNeeded();
    applyNameTypeFromInputs();
    if (uiMode === 'boundary') cancelBoundaryMode();
    uiMode = 'split';
    const sp = currentSpan();
    splitCandidate = (sp && sp.start >= 0) ? Math.min(Math.max(playCandidate, sp.start), sp.end - 1) : playCandidate;
    message = '分割位置を選択中です';
    fullRedraw();
  }

  function cancelSplitMode() {
    uiMode = 'normal';
    splitCandidate = null;
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
    const r = splitDraftAtChordIndex(draft, sectionIdx, splitCandidate, buffer);
    if (!r.ok) {
      message = `分割できません（${REASON_LABEL[r.reason] || r.reason}）`;
      fullRedraw();
      return;
    }
    uiMode = 'normal';
    splitCandidate = null;
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
      if (uiMode === 'boundary') {
        cancelBoundaryMode();
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
      if (uiMode === 'boundary') cancelBoundaryMode();
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
      const sp = currentSpan();
      const delta = e.code === 'ArrowLeft' ? -1 : 1;
      if (uiMode === 'boundary') {
        if (sp && sp.start >= 0) {
          const base = boundaryCandidate == null ? sp.end : boundaryCandidate;
          boundaryCandidate = Math.max(sp.start, Math.min(sp.end, base + delta));
        }
      } else if (uiMode === 'split') {
        if (sp && sp.start >= 0) {
          const base = splitCandidate == null ? sp.start : splitCandidate;
          splitCandidate = Math.max(sp.start, Math.min(sp.end - 1, base + delta));
        }
      } else {
        if (sp && sp.start >= 0) playCandidate = Math.max(sp.start, Math.min(sp.end, playCandidate + delta));
        else playCandidate = Math.max(0, Math.min(buffer.length - 1, playCandidate + delta));
      }
      fullRedraw();
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (uiMode === 'boundary') confirmBoundary();
      else if (uiMode === 'split') executeSplit();
      else setEndAtCursor();
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
          splitCandidate = i;
          message = `分割位置: コード ${i + 1}`;
          fullRedraw();
          return;
        }
        if (uiMode === 'boundary') {
          boundaryCandidate = i;
          message = `境界候補: コード ${i + 1}（ここまでを現在のSectionに含める）`;
          fullRedraw();
          return;
        }
        // Normal: play candidate only — never mutates Section boundary
        playCandidate = i;
        fullRedraw();
      });
    });
    root.querySelector('#sr1-prev-sec')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      if (uiMode === 'split') cancelSplitMode();
      if (uiMode === 'boundary') cancelBoundaryMode();
      sectionIdx = Math.max(0, sectionIdx - 1);
      resetPlayToSectionStart();
      fullRedraw();
    });
    root.querySelector('#sr1-next-sec')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      if (uiMode === 'split') cancelSplitMode();
      if (uiMode === 'boundary') cancelBoundaryMode();
      sectionIdx = Math.min(Math.max(0, draft.sections.length - 1), sectionIdx + 1);
      resetPlayToSectionStart();
      fullRedraw();
    });
    root.querySelector('#sr1-set-end')?.addEventListener('click', setEndAtCursor);
    root.querySelector('#sr1-play')?.addEventListener('click', testPlay);
    root.querySelector('#sr1-play-left')?.addEventListener('click', () => {
      const sp = currentSpan();
      if (sp && sp.start >= 0) playCandidate = Math.max(sp.start, playCandidate - 1);
      fullRedraw();
    });
    root.querySelector('#sr1-play-right')?.addEventListener('click', () => {
      const sp = currentSpan();
      if (sp && sp.end >= 0) playCandidate = Math.min(sp.end, playCandidate + 1);
      fullRedraw();
    });
    root.querySelector('#sr1-play-confirm')?.addEventListener('click', () => {
      playConfirmed = playCandidate;
      message = `再生位置をコード ${playConfirmed + 1} に確定`;
      fullRedraw();
    });
    root.querySelector('.sr1-play-count')?.addEventListener('change', (ev) => {
      let n = Number(ev.target.value);
      if (!Number.isFinite(n)) n = 4;
      playChordCount = Math.max(1, Math.min(8, Math.round(n)));
      ev.target.value = String(playChordCount);
      fullRedraw();
    });
    root.querySelector('#sr1-split')?.addEventListener('click', () => {
      if (uiMode === 'split') executeSplit();
      else enterSplitMode();
    });
    root.querySelector('#sr1-split-cancel')?.addEventListener('click', cancelSplitMode);
    root.querySelector('#sr1-merge')?.addEventListener('click', () => { mergeWithPrevious(); });
    root.querySelector('#sr1-undo')?.addEventListener('click', () => {
      beforeStructuralEdit();
      if (undoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
    });
    root.querySelector('#sr1-redo')?.addEventListener('click', () => {
      beforeStructuralEdit();
      if (redoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
    });
    root.querySelector('#sr1-boundary-cancel')?.addEventListener('click', cancelBoundaryMode);
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
