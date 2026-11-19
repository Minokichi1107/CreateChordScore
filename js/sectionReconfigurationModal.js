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
  isDraftDirty,
  undoDraft,
  redoDraft,
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
export function openSectionReconfigurationModal(p) {
  const {
    openModal, mkMBtn, draft, buffer, sectionTypes,
    onAdopt, onClose, onTestPlay, onTestStop, onKeyShield, onKeyUnshield, confirmChoice,
    generateSectionName,
  } = p;

  let sectionIdx = 0;
  /** UI-only: name field typed this visit; not written to Draft until change/blur. */
  let nameInputSoftLock = false;
  let cursor = 0;
  let playStartOffset = 1;
  let busy = false;
  let message = '';
  let root = null;
  let closed = false;
  let keyHandler = null;
  let closing = false; // re-entrancy guard

  function spans() {
    return draftSectionChordSpans(draft, buffer);
  }

  function ensureCursorInSection() {
    const sp = spans();
    if (!sp.length) { cursor = 0; return; }
    if (sectionIdx >= sp.length) sectionIdx = sp.length - 1;
    if (sectionIdx < 0) sectionIdx = 0;
    const s = sp[sectionIdx];
    if (!s.valid) return;
    if (cursor < s.start || cursor > s.end) cursor = s.end;
  }

  function chordLabel(c) {
    if (!c) return '?';
    if (c.chord) return String(c.chord);
    return '(空)';
  }

  function invalidBannerHtml() {
    const issues = diagnoseDraftSections(draft, buffer).filter(x => !x.valid);
    if (!issues.length) return '';
    const lines = issues.map(x => {
      const labels = x.reasons.map(r => REASON_LABEL[r] || r).join('、');
      const repair = x.repairableByBoundary
        ? '（境界の調整で修復できる場合があります）'
        : '（削除が必要です）';
      return `<li data-invalid-index="${x.index}">Section ${x.index + 1}: ${esc(labels)}${repair}</li>`;
    }).join('');
    return `<div class="sr1-invalid" role="alert">
      <div class="sr1-invalid-title">不正なSectionがあります。採用前に解消してください。</div>
      <ul class="sr1-invalid-list">${lines}</ul>
    </div>`;
  }

  function sectionPanelHtml() {
    const sec = draft.sections[sectionIdx];
    if (!sec) return '<p class="sag-errors">Section がありません</p>';
    const diagList = diagnoseDraftSections(draft, buffer);
    const diag = diagList[sectionIdx] || diagnoseDraftSection(sec, buffer);
    const typeOpts = (sectionTypes || []).map(t =>
      `<option value="${esc(t.value)}" ${t.value === sec.type ? 'selected' : ''}>${esc(t.label)}</option>`
    ).join('');
    const invalidNote = diag.valid ? '' :
      `<div class="sr1-sec-invalid">このSectionは不正です: ${esc((diag.reasons || []).map(r => REASON_LABEL[r] || r).join('、'))}</div>
       <button type="button" class="sec-btn sr1-danger" id="sr1-delete-sec">この不正Sectionを削除</button>`;
    return `
      <div class="sr1-section-meta">
        <div class="sr1-sec-idx">Section ${sectionIdx + 1} / ${draft.sections.length}</div>
        <label class="sr1-field">名前
          <input type="text" class="mi sr1-name" value="${esc(sec.name)}" autocomplete="off" />
        </label>
        <label class="sr1-field">種類
          <select class="mi sr1-type">${typeOpts}</select>
        </label>
        ${invalidNote}
      </div>`;
  }

  function chordsHtml() {
    const sp = spans();
    const active = sp[sectionIdx];
    const boundaryEnds = new Set(sp.filter(s => s.valid).map(s => s.end));
    return `<div class="sr1-chords" tabindex="0" role="listbox" aria-label="コード進行">
      ${buffer.map((c, i) => {
        const inSec = active?.valid && i >= active.start && i <= active.end;
        const isCursor = i === cursor;
        const isBoundary = boundaryEnds.has(i);
        const cls = [
          'sr1-chord',
          inSec ? 'sr1-in-sec' : '',
          isCursor ? 'sr1-cursor' : '',
          isBoundary ? 'sr1-boundary' : '',
        ].filter(Boolean).join(' ');
        return `<button type="button" class="${cls}" data-i="${i}" role="option" aria-selected="${isCursor}">${esc(chordLabel(c))}</button>`;
      }).join('')}
    </div>`;
  }

  function playHintHtml() {
    const sp = spans()[sectionIdx];
    if (!sp?.valid) return '';
    const startIdx = Math.max(sp.start, Math.min(sp.end, sp.end - playStartOffset));
    return `<div class="sr1-play-hint">テスト再生: コード ${startIdx + 1} → Section終端（開始位置は［再生開始←→］で変更）</div>`;
  }

  function bodyHtml() {
    return `
      <div id="sr1-root" class="sr1-root">
        <div class="modal-caption modal-section">
          コードの最後を選んで「ここを区切り」または Enter で確定します。シングルクリックは選択のみです。採用するまで曲の Section は変わりません。
        </div>
        ${invalidBannerHtml()}
        ${sectionPanelHtml()}
        ${playHintHtml()}
        ${chordsHtml()}
        <div class="sr1-toolbar">
          <button type="button" class="sec-btn" id="sr1-prev-sec">← Section</button>
          <button type="button" class="sec-btn" id="sr1-next-sec">Section →</button>
          <button type="button" class="sec-btn" id="sr1-set-end">ここを区切り（B）</button>
          <button type="button" class="sec-btn" id="sr1-play">テスト再生</button>
          <button type="button" class="sec-btn" id="sr1-play-earlier">再生開始←</button>
          <button type="button" class="sec-btn" id="sr1-play-later">再生開始→</button>
        </div>
        <div id="sr1-msg" class="sag-errors" role="status">${esc(message)}</div>
        <div class="sr1-keys-hint">←→:コード　Tab/Shift+Tab:Section　Space:再生　Enter:区切り確定　Esc:閉じる</div>
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
    root?.querySelector('.sr1-cursor')?.scrollIntoView({ block: 'nearest', inline: 'center' });
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
      // Name/type committed into Draft (with undo). Soft lock no longer needed.
      if (patch.name !== undefined) nameInputSoftLock = false;
    }
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

  function setEndAtCursor() {
    applyNameTypeFromInputs();
    const r = setDraftSectionEndByChordIndex(draft, sectionIdx, cursor, buffer);
    if (!r.ok) {
      message = `区切りを設定できません（${REASON_LABEL[r.reason] || r.reason}）`;
    } else {
      message = '';
    }
    fullRedraw();
  }

  function deleteCurrentInvalid() {
    const sec = draft.sections[sectionIdx];
    if (!sec) return;
    const diagList = diagnoseDraftSections(draft, buffer);
    const diag = diagList[sectionIdx];
    if (!diag || diag.valid) {
      message = '有効なSectionの削除はStage1では行いません';
      fullRedraw();
      return;
    }
    // Delete by index so duplicate IDs only remove this row
    const r = deleteDraftSectionAt(draft, sectionIdx);
    if (!r.ok) {
      message = `削除できません（${REASON_LABEL[r.reason] || r.reason}）`;
    } else {
      message = '不正SectionをDraftから削除しました';
      if (sectionIdx >= draft.sections.length) sectionIdx = Math.max(0, draft.sections.length - 1);
    }
    fullRedraw();
  }

  function testPlay() {
    applyNameTypeFromInputs();
    const sp = spans()[sectionIdx];
    if (!sp?.valid) return;
    const startIdx = Math.max(sp.start, Math.min(sp.end, sp.end - playStartOffset));
    const c0 = buffer[startIdx];
    const c1 = buffer[sp.end];
    const startSec = Number(c0?.start);
    const endSec = Number(c1?.end ?? c1?.start);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      message = 'このコードに再生用の時刻がありません';
      fullRedraw();
      return;
    }
    onTestPlay?.({ startSec, endSec });
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

    // Esc — always handled here (capture). Outside click does not use this path.
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      requestClose('esc').then(() => {});
      return;
    }

    // F4: Tab / Shift+Tab move section even when focus is in name/type fields
    if (e.code === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      applyNameTypeFromInputs();
      nameInputSoftLock = false;
      if (e.shiftKey) sectionIdx = Math.max(0, sectionIdx - 1);
      else sectionIdx = Math.min(Math.max(0, draft.sections.length - 1), sectionIdx + 1);
      ensureCursorInSection();
      fullRedraw();
      return;
    }

    if (inField) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (undoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        e.stopPropagation();
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
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      cursor = Math.max(0, cursor - 1);
      fullRedraw();
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      cursor = Math.min(buffer.length - 1, cursor + 1);
      fullRedraw();
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      setEndAtCursor();
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
        if (undoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
      } else if ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
        if (redoDraft(draft)) { nameInputSoftLock = false; fullRedraw(); }
      }
    }
  }

  function bind() {
    root = document.getElementById('sr1-root');
    if (!root) return;
    root.querySelectorAll('.sr1-chord').forEach(btn => {
      btn.addEventListener('click', () => {
        cursor = Number(btn.dataset.i);
        fullRedraw();
      });
    });
    root.querySelector('#sr1-prev-sec')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      sectionIdx = Math.max(0, sectionIdx - 1);
      ensureCursorInSection();
      fullRedraw();
    });
    root.querySelector('#sr1-next-sec')?.addEventListener('click', () => {
      applyNameTypeFromInputs();
      sectionIdx = Math.min(Math.max(0, draft.sections.length - 1), sectionIdx + 1);
      ensureCursorInSection();
      fullRedraw();
    });
    root.querySelector('#sr1-set-end')?.addEventListener('click', setEndAtCursor);
    root.querySelector('#sr1-play')?.addEventListener('click', testPlay);
    root.querySelector('#sr1-play-earlier')?.addEventListener('click', () => {
      playStartOffset = Math.min(playStartOffset + 1, 20);
      fullRedraw();
    });
    root.querySelector('#sr1-play-later')?.addEventListener('click', () => {
      playStartOffset = Math.max(0, playStartOffset - 1);
      fullRedraw();
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

  ensureCursorInSection();
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
