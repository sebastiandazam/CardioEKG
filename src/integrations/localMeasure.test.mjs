import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/integrations/localMeasure.ts'],bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.url':JSON.stringify('file:///test/localMeasure.js')}});
const {LocalMeasureClient}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('el motor local transfiere píxeles al worker y cancelar lo termina',async()=>{
 const old={createImageBitmap:globalThis.createImageBitmap,document:globalThis.document,Worker:globalThis.Worker,fetch:globalThis.fetch};let instance,closed=false,canvas;
 globalThis.fetch=()=>{throw new Error('No ECG network requests permitted')};
 globalThis.createImageBitmap=async()=>({width:3600,height:2000,close(){closed=true}});
 globalThis.document={createElement(){canvas={getContext:()=>({fillRect(){},drawImage(){}}),toBlob:cb=>cb(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]))};return canvas}};
 globalThis.Worker=class{listeners={};terminated=false;constructor(){instance=this}addEventListener(k,cb){this.listeners[k]=cb}removeEventListener(k){delete this.listeners[k]}postMessage(task,transfers){this.task=task;assert.equal(transfers[0],task.image)}terminate(){this.terminated=true}};
 const client=new LocalMeasureClient(),abort=new AbortController();
 try{const result=client.measure(new File(['test'],'ecg.png'),{layout:'auto',speed:25,gain:10},abort.signal,()=>{});await new Promise(resolve=>setImmediate(resolve));assert.equal(canvas.width,1800);assert.equal(canvas.height,1000);assert.equal(closed,true);assert.equal(instance.task.image.byteLength,8);abort.abort();await assert.rejects(result,{name:'AbortError'});assert.equal(instance.terminated,true);assert.deepEqual(instance.listeners,{});}finally{client.dispose();Object.assign(globalThis,old)}
});
