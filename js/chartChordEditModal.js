/**
 * Phase148: Chart Mode code-edit modal prototype.
 * The modal edits a private clone of the active Analysis Editor session.
 * The authoritative session is mutated only when the user chooses 完了.
 */
import { addChordCommand, deleteChordCommand, updateChordCommand } from './analysisCommands.js';
import { pushHistory, refreshSelection } from './analysisSession.js';

const MIN_EDIT_INTERVAL_SECONDS = 0.05;

// Prototype-only common chord vocabulary. The final Type list remains a design decision.
const BUILDER_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const BUILDER_TYPES = [
  { value: '', label: 'Major (なし)' }, { value: 'm', label: 'm' },
  { value: '7', label: '7' }, { value: 'maj7', label: 'maj7' },
  { value: 'm7', label: 'm7' }, { value: '6', label: '6' },
  { value: 'm6', label: 'm6' }, { value: 'sus2', label: 'sus2' },
  { value: 'sus4', label: 'sus4' }, { value: 'dim', label: 'dim' },
  { value: 'aug', label: 'aug' }, { value: 'dim7', label: 'dim7' },
  { value: 'm7b5', label: 'm7♭5' }, { value: 'add9', label: 'add9' },
  { value: '9', label: '9' }, { value: 'm9', label: 'm9' },
  { value: 'maj9', label: 'maj9' }, { value: '7sus4', label: '7sus4' },
];

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

export function openChartChordEditModal({
  openModal, mkMBtn, initialState, usedChords = [],
  toDisplayChord = chord => chord,
  toCanonicalChord = chord => chord,
  onCommit,
}) {
  if (!initialState || !Array.isArray(initialState.buffer) || !initialState.buffer.length) return;

  const draft = structuredClone(initialState);
  const baseline = structuredClone(initialState);
  let closeCurrentModal = () => {};
  let inputValue = toDisplayChord(selectedChord(draft)?.chord || '');
  let builderRoot = 'C';
  let builderType = '';
  let builderBass = '';

  const renderBody = () => {
    const current = selectedChord(draft);
    const chips = draft.buffer.map(chord => {
      const isSelected = chord._id === (current && current._id);
      return '<button type="button" class="chart-chord-edit-chip' + (isSelected ? ' is-selected' : '') +
        '" data-action="select" data-id="' + escapeHtml(chord._id) + '" aria-pressed="' +
        (isSelected ? 'true' : 'false') + '">' + escapeHtml(toDisplayChord(chord.chord)) + '</button>';
    }).join('');

    const used = Array.from(new Set(usedChords.concat(draft.buffer.map(chord => chord.chord))))
      .filter(Boolean)
      .map(chord => '<button type="button" class="chart-chord-edit-used" data-action="use" data-chord="' +
        escapeHtml(chord) + '">' + escapeHtml(toDisplayChord(chord)) + '</button>').join('');

    const canAdd = !!current && Number.isFinite(current.start) && Number.isFinite(current.end)
      && (current.end - current.start) / 2 >= MIN_EDIT_INTERVAL_SECONDS && !!String(inputValue).trim();

    return (
      '<div class="chart-chord-edit-label">編集中のコード列</div>' +
      '<div class="chart-chord-edit-sequence">' + chips + '</div>' +
      '<div class="chart-chord-edit-label">コードシーケンス（クリックして選択）</div>' +
      '<div class="chart-chord-edit-direct">' +
      '<label for="chart-chord-edit-name">コード名を直接入力</label>' +
      '<div class="chart-chord-edit-input-row">' +
      '<input id="chart-chord-edit-name" class="mi" type="text" autocomplete="off" value="' +
      escapeHtml(inputValue) + '" aria-label="コード名">' +
      '<button type="button" class="sm-btn" data-action="no-chord">N.C.</button>' +
      '<button type="button" class="sm-btn" data-action="replace"' + (current ? '' : ' disabled') + '>置換</button></div></div>' +
      '<section class="chart-chord-builder" aria-label="コードビルダー">' +
      '<div class="chart-chord-edit-label">コードビルダー</div>' +
      '<div class="chart-chord-builder-fields">' +
      '<label>ルート音<select data-builder="root" aria-label="ルート音">' + rootOptions + '</select></label>' +
      '<label>タイプ<select data-builder="type" aria-label="タイプ">' + typeOptions + '</select></label>' +
      '<label>ベース音<select data-builder="bass" aria-label="ベース音">' + bassOptions + '</select></label>' +
      '</div><div class="chart-chord-builder-actions">' +
      '<span class="chart-chord-builder-preview">' + escapeHtml(toDisplayChord(builderChord)) + '</span>' +
      '<button type="button" class="sm-btn" data-action="builder-add"' + (canSplit ? '' : ' disabled') + '>＋追加</button>' +
      '</div><p class="chart-chord-edit-hint">追加は選択中のコード区間を中央で分割します（左右各0.05秒以上）。</p>' +
      '</section>' +
      '<div class="chart-chord-edit-actions">' +
      '<button type="button" class="sm-btn" data-action="add"' + (canAdd ? '' : ' disabled') + '>入力欄のコードを＋追加</button>' +
      '<button type="button" class="sm-btn" data-action="delete"' +
      (current && draft.buffer.length > 1 ? '' : ' disabled') + '>削除</button></div>' +
      '<div class="chart-chord-edit-hint" id="chart-chord-edit-hint">' +
      (current ? (canAdd ? '追加は選択中の時間区間を中央で分割します。' :
        '追加には左右それぞれ0.05秒以上の時間が必要です。') : '編集するコードを選択してください。') +
      '</div><div class="chart-chord-edit-label">曲内で使用中のコード（クイック選択）</div>' +
      '<div class="chart-chord-edit-used-list">' +
      (used || '<span class="chart-chord-edit-hint">使用中のコードはありません。</span>') + '</div>');
  };

  const setHint = message => {
    const hint = document.getElementById('chart-chord-edit-hint');
    if (hint) hint.textContent = message;
  };

  openModal({
    title: 'コード編集（Chart Mode 試作）',
    body: '<div id="chart-chord-edit-body" class="chart-chord-edit">' + renderBody() + '</div>',
    onOpen: () => {
      const body = document.getElementById('chart-chord-edit-body');
      if (!body) return;

      const syncAddButton = () => {
        const current = selectedChord(draft);
        const addButton = body.querySelector('[data-action="add"]');
        const builderButton = body.querySelector('[data-action="builder-add"]');
        const canSplit = !!current && Number.isFinite(current.start) && Number.isFinite(current.end)
          && (current.end - current.start) / 2 >= MIN_EDIT_INTERVAL_SECONDS;
        if (addButton) addButton.disabled = !(canSplit && !!String(inputValue).trim());
        if (builderButton) builderButton.disabled = !canSplit;
      };

      const addChordAtMidpoint = chordName => {
        const current = selectedChord(draft);
        if (!current || !chordName) { setHint('コード名を入力してください。'); return; }
        const splitTime = (current.start + current.end) / 2;
        const result = addChordCommand(draft, current._id, splitTime, toCanonicalChord(chordName));
        if (!result.ok) {
          setHint(result.reason === 'invalid-range'
            ? 'この時間区間は短すぎるため分割できません。' : 'コードを追加できませんでした。');
          return;
        }
        inputValue = toDisplayChord(toCanonicalChord(chordName));
        body.innerHTML = renderBody();
      };

      body.addEventListener('change', event => {
        const field = event.target?.dataset?.builder;
        if (field === 'root') builderRoot = event.target.value;
        else if (field === 'type') builderType = event.target.value;
        else if (field === 'bass') builderBass = event.target.value;
        else return;
        const preview = body.querySelector('.chart-chord-builder-preview');
        if (preview) preview.textContent = toDisplayChord(builderRoot + builderType + (builderBass ? '/' + builderBass : ''));
      });

      body.addEventListener('input', event => {
        if (!event.target || event.target.id !== 'chart-chord-edit-name') return;
        inputValue = event.target.value;
        syncAddButton();
      });

      body.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.action;

        if (action === 'use') {
          inputValue = toDisplayChord(button.dataset.chord || '');
          const input = document.getElementById('chart-chord-edit-name');
          if (input) { input.value = inputValue; input.focus(); }
          syncAddButton();
          return;
        }
        if (action === 'builder-add') {
          addChordAtMidpoint(builderRoot + builderType + (builderBass ? '/' + builderBass : ''));
          return;
        }
        if (action === 'no-chord') {
          inputValue = 'N.C.';
          const input = document.getElementById('chart-chord-edit-name');
          if (input) { input.value = inputValue; input.focus(); }
          syncAddButton();
          return;
        }
        if (action === 'select') {
          const id = button.dataset.id;
          if (!draft.buffer.some(chord => chord._id === id)) return;
          refreshSelection(draft, [id], id);
          inputValue = toDisplayChord(selectedChord(draft)?.chord || '');
          body.innerHTML = renderBody();
          return;
        }

        const current = selectedChord(draft);
        if (!current) return;
        const canonical = toCanonicalChord(String(inputValue).trim());

        if (action === 'replace') {
          if (!canonical) { setHint('コード名を入力してください。'); return; }
          const result = updateChordCommand(draft, current._id, { chord: canonical });
          if (!result.ok) { setHint('コードを更新できませんでした。'); return; }
          inputValue = toDisplayChord(canonical);
          body.innerHTML = renderBody();
          return;
        }

        if (action === 'add') {
          if (!canonical) { setHint('追加するコード名を入力してください。'); return; }
          addChordAtMidpoint(canonical);
          return;
        }

        if (action === 'delete') {
          const result = deleteChordCommand(draft, current._id);
          if (!result.ok) { setHint(result.reason || 'コードを削除できませんでした。'); return; }
          inputValue = toDisplayChord(selectedChord(draft)?.chord || '');
          body.innerHTML = renderBody();
        }
      });

      const input = document.getElementById('chart-chord-edit-name');
      if (input) input.value = inputValue;
    },
    buttons: close => {
      closeCurrentModal = close;
      return [
        mkMBtn('キャンセル', '', close),
        mkMBtn('完了', 'ok', () => {
          const changed = !samePayload(baseline, draft);
          if (changed) {
            const invalid = draft.buffer.some(chord =>
              !chord.chord || !String(chord.chord).trim()
              || !Number.isFinite(chord.start) || !Number.isFinite(chord.end)
              || chord.start >= chord.end);
            if (invalid) { setHint('コードデータに不整合があるため確定できません。'); return; }
          }
          const committed = onCommit && onCommit(draft, changed);
          if (committed === false) return;
          closeCurrentModal();
        }),
      ];
    },
  });
}
