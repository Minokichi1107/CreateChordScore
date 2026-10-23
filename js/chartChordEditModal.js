/**
 * Phase148: Chart Mode code-edit modal prototype.
 * The modal edits a private clone of the active Analysis Editor session.
 * The authoritative session is mutated only when the user chooses 完了.
 *
 * 構成:
 *  - createChartChordEditController: DOMを持たない編集ロジック（作業用コピー上でCommandを呼ぶ）。
 *  - renderChartChordEditBody: 画面HTMLの生成（controllerの状態を表示するだけ）。
 *  - openChartChordEditModal: DOMイベントをcontrollerへ接続する。
 *  - commitChartChordEditDraft: 「完了」で本体セッションへ1回のUndo単位として反映する。
 *
 * 仕様の境界（未決事項は変更しない）:
 *  - 編集対象はチャートで選択中の1コードだけ（コード列・使用中コード・削除・時間分割は持たない）。
 *  - 入力方式は「コードビルダー」「直接入力」の切替式（選んだ方式だけ表示。最後の選択は呼び出し元が記憶する）。
 *  - Enter と「完了」は同じ確定処理（confirm → complete）を通る。
 *  - 内部保存値（B1）・Type内部ID（A2）は決定しない。
 *
 * 既存コードの復元と保存保護（restore-protection-spec v3）:
 *  - ビルダーは「選択中チップ」に同期する。既存チップを選ぶと、画面表示名から完全一致で
 *    Root/Type/Bass を復元し（parseChordToBuilder）、その値を baseline とする。
 *  - 「決定」は baseline と異なるときだけ有効（baseline が無い＝新チップ・復元不可・N.C. は Root 選択後に有効）。
 *    比較は builder と baseline の文字列だけで、保存値の再生成結果とは比べない。
 *  - 決定後の baseline は決定時の builder 値。チップ表示名（カポ・読み替えで綴りが変わりうる）から再復元しない。
 *  - 復元はビルダーの画面状態だけを書き換える。曲データ（draft）・hasChanges・Undo には触れない。
 */
import { updateChordCommand } from './analysisCommands.js';
import { isChordLikeInput } from './chordEntry.js';
import { pushHistory, refreshSelection } from './analysisSession.js';
import {
  BUILDER_ROOT_OPTIONS, BUILDER_TYPE_OPTIONS, BUILDER_BASS_OPTIONS,
  DEFAULT_BUILDER_TYPE_ID, buildChordName, parseChordToBuilder,
  getBuilderNumberOf, formatBuilderNumber,
} from './chordBuilderCatalog.js';
import { attachModalDrag } from './chordModalDrag.js';
import { decideModalKey, reduceDigit, nextBuilderField, autoAdvanceField } from './chordBuilderKeyboard.js';
import {
  TIP_FIELDS, TIP_CLOSED, buildNumberTipRows, tipSections, reduceTip, computeTipPosition,
} from './chordBuilderNumberTip.js';

// ビルダーの未選択状態（Root 未選択・Type は既定・Bass は指定なし）
const UNSELECTED_BUILDER = { root: '', type: DEFAULT_BUILDER_TYPE_ID, bass: '' };
const BUILDER_FIELD_KINDS = ['root', 'type', 'bass'];
const ROOT_PLACEHOLDER_OPTION = { label: '— ルートを選択 —', value: '' };
// 復元できなかった既存コード・N.C. を選んだときの表示（新チップの未選択状態では出さない）
export const BUILDER_NOTICE_TEXT = {
  unsupported: 'このコードはビルダー対象外です。直接入力で編集できます。',
  nc: 'N.C.（コードビルダー対象外）',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function payload(state) {
  return { buffer: state.buffer, sections: state.sections };
}

function samePayload(a, b) {
  return JSON.stringify(payload(a)) === JSON.stringify(payload(b));
}

function selectedChord(state) {
  const id = state.selection && state.selection.chordIds && state.selection.chordIds[0];
  return state.buffer.find(chord => chord._id === id) || null;
}

/**
 * Commit the modal draft as one Analysis Editor history entry.
 * Returns false when the draft contains no final data change.
 */
export function commitChartChordEditDraft(session, draft) {
  if (samePayload(session, draft)) return false;
  pushHistory(session);
  session.buffer = structuredClone(draft.buffer);
  session.sections = structuredClone(draft.sections ?? []);
  session.hasContentEdit = session.hasContentEdit || draft.hasContentEdit;
  refreshSelection(
    session,
    draft.selection?.chordIds ?? [],
    draft.selection?.anchorChordId ?? null
  );
  return true;
}

// N / NC / N.C. / (N.C) 等はN.C.入力。既存のコード選択UI（chordEntry.js isNoChordInput）と同じ判定で、
// 保存値は 'N'（chordEntry.js showChordSelector と同じ）。通常のRoot/Type生成経路には混ぜない。
function isNoChordText(value) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[.\s()]/g, '');
  return normalized === 'N' || normalized === 'NC';
}

export const INPUT_MODES = ['builder', 'direct'];

export function createChartChordEditController({
  initialState, inputMode = 'builder',
  toDisplayChord = chord => chord,
  toCanonicalChord = chord => chord,
}) {
  const draft = structuredClone(initialState);
  const baseline = structuredClone(initialState);
  const c = {
    draft, toDisplayChord, toCanonicalChord,
    mode: inputMode === 'direct' ? 'direct' : 'builder',   // 表示中の入力方式（UI状態。曲データ・hasChanges には影響しない）
    builder: { ...UNSELECTED_BUILDER },
    baseline: null,        // 復元できたコードの基準値 {root,type,bass}。それ以外は null
    notice: 'none',        // 'none' | 'unsupported' | 'nc'
    inputValue: toDisplayChord(selectedChord(draft)?.chord || ''),
    hint: '',
  };

  c.current = () => selectedChord(draft);
  c.builderName = () => buildChordName(c.builder.root, c.builder.type, c.builder.bass);
  c.builderChanged = () => !c.baseline || c.builder.root !== c.baseline.root
    || c.builder.type !== c.baseline.type || c.builder.bass !== c.baseline.bass;
  c.canDecide = () => !!c.current() && c.builder.root !== '' && !!c.builderName() && c.builderChanged();
  // 直接入力欄の文字列 → 保存用のコード名（N.C.は 'N'、それ以外は表示名→実音へ）
  const canonicalFromInput = () => {
    const text = String(c.inputValue).trim();
    if (!text) return '';
    return isNoChordText(text) ? 'N' : toCanonicalChord(text);
  };
  c.hasChanges = () => !samePayload(baseline, draft);

  // ビルダーを未選択へ戻す（notice は呼び出し側が指定）。builder オブジェクトは同一のまま値だけ戻す
  const resetBuilder = notice => {
    Object.assign(c.builder, UNSELECTED_BUILDER);
    c.baseline = null;
    c.notice = notice;
  };

  // 選択中チップの画面表示名から builder を復元する（完全一致のみ）。曲データ・draft には一切触れない。
  c.syncBuilderFromSelection = () => {
    const current = c.current();
    if (!current) { resetBuilder('none'); return; }
    const parsed = parseChordToBuilder(toDisplayChord(current.chord));
    if (parsed.kind === 'ok') {
      Object.assign(c.builder, { root: parsed.root, type: parsed.type, bass: parsed.bass });
      c.baseline = { root: parsed.root, type: parsed.type, bass: parsed.bass };
      c.notice = 'none';
    } else {
      resetBuilder(parsed.kind === 'nc' ? 'nc' : 'unsupported');
    }
  };

  c.setBuilder = (field, value) => {
    if (!(field in c.builder)) return false;
    c.builder[field] = value;
    return true;
  };

  c.setInput = value => { c.inputValue = value; };

  c.setMode = mode => {
    if (!INPUT_MODES.includes(mode) || mode === c.mode) return false;
    c.mode = mode;
    c.hint = '';
    return true;
  };

  // ビルダーで生成したコード名を選択中のコードへ適用する（draft のみ。confirm から呼ばれる）
  c.decide = () => {
    c.hint = '';
    const current = c.current();
    if (!current) { c.hint = '編集するコードを選択してください。'; return { ok: false }; }
    const name = c.builderName();
    if (!name) { c.hint = 'ルート音を選択してください。'; return { ok: false }; }
    // UI の無効化だけに頼らず、ここでも再検査する（強制クリック・直接呼び出しでも曲データを変えない）
    if (!c.canDecide()) return { ok: false, reason: 'unchanged' };
    const result = updateChordCommand(draft, current._id, { chord: toCanonicalChord(name) });
    if (!result.ok) { c.hint = 'コードを更新できませんでした。'; return result; }
    // 決定後の基準値は決定時の builder 値。表示名（カポ・読み替えで綴りが変わりうる）から再復元しない。
    c.baseline = { root: c.builder.root, type: c.builder.type, bass: c.builder.bass };
    c.notice = 'none';
    return result;
  };

  // 選択中のコードへコード名（保存値）を適用する。N.C. は 'N'（chordEntry.js showChordSelector と同じ）
  const applyChord = canonical => {
    const current = c.current();
    const result = updateChordCommand(draft, current._id, { chord: canonical });
    if (!result.ok) { c.hint = 'コードを更新できませんでした。'; return result; }
    c.inputValue = toDisplayChord(canonical);
    c.syncBuilderFromSelection();
    return result;
  };

  /**
   * 確定（Enter・「完了」・N.C.ボタン共通の最初の段階）: 表示中の方式の入力を draft へ適用する。
   * 閉じる処理は呼び出し側（complete → closeCurrentModal）。適用できないときは理由を c.hint に入れて ok:false。
   * 元から変わっていない入力は何も適用しない（再計算でカポ換算などの綴りが変わり、保存値が動くのを避ける）。
   * @param {{noChord?: boolean}} opts noChord=true で入力方式にかかわらず N.C.（'N'）にする
   */
  c.confirm = ({ noChord = false } = {}) => {
    c.hint = '';
    const current = c.current();
    if (!current) { c.hint = '編集するコードを選択してください。'; return { ok: false }; }
    if (noChord) return applyChord('N');
    if (c.mode === 'direct') {
      const text = String(c.inputValue).trim();
      if (!text) { c.hint = 'コード名を入力してください。'; return { ok: false }; }
      if (text === toDisplayChord(current.chord)) return { ok: true, unchanged: true };
      if (isNoChordText(text)) return applyChord('N');
      // 検証: 旧 showChordSelector と同じ判定（isChordLikeInput）に加え、ビルダーが作れる名前（例 m7(b5)・7(#5)。括弧を含む）も有効とする
      if (!isChordLikeInput(text) && parseChordToBuilder(text).kind !== 'ok') { c.hint = 'コード名として認識できません（例: Am7、F#m7(b5)）。'; return { ok: false }; }
      return applyChord(toCanonicalChord(text));
    }
    if (c.builder.root === '') { c.hint = 'ルート音を選択してください。'; return { ok: false }; }
    if (!c.builderChanged()) return { ok: true, unchanged: true };
    return c.decide();
  };

  // 「完了」: 整合性を確認し、onCommit（本体への反映）を呼ぶ。閉じてよければ true
  c.complete = onCommit => {
    const changed = c.hasChanges();
    if (changed) {
      const invalid = draft.buffer.some(chord =>
        !chord.chord || !String(chord.chord).trim()
        || !Number.isFinite(chord.start) || !Number.isFinite(chord.end)
        || chord.start >= chord.end);
      if (invalid) { c.hint = 'コードデータに不整合があるため確定できません。'; return false; }
    }
    const committed = onCommit && onCommit(draft, changed);
    return committed !== false;
  };

  c.syncBuilderFromSelection();   // 起動時：呼び出し元で選択済みのチップから復元を試みる
  return c;
}

// 番号付きラベルは表示用の層だけで作る（カタログの label・value・id は変えない。spec v3 §2.4）。
// 番号は末尾に置く（例 `D♭ 03`）。ブラウザ標準の英字先頭一致は選択肢の先頭文字で照合されるため、
// 先頭に数字を置くと `e` `s` などで選べなくなる（R3 の回帰）。数字入力は番号表から選ぶので表示位置に依存しない。
function numberedLabel(field, option, valueKey) {
  const number = getBuilderNumberOf(field, option[valueKey]);
  return number === null ? option.label : option.label + ' ' + formatBuilderNumber(number);
}

function optionsHtml(field, options, selectedValue, valueKey) {
  return options.map(option => '<option value="' + escapeHtml(option[valueKey]) + '"' +
    (option[valueKey] === selectedValue ? ' selected' : '') + '>' +
    escapeHtml(numberedLabel(field, option, valueKey)) + '</option>').join('');
}

// 欄ラベル行（右側に数字入力中の表示 `0_` を出す。常に描画して表示だけ書き換える）
// Root・Type のラベル文字は番号表TIPの表示対象（ホバー／クリック。data-tip-for）
function labelRow(field, text) {
  const tipAttr = TIP_FIELDS.includes(field) ? ' class="chart-chord-builder-tip-target" data-tip-for="' + field + '"' : '';
  return '<span class="chart-chord-builder-labelrow"><span' + tipAttr + '>' + text + '</span>' +
    '<span class="chart-chord-builder-pending" data-pending-for="' + field + '"></span></span>';
}

export function renderChartChordEditBody(c) {
  const current = c.current();
  const modeButtons = [['builder', 'コードビルダー'], ['direct', '直接入力']].map(([mode, label]) =>
    '<button type="button" class="sm-btn chart-chord-edit-mode' + (c.mode === mode ? ' is-active' : '') +
    '" data-action="mode" data-mode="' + mode + '" aria-pressed="' + (c.mode === mode ? 'true' : 'false') + '">' + label + '</button>').join('');

  const builder = '<section class="chart-chord-builder" aria-label="コードビルダー">' +
    '<div class="chart-chord-builder-actions">' +
    '<output class="chart-chord-builder-preview" aria-label="生成されるコード名">' + escapeHtml(c.builderName()) + '</output>' +
    '<button type="button" class="sm-btn" data-action="no-chord">N.C.</button>' +
    '</div>' +
    '<div class="chart-chord-builder-fields">' +
    '<label>' + labelRow('root', 'ルート音') + '<select data-builder="root" aria-label="ルート音">' +
    optionsHtml('root', [ROOT_PLACEHOLDER_OPTION].concat(BUILDER_ROOT_OPTIONS), c.builder.root, 'value') + '</select></label>' +
    '<label>' + labelRow('type', 'コードタイプ') + '<select data-builder="type" aria-label="コードタイプ">' +
    optionsHtml('type', BUILDER_TYPE_OPTIONS, c.builder.type, 'id') + '</select></label>' +
    '<label>' + labelRow('bass', 'ベース音/オンコード') + '<select data-builder="bass" aria-label="ベース音">' +
    optionsHtml('bass', BUILDER_BASS_OPTIONS, c.builder.bass, 'value') + '</select></label>' +
    '</div>' +
    (c.notice !== 'none' && BUILDER_NOTICE_TEXT[c.notice]
      ? '<div class="chart-chord-builder-notice" role="status" data-notice="' + escapeHtml(c.notice) + '">' +
        escapeHtml(BUILDER_NOTICE_TEXT[c.notice]) + '</div>' : '') +
    '</section>';

  const direct = '<div class="chart-chord-edit-direct">' +
    '<label for="chart-chord-edit-name">コード名</label>' +
    '<div class="chart-chord-edit-input-row">' +
    '<input id="chart-chord-edit-name" class="mi" type="text" autocomplete="off" value="' +
    escapeHtml(c.inputValue) + '" aria-label="コード名">' +
    '<button type="button" class="sm-btn" data-action="no-chord">N.C.</button>' +
    '</div></div>';

  return (
    '<div class="chart-chord-edit-label">編集中のコード: <b class="chart-chord-edit-current">' +
    escapeHtml(current ? c.toDisplayChord(current.chord) : '') + '</b></div>' +
    '<div class="chart-chord-edit-modes" role="group" aria-label="入力方式">' + modeButtons + '</div>' +
    (c.mode === 'direct' ? direct : builder) +
    (c.hint ? '<div class="chart-chord-edit-hint" id="chart-chord-edit-hint" role="status">' + escapeHtml(c.hint) + '</div>' : '')
  );
}

// ── キーボード（数字コマンド・Space・Enter・ショートカット抑止）。spec v3 §3〜§5 ──
// window の capture フェーズで1回だけ登録する。ゲート（モーダルが開いている かつ 本文要素が #modal-ov 内にある）が
// 閉じているときは何もしない。判定は chordBuilderKeyboard.js の純粋関数、実行はモーダルごとの kb.handle。
let activeKeyboard = null;
let keyHandlerWindow = null;   // 登録済みの window（同じ window には1回だけ登録する）

export function isChordEditModalOpen() {
  const overlay = document.getElementById('modal-ov');
  const body = document.getElementById('chart-chord-edit-body');
  return !!(overlay && body && overlay.classList && overlay.classList.contains('open') && overlay.contains(body));
}

function installKeyHandler() {
  if (typeof window === 'undefined' || !window.addEventListener || keyHandlerWindow === window) return;
  keyHandlerWindow = window;
  window.addEventListener('keydown', event => { if (activeKeyboard) activeKeyboard.handle(event); }, true);
}

export function openChartChordEditModal({
  openModal, mkMBtn, initialState,
  // 入力方式（'builder' | 'direct'）の記憶。保存先は呼び出し元（app.js）が持つ。曲データ・Undoには関わらない
  loadInputMode = () => 'builder',
  saveInputMode = () => {},
  toDisplayChord = chord => chord,
  toCanonicalChord = chord => chord,
  onCommit,
}) {
  if (!initialState || !Array.isArray(initialState.buffer) || !initialState.buffer.length) return;

  const c = createChartChordEditController({
    initialState, toDisplayChord, toCanonicalChord,
    inputMode: (() => { try { return loadInputMode(); } catch { return 'builder'; } })(),
  });
  let closeCurrentModal = () => {};
  let dragCtl = null;   // タイトル領域のドラッグ移動（一時的な表示位置のみ）
  let bodyEl = null;
  // 数字入力中の桁。builder・baseline・draft とは独立（hasChanges に影響しない）
  const kb = { pending: '', field: null };

  const focusField = field => {
    const el = bodyEl && bodyEl.querySelector('select[data-builder="' + field + '"]');
    if (el && typeof el.focus === 'function') el.focus();
  };
  // いまの方式の主な入力欄へフォーカス（ビルダー: 指定欄または Root／直接入力: コード名欄）
  const focusPrimary = field => {
    if (c.mode === 'direct') {
      const input = bodyEl && bodyEl.querySelector('#chart-chord-edit-name');
      if (input && typeof input.focus === 'function') { input.focus(); if (input.select) input.select(); }
    } else {
      focusField(field || 'root');
    }
  };
  // IME変換確定（compositionend）の直後の Enter を確定に使わないための目印（旧 showChordSelector と同じ考え方）
  let justComposed = false;
  const showPending = () => {
    bodyEl.querySelectorAll('[data-pending-for]').forEach(el => {
      el.textContent = kb.pending && el.dataset.pendingFor === kb.field ? kb.pending + '_' : '';
    });
  };
  const discardPending = () => {
    if (!kb.pending) return;
    kb.pending = ''; kb.field = null;
    if (bodyEl) showPending();
  };
  const kindOf = target => {
    const tag = target && target.tagName;
    if (!tag) return 'other';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return 'text';
    if (tag === 'SELECT' && bodyEl && bodyEl.contains(target) && target.dataset && target.dataset.builder) {
      return target.dataset.builder;
    }
    const overlay = document.getElementById('modal-ov');
    if (tag === 'BUTTON' && overlay && overlay.contains(target)) return 'button';
    return 'other';
  };

  // ── 番号表TIP（モーダルの外側に出す浮動表示。曲データ・builder・baseline には触れない） ──
  const tip = { el: null, state: TIP_CLOSED, timer: null };
  const tipLabelOf = (field, value) => {
    if (field === 'root') return value === '' ? '未選択' : (BUILDER_ROOT_OPTIONS.find(o => o.value === value) || {}).label || value;
    return (BUILDER_TYPE_OPTIONS.find(o => o.id === value) || {}).label || value;
  };
  const clearTipTimer = () => { if (tip.timer) { clearTimeout(tip.timer); tip.timer = null; } };
  const tipHtml = () => tipSections(tip.state.section).map(field =>
    '<section class="chart-chord-number-tip-section" data-tip-section="' + field + '">' +
    '<div class="chart-chord-number-tip-title">' + (field === 'root' ? 'ルート音' : 'コードタイプ') + ' の番号</div><ul>' +
    buildNumberTipRows(field, tipLabelOf).map(r => '<li><b>' + r.number + '</b><span>' + escapeHtml(r.label) + '</span></li>').join('') +
    '</ul></section>').join('') +
    (tip.state.pinned ? '<div class="chart-chord-number-tip-foot">? キーまたは Esc で閉じる</div>' : '');
  const destroyTip = () => {
    clearTipTimer();
    tip.state = TIP_CLOSED;
    if (tip.el) { if (typeof tip.el.remove === 'function') tip.el.remove(); tip.el = null; }
  };
  const applyTip = anchorEl => {
    if (!tip.state.visible) { if (tip.el) tip.el.style.display = 'none'; return; }
    if (!document.body || typeof document.createElement !== 'function') return;
    if (!tip.el) {
      const el = document.createElement('div');
      el.id = 'chart-chord-number-tip';
      el.className = 'chart-chord-number-tip';
      el.setAttribute('role', 'tooltip');
      el.addEventListener('mouseenter', () => { if (!isChordEditModalOpen()) destroyTip(); else clearTipTimer(); });
      el.addEventListener('mouseleave', () => scheduleTipLeave());
      el.addEventListener('mousedown', e => e.preventDefault());   // クリックで select のフォーカス・入力中の桁を奪わない
      document.body.appendChild(el);
      tip.el = el;
    }
    const el = tip.el;
    el.innerHTML = tipHtml();
    el.style.visibility = 'hidden'; el.style.display = 'block'; el.style.left = '0px'; el.style.top = '0px';
    const box = document.getElementById('modal-box');
    const rect = element => (element && element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 });
    const size = rect(el);
    const pos = computeTipPosition({
      anchor: rect(anchorEl), modal: rect(box),
      tip: { width: size.right - size.left, height: size.bottom - size.top },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    el.style.left = pos.left + 'px'; el.style.top = pos.top + 'px'; el.style.visibility = 'visible';
  };
  const dispatchTip = (event, anchorEl) => { tip.state = reduceTip(tip.state, event); applyTip(anchorEl); };
  const scheduleTipLeave = () => {
    clearTipTimer();
    tip.timer = setTimeout(() => { tip.timer = null; dispatchTip({ type: 'leave-timeout' }, null); }, 250);
  };
  const tipTargetOf = target => (target && target.closest ? target.closest('[data-tip-for]') : null);

  // キャンセル終了（キャンセル／Escape／背景クリック／×）の共通経路。確認なしで閉じ、未確定の入力は破棄する
  // （単一コードの簡素な編集のため。作業用コピー draft は本体へ渡さないので、チャートには何も反映されない）
  const requestCancel = () => {
    closeCurrentModal();
    return true;
  };

  const rerender = () => {
    kb.pending = ''; kb.field = null;   // 再描画で入力中の桁は残さない
    if (bodyEl) bodyEl.innerHTML = renderChartChordEditBody(c);
  };

  // select/input変更時は再描画せず（フォーカスを保つため）、表示と有効/無効だけ更新する
  const syncControls = () => {
    if (!bodyEl) return;
    const set = (selector, fn) => { const el = bodyEl.querySelector(selector); if (el) fn(el); };
    set('.chart-chord-builder-preview', el => { el.textContent = c.builderName(); });
  };

  // 確定（Enter・「完了」・N.C.ボタン共通）。適用 → 完了処理 → 閉じる。
  // 適用できない／本体が確定を拒否したときは閉じず、理由（c.hint）を表示して入力へ戻る
  const submit = ({ noChord = false, fromField = null } = {}) => {
    const result = c.confirm({ noChord });
    if (!result.ok) { rerender(); focusPrimary(fromField); return false; }
    if (c.complete(onCommit)) { closeCurrentModal(); return true; }
    rerender(); focusPrimary(fromField);
    return false;
  };

  if (activeKeyboard && activeKeyboard.destroy) activeKeyboard.destroy();   // 前のモーダルのTIPを残さない
  activeKeyboard = {
    destroy: destroyTip,
    handle(event) {
      const gateOpen = isChordEditModalOpen();
      if (!gateOpen && tip.state.visible) destroyTip();   // モーダルが閉じていればTIPも残さない
      const decision = decideModalKey({
        key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey,
        metaKey: event.metaKey, shiftKey: event.shiftKey, isComposing: event.isComposing, justComposed,
        repeat: event.repeat, targetKind: kindOf(event.target), gateOpen,
        tipOpen: tip.state.visible,
      });
      if (decision.op && bodyEl) {
        const field = kindOf(event.target);
        if (decision.op === 'digit') {
          if (kb.field !== field) kb.pending = '';
          const r = reduceDigit(kb.pending, field, event.key);
          kb.pending = r.pending; kb.field = r.pending ? field : null;
          showPending();
          if (r.commit && c.setBuilder(field, r.commit.value)) {
            event.target.value = r.commit.value;   // select の change と同じ経路（setBuilder → syncControls）
            syncControls();
            const next = autoAdvanceField(field);   // 2桁が確定したら次の欄へ（Root→Type→Bass。Bass は最後）
            if (next) focusField(next);
          }
        } else if (decision.op === 'focus-next') {
          discardPending();
          focusField(nextBuilderField(field));
        } else if (decision.op === 'enter') {
          if (kb.pending) discardPending();           // 入力途中の桁は破棄するだけ（確定しない）
          else submit({ fromField: field });
        } else if (decision.op === 'tip-toggle') {
          const anchor = bodyEl.querySelector('.chart-chord-builder-fields');   // 直接入力方式では番号表は出さない
          if (anchor) dispatchTip({ type: 'toggle-key' }, anchor);
        } else if (decision.op === 'tip-close') {
          dispatchTip({ type: 'escape' }, null);
        }
      }
      // 数字入力の途中で Backspace: その桁を取り消す（select は元々 Backspace を受けない）
      if (!decision.op && bodyEl && event.key === 'Backspace' && kb.pending && BUILDER_FIELD_KINDS.includes(kindOf(event.target))) discardPending();
      if (decision.prevent) event.preventDefault();
      if (decision.stop) event.stopPropagation();
    },
  };
  installKeyHandler();

  openModal({
    title: 'コード編集',
    body: '<div id="chart-chord-edit-body" class="chart-chord-edit">' + renderChartChordEditBody(c) + '</div>',
    onRequestClose: requestCancel,
    onOpen: () => {
      bodyEl = document.getElementById('chart-chord-edit-body');
      if (!bodyEl) return;

      // ×ボタン（キャンセル終了）。タイトル要素の子にするので、次のopenModalで自動的に消える
      const titleEl = document.getElementById('m-title');
      if (titleEl) {
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'chart-chord-edit-close';
        closeButton.setAttribute('aria-label', '閉じる（変更は破棄されます）');
        closeButton.textContent = '×';
        closeButton.addEventListener('click', requestCancel);
        titleEl.appendChild(closeButton);
      }

      // タイトル領域のドラッグでモーダルを動かせる（背後のチャートを確認するため。位置は保存しない）
      const boxEl = document.getElementById('modal-box');
      if (titleEl && boxEl && boxEl.style && typeof titleEl.addEventListener === 'function') {
        dragCtl = attachModalDrag({ handle: titleEl, box: boxEl, enabled: isChordEditModalOpen, onStart: destroyTip });
      }

      bodyEl.addEventListener('change', event => {
        const field = event.target?.dataset?.builder;
        if (!field || !c.setBuilder(field, event.target.value)) return;
        syncControls();
      });

      bodyEl.addEventListener('focusout', discardPending);       // Tab・Shift+Tab・マウス・blur で破棄
      bodyEl.addEventListener('mousedown', discardPending);

      // 番号表TIP: ラベル文字へのホバー（離れても少し待つ＝TIPへ移動して参照できる）／クリック（タッチ用の固定表示）
      bodyEl.addEventListener('mouseover', event => {
        const target = tipTargetOf(event.target);
        if (!target) return;
        clearTipTimer();
        if (tip.state.visible && tip.state.section === target.dataset.tipFor) return;
        dispatchTip({ type: 'hover', section: target.dataset.tipFor }, target);
      });
      bodyEl.addEventListener('mouseout', event => {
        const target = tipTargetOf(event.target);
        if (target && !(event.relatedTarget && target.contains && target.contains(event.relatedTarget))) scheduleTipLeave();
      });
      bodyEl.addEventListener('click', event => {
        const target = tipTargetOf(event.target);
        if (target) { clearTipTimer(); dispatchTip({ type: 'click-section', section: target.dataset.tipFor }, target); }
      });

      bodyEl.addEventListener('input', event => {
        if (!event.target || event.target.id !== 'chart-chord-edit-name') return;
        c.setInput(event.target.value);
        syncControls();
      });

      bodyEl.addEventListener('compositionend', () => { justComposed = true; setTimeout(() => { justComposed = false; }, 0); });

      bodyEl.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) return;
        if (button.dataset.action === 'no-chord') { submit({ noChord: true }); return; }
        if (button.dataset.action === 'mode') {
          if (!c.setMode(button.dataset.mode)) return;
          try { saveInputMode(c.mode); } catch { /* 記憶できなくても編集は続けられる */ }
          destroyTip();
          rerender();
          focusPrimary();
        }
      });

      rerender();
      focusPrimary();   // 起動時: ビルダーは Root、直接入力はコード名欄
    },
    buttons: close => {
      closeCurrentModal = () => { destroyTip(); if (dragCtl) { dragCtl.destroy(); dragCtl = null; } close(); };   // どの終了経路でもTIP・ドラッグ処理を残さない
      return [
        mkMBtn('キャンセル', '', requestCancel),
        mkMBtn('完了', 'ok', () => { submit(); }),
      ];
    },
  });
}
