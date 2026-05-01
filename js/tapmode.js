/**
 * ════════════════════════════════════════
 * tapmode.js - TAP Mode（時刻設定オーバーレイ）
 * ════════════════════════════════════════
 *
 * 【責務】
 * - TAPオーバーレイのopen/close
 * - 行描画（renderTovLines）
 * - 再生位置同期（syncTovPlayer, updateTovTime）
 * - TAPボタン処理（時刻設定・フォーカス移動）
 * - キーボードショートカット（Space/Arrow/Escape）
 *
 * 【依存】
 * - app.js: initTapMode(aEl, callbacks) で初期化
 * - project.lines には直接アクセスしない（コールバック経由）
 *
 * 【エクスポート】
 * - initTapMode(aEl, callbacks)
 * - openTapMode()
 * - closeTapMode()
 * - updateTovTime()    ← aEl timeupdateから呼ぶ
 * - syncTovPlayer()    ← openTapMode内で呼ぶ
 */

// ════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════

let _aEl = null;
let _callbacks = {};

let tovFocusIdx = -1;
let tovSeeking = false;
let tovTapBtn = null;
let tovSelected = new Set();   // 複数選択中の行インデックス
let tovLastClicked = -1;       // Shift範囲選択の基点
let tovScrollLock = false;     // TAPボタン押下後の一時スクロールロック
let tovScrollTimer = null;     // スクロールロック解除タイマー

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════

/**
 * @param {HTMLAudioElement} aEl
 * @param {object} callbacks
 *   @param {function} getLines       - () => lines
 *   @param {function} setLineTime    - (idx, time) => void
 *   @param {function} autoSaveLocal  - () => void
 *   @param {function} refreshEditor  - () => void
 *   @param {function} fmt            - (t, ms) => string
 *   @param {function} setSpeed       - (pct) => void
 *   @param {function} toast          - (msg) => void
 */
export function initTapMode(aEl, callbacks) {
  _aEl = aEl;
  _callbacks = callbacks;
  _setupEvents();
}

export function resetTovFocus() {
  tovFocusIdx = -1;
  tovSelected.clear();
  tovLastClicked = -1;
}

// ════════════════════════════════════════
// OPEN / CLOSE
// ════════════════════════════════════════

export function openTapMode() {
  document.getElementById('tap-overlay').classList.add('open');
  renderTovLines();
  syncTovPlayer();
  updateTovTime();
}

export function closeTapMode() {
  document.getElementById('tap-overlay').classList.remove('open');
  _callbacks.refreshEditor();
}

// ════════════════════════════════════════
// PLAYER SYNC
// ════════════════════════════════════════

export function syncTovPlayer() {
  const tovPlay = document.getElementById('tov-play-btn');
  tovPlay.textContent = _aEl.paused ? '▶' : '⏸';
  const d = _aEl.duration || 0;
  if (d > 0) {
    const pct = _aEl.currentTime / d * 100;
    document.getElementById('tap-ov-seek-fill').style.width = pct + '%';
    document.getElementById('tap-ov-seek-in').value = Math.round(_aEl.currentTime / d * 1000);
  }
  document.getElementById('tap-ov-tapbtn').disabled = !_aEl.src;
}

export function updateTovTime() {
  if (!document.getElementById('tap-overlay').classList.contains('open')) return;
  const t = _aEl.currentTime;
  const d = _aEl.duration || 0;
  document.getElementById('tap-ov-time').textContent = _callbacks.fmt(t, true);
  if (d > 0 && !tovSeeking) {
    document.getElementById('tap-ov-seek-fill').style.width = (t / d * 100) + '%';
    document.getElementById('tap-ov-seek-in').value = Math.round(t / d * 1000);
  }

  // 現在コード表示
  if (window._ct && window._cn) {
    let cur = '-';
    for (let i = 0; i < window._ct.length; i++) {
      if (window._ct[i] <= t) cur = window._cn[i]; else break;
    }
    document.getElementById('tap-ov-chord').textContent = cur;
  }

  // アクティブ行ハイライト（再生位置）
  const lines = _callbacks.getLines();
  let ai = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].time != null && lines[i].time <= t) { ai = i; break; }
  }
  const rows = document.querySelectorAll('.tap-ov-line');
  rows.forEach((r, i) => r.classList.toggle('tov-active', i === ai));

  // スクロールはTAPボタン押下後のロック中のみ（手動スクロールを妨げない）
  if (tovScrollLock && tovFocusIdx >= 0 && rows[tovFocusIdx]) {
    const area = document.getElementById('tap-ov-lines');
    const el = rows[tovFocusIdx];
    // el.offsetTopはコンテナ内の絶対位置
    const elTop = el.offsetTop - area.offsetTop;
    const h = area.clientHeight;
    const targetScrollTop = elTop - h * 0.4;
    area.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
  }
  _updateTovStatus();
}

// ════════════════════════════════════════
// RENDER
// ════════════════════════════════════════

export function renderTovLines() {
  const area = document.getElementById('tap-ov-lines');
  area.innerHTML = '';
  const lines = _callbacks.getLines();
  lines.forEach((line, idx) => {
    const row = document.createElement('div');
    row.className = 'tap-ov-line';
    if (idx === tovFocusIdx) row.style.borderColor = 'var(--green)';

    // 時刻（クリックで削除）
    const timeEl = document.createElement('div');
    timeEl.className = 'tov-time' + (line.time != null ? '' : ' no-t');
    timeEl.textContent = line.time != null ? _callbacks.fmt(line.time, true) : '--:--.--';
    timeEl.title = line.time != null ? 'クリックで時刻を削除' : '未設定';
    timeEl.addEventListener('click', e => {
      e.stopPropagation();
      if (line.time != null) {
        _callbacks.setLineTime(idx, null);
        renderTovLines();
        _callbacks.autoSaveLocal();
      }
    });

    // リピートバッジ
    const chordWrap = document.createElement('div');
    chordWrap.className = 'tov-chords';
    if (line.repeat) {
      const rb = document.createElement('span');
      rb.className = 'tov-repeat';
      rb.textContent = `×${line.repeat.count}`;
      chordWrap.appendChild(rb);
    }
    line.chords.forEach(c => {
      if (c.type === 'sep') {
        const sp = document.createElement('span');
        sp.style.cssText = 'color:var(--text3);font-size:15px;padding:0 1px;align-self:center';
        sp.textContent = '/';
        chordWrap.appendChild(sp);
        return;
      }
      const ct = document.createElement('span');
      ct.className = 'tov-chord-tag';
      ct.textContent = c.chord;
      chordWrap.appendChild(ct);
    });

    // 歌詞
    const lyricEl = document.createElement('div');
    lyricEl.className = 'tov-lyric';
    lyricEl.textContent = line.lyric || '(空)';

    // フォーカス行・選択行のクラス付与
    if (idx === tovFocusIdx) row.classList.add('tov-focus');
    if (tovSelected.has(idx)) row.classList.add('tov-selected');

    // 行クリック：
    //   通常クリック    → フォーカス移動のみ
    //   Ctrl+クリック   → 選択トグル
    //   Shift+クリック  → 範囲選択
    row.addEventListener('click', e => {
      if (e.shiftKey && tovLastClicked >= 0) {
        // 範囲選択
        const from = Math.min(tovLastClicked, idx);
        const to   = Math.max(tovLastClicked, idx);
        for (let i = from; i <= to; i++) tovSelected.add(i);
        tovLastClicked = idx;
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl+クリック：選択トグル
        if (tovSelected.has(idx)) {
          tovSelected.delete(idx);
        } else {
          tovSelected.add(idx);
        }
        tovLastClicked = idx;
      } else {
        // 通常クリック：フォーカス移動のみ（選択状態は変えない）
        tovFocusIdx = idx;
      }
      renderTovLines();
      _updateSelectionBar();
    });

    row.appendChild(timeEl);
    row.appendChild(chordWrap);
    row.appendChild(lyricEl);
    area.appendChild(row);
  });
  _updateTovStatus();
  _updateSelectionBar();
}

function _updateTovStatus() {
  const lines = _callbacks.getLines();
  const timed = lines.filter(l => l.time != null).length;
  const total = lines.length;
  const el1 = document.getElementById('tov-timed');
  const el2 = document.getElementById('tov-total');
  if (el1) el1.textContent = timed;
  if (el2) el2.textContent = total;
}

// ════════════════════════════════════════
// SELECTION BAR
// ════════════════════════════════════════

function _updateSelectionBar() {
  const bar = document.getElementById('tov-selection-bar');
  if (!bar) return;
  const countEl = document.getElementById('tov-sel-count');
  const n = tovSelected.size;
  if (n > 0) {
    bar.style.display = 'flex';
    if (countEl) countEl.textContent = n;
  } else {
    bar.style.display = 'none';
  }
}

function _clearSelectedTimes() {
  const lines = _callbacks.getLines();
  tovSelected.forEach(idx => {
    if (idx < lines.length) lines[idx].time = null;
  });
  tovSelected.clear();
  tovLastClicked = -1;
  _callbacks.autoSaveLocal();
  renderTovLines();
  _callbacks.toast('選択した時刻を削除しました');
}

function _clearAllTimes() {
  if (!confirm('すべての時刻データを消去しますか？')) return;
  const lines = _callbacks.getLines();
  lines.forEach(l => { l.time = null; });
  tovSelected.clear();
  tovLastClicked = -1;
  tovFocusIdx = -1;
  _callbacks.autoSaveLocal();
  renderTovLines();
  _callbacks.toast('すべての時刻を消去しました');
}

// ════════════════════════════════════════
// EVENTS
// ════════════════════════════════════════

function _setupEvents() {
  document.getElementById('btn-tapmode').addEventListener('click', openTapMode);
  document.getElementById('btn-tapmode-close').addEventListener('click', closeTapMode);

  document.getElementById('tov-play-btn').addEventListener('click', () => {
    if (!_aEl.src) return;
    _aEl.paused ? _aEl.play() : _aEl.pause();
  });

  document.getElementById('tov-m5').addEventListener('click', () => {
    _aEl.currentTime = Math.max(0, _aEl.currentTime - 5);
  });

  document.getElementById('tov-speed').addEventListener('input', e => {
    _callbacks.setSpeed(parseInt(e.target.value));
  });

  // シークバー
  const tovSeekIn = document.getElementById('tap-ov-seek-in');
  tovSeekIn.addEventListener('mousedown', () => { tovSeeking = true; });
  tovSeekIn.addEventListener('mouseup', () => {
    tovSeeking = false;
    _aEl.currentTime = (tovSeekIn.value / 1000) * (_aEl.duration || 0);
  });
  tovSeekIn.addEventListener('input', () => {
    if (!tovSeeking) return;
    document.getElementById('tap-ov-seek-fill').style.width = (tovSeekIn.value / 10) + '%';
  });

  // play/pause同期
  _aEl.addEventListener('play', () => {
    document.getElementById('tov-play-btn').textContent = '⏸';
    const performBtn = document.getElementById('perform-play-btn');
    if (performBtn) performBtn.textContent = '⏸';
  });
  _aEl.addEventListener('pause', () => {
    document.getElementById('tov-play-btn').textContent = '▶';
    const performBtn = document.getElementById('perform-play-btn');
    if (performBtn) performBtn.textContent = '▶';
  });

  // メタデータ取得後にシークバーを同期（durationがNaNの場合の対策）
  _aEl.addEventListener('loadedmetadata', () => {
    if (document.getElementById('tap-overlay').classList.contains('open')) {
      syncTovPlayer();
    }
  });
  _aEl.addEventListener('durationchange', () => {
    if (document.getElementById('tap-overlay').classList.contains('open')) {
      syncTovPlayer();
    }
  });

  // TAPボタン
  tovTapBtn = document.getElementById('tap-ov-tapbtn');
  tovTapBtn.addEventListener('click', () => {
    if (!_aEl.src) return;
    const t = _aEl.currentTime;
    const lines = _callbacks.getLines();
    let idx = tovFocusIdx;
    if (idx < 0 || idx >= lines.length) {
      idx = lines.findIndex(l => l.time == null);
    }
    if (idx < 0) idx = 0;
    if (idx < lines.length) {
      _callbacks.setLineTime(idx, parseFloat(t.toFixed(3)));
      tovFocusIdx = idx + 1;
      renderTovLines();
      _callbacks.autoSaveLocal();
      // TAP視覚フィードバック
      const rows = document.querySelectorAll('.tap-ov-line');
      if (rows[idx]) {
        rows[idx].classList.add('tov-tapped');
        setTimeout(() => rows[idx].classList.remove('tov-tapped'), 350);
      }
      // スクロールはupdateTovTime内のtovScrollLockで処理
    }
    // TAPボタン押下後1秒間スクロールロック（フォーカス追尾）
    tovScrollLock = true;
    if (tovScrollTimer) clearTimeout(tovScrollTimer);
    tovScrollTimer = setTimeout(() => { tovScrollLock = false; }, 1000);

    tovTapBtn.classList.add('tapping');
    setTimeout(() => tovTapBtn.classList.remove('tapping'), 150);
  });

  // キーボードショートカット
  document.addEventListener('keydown', e => {
    if (!document.getElementById('tap-overlay').classList.contains('open')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      tovTapBtn.click();
    }
    if (e.code === 'ArrowLeft') _aEl.currentTime = Math.max(0, _aEl.currentTime - 5);
    if (e.code === 'ArrowRight') _aEl.currentTime = Math.min(_aEl.duration || 0, _aEl.currentTime + 5);
    if (e.code === 'Escape') {
      if (tovSelected.size > 0) {
        tovSelected.clear();
        tovLastClicked = -1;
        renderTovLines();
        _updateSelectionBar();
      } else {
        closeTapMode();
      }
    }
  }, { capture: true });

  // 全消去ボタン
  document.getElementById('tov-clear-all')?.addEventListener('click', _clearAllTimes);

  // 選択削除ボタン
  document.getElementById('tov-clear-selected')?.addEventListener('click', _clearSelectedTimes);

  // 選択解除ボタン
  document.getElementById('tov-deselect')?.addEventListener('click', () => {
    tovSelected.clear();
    tovLastClicked = -1;
    renderTovLines();
    _updateSelectionBar();
  });
}
