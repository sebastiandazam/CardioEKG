import {pythonInputKey} from './pythonInputKey';
import {useEffect,useMemo,useState} from 'react';
import type {ViewerCase} from '../cases';
import {analyzeWithPython} from './pythonAnalysis';
import type {PythonAnalysis} from './pythonAnalysis';
import {pythonAxisEligible} from './pythonState';
import type {LocalMeasurePhase} from '../integrations/localMeasureProtocol';
export type PythonState={result?:PythonAnalysis;phase?:LocalMeasurePhase;status:'loading'|'ready'|'error';retry:()=>void};
export function usePythonAnalysis(item:Pick<ViewerCase,'traces'|'rhythmTrace'|'rhythmLead'|'synchronized'|'captureProvenance'|'measurementWindows'|'pythonAnalysis'>):PythonState{
 const eligible=pythonAxisEligible(item.traces,item.captureProvenance,item.synchronized);
 const inputKey=useMemo(()=>pythonInputKey({traces:item.traces,rhythmTrace:item.rhythmTrace,rhythmLead:item.rhythmLead,measurementWindows:item.measurementWindows,axisComparable:eligible,simultaneous:item.synchronized}),[item.traces,item.rhythmTrace,item.rhythmLead,item.synchronized,item.measurementWindows,eligible]);
 const existing=item.pythonAnalysis?.inputKey===inputKey?item.pythonAnalysis:undefined;
 const key=useMemo(()=>({}),[inputKey,existing]);
 const [attempt,setAttempt]=useState(0),[state,setState]=useState<Omit<PythonState,'retry'>&{key:object}>({key,result:existing,status:existing?'ready':'loading'});
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  if(existing){setState({key,status:'ready',result:existing});return()=>{active=false;controller.abort()};}
  setState({key,status:'loading'});
  analyzeWithPython(item.traces,item.rhythmTrace,{rhythmLead:item.rhythmLead??undefined,measurementWindows:item.measurementWindows,axisComparable:eligible,simultaneous:item.synchronized,signal:controller.signal,onProgress:phase=>{if(active)setState({key,status:'loading',phase})}}).then(result=>{if(active)setState({key,result,status:'ready'})}).catch(()=>{if(active&&!controller.signal.aborted)setState({key,status:'error'})});
  return()=>{active=false;controller.abort()};
 },[key,attempt]);
 return {...(state.key===key?state:{status:'loading' as const}),retry:()=>setAttempt(value=>value+1)};
}
export async function measureCase(item:ViewerCase,signal?:AbortSignal):Promise<ViewerCase>{
 const eligible=pythonAxisEligible(item.traces,item.captureProvenance,item.synchronized);
 const inputKey=pythonInputKey({traces:item.traces,rhythmTrace:item.rhythmTrace,rhythmLead:item.rhythmLead,measurementWindows:item.measurementWindows,axisComparable:eligible,simultaneous:item.synchronized});
 if(item.pythonAnalysis?.inputKey===inputKey)return {...item,measurementEngine:'python'};
 const pythonAnalysis=await analyzeWithPython(item.traces,item.rhythmTrace,{rhythmLead:item.rhythmLead??undefined,measurementWindows:item.measurementWindows,axisComparable:pythonAxisEligible(item.traces,item.captureProvenance,item.synchronized),simultaneous:item.synchronized,signal:signal??new AbortController().signal});
 return {...item,measurementEngine:'python',pythonAnalysis,measurements:pythonAnalysis.estimate.measurements};
}
