// End-to-end check: the Analysis Editor must refuse to start (and never rewrite) analysis data whose
// `raw.sections` has an invalid type, and must keep the data intact when a save fails.
// Runs in the real app (Playwright + server.py) on an anonymized work copy; ./analysis is never touched.
//
//   NODE_PATH=$(npm root -g) node scripts/e2e-invalid-sections-guard.mjs
//
// Cases (9): sections missing / [] / null / {} / "invalid" / 0 / false / true / existing Sections.
// Each case runs with the Section-marker display ON and OFF (the old crash moved between two render
// paths depending on this setting). Not run in CI (no browser dependency in this repo).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8767;
const PROJECT_ID = '9aeea4ec-5deb-41fe-ab17-00045378f64f';
const FIXTURE_ID = '684bb86f';
const EXISTING = [{ id: 'sec-old', type: 'verse', name: '既存', startChordId: 'c001', endChordId: 'c010' }];
const CASES = [
  { name: 'missing', value: undefined, valid: true },
  { name: 'empty-array', value: [], valid: true },
  { name: 'null', value: null, valid: false },
  { name: 'object', value: {}, valid: false },
  { name: 'string', value: 'invalid', valid: false },
  { name: 'number', value: 0, valid: false },
  { name: 'false', value: false, valid: false },
  { name: 'true', value: true, valid: false },
  { name: 'existing-sections', value: EXISTING, valid: true },
];

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures += 1;
};

// ---- temp app copy ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-e2e-sec-'));
fs.cpSync(repo, tmp, {
  recursive: true,
  filter: p => !/[\\/](\.git|archive|analysis|__pycache__|node_modules)([\\/]|$)/.test(path.relative(repo, p)),
});
fs.mkdirSync(path.join(tmp, 'analysis'));
const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/section-boundary/songs.json'), 'utf8'));
const song = fixture.songs.find(s => s.id === FIXTURE_ID);
const buildDoc = value => {
  const doc = {
    version: 1, projectId: PROJECT_ID, generatedAt: '2026-11-05T00:00:00.000Z',
    raw: {
      chords: song.chords.map((c, i) => ({ ...c, confidence: 1, _id: `c${String(i + 1).padStart(3, '0')}` })),
      beats: song.beats, downbeats: song.downbeats, timeSignature: song.timeSignature, bpm: 120, meta: {},
      provenance: { source: 'chordmini', hasContentEdit: false, hasStructureEdit: Array.isArray(value) && value.length > 0 },
    },
    repairRule: song.repairRule ?? null,
  };
  if (value !== undefined) doc.raw.sections = structuredClone(value);
  return doc;
};
const project = JSON.parse(fs.readFileSync(path.join(tmp, 'testdata/projects/test1chordscore_project.json'), 'utf8'));
project.id = PROJECT_ID; project.title = 'E2E'; project.hasAnalysis = true;
const projectFile = path.join(tmp, 'e2e_project.json');
fs.writeFileSync(projectFile, JSON.stringify(project));

const analysisFiles = () => fs.readdirSync(path.join(tmp, 'analysis')).filter(f => f.includes(PROJECT_ID) && f.endsWith('.json'));
const diskPath = () => path.join(tmp, 'analysis', analysisFiles()[0]);
const writeCase = value => {
  for (const f of analysisFiles()) fs.rmSync(path.join(tmp, 'analysis', f));
  fs.writeFileSync(path.join(tmp, 'analysis', `${PROJECT_ID}.json`), JSON.stringify(buildDoc(value)));
};
const sha = () => crypto.createHash('sha256').update(fs.readFileSync(diskPath())).digest('hex');
const readDisk = () => JSON.parse(fs.readFileSync(diskPath(), 'utf8'));
// type-exact description of a `sections` value (distinguishes absent / null / [] / other)
const describe = raw => ('sections' in raw ? JSON.stringify(raw.sections) : '<absent>');

const server = spawn('python3', ['server.py'], { cwd: tmp, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);
for (let i = 0; i < 40; i += 1) {
  try { if ((await fetch(`http://localhost:${PORT}/index.html`)).ok) break; } catch { /* not up yet */ }
  await new Promise(r => setTimeout(r, 250));
}

const browser = await chromium.launch();

/** Fresh browser context with the app opened on the song in Chart Mode. */
async function openApp(markersOn) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(on => localStorage.setItem('cs.sectionMarkers', on ? 'true' : 'false'), markersOn);
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const dialogs = [];
  const pageErrors = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForTimeout(800);
  await page.setInputFiles('#file-import-projects', projectFile);
  await page.waitForTimeout(1000);
  await page.getByText('E2E').first().click(); await page.waitForTimeout(1300);
  await page.click('#btn-chart-mode'); await page.waitForTimeout(900);
  const api = {
    page, dialogs, pageErrors, ctx,
    state: () => page.evaluate(() => { const a = window.__CS_DEBUG__.analysisEditor.state; return { active: a.active, dirty: a.dirty }; }),
    memRaw: () => page.evaluate(() => { const r = window.__CS_DEBUG__.timing.raw; return JSON.stringify({ keys: Object.keys(r), raw: r }); }),
    panel: async () => (await page.locator('#aep-save').count()) > 0,
    toast: () => page.locator('#toast').textContent(),
    begin: async () => { await page.click('#btn-analysis-edit'); await page.waitForTimeout(700); },
    deleteLastChord: async () => {
      await page.locator('.chart-slot[data-chord-id]').last().click(); await page.waitForTimeout(300);
      await page.click('#aep-delete-chord'); await page.waitForTimeout(400);
    },
  };
  return api;
}

try {
  for (const markersOn of [true, false]) {
    for (const c of CASES) {
      const label = `[${c.name} / markers ${markersOn ? 'ON' : 'OFF'}]`;
      writeCase(c.value);
      const bytes0 = sha();
      const doc0 = readDisk();
      const app = await openApp(markersOn);
      const mem0 = await app.memRaw();
      check(`${label} chart view opens without page errors`, app.pageErrors.length === 0, app.pageErrors.join(' | '));

      await app.begin();
      const st = await app.state();
      if (!c.valid) {
        // ---- invalid type: start is refused, nothing half-open, nothing changes ----
        check(`${label} edit start refused (active=false)`, st.active === false, JSON.stringify(st));
        check(`${label} no edit panel`, !(await app.panel()));
        check(`${label} explanation shown`, app.dialogs.some(m => m.includes('編集を開始できません') && m.includes('変更していません')), app.dialogs.join('|'));
        check(`${label} no page errors`, app.pageErrors.length === 0, app.pageErrors.join(' | '));
        check(`${label} memory raw unchanged`, (await app.memRaw()) === mem0);
        check(`${label} disk bytes unchanged`, sha() === bytes0);
        // clicking again must not toggle into a half state
        await app.begin();
        check(`${label} second attempt also refused cleanly`, (await app.state()).active === false && app.pageErrors.length === 0);
        check(`${label} disk bytes still unchanged`, sha() === bytes0);
      } else {
        // ---- valid: start works; cancel and failed save keep everything; save keeps `sections` exact ----
        check(`${label} edit starts`, st.active === true && (await app.panel()));
        check(`${label} no page errors`, app.pageErrors.length === 0, app.pageErrors.join(' | '));
        await app.page.click('#aep-cancel'); await app.page.waitForTimeout(500);
        check(`${label} cancel: not editing, memory raw and disk unchanged`,
          (await app.state()).active === false && (await app.memRaw()) === mem0 && sha() === bytes0);

        await app.begin();
        await app.deleteLastChord();
        check(`${label} a real edit makes the editor dirty`, (await app.state()).dirty === true);
        await app.page.route('**/save-analysis', r => r.fulfill({ status: 500, body: 'forced failure' }));
        await app.page.click('#aep-save'); await app.page.waitForTimeout(1200);
        check(`${label} failed save is reported`, /保存に失敗/.test(await app.toast() ?? ''), await app.toast());
        check(`${label} failed save: memory raw (chords and sections) unchanged`, (await app.memRaw()) === mem0);
        check(`${label} failed save: disk bytes unchanged`, sha() === bytes0);
        const afterFail = await app.state();
        check(`${label} failed save: still editing with the edit kept`, afterFail.active && afterFail.dirty);
        await app.page.unroute('**/save-analysis');
        await app.page.click('#aep-save'); await app.page.waitForTimeout(1800);
        const doc1 = readDisk();
        const expectSections = c.value === undefined ? [] : c.value;
        check(`${label} retry saves; sections ${describe(doc0.raw)} -> ${describe(doc1.raw)}`,
          JSON.stringify(doc1.raw.sections) === JSON.stringify(expectSections));
        // Deleting the last chord removes it and extends the previous chord's end time to cover it.
        const n0 = doc0.raw.chords.length;
        const keptHead = JSON.stringify(doc1.raw.chords.slice(0, -1)) === JSON.stringify(doc0.raw.chords.slice(0, n0 - 2));
        const extended = doc1.raw.chords.at(-1)._id === doc0.raw.chords[n0 - 2]._id && doc1.raw.chords.at(-1).end === doc0.raw.chords[n0 - 1].end;
        check(`${label} saved chords: last chord deleted, the rest unchanged`,
          doc1.raw.chords.length === n0 - 1 && keptHead && extended);
        const sameOthers = ['beats', 'downbeats', 'timeSignature', 'bpm', 'meta'].every(k => JSON.stringify(doc1.raw[k]) === JSON.stringify(doc0.raw[k]));
        check(`${label} other raw fields unchanged`, sameOthers);
        check(`${label} no page errors after save`, app.pageErrors.length === 0, app.pageErrors.join(' | '));
      }
      await app.ctx.close();
    }
  }

  // ---- second line of defence: the save itself refuses when the in-memory `sections` is invalid ----
  // (simulates data that became invalid after the editor had started; the live raw object is reached
  //  through the debug hook)
  for (const c of CASES.filter(x => !x.valid)) {
    const label = `[save guard / ${c.name}]`;
    writeCase([]);
    const bytes0 = sha();
    const app = await openApp(true);
    await app.begin();
    await app.deleteLastChord();
    await app.page.evaluate(v => { window.__CS_DEBUG__.timing.raw.sections = v; }, c.value);
    const mem1 = await app.memRaw();
    await app.page.click('#aep-save'); await app.page.waitForTimeout(1200);
    check(`${label} save refused with an explanation`, app.dialogs.some(m => m.includes('保存できません') && m.includes('変更していません')), app.dialogs.join('|'));
    check(`${label} invalid value not replaced in memory`, (await app.memRaw()) === mem1);
    check(`${label} disk bytes unchanged`, sha() === bytes0);
    const s2 = await app.state();
    check(`${label} editor and the edit are kept`, s2.active && s2.dirty);
    await app.ctx.close();
  }
} finally {
  await browser.close();
  stop();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failures === 0 ? 'E2E: all checks passed' : `E2E: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
