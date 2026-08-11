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

import { isSepToken, tokenToText } from './tokens.js';

// ────────────────────────────────────────
// MODULE STATE
// initModals() で設定される注入済み依存
// ────────────────────────────────────────
// 33-1: 共通土台
let _openModal    = null;  // ({ title, body, onOpen, buttons }) => void
let _closeModal   = null;  // () => void
let _mkMBtn       = null;  // (txt, cls, fn) => HTMLElement
let _toast        = null;  // (msg) => void
let _getAudioTime = null;  // () => number : 現在再生位置（秒）

// 33-2: diagram modal用
let _getPreviewSvg    = null;  // ({ frets, barre }) => string : SVG文字列
let _getCapo          = null;  // () => number
let _generateId       = null;  // () => string
let _onAddDiagram     = null;  // (name, variant) => void
let _onUpdateDiagram  = null;  // (chord, id, patch) => void
let _getDiagCallbacks = null;  // () => { onEdit, onDelete }

// 33-3: chord modal用
let _onPreviewChord = null;  // (chord: string) => void


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
export function initModals({
  // 33-1: 共通土台
  openModal, closeModal, mkMBtn, toast, getAudioTime,
  // 33-2: diagram modal用
  getPreviewSvg, getCapo, generateId,
  onAddDiagram, onUpdateDiagram, getDiagCallbacks,
  onPreviewChord,
}) {
  _openModal    = openModal;
  _closeModal   = closeModal;
  _mkMBtn       = mkMBtn;
  _toast        = toast;
  _getAudioTime = getAudioTime;

  _getPreviewSvg    = getPreviewSvg    ?? null;
  _getCapo          = getCapo          ?? null;
  _generateId       = generateId       ?? null;
  _onAddDiagram     = onAddDiagram     ?? null;
  _onUpdateDiagram  = onUpdateDiagram  ?? null;
  _getDiagCallbacks = getDiagCallbacks ?? null;
  _onPreviewChord = onPreviewChord ?? null;
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
// openMergeSectionWarningModal
// ────────────────────────────────────────
/**
 * merge実行によりSectionが削除される場合の確認モーダル（Phase114）
 *
 * 【ownership図】
 *   app.js
 *     └ previewMergeSectionImpact()の結果（sectionNames）・onConfirmを渡す
 *           ↓
 *     modals.js（このファイル）
 *           └ 影響を受けるSection名を列挙表示
 *           └ onConfirm() で app.js へ通知（実際のmerge実行はapp.js側）
 *           └ closeModal() は内部で呼ぶ
 *
 * @param {object} opts
 * @param {string[]}  opts.sectionNames - 削除される見込みのSection名一覧
 * @param {Function}  opts.onConfirm    - () => void（「結合する」選択時）
 */
export function openMergeSectionWarningModal({ sectionNames, onConfirm }) {
  const list = sectionNames.map(name => `<li>${name}</li>`).join('');
  _openModal({
    title: 'Sectionが削除されます',
    body: `
      <div class="modal-caption modal-section">
        この結合操作により、以下のSectionが削除されます。
      </div>
      <ul style="margin:8px 0 0 20px;padding:0">${list}</ul>
      <div class="modal-caption modal-section" style="margin-top:12px">
        この操作は「元に戻す」で取り消せます。
      </div>`,
    buttons: (close) => [
      _mkMBtn('キャンセル', '', close),
      _mkMBtn('結合する', 'ok', () => {
        onConfirm();
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
    isSepToken(c)
      ? `<span class="chord-sep" style="pointer-events:none;padding:0 4px">/</span>`
      : `<span class="chord-tag" style="pointer-events:none"><span>${tokenToText(c)}</span></span>`
  ).join('');

  const rows = lines.map((l, i) => i === fromIdx ? '' :
    `<label class="copy-list-item">
      <input type="checkbox" data-to="${i}"
        style="width:15px;height:15px;accent-color:var(--text-accent)">
      <span class="modal-section-label" style="flex-shrink:0">行${i + 1}</span>
      <span class="copy-list-item-lyric">${l.lyric || '(空)'}</span>
      ${l.chords.length
        ? `<span class="copy-list-item-chords">[${l.chords.map(c => tokenToText(c)).join(' ')}]</span>`
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


// ────────────────────────────────────────
// 内部ヘルパー — buildDiagramForm
// ────────────────────────────────────────
/**
 * Add/Edit 両モーダルで共通のフォームHTML を生成する
 *
 * 【なぜ共通化するか】
 *   openAddDiagramModal と openEditDiagramModal は
 *   フレット入力UI・プレビューエリア・説明文がほぼ同一。
 *   重複を内部helperに寄せておくことで、
 *   将来の仕様変更（弦数・範囲変更等）を1箇所で対応できる。
 *
 * 【local UI state の閉じ込め】
 *   この関数が返すHTMLは「描画用の文字列」のみ。
 *   フレット値の読み取りはonOpen内のイベントで行い、
 *   stateとして保持しない（DOM値を直接読む方式）。
 *
 * @param {object} opts
 * @param {string}   opts.prefix   - 入力要素IDのプレフィックス（'dd' or 'de'）
 * @param {number[]} opts.frets    - 初期フレット値（6弦分）
 * @param {number}   opts.barre    - 初期セーハ値
 */
function buildDiagramForm({ prefix, frets, barre }) {
  return `
    <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:6px">
      各弦のフレット番号（6弦=低音側 → 1弦=高音側）<br>
      <span style="color:var(--color-amber)">−1=ミュート　0=開放　1〜22=フレット番号</span>
    </div>
    <div class="diagram-string-grid modal-section">
      ${['6弦','5弦','4弦','3弦','2弦','1弦'].map((s, i) => `
        <div class="diagram-string-field">
          <div class="modal-field-label" style="margin-bottom:3px">${s}</div>
          <input type="number" id="${prefix}-f${i}"
            value="${frets[i] ?? 0}" min="-1" max="22"
            data-preview="${prefix}">
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:14px;align-items:start">
      <div>
        <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:4px">
          セーハ（0=なし）</div>
        <input type="number" id="${prefix}-b" value="${barre ?? 0}" min="0" max="22"
          style="width:68px;background:var(--surface-overlay);border:1px solid var(--border-ui);
            border-radius:var(--r-md);color:var(--text-primary);font-family:var(--font-mono);
            font-size:14px;padding:5px;text-align:center"
          data-preview="${prefix}">
      </div>
      <div style="flex:1;text-align:center">
        <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:4px">
          プレビュー</div>
        <div id="${prefix}-prev" style="display:flex;justify-content:center"></div>
      </div>
    </div>`;
}

/**
 * プレビューを更新する内部ヘルパー
 *
 * 【local UI state】
 *   フレット値はDOMから直接読む。
 *   modals.js内のローカル処理なので state mutation ではない。
 *
 * 【getPreviewSvg の役割】
 *   SVG生成は chords.js の責務。
 *   modals.js は「SVG文字列を受け取って表示するだけ」。
 *
 * @param {string} prefix - 'dd' or 'de'
 */
function updatePreview(prefix) {
  const frets = Array.from({ length: 6 }, (_, i) =>
    parseInt(document.getElementById(`${prefix}-f${i}`)?.value) || 0
  );
  const barre = parseInt(document.getElementById(`${prefix}-b`)?.value) || 0;
  const el = document.getElementById(`${prefix}-prev`);
  if (el) el.innerHTML = _getPreviewSvg({ frets, barre: barre || null });
}


// ────────────────────────────────────────
// openAddDiagramModal
// ────────────────────────────────────────
/**
 * ギターダイアグラムを新規登録するモーダル
 *
 * 【ownership図】
 *
 *   app.js
 *     └ defaultChord（初期値）・onAddDiagram を渡す
 *           ↓
 *   modals.js（このファイル）
 *     └ フォームUI生成（buildDiagramForm）
 *     └ フレット変更 → updatePreview()（local UI state）
 *     └ 「登録」→ onAddDiagram(name, variant) で app.js へ通知
 *     └ close は内部で呼ぶ
 *
 *   app.js（onAddDiagram の中）
 *     └ addCustomDiagram()   ← chords.js API
 *     └ saveCustomDiagrams() ← chords.js API
 *     └ refreshDiagrams()    ← app.js
 *
 * @param {object} opts
 * @param {string} opts.defaultChord - コード名の初期値（省略可）
 */
export function openAddDiagramModal({ defaultChord = '' } = {}) {
  _openModal({
    title: 'ギターダイアグラムを手動登録',
    body: `
      <div class="diagram-string-grid modal-section">
        <div>
          <div class="modal-field-label">コード名</div>
          <input type="text" id="dd-n" class="mi-sm"
            value="${defaultChord}" placeholder="例: Cadd9"
            style="text-align:center;font-size:14px;letter-spacing:1px">
        </div>
        <div>
          <div class="modal-field-label">ポジション名</div>
          <input type="text" id="dd-v" class="mi-sm"
            value="カスタム" placeholder="ロー/バレー等">
        </div>
      </div>
      ${buildDiagramForm({ prefix: 'dd', frets: [0,0,0,0,0,0], barre: 0 })}
      <div style="margin-top:8px;font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">
        ※ 登録はブラウザのサイトデータを削除するまで保持されます</div>`,
    onOpen: () => {
      // フレット/セーハ変更 → プレビュー更新（local UI stateの閉じ込め）
      document.querySelectorAll('[data-preview="dd"]').forEach(el => {
        el.addEventListener('input', () => updatePreview('dd'));
      });
      // 初期プレビュー
      updatePreview('dd');
      // フォーカス
      const el = document.getElementById('dd-n');
      if (el) { el.focus(); el.select(); }
    },
    buttons: (close) => [
      _mkMBtn('キャンセル', '', close),
      _mkMBtn('登録', 'ok', () => {
        const name  = document.getElementById('dd-n').value.trim();
        const vname = document.getElementById('dd-v').value.trim() || 'カスタム';
        if (!name) { _toast('コード名を入力してください'); return; }
        const frets = Array.from({ length: 6 }, (_, i) =>
          parseInt(document.getElementById(`dd-f${i}`).value) || 0
        );
        const barre = parseInt(document.getElementById('dd-b').value) || 0;
        // variant生成・ID付与は app.js 側の generateId を使う
        // （ID policy は orchestration責務のため modal側で持たない）
        const variant = {
          n: vname,
          f: frets,
          b: barre || undefined,
          _custom: true,
          _id: _generateId(),
        };
        _onAddDiagram(name, variant);  // app.js が mutation + refresh を担当
        close();
        _toast(`✅ "${name}" (${vname}) を登録・保存しました`);
      }),
    ],
  });
}


// ────────────────────────────────────────
// openEditDiagramModal
// ────────────────────────────────────────
/**
 * 既存のカスタムダイアグラムを編集するモーダル
 *
 * 【ownership図】
 *
 *   app.js（getDiagCallbacks経由で呼ばれる）
 *     └ chord（コード名）・id（variant ID）・variant（初期値）を渡す
 *           ↓
 *   modals.js（このファイル）
 *     └ フォームUI生成（buildDiagramForm・初期値あり）
 *     └ フレット変更 → updatePreview()（local UI state）
 *     └ 「保存」→ onUpdateDiagram(chord, id, patch) で app.js へ通知
 *     └ close は内部で呼ぶ
 *
 *   app.js（onUpdateDiagram の中）
 *     └ diagPushUndo()         ← chords.js API
 *     └ updateCustomDiagram()  ← chords.js API
 *     └ saveCustomDiagrams()   ← chords.js API
 *     └ refreshDiagrams()      ← app.js
 *
 * 【addとの違い】
 *   - コード名は変更不可（disabled）
 *   - 初期値として既存 variant の値を使う
 *   - 登録ではなく「更新」なので _generateId は不要
 *
 * @param {object} opts
 * @param {string}   opts.chord   - コード名（表示・更新キー）
 * @param {string}   opts.id      - variant ID
 * @param {object}   opts.variant - 既存variant（{ n, f, b }）
 */
export function openEditDiagramModal({ chord, id, variant }) {
  _openModal({
    title: 'ギターダイアグラムを編集',
    body: `
      <div class="diagram-string-grid modal-section">
        <div>
          <div class="modal-field-label">コード名</div>
          <input type="text" id="de-n" class="mi-sm"
            value="${chord}" disabled
            style="text-align:center;font-size:14px;letter-spacing:1px;opacity:0.6">
        </div>
        <div>
          <div class="modal-field-label">ポジション名</div>
          <input type="text" id="de-v" class="mi-sm"
            value="${variant.n}" placeholder="ロー/バレー等">
        </div>
      </div>
      ${buildDiagramForm({ prefix: 'de', frets: variant.f, barre: variant.b ?? 0 })}`,
    onOpen: () => {
      document.querySelectorAll('[data-preview="de"]').forEach(el => {
        el.addEventListener('input', () => updatePreview('de'));
      });
      updatePreview('de');
    },
    buttons: (close) => [
      _mkMBtn('キャンセル', '', close),
      _mkMBtn('保存', 'ok', () => {
        const vname = document.getElementById('de-v').value.trim() || 'カスタム';
        const frets = Array.from({ length: 6 }, (_, i) =>
          parseInt(document.getElementById(`de-f${i}`).value) || 0
        );
        const barre = parseInt(document.getElementById('de-b').value) || 0;
        const patch = { n: vname, f: frets, b: barre || undefined };
        _onUpdateDiagram(chord, id, patch);  // app.js が undo + mutation + refresh を担当
        close();
        _toast('✅ 編集しました');
      }),
    ],
  });
}

// ────────────────────────────────────────
// openChordEdit
// ────────────────────────────────────────
/**
 * コードを編集するモーダル
 *
 * 【ownership図】
 *   app.js
 *     └ chord（現在値・読み取り専用）・onConfirm・onDelete を渡す
 *           ↓
 *   modals.js（このファイル）
 *     └ 入力UI生成
 *     └ input変更 → onPreviewChord(chord) で右パネル更新を依頼
 *     └ onConfirm(newChord) で app.js へ通知
 *     └ onDelete() で app.js へ通知
 *     └ close は内部で呼ぶ
 *
 *   app.js（onConfirm の中）
 *     └ addToPaletteIfNew()
 *     └ chords[ci].chord = v
 *     └ refreshEditor()
 *
 *   app.js（onDelete の中）
 *     └ chords.splice(ci, 1)
 *     └ refreshEditor()
 *
 * @param {object} opts
 * @param {string}   opts.chord     - 現在のコード名（初期値として使用）
 * @param {Function} opts.onConfirm - (newChord: string) => void
 * @param {Function} opts.onDelete  - () => void
 */
export function openChordEdit({ chord, onConfirm, onDelete }) {
  _openModal({
    title: 'コードを編集',
      body: `<input type="text" id="mi-c" class="mi"
              style="font-size:18px;letter-spacing:2px"
              autocomplete="off">`,
      onOpen: () => {
        const el = document.getElementById('mi-c');
        if (!el) return;
        el.value = chord;   // ← onOpen内でセット
        el.focus();
        el.select();
        el.addEventListener('input', () => {
        _onPreviewChord?.(el.value.trim());
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const v = el.value.trim();
          if (v) onConfirm(v);
          _closeModal();
        }
      });
    },
    buttons: (close) => [
      _mkMBtn('キャンセル', '', close),
      _mkMBtn('削除', 'del', () => {
        onDelete();
        close();
      }),
      _mkMBtn('更新', 'ok', () => {
        const v = document.getElementById('mi-c')?.value.trim();
        if (v) onConfirm(v);
        close();
      }),
    ],
  });
}