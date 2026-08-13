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
 *   - showChordSelector(opts): 単一コードを選んで即座に閉じる軽量モーダル（Phase75で新設）
 *   - buildPaletteHtml(): パレットボタンHTML生成（openAddChord/showChordSelector共通・pure function）
 *
 * 【openAddChord() と showChordSelector() の責務の違い（Phase75で明確化）】
 *   openAddChord() は「複数コードを連続追加し続けられる常駐モーダル」
 *     （insertAtカーソル・プレビュー一覧・小節線追加を持つ、行編集そのものを担うサブシステム）。
 *   showChordSelector() は「1つ選んで即座に閉じる」ことだけが責務。
 *     小節線追加・連続追加・カーソル移動は一切持たない。
 *   両者の責務が本質的に異なるため、無理に一方が他方を呼ぶ構造にはしていない。
 *   共通化するのは本当に共通な部分（パレットHTML生成・入力バリデーション）のみに限定する。
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
  return /^[A-G](#|♯|b|♭)?[A-Za-z0-9#♯b♭/+\-]*$/.test(v.trim());
}

// ────────────────────────────────────────
// PALETTE HTML（pure function・Phase75で抽出）
// ────────────────────────────────────────
/**
 * buildPaletteHtml
 *
 * パレット（楽曲で既に使われているコード一覧）のボタンHTML文字列を生成する。
 * openAddChord() と showChordSelector() の両方から呼ばれる、唯一の共通部分。
 *
 * 【pure function であることの意図】
 *   DOM操作・イベント登録は一切行わない（HTML文字列を組み立てるだけ）。
 *   クリック時の処理は inline onclick 経由で window 上のハンドラ名を呼ぶ形とし、
 *   「どの関数を呼ぶか」は呼び出し元（onClickHandlerName）が決める。
 *   これにより UI ロジック（何が起きるか）は openAddChord / showChordSelector それぞれが持ち、
 *   このヘルパーは「表示」だけに責務を絞る。
 *
 * @param {string[]} palette - パレットのコード名一覧
 * @param {number} transpose - パレット表示用の移調量（paletteTranspose）
 * @param {string} onClickHandlerName - window に生やされたクリックハンドラ名（例: '_mac_add'）
 * @returns {string} HTML文字列（パレットが空なら空文字）
 */
function buildPaletteHtml(palette, transpose, onClickHandlerName) {
  if (!palette.length) return '';
  return `<div class="modal-section">
        <div class="modal-field-label">楽曲のコードから選択:</div>
        <div class="mac-palette-list">
          ${palette.map(c => {
            const d = _transposeChord(c, transpose);
            return `<button class="pal-chord" style="font-size:11px"
              onclick="${onClickHandlerName}('${d.replace(/'/g, "\\'").replace(/\//g, '\\/')}')">${d}</button>`;
          }).join('')}
        </div>
      </div>`;
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
        dx.className = 'mac-preview-tag-del chord-delete-btn';
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
  const palHtml = buildPaletteHtml(palette, paletteTranspose, '_mac_add');

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

// ────────────────────────────────────────
// SHOW CHORD SELECTOR（Phase75で新設）
// ────────────────────────────────────────
/**
 * showChordSelector — 単一コードを選ぶための軽量モーダル。
 *
 * 【責務】
 *   - テキスト入力 + パレットから「1つだけ」コードを選ぶ
 *   - Enter / パレットクリック / 「決定」ボタン → 確定 → onSelect() → モーダルを閉じる
 *   - Escape / 「キャンセル」ボタン → onCancel() のみ呼び、状態は一切変更しない
 *
 * 【openAddChord() との違い（ファイル冒頭コメント参照）】
 *   小節線追加・連続追加・カーソル移動は持たない。1回選んだら閉じるだけ。
 *   Analysis Editor（コード追加・コード名変更）から利用される想定だが、
 *   「コードを1つ選ぶ」という汎用UIとして他の用途でも再利用できる。
 *
 * 【バリデーション方針（重要・Phase75で確認済み）】
 *   isChordLikeInput() / isNoChordInput() は openAddChord() と完全に同じものを使う。
 *   normalizeChordName() 等の追加正規化はここでは行わない。
 *   理由: このプロジェクトの既存設計（Phase20・A案）は
 *     「保存時は正規化しない・CHORD_DB参照時にのみ normalizeChordName() を通す」
 *   という on-the-fly normalize 方式。showChordSelector() だけ別ルールにすると、
 *   Analysis Editorで入力したコードだけ品質基準が変わってしまうため、
 *   既存と全く同じバリデーション（大文字ルート必須）をそのまま踏襲する。
 *
 * 【no_chord入力の扱い】
 *   N / NC / N.C. / (N.C) 等は isNoChordInput() で判定し、
 *   { name: 'N' }（文字列）として onSelect に渡す。
 *   openAddChord() の { type:'no_chord' } token（project.lines用）とは別物。
 *   Analysis Editorのchordはtoken streamではなく { chord, start, end, _id } という
 *   フラットな構造のため、name フィールドに 'N' という文字列を渡す形が正しい
 *   （normalizeChordName() が 'N' をそのまま通す既存仕様と整合する）。
 *
 * @param {object} opts
 * @param {string} [opts.title='コードを選択'] - モーダルタイトル
 * @param {string} [opts.initialChord=''] - 入力欄の初期値
 * @param {(chord: {name: string}) => void} opts.onSelect - 確定時に呼ばれる（{name}を渡す）
 * @param {() => void} [opts.onCancel] - キャンセル時に呼ばれる（状態変更は呼び出し元の責務・ここでは何もしない）
 */
export function showChordSelector({
  title = 'コードを選択',
  initialChord = '',
  onSelect,
  onCancel,
} = {}) {
  const palette = _getPalette();
  const paletteTranspose = _getPaletteTranspose();
  const palHtml = buildPaletteHtml(palette, paletteTranspose, '_cs_pick');

  function commit(ch) {
    if (!ch) return;

    if (isNoChordInput(ch)) {
      onSelect?.({ name: 'N' });
      _closeModal();
      return;
    }

    // domain validation: openAddChord() と同一基準（大文字ルート必須）
    if (!isChordLikeInput(ch)) return;
    onSelect?.({ name: ch });
    _closeModal();
  }

  // NOTE: inline onclick の制約上 window 汚染を許容（openAddChordの_mac_addと同じ理由）
  window._cs_pick = (ch) => commit(ch);

  _openModal({
    title,
    body: `
      <div class="modal-input-row modal-section" style="gap:6px">
        <input type="text" id="cs-input" class="mi"
          placeholder="コード名 (例: Am7)" autocomplete="off"
          lang="en" inputmode="latin"
          value="${String(initialChord).replace(/"/g, '&quot;')}"
          style="font-size:15px;letter-spacing:1px;flex:1;ime-mode:disabled">
        <button id="cs-ok-btn" class="sm-btn green"
          style="white-space:nowrap;font-size:13px">決定</button>
      </div>
      ${palHtml}
    `,
    onOpen: () => {
      const inp = document.getElementById('cs-input');

      document.getElementById('cs-ok-btn')?.addEventListener('click', () => {
        commit(inp?.value.trim());
      });

      if (inp) {
        inp.focus();
        inp.select();

        let justComposed = false;
        inp.addEventListener('compositionend', () => {
          justComposed = true;
          setTimeout(() => { justComposed = false; }, 0);
        });

        inp.addEventListener('keydown', e => {
          // [Bug fix] Enter確定 → commit() → _closeModal()がinput要素をDOMから
          // 削除するため、この直後にactiveElementがbodyへ移り、かつmodal-ovの
          // 'open'クラスも外れる。この同じEnterイベントがdocument側のグローバル
          // keydownハンドラまでbubbleすると、両方のガード
          //（modal-ov openチェック / activeElement tagチェック）が既に無効化された
          // 状態で判定されてしまい、editorMode==='single'の場合に
          // openChordRenameSelector()が即座に再オープンされる不具合があった。
          // stopPropagation()でこのイベント自体をここで消費し、
          // document側へ伝播させないことで解消する。
          if (e.key === 'Escape') { onCancel?.(); _closeModal(); return; }
          if (e.key === 'Enter') {
            if (e.isComposing || justComposed) return;
            e.preventDefault();
            e.stopPropagation();
            commit(inp.value.trim());
          }
        });
      }
    },
    buttons: (close) => [
      _mkMBtn('キャンセル', 'cancel', () => { onCancel?.(); close(); }),
    ],
  });
}
