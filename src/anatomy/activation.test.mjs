import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
import {teachingCycle,electricalLayer} from './activation.ts';
const bundle=buildSync({entryPoints:['src/anatomy/mesh.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {decodeAtlas}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('bundled licensed atlas decodes its full anatomy with finite geometry, normals and uniform proportions',()=>{
 const file=fs.readFileSync('public/anatomy/heart.glb');
 assert.equal(createHash('sha256').update(file).digest('hex'),'091cdd5140c0cc63850799136bcac4e0451a86796195700ff9aea2ec6a2305e9');
 const meshes=decodeAtlas(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength));
 assert.equal(meshes.length,27);
 assert.equal(meshes.reduce((sum,m)=>sum+m.indices.length/3,0),123812);
 for(const id of ['right-atrium','left-atrium','right-ventricle','left-ventricle','mitral-valve','tricuspid-valve','aortic-valve','pulmonary-valve','sa-node','av-node','bundle-of-his'])assert.ok(meshes.some(m=>m.id===id),id);
 for(const mesh of meshes){assert.ok(mesh.positions.every(Number.isFinite));assert.ok(mesh.normals.every(Number.isFinite));assert.ok(mesh.indices.every(i=>i<mesh.positions.length/3));}
 // Every source vertex receives exactly the same scale and offset on all axes.
 const jsonLength=file.readUInt32LE(12),model=JSON.parse(file.toString('utf8',20,20+jsonLength)),bin=28+jsonLength;
 const node=model.nodes.find(node=>node.name===meshes[0].id),raw=model.meshes[node.mesh].primitives[0].attributes.POSITION,a=model.accessors[raw],v=model.bufferViews[a.bufferView],offset=bin+(v.byteOffset??0)+(a.byteOffset??0);
 const vertex=i=>file.readFloatLE(offset+Math.floor(i/3)*(v.byteStride??12)+(i%3)*4),decoded=meshes[0].positions;
 const axis=[0,1,2].find(axis=>Math.abs(vertex(3+axis)-vertex(axis))>1e-7);
 assert.notEqual(axis,undefined);
 const ratio=(decoded[3+axis]-decoded[axis])/(vertex(3+axis)-vertex(axis));
 for(let i=1;i<Math.min(a.count,100);i++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs((decoded[i*3+axis]-decoded[axis])-(vertex(i*3+axis)-vertex(axis))*ratio)<1e-5);
});
test('teaching playback changes phase with cursor time and never manufactures markers or a diagnosis',()=>{
 assert.equal(teachingCycle(.05,60,'sinus').phase,'p');assert.equal(teachingCycle(.25,60,'sinus').phase,'qrs');assert.equal(teachingCycle(.5,60,'sinus').phase,'t');
 for(const rate of [40,60,75,150]){const frame=teachingCycle(.22+.043,rate,'sinus');assert.equal(frame.ventricular.phase,'qrs');assert.ok(Math.abs(frame.ventricular.progress-.5)<1e-8);}
 assert.equal(teachingCycle(.25,60).phase,null);assert.deepEqual(teachingCycle(.25,null,'sinus'),teachingCycle(.25,60,'sinus'));
 const dissociated=teachingCycle(2.05,60,'avblock3');assert.equal(dissociated.atrial.phase,'p');assert.equal(dissociated.ventricular.phase,'qrs');

});
test('electrical activation travels on tissue and respects the blocked bundle',()=>{
 const c=[.7,.2,.1];
 const early=electricalLayer('left-ventricle',c,'qrs',.1,'sinus'),late=electricalLayer('left-ventricle',c,'qrs',.8,'sinus');
 assert.ok(late.wave>early.wave);assert.equal(early.reverse,false);
 assert.equal(electricalLayer('left-ventricle',c,'p',.5,'sinus').wave,undefined);
 assert.equal(electricalLayer('sa-node',c,'p',.5,'af').emission,0);
 assert.equal(electricalLayer('left-bundle-branch',c,'qrs',.5,'lbbb').emission,0);
 assert.ok(electricalLayer('right-bundle-branch',c,'qrs',.5,'lbbb').emission>0);
});
