import engineSource from '../../server/measure/ecg_analisis.py?raw';
import runnerSource from '../../server/measure/run_measure.py?raw';
import {PYODIDE_INDEX} from './localMeasureProtocol';
import type {LocalMeasureTask,LocalMeasurePhase,LocalMeasureResponse} from './localMeasureProtocol';
type Runtime={loadPackage:(names:string[])=>Promise<void>;FS:{mkdirTree:(path:string)=>void;writeFile:(path:string,bytes:string|Uint8Array)=>void;unlink:(path:string)=>void};globals:{set:(key:string,value:unknown)=>void;delete:(key:string)=>void};runPython:(code:string)=>unknown};
let runtime:Promise<Runtime>|undefined;
function progress(id:number,phase:LocalMeasurePhase){self.postMessage({id,kind:'progress',phase} satisfies LocalMeasureResponse);}
async function prepare(id:number):Promise<Runtime>{
 if(!runtime)runtime=(async()=>{
  progress(id,'runtime');
  const module=await import(/* @vite-ignore */ PYODIDE_INDEX+'pyodide.mjs');
  const py=await module.loadPyodide({indexURL:PYODIDE_INDEX,stdout:()=>{},stderr:()=>{}}) as Runtime;
  progress(id,'packages');await py.loadPackage(['numpy','scipy','pillow']);
  progress(id,'engine');py.FS.mkdirTree('/engine');
  // Bundle canonical sources into this content-hashed worker: older HTTP caches cannot mix releases.
  py.FS.writeFile('/engine/ecg_analisis.py',engineSource);py.FS.writeFile('/engine/run_measure.py',runnerSource);
  py.runPython(`import sys,json,gc\nsys.path.insert(0,'/engine')\nfrom run_measure import measure_file, measure_signals\ndef _measure_traces(data_json):\n    data=json.loads(data_json)\n    return json.dumps(measure_signals(data),allow_nan=False,separators=(",",":"))\ndef _measure_local(options_json):\n    options=json.loads(options_json)\n    result=measure_file('/engine/input.png',options['layout'],options['speed'],options['gain'])\n    result.pop('traces',None)\n    result.pop('rhythmTrace',None)\n    return json.dumps(result,allow_nan=False,separators=(',',':'))`);
  return py;
 })().catch(error=>{runtime=undefined;throw error;});
 return runtime;
}
self.addEventListener('message',async(event:MessageEvent<LocalMeasureTask>)=>{
 const task=event.data;const {id}=task;let py:Runtime|undefined;
 if ('traces' in task) {
  try {
   py=await prepare(id);progress(id,'measurement');py.globals.set('_trace_options',JSON.stringify(task));
   const result=JSON.parse(String(py.runPython('_measure_traces(_trace_options)')));
   self.postMessage({id,kind:'trace-result',result});
  } catch(error) {self.postMessage({id,kind:'error',message:error instanceof Error?error.message:'measurement'});}
  finally {if(py){py.globals.delete('_trace_options');py.runPython('gc.collect()');}}
  return;
 }
 const {image,options}=task;
 try{
  if(image.byteLength>20*1024*1024||!['auto','3x4r','3x4','6x2','12x1'].includes(options.layout)||![25,50].includes(options.speed)||![5,10,20].includes(options.gain))throw new Error('invalid-input');
  const bytes=new Uint8Array(image);if(bytes.length<8||![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))throw new Error('invalid-image');
  py=await prepare(id);progress(id,'measurement');py.FS.writeFile('/engine/input.png',bytes);py.globals.set('_measurement_options',JSON.stringify(options));
  const result=JSON.parse(String(py.runPython('_measure_local(_measurement_options)')));
  if(result.ok!==true)throw new Error(result.error??'measurement');
  self.postMessage({id,kind:'result',result} satisfies LocalMeasureResponse);
 }catch(error){self.postMessage({id,kind:'error',message:error instanceof Error?error.message:'measurement'} satisfies LocalMeasureResponse);}
 finally{if(py){try{py.FS.unlink('/engine/input.png');py.globals.delete('_measurement_options');py.runPython('gc.collect()');}catch{/* memory is also discarded when the worker closes */}}}
});
