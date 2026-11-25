/**
 * Phase150 Stage2 — all-Section overview modal.
 * UI-only: every edit is applied to the shared Draft; persisted Sections are untouched.
 */
import {
  mergeDraftWithPrevious,
  undoDraft,
  redoDraft,
  isDraftDirty,
} from './sectionReconfiguration.js';
import {
  buildSectionOverview,
  canMergeWithPrevious,
  diffSections,
} from './sectionOverview.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function captureSignatures(sections) {
  return (Array.isArray(sections) ? sections : [])
    .filter(section => section?.id)
    .map(section => ({
      id: section.id,
      type: section.type ?? null,
      name: section.name ?? null,
      startChordId: section.startChordId ?? null,
      endChordId: section.endChordId ?? null,
    }));
}

function sectionName(section) {
  const name = String(section?.name ?? '').trim();
  return name || '名称未設定';
}

function reasonText(reason) {
  return ({
    'no-prev': '前のSectionがありません',
    invalid: '要修正',
    gap: '隙間があります',
    overlap: '重なりがあります',
  })[reason] || '結合できません';
}

export function openSectionOverviewModal(p) {
  const {
    openModal,
    mkMBtn,
    draft,
    buffer,
    timing,
    runtime,
    sectionTypes = [],
    typeLabel,
    onEditSplit,
    onAdopt,
    onClose,
    onTestStop,
    onKeyShield,
    onKeyUnshield,
    confirmChoice,
    isCurrent,
  } = p;

  let root = null;
  let closed = false;
  let closing = false;
  let busy = false;
  let message = '';
  let overview = { rows: [], invalidRows: [] };
  let highlightIds = new Set();
  let clearTimer = null;
  let scrollHandler = null;

  function isActive() {
    return !closed && (typeof isCurrent !== 'function' || isCurrent());
  }

  function getTypeLabel(type) {
    if (typeof typeLabel === 'function') {
      try { return typeLabel(type); } catch { /* use local labels */ }
    }
    const match = sectionTypes.find(item => item?.value === type);
    return match?.label || (type ? String(type) : '種類未設定');
  }

  function signatures() {
    return captureSignatures(draft.sections);
  }

  function scheduleHighlightClear() {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      if (!isActive()) return;
      clearTimer = null;
      message = '';
      highlightIds = new Set();
      render({ skipDiff: true });
    }, 3200);
  }

  function showMessage(text) {
    message = text || '';
    scheduleHighlightClear();
  }

  function inferChangeMessage(diff, before, after, historyAction = null) {
    const hasAdded = diff.added.length > 0;
    const hasRemoved = diff.removed.length > 0;
    const hasChanged = diff.changed.length > 0;
    if (!hasAdded && !hasRemoved && !hasChanged) return '';

    if (historyAction === 'undo') {
      if (hasAdded && !hasRemoved) return '元に戻しました（結合）';
      if (hasRemoved && !hasAdded) return '元に戻しました（分割）';
      return '';
    }
    if (historyAction === 'redo') {
      if (hasRemoved && !hasAdded) return 'やり直しました（結合）';
      if (hasAdded && !hasRemoved) return 'やり直しました（分割）';
      return '';
    }

    if (hasRemoved && !hasAdded) {
      const removed = before.find(section => section.id === diff.removed[0]);
      const changed = after.find(section => section.id === diff.changed[0]);
      if (!removed || !changed) return '';
      return `「「${sectionName(changed)}」と「${sectionName(removed)}」を結合しました」`;
    }
    if (hasAdded && !hasRemoved) {
      const changed = after.find(section => section.id === diff.changed[0]);
      if (!changed) return '';
      return `「「${sectionName(changed)}」を分割しました（後半は同じ名前・カテゴリー）」`;
    }
    return '';
  }

  function rowStatusLabel(status) {
    return ({
      incomplete: '名称・種類未設定',
      overlap: '重なりあり',
      'gap-after': '後ろに隙間あり',
      invalid: '要修正',
    })[status] || '';
  }

  function compareHtml(row) {
    if (!row.compare || !Number.isFinite(row.compare.ratio)) {
      return '<div class="s2-compare s2-compare-unavailable"><span>同カテゴリー比較</span><span>—</span></div>';
    }
    const percent = Math.max(0, Math.min(100, row.compare.ratio * 100));
    return `
      <div class="s2-compare">
        <span class="s2-compare-label">${esc(getTypeLabel(row.compare.groupKey))}内の長さ</span>
        <div class="s2-compare-track" aria-label="同カテゴリー内の長さ比較">
          <span class="s2-compare-fill" style="width:${percent.toFixed(2)}%"></span>
        </div>
        <span class="s2-compare-value">${Math.round(percent)}%</span>
      </div>`;
  }

  function cardHtml(row, index, invalid = false) {
    const status = rowStatusLabel(row.status);
    const highlighted = highlightIds.has(row.id);
    const name = row.name ? esc(row.name) : '名称未設定';
    const type = row.type ? esc(getTypeLabel(row.type)) : '種類未設定';
    const label = invalid ? '要修正' : `Section ${index + 1}`;
    return `
      <article class="s2-card ${invalid ? 's2-card-invalid' : ''} ${highlighted ? 'is-highlighted' : ''}" id="s2-card-${esc(row.id)}" data-section-id="${esc(row.id)}">
        <div class="s2-card-head">
          <div class="s2-card-title">
            <span class="s2-card-index">${label}</span>
            <strong>${name}</strong>
            <span class="s2-card-type">${type}</span>
            ${status ? `<span class="s2-status s2-status-${esc(row.status)}">${esc(status)}</span>` : ''}
          </div>
          <button type="button" class="sec-btn s2-edit-btn" data-s2-edit="${esc(row.id)}">編集・分割</button>
        </div>
        <div class="s2-card-meta">
          <span><small>開始</small>${esc(row.view.startLabel)}</span>
          <span><small>長さ</small>${esc(row.view.lengthLabel)}${row.view.lengthSub ? ` <em>${esc(row.view.lengthSub)}</em>` : ''}</span>
          <span><small>時間</small>${esc(row.view.secondsLabel)}</span>
        </div>
        ${invalid ? '<div class="s2-invalid-note">このSectionは構造的に不正です。編集・分割から確認してください</div>' : compareHtml(row)}
      </article>`;
  }

  function mergeButtonHtml(sectionId, prevId, eligibility, invalidGroup = false) {
    const disabled = invalidGroup || !eligibility?.ok;
    const reason = invalidGroup ? '要修正' : reasonText(eligibility?.reason);
    const title = disabled ? reason : '直前のSectionと結合';
    return `
      <div class="s2-merge-row">
        <button type="button" class="s2-merge-btn" data-s2-merge="${esc(sectionId)}" data-prev-id="${esc(prevId || '')}" title="${esc(title)}" ${disabled ? 'disabled' : ''}>
          <span aria-hidden="true">↕</span> ${disabled ? esc(reason) : '前と結合'}
        </button>
      </div>`;
  }

  function listHtml() {
    const rows = overview.rows || [];
    const invalidRows = overview.invalidRows || [];
    const validHtml = rows.map((row, index) => {
      const card = cardHtml(row, index, false);
      if (index >= rows.length - 1) return card;
      const next = rows[index + 1];
      const eligibility = canMergeWithPrevious(draft, buffer, next.id);
      return card + mergeButtonHtml(next.id, eligibility.prevId, eligibility, false);
    }).join('');

    const invalidHtml = invalidRows.map((row, index) => {
      const card = cardHtml(row, index, true);
      if (index >= invalidRows.length - 1) return card;
      return card + mergeButtonHtml(invalidRows[index + 1].id, null, { ok: false, reason: 'invalid' }, true);
    }).join('');

    return `
      <div class="s2-scroll" id="s2-scroll">
        ${rows.length
          ? `<div class="s2-card-list">${validHtml}</div>`
          : '<div class="s2-empty">Sectionがありません</div>'}
        ${invalidRows.length ? `
          <section class="s2-invalid-group">
            <h4>要修正（構造的に不正なSection）</h4>
            <div class="s2-card-list">${invalidHtml}</div>
          </section>` : ''}
      </div>`;
  }

  function bodyHtml() {
    const canUndo = (draft.undoStack?.length || 0) > 0;
    const canRedo = (draft.redoStack?.length || 0) > 0;
    return `
      <div class="s2-root" id="s2-root">
        <div class="s2-toolbar">
          <div class="s2-history">
            <button type="button" class="sec-btn" id="s2-undo" ${canUndo ? '' : 'disabled'} aria-label="元に戻す">↶ Undo</button>
            <button type="button" class="sec-btn" id="s2-redo" ${canRedo ? '' : 'disabled'} aria-label="やり直す">↷ Redo</button>
          </div>
          <button type="button" class="sec-btn s2-close" id="s2-close" aria-label="閉じる">✕</button>
        </div>
        <div class="s2-message" id="s2-message" role="status" aria-live="polite">${esc(message)}</div>
        ${listHtml()}
      </div>`;
  }

  function scrollToHighlighted() {
    if (!root || !highlightIds.size) return;
    const id = highlightIds.values().next().value;
    const card = root.querySelector(`[data-section-id="${CSS.escape(String(id))}"]`);
    try { card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { /* ignore */ }
  }

  function render(opts = {}) {
    if (!isActive()) return;
    const before = Array.isArray(opts.beforeOverride)
      ? opts.beforeOverride
      : (Array.isArray(runtime.view?.lastSeenSigs) ? runtime.view.lastSeenSigs : null);
    const after = signatures();
    if (!opts.skipDiff && before) {
      const diff = diffSections(before, after);
      const changed = diff.added.length || diff.changed.length || diff.removed.length;
      if (changed) {
        highlightIds = new Set([...diff.added, ...diff.changed]);
        const changeMessage = inferChangeMessage(diff, before, after, opts.historyAction ?? null);
        message = changeMessage;
        scheduleHighlightClear();
      }
    }
    runtime.view.lastSeenSigs = after;
    overview = buildSectionOverview(draft, buffer, timing);
    const oldScroll = root?.querySelector('#s2-scroll')?.scrollTop;
    if (root) {
      const wrap = document.createElement('div');
      wrap.innerHTML = bodyHtml();
      const next = wrap.firstElementChild;
      root.replaceWith(next);
      root = next;
      const scroll = root.querySelector('#s2-scroll');
      if (scroll) scroll.scrollTop = Number.isFinite(oldScroll)
        ? oldScroll
        : (Number(runtime.view?.scrollTop) || 0);
      bind();
      if (highlightIds.size) requestAnimationFrame(scrollToHighlighted);
    }
  }

  function saveScrollTop() {
    const scroll = root?.querySelector('#s2-scroll');
    if (scroll && runtime.view) runtime.view.scrollTop = scroll.scrollTop;
  }

  function bind() {
    if (!root) return;
    root.querySelector('#s2-close')?.addEventListener('click', () => { requestClose('external').then(() => {}); });
    root.querySelector('#s2-undo')?.addEventListener('click', () => {
      const before = signatures();
      if (undoDraft(draft)) render({ beforeOverride: before, historyAction: 'undo' });
    });
    root.querySelector('#s2-redo')?.addEventListener('click', () => {
      const before = signatures();
      if (redoDraft(draft)) render({ beforeOverride: before, historyAction: 'redo' });
    });
    root.querySelectorAll('[data-s2-edit]').forEach(button => {
      button.addEventListener('click', () => {
        saveScrollTop();
        const sectionId = button.dataset.s2Edit;
        onEditSplit?.(sectionId);
      });
    });
    root.querySelectorAll('[data-s2-merge]').forEach(button => {
      button.addEventListener('click', () => {
        const sectionId = button.dataset.s2Merge;
        const expectedPrevId = button.dataset.prevId;
        const eligibility = canMergeWithPrevious(draft, buffer, sectionId);
        if (!eligibility.ok || eligibility.prevId !== expectedPrevId) {
          showMessage(reasonText(eligibility.reason));
          render({ skipDiff: true });
          return;
        }
        const before = signatures();
        const sectionIndex = draft.sections.findIndex(section => section?.id === sectionId);
        const result = mergeDraftWithPrevious(draft, sectionIndex, buffer);
        if (!result.ok) {
          showMessage(reasonText(result.reason));
          render({ skipDiff: true });
          return;
        }
        render({ beforeOverride: before });
      });
    });
    const scroll = root.querySelector('#s2-scroll');
    if (scroll) {
      scrollHandler = () => {
        if (runtime.view) runtime.view.scrollTop = scroll.scrollTop;
      };
      scroll.addEventListener('scroll', scrollHandler, { passive: true });
    }
  }

  function cleanupListeners() {
    if (scrollHandler) {
      root?.querySelector('#s2-scroll')?.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = null;
    onTestStop?.();
    onKeyUnshield?.();
  }

  async function requestClose(reason, opts = {}) {
    if (closed) return true;
    if (closing) return false;
    closing = true;
    try {
      if (reason !== 'adopt') {
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
      }
      closed = true;
      cleanupListeners();
      onClose?.(reason);
      return true;
    } finally {
      if (!closed) closing = false;
    }
  }

  // Initial projection and signature snapshot are taken before the modal opens.
  render();
  onKeyShield?.();
  openModal({
    title: 'Section一覧',
    body: bodyHtml(),
    onRequestClose: source => {
      if (source === 'overlay' || source === 'escape') {
        requestClose(source === 'escape' ? 'esc' : 'external').then(() => {});
      }
    },
    onOpen: () => {
      if (!isActive()) return;
      root = document.getElementById('s2-root');
      bind();
      const scroll = root?.querySelector('#s2-scroll');
      if (scroll) scroll.scrollTop = Number(runtime.view?.scrollTop) || 0;
      scrollToHighlighted();
    },
    buttons: close => {
      const cancelBtn = mkMBtn('キャンセル', '', async () => {
        if (busy || closed) return;
        const ok = await requestClose('cancel');
        if (ok) close();
      });
      const adoptBtn = mkMBtn('採用', 'ok', async () => {
        if (busy || closed) return;
        busy = true;
        adoptBtn.disabled = true;
        const result = await onAdopt(draft);
        busy = false;
        if (result?.ok) {
          await requestClose('adopt', { skipConfirm: true });
          close();
          return;
        }
        showMessage(result?.message ?? '採用できませんでした');
        render({ skipDiff: true });
        adoptBtn.disabled = false;
      });
      return [cancelBtn, adoptBtn];
    },
  });

  return {
    suspend: () => {
      if (closed) return { scrollTop: Number(runtime.view?.scrollTop) || 0 };
      saveScrollTop();
      if (scrollHandler) {
        root?.querySelector('#s2-scroll')?.removeEventListener('scroll', scrollHandler);
        scrollHandler = null;
      }
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = null;
      closed = true;
      onTestStop?.();
      return { scrollTop: Number(runtime.view?.scrollTop) || 0 };
    },
    cleanup: () => {
      if (closed && !scrollHandler) return;
      closed = true;
      cleanupListeners();
    },
    forceClose: () => {
      if (closed && !scrollHandler) {
        onClose?.('external');
        return Promise.resolve(true);
      }
      return requestClose('external', { skipConfirm: true });
    },
  };
}
