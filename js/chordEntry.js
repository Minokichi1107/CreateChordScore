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

import { isSepToken } from './tokens.js';

// ────────────────────────────────────────
// MODULE STATE（注入済み依存）
// ────────────────────────────────────────
let _getLines            = null;  // () => project.lines
let _getPalette          = null;  // () => palette
let _getPaletteTranspose = null;  // () => paletteTranspose
let _addToPaletteIfNew   = null;  // (chord) => void
let _refreshEditor       = null;  // () => void
let _openModal           = null;  // ({ title, body, onOpen, buttons }) => void
let _closeModal          = null;  // () => void
let _mkMBtn              = null;  // (txt, cls, fn) => HTMLElement
let _toast               = null;  // (msg) => void
let _unlockDiag          = null;  // () => void（AddChord open時にlock解除）
let _onPreviewChord      = null;  // (chord) => void（input変更時の右パネル更新）
let _transposeChord      = null;  // (chord, semitones) => string

// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
/**
 * initChordEntry
 *
 * app.js の DOMContentLoaded から呼ばれる。
 * 依存をすべて注入する。
 *
 * 【forcePreviewChord を受け取らない理由】
 *   AddChord open 時に unlockDiag() を呼ぶため、modal 内は常に diagLocked = false。
 *   そのため diagLocked を無視して強制更新する forcePreviewChord は不要。
 *   forcePreviewChord は将来の preview layer 拡張（hover / keyboard / playback preview）
 *   向けに app.js に予約されている。
 */
export function initChordEntry({
  getLines,
  getPalette,
  getPaletteTranspose,
  addToPaletteIfNew,
  refreshEditor,
  openModal,
  closeModal,
  mkMBtn,
  toast,
  unlockDiag,
  onPreviewChord,
  transposeChord,
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
}

// ────────────────────────────────────────
// INPUT VALIDATION
// ────────────────────────────────────────
/**
 * isChordLikeInput
 *
 * コード名として妥当な入力かを判定する domain validator。
 *
 * 【設計方針】
 *   「非ASCII禁止」ではなく「コードっぽい入力だけ通す」。
 *   これにより ♭（U+266D）/ ♯（U+266F）/ △ / ø 等の音楽記号は通り、
 *   日本語・全角かなは落ちる。
 *
 * 【通るもの】
 *   C, Cm7, D♭, F#sus4, Bbadd9, Am7/D
 *
 * 【落ちるもの】
 *   あ, あdf, hello（A-G以外で始まる英単語）
 *
 * 【将来の拡張】
 *   N.C. / sim. 等の非コードトークンは tokens.js 側で扱う。
 *   このバリデーターはあくまで「コード入力欄の入力値チェック」に限定。
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
/**
 * openAddChord
 *
 * コード追加モーダルを開く。
 *
 * 【insertAt state の扱い】
 *   - null  = 末尾に挿入
 *   - 数値  = splice位置
 *   - modal内ローカル変数（外部に漏れない）
 *
 * 【lock解除のタイミング】
 *   modal open 時に unlockDiag() を呼ぶ。
 *   これにより modal 内では diagLocked = false が保証され、
 *   input preview は通常の updateDiagRight 相当で動作する。
 *
 * @param {number} idx - 対象行インデックス
 */
export function openAddChord(idx) {
  // AddChord 開始 = diagLock session 終了
  // 「固定表示モード」と「コード入力モード」は目的が競合するため lock を解除する。
  // 将来「lock維持しながら入力」の要件が出た場合は上部のコメントを参照。
  _unlockDiag?.();

  // 挿入位置（modal内ローカル state）
  // null = 末尾、数値 = splice位置
  let insertAt = null;

  // ── 挿入位置ボタン ──
  function mkInsertBtn(pos) {
    const btn = document.createElement('button');
    btn.className = 'mac-insert-btn';
    btn.textContent = '＋';
    btn.title = pos === null ? '末尾に挿入' : `位置${pos + 1}に挿入`;
    btn.dataset.pos = pos === null ? 'end' : String(pos);
    btn.addEventListener('click', () => {
      insertAt = pos;
      renderModalPreview();
      const inp = document.getElementById('mac-input');
      if (inp) inp.focus();
    });
    return btn;
  }

  // ── プレビュー再描画 ──
  function renderModalPreview() {
    const line = _getLines()[idx];
    const previewEl = document.getElementById('mac-preview');
    if (!previewEl) return;
    previewEl.innerHTML = '';

    const headBtn = mkInsertBtn(0);
    if (insertAt === 0) headBtn.classList.add('active');
    previewEl.appendChild(headBtn);

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
        nm.textContent = c.chord;
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
      const afterBtn = mkInsertBtn(isLast ? null : pos);
      if (isActive) afterBtn.classList.add('active');
      previewEl.appendChild(afterBtn);
    });
  }

  // ── コード追加 ──
  function addChord(ch) {
    if (!ch) return;
    // domain validation: コードとして妥当な入力のみ受け付ける
    // IME誤入力・日本語・A-G以外で始まる文字列を防ぐ
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

        // IME確定直後フラグ
        // Chrome系では変換確定Enter時に isComposing=false になるため、
        // compositionend で1フレーム分のガードを設ける
        let justComposed = false;
        inp.addEventListener('compositionend', () => {
          justComposed = true;
          setTimeout(() => { justComposed = false; }, 0);
        });

        // Escape: keydown で即時処理（IMEと衝突しない）
        inp.addEventListener('keydown', e => {
          if (e.key === 'Escape') {
            _closeModal();
            return;
          }
          // Enter: isComposing / justComposed でガード
          // 非ASCII文字チェックは addChord 内でも行うため二重ガードになる
          if (e.key === 'Enter') {
            if (e.isComposing || justComposed) return;
            e.preventDefault();
            addChord(inp.value.trim());
          }
        });

        // keyup の Enter は不要（addChord内の非ASCII検証で防護済み）

        // input変更 → 右パネル一時更新
        // unlock済みのため diagLocked = false が保証されており、
        // forcePreviewChord ではなく onPreviewChord（= updateDiagRight 相当）で十分。
        // isChordLikeInput でコードとして妥当な入力のみ右パネルに渡す
        inp.addEventListener('input', () => {
          const v = inp.value.trim();
          if (isChordLikeInput(v)) _onPreviewChord?.(v);
        });
      }
    },
    buttons: (close) => [
      _mkMBtn('完了', 'ok', close),
    ],
  });
}
