// Phase148: Chart Mode コード編集モーダル — 起動経路・ビルダー・決定・追加・終了経路の回帰テスト。
// DOMを持たないNodeで、最小のDOMスタブを使って openChartChordEditModal() の実行経路を通す。
// 実ブラウザの見た目・スクロール・IME・<select>表示は、このテストでは確認できない。
// Run with Node.js 22: node scripts/test-phase148-chart-chord-modal-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BUILDER_ROOT_OPTIONS, BUILDER_TYPE_OPTIONS, BUILDER_BASS_OPTIONS, buildChordName,
} from '../js/chordBuilderCatalog.js';
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
function launch({ buffer = baseBuffer(), selectedId = 'b', confirmAnswer = true, onCommit = () => true,
  toCanonicalChord = v => v, toDisplayChord = v => v } = {}) {
  const els = setupDom();
  const calls = { opened: 0, closed: 0, confirms: 0, committed: 0 };
  let captured = null;
  const main = makeSession(buffer, selectedId);
  const mainBefore = structuredClone(main);
  openChartChordEditModal({
    openModal: opts => { calls.opened += 1; captured = opts; },
    mkMBtn: (text, cls, fn) => ({ text, cls, fn, disabled: false, className: 'mbtn ' + cls }),
    initialState: structuredClone(main),
    usedChords: ['C', 'G', 'Am'],
    toCanonicalChord, toDisplayChord,
    confirmDiscard: () => { calls.confirms += 1; return confirmAnswer; },
    onCommit: (draft, changed) => { calls.committed += 1; return onCommit(draft, changed); },
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
  const html = () => body.innerHTML;
  const btn = text => buttons.find(b => b.text === text);
  return { captured, calls, els, main, mainBefore, buttons, click, change, typeText, html, btn, body };
}

// ===== 1. モーダル起動経路 =====
{
  const h = launch();
  assert.ok(h.captured.title.includes('コード編集'));
  assert.ok(h.captured.body.includes('chart-chord-edit-body'), 'initial body must render without throwing');
  assert.ok(h.html().includes('chart-chord-builder'), 'builder section is rendered on open');
  assert.equal(h.buttons.map(b => b.text).join(','), '削除,キャンセル,完了', 'footer buttons: 削除(左)/キャンセル/完了');
  assert.ok(h.els['m-title'].children.some(el => el.textContent === '×'), '× button is added to the title');
  assert.equal(typeof h.captured.onRequestClose, 'function', 'Esc/background route is registered');
  ok('1 modal launch path runs without exception (openChartChordEditModal → renderBody → onOpen)');
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
  assert.equal(countOptions(html, 'root'), 17);
  assert.equal(countOptions(html, 'type'), 24);
  assert.equal(countOptions(html, 'bass'), 18);
  ok('2a candidates: Root 17 / Type 24 (§21.7 IDs, labels, suffixes) / Bass 17 + 指定なし');
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

// ===== 4. 「決定」：選択中チップへ適用、モーダルは閉じない、直接入力とは混同しない =====
{
  const canonicalCalls = [];
  const h = launch({ toCanonicalChord: v => { canonicalCalls.push(v); return v; } });
  h.typeText('XYZ');                       // 直接入力欄に別の値
  h.change('root', 'D'); h.change('type', 'minor7');
  assert.equal(button(h.html(), 'builder-decide').disabled, false);
  h.click('builder-decide');
  assert.match(h.html(), /data-id="b"[^>]*>Dm7<\/button>/, 'selected chip b is now Dm7');
  assert.equal(h.calls.closed, 0, '決定 must not close the modal');
  assert.equal(h.calls.committed, 0, '決定 must not commit to the session');
  assert.deepEqual(h.main.buffer, h.mainBefore.buffer, 'authoritative session untouched');
  assert.ok(h.html().includes('value="XYZ"'), 'direct-input value is not overwritten by the builder');
  assert.deepEqual(canonicalCalls, ['Dm7'], 'builder result goes through toCanonicalChord exactly once (no double capo shift)');
  // 表示欄は「画面に出すコード名」そのもの。カポ表示変換（toDisplayChord）を二重に掛けない
  const shifted = launch({ toDisplayChord: v => 'DISP:' + v });
  shifted.change('root', 'D'); shifted.change('type', 'minor7');
  assert.equal(shifted.body.querySelector('.chart-chord-builder-preview').textContent, 'Dm7');
  assert.ok(!renderChartChordEditBody(createChartChordEditController({ initialState: makeSession(baseBuffer(), 'b'), toDisplayChord: v => 'DISP:' + v }))
    .includes('preview" aria-label="生成されるコード名">DISP:'));
  // 選択チップがない場合は安全に拒否
  const ctl = createChartChordEditController({ initialState: makeSession(baseBuffer(), 'b') });
  ctl.draft.selection.chordIds = [];
  assert.equal(ctl.decide().ok, false);
  ok('4 決定: applies builder result to the selected chip, keeps modal open, direct input untouched');
}

// ===== 5. 「＋追加」：中点分割、境界違反は状態不変（既存Commandの保護） =====
{
  const h = launch();
  h.change('root', 'E'); h.change('type', 'minor');
  h.click('builder-add');
  assert.match(h.html(), /data-id="b"[^>]*>G<\/button>/);
  assert.ok(/aria-pressed="true">Em<\/button>/.test(h.html()), 'new chip Em is selected');
  const ctl = createChartChordEditController({ initialState: makeSession(baseBuffer(), 'b') });
  ctl.setBuilder('root', 'E'); ctl.setBuilder('type', 'minor');
  assert.equal(ctl.addFromBuilder().ok, true);
  assert.deepEqual(ctl.draft.buffer.map(c => [c.chord, c.start, c.end]),
    [['C', 0, 1], ['G', 1, 2], ['Em', 2, 3], ['Am', 3, 4]]);
  // 0.05秒より短い区間でも、既存Commandの条件を満たす限り分割できる（独自の最小区間長は設けない）
  const tiny = createChartChordEditController({ initialState: makeSession([{ _id: 'x', chord: 'C', start: 10, end: 10.002 }], 'x') });
  assert.equal(tiny.canSplit(), true);
  assert.equal(tiny.addFromBuilder().ok, true);
  // 中点が端点と同じになる区間（end が start の次の浮動小数点数）: ボタンは無効、直接呼んでも状態不変
  const tight = 1 + Number.EPSILON;
  assert.ok(!(((1 + tight) / 2) > 1 && ((1 + tight) / 2) < tight), 'precondition: midpoint collapses onto an endpoint');
  const edge = createChartChordEditController({ initialState: makeSession([{ _id: 'x', chord: 'C', start: 1, end: tight }, { _id: 'y', chord: 'G', start: tight, end: 5 }], 'x') });
  const before = structuredClone(edge.draft.buffer);
  assert.equal(edge.canSplit(), false);
  assert.equal(edge.addFromBuilder().ok, false);
  assert.deepEqual(edge.draft.buffer, before, 'invalid-range leaves the draft unchanged');
  assert.equal(edge.draft.history.length, 0, 'no history entry on rejection');
  assert.match(renderChartChordEditBody(edge), /data-action="builder-add" disabled/);
  // 直接入力からの追加も同じ保護
  const guard = createChartChordEditController({ initialState: makeSession([{ _id: 'x', chord: 'C', start: 1, end: tight }], 'x') });
  guard.setInput('Am');
  const beforeGuard = structuredClone(guard.draft.buffer);
  const r = guard.addFromInput();
  assert.equal(r.ok, false); assert.deepEqual(guard.draft.buffer, beforeGuard);
  assert.ok(!fs.readFileSync(new URL('../js/chartChordEditModal.js', import.meta.url), 'utf8').includes('MIN_EDIT_INTERVAL'),
    'the unapproved 0.05s threshold is removed');
  ok('5 ＋追加: midpoint split; existing Command guards boundary violations; no independent min-length constant');
}

// ===== 6. 削除・N.C.・最後の1つの保護 =====
{
  const h = launch();
  h.click('no-chord');
  assert.ok(h.els['chart-chord-edit-name'].value === 'N.C.');
  h.click('replace');
  assert.match(h.html(), /data-id="b"[^>]*>N<\/button>/, 'N.C. is stored as "N" like the existing selector');
  assert.equal(button(h.html(), 'builder-decide').disabled, false);
  const ctl = createChartChordEditController({ initialState: makeSession(baseBuffer(), 'b') });
  assert.equal(ctl.canDelete(), true);
  assert.equal(ctl.remove().ok, true);
  assert.equal(ctl.draft.buffer.length, 2);
  // 最後の1つは削除不可（ボタン無効＋Command保護）
  const single = createChartChordEditController({ initialState: makeSession([{ _id: 'o', chord: 'C', start: 0, end: 1 }], 'o') });
  assert.equal(single.canDelete(), false);
  assert.equal(single.remove().ok, false);
  assert.equal(single.draft.buffer.length, 1);
  const hDelete = launch();
  hDelete.btn('削除').fn();
  assert.equal(hDelete.html().match(/data-action="select"/g).length, 2, '削除 footer button deletes the selected chip');
  ok('6 delete / N.C. / last-chip protection');
}

// ===== 7. 完了によるUndo/Redo（1回ずつ）と、永続保存との分離 =====
{
  const main = makeSession(baseBuffer(), 'b');
  const original = structuredClone(main.buffer);
  const ctl = createChartChordEditController({ initialState: structuredClone(main) });
  ctl.setBuilder('root', 'D'); ctl.setBuilder('type', 'minor7'); ctl.decide();
  ctl.setBuilder('root', 'E'); ctl.setBuilder('type', 'minor'); ctl.addFromBuilder();
  ctl.remove();
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

// ===== 8. ×・キャンセル・Escape・背景クリック：変更有無に応じた破棄確認 =====
{
  // 変更なし: 確認なしで閉じる
  for (const route of ['cancel', 'x', 'request']) {
    const h = launch();
    if (route === 'cancel') h.btn('キャンセル').fn();
    else if (route === 'x') h.els['m-title'].children.find(el => el.textContent === '×').listeners.click[0]();
    else h.captured.onRequestClose();
    assert.equal(h.calls.confirms, 0, route + ': no confirm when unchanged');
    assert.equal(h.calls.closed, 1, route + ': closes immediately');
  }
  // 変更あり＋確認OK: 閉じ、本体は不変、onCommitは呼ばれない
  for (const route of ['cancel', 'x', 'request']) {
    const h = launch({ confirmAnswer: true });
    h.change('root', 'D'); h.click('builder-decide');
    if (route === 'cancel') h.btn('キャンセル').fn();
    else if (route === 'x') h.els['m-title'].children.find(el => el.textContent === '×').listeners.click[0]();
    else h.captured.onRequestClose();
    assert.equal(h.calls.confirms, 1, route + ': confirm shown when changed');
    assert.equal(h.calls.closed, 1);
    assert.equal(h.calls.committed, 0, route + ': nothing committed');
    assert.deepEqual(h.main, h.mainBefore, route + ': authoritative session (incl. history) unchanged');
  }
  // 変更あり＋確認キャンセル: モーダルと編集内容を維持
  for (const route of ['cancel', 'x', 'request']) {
    const h = launch({ confirmAnswer: false });
    h.change('root', 'D'); h.click('builder-decide');
    const htmlBefore = h.html();
    if (route === 'cancel') h.btn('キャンセル').fn();
    else if (route === 'x') h.els['m-title'].children.find(el => el.textContent === '×').listeners.click[0]();
    else h.captured.onRequestClose();
    assert.equal(h.calls.confirms, 1);
    assert.equal(h.calls.closed, 0, route + ': modal stays open');
    assert.equal(h.html(), htmlBefore, route + ': edits are kept');
  }
  // 変更して元に戻した場合は「変更なし」
  const back = launch();
  back.change('root', 'D'); back.click('builder-decide');
  back.change('root', 'G'); back.change('type', 'major'); back.click('builder-decide');
  back.btn('キャンセル').fn();
  assert.equal(back.calls.confirms, 0, 'final state equals baseline → no confirm');
  // Escape／背景クリックの配線（app.js）
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(/classList\.contains\('open'\)\) \{\s*requestCloseMod\(\);/.test(app), 'Escape routes through requestCloseMod');
  assert.ok(/_mOvMouseDownOnOverlay\) requestCloseMod\(\)/.test(app), 'background click routes through requestCloseMod');
  assert.ok(/onRequestClose/.test(app) && /confirm\('変更を破棄しますか？'\)/.test(app));
  ok('8 cancel / × / Escape / background: confirm only when changed; keep modal and edits when confirm is cancelled');
}

// ===== 9. 完了ボタン：整合性エラー時は閉じない／変更なしは確認なしで閉じる =====
{
  const h = launch();
  h.btn('完了').fn();
  assert.equal(h.calls.closed, 1); assert.equal(h.calls.committed, 1);
  const rejected = launch({ onCommit: () => false });
  rejected.change('root', 'D'); rejected.click('builder-decide');
  rejected.btn('完了').fn();
  assert.equal(rejected.calls.closed, 0, 'onCommit=false keeps the modal open');
  ok('9 完了: closes when unchanged; stays open when the commit is rejected');
}

console.log('Phase148 Chart Mode chord modal UI tests passed (' + passed + ' groups).');
