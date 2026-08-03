// ════════════════════════════════════════
// ANALYSIS EDITOR - COMMAND LAYER（Phase87）
// ════════════════════════════════════════
//
// [SCOPE]
// このファイルはAnalysis Editorの「Editing Command」を集約する。
// state（analysisEditorオブジェクト）を引数で受け取り、state操作＋
// CommandResultの返却のみを行う。以下は一切行わない：
//   - DOM操作（_refreshEditorView等）
//   - Chart Mode runtime同期（setSelectedChordIds等）
//   - toast等のUI通知
//   - audio/focus/scroll操作
// これらの副作用はすべて呼び出し側（app.js）の責務。
// この境界はPhase86-2のanalysisSession.js抽出と同型（[SCOPE]コメントも踏襲）。
//
// [NAMING]
// app.js側に既存の同名関数（copySelection等）があるため、
// このファイルのexportは全て `*Command` 接尾辞を持つ（import衝突回避・Phase87で確定）。
// 例外: buildPastePlan / commitPastePlan は元々app.js側に同名の
// ラッパーが存在しないため、接尾辞なしのまま維持する。
//
// [RESULT TYPE]
// @typedef {Object} CommandResult
// @property {boolean} ok
// @property {string} [reason]            - 失敗理由（toast用メッセージ。ok:false時のみ）
// @property {string[]} [selectedChordIds] - コマンド後にselectionへ反映すべきchordId配列（ok:true時）
// @property {number} [count]             - 対象件数（成功メッセージの件数表示用。ある場合のみ）

import { pushHistory, refreshSelection, getSections, validateSectionInvariants } from './analysisSession.js';

/**
 * _isNoChordEntry — bufferエントリがno_chord（無音）プレースホルダーか判定
 * （app.jsから移設。deleteChordCommand/deleteSelectionCommand専用の内部ヘルパー）
 */
function _isNoChordEntry(c) {
  if (!c || !c.chord) return false;
  const normalized = String(c.chord).trim().toUpperCase()
    .replace(/\./g, '').replace(/\s/g, '').replace(/[()]/g, '');
  return normalized === 'N' || normalized === 'NC';
}

/**
 * _pickAbsorbingNeighbor — 削除ブロックの吸収先を決定する（Phase76-Bで確定・app.jsから移設）
 * @returns {{ absorbing: object, direction: 'left'|'right' }}
 */
function _pickAbsorbingNeighbor(buffer, lo, hi) {
  const left = lo > 0 ? buffer[lo - 1] : null;
  const right = hi < buffer.length - 1 ? buffer[hi + 1] : null;

  if (left && !_isNoChordEntry(left)) return { absorbing: left, direction: 'left' };
  if (right) return { absorbing: right, direction: 'right' };
  return { absorbing: left, direction: 'left' };
}

/**
 * deleteChordCommand — 指定コードを削除し、時間領域を隣接コードへ吸収する（Phase75由来・Phase87で移設）
 * @returns {CommandResult}
 */
export function deleteChordCommand(state, id) {
  const idx = state.buffer.findIndex(c => c._id === id);
  if (idx === -1) return { ok: false, reason: null };

  if (state.buffer.length <= 1) {
    return { ok: false, reason: '最後の1つのコードは削除できません' };
  }

  const target = state.buffer[idx];
  pushHistory(state);

  const { absorbing, direction } = _pickAbsorbingNeighbor(state.buffer, idx, idx);
  if (direction === 'left') {
    absorbing.end = target.end;
  } else {
    absorbing.start = target.start;
  }

  state.buffer.splice(idx, 1);
  refreshSelection(state, [absorbing._id]);

  return { ok: true, selectedChordIds: [absorbing._id] };
}

/**
 * deleteSelectionCommand — 選択中コードをまとめて削除する（Phase76-B由来・Phase87で移設）
 * 選択が単一の場合はdeleteChordCommand()に委譲する（吸収ロジックを1箇所に保つ・既存方針を継承）。
 * @returns {CommandResult}
 */
export function deleteSelectionCommand(state) {
  const selectedIds = state.selection.chordIds;
  if (selectedIds.length === 0) return { ok: false, reason: null };
  if (selectedIds.length === 1) return deleteChordCommand(state, selectedIds[0]);

  const buffer = state.buffer;
  const indices = selectedIds
    .map(id => buffer.findIndex(c => c._id === id))
    .filter(i => i !== -1)
    .sort((a, b) => a - b);

  if (indices.length === 0) return { ok: false, reason: null };

  const lo = indices[0];
  const hi = indices[indices.length - 1];

  if (hi - lo + 1 !== indices.length) {
    return { ok: false, reason: '選択範囲が連続していないため削除できません' };
  }

  const removeCount = hi - lo + 1;
  if (buffer.length - removeCount < 1) {
    return { ok: false, reason: 'すべてのコードは削除できません' };
  }

  const blockStart = buffer[lo];
  const blockEnd = buffer[hi];
  pushHistory(state);

  const { absorbing, direction } = _pickAbsorbingNeighbor(buffer, lo, hi);
  if (direction === 'left') {
    absorbing.end = blockEnd.end;
  } else {
    absorbing.start = blockStart.start;
  }

  buffer.splice(lo, removeCount);
  refreshSelection(state, [absorbing._id], absorbing._id);

  return { ok: true, selectedChordIds: [absorbing._id] };
}

/**
 * copySelectionCommand — 選択中コードをクリップボードへコピーする（Phase76-C由来・Phase87で移設）
 * historyを積まない軽いmutation（Light Command）。clipboard構造はPhase79 version2のまま変更なし。
 * @returns {CommandResult & { count?: number }}
 */
export function copySelectionCommand(state) {
  const selectedIds = state.selection.chordIds;
  if (selectedIds.length === 0) return { ok: false, reason: null };

  const buffer = state.buffer;
  const selectedChords = selectedIds
    .map(id => buffer.find(c => c._id === id))
    .filter(Boolean);

  if (selectedChords.length === 0) return { ok: false, reason: null };

  const totalDuration = selectedChords.reduce((sum, c) => sum + (c.end - c.start), 0);
  if (totalDuration <= 0) {
    return { ok: false, reason: 'コピーできません（不正な時間データです）' };
  }

  const rangeStart = selectedChords[0].start;

  state.clipboard = {
    version: 2,
    totalDurationSec: totalDuration,
    chords: selectedChords.map(c => ({
      chord: c.chord,
      ratio: (c.end - c.start) / totalDuration,
      offsetSec: c.start - rangeStart,
      durationSec: c.end - c.start,
    })),
  };

  return { ok: true, count: selectedChords.length };
}

/**
 * cutSelectionCommand — Copy + Delete（Phase76-D由来・Phase87で移設）
 * [INVARIANT] Copyが失敗した場合はDeleteを行わない（既存方針を継承）。
 * [INVARIANT] historyはdeleteSelectionCommand内の1回のみ（copyはhistoryを積まない）。
 * @returns {CommandResult & { count?: number }}
 */
export function cutSelectionCommand(state) {
  if (state.selection.chordIds.length === 0) return { ok: false, reason: null };

  const copyResult = copySelectionCommand(state);
  if (!copyResult.ok) return copyResult;

  const deleteResult = deleteSelectionCommand(state);
  return { ...deleteResult, count: copyResult.count };
}

/**
 * pasteSelectionCommand — クリップボードを選択中コードの時間枠へ「置き換え」で貼り付ける
 * （Phase76-E由来・Phase87で移設）。Paste = Replace専用（Insertではない）。
 * @returns {CommandResult}
 */
export function pasteSelectionCommand(state) {
  const clipboard = state.clipboard;
  if (!clipboard || !clipboard.chords || clipboard.chords.length === 0) {
    return { ok: false, reason: 'コピーされたコードがありません' };
  }

  const selectedIds = state.selection.chordIds;
  if (selectedIds.length === 0) return { ok: false, reason: null };

  const buffer = state.buffer;
  const indices = selectedIds
    .map(id => buffer.findIndex(c => c._id === id))
    .filter(i => i !== -1)
    .sort((a, b) => a - b);

  if (indices.length === 0) return { ok: false, reason: null };

  const lo = indices[0];
  const hi = indices[indices.length - 1];

  if (hi - lo + 1 !== indices.length) {
    return { ok: false, reason: '選択範囲が連続していないため貼り付けできません' };
  }

  const targetStart = buffer[lo].start;
  const targetEnd = buffer[hi].end;
  const targetDuration = targetEnd - targetStart;

  if (targetDuration <= 0) {
    return { ok: false, reason: '貼り付けできません（不正な時間データです）' };
  }

  pushHistory(state);

  let cursor = targetStart;
  const newChords = clipboard.chords.map((entry, i) => {
    const isLast = i === clipboard.chords.length - 1;
    const start = cursor;
    const end = isLast ? targetEnd : cursor + entry.ratio * targetDuration;
    cursor = end;
    return {
      chord: entry.chord,
      start,
      end,
      confidence: 1,
      _id: crypto.randomUUID(),
    };
  });

  buffer.splice(lo, hi - lo + 1, ...newChords);

  const newIds = newChords.map(c => c._id);
  refreshSelection(state, newIds, newIds[newIds.length - 1]);

  return { ok: true, selectedChordIds: newIds };
}

/**
 * buildPastePlan — 「そのまま貼り付け」の適用計画を作る（純粋関数・Phase79由来・Phase87で移設）
 * [SCOPE] state.bufferを読むだけで一切変更しない。commitPastePlan()が実際の適用を担う。
 * [DESIGN] 上書き方式（5分類）・[ID POLICY]（分断ケースは前後とも新規_id発行）は変更なし。
 *
 * @param {object} state
 * @param {number|null} originTime - app.js側 getPasteOrigin() の戻り値
 * @param {object} clipboard
 * @returns {{ok:true, buffer:object[], newIds:string[]} | {ok:false, reason:string}}
 */
export function buildPastePlan(state, originTime, clipboard) {
  if (originTime == null) {
    return { ok: false, reason: 'この位置には貼り付けできません' };
  }
  if (!clipboard || !clipboard.chords || clipboard.chords.length === 0) {
    return { ok: false, reason: 'コピーされたコードがありません' };
  }

  const EPS = 1e-6;
  const buffer = state.buffer;
  const songEnd = buffer[buffer.length - 1].end;

  const pasteStart = originTime;
  const pasteEnd = pasteStart + clipboard.totalDurationSec;

  if (pasteEnd > songEnd + EPS) {
    return { ok: false, reason: 'この位置には貼り付けできません（時間が足りません）' };
  }

  const newChords = clipboard.chords.map(entry => ({
    chord: entry.chord,
    start: pasteStart + entry.offsetSec,
    end: pasteStart + entry.offsetSec + entry.durationSec,
    confidence: 1,
    _id: crypto.randomUUID(),
  }));
  newChords[newChords.length - 1].end = pasteEnd;

  const survivors = [];
  for (const c of buffer) {
    const fullyInside = c.start >= pasteStart - EPS && c.end <= pasteEnd + EPS;
    if (fullyInside) continue;

    const overlapsStart = c.start < pasteStart - EPS && c.end > pasteStart + EPS;
    const overlapsEnd = c.start < pasteEnd - EPS && c.end > pasteEnd + EPS;

    if (overlapsStart && overlapsEnd) {
      survivors.push({ ...c, _id: crypto.randomUUID(), end: pasteStart });
      survivors.push({ ...c, _id: crypto.randomUUID(), start: pasteEnd });
      continue;
    }
    if (overlapsStart) {
      survivors.push({ ...c, end: pasteStart });
      continue;
    }
    if (overlapsEnd) {
      survivors.push({ ...c, start: pasteEnd });
      continue;
    }
    survivors.push(c);
  }

  const merged = [...survivors, ...newChords].sort((a, b) => a.start - b.start);

  return { ok: true, buffer: merged, newIds: newChords.map(c => c._id) };
}

/**
 * commitPastePlan — buildPastePlan()の結果をbufferへ適用する（Phase79由来・Phase87で移設）
 * [UNDO INVARIANT] 内部で複数の削除・短縮・移動・追加を行うが、historyは1回のみ積む。
 * @returns {CommandResult}
 */
export function commitPastePlan(state, plan) {
  pushHistory(state);
  state.buffer = plan.buffer;
  refreshSelection(state, plan.newIds, plan.newIds[plan.newIds.length - 1]);
  return { ok: true, selectedChordIds: plan.newIds, count: plan.newIds.length };
}

/**
 * updateChordCommand — 指定IDのコードのプロパティを更新する（Phase74-C由来・Phase88 Sprint Bで移設）
 * @param {string} id - chord._id
 * @param {{ chord?: string, start?: number, end?: number }} patch
 * @returns {CommandResult}
 */
export function updateChordCommand(state, id, patch) {
  const c = state.buffer.find(c => c._id === id);
  if (!c) return { ok: false, reason: null };  // 存在しないIDなら何もしない（無駄なUndo履歴を防ぐ）

  pushHistory(state);
  Object.assign(c, patch);

  return { ok: true };
}

/**
 * splitChordCommand — 指定コードを splitTime で2つに分割する（コード追加の実体・Phase75由来・Phase88 Sprint Bで移設）
 *
 * [SPLIT INVARIANTS] この関数が保証すること（moveBoundaryと同じ理由で移設前のdocstringを踏襲）
 *   1. splitTime が対象コードの (start, end) の範囲外（両端含む）なら、
 *      何もせず {ok:false} を返す（duration 0 のコードを作らない）。
 *   2. 左側コードは元の _id・chord名を維持する（end だけ splitTime に書き換わる）。
 *   3. 右側コードは新しい _id（crypto.randomUUID()）を持つ新規オブジェクトとして生成される。
 *   4. 右側コードの chord名は左側と同じ値をコピーする
 *      （呼び出し側が updateChord() で直後に上書きする前提）。
 *   5. 左右のコードは時間的に隙間なく連続する（left.end === right.start === splitTime）。
 *   6. Undo単位はこの関数全体で1回（pushHistory()をここで1回だけ呼ぶ）。
 *   7. buffer の配列長が変わる操作のため、refreshSelection() を呼ぶ（[AE-4]）。
 *      ただし選択自体を新しいコードへ切り替えるかどうかは呼び出し側の責務。
 *
 * @param {string} chordId - 分割対象のコードの _id
 * @param {number} splitTime - 分割点の時刻（秒）
 * @returns {CommandResult & { newId?: string }} newId: 新しく生成された右側コードの _id
 */
export function splitChordCommand(state, chordId, splitTime) {
  const idx = state.buffer.findIndex(c => c._id === chordId);
  if (idx === -1) return { ok: false, reason: null };

  const target = state.buffer[idx];
  // [INVARIANT 1] 範囲チェック（両端含む＝duration 0を防ぐ）
  if (!(splitTime > target.start && splitTime < target.end)) return { ok: false, reason: null };

  pushHistory(state);  // [INVARIANT 6] Undo単位はここで1回のみ

  // [INVARIANT 3・4] 右側は新規_id・chord名は左側からコピー
  const rightChord = { ...target, _id: crypto.randomUUID(), start: splitTime };
  // [INVARIANT 2・5] 左側はend更新のみ。right.start === splitTime === left.end
  target.end = splitTime;

  state.buffer.splice(idx + 1, 0, rightChord);

  refreshSelection(state);  // [INVARIANT 7・AE-4] buffer長が変わったため選択キャッシュを再同期

  return { ok: true, newId: rightChord._id };
}

/**
 * addChordCommand — 「コードを追加」操作（分割＋リネーム）を1トランザクションで実行する
 * （Phase89新設・Issue #46対応）
 *
 * [背景] splitChordCommand() → updateChordCommand() の直列呼び出しでは、
 * それぞれが独立して pushHistory() を呼ぶため、ユーザーからは1回の操作に
 * 見える「コードを追加」がUndo単位2回に分かれてしまっていた（Issue #46）。
 *
 * この関数はsplitChordCommand/updateChordCommandを呼び出さず、同じロジックを
 * 局所的に複製した上でpushHistory()を1回だけ呼ぶ。既存の2関数はシグネチャ・
 * 挙動とも変更しない（他4箇所の呼び出し元への影響を避けるため）。
 *
 * [UNDO TRANSACTION INVARIANT]
 * ユーザーから「1回の操作」と認識される編集は、内部的に複数のbuffer mutation を
 * 伴っても pushHistory() は1回でなければならない（commitPastePlanと同じ原則）。
 *
 * @param {string} chordId - 分割対象のコードの _id
 * @param {number} splitTime - 分割点の時刻（秒）
 * @param {string} newChordName - 右側（新規）コードに設定するchord名（canonical）
 * @returns {CommandResult & { newId?: string }} newId: 新しく生成された右側コードの _id
 *   reason: 'not-found'（対象コードが存在しない） | 'invalid-range'（splitTimeが範囲外）
 */
export function addChordCommand(state, chordId, splitTime, newChordName) {
  const idx = state.buffer.findIndex(c => c._id === chordId);
  if (idx === -1) return { ok: false, reason: 'not-found' };

  const target = state.buffer[idx];
  // splitChordCommandの[INVARIANT 1]と同じ範囲チェック（duration 0を防ぐ）
  if (!(splitTime > target.start && splitTime < target.end)) return { ok: false, reason: 'invalid-range' };

  pushHistory(state);  // [UNDO TRANSACTION INVARIANT] 分割＋リネームで1回のみ

  // 右側は新規_id・chord名は最初からnewChordNameを設定（updateChordCommand相当を統合）
  const rightChord = { ...target, _id: crypto.randomUUID(), start: splitTime, chord: newChordName };
  target.end = splitTime;

  state.buffer.splice(idx + 1, 0, rightChord);

  // 新規コードを単独選択（[AE-7]によりeditPointは自動クリア）
  refreshSelection(state, [rightChord._id], rightChord._id);

  return { ok: true, newId: rightChord._id, selectedChordIds: [rightChord._id] };
}

/**
 * moveBoundaryCommand — 境界（隣接コード間の時刻）を書き換える唯一の窓口
 * （Phase75由来・Phase88 Sprint Aで移設）。
 *
 * [EXCEPTION] このファイルの他のCommandと異なり、CommandResult（{ok, reason}）を
 * 返さない。理由:
 *   - historyを積まない（呼び出し側のshiftSelectedBoundary()/shiftSelectionRange()等が
 *     ユーザー操作1回分としてpushHistory()を呼ぶ。moveBoundaryCommand自身は
 *     「ユーザー操作」ではなく、境界を挟む2要素を書き換えるだけの低レベル primitive）
 *   - 将来ドラッグ操作等で1操作中に連続呼び出しされる可能性があるため、
 *     ここにhistory/toast等を持たせない設計を維持する
 * この扱いはbuildPastePlan（純粋なplanning helper・専用shape）と同じ前例に基づく。
 *
 * Invariant: left.end と right.start は常に同じ値になるよう更新する。
 * 範囲チェックはこの関数の責務ではない（呼び出し側が判断する）。
 *
 * @returns {number|null} 適用された時刻。境界が存在しなければnull。
 */
export function moveBoundaryCommand(state, boundaryIndex, newTime) {
  const left  = state.buffer[boundaryIndex];
  const right = state.buffer[boundaryIndex + 1];
  if (!left || !right) return null;

  left.end    = newTime;
  right.start = newTime;
  return newTime;
}

/**
 * mergeSelectionCommand — 連続する複数選択コードを1つに結合する（Phase76-F由来・Phase87で移設）
 * @returns {CommandResult}
 */
export function mergeSelectionCommand(state) {
  const selectedIds = state.selection.chordIds;
  if (selectedIds.length < 2) return { ok: false, reason: null };

  const buffer = state.buffer;
  const indices = selectedIds
    .map(id => buffer.findIndex(c => c._id === id))
    .filter(i => i !== -1)
    .sort((a, b) => a - b);

  if (indices.length < 2) return { ok: false, reason: null };

  const lo = indices[0];
  const hi = indices[indices.length - 1];

  if (hi - lo + 1 !== indices.length) {
    return { ok: false, reason: '選択範囲が連続していないため結合できません' };
  }

  const first = buffer[lo];
  const last = buffer[hi];

  pushHistory(state);

  const merged = {
    chord: first.chord,
    start: first.start,
    end: last.end,
    confidence: 1,
    _id: crypto.randomUUID(),
  };

  buffer.splice(lo, hi - lo + 1, merged);
  refreshSelection(state, [merged._id], merged._id);

  return { ok: true, selectedChordIds: [merged._id] };
}

// ════════════════════════════════════════
// SECTION COMMANDS（Phase100-A）
// ════════════════════════════════════════
//
// [SCOPE]
// Sectionに対するCreate/Rename/UpdateBoundary/Deleteを担う。
// 他のCommand同様、DOM/Chart Mode runtime/toast等の副作用は一切行わない。
//
// [SECTION HISTORY INTEGRATION]（Phase104で解消）
// Section系4コマンドは pushHistory(state) を呼び、Historyへ統合済み。
// history/futureのスナップショット形状が { buffer, sections } へ拡張された
// ことで（analysisSession.js参照）、Section変更もUndo/Redo対象となった。
// pushHistory()の呼び出し位置は既存コマンド（deleteChordCommand等）と
// 同じ規則（バリデーション通過後・実際の変更の直前）に揃えている。
//
// [Phase104] dirty更新はpushHistory()内のsession.dirty=trueに一本化した。
// Phase100-A時点で各コマンドへ個別に置いていたstate.dirty=trueは削除した
// （二重管理を避けるため）。
//
// TODO(Phase100-B)
//   - Section Selection State（selectedSectionId等。UI着手時に検討）
//
// [INVARIANT] SectionのReconcile（Validation + Repair）はSession Layerの
// getSections()のみが行う。Command LayerはvalidateSectionInvariants()での
// 事前検証のみを行い、reconcile()は呼ばない（責務境界を保つ・ChatGPTレビュー反映）。

/**
 * createSectionCommand — 新規Sectionを作成する（Phase100-A）
 *
 * [NOTE] 既存sectionsをreconcile済みの状態に揃えてから追加するため、
 * 直接 state.sections を触らず getSections(state) を経由する。
 *
 * @param {object} state - analysisEditor
 * @param {{ type: string, name: string, startChordId: string, endChordId: string }} input
 * @returns {CommandResult & { sectionId?: string }}
 *   reason: 'no-buffer' | 'start-not-found' | 'end-not-found' | 'start-after-end'
 */
export function createSectionCommand(state, { type, name, startChordId, endChordId }) {
  getSections(state); // reconcile済みに揃える（Session APIを必ず経由する・ChatGPTレビュー反映）

  const candidate = { id: crypto.randomUUID(), type, name, startChordId, endChordId };
  const check = validateSectionInvariants(candidate, state.buffer);
  if (!check.valid) return { ok: false, reason: check.reason };

  pushHistory(state); // [Phase104] 既存コマンドと同じ位置（バリデーション通過後・反映直前）

  state.sections.push(candidate);
  return { ok: true, sectionId: candidate.id };
}

/**
 * renameSectionCommand — Sectionの名前・種類を変更する（Phase100-A）
 *
 * @param {object} state - analysisEditor
 * @param {string} sectionId
 * @param {{ name?: string, type?: string }} patch
 * @returns {CommandResult}
 *   reason: 'section-not-found'
 */
export function renameSectionCommand(state, sectionId, patch = {}) {
  const sections = getSections(state);
  const section = sections.find(s => s.id === sectionId);
  if (!section) return { ok: false, reason: 'section-not-found' };

  pushHistory(state); // [Phase104] 既存コマンドと同じ位置（バリデーション通過後・反映直前）

  if (patch.name !== undefined) section.name = patch.name;
  if (patch.type !== undefined) section.type = patch.type;

  return { ok: true, sectionId };
}

/**
 * updateSectionBoundaryCommand — Sectionの境界（startChordId/endChordId）を変更する
 * （Phase100-A）
 *
 * [INVARIANT] 変更前にローカルでcandidateを作りvalidateSectionInvariants()で
 * 妥当性を確認してから反映する。壊れたSectionをSessionへ入れない
 * （ChatGPTレビュー反映）。
 *
 * @param {object} state - analysisEditor
 * @param {string} sectionId
 * @param {{ startChordId?: string, endChordId?: string }} patch
 * @returns {CommandResult}
 *   reason: 'section-not-found' | 'no-buffer' | 'start-not-found' | 'end-not-found' | 'start-after-end'
 */
export function updateSectionBoundaryCommand(state, sectionId, patch = {}) {
  const sections = getSections(state);
  const section = sections.find(s => s.id === sectionId);
  if (!section) return { ok: false, reason: 'section-not-found' };

  const candidate = {
    ...section,
    startChordId: patch.startChordId !== undefined ? patch.startChordId : section.startChordId,
    endChordId:   patch.endChordId   !== undefined ? patch.endChordId   : section.endChordId,
  };

  const check = validateSectionInvariants(candidate, state.buffer);
  if (!check.valid) return { ok: false, reason: check.reason };

  pushHistory(state); // [Phase104] 既存コマンドと同じ位置（バリデーション通過後・反映直前）

  section.startChordId = candidate.startChordId;
  section.endChordId   = candidate.endChordId;

  return { ok: true, sectionId };
}

/**
 * deleteSectionCommand — Sectionを明示的に削除する（Phase100-A・section-model.md §6）
 *
 * @param {object} state - analysisEditor
 * @param {string} sectionId
 * @returns {CommandResult}
 *   reason: 'section-not-found'
 */
export function deleteSectionCommand(state, sectionId) {
  const sections = getSections(state);
  const idx = sections.findIndex(s => s.id === sectionId);
  if (idx === -1) return { ok: false, reason: 'section-not-found' };

  pushHistory(state); // [Phase104] 既存コマンドと同じ位置（バリデーション通過後・反映直前）

  sections.splice(idx, 1);

  return { ok: true, sectionId };
}
