/**
 * Section reconfiguration Stage 1 modal (Phase150).
 * UI only — does not mutate analysisEditor.sections until onAdopt succeeds.
 */
import {
  draftSectionChordSpans,
  updateDraftSection,
  setDraftSectionEndByChordIndex,
  pushDraftUndo,
} from './sectionReconfiguration.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/**
 * @param {object} p
 * @param {Function} p.openModal
 * @param {Function} p.mkMBtn
 * @param {object} p.draft - reconfiguration draft (mutated in place for UI edits)
 * @param {Array} p.buffer
 * @param {Array<{value:string,label:string}>} p.sectionTypes
 * @param {(draft:object)=>Promise<{ok:boolean,message?:string}>} p.onAdopt
 * @param {()=>void} [p.onCancel]
 * @param {(opts:{startSec:number,endSec:number})=>void} [p.onTestPlay]
 * @param {()=>void} [p.onTestStop]
 * @param {()=>void} [p.onKeyShield] - call to mark modal open for Space shielding
 * @param {()=>void} [p.onKeyUnshield]
 */
export function openSectionReconfigurationModal(p) {
  const {
    openModal, mkMBtn, draft, buffer, sectionTypes,
    onAdopt, onCancel, onTestPlay, onTestStop, onKeyShield, onKeyUnshield,
  } = p;

  let sectionIdx = 0;
  let cursor = 0; // chord index focus
  let playStartOffset = 1; // second-to-last by default within section → end-1
  let busy = false;
  let message = '';
  let root = null;

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

  function sectionPanelHtml() {
    const sp = spans();
    const sec = draft.sections[sectionIdx];
    if (!sec) return '<p class="sag-errors">Section がありません</p>';
    const typeOpts = (sectionTypes || []).map(t =>
      `<option value="${esc(t.value)}" ${t.value === sec.type ? 'selected' : ''}>${esc(t.label)}</option>`
    ).join('');
    return `
      <div class="sr1-section-meta">
        <div class="sr1-sec-idx">Section ${sectionIdx + 1} / ${draft.sections.length}</div>
        <label class="sr1-field">名前
          <input type="text" class="mi sr1-name" value="${esc(sec.name)}" autocomplete="off" />
        </label>
        <label class="sr1-field">種類
          <select class="mi sr1-type">${typeOpts}</select>
        </label>
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
          コードの最後を選んで Section の区切りを決めます。採用するまで曲の Section は変わりません。
        </div>
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
        <div class="sr1-keys-hint">←→:コード　Tab/Shift+Tab:Section　Space:再生　Enter:区切り</div>
      </div>`;
  }

  function redraw() {
    ensureCursorInSection();
    const el = document.getElementById('sr1-root');
    if (!el) return;
    el.innerHTML = bodyHtml().replace(/^[\s\S]*id="sr1-root"[^>]*>/, '').replace(/<\/div>\s*$/, '');
    // simpler: replace whole modal body content
  }

  function fullRedraw() {
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
    if (nameEl && nameEl.value !== sec.name) patch.name = nameEl.value;
    if (typeEl && typeEl.value !== sec.type) patch.type = typeEl.value;
    if (Object.keys(patch).length) updateDraftSection(draft, sec.id, patch);
  }

  function setEndAtCursor() {
    applyNameTypeFromInputs();
    const r = setDraftSectionEndByChordIndex(draft, sectionIdx, cursor, buffer);
    if (!r.ok) {
      message = `区切りを設定できません（${r.reason}）`;
    } else {
      message = '';
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

  function onKeyDown(e) {
    if (!document.getElementById('sr1-root')) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.code === 'Tab') { /* allow default inside inputs? still handle section tab */ }
      else return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      testPlay();
      return;
    }
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      cursor = Math.max(0, cursor - 1);
      fullRedraw();
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      cursor = Math.min(buffer.length - 1, cursor + 1);
      fullRedraw();
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      applyNameTypeFromInputs();
      if (e.shiftKey) sectionIdx = Math.max(0, sectionIdx - 1);
      else sectionIdx = Math.min(draft.sections.length - 1, sectionIdx + 1);
      ensureCursorInSection();
      fullRedraw();
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      setEndAtCursor();
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
      btn.addEventListener('dblclick', () => {
        cursor = Number(btn.dataset.i);
        setEndAtCursor();
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
      sectionIdx = Math.min(draft.sections.length - 1, sectionIdx + 1);
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
    root.querySelector('.sr1-name')?.addEventListener('change', () => applyNameTypeFromInputs());
    root.querySelector('.sr1-type')?.addEventListener('change', () => applyNameTypeFromInputs());
  }

  ensureCursorInSection();
  onKeyShield?.();

  openModal({
    title: 'Section再設定',
    body: bodyHtml(),
    onOpen: () => {
      root = document.getElementById('sr1-root');
      bind();
      document.addEventListener('keydown', onKeyDown, true);
      scrollCursorIntoView();
    },
    buttons: (close) => {
      const cancelBtn = mkMBtn('キャンセル', '', () => {
        applyNameTypeFromInputs();
        document.removeEventListener('keydown', onKeyDown, true);
        onTestStop?.();
        onKeyUnshield?.();
        onCancel?.();
        close();
      });
      const adoptBtn = mkMBtn('採用', 'ok', async () => {
        if (busy) return;
        applyNameTypeFromInputs();
        busy = true;
        adoptBtn.disabled = true;
        const result = await onAdopt(draft);
        busy = false;
        if (result?.ok) {
          document.removeEventListener('keydown', onKeyDown, true);
          onTestStop?.();
          onKeyUnshield?.();
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
}
