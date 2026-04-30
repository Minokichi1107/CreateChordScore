/**
 * ════════════════════════════════════════
 * replace.js - コード置換バー
 * ════════════════════════════════════════
 *
 * 【責務】
 * - 置換バーのUI制御（open/close）
 * - ヒットリスト管理（rbHits, rbCurr）
 * - 検索ハイライト（rbHighlightAll）
 * - 1件置換・全件置換・アンドゥ
 *
 * 【依存】
 * - app.js: initReplace(getLines, updateLines, callbacks) で初期化
 * - project.lines には直接アクセスしない（コールバック経由）
 *
 * 【エクスポート】
 * - initReplace(getLines, updateLines, callbacks)
 * - openReplace()
 * - closeReplace()
 * - rbRefresh()        ← focLine変更時にapp.jsから呼ぶ
 */

// ════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════

let _getLines = null;
let _updateLines = null;
let _callbacks = {};

let rbHits = [];
let rbCurr = -1;
let rbSnapshot = null;

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════

/**
 * @param {function} getLines       - () => lines を返す
 * @param {function} updateLines    - (lines) => void
 * @param {object}   callbacks
 *   @param {function} getFocLine        - () => number  現在フォーカス行
 *   @param {function} scrollEditorToRow - (el, force) => void
 *   @param {function} addToPaletteIfNew - (chord) => void
 *   @param {function} refreshEditor     - () => void
 *   @param {function} toast             - (msg) => void
 */
export function initReplace(getLines, updateLines, callbacks) {
  _getLines = getLines;
  _updateLines = updateLines;
  _callbacks = callbacks;
  _setupEvents();
}

export function openReplace() {
  const bar = document.getElementById('replace-bar');
  bar.classList.add('open');
  setTimeout(() => document.getElementById('rb-find').focus(), 80);
}

export function closeReplace() {
  document.getElementById('replace-bar').classList.remove('open');
  document.querySelectorAll('.chord-tag.rb-hit,.chord-tag.rb-curr').forEach(el => {
    el.classList.remove('rb-hit', 'rb-curr');
  });
  rbHits = [];
  rbCurr = -1;
}

// ════════════════════════════════════════
// INTERNAL HELPERS
// ════════════════════════════════════════

function rbGetFind() { return document.getElementById('rb-find').value.trim(); }
function rbGetRepl() { return document.getElementById('rb-replace').value.trim(); }
function rbScopeAll() { return document.getElementById('rb-all').checked; }

export function rbRefresh() {
  document.querySelectorAll('.chord-tag.rb-hit,.chord-tag.rb-curr').forEach(el => {
    el.classList.remove('rb-hit', 'rb-curr');
  });
  rbHits = [];
  const find = rbGetFind();
  if (!find) {
    document.getElementById('rb-count').textContent = '-';
    rbCurr = -1;
    return;
  }

  const lines = _getLines();
  const focLine = _callbacks.getFocLine();
  const scopeAll = rbScopeAll();
  const targetLines = scopeAll
    ? lines.map((_, i) => i)
    : (focLine >= 0 ? [focLine] : []);

  targetLines.forEach(li => {
    lines[li].chords.forEach((c, ci) => {
      if (c.type === 'sep') return;
      if (c.chord === find) rbHits.push({ li, ci });
    });
  });

  document.getElementById('rb-count').textContent =
    rbHits.length ? `${rbHits.length}件` : '0件';

  rbHighlightAll();
  if (rbCurr >= rbHits.length) rbCurr = 0;
  rbScrollToCurrent();
}

function rbHighlightAll() {
  const find = rbGetFind();
  document.querySelectorAll('.chord-tag').forEach(tag => {
    const nameEl = tag.querySelector('.chord-name');
    if (!nameEl) return;
    const chord = nameEl.textContent;
    if (chord === find) tag.classList.add('rb-hit');
    else tag.classList.remove('rb-hit', 'rb-curr');
  });
}

function rbScrollToCurrent() {
  if (rbCurr < 0 || rbCurr >= rbHits.length) {
    document.getElementById('rb-count').textContent =
      rbHits.length ? `${rbHits.length}件` : '0件';
    return;
  }
  document.getElementById('rb-count').textContent =
    `${rbCurr + 1} / ${rbHits.length}件`;

  const { li } = rbHits[rbCurr];
  const rows = document.querySelectorAll('.line-row');
  if (rows[li]) _callbacks.scrollEditorToRow(rows[li], true);

  document.querySelectorAll('.chord-tag.rb-curr').forEach(el => el.classList.remove('rb-curr'));
  const lines = _getLines();
  rbHits.forEach((h, i) => {
    if (i !== rbCurr) return;
    const row = rows[h.li];
    if (!row) return;
    const nonSepIdx = lines[h.li].chords.slice(0, h.ci + 1).filter(c => c.type !== 'sep').length - 1;
    const allTags = row.querySelectorAll('.chord-tag');
    if (allTags[nonSepIdx]) allTags[nonSepIdx].classList.add('rb-curr');
  });
}

// ════════════════════════════════════════
// EVENTS
// ════════════════════════════════════════

function _setupEvents() {
  document.getElementById('rb-find').addEventListener('input', () => { rbCurr = 0; rbRefresh(); });
  document.getElementById('rb-replace').addEventListener('input', () => {});
  document.getElementById('rb-all').addEventListener('change', () => { rbCurr = 0; rbRefresh(); });
  document.getElementById('rb-focus').addEventListener('change', () => { rbCurr = 0; rbRefresh(); });

  document.getElementById('rb-next').addEventListener('click', () => {
    if (!rbHits.length) { rbRefresh(); return; }
    rbCurr = (rbCurr + 1) % rbHits.length;
    rbHighlightAll(); rbScrollToCurrent();
    setTimeout(() => document.getElementById('rb-find').focus(), 10);
  });

  document.getElementById('rb-prev').addEventListener('click', () => {
    if (!rbHits.length) { rbRefresh(); return; }
    rbCurr = (rbCurr - 1 + rbHits.length) % rbHits.length;
    rbHighlightAll(); rbScrollToCurrent();
    setTimeout(() => document.getElementById('rb-find').focus(), 10);
  });

  document.getElementById('rb-one').addEventListener('click', () => {
    if (!rbHits.length || rbCurr < 0 || rbCurr >= rbHits.length) return;
    const repl = rbGetRepl();
    const { li, ci } = rbHits[rbCurr];
    const lines = _getLines();
    if (!rbSnapshot) rbSnapshot = JSON.stringify(lines);
    document.getElementById('rb-undo').disabled = false;
    if (repl === '') {
      lines[li].chords.splice(ci, 1);
    } else {
      lines[li].chords[ci].chord = repl;
      _callbacks.addToPaletteIfNew(repl);
    }
    _updateLines(lines);
    _callbacks.refreshEditor();
    rbHits = []; rbCurr = 0; rbRefresh();
    _callbacks.toast('1つ置換しました');
    setTimeout(() => document.getElementById('rb-find').focus(), 10);
  });

  document.getElementById('rb-all-btn').addEventListener('click', () => {
    const find = rbGetFind();
    const repl = rbGetRepl();
    if (!find) return;
    const lines = _getLines();
    rbSnapshot = JSON.stringify(lines);
    document.getElementById('rb-undo').disabled = false;
    const focLine = _callbacks.getFocLine();
    const scopeAll = rbScopeAll();
    let count = 0;
    lines.forEach((line, li) => {
      if (!scopeAll && li !== focLine) return;
      for (let ci = line.chords.length - 1; ci >= 0; ci--) {
        const c = line.chords[ci];
        if (c.type === 'sep' || c.chord !== find) continue;
        if (repl === '') line.chords.splice(ci, 1);
        else { line.chords[ci].chord = repl; _callbacks.addToPaletteIfNew(repl); }
        count++;
      }
    });
    _updateLines(lines);
    _callbacks.refreshEditor();
    rbHits = []; rbCurr = 0; rbRefresh();
    _callbacks.toast(`${count}件置換しました`);
  });

  document.getElementById('rb-undo').addEventListener('click', () => {
    if (!rbSnapshot) return;
    _updateLines(JSON.parse(rbSnapshot));
    rbSnapshot = null;
    document.getElementById('rb-undo').disabled = true;
    _callbacks.refreshEditor();
    rbHits = []; rbCurr = 0; rbRefresh();
    _callbacks.toast('置換を元に戻しました');
  });

  document.getElementById('rb-close').addEventListener('click', closeReplace);

  document.getElementById('btn-replace-open').addEventListener('click', () => {
    const bar = document.getElementById('replace-bar');
    bar.classList.toggle('open');
    if (bar.classList.contains('open')) {
      setTimeout(() => document.getElementById('rb-find').focus(), 80);
    }
  });
}
