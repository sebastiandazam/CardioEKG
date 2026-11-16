import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCrop } from './crop.ts';

test('moving crop preserves dimensions and clamps all edges, including zoom-normalized deltas', () => {
  const crop = { left: 10, right: 40, top: 20, bottom: 60 };
  for (const [dx, dy] of [[5, 7], [-50, -50], [150, 150], [.25, -.75]]) {
    const result = moveCrop(crop, dx, dy);
    assert.equal(result.right - result.left, 30);
    assert.equal(result.bottom - result.top, 40);
    assert.ok(result.left >= 0 && result.right <= 100 && result.top >= 0 && result.bottom <= 100);
  }
  assert.deepEqual(moveCrop(crop, -50, 0), { left: 0, right: 30, top: 20, bottom: 60 });
});

test('touch resize keeps the center, bounds and minimum size without blocking overlaps', async () => {
 const {resizeCrop}=await import('./crop.ts');
 const crop={left:10,right:40,top:20,bottom:60};
 assert.deepEqual(resizeCrop(crop,10,-10),{left:5,right:45,top:25,bottom:55});
 assert.deepEqual(resizeCrop(crop,200,200),{left:0,right:50,top:0,bottom:80});
 const tiny=resizeCrop(crop,-100,-100);
 assert.equal(tiny.right-tiny.left,.5);assert.equal(tiny.bottom-tiny.top,.5);
});
