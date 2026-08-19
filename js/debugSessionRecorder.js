// ════════════════════════════════════════
// DEBUG SESSION RECORDER（Phase121）
// ════════════════════════════════════════
//
// [DEBUG SESSION RECORDER AUTHORITY]
// Debug Session Recorder は、デバッグセッション中のSemantic Event履歴を
// 一時的に所有する。これは既存の Debug Layer / window.__CS_DEBUG__ とは
// 別Authorityである（[DEBUG LAYER INVARIANT]・architecture.md §5.5参照）。
//
// Debug Layer（__CS_DEBUG__）が「runtime stateを一切所有せず、getter
// projectionとして観測するだけ」であるのに対し、Recorderは
// 「Semantic Eventの履歴」という新しいデータをメモリ上に所有する。
// この違いにより、RecorderはDebug Layerの一部としてではなく、
// 独立モジュールとして実装する。
//
// Recorderはruntime stateそのものを所有せず、各Authorityから通知された
// Semantic Eventと、その前後で取得した観測可能なstate snapshotのみを
// 保持する。Recording dataはMVPではメモリ上のみ保持し、persistence
// layerには一切保存しない（sessionStorage / IndexedDB等も使わない）。
//
// [BOUNDARY] このモジュールはDOM操作・toast・Command Layer呼び出しを
// 一切行わない。record()はイベントを記録するだけであり、呼び出し側
// （app.js）の副作用には関与しない（analysisSession.js/analysisCommands.js
// が持つ[BOUNDARY INVARIANT]と同じ考え方をRecorderにも適用したもの）。

let _recording = false;
let _events = [];       // { timestamp, event, result, stateBefore, stateAfter }
let _sessionStartedAt = null;

/**
 * isRecording — 現在Recording中かどうか
 * @returns {boolean}
 */
export function isRecording() {
  return _recording;
}

/**
 * startRecording — Recordingを開始する（明示的操作のみ・デフォルトOFF）
 * 既存のRecordingがあれば破棄して新規セッションを開始する。
 */
export function startRecording() {
  _recording = true;
  _events = [];
  _sessionStartedAt = new Date();
}

/**
 * stopRecording — Recordingを停止する。
 * 記録済みのeventsはクリアしない（Stop後もCopy Debug Reportで参照するため）。
 */
export function stopRecording() {
  _recording = false;
}

/**
 * hasReport — Copy Debug Reportボタンの活性化判定に使う。
 * Recording中でなくても、直前のセッションのeventsが1件以上あればtrueを返す。
 * @returns {boolean}
 */
export function hasReport() {
  return _events.length > 0;
}

/**
 * record — 1つのSemantic Eventを記録する。
 *
 * [呼び出し規約]（設計確定事項）
 *   ・Command Layer関数そのものではなく、app.js側の「ユーザー操作単位」の
 *     ラッパー関数（deleteSelection/cutSelection/mergeSelection等）から、
 *     Command呼び出し直後・副作用（setSelectedChordIds/_refreshEditorView等）
 *     の直前で呼ぶ。
 *   ・内部で複数のCommandへ委譲する操作（例: cutSelection内部の
 *     copySelectionCommand + deleteSelectionCommand）は、呼び出し元で
 *     1回だけ呼ぶ（委譲先個別には呼ばない）。
 *   ・複数の呼び出し元から共有される関数（例: updateChord）は、
 *     呼び出し元ごとに異なるevent名で記録する（updateChord自体には
 *     Recorder呼び出しを置かない）。
 *   ・連続呼び出しされる操作（例: moveBoundaryのドラッグ中連続呼び出し）は、
 *     開始点でstateBeforeを保持し、終了点で1回だけrecord()を呼ぶ
 *     （ジェスチャー全体で1イベント）。
 *
 * Recording中でない場合は何もしない（記録コストをゼロにするため、
 * 呼び出し元でのisRecording()チェックは必須ではないが、呼び出し側の
 * 可読性のためにチェックしてから呼ぶことを推奨する）。
 *
 * [Phase121のスコープ] record()の引数形状（resultにok:false・reasonを
 * 含められる）は将来の拡張余地として設計してあるが、Phase121時点の
 * 呼び出し元は全て「Command/mutationが成立した場合のみ」record()を
 * 呼ぶ運用としている（失敗時は早期returnし、記録しない）。失敗した
 * ユーザー操作（例: 選択なしでpasteを試みた）まで記録するかどうかは、
 * Phase122のSemantic Interaction Event設計時に改めて判断する
 * （失敗理由の多くはInteraction Event側の文脈で自明になる可能性が
 * あるため、Mutation Recording層だけで先に決め打ちしない）。
 *
 * @param {string} event - Semantic Event名（例: 'deleteSelection'）
 * @param {object} [result] - Command LayerのResult（{ ok, reason? } 等）。
 *   Result Protocolを持たない操作（undo/redo/project switch等）はnull可。
 * @param {object} [stateBefore] - 操作前のstate snapshot（軽量オブジェクト）
 * @param {object} [stateAfter] - 操作後のstate snapshot（軽量オブジェクト）
 */
export function record(event, result, stateBefore, stateAfter) {
  if (!_recording) return;
  _events.push({
    timestamp: new Date(),
    event,
    result: result ?? null,
    stateBefore: stateBefore ?? null,
    stateAfter: stateAfter ?? null,
  });
}

/**
 * snapshotState — MVPで観測する軽量state snapshotを組み立てるヘルパー。
 *
 * [SNAPSHOT FIELDS]（設計確定事項）
 *   共通:            editorMode, selectedChordIds, selectedSectionId, dirty,
 *                    historyLength, futureLength（Phase123-B・
 *                    debug-recorder-design.md §6 [STATE TRANSITION OVER
 *                    STATE VALUE]。Undo/Redoスタックの深さの変化を
 *                    追跡するための共通フィールド。history/futureを
 *                    変化させないイベント（copySelection等）ではbefore=after
 *                    となり、_formatDiffLine()が自動的に非表示にするため、
 *                    opts経由のopt-inにする必要がない）
 *   buffer mutation: bufferLength を追加
 *   section mutation: sectionsCount を追加
 *
 * @param {object} analysisEditor - app.js の analysisEditor（読み取り専用）
 * @param {object} opts
 * @param {boolean} [opts.includeBuffer] - buffer.lengthを含めるか
 * @param {boolean} [opts.includeSections] - sections.lengthを含めるか
 * @param {string} [opts.editorMode] - deriveEditorMode()の結果（呼び出し側から渡す）
 * @param {string|null} [opts.selectedSectionId] - 現在のSection選択（呼び出し側から渡す）
 * @returns {object}
 */
export function snapshotState(analysisEditor, opts = {}) {
  const snap = {
    editorMode: opts.editorMode ?? null,
    selectedChordIds: [...(analysisEditor?.selection?.chordIds ?? [])],
    selectedSectionId: opts.selectedSectionId ?? null,
    dirty: analysisEditor?.dirty ?? null,
    // [Phase123-B] Undo/Redoスタックの深さ。opt-inにせず常時含める
    // （変化しないイベントではbefore=afterとなり_formatDiffLine()が
    // 自動的に非表示にするため。§6 [STATE TRANSITION OVER STATE VALUE]）。
    historyLength: analysisEditor?.history?.length ?? null,
    futureLength: analysisEditor?.future?.length ?? null,
  };
  if (opts.includeBuffer) {
    snap.bufferLength = analysisEditor?.buffer?.length ?? null;
  }
  if (opts.includeSections) {
    snap.sectionsCount = analysisEditor?.sections?.length ?? null;
  }
  return snap;
}

function _formatTime(date) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function _formatDiffLine(label, before, after) {
  const b = JSON.stringify(before);
  const a = JSON.stringify(after);
  if (b === a) return null;
  return `    ${label}: ${b} → ${a}`;
}

function _formatEvent(e) {
  const lines = [`[${_formatTime(e.timestamp)}] ${e.event}`];
  if (e.result && typeof e.result.ok === 'boolean') {
    lines.push(`    result: ${e.result.ok ? 'ok' : `failed (${e.result.reason ?? 'unknown'})`}`);
  }
  if (e.stateBefore && e.stateAfter) {
    const keys = new Set([...Object.keys(e.stateBefore), ...Object.keys(e.stateAfter)]);
    for (const key of keys) {
      const line = _formatDiffLine(key, e.stateBefore[key], e.stateAfter[key]);
      if (line) lines.push(line);
    }
  }
  return lines.join('\n');
}

/**
 * buildReport — 人間可読なDebug Reportを生成する（MVPの唯一の出力形式）。
 * JSON出力はPhase121のスコープ外（Future候補）。
 *
 * @returns {string}
 */
export function buildReport() {
  const header = '=== CreateChordScore Debug Session ===';
  const footer = '=== End Debug Session ===';

  if (_events.length === 0) {
    return `${header}\n(no events recorded)\n${footer}`;
  }

  const startedLine = _sessionStartedAt
    ? `Session started: ${_sessionStartedAt.toLocaleString()}`
    : null;

  const body = _events.map(_formatEvent).join('\n\n');

  const parts = [header];
  if (startedLine) parts.push(startedLine, '');
  parts.push(body, '', footer);
  return parts.join('\n');
}

/**
 * clearReport — 記録済みeventsを破棄する。
 * Recording中に呼ぶことは想定しない（呼び出し側でstartRecording()を
 * 使うこと。こちらは明示的な破棄専用）。
 */
export function clearReport() {
  _events = [];
  _sessionStartedAt = null;
}
