// Phase148: Chart Mode コード編集モーダル — 起動経路・入力方式の切替と記憶・確定（完了／N.C.）・終了経路の回帰テスト。
// DOMを持たないNodeで、最小のDOMスタブを使って openChartChordEditModal() の実行経路を通す。
// 実ブラウザの見た目・スクロール・IME・<select>表示は、このテストでは確認できない。
// Run with Node.js 22: node scripts/test-phase148-chart-chord-modal-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BUILDER_ROOT_OPTIONS, BUILDER_TYPE_OPTIONS, BUILDER_BASS_OPTIONS, buildChordName,
} from '../js/chordBuilderCatalog.js';
import { clampTranslate, attachModalDrag } from '../js/chordModalDrag.js';
import {
  openChartChordEditModal, createChartChordEditController, renderChartChordEditBody,
  commitChartChordEditDraft,
} from '../js/chartChordEditModal.js';
import { createAnalysisSession, refreshSelection, undoBuffer, redoBuffer } from '../js/analysisSession.js';

// ---------- 承認済み仕様（テスト側に独立して保持） ----------
const APPROVED_ROOTS = ['C', 'C♯', 'D♭', 'D', 'D♯', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'G♯', 'A♭', 'A', 'A♯', 'B♭', 'B'];
// 設計書 §21.7（内部ID, 表示名, 生成suffix）
const APPROVED_TYPES = [
  ['major', '(なし)', ''], ['major7', 'Maj7', 'maj7'], ['dominant7', '7', '7'], ['sixth', '6', '6'],
  ['add9', 'add9', 'add9'], ['sus4', 'sus4', 'sus4'], ['dominant7sus4', '7sus4', '7sus4'],
  ['dominant7-sharp5', '7(#5)', '7(#5)'], ['dominant7-flat5', '7(b5)', '7(b5)'], ['minor', 'm', 'm'],
  ['minor7', 'm7', 'm7'], ['minor-major7', 'mM7', 'mM7'], ['minor6', 'm6', 'm6'],
  ['minor7-flat5', 'm7(b5)', 'm7(b5)'], ['minor7-9', 'm7(9)', 'm7(9)'], ['major7-9', 'M7(9)', 'M7(9)'],
  ['sixth-9', '6(9)', '6(9)'], ['dominant7-9', '7(9)', '7(9)'], ['dominant7-sharp9', '7(s9)', '7(s9)'],
  ['dominant7-flat9', '7(b9)', '7(b9)'], ['dominant7-13', '7(13)', '7(13)'], ['diminished', 'dim', 'dim'],
  ['augmented', 'aug', 'aug'], ['power5', '5', '5'],
];
let passed = 0;
const ok = name => { passed += 1; console.log('PASS ' + name); };

// ---------- 最小のDOMスタブ ----------
function makeElement(id = '') {
  return {
    id, children: [], listeners: {}, dataset: {}, attrs: {}, className: '', textContent: '', value: '',
    _inner: '', disabled: false, stubs: {},
    get innerHTML() { return this._inner; },
    set innerHTML(v) { this._inner = v; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(k, v) { this.attrs[k] = v; },
    focus() {},
    querySelector(selector) { return (this.stubs[selector] ||= makeElement(selector)); },
  };
}

function setupDom() {
  const els = { 'chart-chord-edit-body': makeElement('chart-chord-edit-body'), 'm-title': makeElement('m-title'),
    'chart-chord-edit-name': makeElement('chart-chord-edit-name') };
  globalThis.document = {
    getElementById: id => els[id] || null,
    createElement: tag => { const el = makeElement(); el.tag = tag; return el; },
  };
  return els;
}

function button(html, action) {
  const match = new RegExp('<button[^>]*data-action="' + action + '"[^>]*>').exec(html);
  assert.ok(match, 'button ' + action + ' must exist');
  return { present: true, disabled: /\sdisabled(\s|>)/.test(match[0]) };
}
function countOptions(html, field) {
  const match = new RegExp('<select data-builder="' + field + '"[^>]*>(.*?)</select>').exec(html);
  assert.ok(match, 'select ' + field);
  return (match[1].match(/<option /g) || []).length;
}

function makeSession(buffer, selectedId) {
  const s = createAnalysisSession();
  s.active = true; s.buffer = structuredClone(buffer); s.sections = []; s.hasContentEdit = false; s.dirty = false;
  refreshSelection(s, [selectedId], selectedId);
  return s;
}
const baseBuffer = () => [
  { _id: 'a', chord: 'C', start: 0, end: 1 }, { _id: 'b', chord: 'G', start: 1, end: 3 },
  { _id: 'c', chord: 'Am', start: 3, end: 4 },
];

// モーダルを開いて、onOpen まで実行するハーネス
function launch({ buffer = baseBuffer(), selectedId = 'b', onCommit = () => true,
  toCanonicalChord = v => v, toDisplayChord = v => v, loadInputMode, saveInputMode } = {}) {
  const els = setupDom();
  const calls = { opened: 0, closed: 0, confirms: 0, committed: 0, drafts: [] };
  let captured = null;
  const main = makeSession(buffer, selectedId);
  const mainBefore = structuredClone(main);
  openChartChordEditModal({
    openModal: opts => { calls.opened += 1; captured = opts; },
    mkMBtn: (text, cls, fn) => ({ text, cls, fn, disabled: false, className: 'mbtn ' + cls }),
    initialState: structuredClone(main),
    ...(loadInputMode ? { loadInputMode } : {}), ...(saveInputMode ? { saveInputMode } : {}),
    toCanonicalChord, toDisplayChord,
    onCommit: (draft, changed) => { calls.committed += 1; calls.drafts.push({ chordB: chordOf(draft), changed }); return onCommit(draft, changed); },
  });
  assert.equal(calls.opened, 1, 'openModal must be called');
  const buttons = captured.buttons(() => { calls.closed += 1; });
  captured.onOpen();
  const body = els['chart-chord-edit-body'];
  const click = (action, extra = {}) => {
    const target = { closest: () => ({ dataset: { action, ...extra }, disabled: false }) };
    body.listeners.click.forEach(fn => fn({ target }));
  };
  const change = (field, value) => body.listeners.change.forEach(fn => fn({ target: { dataset: { builder: field }, value } }));
  const typeText = value => body.listeners.input.forEach(fn => fn({ target: { id: 'chart-chord-edit-name', value } }));
  const chordOf = (draft, id = selectedId) => draft.buffer.find(c => c._id === id).chord;
  const html = () => body.innerHTML;
  const btn = text => buttons.find(b => b.text === text);
  return { captured, calls, els, main, mainBefore, buttons, click, change, typeText, html, btn, body };
}

// ===== 1. モーダル起動経路 =====
{
  const h = launch();
  assert.equal(h.captured.title, 'コード編集', 'plain title (no prototype label)');
  assert.ok(h.captured.body.includes('chart-chord-edit-body'), 'initial body must render without throwing');
  assert.ok(h.html().includes('chart-chord-builder'), 'builder is the default input method');
  assert.ok(!h.html().includes('chart-chord-edit-name'), 'direct input is not shown at the same time');
  assert.equal(h.buttons.map(b => b.text).join(','), 'キャンセル,完了', 'footer buttons: キャンセル/完了 only');
  assert.ok(h.els['m-title'].children.some(el => el.textContent === '×'), '× button is added to the title');
  assert.equal(typeof h.captured.onRequestClose, 'function', 'Esc/background route is registered');
  ok('1 modal launch path runs without exception; builder is shown by default; footer is キャンセル/完了');
}

// ===== 2. 候補一覧（Root17 / Type24 / Bass17+指定なし） =====
{
  assert.deepEqual(BUILDER_ROOT_OPTIONS.map(o => o.label), APPROVED_ROOTS);
  for (const banned of ['B♯', 'C♭', 'E♯', 'F♭', 'C𝄪', 'C𝄫']) {
    assert.ok(!BUILDER_ROOT_OPTIONS.some(o => o.label === banned), banned + ' must not be a candidate');
  }
  assert.deepEqual(BUILDER_BASS_OPTIONS.map(o => o.label), ['指定なし'].concat(APPROVED_ROOTS));
  assert.equal(BUILDER_BASS_OPTIONS[0].value, '');
  assert.deepEqual(BUILDER_TYPE_OPTIONS.map(o => [o.id, o.label, o.suffix]), APPROVED_TYPES);
  const html = launch().html();
  // 仕様変更（restore-protection-spec v3 §E-2）: UI の Root は先頭に「— ルートを選択 —」を足した 18。カタログ定数は 17 のまま（上で検査済み）。
  assert.equal(countOptions(html, 'root'), 18);
  assert.match(html, /<select data-builder="root"[^>]*><option value="">— ルートを選択 — 00<\/option>/); // 番号付きラベル（digit-command spec v3 §2.4）。先頭の項目（この起動では G を復元済みなので選択はされない）
  assert.equal(countOptions(html, 'type'), 24);
  assert.equal(countOptions(html, 'bass'), 18);
  ok('2a candidates: Root 17 (+ placeholder = 18 in UI) / Type 24 (§21.7 IDs, labels, suffixes) / Bass 17 + 指定なし');
}

// ===== 3. コード名の生成 =====
{
  assert.equal(buildChordName('C#', 'major7', 'Eb'), 'C#maj7/Eb');
  assert.equal(buildChordName('C', 'major', ''), 'C');
  assert.equal(buildChordName('B', 'minor7-flat5', ''), 'Bm7(b5)');
  assert.equal(buildChordName('', 'major', ''), '');
  assert.equal(buildChordName('C', 'unknown-type', ''), '');
  let count = 0;
  for (const root of BUILDER_ROOT_OPTIONS) for (const type of BUILDER_TYPE_OPTIONS) {
    for (const bass of BUILDER_BASS_OPTIONS) {
      const name = buildChordName(root.value, type.id, bass.value);
      assert.equal(name, root.value + type.suffix + (bass.value ? '/' + bass.value : ''));
      assert.match(name, /^[\x20-\x7E]+$/, 'generated names are ASCII (B1 is still open: single mapping point)');
      assert.equal((name.match(/\//g) || []).length, bass.value ? 1 : 0);
      count += 1;
    }
  }
  assert.equal(count, 17 * 24 * 18);
  // 画面の表示欄はビルダー選択値に同期する
  const h = launch();
  h.change('root', 'D'); h.change('type', 'minor7'); h.change('bass', 'A');
  assert.equal(h.body.querySelector('.chart-chord-builder-preview').textContent, 'Dm7/A');
  ok('3 builder name generation (7,344 combinations) and preview sync');
}

// ===== 4. 完了（ビルダー）: 入力を適用して確定し、閉じる。Enter と同じ確定処理 =====
{
  const canonicalCalls = [];
  const h = launch({ toCanonicalChord: v => { canonicalCalls.push(v); return v; } });
  h.change('root', 'D'); h.change('type', 'minor7');
  assert.deepEqual(h.main.buffer, h.mainBefore.buffer, 'changing the builder alone never touches the session');
  h.btn('完了').fn();
  assert.equal(h.calls.closed, 1, '完了 closes'); assert.equal(h.calls.committed, 1);
  assert.deepEqual(h.calls.drafts, [{ chordB: 'Dm7', changed: true }], 'builder result is applied to the selected chord');
  assert.deepEqual(canonicalCalls, ['Dm7'], 'builder result goes through toCanonicalChord exactly once (no double capo shift)');
  // 変更なし: 確認なし・コミット対象なしで閉じる
  const same = launch(); same.btn('完了').fn();
  assert.deepEqual(same.calls.drafts, [{ chordB: 'G', changed: false }]); assert.equal(same.calls.closed, 1);
  // 表示欄は「画面に出すコード名」そのもの。カポ表示変換（toDisplayChord）を二重に掛けない
  const shifted = launch({ toDisplayChord: v => 'DISP:' + v });
  shifted.change('root', 'D'); shifted.change('type', 'minor7');
  assert.equal(shifted.body.querySelector('.chart-chord-builder-preview').textContent, 'Dm7');
  // Root 未選択（復元できない既存コード）は確定せず、理由を表示して閉じない
  const unsel = launch({ buffer: [{ _id: 'a', chord: 'Csus2', start: 0, end: 1 }], selectedId: 'a' });
  unsel.btn('完了').fn();
  assert.equal(unsel.calls.closed, 0); assert.equal(unsel.calls.committed, 0);
  assert.match(unsel.html(), /id="chart-chord-edit-hint"[^>]*>ルート音を選択してください。/);
  ok('4 完了 (builder): applies once, one commit, closes; unchanged → no change; unselected Root → hint, stays open');
}

// ===== 5. 入力方式: 既定 builder / 保存値の復元 / 切替と記憶 / 曲データへ混入しない =====
{
  assert.ok(launch().html().includes('data-builder="root"'), 'default = builder');
  const direct = launch({ loadInputMode: () => 'direct' });
  assert.ok(direct.html().includes('id="chart-chord-edit-name"') && !direct.html().includes('data-builder="root"'), 'saved direct: only direct input is shown');
  for (const bad of ['foo', '', null, undefined, 42]) assert.ok(launch({ loadInputMode: () => bad }).html().includes('data-builder="root"'), 'invalid saved value → builder: ' + String(bad));
  assert.ok(launch({ loadInputMode: () => { throw new Error('storage blocked'); } }).html().includes('data-builder="root"'), 'read failure → builder');
  // 切替: 選んだ方式だけを表示し、保存関数を方式の値で1回呼ぶ
  const saves = [];
  const h = launch({ saveInputMode: m => saves.push(m) });
  h.click('mode', { mode: 'direct' });
  assert.ok(h.html().includes('id="chart-chord-edit-name"') && !h.html().includes('data-builder="root"'));
  assert.deepEqual(saves, ['direct']);
  h.click('mode', { mode: 'direct' }); assert.deepEqual(saves, ['direct'], 'same mode again: no save');
  h.click('mode', { mode: 'builder' });
  assert.ok(h.html().includes('data-builder="root"') && !h.html().includes('id="chart-chord-edit-name"')); assert.deepEqual(saves, ['direct', 'builder']);
  assert.equal((h.html().match(/aria-pressed="true"/g) || []).length, 1, 'exactly one mode is active');
  // 保存に失敗しても編集は続けられる
  const failing = launch({ saveInputMode: () => { throw new Error('quota'); } });
  failing.click('mode', { mode: 'direct' });
  assert.ok(failing.html().includes('id="chart-chord-edit-name"'));
  // 切替は曲データ・変更判定に影響しない（UI設定）
  const sw = launch(); sw.click('mode', { mode: 'direct' }); sw.click('mode', { mode: 'builder' });
  assert.deepEqual(sw.main, sw.mainBefore); sw.btn('キャンセル').fn();
  assert.equal(sw.calls.confirms, 0, 'switching the method alone is not a data change');
  // app.js: 設定キー・失敗時の安全処理。曲データ側へ書かない
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("'cs.chordEditInputMode'"));
  const loader = app.slice(app.indexOf('function loadChordEditInputMode'), app.indexOf('function saveChordEditInputMode'));
  assert.match(loader, /try\s*\{[\s\S]*catch/); assert.match(loader, /=== 'direct' \? 'direct' : 'builder'/);
  assert.ok(app.includes('loadInputMode: loadChordEditInputMode') && app.includes('saveInputMode: saveChordEditInputMode'));
  ok('5 input method: default builder; saved value restored (invalid/blocked → builder); switch saves once; failures harmless; no data change');
}

// ===== 6. 直接入力の確定 / N.C.（両方式から同じ確定処理） =====
{
  const direct = opts => launch({ loadInputMode: () => 'direct', ...opts });
  let h = direct(); h.typeText('Am7'); h.btn('完了').fn();
  assert.deepEqual(h.calls.drafts, [{ chordB: 'Am7', changed: true }]); assert.equal(h.calls.closed, 1);
  // 空欄・不正入力は確定せず、理由を表示（onCommitは呼ばれない）
  for (const [text, msg] of [['', 'コード名を入力してください。'], ['   ', 'コード名を入力してください。'], ['xyz', 'コード名として認識できません'], ['am', 'コード名として認識できません'], ['H7', 'コード名として認識できません']]) {
    h = direct(); h.typeText(text); h.btn('完了').fn();
    assert.equal(h.calls.closed, 0, 'stays open: "' + text + '"'); assert.equal(h.calls.committed, 0);
    assert.ok(h.html().includes(msg), 'hint for "' + text + '"');
    assert.deepEqual(h.main, h.mainBefore);
  }
  // ビルダーが作れる名前（括弧を含む型）は直接入力でも有効。括弧を含む未対応の名前は無効
  for (const text of ['F#m7(b5)', 'C7(#5)', 'Dbm7(9)/F', 'C6(9)']) { h = direct(); h.typeText(text); h.btn('完了').fn(); assert.deepEqual(h.calls.drafts, [{ chordB: text, changed: true }], 'valid: ' + text); }
  h = direct(); h.typeText('C(add9)'); h.btn('完了').fn(); assert.equal(h.calls.closed, 0, 'unsupported parenthesised name is rejected'); assert.ok(h.html().includes('認識できません'));
  // 元の表示のまま（変更なし）は適用せず閉じる（カポ等の再計算で保存値を動かさない）
  const capoCalls = [];
  h = direct({ toCanonicalChord: v => { capoCalls.push(v); return v + '#'; }, toDisplayChord: v => v });
  h.btn('完了').fn();
  assert.deepEqual(capoCalls, [], 'unchanged text is not re-canonicalised'); assert.deepEqual(h.calls.drafts, [{ chordB: 'G', changed: false }]);
  // 直接入力で N.C.（各種表記）→ 'N'
  for (const text of ['N', 'NC', 'N.C.', '(N.C)']) { h = direct(); h.typeText(text); h.btn('完了').fn(); assert.deepEqual(h.calls.drafts, [{ chordB: 'N', changed: true }], text); }
  // N.C. ボタンは両方式にあり、確定して閉じる（保存値 'N'。toCanonicalChord を通さない＝カポ二重適用なし）
  for (const mode of ['builder', 'direct']) {
    const cc = []; h = launch({ loadInputMode: () => mode, toCanonicalChord: v => { cc.push(v); return v; } });
    assert.ok(/data-action="no-chord"/.test(h.html()), mode + ': N.C. button exists');
    h.click('no-chord');
    assert.deepEqual(h.calls.drafts, [{ chordB: 'N', changed: true }], mode); assert.equal(h.calls.closed, 1); assert.deepEqual(cc, [], mode + ': no capo shift for N');
  }
  // 既に N.C. のコードで N.C. ボタン: 変更なし
  h = launch({ buffer: [{ _id: 'b', chord: 'N', start: 0, end: 1 }] }); h.click('no-chord');
  assert.deepEqual(h.calls.drafts, [{ chordB: 'N', changed: false }]);
  // 本体が拒否したら閉じない
  h = direct({ onCommit: () => false }); h.typeText('Em'); h.btn('完了').fn();
  assert.equal(h.calls.closed, 0);
  ok('6 direct input confirm: valid → commit; empty/invalid → hint, stays open; unchanged → no re-canonicalise; N.C. from both methods → "N"');
}

// ===== 7. 完了によるUndo/Redo（1回ずつ）と、永続保存との分離 =====
{
  const main = makeSession(baseBuffer(), 'b');
  const original = structuredClone(main.buffer);
  const ctl = createChartChordEditController({ initialState: structuredClone(main) });
  ctl.setBuilder('root', 'D'); ctl.setBuilder('type', 'minor7');
  assert.equal(ctl.confirm().ok, true);
  assert.equal(ctl.complete((draft, changed) => { assert.equal(changed, true); return commitChartChordEditDraft(main, draft) || true; }), true);
  assert.equal(main.history.length, 1, 'one Undo entry for the whole modal');
  assert.equal(main.dirty, true);
  const after = structuredClone(main.buffer);
  assert.equal(undoBuffer(main), true); assert.deepEqual(main.buffer, original);
  assert.equal(redoBuffer(main), true); assert.deepEqual(main.buffer, after);
  // 完了は永続保存ではない: app.js の onCommit は保存系を呼ばない
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const entry = app.slice(app.indexOf('function openChartChordEditSession'), app.indexOf('function shiftSelectedBoundary') > 0 ? app.indexOf('shiftSelectedBoundary — ') : undefined);
  assert.ok(entry.includes('commitChartChordEditDraft'));
  assert.ok(!/saveAnalysisEdit|saveProject|persist|localStorage|indexedDB/i.test(entry), 'commit path does not save');
  ok('7 完了 = one Undo/Redo unit; commit path is separated from persistent save');
}

// ===== 8. ×・キャンセル・Escape・背景クリック：確認なしで閉じ、未確定の入力は破棄（本体へは何も渡さない） =====
// 作業用コピーに未確定の変更が残る状況（「完了」を本体が拒否してモーダルが開いたまま）でも同じ。
{
  const routes = h => ({
    cancel: () => h.btn('キャンセル').fn(),
    x: () => h.els['m-title'].children.find(el => el.textContent === '×').listeners.click[0](),
    request: () => h.captured.onRequestClose(),
  });
  const confirmCalls = []; const savedConfirm = globalThis.confirm; globalThis.confirm = m => { confirmCalls.push(m); return false; };
  for (const route of ['cancel', 'x', 'request']) {
    // 変更なし
    let h = launch(); routes(h)[route]();
    assert.equal(h.calls.closed, 1, route + ': closes'); assert.equal(h.calls.committed, 0);
    // 未確定の入力あり（ビルダーを動かしただけ）
    h = launch(); h.change('root', 'D'); h.change('type', 'minor7'); routes(h)[route]();
    assert.equal(h.calls.closed, 1, route + ': closes without asking'); assert.equal(h.calls.committed, 0, route + ': nothing committed');
    assert.deepEqual(h.main, h.mainBefore, route + ': authoritative session (incl. history) unchanged');
    // 作業用コピーに変更が残っている（本体が確定を拒否した）状態でも、確認なしで閉じて何も反映しない
    h = launch({ onCommit: () => false }); h.change('root', 'D'); h.btn('完了').fn(); assert.equal(h.calls.closed, 0);
    routes(h)[route]();
    assert.equal(h.calls.closed, 1); assert.deepEqual(h.main, h.mainBefore, route + ': draft change never reaches the session');
  }
  assert.deepEqual(confirmCalls, [], 'no confirm dialog on any cancel route');
  globalThis.confirm = savedConfirm;
  // Escape／背景クリックの配線（app.js）と、このモーダルに破棄確認の仕組みが残っていないこと
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(/classList\.contains\('open'\)\) \{\s*requestCloseMod\(\);/.test(app), 'Escape routes through requestCloseMod');
  assert.ok(/_mOvMouseDownOnOverlay\) requestCloseMod\(\)/.test(app), 'background click routes through requestCloseMod');
  assert.ok(/onRequestClose/.test(app));
  const entry = app.slice(app.indexOf('function openChartChordEditSession'), app.indexOf('function shiftSelectedBoundary'));
  assert.ok(!entry.includes('confirmDiscard') && !entry.includes('confirm('), 'app.js passes no discard confirmation to the modal');
  const src = fs.readFileSync(new URL('../js/chartChordEditModal.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('confirmDiscard') && !src.includes('DISCARD_MESSAGE') && !/(^|[^.\w])confirm\(/.test(src) && !/(globalThis|window)\.confirm/.test(src), 'modal source has no discard confirmation (c.confirm is the apply step, not a dialog)');
  ok('8 cancel / × / Escape / background: close immediately without a dialog; unconfirmed input is discarded; nothing reaches the session');
}

// ===== 9. 完了ボタン：整合性エラー時は閉じない／変更なしは確認なしで閉じる =====
{
  const h = launch(); h.btn('完了').fn();
  assert.equal(h.calls.closed, 1); assert.equal(h.calls.committed, 1);
  const rejected = launch({ onCommit: () => false });
  rejected.change('root', 'D'); rejected.btn('完了').fn();
  assert.equal(rejected.calls.closed, 0, 'onCommit=false keeps the modal open');
  ok('9 完了: closes when unchanged; stays open when the commit is rejected');
}

// ===== 10. 除去した機能が残っていない（コード列・使用中・削除・決定・時間分割） =====
{
  for (const mode of ['builder', 'direct']) {
    const html = launch({ loadInputMode: () => mode }).html();
    for (const gone of ['chart-chord-edit-chip', 'chart-chord-edit-sequence', 'chart-chord-edit-used', 'data-action="select"', 'data-action="use"',
      'data-action="builder-decide"', 'data-action="builder-add"', 'data-action="add"', 'data-action="replace"', '＋追加', '置換', '決定', '分割', '使用中', '削除']) {
      assert.ok(!html.includes(gone), mode + ': "' + gone + '" must not be rendered');
    }
  }
  const src = fs.readFileSync(new URL('../js/chartChordEditModal.js', import.meta.url), 'utf8');
  for (const gone of ['addChordCommand', 'deleteChordCommand', 'canSplit', 'midpointOf', 'addAtMidpoint', 'addFromBuilder', 'addFromInput', 'replaceWithInput', 'usedChords', 'c.remove', 'c.select =']) {
    assert.ok(!src.includes(gone), 'source must not contain ' + gone);
  }
  assert.ok(!/chart-chord-edit-(chip|sequence|used|delete)|edit-actions/.test(fs.readFileSync(new URL('../css/modal.css', import.meta.url), 'utf8')), 'removed CSS is gone');
  ok('10 removed features are gone: chip row / used chords / 削除 / 決定 / 置換 / ＋追加 (time split) — HTML, source and CSS');
}

// ===== 11. タイトル領域のドラッグ移動（一時的な表示位置のみ。曲データ・Undo・保存には触れない） =====
{
  // 11a 画面内への収め方（純粋関数）
  const vp = { width: 1280, height: 800 }, size = { width: 480, height: 250 }, base = { left: 400, top: 275 };
  const cl = (x, y) => clampTranslate({ t: { x, y }, base, size, viewport: vp });
  assert.deepEqual(cl(0, 0), { x: 0, y: 0 });
  assert.deepEqual(cl(100, -50), { x: 100, y: -50 });
  assert.deepEqual(cl(-9999, -9999), { x: -400, y: -275 }, 'left/top edges stay on screen');
  assert.deepEqual(cl(9999, 9999), { x: 1280 - 480 - 400, y: 800 - 250 - 275 }, 'right/bottom edges stay on screen');
  const huge = clampTranslate({ t: { x: 50, y: 50 }, base: { left: -10, top: -10 }, size: { width: 2000, height: 2000 }, viewport: vp });
  assert.ok(Number.isFinite(huge.x) && Number.isFinite(huge.y), 'a box larger than the viewport does not break the clamp');

  // 11b ポインタ操作（スタブ）
  const mk = () => {
    const handle = { listeners: {}, captured: new Set(),
      addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); },
      setPointerCapture(id) { this.captured.add(id); }, releasePointerCapture(id) { this.captured.delete(id); } };
    const cls = new Set();
    const box = { style: { transform: '' }, classList: { add: c => cls.add(c), remove: c => cls.delete(c) },
      getBoundingClientRect() {
        const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(this.style.transform || ''); const tx = m ? +m[1] : 0, ty = m ? +m[2] : 0;
        return { left: 400 + tx, top: 275 + ty, right: 880 + tx, bottom: 525 + ty };
      } };
    const win = { innerWidth: 1280, innerHeight: 800, listeners: {}, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); } };
    return { handle, box, win, cls };
  };
  const fire = (o, type, ev) => (o.handle.listeners[type] || []).forEach(f => f({ pointerId: 1, pointerType: 'mouse', button: 0, target: { closest: () => null }, ...ev, preventDefault() { ev.prevented = true; } }));
  const t = o => o.box.style.transform;
  {
    const o = mk(); let started = 0; const e0 = {};
    const d = attachModalDrag({ handle: o.handle, box: o.box, win: o.win, onStart: () => { started += 1; } });
    Object.assign(e0, { clientX: 500, clientY: 290 }); fire(o, 'pointerdown', e0); assert.equal(e0.prevented, true, 'pointerdown on the title is consumed (no text selection / focus change)');
    assert.equal(started, 1); assert.ok(o.cls.has('is-dragging')); assert.ok(o.handle.captured.has(1), 'pointer captured');
    fire(o, 'pointermove', { clientX: 500, clientY: 290 }); assert.equal(t(o), '', 'no jump at drag start (zero movement keeps the position)');
    fire(o, 'pointermove', { clientX: 620, clientY: 340 }); assert.equal(t(o), 'translate(120px, 50px)', 'moves by the pointer delta');
    fire(o, 'pointermove', { clientX: 9999, clientY: 9999 }); assert.deepEqual(d.translate(), { x: 400, y: 275 }, 'dragging far away keeps the box fully on screen');
    fire(o, 'pointerup', { clientX: 9999, clientY: 9999 }); assert.ok(!o.cls.has('is-dragging')); assert.ok(!o.handle.captured.has(1), 'capture released');
    const before = t(o); fire(o, 'pointermove', { clientX: 10, clientY: 10 }); assert.equal(t(o), before, 'after release, moving the pointer does not drag');
    // 2回目のドラッグ: 前回の位置から続き、開始時に飛ばない
    fire(o, 'pointerdown', { clientX: 700, clientY: 400 }); fire(o, 'pointermove', { clientX: 690, clientY: 390 });
    assert.deepEqual(d.translate(), { x: 390, y: 265 }, 'second drag continues from the previous position'); fire(o, 'pointercancel', {});
    assert.ok(!o.cls.has('is-dragging'), 'pointercancel ends the drag');
    // リサイズ: 小さい画面へ → 画面内へ再調整
    o.win.innerWidth = 700; o.win.innerHeight = 500; o.win.listeners.resize.forEach(f => f());
    assert.deepEqual(d.translate(), { x: 700 - 480 - 400, y: 500 - 250 - 275 }, 'a smaller window pulls the box back on screen');
    d.destroy(); assert.equal(t(o), '', 'destroy returns the box to the centre'); assert.deepEqual(Object.values(o.handle.listeners).flat(), [], 'handlers removed'); assert.deepEqual(o.win.listeners.resize, []);
  }
  {   // 取っ手でない操作・無効時・別ポインタ・主ボタン以外はドラッグにしない
    const o = mk(); const d = attachModalDrag({ handle: o.handle, box: o.box, win: o.win, enabled: () => o.on !== false });
    for (const el of ['button', 'input', 'select', 'textarea']) {
      fire(o, 'pointerdown', { clientX: 500, clientY: 290, target: { closest: sel => (sel.includes(el) ? {} : null) } });
      fire(o, 'pointermove', { clientX: 600, clientY: 300 }); assert.equal(t(o), '', el + ' press is not a drag');
    }
    fire(o, 'pointerdown', { clientX: 500, clientY: 290, button: 2 }); fire(o, 'pointermove', { clientX: 600, clientY: 300 }); assert.equal(t(o), '', 'right button is not a drag');
    o.on = false; fire(o, 'pointerdown', { clientX: 500, clientY: 290 }); fire(o, 'pointermove', { clientX: 600, clientY: 300 }); assert.equal(t(o), '', 'disabled (modal closed)'); o.on = true;
    fire(o, 'pointerdown', { clientX: 500, clientY: 290, pointerId: 7 }); fire(o, 'pointermove', { clientX: 600, clientY: 300, pointerId: 8 }); assert.equal(t(o), '', 'other pointer is ignored');
    fire(o, 'lostpointercapture', { pointerId: 7 }); assert.ok(!o.cls.has('is-dragging'), 'lostpointercapture ends the drag');
    d.reset(); assert.equal(t(o), '');
    // 新しい取っ手を付けると古い処理は外れる（共有の枠に残さない）
    const o2 = mk(); attachModalDrag({ handle: o2.handle, box: o2.box, win: o2.win });
    assert.deepEqual(Object.values(o.handle.listeners).flat(), [], 'previous handle detached');
  }
  // 11c モーダルへの接続: 開くと取っ手が付き、閉じると外れる。ドラッグは本体セッションに触れない
  {
    const h = launch();
    const modalSrc = fs.readFileSync(new URL('../js/chartChordEditModal.js', import.meta.url), 'utf8');
    assert.ok(/attachModalDrag\(\{ handle: titleEl, box: boxEl/.test(modalSrc) && /dragCtl\.destroy\(\)/.test(modalSrc));
    const dragSrc = fs.readFileSync(new URL('../js/chordModalDrag.js', import.meta.url), 'utf8');
    assert.ok(!/import /.test(dragSrc), 'drag module has no dependency on session / data modules');
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(dragSrc), 'position is never persisted');
    assert.deepEqual(h.main, h.mainBefore);
  }
  ok('11 drag move: clamp / no jump at start / release ends / non-handle presses ignored / resize re-clamps / detaches on close / no data or storage access');
}

console.log('Phase148 Chart Mode chord modal UI tests passed (' + passed + ' groups).');
