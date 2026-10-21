/**
 * Phase148: Chart Mode code-edit modal prototype.
 * The modal edits a private clone of the active Analysis Editor session.
 * The authoritative session is mutated only when the user chooses 完了.
 */
import { addChordCommand, deleteChordCommand, updateChordCommand } from './analysisCommands.js';
import { refreshSelection } from './analysisSession.js';

const MIN_EDIT_INTERVAL_SECONDS = 0.05;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function payload(state) {
  return { buffer: state.buffer, sections: state.sections, hasContentEdit: state.hasContentEdit };
}

function samePayload(a, b) {
  return JSON.stringify(payload(a)) === JSON.stringify(payload(b));
}

function selectedChord(state) {
  const id = state.selection && state.selection.chordIds && state.selection.chordIds[0];
  return state.buffer.find(chord => chord._id === id) || null;
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
  let inputValue = selectedChord(draft)?.chord || '';

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

    return 
      '<div class="chart-chord-edit-label">編集中のコード列</div>' +
      '<div class="chart-chord-edit-sequence">' + chips + '</div>' +
      '<div class="chart-chord-edit-label">コード名</div>' +
      '<div class="chart-chord-edit-input-row">' +
      '<input id="chart-chord-edit-name" class="mi" type="text" autocomplete="off" value="' +
      escapeHtml(toDisplayChord(inputValue)) + '" aria-label="コード名">' +
      '<button type="button" class="sm-btn" data-action="no-chord">N.C.</button></div>' +
      '<div class="chart-chord-edit-actions">' +
      '<button type="button" class="sm-btn" data-action="replace"' + (current ? '' : ' disabled') + '>決定</button>' +
      '<button type="button" class="sm-btn" data-action="add"' + (canAdd ? '' : ' disabled') + '>＋追加</button>' +
      '<button type="button" class="sm-btn" data-action="delete"' +
      (current && draft.buffer.length > 1 ? '' : ' disabled') + '>削除</button></div>' +
      '<div class="chart-chord-edit-hint" id="chart-chord-edit-hint">' +
      (current ? (canAdd ? '＋追加は選択中の時間区間を中央で分割します。' :
        '追加には左右それぞれ0.05秒以上の時間が必要です。') : '編集するコードを選択してください。') +
      '</div><div class="chart-chord-edit-label">楽曲のコードから選択</div>' +
      '<div class="chart-chord-edit-used-list">' +
      (used || '<span class="chart-chord-edit-hint">使用中のコードはありません。</span>') + '</div>';
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

      body.addEventListener('input', event => {
        if (!event.target || event.target.id !== 'chart-chord-edit-name') return;
        inputValue = event.target.value;
        const current = selectedChord(draft);
        const addButton = body.querySelector('[data-action="add"]');
        const canAdd = !!current && (current.end - current.start) / 2 >= MIN_EDIT_INTERVAL_SECONDS
          && !!String(inputValue).trim();
        if (addButton) addButton.disabled = !canAdd;
      });

      body.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.action;

        if (action === 'use') {
          inputValue = button.dataset.chord || '';
          const input = document.getElementById('chart-chord-edit-name');
          if (input) { input.value = toDisplayChord(inputValue); input.focus(); }
          return;
        }
        if (action === 'no-chord') {
          inputValue = 'N.C.';
          const input = document.getElementById('chart-chord-edit-name');
          if (input) { input.value = inputValue; input.focus(); }
          return;
        }
        if (action === 'select') {
          const id = button.dataset.id;
          if (!draft.buffer.some(chord => chord._id === id)) return;
          refreshSelection(draft, [id], id);
          inputValue = selectedChord(draft)?.chord || '';
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
          inputValue = canonical;
          body.innerHTML = renderBody();
          return;
        }

        if (action === 'add') {
          if (!canonical) { setHint('追加するコード名を入力してください。'); return; }
          const splitTime = (current.start + current.end) / 2;
          const result = addChordCommand(draft, current._id, splitTime, canonical);
          if (!result.ok) {
            setHint(result.reason === 'invalid-range'
              ? 'この時間区間は短すぎるため分割できません。' : 'コードを追加できませんでした。');
            return;
          }
          inputValue = canonical;
          body.innerHTML = renderBody().replace('<div id="chart-chord-edit-body" class="chart-chord-edit">', '');
          return;
        }

        if (action === 'delete') {
          const result = deleteChordCommand(draft, current._id);
          if (!result.ok) { setHint(result.reason || 'コードを削除できませんでした。'); return; }
          inputValue = selectedChord(draft)?.chord || '';
          body.innerHTML = renderBody().replace('<div id="chart-chord-edit-body" class="chart-chord-edit">', '');
        }
      });

      const input = document.getElementById('chart-chord-edit-name');
      if (input) input.value = toDisplayChord(inputValue);
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
