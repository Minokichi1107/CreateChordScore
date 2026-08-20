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
 * @param {object} [reconcile] - diffSections()の戻り値（Phase123-C1）。
 *   reconcile()を実Factsで呼ぶ経路でのみ渡す。変化なし（null）の場合は
 *   渡さない（呼び出し側でnullチェック済みの前提。省略時はundefined）。
 */
export function record(event, result, stateBefore, stateAfter, reconcile) {
  if (!_recording) return;
  _events.push({
    timestamp: new Date(),
    event,
    result: result ?? null,
    stateBefore: stateBefore ?? null,
    stateAfter: stateAfter ?? null,
    reconcile: reconcile ?? null,
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

/**
 * snapshotSections — reconcile()診断専用のSection局所スナップショットを取得する。
 *
 * [Phase123-C1] snapshotState()の共通フィールド（historyLength等）とは
 * 別枠の専用ヘルパー。reconcile()を実Factsで呼ぶ経路（deleteChord /
 * deleteSelection / pasteSelection / pasteAbsolute / mergeSelection）
 * でのみ使用する。共通フィールド化しない理由は debug-recorder-design.md
 * §9 [RECORDING ADOPTION CRITERIA] の議論を参照（reconcile()を呼ばない
 * 大多数のイベントにとって、この情報は常に空になるだけで意味を持たない）。
 *
 * @param {object} analysisEditor - app.js の analysisEditor（読み取り専用）
 * @returns {Array<{id, startChordId, endChordId}>}
 */
export function snapshotSections(analysisEditor) {
  return (analysisEditor?.sections ?? []).map(s => ({
    id: s.id,
    startChordId: s.startChordId,
    endChordId: s.endChordId,
  }));
}

/**
 * diffSections — reconcile()前後のSectionスナップショットを比較し、
 * removed / remapped を分類する純粋関数（Phase123-C1）。
 *
 * [設計方針]
 *   ・removed:   idがbeforeに存在しafterに存在しない（Section削除）
 *   ・remapped:  idは存在するがstartChordId/endChordIdが変化
 *                （変化した側のみ from/to を含める。片側だけ変化した
 *                 場合、変化していない側のフィールドは省略する）
 *   ・変化なしの場合は null を返す（呼び出し側はreconcileフィールド
 *     自体をrecord()へ渡さないことで、Diagnostic Timelineに
 *     ノイズを残さない。§6 [STATE TRANSITION OVER STATE VALUE]と
 *     同じ「変化そのものだけを残す」思想）
 *
 * [SCOPE] 個数のみのsectionsCountでは検知できないremap
 *   （例: updateSectionBoundaryによる境界移動）を診断可能にすることが
 *   目的（Phase123-A Findings参照）。作成（新規Section）はこの関数の
 *   対象外（reconcile()自体がSectionを新規作成することはないため）。
 *
 * @param {Array|null} before - snapshotSections()の戻り値（変更前）
 * @param {Array|null} after  - snapshotSections()の戻り値（変更後）
 * @returns {{removed?: string[], remapped?: object[]}|null}
 */
export function diffSections(before, after) {
  if (!before || !after) return null;

  const afterMap = new Map(after.map(s => [s.id, s]));
  const removed = [];
  const remapped = [];

  for (const b of before) {
    const a = afterMap.get(b.id);
    if (!a) {
      removed.push(b.id);
      continue;
    }
    const startChanged = a.startChordId !== b.startChordId;
    const endChanged = a.endChordId !== b.endChordId;
    if (startChanged || endChanged) {
      const entry = { sectionId: b.id };
      if (startChanged) entry.startChordId = { from: b.startChordId, to: a.startChordId };
      if (endChanged) entry.endChordId = { from: b.endChordId, to: a.endChordId };
      remapped.push(entry);
    }
  }

  if (removed.length === 0 && remapped.length === 0) return null;

  const result = {};
  if (removed.length) result.removed = removed;
  if (remapped.length) result.remapped = remapped;
  return result;
}

/**
 * recordRender — Render Event（描画イベント）を記録する（Phase123-C2）。
 *
 * [DIAGNOSTIC TIMELINE AUTHORITY] Mutation Attempt（result/reconcile）とは
 * 独立したイベント種別として、同一の_events配列（単一時系列）へ積む
 * （debug-recorder-design.md §3。別配列・別Authorityにはしない）。
 *
 * [MUTATION-TRIGGERED ONLY] 記録対象はMutationに起因するrenderのみ
 * （trigger引数が呼び出し元から明示的に渡された場合のみ呼ばれる想定）。
 * Selection変更・検索・Section Preview等、Mutationを伴わないrenderは
 * 対象外（design doc §4 Level3の趣旨を維持するため）。
 *
 * [呼び出し規約] このモジュール自身はrenderが実際に成功したかどうかを
 * 判定しない。呼び出し元（app.js側の_refreshEditorView()等）が、実際の
 * render呼び出し（renderChartMode()等）が完了した後にのみ呼ぶことで、
 * 「記録された＝実際に描画された」という対応を保証する。
 *
 * @param {string} path - render経路のラベル（例: 'main'）
 * @param {string} source - 参照元（'buffer' | 'raw'）
 * @param {string} trigger - このrenderを引き起こしたMutation Event名
 */
export function recordRender(path, source, trigger) {
  if (!_recording) return;
  _events.push({
    timestamp: new Date(),
    event: 'render',
    result: null,
    stateBefore: null,
    stateAfter: null,
    reconcile: null,
    render: { path, source, trigger },
  });
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

/**
 * _formatReconcile — reconcileフィールドの人間可読フォーマット（Phase123-C1）。
 * resultと同じく汎用diffループの外で特別扱いする（§6参照）。
 */
function _formatReconcile(r) {
  const lines = ['    reconcile:'];
  if (r.removed && r.removed.length) {
    lines.push(`      removed: [${r.removed.join(', ')}]`);
  }
  if (r.remapped && r.remapped.length) {
    lines.push('      remapped:');
    for (const m of r.remapped) {
      lines.push(`        - sectionId: ${m.sectionId}`);
      if (m.startChordId) lines.push(`          startChordId: ${m.startChordId.from} → ${m.startChordId.to}`);
      if (m.endChordId) lines.push(`          endChordId: ${m.endChordId.from} → ${m.endChordId.to}`);
    }
  }
  return lines.join('\n');
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
  if (e.reconcile) {
    lines.push(_formatReconcile(e.reconcile));
  }
  if (e.render) {
    lines.push(`    path: ${e.render.path}`);
    lines.push(`    source: ${e.render.source}`);
    if (e.render.trigger) lines.push(`    trigger: ${e.render.trigger}`);
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
