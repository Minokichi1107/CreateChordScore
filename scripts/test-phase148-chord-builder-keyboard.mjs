// Phase148 / Issue #116: Chord Builder 数字コマンド入力・Space循環・Enter決定・ショートカット抑止のテスト。
// 仕様: digit-command-input-spec v3。DOMはスタブ（実ブラウザの挙動は別途 実ブラウザ検証で確認する）。
// Run with Node.js 22: node scripts/test-phase148-chord-builder-keyboard.mjs
import assert from 'node:assert/strict';
import {
  BUILDER_ROOT_OPTIONS, BUILDER_TYPE_OPTIONS, BUILDER_BASS_OPTIONS,
  BUILDER_NOTE_NUMBER_TABLE, BUILDER_TYPE_NUMBER_TABLE,
  getBuilderNumberMap, getBuilderNumberOf, formatBuilderNumber, nextUnusedTypeNumber,
} from '../js/chordBuilderCatalog.js';
import { decideModalKey, reduceDigit, nextBuilderField } from '../js/chordBuilderKeyboard.js';
import {
  openChartChordEditModal, isChordEditModalOpen, createChartChordEditController, renderChartChordEditBody,
} from '../js/chartChordEditModal.js';
import {
  TIP_CLOSED, buildNumberTipRows, tipSections, reduceTip, computeTipPosition,
} from '../js/chordBuilderNumberTip.js';
import { createAnalysisSession, refreshSelection } from '../js/analysisSession.js';

let passed = 0;
const ok = name => { passed += 1; console.log('PASS ' + name); };

// ---------- 仕様の番号表（テスト側に独立して保持） ----------
const SPEC_NOTES = 'C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B'.split(' ');
const SPEC_TYPES = ('major major7 dominant7 sixth add9 sus4 dominant7sus4 dominant7-sharp5 dominant7-flat5 minor minor7 ' +
  'minor-major7 minor6 minor7-flat5 minor7-9 major7-9 sixth-9 dominant7-9 dominant7-sharp9 dominant7-flat9 ' +
  'dominant7-13 diminished augmented power5').split(' ');

// ===== 1. 番号表 =====
{
  for (const field of ['root', 'bass']) {
    const m = getBuilderNumberMap(field);
    assert.equal(m.size, 18);
    assert.equal(m.get(0), '');
    SPEC_NOTES.forEach((v, i) => assert.equal(m.get(i + 1), v, field + ' ' + (i + 1)));
  }
  const t = getBuilderNumberMap('type');
  assert.equal(t.size, 24);
  assert.ok(!t.has(0), 'Type 00 is invalid');
  SPEC_TYPES.forEach((id, i) => assert.equal(t.get(i + 1), id));
  // 番号表の値は、実在するカタログの値・IDだけを指す（取り違え防止）
  assert.deepEqual(BUILDER_NOTE_NUMBER_TABLE.map(([, v]) => v), BUILDER_ROOT_OPTIONS.map(o => o.value));
  assert.deepEqual(BUILDER_TYPE_NUMBER_TABLE.map(([, id]) => id).sort(), BUILDER_TYPE_OPTIONS.map(o => o.id).sort());
  assert.equal(getBuilderNumberOf('bass', 'Db'), 3);
  assert.equal(getBuilderNumberOf('type', 'minor'), 10);
  assert.equal(getBuilderNumberOf('root', ''), 0);
  assert.equal(formatBuilderNumber(3), '03');
  ok('1a number tables match spec (Root/Bass 00-17, Type 01-24, Type 00 invalid)');

  // 表示順（配列の並び）を変えても番号は不変: 番号は表から引くだけで、配列位置を使わない
  const reversed = BUILDER_TYPE_OPTIONS.slice().reverse();
  assert.equal(reversed.length, 24);
  assert.equal(getBuilderNumberOf('type', 'major'), 1);
  assert.equal(getBuilderNumberOf('type', 'power5'), 24);
  ok('1b numbers do not depend on option order');

  // 将来: 次の未使用番号。無効化した番号は再利用しない
  assert.equal(nextUnusedTypeNumber(), 25);
  assert.equal(nextUnusedTypeNumber([25, 26]), 27);
  ok('1c next Type number is unused (retired numbers not reused)');
}

// ===== 1d. 番号付きラベル（ラベル＋番号）と英字の先頭一致（R3） =====
{
  const sessionLike = { buffer: [{ _id: 'a', chord: 'C', start: 0, end: 1 }], sections: [], selection: { chordIds: ['a'], anchorChordId: 'a' } };
  const html = renderChartChordEditBody(createChartChordEditController({ initialState: structuredClone(sessionLike) }));
  const optionsOf = field => {
    const m = new RegExp('<select data-builder="' + field + '"[^>]*>(.*?)</select>').exec(html);
    return [...m[1].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(x => ({ value: x[1], text: x[2] }));
  };
  const catalogLabel = { root: v => (v === '' ? '— ルートを選択 —' : BUILDER_ROOT_OPTIONS.find(o => o.value === v).label),
    bass: v => (v === '' ? '指定なし' : BUILDER_BASS_OPTIONS.find(o => o.value === v).label),
    type: v => BUILDER_TYPE_OPTIONS.find(o => o.id === v).label };
  for (const field of ['root', 'type', 'bass']) {
    const map = getBuilderNumberMap(field);
    const opts = optionsOf(field);
    assert.equal(opts.length, map.size, field + ' option count');
    for (const o of opts) {
      const n = getBuilderNumberOf(field, o.value);
      assert.notEqual(n, null, field + ' ' + o.value);
      // 表示は「ラベル 番号」。value/ID は番号表の値のまま
      assert.equal(o.text.replace(/&#39;/g, "'"), catalogLabel[field](o.value) + ' ' + formatBuilderNumber(n));
      assert.equal(map.get(n), o.value);
    }
    // ネイティブの先頭一致（選択肢の先頭文字で照合）が、番号なしのラベルと同じ結果になる
    const first = (texts, prefix) => texts.findIndex(t => t.toLowerCase().startsWith(prefix));
    for (const prefix of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'm', 's', 'au', 'di', 'ad', '7', '—', '指']) {
      assert.equal(first(opts.map(o => o.text), prefix), first(opts.map(o => catalogLabel[field](o.value)), prefix), field + ' prefix ' + prefix);
    }
  }
  // 具体例（回帰の再現ケース）: Root `e` → E♭、Type `s` → sus4
  const rootTexts = optionsOf('root').map(o => o.text);
  assert.equal(optionsOf('root')[rootTexts.findIndex(t => t.toLowerCase().startsWith('e'))].value, 'Eb');
  const typeTexts = optionsOf('type').map(o => o.text);
  assert.equal(optionsOf('type')[typeTexts.findIndex(t => t.toLowerCase().startsWith('s'))].value, 'sus4');
  ok('1d numbered labels are "label NN" (type-ahead e->Eb, s->sus4 preserved; values/IDs unchanged)');
}

// ===== 2/3. 2桁入力・無効入力（純粋関数） =====
{
  const type = (...ds) => { let p = ''; let last; for (const d of ds) { last = reduceDigit(p, 'type', d); p = last.pending; } return last; };
  const root = (...ds) => { let p = ''; let last; for (const d of ds) { last = reduceDigit(p, 'root', d); p = last.pending; } return last; };
  assert.deepEqual(root('0'), { pending: '0', commit: null, rejected: false });   // 1桁目では確定しない
  assert.equal(root('0', '1').commit.value, 'C');
  assert.equal(root('0', '0').commit.value, '');                                  // 00 = 未選択
  assert.equal(root('1', '7').commit.value, 'B');
  assert.equal(root('1', '0').commit.value, 'Gb');
  for (const d of '23456789') assert.ok(root(d).rejected && root(d).pending === '', 'root first digit ' + d);
  for (const d of '89') assert.ok(root('1', d).rejected && root('1', d).pending === '', 'root 1' + d);
  assert.equal(type('0', '1').commit.value, 'major');
  assert.equal(type('2', '4').commit.value, 'power5');
  assert.ok(type('0', '0').rejected && type('0', '0').commit === null, 'Type 00 rejected');
  for (const d of '3456789') assert.ok(type(d).rejected, 'type first digit ' + d);
  for (const d of '56789') assert.ok(type('2', d).rejected, 'type 2' + d);
  assert.equal(reduceDigit('', 'bass', '0').pending, '0');
  assert.ok(reduceDigit('', 'other', '1').rejected);
  assert.ok(reduceDigit('', 'root', 'a').rejected);
  // 全 2 桁を総当たり: 有効なのは表にある番号だけ
  for (const field of ['root', 'type', 'bass']) {
    const map = getBuilderNumberMap(field);
    for (let n = 0; n < 100; n++) {
      const s = formatBuilderNumber(n);
      const a = reduceDigit('', field, s[0]);
      const r = a.rejected ? a : reduceDigit(a.pending, field, s[1]);
      assert.equal(!!r.commit, map.has(n), field + ' ' + s);
      if (r.commit) assert.equal(r.commit.value, map.get(n));
    }
  }
  ok('2/3 two-digit input, leading zero, rejection clears buffer (exhaustive 00-99)');
}

// ===== 4. 判定表（純粋関数） =====
{
  const base = { gateOpen: true, hasPending: false };
  const d = (key, targetKind, extra = {}) => decideModalKey({ key, code: key === ' ' ? 'Space' : '', targetKind, ...base, ...extra });
  // Space
  for (const k of ['root', 'type', 'bass']) {
    assert.deepEqual(d(' ', k), { op: 'focus-next', prevent: true, stop: true }, 'space on ' + k);
  }
  assert.deepEqual(d(' ', 'button'), { op: null, prevent: false, stop: true });      // ボタン標準作動は残す・再生は止める
  assert.deepEqual(d(' ', 'text'), { op: null, prevent: false, stop: false });       // 直接入力は妨げない
  assert.deepEqual(d(' ', 'other'), { op: null, prevent: true, stop: true });        // body等: 何もしない
  assert.deepEqual(d(' ', 'root', { shiftKey: true }), { op: null, prevent: true, stop: true }); // Shift+Space: 移動しない・再生しない
  assert.deepEqual(d(' ', 'root', { ctrlKey: true }), { op: null, prevent: true, stop: true });
  assert.deepEqual(d(' ', 'root', { repeat: true }), { op: null, prevent: true, stop: true });
  assert.deepEqual(d(' ', 'root', { isComposing: true }), { op: null, prevent: false, stop: false });
  // 数字
  assert.deepEqual(d('5', 'type'), { op: 'digit', prevent: true, stop: false });
  assert.equal(d('5', 'button').op, null);
  assert.equal(d('5', 'other').prevent, false);
  assert.equal(d('5', 'type', { ctrlKey: true }).op, null);
  assert.equal(d('5', 'type', { shiftKey: true }).op, null);
  assert.equal(d('Clear', 'type').op, null);                                          // NumLockオフ相当
  assert.equal(d('1', 'root', { isComposing: true }).op, null);
  // Enter
  assert.deepEqual(d('Enter', 'bass'), { op: 'enter', prevent: true, stop: false });
  assert.equal(d('Enter', 'button').op, null);
  assert.equal(d('Enter', 'text').prevent, false);
  assert.equal(d('Enter', 'root', { ctrlKey: true }).op, null);
  // 抑止キー（標準動作は残す）
  for (const k of ['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight']) {
    for (const kind of ['root', 'button', 'other']) assert.deepEqual(d(k, kind), { op: null, prevent: false, stop: true }, k + ' ' + kind);
    assert.deepEqual(d(k, 'text'), { op: null, prevent: false, stop: false }, k + ' in input');
  }
  for (const k of ['z', 'Z', 'y', 'x', 'v', 'V']) {
    assert.deepEqual(d(k, 'other', { ctrlKey: true }), { op: null, prevent: false, stop: true }, 'ctrl+' + k);
    assert.deepEqual(d(k, 'text', { ctrlKey: true }), { op: null, prevent: false, stop: false });
  }
  // 維持するキー
  for (const k of ['Tab', 'Escape', 'F3', 'l', 'ArrowUp', 'ArrowDown']) assert.deepEqual(d(k, 'root'), { op: null, prevent: false, stop: false }, k);
  for (const k of ['s', 'c', 'f', 'h']) assert.deepEqual(d(k, 'other', { ctrlKey: true }), { op: null, prevent: false, stop: false }, 'ctrl+' + k);
  assert.deepEqual(d('s', 'other', { altKey: true }), { op: null, prevent: false, stop: false });
  // ゲートが閉じていれば何もしない
  for (const key of [' ', '5', 'Enter', 'Delete', 'ArrowLeft']) {
    assert.deepEqual(decideModalKey({ key, code: key === ' ' ? 'Space' : '', targetKind: 'root', gateOpen: false }), { op: null, prevent: false, stop: false });
  }
  assert.equal(nextBuilderField('root'), 'type');
  assert.equal(nextBuilderField('type'), 'bass');
  assert.equal(nextBuilderField('bass'), 'root');
  ok('4 key decision table (Space / digits / Enter / suppressed keys / maintained keys / gate closed)');
}

// ===== 5. モーダル連携（DOMスタブ） =====
function makeHarness({ gateOpen = true } = {}) {
  // ゲート条件を個別に切り替えられるようにする（open クラス／本文要素の有無／本文が overlay 内か／overlay の有無）
  const gate = { cls: gateOpen, body: gateOpen, inOverlay: true, overlay: true };
  const state = { active: null };
  const mkSelect = (field, value) => ({
    tagName: 'SELECT', dataset: { builder: field }, value, focus() { state.active = this; },
  });
  const selects = { root: mkSelect('root', ''), type: mkSelect('type', 'major'), bass: mkSelect('bass', '') };
  const spans = ['root', 'type', 'bass'].map(f => ({ dataset: { pendingFor: f }, textContent: '' }));
  let bodyHtml = '';
  const bodyEl = {
    listeners: {}, dataset: {},
    // 実DOMと同様に、innerHTML を置き換えると中の要素（入力中表示）は作り直されて空になる
    get innerHTML() { return bodyHtml; },
    set innerHTML(v) { bodyHtml = v; spans.forEach(sp => { sp.textContent = ''; }); },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    appendChild() {}, setAttribute() {},
    contains: t => Object.values(selects).includes(t),
    querySelector: sel => { const m = /data-builder="(\w+)"/.exec(sel); return m ? selects[m[1]] : { disabled: false, textContent: '' }; },
    querySelectorAll: () => spans,
  };
  const overlay = { classList: { contains: c => c === 'open' && gate.cls }, contains: t => gate.inOverlay && (t === bodyEl || t.inModal === true) };
  const handlers = [];
  globalThis.window = { innerWidth: 1400, innerHeight: 850, addEventListener: (type, fn, cap) => { if (type === 'keydown') handlers.push({ fn, cap }); } };
  const tips = [];   // body に追加された TIP 要素
  const rectOf = (l, t, r, b) => ({ getBoundingClientRect: () => ({ left: l, top: t, right: r, bottom: b }) });
  globalThis.document = {
    body: { appendChild: el => { tips.push(el); el.attached = true; } },
    getElementById: id => ({ 'modal-ov': gate.overlay ? overlay : null, 'chart-chord-edit-body': gate.body ? bodyEl : null,
      'modal-box': rectOf(460, 195, 940, 655), 'm-title': { appendChild() {}, setAttribute() {} } })[id] || null,
    createElement: () => ({
      style: {}, listeners: {}, innerHTML: '', attached: false,
      addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }, setAttribute() {},
      remove() { this.attached = false; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 300, bottom: 400 }; },
    }),
  };
  const session = createAnalysisSession();
  session.active = true; session.dirty = false; session.hasContentEdit = false; session.sections = [];
  session.buffer = [{ _id: 'a', chord: 'C', start: 0, end: 1 }, { _id: 'b', chord: 'G', start: 1, end: 3 }, { _id: 'c', chord: 'Am', start: 3, end: 4 }];
  refreshSelection(session, ['b'], 'b');
  const calls = { committed: [], closed: 0 };
  let captured;
  openChartChordEditModal({
    openModal: o => { captured = o; },
    mkMBtn: (text, cls, fn) => ({ text, fn, disabled: false }),
    initialState: structuredClone(session), usedChords: [],
    onCommit: (draft, changed) => { calls.committed.push({ draft: structuredClone(draft), changed }); return true; },
    confirmDiscard: () => true,
  });
  const buttons = captured.buttons(() => { calls.closed += 1; });
  captured.onOpen();
  const press = (key, target, extra = {}) => {
    const ev = { key, code: key === ' ' ? 'Space' : '', target, ...extra, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    handlers.forEach(h => h.fn(ev));
    return ev;
  };
  // 実DOMの closest と同じく、セレクタに一致するときだけ要素を返す（ボタン操作）
  const click = (action, extra = {}) => bodyEl.listeners.click.forEach(fn => fn({
    target: { closest: sel => (sel.startsWith('button[data-action]') ? { dataset: { action, ...extra }, disabled: false } : null) },
  }));
  const changeSelect = (field, value) => bodyEl.listeners.change.forEach(fn => fn({ target: { dataset: { builder: field }, value } }));
  const typeText = value => bodyEl.listeners.input.forEach(fn => fn({ target: { id: 'chart-chord-edit-name', value } }));
  const pendingText = () => spans.map(s => s.textContent).join('|');
  return { click, changeSelect, typeText, tips, selects, spans, bodyEl, overlay, handlers, state, calls, buttons, press, pendingText, setOpen: v => { gate.cls = v; gate.body = v; }, gate, active: () => state.active };
}

{
  const h = makeHarness();
  assert.equal(h.handlers.length >= 1, true);
  assert.equal(h.handlers.every(x => x.cap === true), true, 'registered in capture phase');
  assert.equal(h.active(), h.selects.root, 'Root focused on open');
  assert.equal(isChordEditModalOpen(), true);
  ok('5a window capture handler registered; Root focused on open; gate open');

  // 復元: 起動時は G → 決定は無効。数字 0 → 3 で Root=Db
  const { root, type } = h.selects;
  const ev1 = h.press('0', root);
  assert.equal(ev1.prevented, true, 'digit stolen from native type-ahead');
  assert.equal(h.pendingText(), '0_||', 'in-progress shown at root label');
  assert.equal(root.value, '', 'first digit does not change the value');
  h.press('3', root);
  assert.equal(root.value, 'Db');
  assert.equal(h.pendingText(), '||');
  // プレビューは syncControls 経由（スタブ要素）。選択値の変更が controller に反映されたことは 決定→完了 で確認する
  ok('5b digits 0,3 -> Root Db; first digit does not confirm');

  // 無効入力: 2 は拒否・バッファクリア・値不変
  const before = root.value;
  const ev2 = h.press('2', root);
  assert.equal(root.value, before); assert.equal(h.pendingText(), '||'); assert.equal(ev2.prevented, true);
  h.press('1', root); h.press('9', root);                  // 19 は無効
  assert.equal(root.value, before); assert.equal(h.pendingText(), '||');
  ok('5c invalid digits rejected: buffer cleared, value unchanged');

  // Space 循環・入力中の桁を破棄
  h.press('1', root);
  assert.equal(h.pendingText(), '1_||');
  const sp = h.press(' ', root);
  assert.equal(h.active(), type); assert.equal(sp.prevented, true); assert.equal(sp.stopped, true);
  assert.equal(h.pendingText(), '||', 'pending discarded on Space');
  h.press(' ', type); assert.equal(h.active(), h.selects.bass);
  h.press(' ', h.selects.bass); assert.equal(h.active(), root);
  assert.equal(root.value, 'Db', 'Space never changes values');
  ok('5d Space cycle Root->Type->Bass->Root; discards pending; values unchanged');

  // Space: ボタン・body は再生へ伝えない。ボタンは標準動作を残す
  const btn = { tagName: 'BUTTON', inModal: true };
  const e1 = h.press(' ', btn); assert.equal(e1.prevented, false); assert.equal(e1.stopped, true);
  const e2 = h.press(' ', { tagName: 'BODY' }); assert.equal(e2.prevented, true); assert.equal(e2.stopped, true);
  const e3 = h.press(' ', { tagName: 'INPUT' }); assert.equal(e3.prevented, false); assert.equal(e3.stopped, false);
  const e4 = h.press(' ', root, { shiftKey: true }); assert.equal(h.active(), root); assert.equal(e4.stopped, true);
  ok('5e Space on button / body / input / Shift+Space');

  // 抑止キー
  assert.equal(h.press('Delete', { tagName: 'BODY' }).stopped, true);
  assert.equal(h.press('z', btn, { ctrlKey: true }).stopped, true);
  assert.equal(h.press('ArrowRight', root).prevented, false);
  assert.equal(h.press('Tab', root).stopped, false);
  ok('5f suppression of Delete/Ctrl+Z/arrows without preventDefault; Tab maintained');

  // フォーカス移動で破棄
  h.press('0', root); assert.equal(h.pendingText(), '0_||');
  h.bodyEl.listeners.focusout.forEach(fn => fn({}));
  assert.equal(h.pendingText(), '||');
  h.press('0', root); h.bodyEl.listeners.mousedown.forEach(fn => fn({}));
  assert.equal(h.pendingText(), '||');
  ok('5g pending digit discarded on focusout / mousedown');

  // Enter: 入力中の桁があれば破棄して決定しない
  h.press('0', root);
  const en1 = h.press('Enter', root);
  assert.equal(en1.prevented, true); assert.equal(h.pendingText(), '||');
  h.buttons[2].fn();
  assert.equal(h.calls.committed.at(-1).changed, false, 'Enter with pending digit does not decide');
  // 入力中の桁なし + 変更あり(Root=Db): 決定して Root へ
  h.state.active = type;
  const en2 = h.press('Enter', type);
  assert.equal(en2.prevented, true);
  assert.equal(h.state.active, root, 'Root focused after decide');
  h.buttons[2].fn();
  const last = h.calls.committed.at(-1);
  assert.equal(last.changed, true);
  assert.equal(last.draft.buffer.find(c => c._id === 'b').chord, 'Db');
  ok('5h Enter: pending -> discard only; otherwise decide + Root focus; preventDefault always');

  // 決定済み（変更なし）で Enter: 何もしない（canDecide 偽）・preventDefault は呼ぶ
  const n = h.calls.committed.length;
  const en3 = h.press('Enter', root);
  assert.equal(en3.prevented, true);
  h.buttons[2].fn();
  assert.equal(h.calls.committed.at(-1).draft.buffer.find(c => c._id === 'b').chord, 'Db');
  assert.ok(h.calls.committed.length >= n);
  ok('5i Enter when nothing to decide does nothing');

  // 数字入力だけでは曲データに反映しない（決定しない限り draft 不変）
  const h2 = makeHarness();
  h2.press('0', h2.selects.root); h2.press('7', h2.selects.root);
  h2.press('1', h2.selects.type); h2.press('0', h2.selects.type);
  assert.equal(h2.selects.root.value, 'E'); assert.equal(h2.selects.type.value, 'minor', 'digits really were processed');
  h2.buttons[2].fn();
  assert.equal(h2.calls.committed.at(-1).changed, false, 'digit input alone never applies to song data');
  ok('5j digit input updates builder/preview only (no draft change, hasChanges false)');

  // ゲートが閉じている: 何もしない
  const h3 = makeHarness();
  assert.ok(h3.handlers.length > 0, 'handler is installed on this window');
  h3.setOpen(false);
  for (const key of [' ', '5', 'Enter', 'Delete']) {
    const ev = h3.press(key, key === '5' || key === ' ' || key === 'Enter' ? h3.selects.root : { tagName: 'BODY' });
    assert.equal(ev.prevented, false, key + ' prevented while closed'); assert.equal(ev.stopped, false, key + ' stopped while closed');
  }
  assert.equal(h3.selects.root.value, '');
  assert.equal(isChordEditModalOpen(), false);
  ok('5k gate closed (modal closed / body element gone): nothing is handled');
}

// ===== 6. 番号表TIP =====
{
  // 6a 番号表の行は正規の番号対応表から作る（Bass は対象外）
  const labelOf = (field, v) => v + '!';
  for (const field of ['root', 'type']) {
    const rows = buildNumberTipRows(field, labelOf);
    const map = getBuilderNumberMap(field);
    assert.equal(rows.length, map.size);
    rows.forEach((r, i) => { assert.equal(Number(r.number), [...map.keys()].sort((a, b) => a - b)[i]); assert.equal(r.value, map.get(Number(r.number))); assert.equal(r.label, r.value + '!'); });
    assert.match(rows[0].number, /^\d\d$/);
  }
  assert.equal(buildNumberTipRows('root', labelOf)[0].number, '00');
  assert.equal(buildNumberTipRows('type', labelOf)[0].number, '01');
  assert.deepEqual(buildNumberTipRows('bass', labelOf), []);
  assert.deepEqual(tipSections('both'), ['root', 'type']); assert.deepEqual(tipSections('type'), ['type']); assert.deepEqual(tipSections('bass'), []);
  ok('6a tip rows come from the canonical number maps (Root 00-17, Type 01-24; Bass excluded)');

  // 6b 状態遷移
  let st = TIP_CLOSED;
  st = reduceTip(st, { type: 'hover', section: 'root' }); assert.deepEqual(st, { visible: true, pinned: false, section: 'root' });
  assert.equal(reduceTip(st, { type: 'leave-timeout' }), TIP_CLOSED);
  st = reduceTip(st, { type: 'toggle-key' }); assert.deepEqual(st, { visible: true, pinned: true, section: 'both' });
  assert.equal(reduceTip(st, { type: 'hover', section: 'type' }), st, 'hover does not replace a pinned tip');
  assert.equal(reduceTip(st, { type: 'leave-timeout' }), st, 'leaving does not close a pinned tip');
  assert.equal(reduceTip(st, { type: 'toggle-key' }), TIP_CLOSED);
  assert.equal(reduceTip(st, { type: 'escape' }), TIP_CLOSED);
  st = reduceTip(TIP_CLOSED, { type: 'click-section', section: 'type' }); assert.deepEqual(st, { visible: true, pinned: true, section: 'type' });
  assert.equal(reduceTip(st, { type: 'click-section', section: 'type' }), TIP_CLOSED);
  assert.equal(reduceTip(st, { type: 'destroy' }), TIP_CLOSED);
  ok('6b tip state transitions (hover / leave / ? / click / Escape / destroy)');

  // 6c 位置: モーダルを覆わない側を優先、画面内に収まる
  const modal = { left: 460, top: 195, right: 940, bottom: 655 };
  const anchor = { left: 490, top: 380, right: 560, bottom: 395 };
  const tip = { width: 300, height: 400 };
  assert.equal(computeTipPosition({ anchor, modal, tip, viewport: { width: 1400, height: 850 } }).placement, 'right');
  assert.equal(computeTipPosition({ anchor, modal, tip, viewport: { width: 1400, height: 850 } }).left, 948);
  assert.equal(computeTipPosition({ anchor, modal: { left: 900, top: 195, right: 1380, bottom: 655 }, tip, viewport: { width: 1400, height: 850 } }).placement, 'left');
  for (const [vw, vh] of [[1400, 850], [420, 800], [360, 740], [320, 480], [1400, 300], [200, 200]]) {
    for (const a of [anchor, { left: 10, top: 5, right: 60, bottom: 20 }, { left: 10, top: vh - 20, right: 60, bottom: vh - 5 }]) {
      const m = vw < 600 ? { left: 0, top: 100, right: vw, bottom: vh - 50 } : modal;
      const r = computeTipPosition({ anchor: a, modal: m, tip, viewport: { width: vw, height: vh } });
      const w = Math.min(tip.width, vw - 16), h = Math.min(tip.height, vh - 16);
      assert.ok(r.left >= 8 - 1e-9 && r.left + w <= vw - 8 + 1e-9, 'x in viewport ' + vw + ' ' + JSON.stringify(r));
      assert.ok(r.top >= 8 - 1e-9 && r.top + h <= vh - 8 + 1e-9, 'y in viewport ' + vh + ' ' + JSON.stringify(r));
    }
  }
  assert.equal(computeTipPosition({ anchor, modal: { left: 0, top: 100, right: 420, bottom: 750 }, tip, viewport: { width: 420, height: 800 } }).placement, 'overlay');
  ok('6c tip position: right/left of the modal when it fits; stays inside the viewport on narrow screens');

  // 6d キー判定
  const base = { gateOpen: true };
  const d = (key, targetKind, extra = {}) => decideModalKey({ key, targetKind, ...base, ...extra });
  for (const kind of ['root', 'type', 'bass', 'button', 'other']) assert.deepEqual(d('?', kind), { op: 'tip-toggle', prevent: true, stop: true }, '? on ' + kind);
  assert.deepEqual(d('?', 'text'), { op: null, prevent: false, stop: false }, '? typed in an input is not stolen');
  assert.equal(d('?', 'root', { ctrlKey: true }).op, null);
  assert.equal(d('?', 'root', { altKey: true }).op, null);
  assert.equal(d('?', 'root', { metaKey: true }).op, null);
  assert.equal(d('?', 'root', { shiftKey: true }).op, 'tip-toggle', 'Shift is required to type ?');
  assert.equal(d('?', 'root', { repeat: true }).op, null);
  assert.equal(d('?', 'root', { isComposing: true }).op, null);
  assert.equal(decideModalKey({ key: '?', targetKind: 'root', gateOpen: false }).prevent, false);
  assert.deepEqual(d('Escape', 'root', { tipOpen: true }), { op: 'tip-close', prevent: true, stop: true });
  assert.deepEqual(d('Escape', 'text', { tipOpen: true }), { op: 'tip-close', prevent: true, stop: true });
  assert.deepEqual(d('Escape', 'root', { tipOpen: false }), { op: null, prevent: false, stop: false }, 'Escape without tip is left to the modal');
  assert.equal(d('Escape', 'root', { tipOpen: true, ctrlKey: true }).op, null);
  assert.equal(decideModalKey({ key: 'Escape', targetKind: 'root', gateOpen: false, tipOpen: true }).op, null);
  ok('6d key decisions for ? and Escape (modifiers / input fields / IME / repeat / gate closed)');
}

{
  // 6e モーダル連携
  const h = makeHarness();
  const { root } = h.selects;
  const hasTip = () => h.tips.some(t => t.attached && t.style.display === 'block');
  h.press('1', root);
  const e1 = h.press('?', root);
  assert.equal(e1.prevented, true); assert.equal(e1.stopped, true);
  assert.ok(hasTip(), 'tip shown by ?');
  const el = h.tips[0];
  assert.ok(el.innerHTML.includes('data-tip-section="root"') && el.innerHTML.includes('data-tip-section="type"'), 'both tables');
  assert.ok(!el.innerHTML.includes('data-tip-section="bass"'));
  assert.ok(el.innerHTML.includes('<b>17</b><span>B</span>') && el.innerHTML.includes('<b>24</b><span>5</span>') && el.innerHTML.includes('<b>00</b><span>未選択</span>'));
  assert.equal(h.pendingText(), '1_||', 'showing the tip does not touch the pending digit');
  h.press('7', root);
  assert.equal(root.value, 'B', 'digits still work while the tip is shown (17)');
  const keep = h.press(' ', root); assert.equal(h.active(), h.selects.type, 'Space still cycles while the tip is shown');
  const esc = h.press('Escape', root);
  assert.equal(esc.stopped, true); assert.equal(esc.prevented, true); assert.ok(!hasTip(), 'Escape closes only the tip');
  assert.equal(h.calls.closed, 0, 'modal still open');
  const esc2 = h.press('Escape', root); assert.equal(esc2.stopped, false, 'Escape with no tip reaches the modal');
  h.press('?', root); h.press('?', root); assert.ok(!hasTip(), '? toggles off');
  const inp = h.press('?', { tagName: 'INPUT' }); assert.equal(inp.prevented, false); assert.ok(!hasTip(), '? in an input does nothing');
  // ホバー: 対象の欄だけ。離れて少し待つと閉じる。TIPへ移動すると維持される
  const hoverTarget = field => ({ closest: () => ({ dataset: { tipFor: field }, contains: () => false }) });
  h.bodyEl.listeners.mouseover.forEach(fn => fn({ target: hoverTarget('type') }));
  assert.ok(hasTip() && h.tips[0].innerHTML.includes('data-tip-section="type"') && !h.tips[0].innerHTML.includes('data-tip-section="root"'), 'hover shows only that table');
  h.bodyEl.listeners.mouseout.forEach(fn => fn({ target: hoverTarget('type'), relatedTarget: null }));
  h.tips[0].listeners.mouseenter.forEach(fn => fn());
  await new Promise(r => setTimeout(r, 330));
  assert.ok(hasTip(), 'moving onto the tip keeps it open');
  h.tips[0].listeners.mouseleave.forEach(fn => fn());
  await new Promise(r => setTimeout(r, 330));
  assert.ok(!hasTip(), 'closes after leaving');
  // 固定表示中はホバーが外れても閉じない
  h.press('?', root);
  h.bodyEl.listeners.mouseout.forEach(fn => fn({ target: hoverTarget('root'), relatedTarget: null }));
  await new Promise(r => setTimeout(r, 330));
  assert.ok(hasTip(), 'pinned tip survives hover-out');
  // 完了で閉じる（どの終了経路も closeCurrentModal を通る）。TIPは曲データを変えない
  h.buttons[2].fn();
  assert.ok(!hasTip() && h.tips.every(t => !t.attached), 'tip removed when the modal closes');
  assert.equal(h.calls.committed.at(-1).changed, false, 'tip/digits/Space did not change song data (only builder preview)');
  ok('6e tip wiring: ? / Escape / hover / pin / close; digits, Space and pending digit unaffected; no data change');

  const h2 = makeHarness();
  h2.press('?', h2.selects.root);
  h2.setOpen(false);
  h2.press('a', h2.selects.root);
  assert.ok(h2.tips.every(t => !t.attached), 'tip is removed when the gate has closed');
  ok('6f tip does not outlive the modal (gate closed)');
}

// ===== 7. 最終監査 M1 の補強（変異テストで「該当処理を外すと失敗する」ことを確認済みの4項目） =====
{
  // 7-1 ゲート条件は各条件が独立に検査される（open クラス／本文要素の存在／本文が overlay 内／overlay の存在）。
  //     どれか1つでも欠ければ、Space・数字・Enter・Delete・? のどれも処理せず、TIP も出さない。
  const probe = (name, mutate) => {
    const h = makeHarness();
    // 基準: すべて揃っていれば処理される（検査が常に真/偽に固定されていないことの確認）
    const live = h.press(' ', h.selects.root);
    assert.equal(live.prevented, true, name + ': baseline handled');
    h.state.active = null;
    mutate(h.gate);
    const root = h.selects.root;
    for (const [key, target] of [[' ', root], ['5', root], ['Enter', root], ['?', root], ['Delete', { tagName: 'BODY' }], ['ArrowLeft', root], ['z', root]]) {
      const ev = h.press(key, target, key === 'z' ? { ctrlKey: true } : {});
      assert.equal(ev.prevented, false, name + ': preventDefault must not run for ' + key);
      assert.equal(ev.stopped, false, name + ': propagation must not stop for ' + key);
    }
    assert.equal(h.active(), null, name + ': no focus move');
    assert.equal(root.value, '', name + ': no value change');
    assert.ok(h.tips.every(t => !t.attached || t.style.display !== 'block'), name + ': no tip');
    assert.equal(isChordEditModalOpen(), false, name + ': isChordEditModalOpen');
  };
  probe('open class missing', g => { g.cls = false; });
  probe('body element missing', g => { g.body = false; });
  probe('body outside the overlay', g => { g.inOverlay = false; });
  probe('overlay missing', g => { g.overlay = false; });
  ok('7-1 each gate condition is checked independently (open class / body element / body inside overlay / overlay)');

  // 7-2 再描画（ボタン操作・決定・追加・選択）では入力中の桁を残さない
  const h = makeHarness();
  const { root } = h.selects;
  h.press('1', root);
  assert.equal(h.pendingText(), '1_||');
  h.click('select', { id: 'a' });                       // チップ選択 → rerender（focusout なし）
  assert.equal(h.pendingText(), '||', 'display cleared by the re-render');
  h.press('7', root);                                    // 残っていれば 1+7=17 が確定してしまう
  assert.equal(root.value, '', 'a stale "1" must not combine with the next digit (17 would be B)');
  assert.equal(h.pendingText(), '||', '"7" alone is not a valid Root first digit -> rejected');
  // 同様に、決定のあとの再描画でも残らない
  h.changeSelect('root', 'D'); h.press('1', root); h.click('builder-decide');
  h.press('0', root);
  assert.equal(root.value, '', 'after 決定 the pending digit is gone ("10" would be Gb)');
  assert.equal(h.pendingText(), '0_||', 'a new first digit starts fresh');
  // 入力中の桁が残っていると Enter は「破棄だけ」になり決定されない。再描画のあとの Enter は通常どおり決定できること
  const r2 = makeHarness();
  r2.press('1', r2.selects.root);                        // 入力中の桁
  r2.click('select', { id: 'a' });                       // 再描画（チップ a = C を選択。builder は C に復元）
  r2.changeSelect('root', 'E');                          // 復元値 C から変更 → 決定が有効
  r2.press('Enter', r2.selects.root);                    // 桁が残っていれば破棄だけで終わる
  r2.buttons[2].fn();                                    // 完了
  assert.equal(r2.calls.committed.at(-1).draft.buffer.find(c => c._id === 'a').chord, 'E',
    'Enter after a re-render decides (the pending digit did not survive the re-render)');
  ok('7-2 re-render discards the pending digit (チップ選択・決定・再描画後の Enter)');

  // 7-3 入力中の桁は入力した欄のもの。別の欄の数字と合成しない（欄の照合）
  const g = makeHarness();
  g.press('1', g.selects.root);
  assert.equal(g.pendingText(), '1_||');
  g.press('0', g.selects.type);                          // focusout を経ずに別の欄へ。Root の「1」と合成すると Type 10 (minor) になる
  assert.equal(g.selects.type.value, 'major', 'Root\'s pending "1" must not combine with a digit typed in Type');
  assert.equal(g.pendingText(), '|0_|', 'Type starts its own input');
  g.press('5', g.selects.type);
  assert.equal(g.selects.type.value, 'add9', 'Type 05');
  assert.equal(g.selects.root.value, '', 'Root untouched');
  // 数字が欄以外（ボタン・body）に向いたときは入力中の桁に触れない
  g.press('1', g.selects.bass); assert.equal(g.pendingText(), '||1_');
  g.press('0', { tagName: 'BODY' }); g.press('0', { tagName: 'BUTTON', inModal: true });
  assert.equal(g.selects.bass.value, '', 'digits aimed at a button/body do not reach the field');
  assert.equal(g.pendingText(), '||1_');
  ok('7-3 pending digit belongs to the field it was typed in (no cross-field combination)');

  // 7-4 決定・＋追加が成功したら Root へフォーカスを戻す。失敗したときは動かさない（ボタン操作）
  const f = makeHarness();
  f.changeSelect('root', 'D');                           // 復元値 G から変更 → 決定が有効
  f.state.active = f.selects.type;
  f.click('builder-decide');
  assert.equal(f.active(), f.selects.root, '決定 (button) success -> Root focus');
  f.state.active = f.selects.type;
  f.click('builder-decide');                             // 変更なし → 決定は失敗（canDecide 偽）
  assert.equal(f.active(), f.selects.type, '決定 failure -> focus is not moved');
  f.changeSelect('root', 'E');
  f.state.active = f.selects.bass;
  f.click('builder-add');
  assert.equal(f.active(), f.selects.root, '＋追加 (builder) success -> Root focus');
  f.state.active = f.selects.bass;
  f.click('builder-add');                                // Root 未選択に戻っている → 失敗
  assert.equal(f.active(), f.selects.bass, '＋追加 (builder) failure -> focus is not moved');
  f.typeText('Am');
  f.state.active = f.selects.type;
  f.click('add');
  assert.equal(f.active(), f.selects.root, '＋追加 (direct input) success -> Root focus');
  f.state.active = f.selects.type;
  f.click('replace');                                    // 置換は従来どおり Root へ移さない
  assert.equal(f.active(), f.selects.type, '置換 does not move focus (existing behavior)');
  f.state.active = f.selects.type;
  f.click('select', { id: 'a' });
  assert.equal(f.active(), f.selects.type, 'chip selection does not move focus (existing behavior)');
  ok('7-4 Root regains focus after 決定 / ＋追加 (builder / direct input) success; not on failure, 置換, or chip selection');
}

delete globalThis.window; delete globalThis.document;
console.log('Phase148 Chord Builder keyboard (digit-command) tests passed (' + passed + ' groups).');
