/**
 * analysisSession.js — Analysis Editor Session Authority（Phase86-2 Sprint B）
 *
 * [SCOPE] このモジュールは analysisEditor state（buffer/history/future/selection）
 * に対する純粋な mutation のみを担当する。
 *
 * [INVARIANT] このファイルはDOM・audio・Chart Mode runtimeに一切触れない。
 * renderAnalysisEditor() / _refreshEditorView() / setSelectedChordIds() /
 * setBoundaryHandleTarget() / setEditPointMarker() / setSearchMatches() /
 * aEl.currentTime 等の呼び出しはすべてapp.js側（呼び出し元）の責務とする。
 *
 * [INVARIANT] Undo/Redoの既存semantics（history/future の past/future stack方式）
 * は変更しない。historyIndex方式へは変更しない。
 *
 * 責務の境界（Phase86-2で確立）:
 *   analysisSession.js → 「状態を変える」
 *   app.js              → 「変わった状態を画面へ投影する」
 */

/**
 * createAnalysisSession — analysisEditor の初期状態オブジェクトを生成する
 */
export function createAnalysisSession() {
  return {
    active:    false,  // 編集モード中かどうか
    buffer:    null,   // ChordEvent[]（_id付き）の作業コピー
    history:   [],     // Undo用スナップショットスタック
    future:    [],     // Redo用スナップショットスタック
    selection: { chordIds: [], boundaryIndex: null, anchorChordId: null, editPoint: null },
    clipboard: null,   // Phase74-E（コピー＆ペースト）用・現在未使用
    dirty:     false,  // 未保存変更フラグ
    search: { open: false, query: '', replaceText: '', matches: [], activeIndex: null, focusRequested: false },
    sections:  [],     // Section[]（Phase100-A・section-model.md §4.1）。
                        // Authority Scopeは Analysis Editor Session限定（永続化しない・section-model.md §5）
  };
}

/**
 * resetSessionFields — session の各フィールドを初期状態へ戻す（純粋・副作用なし）
 *
 * [NOTE] app.js側の resetAnalysisEditor() はこの関数を呼んだ後、
 * setSearchMatches([]) と _refreshSelection([]) を追加で呼ぶ
 * （Decorator/UI Projection側の同期はapp.js側の責務のため、ここでは行わない）。
 */
export function resetSessionFields(session) {
  session.active    = false;
  session.buffer    = null;
  session.history   = [];
  session.future    = [];
  session.clipboard = null;
  session.dirty     = false;
  session.search    = { open: false, query: '', replaceText: '', matches: [], activeIndex: null, focusRequested: false };
  session.sections  = [];
}

/**
 * _snapshotSession — session.buffer / session.sections を独立クローンとして
 * 1組のスナップショットにまとめる（純粋・内部ヘルパー・Phase104）。
 *
 * [INVARIANT] buffer・sectionsとも参照ではなく structuredClone による
 * 独立したコピーを返す。history/future積み込み後にsession側の値を
 * 変更しても、スナップショット側には一切影響しない。
 *
 * @param {object} session
 * @returns {{ buffer: Array|null, sections: Array }}
 */
function _snapshotSession(session) {
  return {
    buffer: structuredClone(session.buffer),
    sections: structuredClone(session.sections),
  };
}

/**
 * pushHistory — 編集操作前のスナップショットをhistoryへ積む（純粋）
 *
 * [INVARIANT] すべての編集API（updateChord/deleteChord/shiftAll等）は
 * buffer書き換えの直前に必ずこれを呼ぶこと。
 * 新規編集が発生したら future（Redoスタック）は破棄する。
 *
 * [Phase104] スナップショット形状を buffer 単体から { buffer, sections } へ
 * 拡張した。Section系4コマンド（create/rename/updateBoundary/delete）も
 * 本関数経由でHistoryへ統合される（[SECTION HISTORY INTEGRATION]解消）。
 * buffer・sectionsは _snapshotSession() によりそれぞれ独立クローンされる。
 */
export function pushHistory(session) {
  session.history.push(_snapshotSession(session));
  session.future = [];
  session.dirty = true;
}

/**
 * undoBuffer — history⇄{buffer,sections} の入替のみを行う（純粋。描画・selection同期は呼び出し元の責務）
 * @returns {boolean} 入替が行われたか（historyが空ならfalse）
 */
export function undoBuffer(session) {
  if (!session.history.length) return false;
  session.future.push(_snapshotSession(session));
  const snap = session.history.pop();
  session.buffer = snap.buffer;
  session.sections = snap.sections;
  return true;
}

/**
 * redoBuffer — future⇄{buffer,sections} の入替のみを行う（純粋。描画・selection同期は呼び出し元の責務）
 * @returns {boolean} 入替が行われたか（futureが空ならfalse）
 */
export function redoBuffer(session) {
  if (!session.future.length) return false;
  session.history.push(_snapshotSession(session));
  const snap = session.future.pop();
  session.buffer = snap.buffer;
  session.sections = snap.sections;
  return true;
}

/**
 * selectRange — Shift+クリックによる範囲選択のstate計算（純粋・Phase86-2でapp.jsから移植）
 *
 * anchorChordIdからtargetChordIdまでのbuffer上の連続区間を選択する。
 * 逆順（後ろ→前へのShiftクリック）にも対応する（内部で時系列順に正規化される）。
 *
 * [NOTE] anchorが見つからない場合（bufferから消えている等）は、
 * 通常クリックと同じ単一選択にフォールバックする。
 *
 * @param {object} session
 * @param {string} anchorChordId
 * @param {string} targetChordId
 */
export function selectRange(session, anchorChordId, targetChordId) {
  const buffer = session.buffer;
  const i1 = buffer?.findIndex(c => c._id === anchorChordId) ?? -1;
  const i2 = buffer?.findIndex(c => c._id === targetChordId) ?? -1;

  if (i1 === -1 || i2 === -1) {
    refreshSelection(session, [targetChordId], targetChordId);
    return;
  }

  const lo = Math.min(i1, i2);
  const hi = Math.max(i1, i2);
  const ids = buffer.slice(lo, hi + 1).map(c => c._id);
  // anchorChordIdは明示せず省略する → 既存anchor（hi/lo内に含まれる）を維持
  refreshSelection(session, ids);
}

/**
 * setEditPointFields — editPoint（挿入位置）確定のstate書き換えのみを行う（純粋）
 *
 * [NOTE] ownerId解決（空セルクリック時のbuffer検索・toast通知）と、
 * 呼び出し後のUI同期（setSelectedChordIds([])・_refreshEditorView()）は
 * app.js側の責務（Chart Mode runtime / DOM に依存するため）。
 *
 * chordIdsとeditPointは排他。_refreshSelection([])経由ではなく直接クリアする
 * （refreshSelection()を呼ぶとeditPoint自体も道連れでクリアされるため）。
 *
 * @param {object} session
 * @param {string} ownerId - 解決済みのオーナーコードid
 * @param {number} measureIndex
 * @param {number} slotIndex
 */
export function setEditPointFields(session, ownerId, measureIndex, slotIndex) {
  session.selection.chordIds = [];
  session.selection.boundaryIndex = null;
  session.selection.anchorChordId = null;
  session.selection.editPoint = { ownerId, measureIndex, slotIndex };
}

/**
 * clearEditPointField — editPointをnullへ戻す（純粋）
 * @returns {boolean} 変化があったか（既にnullならfalse）
 */
export function clearEditPointField(session) {
  if (session.selection.editPoint === null) return false;
  session.selection.editPoint = null;
  return true;
}

/**
 * refreshSelection — selectionの唯一の同期窓口（Phase76-Aで複数選択対応に拡張・Phase86-2で移植）
 *
 * selectionは派生状態。chordIds（と明示されたanchorChordId）だけが入力であり、
 * boundaryIndex・実際に反映されるchordIds・anchorChordIdの解決は必ずここで行う
 * （他の場所で直接書き換えない）。
 *
 * [INVARIANT] chordIdsはbuffer上の時系列順に正規化して格納する
 * （逆順クリックで渡された場合も並び替える）。
 * [INVARIANT] boundaryIndexは単一選択・複数選択のどちらでも意味を持つ
 * （選択範囲の左側の境界）。選択範囲が曲の先頭を含む場合はnull。
 * [INVARIANT] この関数はDOM・audio・Chart Mode runtimeに一切触れない
 * （renderAnalysisEditor() / setSelectedChordIds() 等は呼ばない）。
 *
 * @param {object} session - analysisEditor state
 * @param {string[]} [chordIds] - 新しい選択として確定するID配列。
 *   省略時は今のchordIdsをbufferと照合し直すだけ（Undo/Redo/削除後の再同期用）。
 * @param {string|null} [anchorChordId] - 範囲選択の起点を明示的に設定したい場合のみ指定する。
 */
export function refreshSelection(session, chordIds, anchorChordId) {
  const ids = chordIds !== undefined ? chordIds : session.selection.chordIds;
  const buffer = session.buffer;

  // [EDIT POINT LIFETIME] selection（chordIds）が変化する経路は常にここを通るため、
  // editPointのクリアもここに集約する（chordIdsとeditPointは排他）。
  session.selection.editPoint = null;

  // [INVARIANT] buffer上の時系列順に正規化し、buffer上に実在しないIDは除外する
  const validIds = buffer ? buffer.filter(c => ids.includes(c._id)).map(c => c._id) : [];

  if (validIds.length === 0) {
    session.selection.chordIds = [];
    session.selection.boundaryIndex = null;
    session.selection.anchorChordId = null;
    return;
  }

  session.selection.chordIds = validIds;

  {
    const firstIdx = buffer.findIndex(c => c._id === validIds[0]);
    session.selection.boundaryIndex = firstIdx > 0 ? firstIdx - 1 : null;
  }

  // anchorChordId解決
  const currentAnchor = session.selection.anchorChordId;
  if (anchorChordId !== undefined) {
    session.selection.anchorChordId = anchorChordId;
  } else if (currentAnchor && validIds.includes(currentAnchor)) {
    // 既存anchorが新しい選択範囲に含まれる場合は維持する
  } else {
    session.selection.anchorChordId = validIds[validIds.length - 1];
  }
}

/**
 * activateSearchIndex — 検索結果のwrap-around index計算 + activeIndex確定（純粋・Phase90）
 *
 * app.js側の _activateSearchMatch() から、state計算のみを抽出したもの。
 * historyを積まない操作のため（Editing Commandではなくnavigation）、
 * analysisCommands.js（Command Layer）ではなくこちら（Session Layer）に置く。
 *
 * [NOTE] 呼び出し後のselection同期（_refreshSelection）・Chart Mode同期
 * （setSelectedChordIds）・audio seek（aEl.currentTime）・DOM再描画
 * （_refreshEditorView）は、すべてapp.js側の責務（[SCOPE]準拠）。
 *
 * @param {object} session - analysisEditor
 * @param {number} index - matches配列内のindex（範囲外はラップアラウンド）
 * @returns {string|null} 対象chordId。matchesが空ならnull
 */
export function activateSearchIndex(session, index) {
  const { matches } = session.search;
  if (!matches.length) return null;
  const clamped = ((index % matches.length) + matches.length) % matches.length;
  session.search.activeIndex = clamped;
  return matches[clamped];
}

/**
 * validateSectionInvariants — Section単体が[SECTION INVARIANTS]（section-model.md §4.4）
 * を満たすかを判定する純粋関数（Phase100-A）。
 *
 * [NOTE] 「コード本体を持たない」（§4.4の4条件目）は構造上自明に満たされるため、
 * ここでは判定しない。判定対象は以下の3条件のみ。
 *   ・startChordId / endChordId が buffer 上に実在する
 *   ・startChordId が endChordId より時間的に後方を指していない
 *   ・区間内（start〜end）が buffer 上で連続している（歯抜けがない）
 *
 * @param {object} section - { id, type, name, startChordId, endChordId }
 * @param {Array|null} buffer - analysisEditor.buffer
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateSectionInvariants(section, buffer) {
  if (!buffer) return { valid: false, reason: 'no-buffer' };

  const startIdx = buffer.findIndex(c => c._id === section.startChordId);
  const endIdx   = buffer.findIndex(c => c._id === section.endChordId);

  if (startIdx === -1) return { valid: false, reason: 'start-not-found' };
  if (endIdx === -1)   return { valid: false, reason: 'end-not-found' };
  if (startIdx > endIdx) return { valid: false, reason: 'start-after-end' };

  // 区間内の連続性（歯抜けがない）は、bufferが常に時系列順の配列であるため
  // startIdx〜endIdxのindex連続性がそのまま「連続区間」を意味する
  // （tokenの削除・並べ替えはCommand Layer側で常にbuffer配列自体を更新するため）。

  return { valid: true };
}

/**
 * reconcile — session.sections をbufferとの整合性に基づき修復する
 * （Phase100-A・Phase108でCase B対応）。
 *
 * [SCOPE] この関数が行うのは Validation + 最小限の Repair のみ。
 * 新しい境界の推測・自動生成は一切行わない。
 *
 * [COMPOUND MUTATION BOUNDARY RESOLUTION PRINCIPLE]（Phase109で確立・
 * Phase108の[BOUNDARY REMAP AUTHORITY]を発展させたもの）
 *
 * reconcile()はbuffer上の隣接関係からSectionの付け替え先を推測しない。
 * Mutation（delete/merge）が「何を削除し、その領域を何が代表するか」という
 * 事実を、呼び出し元（Command Layer）が明示的に渡さなければならない。
 *
 * [SCOPE] removedChordIds / replacement.firstChordId・lastChordId は、
 * 1つの連続したMutation blockに由来することを呼び出し元が保証する前提で
 * 成立する。非連続selectionや複数block同時Mutationにはこの判定をそのまま
 * 適用してはならない（将来そのようなMutationを扱う場合は別途設計すること）。
 *
 * Mutationの種類ごとに渡す事実が異なる（[MUTATION SEMANTICS]）:
 *   delete（消滅・N→0）: その領域を代表する新しい実体は生まれない。
 *     境界はブロック外側の生存コード（leftSurvivorId/rightSurvivorId）へ
 *     逃がすだけで良い。
 *   merge（置換・N→1）: ブロックが1つの新しいコード（replacement）に置き換わる。
 *     このコードがブロックの全領域を「代表」するため、Section境界が
 *     ブロックの一部だけでなくブロック外まで巻き込んでいないか
 *     （[SECTION EXTENT GUARD]）を確認する必要がある。
 *     replacementFirstChordId・replacementLastChordIdは同一値（生成物が1個のため）。
 *   paste（置換・N→M・Phase110）: ブロックが複数の新しいコード列に置き換わる。
 *     mergeと同じくブロックの全領域を「代表」するため[SECTION EXTENT GUARD]の
 *     対象となるが、生成物が複数個であるため、新ブロックの先頭
 *     （replacementFirstChordId）と末尾（replacementLastChordId）を別々の
 *     値として扱う必要がある（mergeはN→1のため両者が常に同一値になる特殊系）。
 *
 * 判定順序（Sectionごとに独立評価）:
 *   1. [SECTION EXTENT GUARD]
 *      replacementが存在し、かつ削除された境界が
 *      ブロックの先頭/末尾と一致しない場合（＝Section外まで
 *      巻き込んでいる場合）→ 無条件でCase C
 *   2. start・endの両方が削除された
 *      → replacementがあり範囲が完全一致
 *         → Section生存（startChordId=replacementFirstChordId、
 *           endChordId=replacementLastChordId。Phase110でstart/endを
 *           別々の値として設定可能に拡張。mergeのようにN→1の場合は
 *           両者が同一値のため実質的に従来と同じ結果になる）
 *      → それ以外（pure delete、または一致しないmerge/paste）→ Case C
 *   3. startのみ削除された
 *      → replacement.replacementFirstChordId、なければrightSurvivorIdへ
 *      → どちらも無ければCase C
 *   4. endのみ削除された
 *      → replacement.replacementLastChordId、なければleftSurvivorIdへ
 *      → どちらも無ければCase C
 *   5. どちらも削除されていない → 無変化（§4.3ケースA）
 *
 * [BEHAVIOR CHANGE]（Phase108→Phase109）
 * ・単一コードSection（start===end）の唯一のコードが削除された場合、
 *   Phase108では隣接コードへremapして生存していたが、Phase109では
 *   Section自体が削除されるようになった（区間の意味領域が完全に
 *   消滅したと判断するため）。
 * ・単一削除（旧deleteChordCommand）についても、Phase108では
 *   duration吸収先（_pickAbsorbingNeighbor()の選択）をそのまま
 *   Section境界のremap先に使っていたが、これはSection外への意図しない
 *   拡大を引き起こす潜在バグだった。Phase109でduration吸収方向と
 *   Section remap方向を分離し、修正した。
 * ・merge時、mergeブロックがSectionの意味領域を超えて外側のコードまで
 *   巻き込んでいる場合、Sectionは（部分remapではなく）削除されるように
 *   なった（[SECTION EXTENT GUARD]）。
 *
 * [BEHAVIOR CHANGE]（Phase109→Phase110）
 * ・replacement.replacementChordId（単数）を廃止し、
 *   replacementFirstChordId / replacementLastChordId（2値）へ置き換えた。
 *   旧フィールド名は互換用に残さない（呼び出し元・reconcile()内部とも
 *   新フィールドへ完全移行）。理由: 単数の実体では、Paste（N→M）で
 *   新ブロックの先頭と末尾が異なるコードになるケースを表現できないため。
 * ・start・endの両方が削除された場合の生存分岐（判定順序2参照）が、
 *   従来「両方に同一IDを代入」だったのに対し、Phase110では
 *   startChordId/endChordIdへそれぞれ別の値を代入できるようになった。
 *   Paste全体がSectionの意味領域と完全一致するケース（新ブロックの
 *   先頭〜末尾がそのままSectionの新しいstart〜endになる）に対応する。
 *
 * [INVARIANT] reconcile() は冪等（idempotent）である。
 * [INVARIANT] この関数はDOM・audio・Chart Mode runtimeに一切触れない（[SCOPE]準拠）。
 *
 * @param {object} session - analysisEditor
 * @param {{
 *   removedChordIds?: Set<string>,
 *   leftSurvivorId?: string|null,
 *   rightSurvivorId?: string|null,
 *   replacement?: {
 *     firstChordId: string,
 *     lastChordId: string,
 *     replacementFirstChordId: string,
 *     replacementLastChordId: string,
 *   },
 * }} [facts]
 */
/**
 * _evaluateSectionMutation — Mutationの事実（facts）を1つのSectionに適用した
 * 結果を計算する純粋関数（reconcile()から抽出・Phase114）。
 *
 * [SCOPE] 判定ロジック本体はここに一元化する。reconcile()（実際にsectionを
 * 更新する）と predictSectionImpact()（Phase114で追加予定。更新前に
 * 「削除されるか」だけを予測する）の両方がこの関数を呼ぶことで、
 * [SECTION EXTENT GUARD] を含む判定ロジックの二重実装を避ける。
 *
 * [INVARIANT] このコードはPhase108〜111で確立した既存reconcile()の
 * 判定ロジックをそのまま移設したものであり、挙動は変更しない（Phase114 Commit1）。
 *
 * @param {object} section
 * @param {object} facts - reconcile()と同じFacts形状
 * @param {Array|null} buffer - invariant検証対象のbuffer
 * @returns {object|null} 更新後のsection、または削除されるべき場合はnull
 */
function _evaluateSectionMutation(section, facts, buffer) {
  const { removedChordIds, leftSurvivorId, rightSurvivorId, replacement } = facts;
  if (!removedChordIds) return section;

  const startRemoved = removedChordIds.has(section.startChordId);
  const endRemoved = removedChordIds.has(section.endChordId);
  if (!startRemoved && !endRemoved) return section;

  // [SECTION EXTENT GUARD] mergeでSection外まで巻き込んでいないか
  const extendsLeft = startRemoved && replacement && replacement.firstChordId !== section.startChordId;
  const extendsRight = endRemoved && replacement && replacement.lastChordId !== section.endChordId;
  if (extendsLeft || extendsRight) return null;

  if (startRemoved && endRemoved) {
    // [Phase110] N→M（Paste）ではstart用・end用で別々のIDになりうるため、
    // 単一idではなくreplacementFirstChordId/replacementLastChordIdを
    // それぞれ独立に使う（N→1のmergeでは両者が同一値になり従来と同じ結果）。
    if (!replacement) return null;
    const newStart = replacement.replacementFirstChordId;
    const newEnd = replacement.replacementLastChordId;
    return (newStart && newEnd) ? { ...section, startChordId: newStart, endChordId: newEnd } : null;
  }
  if (startRemoved) {
    const id = replacement ? replacement.replacementFirstChordId : rightSurvivorId;
    return id ? { ...section, startChordId: id } : null;
  }
  // endRemoved
  const id = replacement ? replacement.replacementLastChordId : leftSurvivorId;
  return id ? { ...section, endChordId: id } : null;
}

export function reconcile(session, facts = {}) {
  const buffer = session.buffer;

  session.sections = session.sections
    .map(section => _evaluateSectionMutation(section, facts, buffer))
    .filter(section => section !== null)
    .filter(section => validateSectionInvariants(section, buffer).valid);
}

/**
 * getSections — Section Sessionの唯一の公開読み取りAPI（Phase100-A）。
 *
 * [SECTION SESSION CONSISTENCY INVARIANT]
 * このAPIが返すSectionコレクションは常にreconcile済みでなければならない。
 * 呼び出し側（Command Layer / Renderer / UI）はSectionの整合性修復を
 * 行ってはならない（修復責務はreconcile()のみに集約する）。
 *
 * @param {object} session - analysisEditor
 * @returns {Array} reconcile済みのsection配列
 */
export function getSections(session) {
  reconcile(session);
  return session.sections;
}
