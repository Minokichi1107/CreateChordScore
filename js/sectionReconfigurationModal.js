/**
 * Section reconfiguration Stage 1 modal (Phase150).
 * UI only — does not mutate analysisEditor.sections until onAdopt succeeds.
 */
import {
  draftSectionChordSpans,
  updateDraftSection,
  adjustSharedBoundary,
  deleteDraftSectionAt,
  diagnoseDraftSection,
  diagnoseDraftSections,
  classifySectionDiagForUi,
  isDraftDirty,
  undoDraft,
  redoDraft,
  splitDraftAtChordIndex,
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
    openModal, mkMBtn, draft, buffer, sectionTypes, runtime = null,
    onAdopt, onClose, onTestPlay, onTestStop, onKeyShield, onKeyUnshield, confirmChoice,
    getSectionNameBase, formatChord,
    initial = null, splitContext: initialSplitContext = null,
    onReturnToOverview, onSplitContextClear, isCurrent,
  } = p;

  const requestedIndex = Number.isInteger(initial?.sectionIndex) ? initial.sectionIndex : 0;
  const requestedIdIndex = initial?.sectionId
    ? draft.sections.findIndex(section => section?.id === initial.sectionId)
    : -1;
  let sectionIdx = requestedIdIndex >= 0
    ? requestedIdIndex
    : Math.max(0, Math.min(Math.max(0, draft.sections.length - 1), requestedIndex));
  let selectedSectionId = draft.sections[sectionIdx]?.id ?? null;
  let splitContext = initialSplitContext ? { ...initialSplitContext } : null;
  const returnToOverviewOnSplit = initialSplitContext?.returnTo === 2;
  let lastHistoryAction = null;
  /**
   * Play start position (blue). Click/arrows update immediately — no separate confirm.
   * playConfirmed is kept in sync for testPlay() start index.
   */
  let playCandidate = 0;
  let playConfirmed = 0;
  /** Index used when current testPlay() started; restored on end. */
  let playStartIdx = null;
  let localPlayGeneration = 0;
  const currentPlayGeneration = () => runtime
    ? (Number(runtime.playGeneration) || 0)
    : localPlayGeneration;
  const advancePlayGeneration = () => {
    if (runtime) runtime.playGeneration = (Number(runtime.playGeneration) || 0) + 1;
    else localPlayGeneration += 1;
    return currentPlayGeneration();
  };
  /** Number of chords to play (1..8). */
  let playChordCount = 4;
  let isPlaying = false;
  /** 'normal' | 'boundary' | 'split'. */
  let uiMode = 'normal';
  let boundaryCandidate = null;
  let boundaryCandidateAtModeEnter = null;
  /** First chord of the new back Section when splitting. */
  let splitCandidate = null;
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
  /** First visible grid row index (0-based); preserved across redraw. */
  let gridScrollRow = 0;

  let root = null;
  let closed = false;
  let keyHandler = null;
  let closing = false; // re-entrancy guard

  function clearSplitContext() {
    if (!splitContext) return;
    splitContext = null;
    onSplitContextClear?.();
  }

  function syncSectionSelection() {
    if (selectedSectionId != null) {
      const found = draft.sections.findIndex(section => section?.id === selectedSectionId);
      if (found >= 0) {
        sectionIdx = found;
        return;
      }
    }
    const nextIndex = Math.max(0, Math.min(Math.max(0, draft.sections.length - 1), sectionIdx));
    const nextId = draft.sections[nextIndex]?.id ?? null;
    if (splitContext && nextId !== splitContext.sectionId) clearSplitContext();
    sectionIdx = nextIndex;
    selectedSectionId = nextId;
  }

  function selectSectionIndex(index, opts = {}) {
    const nextIndex = Math.max(0, Math.min(Math.max(0, draft.sections.length - 1), Math.round(Number(index) || 0)));
    const nextId = draft.sections[nextIndex]?.id ?? null;
    if (opts.clearSplitContext !== false && splitContext && nextId !== splitContext.sectionId) clearSplitContext();
    sectionIdx = nextIndex;
    selectedSectionId = nextId;
    scrollSectionStartToTop();
  }

  function spans() {
    return draftSectionChordSpans(draft, buffer);
  }

  function currentSpan() {
    syncSectionSelection();
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

  function canEditCurrentBoundary() {
    const diagnostics = diagnoseDraftSections(draft, buffer);
    const current = diagnostics[sectionIdx];
    if (!current?.structurallyValid) return false;
    const positioned = diagnostics
      .map(row => ({
        ...row,
        sortKey: row.start >= 0 ? row.start : (row.end >= 0 ? row.end : Number.MAX_SAFE_INTEGER),
      }))
      .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index);
    const orderIndex = positioned.findIndex(row => row.index === sectionIdx);
    return orderIndex >= 0
      && orderIndex < positioned.length - 1
      && positioned[orderIndex + 1]?.structurallyValid === true;
  }

  function clampBoundaryCandidate(idx) {
    const sp = currentSpan();
    if (!sp || sp.start < 0 || sp.end < sp.start) return null;
    const diagnostics = diagnoseDraftSections(draft, buffer);
    const positioned = diagnostics
      .map(row => ({ ...row, sortKey: row.start >= 0 ? row.start : (row.end >= 0 ? row.end : Number.MAX_SAFE_INTEGER) }))
      .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index);
    const orderIndex = positioned.findIndex(row => row.index === sectionIdx);
    const nextRow = orderIndex >= 0 ? positioned[orderIndex + 1] : null;
    const max = nextRow?.structurallyValid
      ? nextRow.end - 1
      : sp.end - 1;
    if (max < sp.start) return null;
    return Math.max(sp.start, Math.min(max, Math.round(Number(idx) || 0)));
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
    advancePlayGeneration();
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
    lastHistoryAction = null;
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
    const typeOpts = [
      ...(!sec.type ? ['<option value="" selected disabled>種類を選択してください</option>'] : []),
      ...(sectionTypes || []).map(t =>
        `<option value="${esc(t.value)}" ${t.value === sec.type ? 'selected' : ''}>${esc(t.label)}</option>`
      ),
    ].join('');
    const kind = classifySectionDiagForUi(diag);
    let invalidNote = '';
    if (kind === 'structural-invalid') {
      invalidNote = `<div class="sr1-sec-invalid">構造的に不正: ${esc((diag.structuralReasons || diag.reasons || []).map(r => REASON_LABEL[r] || r).join('、'))}
       <button type="button" class="sec-btn sr1-danger" id="sr1-delete-sec">削除</button></div>`;
    } else if (kind === 'incomplete-fields') {
      invalidNote = `<div class="sr1-sec-incomplete">名称・種類が未設定（採用前に入力）</div>`;
    }
    const playOn = uiMode === 'normal';
    const boundaryOn = uiMode === 'boundary';
    const splitOn = uiMode === 'split';
    const span = currentSpan();
    const boundaryAvailable = !!span && (canEditCurrentBoundary() || span.end > span.start);
    return `
      <div class="sr1-header">
        <div class="sr1-header-row">
          <span class="sr1-sec-idx">Section ${sectionIdx + 1} / ${draft.sections.length}</span>
          <span class="sr1-vsep" aria-hidden="true"></span>
          <label class="sr1-field sr1-field-inline">名前
            <input type="text" class="mi sr1-name" value="${esc(sec.name)}" autocomplete="off" />
          </label>
          <span class="sr1-vsep" aria-hidden="true"></span>
          <label class="sr1-field sr1-field-inline">種類
            <select class="mi sr1-type">${typeOpts}</select>
          </label>
          <div class="sr1-mode-toggle" role="group" aria-label="操作対象">
            <button type="button" class="sr1-mode-btn sr1-mode-play ${playOn ? 'is-active' : ''}" id="sr1-mode-play" aria-pressed="${playOn}">
              <span class="sr1-ico" aria-hidden="true">▶</span>再生位置
            </button>
            <button type="button" class="sr1-mode-btn sr1-mode-boundary ${boundaryOn ? 'is-active' : ''}" id="sr1-mode-boundary" aria-pressed="${boundaryOn}" ${boundaryAvailable ? '' : 'disabled'}>
              <span class="sr1-ico" aria-hidden="true">↔✂</span>境界・分割位置
            </button>
          </div>
        </div>
        ${invalidNote}
      </div>`;
  }



  function totalChordGridRows() {
    const cols = gridCols || 6;
    return Math.max(1, Math.ceil((buffer?.length || 0) / cols));
  }

  function clampGridScrollRow(r) {
    // Allow the final chord row to become the first visible row when it is a
    // Section start. The remaining two rows are padded with empty placeholders.
    const maxFirst = Math.max(0, totalChordGridRows() - 1);
    const n = Math.round(Number(r) || 0);
    return Math.max(0, Math.min(maxFirst, n));
  }

  /**
   * Align the active Section's first chord row to the top of the grid.
   * Called on initial open and whenever Stage1 changes the active Section.
   */
  function scrollSectionStartToTop({ refresh = false } = {}) {
    gridCols = computeGridCols();
    const active = spans()[sectionIdx];
    if (!active || active.start < 0) return;
    gridScrollRow = clampGridScrollRow(Math.floor(active.start / gridCols));
    if (refresh) refreshChordGridOnly();
  }

  /** Windowed grid: only 3 rows in DOM — no native mid-row scroll possible. */
  function shiftGridScrollRow(delta) {
    const next = clampGridScrollRow(gridScrollRow + delta);
    if (next === gridScrollRow) return false;
    gridScrollRow = next;
    return true;
  }

  function ensureChordRowVisible(idx) {
    if (idx == null || idx < 0) return;
    const cols = gridCols || 6;
    const row = Math.floor(idx / cols);
    const first = gridScrollRow;
    const last = first + 2;
    if (row < first) {
      gridScrollRow = clampGridScrollRow(row);
      refreshChordGridOnly();
    } else if (row > last) {
      gridScrollRow = clampGridScrollRow(row - 2);
      refreshChordGridOnly();
    }
  }

  function refreshChordGridOnly() {
    if (!root || closed) return;
    const host = root.querySelector('.sr1-chords-wrap');
    if (!host) {
      fullRedraw();
      return;
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = chordsHtml();
    const next = tmp.firstElementChild;
    if (!next) return;
    host.replaceWith(next);
    bindChordGridInteractions(root);
  }

  function bindChordGridInteractions(scope) {
    const rootEl = scope || root || document.getElementById('sr1-root');
    if (!rootEl) return;
    const wrap = rootEl.querySelector('.sr1-chords-wrap');
    if (!wrap) return;

    // Chord blocks select playback position. Structural editing selects the gap between blocks.
    wrap.querySelectorAll('.sr1-chord').forEach(btn => {
      btn.addEventListener('click', () => {
        setPlayPos(Number(btn.dataset.i));
        fullRedraw();
      });
    });
    wrap.querySelectorAll('.sr1-gap-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const requestedGap = Number(btn.dataset.gap);
        const gap = clampBoundaryCandidate(requestedGap);
        if (gap == null || gap !== requestedGap) {
          message = 'この位置は選択できません';
          fullRedraw();
          return;
        }
        stopPlayIfNeeded();
        applyNameTypeFromInputs();
        boundaryCandidate = gap;
        boundaryCandidateAtModeEnter = gap;
        splitCandidate = gap + 1;
        splitCandidateAtModeEnter = splitCandidate;
        uiMode = 'boundary';
        message = `選択位置: コード ${gap + 1} と ${gap + 2} の間`;
        fullRedraw();
      });
    });

    if (wrap.dataset.sr1WindowScrollBound === '1') return;
    wrap.dataset.sr1WindowScrollBound = '1';

    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dy = e.deltaY;
      if (dy === 0 && e.deltaX === 0) return;
      const dir = dy > 0 || (dy === 0 && e.deltaX > 0) ? 1 : -1;
      if (shiftGridScrollRow(dir)) refreshChordGridOnly();
    }, { passive: false });

    const scroller = wrap.querySelector('.sr1-grid-scroller');
    if (scroller) {
      scroller.addEventListener('input', () => {
        gridScrollRow = clampGridScrollRow(scroller.value);
        refreshChordGridOnly();
      });
    }
  }

  function chordsHtml() {
    const sp = spans();
    const active = sp[sectionIdx];
    const structOk = active && active.start >= 0 && active.end >= active.start;
    const boundaryEnds = new Set(sp.filter(s => s.start >= 0 && s.end >= s.start).map(s => s.end));
    gridCols = computeGridCols();
    const cols = gridCols;
    const n = buffer.length;
    const rowsTotal = Math.max(1, Math.ceil(n / cols));
    gridScrollRow = clampGridScrollRow(gridScrollRow);
    const startR = gridScrollRow;
    const endR = Math.min(rowsTotal, startR + 3);
    const rowHtml = [];
    for (let r = startR; r < endR; r++) {
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
        const isSplitCand = false;
        const isBoundaryCand = uiMode === 'boundary' && boundaryCandidate === i;
        const isPlayingChord = playingChordIdx === i;
        const isBoundary = boundaryEnds.has(i);
        const cls = [
          'sr1-chord',
          inSec ? 'sr1-in-sec' : '',
          isPlay ? 'sr1-play-cand sr1-play-conf' : '',
          isPlayingChord ? 'sr1-playing' : '',
          isBoundary ? 'sr1-boundary' : '',
        ].filter(Boolean).join(' ');
        const markers = [
          isPlay ? '<span class="sr1-mark sr1-mark-play" aria-hidden="true"></span>' : '',
          isPlayingChord ? '<span class="sr1-mark sr1-mark-playing" aria-hidden="true"></span>' : '',
        ].join('');
        const gapButton = i < n - 1
          ? `<button type="button" class="sr1-gap-btn ${isBoundaryCand ? 'is-selected' : ''}" data-gap="${i}" aria-label="コード ${i + 1} とコード ${i + 2} の間を選択" aria-pressed="${isBoundaryCand}"><span aria-hidden="true"></span></button>`
          : '';
        cells.push(
          `<div class="sr1-chord-cell">` +
          `<button type="button" class="${cls}" data-i="${i}" role="option" aria-selected="${isPlay}">` +
          `<span class="sr1-chord-label">${esc(chordLabel(chord))}</span>${markers}</button>${gapButton}</div>`
        );
      }
      rowHtml.push(
        `<div class="sr1-chord-row" role="presentation" data-row="${r}">` +
        `<span class="sr1-row-num" aria-hidden="true">${r + 1}</span>` +
        `<div class="sr1-chord-row-cells" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${cells.join('')}</div></div>`
      );
    }
    // Pad to always 3 row slots when near end (keeps layout height stable)
    while (rowHtml.length < 3 && rowsTotal > 0) {
      rowHtml.push(
        `<div class="sr1-chord-row sr1-chord-row-empty" role="presentation" aria-hidden="true">` +
        `<span class="sr1-row-num"></span>` +
        `<div class="sr1-chord-row-cells" style="grid-template-columns:repeat(${cols},minmax(0,1fr))"></div></div>`
      );
    }
    const maxFirst = Math.max(0, rowsTotal - 1);
    const scroller = maxFirst > 0
      ? `<input type="range" class="sr1-grid-scroller" min="0" max="${maxFirst}" value="${gridScrollRow}" step="1" aria-label="コード進行の表示行を移動" />`
      : '';
    return `<div class="sr1-chords-wrap"><div class="sr1-chord-grid sr1-chord-grid--windowed" tabindex="0" role="listbox" aria-label="コード進行">${rowHtml.join('')}</div>${scroller}</div>`;
  }


  function playHintHtml() {
    // Always reserve one banner row so mode switch does not resize the modal.
    if (uiMode === 'split') {
      const cancelText = returnToOverviewOnSplit
        ? '全Section一覧へ戻ります'
        : '開始時の位置に戻します';
      return `<div class="sr1-mode-banner sr1-mode-split is-on" role="status">分割位置の変更中 — 「分割」で実行、「キャンセル」で${cancelText}</div>`;
    }
    if (uiMode === 'boundary') {
      return '<div class="sr1-mode-banner sr1-mode-boundary is-on" role="status">境界位置の変更中 — 「境界を変更」で確定、「キャンセル」で元に戻します</div>';
    }
    return '<div class="sr1-mode-banner sr1-mode-banner-slot" aria-hidden="true">&nbsp;</div>';
  }

  function bodyHtml() {
    const canUndo = (draft.undoStack?.length || 0) > 0;
    const canRedo = (draft.redoStack?.length || 0) > 0;
    const splitOn = uiMode === 'split';
    const boundaryOn = uiMode === 'boundary';
    const activeSpan = currentSpan();
    const canSplitExec = boundaryOn && splitCandidate != null && activeSpan
      && splitCandidate > activeSpan.start && splitCandidate <= activeSpan.end;
    const canBoundaryExec = boundaryOn && boundaryCandidate != null && canEditCurrentBoundary();
    return `
      <div id="sr1-root" class="sr1-root">
        <div class="sr1-stage-nav">
          <button type="button" class="sec-btn" id="sr1-return-overview">← 全Section一覧へ</button>
          <button type="button" class="sec-btn sr1-close-btn" id="sr1-close" aria-label="閉じる">✕</button>
        </div>
        ${sectionPanelHtml()}
        ${invalidBannerHtml()}
        ${playHintHtml()}
        ${chordsHtml()}
        <div class="sr1-panels">
          <section class="sr1-panel sr1-panel-play ${!boundaryOn ? 'is-active' : ''}" data-sr1-mode="play" role="button" tabindex="0" aria-label="再生位置パネル（クリックで切替）">
            <h4 class="sr1-panel-title"><span class="sr1-ico" aria-hidden="true">▶</span>再生位置<span class="sr1-vsep" aria-hidden="true"></span>${!boundaryOn ? '<span class="sr1-active-tag" aria-label="操作中">✓ 選択中</span>' : ''}</h4>
            <div class="sr1-panel-actions">
              <button type="button" class="sec-btn" id="sr1-play-left" title="再生位置を左へ">←</button>
              <button type="button" class="sec-btn" id="sr1-play-right" title="再生位置を右へ">→</button>
              <span class="sr1-vsep" aria-hidden="true"></span>
              <button type="button" class="sec-btn" id="sr1-play">テスト再生</button>
              <span class="sr1-vsep" aria-hidden="true"></span>
              <label class="sr1-play-count-field">
                <span class="sr1-play-count-label">長さ（コード数）</span>
                <input type="number" class="mi sr1-play-count" min="1" max="8" value="${playChordCount}" />
              </label>
            </div>
          </section>
          <section class="sr1-panel sr1-panel-bound ${boundaryOn ? 'is-active' : ''}" aria-label="境界移動・Section分割">
            <h4 class="sr1-panel-title"><span class="sr1-ico" aria-hidden="true">↔✂</span>境界移動・Section分割${boundaryOn ? '<span class="sr1-active-tag" aria-label="位置選択中">✓ 位置選択中</span>' : ''}</h4>
            <p class="sr1-boundary-help">コードとコードの間をクリックして位置を選び、実行する操作を選択します</p>
            <div class="sr1-panel-actions">
              <button type="button" class="sec-btn" id="sr1-boundary-left" title="選択位置を左へ" ${boundaryOn && boundaryCandidate != null ? '' : 'disabled'}>←</button>
              <button type="button" class="sec-btn" id="sr1-boundary-right" title="選択位置を右へ" ${boundaryOn && boundaryCandidate != null ? '' : 'disabled'}>→</button>
              <span class="sr1-vsep" aria-hidden="true"></span>
              <button type="button" class="sec-btn sr1-btn-split-primary" id="sr1-boundary-exec" ${canBoundaryExec ? '' : 'disabled'}>境界を移動</button>
              <button type="button" class="sec-btn" id="sr1-split-exec" ${canSplitExec ? '' : 'disabled'}>Sectionを分割</button>
              <button type="button" class="sec-btn" id="sr1-boundary-cancel" ${boundaryOn ? '' : 'disabled'}>選択解除</button>
            </div>
          </section>
        </div>
        <div class="sr1-aux-toolbar" aria-label="構造編集">
          <button type="button" class="sec-btn" id="sr1-prev-sec" ${sectionIdx <= 0 ? 'disabled' : ''}>← Section</button>
          <button type="button" class="sec-btn" id="sr1-next-sec" ${sectionIdx >= draft.sections.length - 1 ? 'disabled' : ''}>Section →</button>
          <button type="button" class="sec-btn" id="sr1-undo" ${canUndo ? '' : 'disabled'}>Undo</button>
          <button type="button" class="sec-btn" id="sr1-redo" ${canRedo ? '' : 'disabled'}>Redo</button>
        </div>
        <div id="sr1-msg" class="sag-errors sr1-msg" role="status">${esc(message)}</div>
        <p class="sr1-keys-hint"><span class="sr1-info-ico" aria-hidden="true">i</span> P 再生位置 · B/S 境界・分割位置 · ←→ 選択位置の移動 · Space 試聴 · Enter 境界移動 · Tab/Shift+Tab Section移動</p>
      </div>`;
  }

  function fullRedraw() {
    if (closed) return;
    syncSectionSelection();
    gridScrollRow = clampGridScrollRow(gridScrollRow);
    const host = document.getElementById('sr1-root');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = bodyHtml();
    const next = wrap.firstElementChild;
    host.replaceWith(next);
    root = next;
    bind();
    const focusIdx = uiMode === 'split' && splitCandidate != null
      ? splitCandidate
      : (uiMode === 'boundary' && boundaryCandidate != null ? boundaryCandidate : playCandidate);
    ensureChordRowVisible(focusIdx);
  }

  function scrollCursorIntoView() {
    const focusIdx = uiMode === 'split' && splitCandidate != null
      ? splitCandidate
      : (uiMode === 'boundary' && boundaryCandidate != null ? boundaryCandidate : playCandidate);
    ensureChordRowVisible(focusIdx);
  }

  function generateDraftSectionName(type, excludeSectionId) {
    const generated = typeof getSectionNameBase === 'function'
      ? getSectionNameBase(type)
      : (sectionTypes?.find(item => item?.value === type)?.label
        || (typeof generateSectionName === 'function' ? generateSectionName(type) : type));
    const label = String(generated ?? type ?? 'Section').trim();
    if (!type || !label) return '';
    let maxNumber = 0;
    for (const section of draft.sections) {
      if (!section || section.id === excludeSectionId || section.type !== type) continue;
      const name = String(section.name ?? '').trim();
      if (name === label) {
        maxNumber = Math.max(maxNumber, 1);
      } else if (name.startsWith(label + ' ')) {
        const suffix = name.slice(label.length + 1);
        if (/^\d+$/.test(suffix)) maxNumber = Math.max(maxNumber, Number(suffix));
      }
    }
    return maxNumber === 0 ? label : `${label} ${maxNumber + 1}`;
  }

  function applyNameTypeFromInputs() {
    syncSectionSelection();
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
      // A type change always regenerates the name, even if it was manually edited.
      // Clear Draft-only manual-name metadata in the same history operation.
      patch.nameUserEdited = false;
      opts.defaultNameForType = type => generateDraftSectionName(type, sec.id);
    }
    if (Object.keys(patch).length) {
      lastHistoryAction = null;
      updateDraftSection(draft, sec.id, patch, opts);
    }
  }

  /** A type change always replaces the name with the generated name for the new type. */
  function onTypeChangeLive() {
    syncSectionSelection();
    const typeEl = root?.querySelector('.sr1-type');
    const nameEl = root?.querySelector('.sr1-name');
    const sec = draft.sections[sectionIdx];
    if (!sec || !typeEl) return;
    const newType = typeEl.value;
    if (newType === sec.type) return;
    const patch = { type: newType, nameUserEdited: false };
    const opts = {
      defaultNameForType: type => generateDraftSectionName(type, sec.id),
    };
    lastHistoryAction = null;
    updateDraftSection(draft, sec.id, patch, opts);
    // The generated name is reflected immediately; it is no longer a manual name.
    if (nameEl) nameEl.value = draft.sections[sectionIdx].name;
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
      selectedSectionId = null;
      syncSectionSelection();
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
    // Capture both the start index and Runtime generation for this playback session.
    stopPlayIfNeeded();
    const generation = advancePlayGeneration();
    playStartIdx = startIdx;
    isPlaying = true;
    playCandidate = startIdx;
    playingChordIdx = startIdx;
    fullRedraw();
    const finishPlay = () => {
      if (generation !== currentPlayGeneration()) return;
      advancePlayGeneration();
      isPlaying = false;
      playingChordIdx = null;
      if (playStartIdx != null) playCandidate = playStartIdx;
      playStartIdx = null;
      // Avoid replacing the name input while an IME composition is active.
      updatePlayingHighlight(null);
    };
    onTestPlay?.({
      startSec,
      endSec,
      onEnded: finishPlay,
      onTime: (tSec) => {
        if (generation !== currentPlayGeneration() || closed || (typeof isCurrent === 'function' && !isCurrent()) || !isPlaying) return;
        const idx = chordIndexAtTime(tSec);
        if (idx !== playingChordIdx) {
          playingChordIdx = idx;
          updatePlayingHighlight(idx);
        }
      },
    });
  }

  function enterSplitMode() {
    if (uiMode === 'boundary') cancelBoundaryMode();
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
    // Keep message area reserved; avoid toggling a long status line that resizes the modal.
    if (!message) message = '';
    fullRedraw();
  }

  function enterBoundaryMode() {
    stopPlayIfNeeded();
    applyNameTypeFromInputs();
    const sp = currentSpan();
    if (!sp || sp.start < 0 || sp.end < sp.start
      || (sp.end === sp.start && !canEditCurrentBoundary())) {
      message = 'このSectionには選択できるコード間位置がありません';
      fullRedraw();
      return;
    }
    const defaultGap = canEditCurrentBoundary() ? sp.end : sp.end - 1;
    boundaryCandidate = clampBoundaryCandidate(defaultGap);
    boundaryCandidateAtModeEnter = boundaryCandidate;
    splitCandidate = boundaryCandidate == null ? null : boundaryCandidate + 1;
    splitCandidateAtModeEnter = splitCandidate;
    uiMode = 'boundary';
    message = '';
    fullRedraw();
  }

  function moveBoundaryCandidate(delta) {
    if (uiMode !== 'boundary' || boundaryCandidate == null) return;
    const next = clampBoundaryCandidate(boundaryCandidate + delta);
    if (next == null || next === boundaryCandidate) return;
    boundaryCandidate = next;
    splitCandidate = next + 1;
    fullRedraw();
  }

  function cancelBoundaryMode() {
    if (uiMode !== 'boundary') return;
    boundaryCandidate = null;
    boundaryCandidateAtModeEnter = null;
    splitCandidate = null;
    splitCandidateAtModeEnter = null;
    uiMode = 'normal';
    message = '';
    fullRedraw();
  }

  function executeBoundaryChange() {
    beforeStructuralEdit();
    if (boundaryCandidate == null) {
      message = '境界位置を選択してください';
      fullRedraw();
      return;
    }
    const current = currentSpan();
    const diagnostics = diagnoseDraftSections(draft, buffer);
    const positioned = diagnostics
      .map(row => ({
        ...row,
        sortKey: row.start >= 0 ? row.start : (row.end >= 0 ? row.end : Number.MAX_SAFE_INTEGER),
      }))
      .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index);
    const orderIndex = positioned.findIndex(row => row.index === sectionIdx);
    const nextRow = orderIndex >= 0 ? positioned[orderIndex + 1] : null;
    if (current && boundaryCandidate === current.end && nextRow?.start === boundaryCandidate + 1) {
      boundaryCandidate = null;
      boundaryCandidateAtModeEnter = null;
      uiMode = 'normal';
      message = '境界に変更はありません';
      fullRedraw();
      return;
    }
    const r = adjustSharedBoundary(draft, selectedSectionId, nextRow?.id ?? null, boundaryCandidate, buffer);
    if (!r.ok) {
      message = `境界を変更できません（${REASON_LABEL[r.reason] || r.reason}）`;
      fullRedraw();
      return;
    }
    boundaryCandidate = null;
    boundaryCandidateAtModeEnter = null;
    splitCandidate = null;
    splitCandidateAtModeEnter = null;
    uiMode = 'normal';
    resetPlayToSectionStart();
    message = r.noop ? '境界に変更はありません' : 'Section境界を変更しました';
    if (!r.noop && returnToOverviewOnSplit) {
      onReturnToOverview?.({ reason: 'boundary-change', sectionId: selectedSectionId, historyAction: lastHistoryAction });
      return;
    }
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
  function cancelSplitMode(opts = {}) {
    if (uiMode === 'split') splitCandidate = splitCandidateAtModeEnter;
    uiMode = 'normal';
    splitCandidate = null;
    splitCandidateAtModeEnter = null;
    message = '';
    if (opts.returnToOverview === true && returnToOverviewOnSplit) {
      onReturnToOverview?.({ reason: 'split-cancel', sectionId: selectedSectionId, historyAction: lastHistoryAction });
      return;
    }
    fullRedraw();
  }

  /** Switch to play mode; same cancel semantics for pending split-position edits. */
  function enterPlayMode() {
    if (uiMode === 'split') {
      splitCandidate = splitCandidateAtModeEnter;
      splitCandidate = null;
      splitCandidateAtModeEnter = null;
    }
    if (uiMode === 'boundary') {
      boundaryCandidate = null;
      boundaryCandidateAtModeEnter = null;
      splitCandidate = null;
      splitCandidateAtModeEnter = null;
    }
    uiMode = 'normal';
    message = '';
    fullRedraw();
  }

  function executeSplit() {
    beforeStructuralEdit();
    const span = currentSpan();
    if (splitCandidate == null || !span || splitCandidate <= span.start || splitCandidate > span.end) {
      message = 'Section内部のコード間位置を選択してください';
      fullRedraw();
      return;
    }
    // splitCandidate is the first chord after the selected gap.
    const endChordIndex = splitCandidate - 1;
    const sectionBeforeSplit = draft.sections[sectionIdx];
    const splitOptions = {
      // A split creates a new Section: inherit the source category and assign a
      // fresh automatic name. The original Section name is not modified.
      inheritBackMeta: true,
      ...(sectionBeforeSplit?.type
        ? { defaultNameForType: type => generateDraftSectionName(type, null) }
        : {}),
    };
    const r = splitDraftAtChordIndex(
      draft,
      selectedSectionId,
      endChordIndex,
      buffer,
      undefined,
      splitOptions,
    );
    if (!r.ok) {
      message = `分割できません（${REASON_LABEL[r.reason] || r.reason}）`;
      fullRedraw();
      return;
    }
    uiMode = 'normal';
    boundaryCandidate = null;
    boundaryCandidateAtModeEnter = null;
    splitCandidate = null;
    splitCandidateAtModeEnter = null;
    // Keep focus on the original Section (the front half) after splitting.
    // The newly created back half remains available through normal Section navigation.
    selectSectionIndex(sectionIdx, { clearSplitContext: false });
    resetPlayToSectionStart();
    message = '分割しました。後半Sectionは必要に応じて選択して編集できます';
    if (returnToOverviewOnSplit) {
      onReturnToOverview?.({ reason: 'split-success', sectionId: selectedSectionId, historyAction: lastHistoryAction });
      return;
    }
    fullRedraw();
  }

  /** Listener / playback / shield only — does not touch parent Draft state. */
  function cleanupListeners() {
    advancePlayGeneration();
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
              { label: '変更を破棄して閉じる', value: 'discard' },
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
    if (closed || (typeof isCurrent === 'function' && !isCurrent()) || !document.getElementById('sr1-root')) return;
    const tag = (e.target && e.target.tagName) || '';
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.isComposing || e.keyCode === 229) return;

    // Esc — cancel split mode first; otherwise close path
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (uiMode === 'split') {
        cancelSplitMode({ returnToOverview: returnToOverviewOnSplit });
        return;
      }
      if (uiMode === 'boundary') {
        cancelBoundaryMode();
        return;
      }
      requestClose('esc').then(() => {});
      return;
    }

    if (inField) {
      // Enter commits the Section name and moves focus out of the text field.
      if (e.code === 'Enter' && tag === 'INPUT' && e.target?.classList?.contains('sr1-name')) {
        e.preventDefault();
        e.stopPropagation();
        applyNameTypeFromInputs();
        e.target.blur();
        root?.querySelector('.sr1-mode-btn.is-active')?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        beforeStructuralEdit();
        if (undoDraft(draft)) { lastHistoryAction = 'undo'; fullRedraw(); }
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        e.stopPropagation();
        beforeStructuralEdit();
        if (redoDraft(draft)) { lastHistoryAction = 'redo'; fullRedraw(); }
      }
      return;
    }

    if (e.code === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      if (uiMode === 'split') cancelSplitMode({ returnToOverview: false });
      if (uiMode === 'boundary') cancelBoundaryMode();
      if (e.shiftKey) selectSectionIndex(sectionIdx - 1);
      else selectSectionIndex(sectionIdx + 1);
      resetPlayToSectionStart();
      fullRedraw();
      return;
    }
    const modeKey = String(e.key || '').toLowerCase();
    if (modeKey === 'p' || modeKey === 'b' || modeKey === 's') {
      e.preventDefault();
      e.stopPropagation();
      if (modeKey === 'p') enterPlayMode();
      else if (modeKey === 'b') enterBoundaryMode();
      else enterBoundaryMode();
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
      if (uiMode === 'boundary') {
        moveBoundaryCandidate(delta);
      } else {
        setPlayPos(playCandidate + delta);
        fullRedraw();
      }
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (uiMode === 'boundary') {
        if (canEditCurrentBoundary()) executeBoundaryChange();
        else executeSplit();
      }
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
        if (undoDraft(draft)) { lastHistoryAction = 'undo'; fullRedraw(); }
      } else if ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
        beforeStructuralEdit();
        if (redoDraft(draft)) { lastHistoryAction = 'redo'; fullRedraw(); }
      }
    }
  }

  function bind() {
    root = document.getElementById('sr1-root');
    if (!root) return;
    bindChordGridInteractions(root);
    root.querySelector('#sr1-prev-sec')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      if (uiMode === 'split') cancelSplitMode({ returnToOverview: false });
      if (uiMode === 'boundary') cancelBoundaryMode();
      selectSectionIndex(sectionIdx - 1);
      resetPlayToSectionStart();
      fullRedraw();
    });
    root.querySelector('#sr1-next-sec')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      if (uiMode === 'split') cancelSplitMode({ returnToOverview: false });
      if (uiMode === 'boundary') cancelBoundaryMode();
      selectSectionIndex(sectionIdx + 1);
      resetPlayToSectionStart();
      fullRedraw();
    });
    root.querySelector('#sr1-play')?.addEventListener('click', testPlay);
    root.querySelector('#sr1-play-left')?.addEventListener('click', () => {
      // scroll sync after move in handler below
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
    root.querySelector('#sr1-mode-boundary')?.addEventListener('click', () => enterBoundaryMode());
    root.querySelector('#sr1-split-edit')?.addEventListener('click', () => enterSplitMode());
    // Panel surface click also switches mode (buttons inside still work)
    root.querySelector('.sr1-panel-play')?.addEventListener('click', (e) => {
      // Clicking a playback control must not clear a selected structural gap.
      if (e.target.closest('button, input, label')) return;
      if (uiMode !== 'normal') enterPlayMode();
    });
    root.querySelector('.sr1-panel-play')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (uiMode !== 'normal') enterPlayMode();
      }
    });
    root.querySelector('#sr1-boundary-exec')?.addEventListener('click', () => executeBoundaryChange());
    root.querySelector('#sr1-boundary-left')?.addEventListener('click', () => moveBoundaryCandidate(-1));
    root.querySelector('#sr1-boundary-right')?.addEventListener('click', () => moveBoundaryCandidate(1));
    root.querySelector('#sr1-boundary-cancel')?.addEventListener('click', () => cancelBoundaryMode());
    root.querySelector('#sr1-split-exec')?.addEventListener('click', () => executeSplit());
    root.querySelector('#sr1-return-overview')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      onReturnToOverview?.({ reason: 'back-to-overview', sectionId: selectedSectionId, historyAction: lastHistoryAction });
    });
    root.querySelector('#sr1-close')?.addEventListener('click', () => { requestClose('external').then(() => {}); });
    root.querySelector('#sr1-undo')?.addEventListener('click', () => {
      beforeStructuralEdit();
      if (undoDraft(draft)) { fullRedraw(); }
    });
    root.querySelector('#sr1-redo')?.addEventListener('click', () => {
      beforeStructuralEdit();
      if (redoDraft(draft)) { fullRedraw(); }
    });
    root.querySelector('#sr1-delete-sec')?.addEventListener('click', deleteCurrentInvalid);
    root.querySelector('.sr1-name')?.addEventListener('change', () => applyNameTypeFromInputs());
    root.querySelector('.sr1-type')?.addEventListener('change', () => onTypeChangeLive());
  }

  resetPlayToSectionStart();
  onKeyShield?.();
  keyHandler = onKeyDown;

  openModal({
    title: 'Section設定',
    body: bodyHtml(),
    // Outside click must not close. Escape may be routed here with source==='escape'.
    onRequestClose: (source) => {
      if (source === 'overlay' || source === 'escape') {
        requestClose(source === 'escape' ? 'esc' : 'external').then(() => {});
      }
    },
    onOpen: () => {
      // F1: if already closed (e.g. project switch during 80ms delay), do not register
      if (closed || (typeof isCurrent === 'function' && !isCurrent())) return;
      root = document.getElementById('sr1-root');
      bind();
      // The first chord of the selected Section must be the first visible row,
      // whether Stage1 was opened directly or returned from the Stage2 overview.
      scrollSectionStartToTop({ refresh: true });
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
    suspend: () => {
      if (closed) return { sectionId: selectedSectionId };
      applyNameTypeFromInputs();
      stopPlayIfNeeded();
      if (keyHandler) {
        document.removeEventListener('keydown', keyHandler, true);
        keyHandler = null;
      }
      // Keep the global Space shield active while Stage2 replaces this modal.
      closed = true;
      return { sectionId: selectedSectionId };
    },
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
