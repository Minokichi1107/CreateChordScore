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
 *  - 最小区間長の独自閾値は設けない。分割可否は既存 addChordCommand の範囲検証
 *    （start < splitTime < end）と同じ条件で判断する。
 *  - Rootの初期状態・コード名の分解（既存コードからの復元）・Used Chordsの出典と動作・
 *    内部保存値（B1）・Type内部ID（A2）は決定しない。
 */
import { addChordCommand, deleteChordCommand, updateChordCommand } from './analysisCommands.js';
import { pushHistory, refreshSelection } from './analysisSession.js';
import {
  BUILDER_ROOT_OPTIONS, BUILDER_TYPE_OPTIONS, BUILDER_BASS_OPTIONS,
  DEFAULT_BUILDER_TYPE_ID, buildChordName,
} from './chordBuilderCatalog.js';

// ビルダーの初期選択（既存PRの初期状態を変更しない。Rootの初期状態は未決）
const INITIAL_BUILDER = { root: 'C', type: DEFAULT_BUILDER_TYPE_ID, bass: '' };
const DISCARD_MESSAGE = '変更を破棄しますか？';

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

/** 分割できるか。既存 addChordCommand と同じ条件（中点が start と end の間にあること）。 */
function midpointOf(chord) {
  if (!chord || !Number.isFinite(chord.start) || !Number.isFinite(chord.end)) return null;
  const mid = (chord.start + chord.end) / 2;
  return mid > chord.start && mid < chord.end ? mid : null;
}

export function createChartChordEditController({
  initialState, usedChords = [],
  toDisplayChord = chord => chord,
  toCanonicalChord = chord => chord,
}) {
  const draft = structuredClone(initialState);
  const baseline = structuredClone(initialState);
  const c = {
    draft, usedChords, toDisplayChord, toCanonicalChord,
    builder: { ...INITIAL_BUILDER },
    inputValue: toDisplayChord(selectedChord(draft)?.chord || ''),
    hint: '',
  };

  c.current = () => selectedChord(draft);
  c.builderName = () => buildChordName(c.builder.root, c.builder.type, c.builder.bass);
  c.canSplit = () => midpointOf(c.current()) !== null;
  c.canDecide = () => !!c.current() && !!c.builderName();
  c.canReplace = () => !!c.current() && !!String(c.inputValue).trim();
  c.canAddFromInput = () => c.canSplit() && !!String(c.inputValue).trim();
  // 直接入力欄の文字列 → 保存用のコード名（N.C.は 'N'、それ以外は表示名→実音へ）
  const canonicalFromInput = () => {
    const text = String(c.inputValue).trim();
    if (!text) return '';
    return isNoChordText(text) ? 'N' : toCanonicalChord(text);
  };
  c.canDelete = () => !!c.current() && draft.buffer.length > 1;
  c.hasChanges = () => !samePayload(baseline, draft);

  c.select = id => {
    if (!draft.buffer.some(chord => chord._id === id)) return false;
    c.hint = '';
    refreshSelection(draft, [id], id);
    c.inputValue = toDisplayChord(selectedChord(draft)?.chord || '');
    return true;
  };

  c.setBuilder = (field, value) => {
    if (!(field in c.builder)) return false;
    c.builder[field] = value;
    return true;
  };

  c.setInput = value => { c.inputValue = value; };
  c.useChord = chord => { c.inputValue = toDisplayChord(chord || ''); };
  c.noChord = () => { c.inputValue = 'N.C.'; };

  // 「決定」: ビルダーで生成したコード名を選択中チップへ適用する（モーダルは閉じない）
  c.decide = () => {
    c.hint = '';
    const current = c.current();
    if (!current) { c.hint = '編集するコードを選択してください。'; return { ok: false }; }
    const name = c.builderName();
    if (!name) { c.hint = 'ルート音を選択してください。'; return { ok: false }; }
    const result = updateChordCommand(draft, current._id, { chord: toCanonicalChord(name) });
    if (!result.ok) c.hint = 'コードを更新できませんでした。';
    return result;
  };

  // 「置換」（直接入力・補助）: 入力欄の文字列を選択中チップへ適用する
  c.replaceWithInput = () => {
    c.hint = '';
    const current = c.current();
    if (!current) { c.hint = '編集するコードを選択してください。'; return { ok: false }; }
    const canonical = canonicalFromInput();
    if (!canonical) { c.hint = 'コード名を入力してください。'; return { ok: false }; }
    const result = updateChordCommand(draft, current._id, { chord: canonical });
    if (!result.ok) { c.hint = 'コードを更新できませんでした。'; return result; }
    c.inputValue = toDisplayChord(canonical);
    return result;
  };

  // 選択中の時間区間を中点で分割して新しいチップを追加する（既存Commandの範囲検証に任せる）
  const addAtMidpoint = canonicalName => {
    const current = c.current();
    if (!current) { c.hint = '編集するコードを選択してください。'; return { ok: false }; }
    if (!canonicalName) { c.hint = 'コード名を入力してください。'; return { ok: false }; }
    const splitTime = (current.start + current.end) / 2;
    const result = addChordCommand(draft, current._id, splitTime, canonicalName);
    if (!result.ok) {
      c.hint = result.reason === 'invalid-range'
        ? 'この時間区間は短すぎるため分割できません。' : 'コードを追加できませんでした。';
    }
    return result;
  };

  c.addFromBuilder = () => {
    c.hint = '';
    const name = c.builderName();
    if (!name) { c.hint = 'ルート音を選択してください。'; return { ok: false }; }
    return addAtMidpoint(toCanonicalChord(name));
  };

  c.addFromInput = () => {
    c.hint = '';
    const canonical = canonicalFromInput();
    const result = addAtMidpoint(canonical);
    if (result.ok) c.inputValue = toDisplayChord(canonical);
    return result;
  };

  c.remove = () => {
    c.hint = '';
    const current = c.current();
    if (!current) return { ok: false };
    const result = deleteChordCommand(draft, current._id);
    if (!result.ok) { c.hint = result.reason || 'コードを削除できませんでした。'; return result; }
    c.inputValue = toDisplayChord(selectedChord(draft)?.chord || '');
    return result;
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

  return c;
}

function optionsHtml(options, selectedValue, valueKey) {
  return options.map(option => '<option value="' + escapeHtml(option[valueKey]) + '"' +
    (option[valueKey] === selectedValue ? ' selected' : '') + '>' + escapeHtml(option.label) + '</option>').join('');
}

export function renderChartChordEditBody(c) {
  const current = c.current();
  const chips = c.draft.buffer.map(chord => {
    const isSelected = !!current && chord._id === current._id;
    return '<button type="button" class="chart-chord-edit-chip' + (isSelected ? ' is-selected' : '') +
      '" data-action="select" data-id="' + escapeHtml(chord._id) + '" aria-pressed="' +
      (isSelected ? 'true' : 'false') + '">' + escapeHtml(c.toDisplayChord(chord.chord)) + '</button>';
  }).join('');

  const used = Array.from(new Set(c.usedChords.concat(c.draft.buffer.map(chord => chord.chord))))
    .filter(Boolean)
    .map(chord => '<button type="button" class="chart-chord-edit-used" data-action="use" data-chord="' +
      escapeHtml(chord) + '">' + escapeHtml(c.toDisplayChord(chord)) + '</button>').join('');

  const dis = ok => (ok ? '' : ' disabled');
  const defaultHint = !current ? '編集するコードを選択してください。'
    : (c.canSplit() ? '＋追加は選択中の時間区間を中央で分割します。' : 'この時間区間はこれ以上分割できません。');

  return (
    '<div class="chart-chord-edit-label">編集中のコード列（クリックして選択）</div>' +
    '<div class="chart-chord-edit-sequence">' + chips + '</div>' +

    '<section class="chart-chord-builder" aria-label="コードビルダー">' +
    '<div class="chart-chord-edit-label">コードビルダー</div>' +
    '<div class="chart-chord-builder-actions">' +
    '<output class="chart-chord-builder-preview" aria-label="生成されるコード名">' +
    escapeHtml(c.builderName()) + '</output>' +
    '<button type="button" class="sm-btn" data-action="builder-decide"' + dis(c.canDecide()) + '>決定</button>' +
    '<button type="button" class="sm-btn" data-action="builder-add"' + dis(c.canSplit() && !!c.builderName()) + '>＋追加</button>' +
    '</div>' +
    '<div class="chart-chord-builder-fields">' +
    '<label>ルート音<select data-builder="root" aria-label="ルート音">' +
    optionsHtml(BUILDER_ROOT_OPTIONS, c.builder.root, 'value') + '</select></label>' +
    '<label>コードタイプ<select data-builder="type" aria-label="コードタイプ">' +
    optionsHtml(BUILDER_TYPE_OPTIONS, c.builder.type, 'id') + '</select></label>' +
    '<label>ベース音/オンコード<select data-builder="bass" aria-label="ベース音">' +
    optionsHtml(BUILDER_BASS_OPTIONS, c.builder.bass, 'value') + '</select></label>' +
    '</div></section>' +

    '<div class="chart-chord-edit-direct">' +
    '<label for="chart-chord-edit-name">コード名を直接入力（補助）</label>' +
    '<div class="chart-chord-edit-input-row">' +
    '<input id="chart-chord-edit-name" class="mi" type="text" autocomplete="off" value="' +
    escapeHtml(c.inputValue) + '" aria-label="コード名">' +
    '<button type="button" class="sm-btn" data-action="no-chord">N.C.</button>' +
    '<button type="button" class="sm-btn" data-action="replace"' + dis(c.canReplace()) + '>置換</button>' +
    '<button type="button" class="sm-btn" data-action="add"' + dis(c.canAddFromInput()) + '>＋追加</button>' +
    '</div></div>' +

    '<div class="chart-chord-edit-hint" id="chart-chord-edit-hint">' + escapeHtml(c.hint || defaultHint) + '</div>' +
    '<div class="chart-chord-edit-label">曲内で使用中のコード（クイック選択）</div>' +
    '<div class="chart-chord-edit-used-list">' +
    (used || '<span class="chart-chord-edit-hint">使用中のコードはありません。</span>') + '</div>'
  );
}

export function openChartChordEditModal({
  openModal, mkMBtn, initialState, usedChords = [],
  toDisplayChord = chord => chord,
  toCanonicalChord = chord => chord,
  onCommit,
  // 変更があるときの破棄確認（ブラウザ標準confirm()。承認済み仕様）。確認できない場合は編集を守るため false
  confirmDiscard = () => (typeof globalThis.confirm === 'function' ? globalThis.confirm(DISCARD_MESSAGE) : false),
}) {
  if (!initialState || !Array.isArray(initialState.buffer) || !initialState.buffer.length) return;

  const c = createChartChordEditController({ initialState, usedChords, toDisplayChord, toCanonicalChord });
  let closeCurrentModal = () => {};
  let deleteButton = null;
  let bodyEl = null;

  // キャンセル終了（キャンセル／Escape／背景クリック／×）の共通経路
  const requestCancel = () => {
    if (c.hasChanges() && !confirmDiscard()) return false; // 確認でキャンセル→モーダルと編集内容を維持
    closeCurrentModal();
    return true;
  };

  const rerender = () => {
    if (bodyEl) bodyEl.innerHTML = renderChartChordEditBody(c);
    if (deleteButton) deleteButton.disabled = !c.canDelete();
  };

  // select/input変更時は再描画せず（フォーカスを保つため）、表示と有効/無効だけ更新する
  const syncControls = () => {
    if (!bodyEl) return;
    const set = (selector, fn) => { const el = bodyEl.querySelector(selector); if (el) fn(el); };
    set('.chart-chord-builder-preview', el => { el.textContent = c.builderName(); });
    set('[data-action="builder-decide"]', el => { el.disabled = !c.canDecide(); });
    set('[data-action="builder-add"]', el => { el.disabled = !(c.canSplit() && !!c.builderName()); });
    set('[data-action="replace"]', el => { el.disabled = !c.canReplace(); });
    set('[data-action="add"]', el => { el.disabled = !c.canAddFromInput(); });
  };

  openModal({
    title: 'コード編集（Chart Mode 試作）',
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

      bodyEl.addEventListener('change', event => {
        const field = event.target?.dataset?.builder;
        if (!field || !c.setBuilder(field, event.target.value)) return;
        syncControls();
      });

      bodyEl.addEventListener('input', event => {
        if (!event.target || event.target.id !== 'chart-chord-edit-name') return;
        c.setInput(event.target.value);
        syncControls();
      });

      bodyEl.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.action;

        if (action === 'use' || action === 'no-chord') {
          if (action === 'use') c.useChord(button.dataset.chord); else c.noChord();
          const input = document.getElementById('chart-chord-edit-name');
          if (input) { input.value = c.inputValue; input.focus(); }
          syncControls();
          return;
        }
        if (action === 'select') c.select(button.dataset.id);
        else if (action === 'builder-decide') c.decide();
        else if (action === 'builder-add') c.addFromBuilder();
        else if (action === 'replace') c.replaceWithInput();
        else if (action === 'add') c.addFromInput();
        else return;
        rerender();
      });

      rerender();
    },
    buttons: close => {
      closeCurrentModal = close;
      deleteButton = mkMBtn('削除', 'del chart-chord-edit-delete', () => { c.remove(); rerender(); });
      deleteButton.disabled = !c.canDelete();
      return [
        deleteButton,
        mkMBtn('キャンセル', '', requestCancel),
        mkMBtn('完了', 'ok', () => {
          if (c.complete(onCommit)) closeCurrentModal();
          else rerender();
        }),
      ];
    },
  });
}
