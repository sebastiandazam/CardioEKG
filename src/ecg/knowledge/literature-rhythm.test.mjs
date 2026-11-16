import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluateEntity } from './engine.ts';

const rhythm = JSON.parse(readFileSync(new URL('./kb/rhythm.json', import.meta.url), 'utf8'));
const mobitzII = rhythm.entities.find(entity => entity.id === 'second-degree-mobitz-ii');

test('aggregate constant PR and mean atrial rate cannot verify stable PP for Mobitz II', () => {
  const result = evaluateEntity(mobitzII, {
    pQrsRatio: 1.5, prVariable: false, groupedBeating: true, pRate: 80,
    regular: true, rateBpm: 53,
  }, {});
  assert.equal(result.status, 'possible');
  assert.ok(result.missing.some(criterion => criterion.id === 'm2-stable-pp'));
  assert.equal(result.criteria.find(criterion => criterion.id === 'm2-stable-pp').result, null);
});

test('2:1 conduction cannot become Mobitz II despite constant aggregate PR', () => {
  const result = evaluateEntity(mobitzII, {
    pQrsRatio: 2, prVariable: false, groupedBeating: true, pRate: 80,
  }, {});
  assert.equal(result.status, 'excluded');
});
