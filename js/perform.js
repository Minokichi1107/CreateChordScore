/**
 * ════════════════════════════════════════
 * perform.js - Performance Mode
 * ════════════════════════════════════════
 *
 * 【責務】
 * - Performance Mode の状態管理（performState）
 * - 行描画（renderPerformLines）
 * - フォーカス・スクロール同期（updatePerformFocus）
 * - プレイヤーUI同期（updatePerformPlayer）
 * - ページング（nextPerformPage / prevPerformPage）
 * - スワイプ操作（setupPerformSwipe）
 *
 * 【依存】
 * - chords.js: lookupChord, drawDiagram
 * - audio.js: fmt
 * - app.js: initPerformMode(aEl, getLines) で初期化
 *
 * 【エクスポート】
 * - initPerformMode(aEl, getLines)
 * - openPerformMode()
 * - closePerformMode()
 * - renderPerformLines()
 * - updatePerformFocus()
 * - updatePerformPlayer()
 */

import { lookupChord, drawDiagram } from './chords.js';
import { fmt } from './audio.js';

// ════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════

export const performState = {
  active: false,
  focusIdx: -1,
  diagOn: true,
  mode: 'follow',
  page: 0,
  linesPerPage: 10,
  fontScale: 1.0
};

// app.js から受け取る参照
let _aEl = null;
let _getLines = null;

// スクロール競合防止フラグ
let _isScrolling = false;

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════

/**
 * Performance Modeの初期化
 * @param {HTMLAudioElement} aEl - メインのaudio要素
 * @param {function} getLines - project.lines を返すコールバック
 */
export function initPerformMode(aEl, getLines) {
  _aEl = aEl;
  _getLines = getLines;
}

// ════════════════════════════════════════
// OPEN / CLOSE
// ════════════════════════════════════════

export function openPerformMode() {
  const overlay = document.getElementById('perform-overlay');
  overlay.hidden = false;
  overlay.style.display = 'flex';

  performState.active = true;
  performState.focusIdx = -1;
  performState.mode = 'follow';

  // compact-mode と diagOn の状態を同期
  if (performState.diagOn) {
    overlay.classList.remove('compact-mode');
  } else {
    overlay.classList.add('compact-mode');
  }

  // フォントスケールを同期
  overlay.style.setProperty('--perform-font-scale', performState.fontScale);

  // Title設定
  const title = document.getElementById('project-title').value || '無題';
  const titleEl = document.getElementById('perform-title');
  if (titleEl) {
    titleEl.textContent = `🎸 演奏モード — ${title}`;
  }

  renderPerformLines();
  updatePerformPlayer();
  setupPerformSwipe();
}

export function closePerformMode() {
  const overlay = document.getElementById('perform-overlay');
  overlay.hidden = true;
  overlay.style.display = 'none';
  performState.active = false;
}

// ════════════════════════════════════════
// RENDER
// ════════════════════════════════════════

export function renderPerformLines() {
  const container = document.getElementById('perform-lines');
  const overlay = document.getElementById('perform-overlay');
  container.innerHTML = '';

  // 静止モード時はdata属性追加（CSS用）
  if (performState.mode === 'static') {
    overlay.setAttribute('data-static-mode', 'true');
  } else {
    overlay.removeAttribute('data-static-mode');
  }

  const lines = _getLines();

  lines.forEach((line, i) => {
    const el = document.createElement('div');
    el.className = 'perform-line';

    if (performState.mode === 'static') {
      el.classList.add('static-mode');
    }

    el.dataset.idx = i;

    // コード列生成
    let chordColumns = '';

    if (line.chords.length > 0) {
      chordColumns = line.chords.map(c => {
        // 小節線
        if (c.type === 'sep' || c.chord === '/') {
          return `<div class="perform-chord-col"><div class="perform-sep">/</div></div>`;
        }

        // コード
        if (c.chord && c.chord !== '') {
          const chordName = c.chord;
          let diagramHTML = '';

          if (performState.diagOn) {
            const result = lookupChord(chordName);
            if (result && result.data.v.length > 0) {
              const vr = result.data.v[0];
              const diagramScale = performState.fontScale * 0.9;
              diagramHTML = drawDiagram(vr.f, vr.b || null, { scale: diagramScale });
            } else {
              diagramHTML = '<div class="perform-chord-empty">-</div>';
            }
          }

          return `
            <div class="perform-chord-col">
              <div class="perform-chord-name">${chordName}</div>
              ${performState.diagOn ? `<div class="perform-chord-diagram">${diagramHTML}</div>` : ''}
            </div>
          `;
        }

        return '';
      }).join('');
    }

    // 繰り返し記号
    let repeatHTML = '';
    if (line.repeat !== null && line.repeat !== undefined) {
      const repeatCount = typeof line.repeat === 'object' ? line.repeat.count || 2 : line.repeat;
      repeatHTML = `<div class="perform-repeat">×${repeatCount}</div>`;
    }

    el.innerHTML = `
      <div class="chords-row">
        ${chordColumns ? `<div class="chords">${chordColumns}</div>` : '<div class="chords">&nbsp;</div>'}
        ${repeatHTML}
      </div>
      <div class="lyric">${line.lyric || '&nbsp;'}</div>
    `;

    container.appendChild(el);
  });
}

// ════════════════════════════════════════
// FOCUS / SCROLL SYNC
// ════════════════════════════════════════

export function updatePerformFocus() {
  if (!performState.active || performState.mode === 'static') return;

  const t = _aEl.currentTime;
  const lines = _getLines();
  let idx = -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.time !== null && line.time <= t) {
      idx = i;
      break;
    }
  }

  if (idx === performState.focusIdx) return;

  performState.focusIdx = idx;

  document.querySelectorAll('.perform-line').forEach(el => {
    el.classList.remove('focused');
  });

  const target = document.querySelector(`.perform-line[data-idx="${idx}"]`);
  if (target) {
    target.classList.add('focused');
    scrollToLine(target);
  }
}

function scrollToLine(target) {
  if (_isScrolling) return;

  const container = document.getElementById('perform-lines');
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  // コンテナ内での現在のスクロール位置 + ターゲットの相対位置
  const scrollTop = container.scrollTop + (targetRect.top - containerRect.top);

  // 現在行を画面上部25%付近に配置（下の行を先読みしやすくする）
  const targetScrollTop = scrollTop - container.clientHeight * 0.25;

  _isScrolling = true;
  container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  setTimeout(() => { _isScrolling = false; }, 600);
}

// ════════════════════════════════════════
// PLAYER UI SYNC
// ════════════════════════════════════════

export function updatePerformPlayer() {
  if (!performState.active) return;

  const seekIn = document.getElementById('perform-seek-in');
  const seekFill = document.getElementById('perform-seek-fill');
  const timeDisplay = document.getElementById('perform-time');

  if (_aEl.duration) {
    const pct = (_aEl.currentTime / _aEl.duration) * 100;
    seekIn.value = pct * 10;
    seekFill.style.width = `${pct}%`;

    const min = Math.floor(_aEl.currentTime / 60);
    const sec = Math.floor(_aEl.currentTime % 60);
    timeDisplay.textContent = `${min}:${String(sec).padStart(2, '0')}`;
  }
}

// ════════════════════════════════════════
// PAGING
// ════════════════════════════════════════

export function nextPerformPage() {
  const container = document.getElementById('perform-lines');
  container.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
}

export function prevPerformPage() {
  const container = document.getElementById('perform-lines');
  container.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
}

// ════════════════════════════════════════
// SWIPE
// ════════════════════════════════════════

let _performSwipe = { startX: 0, startY: 0 };

export function setupPerformSwipe() {
  const container = document.getElementById('perform-lines');

  // 既存リスナーの重複を防ぐためcloneで付け替え
  const fresh = container.cloneNode(true);
  container.parentNode.replaceChild(fresh, container);

  fresh.addEventListener('pointerdown', e => {
    _performSwipe.startX = e.clientX;
    _performSwipe.startY = e.clientY;
  });

  fresh.addEventListener('pointerup', e => {
    const dx = e.clientX - _performSwipe.startX;
    const dy = e.clientY - _performSwipe.startY;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) nextPerformPage();
      else prevPerformPage();
    }
  });
}
