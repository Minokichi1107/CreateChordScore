/**
 * ════════════════════════════════════════
 * chordEntry.js — コード入力サブシステム
 * ════════════════════════════════════════
 *
 * 【責務】
 *   - openAddChord(idx): コード追加モーダルの開閉・UI lifecycle
 *   - insertAt state 管理（modal内ローカル）
 *   - renderModalPreview / mkInsertBtn
 *   - addChord / addSep
 *   - キーボードハンドリング（Enter / Escape / IME guard）
 *   - input変更時のpreview（updateDiagRight相当・unlock後なのでguard不要）
 *
 * 【持たないもの】
 *   - project.lines の直接参照・変更（getLines() 経由のみ）
 *   - diagLocked / diagLockedChord の参照
 *   - refreshEditor 以外の副作用
 *
 * 【lock解除の設計方針】
 *   AddChord modal を開く際に unlockDiag() を呼ぶ。
 *   理由: diagLock の用途（ダイアグラム固定表示）と
 *         AddChord の用途（別コードを入力する）は目的が競合するため、
 *         AddChord 開始時点で lock session を終了するのが自然。
 *
 *   将来「lock を維持しながら入力」の要件が出た場合は：
 *     - unlockDiag() の呼び出しを削除
 *     - forcePreviewChord / restoreDiagAfterTransientPreview を使う方式に切り替える
 *     - app.js の forcePreviewChord のコメントに設計意図が記載されている
 *
 * 【DI依存】
 *   initChordEntry() で app.js から注入される。
 *
 * 【将来の拡張予定（Phase39-2以降）】
 *   - insertion cursor 化（+ → | 表示への変更）
 *   - hover-only 削除ボタン（× の表示制御）
 *   - simile token 挿入UI（Phase39-3）
 *   - token shorthand（`/` → barline、`ss` → simile 等・Phase39-4）
 */

import { isSepToken, isNoChordToken, tokenToText } from './tokens.js';

// ────────────────────────────────────────
// MODULE STATE（注入済み依存）
// ────────────────────────────────────────
let _getLines            = null;
let _getPalette          = null;
let _getPaletteTranspose = null;
let _addToPaletteIfNew   = null;
let _refreshEditor       = null;
let _openModal           = null;
let _closeModal          = null;
let _mkMBtn              = null;
let _toast               = null;
let _unlockDiag          = null;
let _onPreviewChord      = null;
let _transposeChord      = null;
let _updateModalTitle    = null;
let _saveDiagStateForModal = null;
let _clearSavedDiagState   = null;
let _restoreOnCancel       = null;


// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
export function initChordEntry({
  getLines, getPalette, getPaletteTranspose,
  addToPaletteIfNew, refreshEditor,
  openModal, closeModal, mkMBtn, toast,
  unlockDiag, onPreviewChord, transposeChord,updateModalTitle,
  saveDiagStateForModal, clearSavedDiagState, restoreOnCancel,
}) {
  _getLines            = getLines;
  _getPalette          = getPalette;
  _getPaletteTranspose = getPaletteTranspose;
  _addToPaletteIfNew   = addToPaletteIfNew;
  _refreshEditor       = refreshEditor;
  _openModal           = openModal;
  _closeModal          = closeModal;
  _mkMBtn              = mkMBtn;
  _toast               = toast;
  _unlockDiag          = unlockDiag;
  _onPreviewChord      = onPreviewChord;
  _transposeChord      = transposeChord;
  _updateModalTitle    = updateModalTitle;
  _saveDiagStateForModal = saveDiagStateForModal;
  _clearSavedDiagState   = clearSavedDiagState;
  _restoreOnCancel       = restoreOnCancel;
}

// ────────────────────────────────────────
// NO_CHORD NORMALIZE HELPER
// ────────────────────────────────────────
/**
 * normalizeNoChordInput
 *
 * no_chord 系入力の正規化。
 * N / NC / N.C. / (N.C) / (N.C.) 等をすべて統一形式に変換する。
 *
 * NOTE: app.js の import / palette filter にも同等の処理がある。
 *       将来は tokens.js か shared util に統合することを検討する。
 *
 * @param {string} v
 * @returns {string} 大文字・括弧・ドット・空白除去後の文字列
 */
function normalizeNoChordInput(v) {
  return String(v)
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s/g, '')
    .replace(/[()]/g, '');
}

function isNoChordInput(v) {
  const n = normalizeNoChordInput(v);
  return n === 'N' || n === 'NC';
}

// ────────────────────────────────────────
// INPUT VALIDATION
// ────────────────────────────────────────
/**
 * isChordLikeInput
 *
 * 【通るもの】 C, Cm7, D♭, F#sus4, Bbadd9, Am7/D
 * 【落ちるもの】あ, hello（A-G以外で始まる英単語）
 *
 * 【N.C. / no_chord 入力の扱い】
 *   N / NC / N.C. / (N.C) は A-G で始まらないためここでは落ちる。
 *   呼び出し元（addChord）で先に isNoChordInput() 判定を行い、
 *   { type:'no_chord' } に変換してからこの validator を迂回する。
 *
 * @param {string} v
 * @returns {boolean}
 */
function isChordLikeInput(v) {
  return /^[A-G](#|♯|b|♭)?/.test(v.trim());
}

// ────────────────────────────────────────
// OPEN ADD CHORD
// ────────────────────────────────────────
export function openAddChord(idx) {
  _saveDiagStateForModal?.();   // ★追加：unlock前に退避
  _unlockDiag?.();

  let insertAt = null;

  // ── 挿入カーソルスロット（クリック + keyboard navigation 両対応）──
  function mkCursorSlot(pos) {
    const wrap = document.createElement('button');
    wrap.className = 'insert-cursor-wrap';
    wrap.title = pos === null ? '末尾に挿入' : `位置${pos + 1}に挿入`;
    wrap.dataset.pos = pos === null ? 'end' : String(pos);

    const cursor = document.createElement('span');
    cursor.className = 'insert-cursor';
    wrap.appendChild(cursor);

    wrap.addEventListener('click', () => {
      insertAt = pos;
      renderModalPreview();
      const inp = document.getElementById('mac-input');
      if (inp) inp.focus();
    });
    return wrap;
  }

  // ── プレビュー再描画 ──
function renderModalPreview() {
    const line = _getLines()[idx];
    const previewEl = document.getElementById('mac-preview');
    if (!previewEl) return;
    previewEl.innerHTML = '';

    // ── 先頭スロット ──
    const headSlot = mkCursorSlot(0);
    if (insertAt === 0) headSlot.querySelector('.insert-cursor').classList.add('active');
    previewEl.appendChild(headSlot);

    if (!line.chords.length) {
      const empty = document.createElement('span');
      empty.style.cssText = 'color:var(--text-muted);font-family:var(--font-mono);font-size:11px;margin:0 4px';
      empty.textContent = '(コードなし)';
      previewEl.appendChild(empty);
    }

    line.chords.forEach((c, ci) => {
      if (isSepToken(c)) {
        const s = document.createElement('span');
        s.className = 'mac-sep-token';
        s.textContent = '/';
        s.title = 'クリックで削除';
        s.addEventListener('click', () => {
          _getLines()[idx].chords.splice(ci, 1);
          if (insertAt !== null && insertAt > ci) insertAt--;
          _refreshEditor();
          renderModalPreview();
        });
        previewEl.appendChild(s);
      } else {
        const tag = document.createElement('span');
        tag.className = 'mac-preview-tag';
        const nm = document.createElement('span');
        nm.textContent = tokenToText(c);
        const dx = document.createElement('span');
        dx.textContent = '✕';
        dx.className = 'mac-preview-tag-del';
        dx.addEventListener('mouseenter', () => { dx.style.background = 'var(--color-red)'; });
        dx.addEventListener('mouseleave', () => { dx.style.background = ''; });
        dx.addEventListener('click', () => {
          _getLines()[idx].chords.splice(ci, 1);
          if (insertAt !== null && insertAt > ci) insertAt--;
          _refreshEditor();
          renderModalPreview();
        });
        tag.appendChild(nm);
        tag.appendChild(dx);
        previewEl.appendChild(tag);
      }

      const pos = ci + 1;
      const isLast = ci === line.chords.length - 1;
      const isActive = isLast ? (insertAt === null) : (insertAt === pos);
      const afterSlot = mkCursorSlot(isLast ? null : pos);
      if (isActive) afterSlot.querySelector('.insert-cursor').classList.add('active');
      previewEl.appendChild(afterSlot);
    });
  }

  // ── コード追加 ──
  function addChord(ch) {
    if (!ch) return;

    // no_chord 入力（N / NC / N.C. / (N.C) 等）を先に判定してtoken化する。
    // 文字列のまま保存しない。内部表現は { type:'no_chord' } のみ。
    if (isNoChordInput(ch)) {
      const token = { type: 'no_chord' };
      const chords = _getLines()[idx].chords;
      if (insertAt === null) {
        chords.push(token);
      } else {
        chords.splice(insertAt, 0, token);
        insertAt++;
      }
      _refreshEditor();
      renderModalPreview();
      const inp = document.getElementById('mac-input');
      if (inp) { inp.value = ''; inp.focus(); }
      return;
    }

    // domain validation: コードとして妥当な入力のみ受け付ける
    if (!isChordLikeInput(ch)) return;
    _addToPaletteIfNew(ch);
    const chords = _getLines()[idx].chords;
    if (insertAt === null) {
      chords.push({ chord: ch, offset: 0 });
    } else {
      chords.splice(insertAt, 0, { chord: ch, offset: 0 });
      insertAt++;
    }
    _refreshEditor();
    renderModalPreview();
    const inp = document.getElementById('mac-input');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  // ── 小節線追加 ──
  function addSep() {
    const chords = _getLines()[idx].chords;
    if (insertAt === null) {
      chords.push({ type: 'barline' });
    } else {
      chords.splice(insertAt, 0, { type: 'barline' });
      insertAt++;
    }
    _refreshEditor();
    renderModalPreview();
  }

  // ── insertion cursor navigation（行またぎ対応）──
  function navigateInsertCursor(direction) {
    const lines = _getLines();
    const lineLen = lines[idx].chords.length;

    if (direction === 'left') {
      if (insertAt === 0) {
        if (idx > 0) {
          idx--;
          insertAt = null;
          _updateModalTitle?.(`行${idx + 1} コードをまとめて追加`);
          renderModalPreview();
        }
      } else if (insertAt === null) {
        insertAt = lineLen > 0 ? lineLen - 1 : 0;
        renderModalPreview();
      } else {
        insertAt--;
        renderModalPreview();
      }
    }

    if (direction === 'right') {
      if (insertAt === null) {
        if (idx < lines.length - 1) {
          idx++;
          insertAt = 0;
          _updateModalTitle?.(`行${idx + 1} コードをまとめて追加`);
          renderModalPreview();
        }
      } else if (insertAt >= lineLen - 1) {
        insertAt = lineLen > 0 ? null : 0;
        renderModalPreview();
      } else {
        insertAt++;
        renderModalPreview();
      }
    }
  }

  // ── パレット HTML ──
  const palette = _getPalette();
  const paletteTranspose = _getPaletteTranspose();
  const palHtml = palette.length
    ? `<div class="modal-section">
        <div class="modal-field-label">楽曲のコードから選択:</div>
        <div class="mac-palette-list">
          ${palette.map(c => {
            const d = _transposeChord(c, paletteTranspose);
            return `<button class="pal-chord" style="font-size:11px"
              onclick="_mac_add('${d.replace(/'/g, "\\'").replace(/\//g, '\\/')}')">${d}</button>`;
          }).join('')}
        </div>
      </div>`
    : '';

  // NOTE: inline onclick の制約上 window 汚染を許容（Phase39-2で改善予定）
  window._mac_add = (ch) => addChord(ch);

  _openModal({
    title: `行${idx + 1} コードをまとめて追加`,
    body: `
      <div class="modal-section">
        <div class="modal-field-label">現在のコード:</div>
        <div id="mac-preview"
          style="display:flex;flex-wrap:wrap;gap:4px;min-height:28px;padding:6px;
            background:var(--surface-overlay);border-radius:var(--r-md);align-items:center">
        </div>
      </div>
      <div class="modal-input-row modal-section" style="gap:6px">
        <input type="text" id="mac-input" class="mi"
          placeholder="コード名 (例: Am7)" autocomplete="off"
          lang="en" inputmode="latin"
          style="font-size:15px;letter-spacing:1px;flex:1;ime-mode:disabled">
        <button id="mac-add-btn" class="sm-btn green"
          style="white-space:nowrap;font-size:13px">追加</button>
        <button id="mac-sep-btn" class="sm-btn"
          style="white-space:nowrap;font-size:13px" title="小節線を追加">／</button>
      </div>
      ${palHtml}
    `,
    onOpen: () => {
      renderModalPreview();

      document.getElementById('mac-add-btn')?.addEventListener('click', () => {
        const v = document.getElementById('mac-input')?.value.trim();
        addChord(v);
      });

      document.getElementById('mac-sep-btn')?.addEventListener('click', () => addSep());

      const inp = document.getElementById('mac-input');
      if (inp) {
        inp.focus();

        let justComposed = false;
        inp.addEventListener('compositionend', () => {
          justComposed = true;
          setTimeout(() => { justComposed = false; }, 0);
        });

        inp.addEventListener('keydown', e => {
          if (e.key === 'Escape') { _restoreOnCancel?.(); _closeModal(); return; }
          if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateInsertCursor('left');  return; }
          if (e.key === 'ArrowRight') { e.preventDefault(); navigateInsertCursor('right'); return; }
          if (e.key === 'Enter') {
            if (e.isComposing || justComposed) return;
            e.preventDefault();
            addChord(inp.value.trim());
          }
        });

        // input変更 → 右パネル一時更新
        // no_chord 入力時はダイアグラムpreviewをスキップする
        inp.addEventListener('input', () => {
          const v = inp.value.trim();
          if (isNoChordInput(v)) return;
          if (isChordLikeInput(v)) _onPreviewChord?.(v);
        });
      }
    },
      buttons: (close) => [
      _mkMBtn('完了', 'ok', () => { _clearSavedDiagState?.(); close(); }),
    ],
  });
}
