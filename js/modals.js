/**
 * ════════════════════════════════════════
 * modals.js — モーダル UIロジック
 * ════════════════════════════════════════
 *
 * 【責務】
 *   - モーダルの中身（HTML・イベント・callback通知）
 *   - UI lifecycle（open/close）
 *   - interaction lifecycle（confirm/cancel/delete）
 *
 * 【持たないもの】
 *   - state mutation（project.lines の書き換え等）
 *   - refreshEditor 等の副作用
 *   - モーダル土台のDOM（mOv/mTit/mBody/mBtns）
 *
 * 【データフロー】
 *
 *   app.js
 *     └ initModals({ openModal, closeModal, mkMBtn, toast, getAudioTime })
 *           ↓ 土台・ユーティリティを注入
 *     modals.js
 *           └ 中身を生成・イベント登録
 *           └ onConfirm / onDelete / onCopy で app.js へ通知
 *           └ closeは modal 内部で呼ぶ
 *
 * 【33-1 切り出し対象】
 *   - openTimeModal   : 行の時刻設定
 *   - openRepeatModal : 繰り返し回数設定
 *   - openCopyModal   : コードのコピー
 *
 * 【将来追加予定（33-2, 33-3）】
 *   - openAddDiagramModal / openEditDiagramModal
 *   - openAddChord / openChordEdit
 */


// ────────────────────────────────────────
// MODULE STATE
// initModals() で設定される注入済み依存
// ────────────────────────────────────────
let _openModal   = null;  // () => void : モーダルを開く
let _closeModal  = null;  // () => void : モーダルを閉じる
let _mkMBtn      = null;  // (txt, cls, fn) => HTMLElement : ボタン生成
let _toast       = null;  // (msg) => void : トースト通知
let _getAudioTime = null; // () => number : 現在再生位置（秒）


// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
/**
 * initModals
 *
 * app.js から呼ばれる初期化関数。
 * モーダル土台と共通ユーティリティを注入する。
 *
 * @param {object} deps
 * @param {Function} deps.openModal    - モーダルを開く（mOv に open クラスを付ける）
 * @param {Function} deps.closeModal   - モーダルを閉じる
 * @param {Function} deps.mkMBtn       - フッターボタンを生成する
 * @param {Function} deps.toast        - トースト通知
 * @param {Function} deps.getAudioTime - 現在の再生位置（秒）を返す
 */
export function initModals({ openModal, closeModal, mkMBtn, toast, getAudioTime }) {
  _openModal    = openModal;
  _closeModal   = closeModal;
  _mkMBtn       = mkMBtn;
  _toast        = toast;
  _getAudioTime = getAudioTime;
}


// ────────────────────────────────────────
// openTimeModal
// ────────────────────────────────────────
/**
 * 行の時刻（秒）を設定するモーダル
 *
 * 【ownership図】
 *   app.js
 *     └ line（読み取り）・onConfirm・onDelete を渡す
 *           ↓
 *     modals.js（このファイル）
 *           └ 入力UI生成
 *           └ 「▶ 現在位置」ボタン → getAudioTime() で取得
 *           └ onConfirm(time) で app.js へ通知
 *           └ onDelete() で app.js へ通知
 *           └ closeModal() は内部で呼ぶ
 *
 * @param {object} opts
 * @param {number}        opts.idx       - 行インデックス（表示用）
 * @param {object}        opts.line      - 対象行（読み取り専用）
 * @param {Function}      opts.onConfirm - (time: number) => void
 * @param {Function}      opts.onDelete  - () => void
 */
export function openTimeModal({ idx, line, onConfirm, onDelete }) {
  _openModal({
    title: `行${idx + 1}の時刻を設定`,
    body: `
      <div class="modal-caption modal-section">「${line.lyric || '(空)'}」</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="mi-t" class="mi"
          value="${line.time != null ? line.time.toFixed(3) : ''}"
          step="0.1" min="0" placeholder="秒 (例: 12.500)"
          style="font-size:13px">
        <button id="mi-t-current" class="sm-btn" style="white-space:nowrap">▶ 現在位置</button>
      </div>`,
    onOpen: () => {
      // 「現在位置」ボタン
      document.getElementById('mi-t-current')?.addEventListener('click', () => {
        document.getElementById('mi-t').value = _getAudioTime().toFixed(3);
      });
      // フォーカス
      const el = document.getElementById('mi-t');
      if (el) el.focus();
    },
    buttons: (close) => [
      _mkMBtn('キャンセル', '', close),
      _mkMBtn('時刻を削除', 'del', () => {
        onDelete();
        close();
      }),
      _mkMBtn('セット', 'ok', () => {
        const v = parseFloat(document.getElementById('mi-t').value);
        if (!isNaN(v)) onConfirm(v);
        close();
      }),
    ],
  });
}


// ────────────────────────────────────────
// openRepeatModal
// ────────────────────────────────────────
/**
 * 繰り返し回数を設定するモーダル
 *
 * 【ownership図】
 *   app.js
 *     └ line（読み取り）・onConfirm・onDelete を渡す
 *           ↓
 *     modals.js
 *           └ ステッパーUI生成
 *           └ onConfirm(count) で app.js へ通知
 *           └ onDelete() で app.js へ通知
 *           └ closeModal() は内部で呼ぶ
 *
 * @param {object} opts
 * @param {number}        opts.idx       - 行インデックス（表示用）
 * @param {object}        opts.line      - 対象行（読み取り専用）
 * @param {Function}      opts.onConfirm - (count: number) => void
 * @param {Function}      opts.onDelete  - () => void  ※ repeat存在時のみ使用
 */
export function openRepeatModal({ idx, line, onConfirm, onDelete }) {
  let cnt = line.repeat ? line.repeat.count : 2;

  _openModal({
    title: `行${idx + 1}のリピート設定`,
    body: `
      <div class="modal-caption modal-section">イントロ・リフなどの繰り返し回数を設定します</div>
      <div class="repeat-stepper modal-section">
        <button id="r-minus" class="sm-btn repeat-stepper-btn">−</button>
        <div style="text-align:center">
          <div id="r-cnt" class="repeat-stepper-value">${cnt}</div>
          <div class="repeat-stepper-label">回繰り返し</div>
        </div>
        <button id="r-plus" class="sm-btn repeat-stepper-btn">＋</button>
      </div>
      <div class="repeat-quickpick">
        ${[2, 3, 4, 8, 16].map(n =>
          `<button class="pal-chord" style="font-size:13px"
            data-repeat-n="${n}">${n}回</button>`
        ).join('')}
      </div>`,
    onOpen: () => {
      document.getElementById('r-minus')?.addEventListener('click', () => {
        cnt = Math.max(2, cnt - 1);
        document.getElementById('r-cnt').textContent = cnt;
      });
      document.getElementById('r-plus')?.addEventListener('click', () => {
        cnt++;
        document.getElementById('r-cnt').textContent = cnt;
      });
      // クイックピック（data属性で取得、window汚染なし）
      document.querySelectorAll('[data-repeat-n]').forEach(btn => {
        btn.addEventListener('click', () => {
          cnt = parseInt(btn.dataset.repeatN);
          document.getElementById('r-cnt').textContent = cnt;
        });
      });
    },
    buttons: (close) => {
      const btns = [
        _mkMBtn('キャンセル', '', close),
      ];
      if (line.repeat) {
        btns.push(_mkMBtn('リピート削除', 'del', () => {
          onDelete();
          close();
        }));
      }
      btns.push(_mkMBtn('セット', 'ok', () => {
        onConfirm(cnt);
        close();
      }));
      return btns;
    },
  });
}


// ────────────────────────────────────────
// openCopyModal
// ────────────────────────────────────────
/**
 * 行のコードを他の行へコピーするモーダル
 *
 * 【ownership図】
 *   app.js
 *     └ fromIdx・line・lines（読み取り）・onCopy を渡す
 *           ↓
 *     modals.js
 *           └ コピー先リストUI生成
 *           └ onCopy({ targets, replace, copyRepeat }) で app.js へ通知
 *           └ closeModal() は内部で呼ぶ
 *
 * @param {object} opts
 * @param {number}        opts.fromIdx  - コピー元行インデックス
 * @param {object}        opts.line     - コピー元行（読み取り専用）
 * @param {object[]}      opts.lines    - 全行（読み取り専用）
 * @param {Function}      opts.onCopy   - ({ targets: number[], replace: boolean, copyRepeat: boolean }) => void
 */
export function openCopyModal({ fromIdx, line, lines, onCopy }) {
  if (!line.chords.length) {
    _toast('コードがありません');
    return;
  }

  const prev = line.chords.map(c =>
    `<span class="chord-tag" style="pointer-events:none"><span>${c.chord}</span></span>`
  ).join('');

  const rows = lines.map((l, i) => i === fromIdx ? '' :
    `<label class="copy-list-item">
      <input type="checkbox" data-to="${i}"
        style="width:15px;height:15px;accent-color:var(--text-accent)">
      <span class="modal-section-label" style="flex-shrink:0">行${i + 1}</span>
      <span class="copy-list-item-lyric">${l.lyric || '(空)'}</span>
      ${l.chords.length
        ? `<span class="copy-list-item-chords">[${l.chords.map(c => c.chord).join(' ')}]</span>`
        : ''}
    </label>`
  ).join('');

  _openModal({
    title: `行${fromIdx + 1}のコードをコピー`,
    body: `
      <div class="modal-section-label modal-section">コピー元:</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;padding:7px;
        background:var(--surface-overlay);border-radius:6px;margin-bottom:8px">
        ${prev}
        ${line.repeat
          ? `<span class="repeat-badge" style="pointer-events:none">× ${line.repeat.count}回</span>`
          : ''}
      </div>
      <div class="modal-section-label modal-section">コピー先（複数選択可）:</div>
      <div class="copy-list modal-section" id="copy-list">${rows}</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;
        cursor:pointer;padding:5px 0;border-top:1px solid var(--border-ui)">
        <input type="checkbox" id="copy-repeat" ${line.repeat ? 'checked' : ''}
          style="width:14px;height:14px;accent-color:var(--color-amber)">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--color-amber)">
          リピート記号もコピーする</span>
        <span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">
          ${line.repeat ? `(× ${line.repeat.count}回)` : '(元行にリピートなし)'}</span>
      </label>
      <div style="margin-top:4px;font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">
        「追記」= コードを既存の後ろに追加　「上書き」= コード・リピートを置き換え</div>`,
    onOpen: () => {},
    buttons: (close) => {
      const doCopy = (replace) => {
        const checked = document.querySelectorAll('#copy-list input:checked');
        if (!checked.length) {
          _toast('コピー先を選択してください');
          return;
        }
        const targets = Array.from(checked).map(cb => parseInt(cb.dataset.to));
        const copyRepeat = document.getElementById('copy-repeat').checked;
        onCopy({ targets, replace, copyRepeat });
        close();
        _toast(`${targets.length}行に${replace ? '上書き' : '追記'}${copyRepeat && line.repeat ? ' (リピート込み)' : ''}しました`);
      };
      return [
        _mkMBtn('キャンセル', '', close),
        _mkMBtn('上書き', 'am', () => doCopy(true)),
        _mkMBtn('追記',   'ok', () => doCopy(false)),
      ];
    },
  });
}
