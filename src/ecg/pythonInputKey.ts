import {leads} from '../cases';
import type {PythonInput} from './pythonAnalysis';
/** Internal cache identity, not a clinical measure or a security identifier. */
export function pythonInputKey(input:PythonInput):string{
 const normalized={traces:leads.map(lead=>[lead,input.traces[lead]??null]),rhythmTrace:input.rhythmTrace??null,rhythmLead:input.rhythmLead??null,measurementWindows:Object.entries(input.measurementWindows??{}).sort(([a],[b])=>a.localeCompare(b)),axisComparable:input.axisComparable??false,simultaneous:input.simultaneous??false};
 const text=JSON.stringify(normalized);let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i)}
 return `python-signals-2:${text.length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
}
