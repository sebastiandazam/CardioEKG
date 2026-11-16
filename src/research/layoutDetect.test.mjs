import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStructure, cropsFromStructure, inferLayout, placementFromCrops } from './layoutDetect.ts';
import { analyzeSheet } from './sheet.ts';

/** Synthetic sheet: red 1/5 mm grid, header text, calibration pulses, ECG-like strokes, lead-change gaps. */
function sheet({ width = 900, height = 640, rows, columns, left = 60, right = 860, gap = 6, pulse = true, header = true, jitter = 0 }) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const put = (x, y, v = 20) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const i = (yy * width + xx) * 4; data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
  };
  const line = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let k = 0; k <= n; k++) put(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (y % 5 === 0 || x % 5 === 0) {
    const i = (y * width + x) * 4; const major = y % 25 === 0 || x % 25 === 0;
    data[i] = 235; data[i + 1] = major ? 120 : 175; data[i + 2] = major ? 120 : 175;
  }
  if (header) for (let w = 0; w < 9; w++) for (let c = 0; c < 6; c++) line(40 + w * 70 + c * 8, 22, 44 + w * 70 + c * 8, 34); // words
  rows.forEach((baseline, rowIndex) => {
    const y0 = baseline + (rowIndex % 2 ? jitter : -jitter);
    let x = left;
    if (pulse) { line(x, y0, x, y0 - 40); line(x, y0 - 40, x + 12, y0 - 40); line(x + 12, y0 - 40, x + 12, y0); x += 18; }
    const span = (right - x) / columns[rowIndex];
    for (let col = 0; col < columns[rowIndex]; col++) {
      const from = x + col * span + (col ? gap / 2 : 0), to = x + (col + 1) * span - gap / 2;
      let px = from, py = y0;
      for (let at = from; at <= to; at++) {
        const phase = (at - from) % 60;
        const dy = phase > 20 && phase < 24 ? -(phase - 20) * 9 : phase >= 24 && phase < 28 ? -(28 - phase) * 9 + 10 : phase > 38 && phase < 52 ? -8 * Math.sin((phase - 38) / 14 * Math.PI) : 0;
        line(px, py, at, y0 + dy); px = at; py = y0 + dy;
      }
    }
  });
  return { data, width, height };
}

test('reads tracing bands, ink span and calibration pulses instead of page percentages', () => {
  const s = sheet({ rows: [150, 270, 390, 530], columns: [4, 4, 4, 1], left: 110 });
  const structure = analyzeStructure(s.data, s.width, s.height);
  assert.equal(structure.bands.length, 4, 'header text is not a tracing band');
  for (const [band, y] of structure.bands.map((b, i) => [b, [150, 270, 390, 530][i]])) {
    assert.ok(band.top < y / s.height * 100 && band.bottom > y / s.height * 100);
    assert.ok(band.pulse, 'pulse found');
    assert.ok(Math.abs(band.left - 110 / s.width * 100) < 1, 'ink starts where the tracing starts');
    assert.ok(band.dataLeft > band.pulse.right, 'leads start after the pulse');
  }
  assert.equal(structure.inferredLayout, '4x3');
});

test('automatic layout: four-column gaps give 4x3, two-column six rows give 2x6', () => {
  const four = analyzeStructure(...Object.values(sheet({ rows: [150, 270, 390, 530], columns: [4, 4, 4, 1] })));
  assert.equal(four.inferredLayout, '4x3');
  const two = sheet({ height: 900, rows: [110, 230, 350, 470, 590, 710], columns: [2, 2, 2, 2, 2, 2] });
  assert.equal(analyzeStructure(two.data, two.width, two.height).inferredLayout, '2x6');
});

test('regions follow an off-centre, narrow tracing area rather than the standard template', () => {
  const s = sheet({ rows: [200, 300, 400, 520], columns: [4, 4, 4, 1], left: 300, right: 820, jitter: 8 });
  const { crops, sources } = analyzeSheet(s.data, s.width, s.height, 'auto');
  assert.ok(crops.I.left > 300 / s.width * 100, 'I begins inside the actual tracing, not at 5 % of the page');
  assert.ok(crops.V4.right <= 822 / s.width * 100 + 1);
  assert.ok(crops.aVR.left > crops.I.right - .6 && crops.V1.left > crops.aVR.right - .6);
  assert.equal(sources.I, 'ink');
  for (const [lead, y] of [['I', 192], ['II', 308], ['III', 392], ['II-long', 520]]) {
    assert.ok(crops[lead].top < y / s.height * 100 && crops[lead].bottom > y / s.height * 100, lead);
  }
});

test('printed labels anchor leads to the band and position where they are printed', () => {
  const s = sheet({ rows: [150, 270, 390, 530], columns: [4, 4, 4, 1] });
  const structure = analyzeStructure(s.data, s.width, s.height);
  const band = structure.bands[0];
  const hit = (lead, x, b) => ({ lead, confidence: 90, left: x, right: x + 2, top: structure.bands[b].top - 1, bottom: structure.bands[b].top + 1 });
  const span = band.right - band.dataLeft;
  const hits = [hit('I', band.dataLeft + .5, 0), hit('aVR', band.dataLeft + span * .27, 0), hit('II', band.dataLeft + .5, 3)];
  assert.equal(inferLayout(structure.bands, hits), '4x3');
  const result = cropsFromStructure(structure, 'auto', hits);
  assert.equal(result.sources.aVR, 'label');
  assert.ok(Math.abs(result.crops.aVR.left - (band.dataLeft + span * .27)) < .5, 'aVR starts at its printed label');
  assert.equal(result.sources['II-long'], 'label');
});

test('a user correction is learned relative to the bands and reapplied to a similar sheet', () => {
  const s = sheet({ rows: [150, 270, 390, 530], columns: [4, 4, 4, 1] });
  const structure = analyzeStructure(s.data, s.width, s.height);
  const proposed = cropsFromStructure(structure, '4x3');
  const corrected = { ...proposed.crops, V1: { ...proposed.crops.V1, left: proposed.crops.V1.left + 3 } };
  const learned = placementFromCrops(structure, '4x3', corrected);
  const shifted = sheet({ rows: [160, 280, 400, 540], columns: [4, 4, 4, 1] });
  const next = cropsFromStructure(analyzeStructure(shifted.data, shifted.width, shifted.height), '4x3', [], learned);
  assert.equal(next.sources.V1, 'learned');
  assert.ok(Math.abs(next.crops.V1.left - corrected.V1.left) < 1);
});

test('six bands without labels stay undecided instead of guessing the layout', () => {
  const s = sheet({ height: 900, rows: [110, 230, 350, 470, 590, 710], columns: [4, 4, 4, 1, 1, 1], gap: 0 });
  assert.equal(analyzeStructure(s.data, s.width, s.height).inferredLayout, null);
});

import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { locateGridSquare } from './layoutDetect.ts';

test('real Wave-Maven sheet (navy trace, blue labels and bars, red grid): rows, columns and 5 mm square', () => {
  const data = new Uint8ClampedArray(gunzipSync(readFileSync(new URL('./fixtures/wave-maven-case-1.1200x927.rgba.gz', import.meta.url))));
  const structure = analyzeStructure(data, 1200, 927);
  assert.equal(structure.bands.length, 4, 'three lead rows plus the rhythm strip');
  assert.ok(structure.bands.every(b => b.pulse), 'every row starts with its calibration pulse');
  const { crops, layout } = analyzeSheet(data, 1200, 927, 'auto');
  assert.equal(layout, '4x3');
  // Printed bars are at about 29.4 %, 51.8 % and 74.2 % of the width; rows at about 45 %, 59 %, 74 %, 86 %.
  assert.ok(Math.abs(crops.aVR.left - 29.6) < 1.2 && Math.abs(crops.V1.left - 52) < 1.2 && Math.abs(crops.V4.left - 74.4) < 1.2);
  for (const [lead, y] of [['I', 45], ['II', 59], ['III', 74], ['II-long', 86]]) assert.ok(crops[lead].top < y && crops[lead].bottom > y, lead);
  assert.ok(crops.III.bottom < crops['II-long'].top + 1, 'III is not placed on the rhythm strip');
  const square = locateGridSquare(data, 1200, 927);
  assert.ok(square, '5 mm square found');
  assert.ok(square.top > 37, 'square is on the grid, not on the header text');
  assert.ok(Math.abs((square.right - square.left) * 12 - (square.bottom - square.top) * 9.27) < 2, 'square is square in pixels');
});

import { estimateSkew, rotateRgba } from './deskew.ts';
test('a tilted sheet is measured, straightened and then read like a level one', () => {
  const s = sheet({ rows: [150, 270, 390, 530], columns: [4, 4, 4, 1] });
  assert.equal(estimateSkew(s.data, s.width, s.height), 0, 'level sheet is left alone');
  for (const tilt of [2, -3.5]) {
    const tilted = rotateRgba(s.data, s.width, s.height, tilt);
    const measured = estimateSkew(tilted, s.width, s.height);
    assert.ok(Math.abs(measured - tilt) <= .3, `tilt ${tilt} measured ${measured}`);
    const level = rotateRgba(tilted, s.width, s.height, -measured);
    const structure = analyzeStructure(level, s.width, s.height);
    assert.equal(structure.bands.length, 4);
    assert.equal(structure.inferredLayout, '4x3');
  }
  assert.equal(estimateSkew(new Uint8ClampedArray(200 * 200 * 4).fill(255), 200, 200), 0, 'blank image: no decision');
});
test('ambiguous six-band sheets are read on their bands as 4x3 and flagged, not dropped to the template', () => {
  const s = sheet({ height: 900, rows: [110, 230, 350, 470, 590, 710], columns: [4, 4, 4, 1, 1, 1], gap: 0 });
  const result = analyzeSheet(s.data, s.width, s.height, 'auto');
  assert.equal(result.layout, '4x3');
  assert.equal(result.layoutAmbiguous, true);
  assert.equal(result.sources.I, 'ink');
  assert.ok(result.rhythmDetected);
});
