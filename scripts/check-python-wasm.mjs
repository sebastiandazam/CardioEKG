/** Optional real WASM smoke check. Supply an installed official Pyodide 0.27.7
 * full distribution folder and PNG fixtures. Never downloads or uploads ECGs.
 * node scripts/check-python-wasm.mjs /path/to/pyodide fixture.png [...]
 * -- filenames containing B_, C_, D_, E_ select synthetic fixture calibration.
 * Requires npm run build first. This tests execution, not clinical accuracy.
 */
import {Worker} from 'node:worker_threads';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const [runtime,...images]=process.argv.slice(2);
if(!runtime||!images.length)throw new Error('Supply official Pyodide runtime folder and PNG fixtures');
const dist=resolve('dist'),runtimePath=resolve(runtime)+'/';
const asset=readdirSync(dist+'/assets').find(n=>n.startsWith('localMeasure.worker-'));
const code=readFileSync(dist+'/assets/'+asset,'utf8').replaceAll('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/',runtimePath);
const shim=`const {parentPort}=require('node:worker_threads');const fs=require('node:fs');global.self={location:{href:'https://test.local/assets/worker.js'},postMessage:value=>parentPort.postMessage(value),addEventListener:(type,listener)=>parentPort.on('message',data=>listener({data}))};global.fetch=async url=>{const path=${JSON.stringify(dist)}+new URL(url).pathname;if(!path.startsWith(${JSON.stringify(dist+'/python-engine/')}))throw new Error('Unexpected network request');return {ok:true,text:async()=>fs.readFileSync(path,'utf8')}};`;
const worker=new Worker(shim+code,{eval:true});
let sequence=0;
async function run(file){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(new Error('Timed out')),180000);const handle=value=>{if(value.id!==id||value.kind==='progress')return;clearTimeout(timer);worker.off('message',handle);if(value.kind==='error')reject(new Error(value.message));else{if(!Object.values(value.result.measurements).some(Number.isFinite))return reject(new Error('No finite measurement'));console.log(JSON.stringify({file,measurements:value.result.measurements,mode:value.result.quality.mode}));resolve()}};worker.on('message',handle);worker.once('error',reject);const b=readFileSync(file);worker.postMessage({id,image:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),options:{layout:file.includes('B_')?'6x2':file.includes('C_')?'12x1':file.includes('D_')?'3x4':'3x4r',speed:file.includes('E_')?50:25,gain:file.includes('C_')?5:10}})})}
try{for(const file of images)await run(file)}finally{await worker.terminate()}
