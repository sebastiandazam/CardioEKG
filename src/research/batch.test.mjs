import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructSheet } from './batch.ts';
const crops={I:{left:0,right:25,top:10,bottom:40},II:{left:30,right:55,top:10,bottom:40},III:{left:60,right:85,top:10,bottom:40}};
const request={file:new File(['image'],'ecg.png'),fingerprint:'sheet',crops,speed:25,gain:10};
const result={warning:null,gridUnitEvidence:'major-minor',speed:25,gain:10,quality:1,points:[1,2],mv:[0,1],seconds:2.5};
const good=()=>({kind:'photo',image:new Blob(['crop']),result});
test('batch processes all leads sequentially, retains successes, and retries only failures',async()=>{
 const first=[];let active=0,max=0,calls=0;
 await reconstructSheet(request,{},new AbortController().signal,async task=>{
  max=Math.max(max,++active);calls++;await Promise.resolve();active--;
  return task.crop.left===30?{kind:'error',code:'gridScale'}:good();
 },entry=>first.push(entry));
 assert.equal(calls,3);assert.equal(max,1);
 assert.deepEqual(first.map(x=>[x.lead,x.status]),[['I','ready'],['II','failed'],['III','ready']]);
 const cached=Object.fromEntries(first.filter(x=>x.status==='ready').map(x=>[x.lead,x.photo]));
 calls=0;const next=[];
 await reconstructSheet(request,cached,new AbortController().signal,async()=>{calls++;return good();},entry=>next.push(entry));
 assert.equal(calls,1);assert.ok(next.every(x=>x.status==='ready'));
 assert.equal(next[0].photo,cached.I);
});
test('ambiguous grid units and warning traces are exceptions, not successful automatic reconstructions',async()=>{
 const entries=[];
 await reconstructSheet({...request,crops:{I:crops.I,II:crops.II}},{},new AbortController().signal,async task=>({...good(),result:{...result,...(task.crop.left===0?{gridUnitEvidence:'periodic-only'}:{warning:'gap',warningCode:'interruptedTrace'})}}),entry=>entries.push(entry));
 assert.deepEqual(entries.map(x=>x.failure.code),['gridUnitUnknown','interruptedTrace']);
});
test('overlapping crops are processed normally and canceling still discards late results',async()=>{
 let calls=0;const entries=[];
 await reconstructSheet({...request,crops:{I:crops.I,II:crops.I}},{},new AbortController().signal,async()=>{calls++;return good();},entry=>entries.push(entry));
 assert.equal(calls,2);assert.ok(entries.every(x=>x.status==='ready'));
 const controller=new AbortController();let emitted=0;
 await reconstructSheet(request,{},controller.signal,async()=>{controller.abort();return good();},()=>emitted++);
 assert.equal(emitted,0);
});
test('a manually calibrated repair is preserved on the next batch run',async()=>{
 const manual={image:new Blob(['verified']),fingerprint:'sheet:I',sourceCrop:crops.I,result:{...result,gridUnitEvidence:'manual',calibration:'manual'}};
 let calls=0;const entries=[];
 await reconstructSheet({...request,crops:{I:crops.I}},{I:manual},new AbortController().signal,async()=>{calls++;return good();},entry=>entries.push(entry));
 assert.equal(calls,0);assert.equal(entries[0].photo,manual);
});
test('shared automatic grid is only a fallback for failed local calibration',async()=>{
 const reference={left:0,right:2,top:0,bottom:4},calls=[];
 const entries=[];
 await reconstructSheet({...request,crops:{I:crops.I,II:crops.II},automaticReference:reference},{},new AbortController().signal,async task=>{
  calls.push(task);
  if(task.crop===crops.I&&!task.calibration.source)return {kind:'photo-draft',image:new Blob(),trace:{width:2,height:2,points:[1,1],quality:1},code:'atypicalScale'};
  return good();
 },entry=>entries.push(entry));
 assert.equal(calls.length,3);assert.equal(calls[1].calibration.source,'paper-grid');assert.equal(calls[2].calibration.source,undefined);
 assert.equal(calls[1].calibration.widthMm,62.5);assert.ok(entries.every(x=>x.status==='ready'));
});
test('a manual whole-paper reference overrides local scale and is cached by reference identity',async()=>{
 const ref={left:0,right:2,top:0,bottom:4},entries=[];let calls=0;
 await reconstructSheet({...request,crops:{I:crops.I},reference:ref},{},new AbortController().signal,async task=>{calls++;assert.equal(task.calibration.widthMm,62.5);return good();},entry=>entries.push(entry));
 assert.equal(calls,1);calls=0;
 await reconstructSheet({...request,crops:{I:crops.I},reference:ref},{I:entries[0].photo},new AbortController().signal,async()=>{calls++;return good();},()=>{});
 assert.equal(calls,0);
});
test('a whole-page average cannot override a measured local anisotropy',async()=>{
 let calls=0;const entries=[];
 await reconstructSheet({...request,crops:{I:crops.I},automaticReference:{left:0,right:2,top:0,bottom:4}},{},new AbortController().signal,async()=>{calls++;return {kind:'photo-draft',image:new Blob(),trace:{width:2,height:2,points:[1,1],quality:1},code:'unevenScale'};},entry=>entries.push(entry));
 assert.equal(calls,1);assert.equal(entries[0].failure.code,'unevenScale');
});
test('individual printed gain overrides survive batch reconstruction and cache reuse',async()=>{
 const one={...request,crops:{I:crops.I},calibrationByLead:{I:{speed:25,gain:5}}};let calls=0,photo;
 await reconstructSheet(one,{},new AbortController().signal,async task=>{calls++;assert.equal(task.calibration.gain,5);return {...good(),result:{...result,gain:5}};},entry=>photo=entry.photo);
 await reconstructSheet(one,{I:photo},new AbortController().signal,async()=>{calls++;return good();},entry=>assert.equal(entry.photo,photo));assert.equal(calls,1);
});
