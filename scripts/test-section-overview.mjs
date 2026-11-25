/**
 * Phase150 Stage2 — Section overview projection tests
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTimingModel } from '../js/timing.js';
import {
  buildSectionOverview,
  canMergeWithPrevious,
  diffSections,
  formatSectionBeatValue,
} from '../js/sectionOverview.js';

const buffer = (n = 12, startOffset = 0) => Array.from({ length: n }, (_, i) => ({
  _id: `k${i}`,
  chord: ['C', 'G', 'Am', 'F'][i % 4],
  start: startOffset + i,
  end: startOffset + i + 1,
}));
const S = (id, s, e, type = 'verse', name = id) => ({
  id, type, name, startChordId: `k${s}`, endChordId: `k${e}`,
});
const timingFor = (beats, measures) => ({
  beats,
  measures,
  isPickup: false,
  model: {
    getContinuousMeasurePosition(time) {
      let measureIndex = measures.findIndex(m => time >= m.startTime && time < m.endTime);
      if (measureIndex < 0) measureIndex = time < measures[0].startTime ? 0 : measures.length - 1;
      return { measureIndex, position: 0 };
    },
  },
});
const regularMeasures = [
  { startTime: 0, endTime: 4 },
  { startTime: 4, endTime: 8 },
  { startTime: 8, endTime: 12 },
];
const regularTiming = timingFor(
  Array.from({ length: 12 }, (_, i) => i),
  regularMeasures,
);

{
  const b = buffer();
  const draft = { sections: [S('long', 4, 11), S('short', 0, 3)] };
  const before = structuredClone(draft);
  const result = buildSectionOverview(draft, b, regularTiming);
  assert.deepEqual(result.rows.map(row => row.id), ['short', 'long'], 'rows are chronological copies');
  assert.equal(result.invalidRows.length, 0);
  assert.equal(result.rows[0].real.totalBeats, 4);
  assert.equal(result.rows[0].view.lengthLabel, '1小節・4拍');
  assert.equal(result.rows[0].view.startLabel, '小節1・1拍目');
  assert.equal(result.rows[0].view.secondsLabel, '約4秒');
  assert.equal(result.rows[1].real.totalBeats, 8);
  assert.equal(result.rows[1].view.lengthLabel, '約2小節・8拍');
  assert.equal(result.rows[0].compare.groupKey, 'verse');
  assert.equal(result.rows[0].compare.ratio, 0.5);
  assert.equal(result.rows[1].compare.ratio, 1);
  assert.deepEqual(draft, before, 'projection must not mutate Draft');
}

{
  const b = buffer();
  const draft = { sections: [S('partial', 1, 4)] };
  const result = buildSectionOverview(draft, b, regularTiming);
  assert.equal(result.rows[0].real.totalBeats, 4);
  assert.equal(result.rows[0].real.measures.leadBeats, 3);
  assert.equal(result.rows[0].real.measures.fullMeasures, 0);
  assert.equal(result.rows[0].real.measures.tailBeats, 1);
  assert.equal(result.rows[0].view.lengthLabel, '4拍');
  assert.equal(result.rows[0].view.lengthSub, '（頭3拍＋末尾1拍）');
}

{
  const b = buffer();
  b[0].start = 0.1;
  const draft = { sections: [S('snapped', 0, 1)] };
  const result = buildSectionOverview(draft, b, regularTiming);
  assert.equal(result.rows[0].view.startLabel, '小節1・1拍目', '0.1 beat from barline snaps for display');
  assert.equal(result.rows[0].real.tStart, 0.1, 'display snap must not alter real time');
  assert.equal(result.rows[0].real.bStart, 0.1, 'display snap must not alter real beat coordinate');
}

{
  const b = buffer(8);
  const overlap = buildSectionOverview(
    { sections: [S('a', 0, 3), S('b', 2, 5)] },
    b,
    timingFor(Array.from({ length: 8 }, (_, i) => i), [
      { startTime: 0, endTime: 4 }, { startTime: 4, endTime: 8 },
    ]),
  );
  assert.equal(overlap.rows[0].status, 'overlap');
  assert.equal(overlap.rows[1].status, 'overlap');

  const gap = buildSectionOverview(
    { sections: [S('a', 0, 1), S('b', 3, 5)] },
    b,
    timingFor(Array.from({ length: 8 }, (_, i) => i), [
      { startTime: 0, endTime: 4 }, { startTime: 4, endTime: 8 },
    ]),
  );
  assert.equal(gap.rows[0].status, 'gap-after');
}

{
  const b = buffer(8);
  const result = buildSectionOverview(
    { sections: [S('valid', 0, 3), { ...S('invalid', 4, 5), startChordId: 'missing' }] },
    b,
    regularTiming,
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.invalidRows.length, 1);
  assert.equal(result.invalidRows[0].status, 'invalid');
  assert.equal(result.invalidRows[0].view.lengthLabel, '—');
}

{
  const b = buffer(8);
  const draft = { sections: [S('a', 0, 1), S('b', 2, 7)] };
  assert.deepEqual(canMergeWithPrevious(draft, b, 'a'), { ok: false, reason: 'no-prev' });
  assert.deepEqual(canMergeWithPrevious(draft, b, 'b'), { ok: true, prevId: 'a' });

  const gapDraft = { sections: [S('a', 0, 1), S('b', 3, 7)] };
  assert.deepEqual(canMergeWithPrevious(gapDraft, b, 'b'), { ok: false, reason: 'gap' });

  const overlapDraft = { sections: [S('a', 0, 4), S('b', 3, 7)] };
  assert.deepEqual(canMergeWithPrevious(overlapDraft, b, 'b'), { ok: false, reason: 'overlap' });
}

{
  const before = [
    S('a', 0, 1, 'verse', 'A'),
    S('b', 2, 3, 'chorus', 'B'),
  ];
  const after = [
    S('a', 0, 2, 'verse', 'A'),
    S('c', 3, 3, 'chorus', 'C'),
  ];
  assert.deepEqual(diffSections(before, after), {
    added: ['c'],
    changed: ['a'],
    removed: ['b'],
  });
}

{
  assert.equal(formatSectionBeatValue(4.8), '4と4/5');
  assert.equal(formatSectionBeatValue(0.97), '1');
  assert.equal(formatSectionBeatValue(0.03), '0');
  assert.equal(formatSectionBeatValue(0.225), '1/4', 'equal-distance tie prefers smaller denominator');
}

{
  const b = buffer(4);
  const timing = timingFor([0, 0, 1], [{ startTime: 0, endTime: 4 }]);
  const result = buildSectionOverview({ sections: [S('no-beats', 0, 3)] }, b, timing);
  assert.equal(result.rows[0].real.totalBeats, null);
  assert.equal(result.rows[0].view.lengthLabel, '—');
  assert.equal(result.rows[0].view.secondsLabel, '約4秒', 'seconds remain available without valid beat mapping');
}

// Real anonymized song fixtures: 11 songs / 117 human-labelled Section ranges.
{
  const fixtureUrl = new URL('./fixtures/section-boundary/songs.json', import.meta.url);
  const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  let checkedSections = 0;

  for (const song of fixture.songs) {
    const [numerator, denominator] = song.timeSignature.split('/').map(Number);
    const model = createTimingModel({
      beats: song.beats,
      downbeats: song.downbeats,
      timeSignature: { numerator, denominator },
      resolutionPerBeat: 2,
      quantizeMode: 'nearest',
      anticipationWindow: 0.5,
      audioDuration: song.chords.at(-1)?.end ?? null,
      repairRule: song.repairRule ?? null,
    });
    const measures = Array.from({ length: model.measureCount }, (_, index) => ({
      ...model.getMeasure(index),
      index,
    }));
    const buffer = song.chords.map((chord, index) => ({
      ...chord,
      _id: `${song.id}-c${index}`,
    }));
    const starts = song.sectionStartChordIndices;
    const sections = starts.map((startIdx, index) => {
      const endIdx = index + 1 < starts.length ? starts[index + 1] - 1 : buffer.length - 1;
      return {
        id: `${song.id}-s${index}`,
        type: 'verse',
        name: `Section ${index + 1}`,
        startChordId: buffer[startIdx]._id,
        endChordId: buffer[endIdx]._id,
      };
    });
    const draft = { sections };
    const before = structuredClone(draft);
    const result = buildSectionOverview(draft, buffer, {
      model,
      measures,
      beats: song.beats,
    });

    assert.equal(result.rows.length, sections.length, `${song.id}: all labelled Sections projected`);
    assert.equal(result.invalidRows.length, 0, `${song.id}: fixture Section ranges are structurally valid`);
    for (const row of result.rows) {
      assert.ok(Number.isFinite(row.real.seconds) && row.real.seconds > 0, `${song.id}/${row.id}: positive duration`);
      assert.ok(Number.isFinite(row.real.bStart), `${song.id}/${row.id}: start beat coordinate`);
      assert.ok(Number.isFinite(row.real.bEnd), `${song.id}/${row.id}: end beat coordinate`);
      assert.ok(Number.isFinite(row.real.totalBeats) && row.real.totalBeats > 0, `${song.id}/${row.id}: positive total beats`);
      checkedSections++;
    }
    assert.deepEqual(draft, before, `${song.id}: projection is read-only`);
  }

  assert.equal(fixture.songs.length, 11);
  assert.equal(checkedSections, 117);
  console.log(`real fixture projection: ${fixture.songs.length} songs / ${checkedSections} Sections: ok`);
}

console.log('test-section-overview: ok');
