import {pythonInputKey} from './pythonInputKey';
import type {Lead,Trace,ViewerCase,Measurements} from '../cases';
import type {estimateECG} from './estimate';
import type {LocalMeasurePhase} from '../integrations/localMeasureProtocol';

export type PythonInput={traces:Partial<Record<Lead,Trace>>;rhythmTrace?:Trace;rhythmLead?:Lead|null;measurementWindows?:ViewerCase['measurementWindows'];axisComparable?:boolean;simultaneous?:boolean};
export type PythonEstimate=Omit<ReturnType<typeof estimateECG>,'qrsMethod'>&{qrsMethod:ReturnType<typeof estimateECG>['qrsMethod']|'robust-local-consensus';measurementWindows?:Partial<Record<keyof Measurements,{lead:Lead;captureLead?:Lead|'II-long';start:number;end:number;source:'automatic'}[]>>};
export type PythonAnalysis={schemaVersion:1;ok:true;engine:string;inputKey?:string;estimate:PythonEstimate;rhythmEstimate:PythonEstimate|null;manualMeasurements:Partial<Measurements>;derived:{qtcFridericiaMs:number|null;qtcBazettMs:number|null;qtcBogossianMs?:number|null};quality:{refinement?:{attempts:number;selected:string;reason:string;excludedLeads?:Lead[]};warnings:string[];irregular:boolean;analyzedLeads:Lead[];referenceLead:Lead; pDetectedLeads:number;rrCvPct:number|null}};
export type PythonOptions=Omit<PythonInput,'traces'|'rhythmTrace'>&{signal:AbortSignal;onProgress?:(phase:LocalMeasurePhase)=>void};
let worker:Worker|null=null,sequence=0,queue=Promise.resolve();
const aborted=()=>new DOMException('Aborted','AbortError');
function validate(value:unknown):value is PythonAnalysis {
 const v=value as PythonAnalysis;
 return !!v&&v.schemaVersion===1&&v.ok===true&&typeof v.engine==='string'&&!!v.estimate&&!!v.estimate.measurements&&!!v.estimate.leadDetails&&!!v.estimate.markersByLead&&!!v.quality&&Array.isArray(v.quality.warnings)&&v.quality.warnings.every(x=>typeof x==='string')&&!!v.manualMeasurements&&!!v.derived&&(['qtcFridericiaMs','qtcBazettMs'] as const).every(k=>v.derived[k]===null||Number.isFinite(v.derived[k]))&&(v.derived.qtcBogossianMs===undefined||v.derived.qtcBogossianMs===null||Number.isFinite(v.derived.qtcBogossianMs))&&(['rateBpm','prMs','qrsMs','qtMs','axisDeg'] as const).every(k=>v.estimate.measurements[k]===null||Number.isFinite(v.estimate.measurements[k]));
}
/** Serializes work in a single Python runtime. Aborting a running task terminates that runtime. */
export function analyzeWithPython(traces:PythonInput['traces'],rhythmTrace:Trace|undefined,options:PythonOptions):Promise<PythonAnalysis>{
 const run=()=>new Promise<PythonAnalysis>((resolve,reject)=>{
  if(options.signal.aborted){reject(aborted());return;}
  worker??=new Worker(new URL('../integrations/localMeasure.worker.ts',import.meta.url),{type:'module'});
  const current=worker,id=++sequence;
  const cleanup=()=>{clearTimeout(timeout);current.removeEventListener('message',message);current.removeEventListener('error',error);options.signal.removeEventListener('abort',abort);};
  const stop=()=>{current.terminate();if(worker===current)worker=null;};
  const abort=()=>{cleanup();stop();reject(aborted());};
  const error=()=>{cleanup();stop();reject(new Error('runtime'));};
  const message=(event:MessageEvent)=>{const v=event.data;if(v?.id!==id)return;if(v.kind==='progress'){options.onProgress?.(v.phase);return;}cleanup();if(v.kind==='trace-result'&&validate(v.result))resolve(v.result);else reject(new Error(v.kind==='error'?v.message:'shape'));};
  const timeout=setTimeout(()=>{cleanup();stop();reject(new Error('timeout'));},180000);
  options.signal.addEventListener('abort',abort,{once:true});current.addEventListener('message',message);current.addEventListener('error',error);
  current.postMessage({id,traces,rhythmTrace,rhythmLead:options.rhythmLead,measurementWindows:options.measurementWindows,axisComparable:options.axisComparable,simultaneous:options.simultaneous});
 });
 const result=queue.then(run).then(result=>({...result,inputKey:pythonInputKey({traces,rhythmTrace,rhythmLead:options.rhythmLead,measurementWindows:options.measurementWindows,axisComparable:options.axisComparable,simultaneous:options.simultaneous})}));queue=result.then(()=>{},()=>{});return result;
}
