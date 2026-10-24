// Phase148: Chord Builder restore / save-protection tests (spec: restore-protection-spec v3, T1-T8, T16-T19).
// Run with Node.js 22: node scripts/test-phase148-chord-builder-restore.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async () => ({
  ok: true,
  json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, 'resource/analysis/replacementMap.json'), 'utf8')),
});
const chords = await import('../js/chords.js');
const catalog = await import('../js/chordBuilderCatalog.js');
const modal = await import('../js/chartChordEditModal.js');
const sessionMod = await import('../js/analysisSession.js');
await chords.loadReplacementMap();
const warn = console.warn; console.warn = () => {};

const { parseChordToBuilder, buildChordName, BUILDER_ROOT_OPTIONS, BUILDER_TYPE_OPTIONS, BUILDER_BASS_OPTIONS } = catalog;
const { createChartChordEditController, renderChartChordEditBody, BUILDER_NOTICE_TEXT } = modal;
const UNSELECTED = { root: '', type: 'major', bass: '' };

// ---- helpers -------------------------------------------------------------
const funcs = capo => ({
  toDisplayChord: v => chords.toDisplayChord(chords.toReadableChord(v), capo),
  toCanonicalChord: v => chords.toCanonicalChord(v, capo),
});
// 3 chips: a(selected, `first`), b = G, c = Am
function makeSession(first, selected = 'a') {
  const s = sessionMod.createAnalysisSession();
  s.active = true;
  s.buffer = [
    { _id: 'a', chord: first, start: 0, end: 2 },
    { _id: 'b', chord: 'G', start: 2, end: 4 },
    { _id: 'c', chord: 'Am', start: 4, end: 6 },
  ];
  s.sections = [];
  sessionMod.refreshSelection(s, [selected], selected);
  return s;
}
const make = (first, capo = 0, selected = 'a') =>
  createChartChordEditController({ initialState: makeSession(first, selected), ...funcs(capo) });
const snap = c => JSON.stringify({ b: c.draft.buffer, s: c.draft.sections });
const bs = c => ({ ...c.builder });
const chipText = (c, id) => c.draft.buffer.find(x => x._id === id).chord;
const shown = (c, id) => c.toDisplayChord(chipText(c, id));

// real chord corpus: every JSON under archive/ and testdata/
const corpus = new Set();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.json')) {
      try { for (const x of JSON.parse(fs.readFileSync(p, 'utf8')).chords || []) if (typeof x === 'string' && x) corpus.add(x); } catch { /* not an analysis file */ }
    }
  }
})(path.join(ROOT, 'archive'));
(function walk(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.json')) { try { for (const x of JSON.parse(fs.readFileSync(p, 'utf8')).chords || []) if (typeof x === 'string' && x) corpus.add(x); } catch { /* skip */ } } } })(path.join(ROOT, 'testdata'));
assert.ok(corpus.size > 100, 'real corpus is loaded (' + corpus.size + ' kinds)');

let n = 0; const ok = name => console.log('PASS', name);

// ---- T1 / T16: opening (restore) and completing never changes data -----------------------------
{
  let runs = 0;
  for (let capo = 0; capo < 12; capo++) for (const chord of corpus) {
    const s = makeSession(chord);
    const c = createChartChordEditController({ initialState: s, ...funcs(capo) });
    const before = snap(c);
    let changedFlag = null;
    assert.equal(c.complete((d, changed) => { changedFlag = changed; return true; }), true);
    assert.equal(changedFlag, false, 'T1 changed=false: ' + chord + ' capo' + capo);
    assert.equal(c.hasChanges(), false);
    assert.equal(snap(c), before, 'T1 draft unchanged: ' + chord + ' capo' + capo);
    assert.equal(JSON.stringify({ b: s.buffer, s: s.sections }), before, 'T1 source session unchanged');
    runs++;
  }
  // T16: unsupported / N / empty-ish strings — selection (restore failure) never touches data
  for (const odd of ['Csus2', 'Cm7-5', 'NC', 'N.C.', 'n', '(N.C)', 'N', 'X', 'C(add9)']) {
    const c = make(odd); const before = snap(c);
    assert.equal(c.hasChanges(), false); assert.deepEqual(bs(c), UNSELECTED); assert.equal(c.baseline, null);
    assert.equal(c.notice, odd === 'N' ? 'nc' : 'unsupported', 'T16 notice for ' + odd);
    assert.equal(snap(c), before, 'T16 data unchanged ' + odd);
  }
  ok('T1/T16 open & complete never change data (' + runs + ' runs: ' + corpus.size + ' chords x capo 0-11); restore failures only set notice');
}

// ---- T2: classification -------------------------------------------------
{
  const k = x => parseChordToBuilder(x).kind;
  for (const x of ['C', 'Cm', 'Cmaj7', 'D♭m7', 'C/E', 'F♯', 'Bb/D', 'G♭maj7']) assert.equal(k(x), 'ok', x);
  assert.deepEqual(parseChordToBuilder('D♭m7'), { kind: 'ok', root: 'Db', type: parseChordToBuilder('Dbm7').type, bass: '' });
  assert.deepEqual(parseChordToBuilder('N'), { kind: 'nc' });
  for (const x of ['NC', 'N.C.', 'n', '(N.C)', '', ' ', 'Cm7-5', 'Csus2', 'C♭', 'E#', 'Cm ', ' C', 'C/', 'C/H', 'H', 'c', 'Cdim9']) {
    assert.equal(k(x), 'unsupported', 'unsupported: "' + x + '"');
  }
  assert.equal(k('N/C'), 'unsupported');
  const kinds = { ok: 0, unsupported: 0, nc: 0 };
  for (const x of corpus) kinds[k(chords.toDisplayChord(chords.toReadableChord(x), 0))]++;
  assert.ok(kinds.ok / corpus.size > 0.9, 'most real chords restore: ' + JSON.stringify(kinds));
  ok('T2 parseChordToBuilder classification (exact "N" only is nc; no alias/partial guessing) ' + JSON.stringify(kinds));
}

// ---- T3: build -> parse round trip over all combinations -------------------------
{
  let count = 0;
  const roots = BUILDER_ROOT_OPTIONS.map(o => o.value);
  const basses = BUILDER_BASS_OPTIONS.map(o => o.value);
  for (const t of BUILDER_TYPE_OPTIONS) for (const r of roots) for (const b of basses) {
    const name = buildChordName(r, t.id, b);
    assert.deepEqual(parseChordToBuilder(name), { kind: 'ok', root: r, type: t.id, bass: b }, name);
    count++;
  }
  assert.equal(count, 24 * 17 * 18 );
  ok('T3 build -> parse round trip (' + count + ' combinations incl. no-bass)');
}

// ---- T4: change detection = comparison with the restored baseline ------------------
{
  let checks = 0;
  const optionsOf = { root: BUILDER_ROOT_OPTIONS.map(o => o.value), type: BUILDER_TYPE_OPTIONS.map(t => t.id), bass: BUILDER_BASS_OPTIONS.map(o => o.value) };
  for (const chord of corpus) {
    const c0 = make(chord);
    if (c0.notice !== 'none' || !c0.baseline) continue;
    const base = { ...c0.baseline };
    assert.equal(c0.canDecide(), false, 'restored+unchanged -> decide disabled: ' + chord);
    for (const f of ['root', 'type', 'bass']) for (const v of optionsOf[f]) {
      const c = make(chord);
      c.setBuilder(f, v);
      assert.equal(c.canDecide(), v !== base[f], `${chord} ${f}=${v}`);
      c.setBuilder(f, base[f]);
      assert.equal(c.canDecide(), false, 'revert -> disabled');
      checks++;
    }
  }
  ok('T4 change detection (' + checks + ' change/revert checks, 0 mismatches)');
}

// ---- T5 / T11-style guard: decide() on an unchanged restore is a no-op -----------------
{
  for (const capo of [0, 1, 2]) for (const chord of ['C', 'Cmaj/3', 'sus4(b7)', 'Bb', 'Dmin/5', 'Bm']) {
    const c = make(chord, capo);
    if (c.notice !== 'none') continue;
    const before = snap(c);
    const r = c.decide();
    assert.equal(r.ok, false); assert.equal(snap(c), before, 'T5 no-op decide ' + chord + ' capo' + capo);
    assert.equal(c.hasChanges(), false);
  }
  const unsel = make('Csus2'); assert.equal(unsel.decide().ok, false, 'unselected root -> no-op');
  ok('T5 decide() re-checks canDecide (forced call on unchanged restore / unselected root changes nothing)');
}

// ---- T6a: capo1 stored Bm (shown A#m): restore -> Root Bb -> decide ---------------------
{
  const c = make('Bm', 1);
  assert.equal(shown(c, 'a'), 'A#m');
  assert.deepEqual(bs(c), { root: 'A#', type: 'minor', bass: '' }); assert.deepEqual(c.baseline, bs(c)); assert.equal(c.canDecide(), false);
  c.setBuilder('root', 'Bb');
  assert.equal(c.builderName(), 'Bbm'); assert.equal(c.canDecide(), true);
  assert.equal(c.decide().ok, true);
  assert.equal(chipText(c, 'a'), 'Bm', 'stored value unchanged'); assert.equal(shown(c, 'a'), 'A#m');
  assert.equal(c.hasChanges(), false);
  assert.deepEqual(bs(c), { root: 'Bb', type: 'minor', bass: '' }, 'builder keeps the chosen spelling (no re-restore)');
  assert.deepEqual(c.baseline, { root: 'Bb', type: 'minor', bass: '' }); assert.equal(c.canDecide(), false);
  assert.deepEqual(bs(make('Bm', 1)), { root: 'A#', type: 'minor', bass: '' }, 'reopening restores from the displayed name');
  ok('T6a capo1 Bm: decide keeps chosen spelling, stored value & history unchanged');
}
// ---- T6a': capo1 stored C (shown B): Type -> m, decide -------------------------------
{
  const c = make('C', 1);
  assert.deepEqual(bs(c), { root: 'B', type: 'major', bass: '' });
  c.setBuilder('type', 'minor'); assert.equal(c.canDecide(), true);
  assert.equal(c.decide().ok, true);
  assert.equal(chipText(c, 'a'), 'Cm'); assert.equal(shown(c, 'a'), 'Bm'); assert.equal(c.hasChanges(), true);
  assert.deepEqual(c.baseline, { root: 'B', type: 'minor', bass: '' }); assert.equal(c.canDecide(), false);
  ok("T6a' capo1 C -> m: stored Cm, shown Bm, hasChanges");
}
// ---- T6b: unsupported / N.C. chord (baseline=null), Root=Bb Type=m, capo1 ------------------------------
{
  for (const first of ['Csus2', 'N']) {
    const c = make(first, 1); assert.equal(c.baseline, null); assert.equal(c.canDecide(), false);
    c.setBuilder('root', 'Bb'); c.setBuilder('type', 'minor'); assert.equal(c.canDecide(), true);
    const id = c.current()._id;
    assert.equal(c.decide().ok, true);
    assert.equal(chipText(c, id), 'Bm'); assert.equal(shown(c, id), 'A#m');
    assert.deepEqual(bs(c), { root: 'Bb', type: 'minor', bass: '' }); assert.deepEqual(c.baseline, bs(c)); assert.equal(c.canDecide(), false);
  }
  ok('T6b unsupported/N.C. chord: baseline=null -> decide enabled; Bb m -> stored Bm shown A#m');
}

// ---- T7 / T17 / T18: state transitions (single chord per session; confirm = the one apply path) ------------
{
  // launch: restorable / unsupported / N
  let c = make('Cmaj7');
  assert.equal(c.notice, 'none'); assert.equal(c.canDecide(), false);
  c = make('Csus2');
  assert.equal(c.notice, 'unsupported'); assert.deepEqual(bs(c), UNSELECTED); assert.equal(c.canDecide(), false);
  c.setBuilder('root', 'D'); assert.equal(c.canDecide(), true, 'baseline null: Root chosen -> enabled');
  c = make('N'); assert.equal(c.notice, 'nc'); assert.deepEqual(bs(c), UNSELECTED); assert.equal(c.baseline, null);
  c = make('Am'); assert.equal(c.notice, 'none'); assert.deepEqual(bs(c), { root: 'A', type: 'minor', bass: '' }); assert.equal(c.canDecide(), false);
  // decide success: baseline = builder
  c.setBuilder('root', 'B'); assert.equal(c.decide().ok, true); assert.equal(c.canDecide(), false);
  assert.equal(c.hasChanges(), true);
  // direct input confirm -> restore attempt
  c.setMode('direct'); c.setInput('Dm7'); assert.equal(c.confirm().ok, true);
  assert.deepEqual(bs(c), { root: 'D', type: parseChordToBuilder('Dm7').type, bass: '' }); assert.equal(c.notice, 'none'); assert.equal(c.canDecide(), false);
  c.setInput('Csus2'); assert.equal(c.confirm().ok, true); assert.equal(c.notice, 'unsupported'); assert.deepEqual(bs(c), UNSELECTED);
  c.setInput('N.C.'); assert.equal(c.confirm().ok, true); assert.equal(chipText(c, 'a'), 'N'); assert.equal(c.notice, 'nc');
  // T18: no selection -> unselected, no notice
  c = make('C'); c.setBuilder('root', 'D');
  c.draft.selection = []; c.syncBuilderFromSelection();
  assert.deepEqual(bs(c), UNSELECTED); assert.equal(c.baseline, null); assert.equal(c.notice, 'none'); assert.equal(c.canDecide(), false);
  ok('T7/T17/T18 state transitions (launch / decide / direct confirm / N.C. / no-selection)');
}

// ---- T19: notice text & Root placeholder ------------------------------------------
{
  assert.equal(BUILDER_NOTICE_TEXT.unsupported, 'このコードはビルダー対象外です。直接入力で編集できます。');
  assert.equal(BUILDER_NOTICE_TEXT.nc, 'N.C.（コードビルダー対象外）');
  const noticeOf = html => (html.match(/data-notice="([^"]*)"[^>]*>([^<]*)</) || [])[2];
  assert.equal(noticeOf(renderChartChordEditBody(make('Csus2'))), BUILDER_NOTICE_TEXT.unsupported);
  assert.equal(noticeOf(renderChartChordEditBody(make('N'))), BUILDER_NOTICE_TEXT.nc);
  assert.equal(noticeOf(renderChartChordEditBody(make('Am'))), undefined, 'restored: no notice');
  const html = renderChartChordEditBody(make('Csus2'));
  assert.match(html, /<option value="" selected>— ルートを選択 — 00<\/option>/, 'unrestorable chord: Root placeholder selected');
  ok('T19 notice texts exact; none for restored chord; Root placeholder shown');
}
console.warn = warn;
console.log('Phase148 Chord Builder restore tests passed.');
