import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestSheetCrops } from './sheet.ts';

test('whole ECG proposals cover all leads, remain in bounds and separate columns', () => {
  for (const layout of ['4x3', '2x6']) {
    const crops = suggestSheetCrops(new Uint8ClampedArray(400 * 300 * 4).fill(255), 400, 300, layout);
    assert.equal(Object.keys(crops).length, 13);
    for (const crop of Object.values(crops)) {
      assert.ok(crop.left >= 0 && crop.right <= 100 && crop.left < crop.right);
      assert.ok(crop.top >= 0 && crop.bottom <= 100 && crop.top < crop.bottom);
    }
    assert.ok(crops.I.right < (layout === '4x3' ? crops.aVR : crops.V1).left);
    assert.ok(crops.I.bottom < crops.II.top);
  }
});

test('ink projection follows shifted trace rows and ignores red grid', () => {
  const width = 400, height = 300;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (y % 6 === 0 || x % 6 === 0) { data[i] = 220; data[i + 1] = 70; data[i + 2] = 70; }
    if ([60, 130, 205].includes(y) && x > 20 && x < 380) data.fill(20, i, i + 3);
  }
  const crops = suggestSheetCrops(data, width, height, '4x3');
  for (const [lead, y] of [['I', 60], ['II', 130], ['III', 205]]) {
    assert.ok(Math.abs((crops[lead].top + crops[lead].bottom) / 2 - y / height * 100) < 1);
  }
});

test('locates tracing rows below a large blank header instead of cropping empty paper', () => {
  const width = 600, height = 600;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const y of [260, 350, 440, 530]) for (let x = 35; x < 570; x++) {
    const at = (y * width + x) * 4;
    data.fill(25, at, at + 3);
  }
  const crops = suggestSheetCrops(data, width, height, '4x3');
  for (const [lead, y] of [['I', 260], ['II', 350], ['III', 440], ['II-long', 530]]) {
    assert.ok(crops[lead].top < y / 6 && crops[lead].bottom > y / 6, `${lead} must include its trace`);
  }
  assert.ok(crops.I.top > 30, 'exclude the empty header');
});
