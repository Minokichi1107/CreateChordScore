// End-to-end check of Section auto-generation in the real app (Playwright + server.py).
//
// Covers what the Node unit tests cannot: apply -> Undo/Redo in the UI, save failure
// (the save request is forced to fail), retry, reload, and editing generated Sections with
// the existing edit features. Not run in CI (no browser dependency in this repo).
//
//   NODE_PATH=$(npm root -g) node scripts/e2e-section-auto-generation.mjs
//
// It copies the repository to a temp directory (never touches ./analysis), writes one analysis
// file built from the anonymized fixture, and starts server.py there (port 8767 must be free).
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

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures += 1;
};

// ---- temp app copy + analysis file from the fixture ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-e2e-'));
fs.cpSync(repo, tmp, {
  recursive: true,
  filter: p => !/[\\/](\.git|archive|analysis|__pycache__|node_modules)([\\/]|$)/.test(path.relative(repo, p)),
});
fs.mkdirSync(path.join(tmp, 'analysis'));
const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/section-boundary/songs.json'), 'utf8'));
const song = fixture.songs.find(s => s.id === FIXTURE_ID);
const analysisDoc = {
  version: 1,
  projectId: PROJECT_ID,
  generatedAt: '2026-11-05T00:00:00.000Z',
  raw: {
    chords: song.chords.map((c, i) => ({ ...c, confidence: 1, _id: `c${String(i + 1).padStart(3, '0')}` })),
    beats: song.beats, downbeats: song.downbeats, timeSignature: song.timeSignature, bpm: 120, meta: {},
    provenance: { source: 'chordmini', hasContentEdit: false, hasStructureEdit: false },
    sections: [],
  },
  repairRule: song.repairRule ?? null,
};
const analysisPath = path.join(tmp, 'analysis', `${PROJECT_ID}.json`);
// VARIANT: sections state of the file under test (default 'empty').
//   missing = no `sections` property (older data) | empty = [] | nonarray = "oops" | existing = one Section
const VARIANT = process.env.E2E_SECTIONS ?? 'empty';
if (VARIANT === 'missing') delete analysisDoc.raw.sections;
else if (VARIANT === 'nonarray') analysisDoc.raw.sections = 'oops';
else if (VARIANT === 'existing') {
  analysisDoc.raw.sections = [{ id: 'sec-old', type: 'verse', name: '既存', startChordId: 'c001', endChordId: 'c010' }];
  analysisDoc.raw.provenance.hasStructureEdit = true;
}
fs.writeFileSync(analysisPath, JSON.stringify(analysisDoc));
const diskBytes = () => fs.readFileSync(analysisPath);
const initialBytes = diskBytes();
const project = JSON.parse(fs.readFileSync(path.join(tmp, 'testdata/projects/test1chordscore_project.json'), 'utf8'));
project.id = PROJECT_ID; project.title = 'E2E'; project.hasAnalysis = true;
const projectFile = path.join(tmp, 'e2e_project.json');
fs.writeFileSync(projectFile, JSON.stringify(project));

const readDisk = () => {
  const name = fs.readdirSync(path.join(tmp, 'analysis')).find(f => f.includes(PROJECT_ID) && f.endsWith('.json'));
  return JSON.parse(fs.readFileSync(path.join(tmp, 'analysis', name), 'utf8'));
};
const sectionsOf = doc => (Array.isArray(doc.raw.sections) ? doc.raw.sections : []);
const integrity = doc => {
  const idx = new Map(doc.raw.chords.map((c, i) => [c._id, i]));
  return sectionsOf(doc).every(s => idx.has(s.startChordId) && idx.has(s.endChordId) && idx.get(s.startChordId) <= idx.get(s.endChordId));
};

const server = spawn('python3', ['server.py'], { cwd: tmp, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);
for (let i = 0; i < 40; i += 1) {
  try { if ((await fetch(`http://localhost:${PORT}/index.html`)).ok) break; } catch { /* not up yet */ }
  await new Promise(r => setTimeout(r, 250));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on('dialog', d => d.accept());
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  const chips = () => page.locator('#section-bar .sec-chip').count();
  const chipNames = () => page.locator('#section-bar .sec-chip-name').allTextContents();
  const toastText = () => page.locator('#toast').textContent();
  const openEditor = async () => {
    await page.getByText('E2E').first().click();
    await page.waitForTimeout(1500);
    await page.click('#btn-chart-mode');
    await page.waitForTimeout(1000);
    await page.click('#btn-analysis-edit');
    await page.waitForTimeout(600);
  };

  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForTimeout(1000);
  await page.setInputFiles('#file-import-projects', projectFile);
  await page.waitForTimeout(1200);
  await openEditor();

  const UNUSABLE = VARIANT === 'nonarray' || VARIANT === 'existing';
  if (UNUSABLE) {
    // Not eligible: the button must be unusable (or refuse) and the file must stay byte-identical.
    // A non-array `sections` is refused when the editor tries to start (canBeginAnalysisEdit /
    // evaluateAnalysisEditStart; details in scripts/e2e-invalid-sections-guard.mjs), so the button
    // normally does not exist. Either way nothing may change on disk.
    const btn = page.locator('#sec-autogen-btn');
    const present = (await btn.count()) > 0;
    const disabled = present ? await btn.isDisabled() : true;
    if (present && !disabled) { await btn.click(); await page.waitForTimeout(1200); }
    if (!present) console.log(`NOTE ${VARIANT}: editor did not open (refused): ${pageErrors.join(' | ')}`);
    check(`${VARIANT}: auto-generation is not available`, disabled || (await page.locator('.sag-row').count()) === 0);
    if (present && !disabled) check(`${VARIANT}: a clear refusal message is shown`, /自動生成できません|対象外/.test(await toastText() ?? ''), await toastText());
    check(`${VARIANT}: no Section was added`, (VARIANT === 'existing' ? (await chips()) === 1 : (await page.locator('#sec-autogen-btn').count()) === 0 || (await chips()) === 0));
    check(`${VARIANT}: disk bytes unchanged`, diskBytes().equals(initialBytes));
    if (VARIANT !== 'nonarray') check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    throw Object.assign(new Error('done'), { early: true });
  }

  // 0. preview only: showing and discarding candidates must not touch the source of truth
  check(`${VARIANT}: starts with no Sections`, (await chips()) === 0);
  await page.click('#sec-autogen-btn');
  await page.waitForTimeout(1000);
  check('candidates are shown', (await page.locator('.sag-row').count()) > 1);
  check('disk bytes unchanged while candidates are shown', diskBytes().equals(initialBytes));
  await page.locator('.mbtn:not(.ok)').first().click(); await page.waitForTimeout(500);
  check('discarding candidates adds no Section', (await chips()) === 0);
  check('disk bytes unchanged after discarding', diskBytes().equals(initialBytes));

  // 1. generate + adopt
  await page.click('#sec-autogen-btn');
  await page.waitForTimeout(1000);
  const rows = await page.locator('.sag-row').count();
  await page.click('.mbtn.ok');
  await page.waitForTimeout(1200);
  const generated = await chips();
  check('adopt applies every candidate', generated === rows && generated > 1, `rows=${rows} chips=${generated}`);
  check('disk bytes untouched before saving', diskBytes().equals(initialBytes));

  // 2. Undo / Redo of the whole set
  await page.click('#aep-undo'); await page.waitForTimeout(400);
  check('Undo removes the whole set', (await chips()) === 0);
  await page.getByText('やり直し').first().click(); await page.waitForTimeout(400);
  check('Redo restores the whole set', (await chips()) === generated);

  // 3. save failure keeps edit mode and content; retry succeeds
  await page.route('**/save-analysis', route => route.fulfill({ status: 500, body: 'forced failure' }));
  await page.click('#aep-save'); await page.waitForTimeout(1500);
  check('save failure is reported', /保存に失敗/.test(await toastText() ?? ''), await toastText());
  check('edit mode and Sections survive a failed save', (await chips()) === generated && await page.locator('#aep-save').count() === 1);
  check('disk bytes unchanged after a failed save', diskBytes().equals(initialBytes));
  await page.unroute('**/save-analysis');
  await page.click('#aep-save'); await page.waitForTimeout(2000);
  const saved = readDisk();
  check('retry saves all Sections', saved.raw.sections.length === generated && integrity(saved), `disk=${saved.raw.sections.length}`);
  check('structure flag is set', saved.raw.provenance.hasStructureEdit === true);
  check('saved file now has a sections array', Array.isArray(saved.raw.sections));
  check('chords were not altered by the save', JSON.stringify(saved.raw.chords) === JSON.stringify(JSON.parse(initialBytes.toString()).raw.chords));

  // 4. reload: same Sections come back
  await page.reload(); await page.waitForTimeout(1500);
  await openEditor();
  const afterReload = readDisk();
  check('Sections identical after reload (disk)', JSON.stringify(afterReload.raw.sections) === JSON.stringify(saved.raw.sections));
  check('Sections shown after reload', (await chips()) === generated);
  check('names shown after reload match disk', JSON.stringify(await chipNames()) === JSON.stringify(saved.raw.sections.map(s => s.name)));
  check('auto-generate is disabled when Sections exist', await page.locator('#sec-autogen-btn').isDisabled());

  // 5. edit generated Sections with the existing features, then Undo/Redo and save
  await page.locator('.sec-chip-menu-btn').nth(1).click();
  await page.locator('.sec-chip-menu-item[data-action="rename"]').nth(1).click();
  await page.fill('#sec-rename-name-in', 'Aメロ(E2E)');
  await page.locator('.mbtn.ok').click(); await page.waitForTimeout(600);
  check('rename works on a generated Section', (await chipNames())[1] === 'Aメロ(E2E)');
  await page.locator('.sec-chip-menu-btn').nth(1).click(); await page.waitForTimeout(200);
  const stepper = page.locator('.sec-boundary-btn[data-side="end"][data-dir="-1"]').nth(1);
  const stepperUsable = !(await stepper.isDisabled());
  check('boundary stepper is usable on a generated Section', stepperUsable);
  if (stepperUsable) { await stepper.click(); await page.waitForTimeout(400); }
  await page.click('#aep-undo'); await page.waitForTimeout(300);
  if (stepperUsable) { await page.click('#aep-undo'); await page.waitForTimeout(300); }
  check('Undo reverts the edits to generated Sections', (await chipNames())[1] === saved.raw.sections[1].name);
  await page.getByText('やり直し').first().click(); await page.waitForTimeout(300);
  if (stepperUsable) { await page.getByText('やり直し').first().click(); await page.waitForTimeout(300); }
  check('Redo re-applies the edits', (await chipNames())[1] === 'Aメロ(E2E)');
  await page.click('#aep-save'); await page.waitForTimeout(2000);
  const edited = readDisk();
  check('edited Sections saved and consistent', edited.raw.sections.length === generated && integrity(edited)
    && edited.raw.sections[1].name === 'Aメロ(E2E)');
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (e) {
  if (!e.early) { console.log('FAIL unexpected error', e); failures += 1; }
} finally {
  await browser.close();
  stop();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failures === 0 ? 'E2E: all checks passed' : `E2E: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
