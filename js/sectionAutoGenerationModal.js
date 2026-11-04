/**
 * Section auto-generation: confirmation modal (UI only).
 *
 * The draft lives only in this closure. Nothing here touches song data: the
 * caller's onAdopt() re-verifies the editor/disk state and applies the Sections.
 * Boundaries are never auto-sorted or auto-corrected; errors are shown and
 * the adopt button stays disabled until the user fixes them.
 */
import { buildSectionsFromDraft } from './sectionAutoGeneration.js';

const esc = s => String(s).replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function describeError(e) {
  const bar = Number.isFinite(e.bar) ? `${e.bar + 1}小節目` : '';
  switch (e.reason) {
    case 'invalid-bar': return '小節位置は2以上の整数で入力してください';
    case 'not-ascending': return `${bar}: 前の境界より後ろの小節にしてください`;
    case 'no-chord-at-or-after-bar': return `${bar}以降にコードがありません`;
    case 'collapses-onto-previous': return `${bar}: 前の境界と同じコードになります`;
    case 'invalid-section-name': return '名前を入力してください';
    default: return `検証エラー: ${e.reason}`;
  }
}

/**
 * @param {object} p
 * @param {Function} p.openModal / p.mkMBtn - injected (same pattern as chartChordEditModal)
 * @param {Array} p.draft - from createDraftFromBoundaries()
 * @param {Array} p.buffer - chord buffer (read-only here)
 * @param {(chord:object)=>(number|null)} p.measureOf
 * @param {number} p.measureCount
 * @param {Array<{value:string,label:string}>} p.sectionTypes
 * @param {(draft:Array)=>Promise<{ok:boolean,message?:string}>} p.onAdopt
 * @param {{warnings?:string[]}} [p.notes]
 */
export function openSectionAutoGenerationModal({
  openModal, mkMBtn, draft: initialDraft, buffer, measureOf, measureCount, sectionTypes, onAdopt, notes = {},
}) {
  const draft = initialDraft.map(d => ({ ...d }));
  let adoptBtn = null;
  let busy = false;
  let adoptMessage = ''; // reason the last adopt attempt was refused (cleared on the next edit)
  let seq = draft.length;

  const typeOptions = value => sectionTypes
    .map(t => `<option value="${esc(t.value)}"${t.value === value ? ' selected' : ''}>${esc(t.label)}</option>`).join('');

  const barText = d => {
    const n = d.diagnostics;
    if (!n) return '';
    return `前後4小節の変化 ${Math.round(n.changeAround4Bars * 100)}% ・ 前の境界から ${n.barsFromPrevious}小節 ・ 4/8小節単位: ${n.alignedTo4or8 ? '○' : '×'}`;
  };

  function rowsHtml() {
    return draft.map((d, i) => `
      <div class="sag-row" data-i="${i}">
        <div class="sag-row-main">
          ${i === 0
            ? '<span class="sag-bar sag-bar--fixed">1小節目</span>'
            : `<input type="number" class="mi sag-bar-in" data-i="${i}" min="2" max="${measureCount}" step="1"
                 value="${Number.isFinite(d.startBar) ? d.startBar + 1 : ''}" aria-label="境界の小節位置"><span class="sag-unit">小節目から</span>`}
          <select class="mi sag-type-in" data-i="${i}" aria-label="種類">${typeOptions(d.type)}</select>
          <input type="text" class="mi sag-name-in" data-i="${i}" value="${esc(d.name)}" aria-label="名前">
          ${i === 0 ? '' : `<button type="button" class="sec-btn sag-del" data-i="${i}" title="この境界を削除">削除</button>`}
        </div>
        <div class="sag-row-info" data-info="${i}">${esc(barText(d))}</div>
      </div>`).join('');
  }

  function validate({ keepAdoptMessage = false } = {}) {
    if (!keepAdoptMessage) adoptMessage = '';
    let previewSeq = 0; // preview-only IDs (never applied); must be unique for set validation
    const built = buildSectionsFromDraft(draft, buffer, measureOf, () => `preview-${previewSeq++}`);
    const root = document.getElementById('sag-root');
    if (!root) return built;
    root.querySelectorAll('[data-info]').forEach(el => {
      const i = Number(el.dataset.info);
      const range = built.ranges?.[i];
      const snapped = range?.snapped ? ` ⚠ コードが無いため${range.actualBar + 1}小節目から開始します` : '';
      el.textContent = barText(draft[i]) + snapped;
    });
    const errEl = document.getElementById('sag-errors');
    if (errEl) {
      const messages = [...new Set(built.errors.map(describeError))];
      const shown = messages.slice(0, 3).join(' / ');
      errEl.textContent = built.ok ? adoptMessage
        : shown + (messages.length > 3 ? ` ほか${messages.length - 3}件` : '');
    }
    if (adoptBtn) adoptBtn.disabled = !built.ok || busy;
    return built;
  }

  function bind() {
    const root = document.getElementById('sag-root');
    root.querySelectorAll('.sag-bar-in').forEach(el => el.addEventListener('input', () => {
      draft[Number(el.dataset.i)].startBar = el.value === '' ? NaN : Number(el.value) - 1;
      validate();
    }));
    root.querySelectorAll('.sag-name-in').forEach(el => el.addEventListener('input', () => {
      draft[Number(el.dataset.i)].name = el.value;
      validate();
    }));
    root.querySelectorAll('.sag-type-in').forEach(el => el.addEventListener('change', () => {
      const d = draft[Number(el.dataset.i)];
      const label = sectionTypes.find(t => t.value === el.value)?.label ?? el.value;
      // Only follow the type while the name is still the untouched default.
      if (d.name === '未設定') {
        d.name = label;
        root.querySelector(`.sag-name-in[data-i="${el.dataset.i}"]`).value = label;
      }
      d.type = el.value;
      validate();
    }));
    root.querySelectorAll('.sag-del').forEach(el => el.addEventListener('click', () => {
      draft.splice(Number(el.dataset.i), 1);
      redraw(); // focus returns to the list so keyboard users can keep going
    }));
    document.getElementById('sag-add')?.addEventListener('click', () => {
      const last = draft[draft.length - 1];
      const next = Number.isFinite(last.startBar) ? Math.min(last.startBar + 8, measureCount - 1) : 1;
      draft.push({ candidateId: `cand-${seq++}`, startBar: next, name: '未設定', type: 'other', diagnostics: null });
      redraw();
      root.querySelector(`.sag-bar-in[data-i="${draft.length - 1}"]`)?.focus();
    });
  }

  function redraw() {
    document.getElementById('sag-rows').innerHTML = rowsHtml();
    bind();
    validate();
  }

  openModal({
    title: 'Sectionを自動生成（候補の確認）',
    body: `
      <div id="sag-root">
        <div class="modal-caption modal-section">
          曲のコード進行から区切り位置の候補を作りました。目安です。必ず確認し、必要なら直してください。
          「採用」を押すまで曲のデータは変わりません。
        </div>
        ${(notes.warnings ?? []).map(w => `<div class="sag-warn">⚠ ${esc(w)}</div>`).join('')}
        <div id="sag-rows" class="sag-rows"></div>
        <button type="button" class="sec-btn" id="sag-add">＋ 境界を追加</button>
        <div id="sag-errors" class="sag-errors" role="alert"></div>
      </div>`,
    onOpen: () => { redraw(); },
    buttons: (close) => {
      adoptBtn = mkMBtn('採用', 'ok', async () => {
        if (busy) return;
        busy = true; adoptBtn.disabled = true;
        const result = await onAdopt(draft.map(d => ({ ...d })));
        busy = false;
        if (result.ok) { close(); return; }
        adoptMessage = result.message ?? '適用できませんでした';
        validate({ keepAdoptMessage: true });
      });
      return [mkMBtn('破棄', '', close), adoptBtn];
    },
  });
}
