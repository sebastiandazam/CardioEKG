import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
import {boundsFor,clipVector,pathProgress} from './geometry.ts';
import {teachingCycle,electricalLayer} from './activation.ts';
const bundle=buildSync({entryPoints:['src/anatomy/mesh.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {decodeAtlas}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('HRA dataset contains real septal and ventricular geometry without splicing another anatomical source',()=>{
 const file=fs.readFileSync('public/anatomy/heart-hra.glb');
 const meshes=decodeAtlas(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'hra');
 const septum=meshes.find(m=>m.id==='interventricular-septum');
 assert.equal(septum.indices.length/3,8074);assert.equal(septum.positions.length/3,4039);
 assert.equal(meshes.filter(m=>!/node|bundle|purkinje|conduction|accessory/.test(m.id)).length,14);
 for(const id of ['left-ventricle','right-ventricle','left-atrium','right-atrium','mitral-valve','tricuspid-valve','aortic-valve','pulmonary-valve'])assert.ok(meshes.some(m=>m.id===id),id);
 assert.equal(meshes.some(m=>m.id==='aorta'),false,'no atlas vessel mesh has been grafted onto HRA');
 for(const m of meshes){assert.ok(m.positions.every(Number.isFinite));assert.ok(m.normals.every(Number.isFinite));assert.ok(m.indices.every(i=>i<m.positions.length/3));if(m.activation)assert.ok(m.activation.every(v=>v>=0&&v<=1));}
 assert.equal(createHash('sha256').update(file).digest('hex'),'b1237e7e765178e9357fd2ea7ccf19d55d0bf9ca55e187886635febe28244c70');
});
test('source conduction coordinates follow ordered paths, including curved routes',()=>{
 const paths=[[[0,0,0],[0,1,0],[1,1,0]]];
 assert.equal(pathProgress([0,0,0],paths),0);assert.equal(pathProgress([0,1,0],paths),.5);assert.equal(pathProgress([1,1,0],paths),1);
 assert.equal(pathProgress([.5,1,.01],paths),.75);
 const file=fs.readFileSync('public/anatomy/heart.glb');const meshes=decodeAtlas(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength));
 for(const id of ['bundle-of-his','right-bundle-branch','left-bundle-branch','purkinje-fibers']){const m=meshes.find(m=>m.id===id);assert.ok(m.activation);assert.ok(Math.min(...m.activation)<.05);assert.ok(Math.max(...m.activation)>.95);}
});
test('anatomical section planes clip model coordinates and reverse the retained side',()=>{
 for(const axis of [0,1,2])for(const invert of [false,true]){
  const plane=clipVector({axis,position:.3,invert});
  const value=(p)=>plane[axis]*p+plane[3];
  assert.equal(value(.3),0);assert.equal(value(.5)>0,!invert);assert.equal(value(.1)<0,!invert);
 }
 assert.deepEqual(clipVector(null),[0,0,0,0]);
 assert.deepEqual(boundsFor([{positions:Float32Array.from([1,2,3,-1,-2,-3])}],1),[-2,2]);
});
test('explicit teaching patterns show delayed AV passage, dropped conduction and pre-excitation, independently of diagnosis',()=>{
 assert.equal(teachingCycle(.29,60,'sinus').phase,'qrs');
 assert.equal(teachingCycle(.29,60,'avblock1').phase,null);
 assert.equal(teachingCycle(.34,60,'avblock1').phase,'qrs');
 assert.equal(teachingCycle(.25,60,'avblock2').phase,'qrs');
 assert.equal(teachingCycle(1.25,60,'avblock2').phase,null);
 assert.equal(teachingCycle(.16,60,'wpw').phase,'qrs');
 assert.equal(electricalLayer('atrial-conduction',[1,0,0],'p',.5,'af').emission,0);
 assert.equal(electricalLayer('left-atrium',[1,0,0],'qrs',.3,'af').disorganized,true);
 assert.equal(electricalLayer('bundle-of-his',[1,0,0],'qrs',.2,'avblock3').emission,0);
 assert.ok(electricalLayer('accessory-pathway',[1,0,0],'p',.85,'wpw').emission>0);
 assert.equal(electricalLayer('accessory-pathway',[1,0,0],'p',.85,'sinus').emission,0);
});
