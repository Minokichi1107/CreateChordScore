/**
 * Phase150 Stage2 — dedicated shared-boundary adjustment modal.
 * Draft-only: the caller applies one atomic update to the adjacent pair.
 */
import { canAdjustBoundaryWithNext } from './sectionReconfiguration.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function chordStart(buffer, index) {
  const value = buffer[index]?.start;
  return Number.isFinite(value) ? value : null;
}
function chordEnd(buffer, index) {
  const value = buffer[index]?.end ?? buffer[index]?.start;
  return Number.isFinite(value) ? value : null;
}

export function openSectionBoundaryAdjustModal(p) {
  const {
    openModal, mkMBtn, draft, buffer, prevId, nextId, runtime = null,
    sectionTypes = [],
    formatChord = chord => chord?.chord ?? '',
    onApply, onReturnToOverview, onTestPlay, onTestStop,
    onKeyShield, onKeyUnshield, isCurrent,
  } = p;
  const pair = canAdjustBoundaryWithNext(draft, buffer, prevId);
  if (!pair.ok || pair.nextId !== nextId) {
    onReturnToOverview?.({ reason: 'boundary-unavailable' });
    return { suspend: () => ({}), cleanup: () => {}, forceClose: () => Promise.resolve(true) };
  }

  let root = null;
  let closed = false;
  let busy = false;
  let message = '';
  const originalBoundary = pair.prevEndIdx;
  let candidate = originalBoundary;
  const initialRangeStart = Math.max(0, Math.min(pair.prevEndIdx - 2, buffer.length - 4));
  const initialRangeEnd = Math.min(buffer.length - 1, initialRangeStart + 3);
  let rangeStart = initialRangeStart;
  let rangeEnd = initialRangeEnd;
  let rangeEditTarget = 'start';
  let playing = false;
  let localPlayGeneration = 0;
  const currentPlayGeneration = () => runtime
    ? (Number(runtime.playGeneration) || 0)
    : localPlayGeneration;
  const advancePlayGeneration = () => {
    if (runtime) runtime.playGeneration = (Number(runtime.playGeneration) || 0) + 1;
    else localPlayGeneration += 1;
    return currentPlayGeneration();
  };
  let keyHandler = null;

  const active = () => !closed && (typeof isCurrent !== 'function' || isCurrent());
  const inRange = () => candidate >= rangeStart && candidate <= rangeEnd;

  function invalidatePlayback() {
    advancePlayGeneration();
    playing = false;
    onTestStop?.();
  }
  function chordLabel(index) {
    try { return formatChord(buffer[index], index); }
    catch { return String(buffer[index]?.chord ?? ''); }
  }
  function sectionIdentity(section) {
    const name = String(section?.name ?? '').trim() || '名称未設定';
    const type = sectionTypes.find(item => item?.value === section?.type)?.label
      || section?.type
      || '種類未設定';
    return { name, type };
  }
  function boundaryListHtml() {
    const items = [];
    for (let i = pair.prevStartIdx; i <= pair.nextEndIdx - 1; i++) {
      const selected = i === candidate;
      const current = i === originalBoundary;
      items.push(`
        <button type="button" class="sba-chord ${selected ? 'is-boundary' : ''} ${current ? 'is-current-boundary' : ''}" data-sba-candidate="${i}" aria-pressed="${selected}">
          <span class="sba-chord-name">${esc(chordLabel(i))}</span>
          ${selected ? `<span class="sba-boundary-caption">${current ? '現在の境界' : '変更候補：ここまでが前Section'}</span>` : (current ? '<span class="sba-current-caption">現在の境界</span>' : '')}
        </button>`);
    }
    return items.join('');
  }
  function rangeChordsHtml() {
    const items = [];
    for (let index = pair.prevStartIdx; index <= pair.nextEndIdx; index++) {
      if (index === candidate + 1) {
        items.push('<span class="sba-range-boundary" aria-label="ここから次のSection">次のSection →</span>');
      }
      const inRange = index >= rangeStart && index <= rangeEnd;
      const isStart = index === rangeStart;
      const isEnd = index === rangeEnd;
      items.push(`
        <button type="button"
          class="sba-range-chord ${inRange ? 'is-in-range' : ''} ${isStart ? 'is-range-start' : ''} ${isEnd ? 'is-range-end' : ''}"
          data-sba-range-index="${index}"
          aria-pressed="${inRange}"
          title="${esc(chordLabel(index))}">
          <span>${esc(chordLabel(index))}</span>
          ${isStart ? '<small>開始</small>' : (isEnd ? '<small>終了</small>' : '')}
        </button>`);
    }
    return items.join('');
  }
  function bodyHtml() {
    const startSec = chordStart(buffer, rangeStart);
    const endSec = chordEnd(buffer, rangeEnd);
    const playable = Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec;
    const previousSection = draft.sections[pair.prevIndex];
    const nextSection = draft.sections[pair.nextIndex];
    const previousIdentity = sectionIdentity(previousSection);
    const nextIdentity = sectionIdentity(nextSection);
    return `
      <div class="sba-root" id="sba-root">
        <div class="sba-intro">
          <div class="sba-pair">
            <div class="sba-section-card sba-section-prev">
              <span class="sba-section-role">前のSection</span>
              <strong>${esc(previousIdentity.name)}</strong>
              <span class="sba-section-type">${esc(previousIdentity.type)}</span>
            </div>
            <span class="sba-pair-arrow" aria-hidden="true">→</span>
            <div class="sba-section-card sba-section-next">
              <span class="sba-section-role">次のSection</span>
              <strong>${esc(nextIdentity.name)}</strong>
              <span class="sba-section-type">${esc(nextIdentity.type)}</span>
            </div>
          </div>
          <span>コードを選ぶと、そのコードまでが前のSection、次のコードからが次のSectionになります。</span>
        </div>
        <div class="sba-boundary-list" role="group" aria-label="境界位置">${boundaryListHtml()}</div>
        <section class="sba-audition" aria-label="試聴範囲の設定">
          <div class="sba-audition-head">
            <strong>試聴範囲</strong>
            <span>境界の前後を聴いて、切れ目が自然か確認します。</span>
          </div>
          <div class="sba-range-targets" role="group" aria-label="試聴範囲の選択">
            <strong class="sba-range-step">${rangeEditTarget === 'start' ? '① 試聴を始めたいコードを選んでください' : '② 試聴を終えたいコードを選んでください'}</strong>
            <button type="button" class="sec-btn" id="sba-range-reset">範囲を選び直す</button>
            <button type="button" class="sec-btn" id="sba-play" ${playable ? '' : 'disabled'}>${playing ? '■ 停止' : '▶ 試聴'}</button>
          </div>
          <div class="sba-range-chords" role="group" aria-label="コード進行から試聴範囲を選択">${rangeChordsHtml()}</div>
          <div class="sba-range-summary">試聴範囲：${Array.from({ length: rangeEnd - rangeStart + 1 }, (_, offset) => esc(chordLabel(rangeStart + offset))).join(' → ')}（${rangeEnd - rangeStart + 1}コード）</div>
        </section>
        ${!inRange() ? `
          <div class="sba-notice" role="status">
            境界位置が試聴範囲の外にあります。
            <button type="button" class="sec-btn" id="sba-align">境界に合わせる</button>
          </div>` : ''}
        <div class="sba-message" id="sba-message" role="status" aria-live="polite">${esc(message)}</div>
      </div>`;
  }
  function render() {
    if (!active() || !root) return;
    const previousScrollLeft = root.querySelector('.sba-range-chords')?.scrollLeft ?? 0;
    const wrap = document.createElement('div');
    wrap.innerHTML = bodyHtml();
    const next = wrap.firstElementChild;
    root.replaceWith(next);
    root = next;
    const rangeChords = root.querySelector('.sba-range-chords');
    if (rangeChords) rangeChords.scrollLeft = previousScrollLeft;
    bind();
  }
  function setCandidate(index) {
    if (!Number.isInteger(index) || index < pair.prevStartIdx || index >= pair.nextEndIdx) return;
    candidate = index;
    message = '';
    // Moving the boundary alone must not stop the audition.
    render();
  }
  function setRange(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || end >= buffer.length || start > end) return;
    if (start === rangeStart && end === rangeEnd) return;
    invalidatePlayback();
    rangeStart = start;
    rangeEnd = end;
    message = '';
    render();
  }
  function startPlayback() {
    const startSec = chordStart(buffer, rangeStart);
    const endSec = chordEnd(buffer, rangeEnd);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      message = '試聴できる時間範囲を取得できません';
      render();
      return;
    }
    invalidatePlayback();
    const generation = advancePlayGeneration();
    playing = true;
    render();
    onTestPlay?.({
      startSec, endSec,
      onTime: () => {
        if (generation !== currentPlayGeneration() || !active()) return;
      },
      onEnded: () => {
        if (generation !== currentPlayGeneration() || !active()) return;
        advancePlayGeneration();
        playing = false;
        render();
      },
    });
  }
  function stopPlayback() {
    invalidatePlayback();
    render();
  }
  function cleanup() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    invalidatePlayback();
    onKeyUnshield?.();
  }
  function returnToOverview(reason = 'cancel', applied = false) {
    if (closed) return;
    closed = true;
    cleanup();
    onReturnToOverview?.({ reason, applied, prevId, nextId });
  }
  function bind() {
    root.querySelectorAll('[data-sba-candidate]').forEach(button => {
      button.addEventListener('click', () => setCandidate(Number(button.dataset.sbaCandidate)));
    });
    root.querySelector('#sba-range-reset')?.addEventListener('click', () => {
      rangeEditTarget = 'start';
      setRange(initialRangeStart, initialRangeEnd);
      render();
    });
    root.querySelectorAll('[data-sba-range-index]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.sbaRangeIndex);
        if (rangeEditTarget === 'start') {
          rangeEditTarget = 'end';
          setRange(index, Math.max(index, rangeEnd));
        } else {
          rangeEditTarget = 'start';
          setRange(Math.min(rangeStart, index), Math.max(rangeStart, index));
        }
        render();
      });
    });
    root.querySelector('#sba-play')?.addEventListener('click', () => playing ? stopPlayback() : startPlayback());
    root.querySelector('#sba-align')?.addEventListener('click', () => {
      const start = Math.max(0, Math.min(candidate - 2, buffer.length - 4));
      setRange(start, Math.min(buffer.length - 1, start + 3));
    });
  }
  keyHandler = event => {
    if (!active()) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      setCandidate(candidate + (event.key === 'ArrowLeft' ? -1 : 1));
    } else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      if (playing) stopPlayback();
      else startPlayback();
    }
  };

  onKeyShield?.();
  openModal({
    title: '境界調整',
    body: bodyHtml(),
    onRequestClose: source => {
      if (source === 'overlay' || source === 'escape') returnToOverview(source === 'escape' ? 'escape' : 'external');
    },
    onOpen: () => {
      if (!active()) return;
      root = document.getElementById('sba-root');
      bind();
      document.addEventListener('keydown', keyHandler, true);
    },
    buttons: () => {
      const cancel = mkMBtn('キャンセル', '', () => returnToOverview('cancel'));
      const apply = mkMBtn('この境界で確定', 'ok', async () => {
        if (busy || closed) return;
        busy = true;
        apply.disabled = true;
        invalidatePlayback();
        const result = await onApply?.({ prevId, nextId, endChordIndex: candidate });
        if (result?.ok) {
          returnToOverview('applied', true);
          return;
        }
        busy = false;
        message = result?.reason ? `境界を変更できません（${result.reason}）` : '境界を変更できませんでした';
        render();
        apply.disabled = false;
      });
      return [cancel, apply];
    },
  });
  return {
    suspend: () => {
      if (closed) return {};
      invalidatePlayback();
      closed = true;
      if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
      onKeyUnshield?.();
      return {};
    },
    cleanup: () => { if (!closed) { closed = true; cleanup(); } },
    forceClose: () => { returnToOverview('external'); return Promise.resolve(true); },
  };
}
