import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeReference,referenceCorners} from './reference.ts';
const box={left:25,right:40,top:35,bottom:50},bounds={left:10,right:90,top:20,bottom:80};
test('each calibration corner resizes independently, preserving opposite edges in original-image coordinates',()=>{
 for(const corner of referenceCorners) {
  const next=resizeReference(box,corner,2,3,bounds);
  assert.equal(next[corner.endsWith('left')?'left':'right'],box[corner.endsWith('left')?'left':'right']+2);
  assert.equal(next[corner.startsWith('top')?'top':'bottom'],box[corner.startsWith('top')?'top':'bottom']+3);
  assert.equal(next[corner.endsWith('left')?'right':'left'],box[corner.endsWith('left')?'right':'left']);
  assert.equal(next[corner.startsWith('top')?'bottom':'top'],box[corner.startsWith('top')?'bottom':'top']);
  for(const direction of [-100,100]) {
   const clamped=resizeReference(box,corner,direction,direction,bounds);
   assert.ok(clamped.left>=bounds.left&&clamped.right<=bounds.right&&clamped.top>=bounds.top&&clamped.bottom<=bounds.bottom);
   assert.ok(clamped.right>clamped.left&&clamped.bottom>clamped.top);
  }
 }
});
