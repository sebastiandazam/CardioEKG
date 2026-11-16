import assert from 'node:assert/strict';
import test from 'node:test';
import { forgetLearnedLayouts, learnLayout, readLayoutMemory, recallLayout } from './layoutMemory.ts';

const memoryStore = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), dump: () => [...map.values()].join('') }; };
const band = (top, pulse = true) => ({ top, bottom: top + 8, core: top + 4, left: 6, right: 95, dataLeft: 8, pulse: pulse ? { left: 6, right: 7.5, height: 6 } : null, gaps: [], bars: [] });
const structure = { width: 900, height: 640, bands: [band(17), band(36), band(55), band(77)], inferredLayout: '4x3' };
const crops = { I: { left: 9, right: 30, top: 17, bottom: 25 }, aVR: { left: 31, right: 52, top: 17, bottom: 25 }, V1: { left: 53, right: 74, top: 17, bottom: 25 }, V4: { left: 75, right: 95, top: 17, bottom: 25 },
  II: { left: 9, right: 30, top: 36, bottom: 44 }, aVL: { left: 31, right: 52, top: 36, bottom: 44 }, 'II-long': { left: 9, right: 95, top: 77, bottom: 85 } };

test('confirmed regions are learned as geometry only and recalled for the same sheet type', () => {
  const store = memoryStore();
  assert.equal(learnLayout(structure, '4x3', crops, store), true);
  const recalled = recallLayout(structure, '4x3', store);
  assert.equal(recalled.leads.II.band, 1);
  assert.ok(Math.abs(recalled.leads.aVR.from - (31 - 8) / 87) < 1e-9);
  assert.equal(recallLayout({ ...structure, bands: structure.bands.slice(0, 3) }, '4x3', store), null, 'different band count is a different sheet type');
  assert.doesNotMatch(store.dump(), /png|jpg|name|patient/i);
  learnLayout(structure, '4x3', crops, store);
  assert.equal(readLayoutMemory(store)[0].uses, 2);
  forgetLearnedLayouts(store);
  assert.equal(readLayoutMemory(store).length, 0);
});

test('learning fails closed without bands or storage', () => {
  assert.equal(learnLayout(null, '4x3', crops, memoryStore()), false);
  assert.equal(learnLayout(structure, '4x3', crops, null), false);
});
