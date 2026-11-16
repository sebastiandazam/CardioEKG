import test from 'node:test';import assert from 'node:assert/strict';
import {dimensionsFromReference,referenceFromGrid} from './sharedScale.ts';
import {processPhotoRaster} from './photoRaster.ts';

test('one confirmed 5 mm square calibrates every crop without depending on crop size or canvas resize',()=>{
 const ref={left:5,right:7,top:10,bottom:14};
 assert.deepEqual(dimensionsFromReference({left:10,right:35,top:20,bottom:40},ref),{widthMm:62.5,heightMm:25});
 assert.equal(dimensionsFromReference({left:0,right:100,top:10,bottom:30},ref).widthMm,250);
 const paper={left:10,right:90,top:25,bottom:75};
 const measured=referenceFromGrid(paper,1600,1000,8,8);
 assert.ok(Math.abs((measured.right-measured.left)-2)<1e-8);
 assert.ok(Math.abs((measured.bottom-measured.top)-2)<1e-8);
 assert.throws(()=>dimensionsFromReference(paper,{left:0,right:0,top:0,bottom:10}));
});
test('scale failure preserves a drawable pixel trace without inventing seconds or mV',()=>{
 const width=300,height=100,rgba=new Uint8ClampedArray(width*height*4).fill(255);
 for(let x=0;x<width;x++){const y=Math.round(50+10*Math.sin(x/8));for(let dy=-1;dy<=1;dy++)rgba.set([20,20,20,255],((y+dy)*width+x)*4);}
 const image=new Blob(['image']);
 const response=processPhotoRaster(rgba,width,height,{speed:25,gain:10,widthMm:null,heightMm:null},image);
 assert.equal(response.kind,'photo-draft');assert.equal(response.image,image);assert.equal(response.trace.points.length,width);
 assert.equal('seconds' in response.trace,false);assert.equal('mv' in response.trace,false);
 const verified=processPhotoRaster(rgba,width,height,{speed:25,gain:10,widthMm:62.5,heightMm:20},image);
 assert.equal(verified.kind,'photo');assert.equal(verified.result.seconds,2.5);
});
