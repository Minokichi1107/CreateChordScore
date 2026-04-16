// ════════════════════════════════════════
// EDITOR - 譜面エディタUI管理
// ════════════════════════════════════════

// ────────────────────────────────────────
// 内部状態
// ────────────────────────────────────────
let _lastActiveIdx = -1;

// ────────────────────────────────────────
// 行データ生成
// ────────────────────────────────────────
export function mkLine(lyric = '', time = null, chords = [], repeat = null) {
  return {
    lyric,
    time,
    chords: chords.map(c => typeof c === 'string' ? { chord: c, offset: 0 } : { ...c }),
    repeat: repeat || null
  };
}

// ────────────────────────────────────────
// コード追加
// ────────────────────────────────────────
export function addChordToLine(chord, lines, focLine, callbacks) {
  let updatedFocLine = focLine;
  
  if (focLine < 0 || focLine >= lines.length) {
    if (!lines.length) {
      lines.push(mkLine());
      if (callbacks.onLinesChange) {
        callbacks.onLinesChange();
      }
    }
    updatedFocLine = lines.length - 1;
  }
  
  lines[updatedFocLine].chords.push({ chord, offset: 0 });
  
  return {
    focLine: updatedFocLine,
    needsRender: true
  };
}

// ────────────────────────────────────────
// 行ハイライト
// ────────────────────────────────────────
export function highlightLine(time, lines) {
  const rows = document.querySelectorAll('.line-row');
  let ai = -1;
  
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].time != null && lines[i].time <= time) {
      ai = i;
      break;
    }
  }
  
  rows.forEach((r, i) => r.classList.toggle('active-line', i === ai));
  
  // 行が変わったときだけスクロール
  if (ai >= 0 && ai !== _lastActiveIdx && rows[ai]) {
    scrollEditorToRow(rows[ai]);
  }
  
  _lastActiveIdx = ai;
}

// ────────────────────────────────────────
// スクロール制御
// ────────────────────────────────────────
export function scrollEditorToRow(rowEl, force = false) {
  const area = document.getElementById('editor-area');
  if (!area) return;
  
  const areaRect = area.getBoundingClientRect();
  const rowRect = rowEl.getBoundingClientRect();
  const relTop = rowRect.top - areaRect.top;
  const areaH = areaRect.height;
  const rowH = rowRect.height;
  
  // 表示範囲内（上15%〜下80%）かつforceでなければスキップ
  if (!force && relTop >= areaH * 0.15 && relTop + rowH <= areaH * 0.8) return;
  
  const target = area.scrollTop + relTop - areaH * 0.35;
  area.scrollTop = Math.max(0, target); // instantスクロール（smoothは毎フレーム干渉する）
}

// ────────────────────────────────────────
// 譜面全体描画
// ────────────────────────────────────────
export function renderLines(lines, uiState, callbacks) {
  const { focLine, tapIdx, diagOn, capo, fmt } = uiState;
  const {
    onTimeClick,
    onTimeContextMenu,
    onChordEdit,
    onAddChord,
    onRepeatClick,
    onRepeatDelete,
    onChordDelete,
    onSepClick,
    onSepInsert,
    onLineInsert,
    onLineDelete,
    onLyricFocus,
    onLyricInput,
    onLyricEnter,
    onLyricBackspace,
    onTapSet,
    onCopyClick,
    setDiagRight,
    showPopup,
    hidePopup,
    updateStatus,
    toast
  } = callbacks;

  const cont = document.getElementById('lines-cont');
  cont.innerHTML = '';

  lines.forEach((line, idx) => {
    const row = document.createElement('div');
    row.className = 'line-row';
    row.dataset.idx = idx;

    // 行番号
    const num = document.createElement('div');
    num.className = 'line-num';
    num.textContent = idx + 1;

    // 時刻ボタン
    const tb = document.createElement('button');
    tb.className = 'line-time' + (line.time != null ? ' has-t' : '');
    tb.textContent = line.time != null ? fmt(line.time, true) : '--:--.--';
    tb.title = line.time != null ? 'クリック: その時間に移動  右クリック: 時刻を編集' : 'クリック: 時刻を設定';
    tb.addEventListener('click', (e) => {
      e.stopPropagation();
      onTimeClick(idx, line.time);
    });
    tb.addEventListener('contextmenu', e => {
      e.preventDefault();
      onTimeContextMenu(idx);
    });

    // コンテンツエリア
    const cont2 = document.createElement('div');
    cont2.className = 'line-content';

    // ── コードタグ行（折り返し対応）──
    const tags = document.createElement('div');
    tags.className = 'chord-tags';

    // リピートバッジ
    if (line.repeat) {
      const badge = document.createElement('span');
      badge.className = 'repeat-badge';
      badge.innerHTML = `<span>× ${line.repeat.count}</span><span style="font-size:10px;opacity:.7">回</span><span class="rb-del" title="削除">✕</span>`;
      badge.querySelector('.rb-del').addEventListener('click', e => {
        e.stopPropagation();
        onRepeatDelete(idx);
      });
      badge.addEventListener('click', e => {
        if (e.target.classList.contains('rb-del')) return;
        onRepeatClick(idx);
      });
      tags.appendChild(badge);
    }

    // コードタグ（削除ボタン大きく）＋セパレーター「/」対応
    line.chords.forEach((c, ci) => {
      // セパレーターアイテム
      if (c.type === 'sep') {
        const sep = document.createElement('span');
        sep.className = 'chord-sep';
        sep.textContent = '/';
        sep.title = 'クリックで削除';
        sep.addEventListener('click', e => {
          e.stopPropagation();
          onSepClick(idx, ci);
        });
        tags.appendChild(sep);
        return;
      }

      // コードタグ本体
      const tagWrap = document.createElement('span');
      tagWrap.className = 'chord-tag-wrap';
      const tag = document.createElement('span');
      tag.className = 'chord-tag';
      const ns = document.createElement('span');
      ns.className = 'chord-name';
      ns.textContent = c.chord;
      tag.appendChild(ns);
      tag.addEventListener('click', e => {
        if (e.target.classList.contains('del-x')) return;
        onChordEdit(idx, ci);
      });
      tag.addEventListener('mouseenter', () => {
        setDiagRight(c.chord, capo);
        showPopup(c.chord, tag);
      });
      tag.addEventListener('mouseleave', hidePopup);
      const dx = document.createElement('span');
      dx.className = 'del-x';
      dx.textContent = '✕';
      dx.title = '削除';
      dx.addEventListener('click', e => {
        e.stopPropagation();
        onChordDelete(idx, ci);
      });
      tag.appendChild(dx);
      tagWrap.appendChild(tag);

      // タグの右に「/挿入」ミニボタン（ホバーで表示）
      const insertSep = document.createElement('button');
      insertSep.className = 'insert-sep-btn';
      insertSep.textContent = '/';
      insertSep.title = `${c.chord}の後に小節線を挿入`;
      insertSep.addEventListener('click', e => {
        e.stopPropagation();
        onSepInsert(idx, ci);
      });
      tagWrap.appendChild(insertSep);
      tags.appendChild(tagWrap);
    });

    // +コード / +/ ボタン
    const acb = document.createElement('button');
    acb.className = 'add-chord-btn';
    acb.textContent = '+コード';
    acb.addEventListener('click', () => onAddChord(idx));
    const asb = document.createElement('button');
    asb.className = 'add-sep-btn';
    asb.textContent = '+/';
    asb.title = '小節区切り「/」を追加';
    asb.addEventListener('click', () => onSepInsert(idx, line.chords.length - 1));
    tags.appendChild(acb);
    tags.appendChild(asb);
    cont2.appendChild(tags);

    // 歌詞入力
    const li = document.createElement('input');
    li.type = 'text';
    li.className = 'lyric-input';
    li.value = line.lyric;
    li.placeholder = '歌詞を入力...';
    li.addEventListener('focus', () => onLyricFocus(idx));
    li.addEventListener('input', e => onLyricInput(idx, e.target.value));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onLyricEnter(idx);
      }
      if (e.key === 'Backspace' && !e.target.value && lines.length > 1) {
        e.preventDefault();
        onLyricBackspace(idx);
      }
    });
    cont2.appendChild(li);
    row.appendChild(num);
    row.appendChild(tb);
    row.appendChild(cont2);

    // ── ホバーアクション ──
    const acts = document.createElement('div');
    acts.className = 'line-acts';
    const mk = (t, cl, title, fn) => {
      const b = document.createElement('button');
      b.className = `la ${cl}`;
      b.textContent = t;
      if (title) b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    acts.appendChild(mk('⏱', '', '次TAPでこの行に時刻セット', () => onTapSet(idx)));
    acts.appendChild(mk('🔁 リピート', 'am', 'リピート記号を追加/編集', () => onRepeatClick(idx)));
    acts.appendChild(mk('📋 コピー', 'gn', 'コードを別の行にコピー', () => onCopyClick(idx)));
    acts.appendChild(mk('↑挿入', '', '上に空行を挿入', () => onLineInsert(idx)));
    acts.appendChild(mk('削除', 'del', '', () => onLineDelete(idx)));
    row.appendChild(acts);
    cont.appendChild(row);
  });

  if (updateStatus) {
    updateStatus();
  }
}
