import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultAnatomySource,referenceIds,referenceAnchor,layoutReferenceLabels} from './labelLayout.ts';
test('Heart Atlas is the main anatomy and reference lists only select available structures',()=>{
 assert.equal(defaultAnatomySource,'atlas');
 const available=['right-atrium','left-atrium','right-ventricle','left-ventricle','aorta','pulmonary-trunk'];
 assert.deepEqual(referenceIds('surface',available,'aorta',4),['aorta','right-atrium','left-atrium','right-ventricle']);
 assert.equal(referenceIds('surface',available,'',6).includes('interventricular-septum'),false);
 assert.deepEqual(referenceIds('axis',available,'aorta',6),[]);
 assert.deepEqual(referenceIds('conduction',['sa-node','av-node','bundle-of-his','purkinje-fibers','left-bundle-branch','right-bundle-branch'],'',4),['sa-node','av-node','bundle-of-his','purkinje-fibers']);
});
test('label anchors come from retained source vertices, and disappear when a section removes the structure',()=>{
 const mesh={positions:Float32Array.from([-1,0,0, 1,0,0, 0,1,0])};
 assert.deepEqual(referenceAnchor(mesh,{axis:0,position:.5,invert:false}),[1,0,0]);
 assert.deepEqual(referenceAnchor(mesh,{axis:0,position:-.5,invert:true}),[-1,0,0]);
 assert.equal(referenceAnchor(mesh,{axis:0,position:2,invert:false}),null);
 const anchor=referenceAnchor(mesh,null);
 assert.ok(Array.from({length:3},(_,i)=>Array.from(mesh.positions.slice(i*3,i*3+3))).some(p=>p.every((v,j)=>v===anchor[j])));
});
test('crowded reference labels remain readable within mobile and desktop stages without changing anchors',()=>{
 for(const [width,height,count] of [[320,350,4],[640,400,6]]) {
  // Rotation can project every reference to the same half of the heart.
  const items=Array.from({length:count},(_,i)=>({id:'part-'+i,anchor:[20+i,50+i*.2]}));
  const result=layoutReferenceLabels(items,width,height);
  assert.equal(result.length,count);
  for(const label of result){assert.ok(label.left>=0&&label.left+label.width<=width);assert.ok(label.top>=0&&label.top+44<=height);assert.deepEqual(label.anchor,items.find(item=>item.id===label.id).anchor);}
  for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++) {
   const a=result[i],b=result[j];
   const overlapX=a.left<b.left+b.width&&b.left<a.left+a.width;
   const overlapY=a.top<b.top+44&&b.top<a.top+44;
   assert.equal(overlapX&&overlapY,false);
  }
 }
 assert.deepEqual(layoutReferenceLabels([{id:'offscreen',anchor:[140,50]},{id:'invalid',anchor:[NaN,30]}],320,350),[]);
});
