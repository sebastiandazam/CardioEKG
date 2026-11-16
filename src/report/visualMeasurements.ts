import type {Lead,Marker,Trace} from '../cases';
import type {MeasurementDetail} from '../ecg/analysisTypes';
export type VisualInterval={key:'prMs'|'qrsMs'|'qtMs';start:number;end:number;source:'manual'|'automatic'};
export type MeasurementWindow=NonNullable<MeasurementDetail['windows']>[number]&{key:MeasurementDetail['key']};
const valid=(m:{start:number;end:number})=>Number.isFinite(m.start)&&Number.isFinite(m.end)&&m.start>=0&&m.end>m.start;
/** Pick one representative complex; do not relabel multilead medians as beat-level measurements. */
export function representativeIntervals(markers:Marker[],windows:MeasurementWindow[],lead:Lead,from:number,to:number,captureLead:Lead|'II-long'=lead):{intervals:VisualInterval[];qrs:VisualInterval|null} {
 const manual=windows.filter(w=>w.lead===lead&&(w.captureLead??w.lead)===captureLead&&w.source==='manual'&&valid(w));
 const ordered=markers.filter(valid).sort((a,b)=>a.start-b.start);
 const precedingP=(q:Marker)=>ordered.filter(m=>m.phase==='p'&&m.end<=q.start&&q.start-m.start<=.5).at(-1);
 const followingT=(q:Marker)=>ordered.find(m=>m.phase==='t'&&m.start>=q.end&&m.end-q.start<=.8);
 const score=(q:Marker)=>Number(!!precedingP(q))+Number(!!followingT(q));
 const selected=ordered.filter(m=>m.phase==='qrs'&&m.start>=from&&m.end<=to).sort((a,b)=>score(b)-score(a)||Math.abs((a.start+a.end)/2-(from+to)/2)-Math.abs((b.start+b.end)/2-(from+to)/2))[0];
 const automatic:VisualInterval[]=[];
 if(selected){
  automatic.push({key:'qrsMs',start:selected.start,end:selected.end,source:'automatic'});
  const p=precedingP(selected),t=followingT(selected);
  if(p&&p.start>=from)automatic.push({key:'prMs',start:p.start,end:selected.start,source:'automatic'});
  if(t&&t.end<=to)automatic.push({key:'qtMs',start:selected.start,end:t.end,source:'automatic'});
 }
 const intervals=(['prMs','qrsMs','qtMs'] as const).flatMap(key=>{
  const corrected=manual.filter(w=>w.key===key);
  const measured=windows.filter(w=>w.key===key&&w.lead===lead&&(w.captureLead??w.lead)===captureLead&&w.source==='automatic'&&valid(w)&&w.start>=from&&w.end<=to).sort((a,b)=>Math.abs((a.start+a.end)/2-(from+to)/2)-Math.abs((b.start+b.end)/2-(from+to)/2));
  return corrected.length?corrected.filter(w=>w.end>=from&&w.start<=to).map(w=>({key,start:w.start,end:w.end,source:'manual' as const})):measured.length?[{key,start:measured[0].start,end:measured[0].end,source:'automatic' as const}]:automatic.filter(w=>w.key===key);
 });
 return {intervals,qrs:intervals.find(w=>w.key==='qrsMs'&&w.start>=from&&w.end<=to)??null};
}
export type AmplitudePoint={time:number;mv:number;amplitude:number};
export type RepresentativeAmplitudes={baselineMv:number;r:AmplitudePoint|null;s:AmplitudePoint|null;st:AmplitudePoint|null};
/** A measured pre-QRS segment is the reference. Never assume that the chart midline is zero. */
export function representativeAmplitudes(trace:Trace,qrs:VisualInterval|null):RepresentativeAmplitudes|null {
 if(!qrs||!valid(qrs)||trace.seconds<=0||trace.mv.length<4||!trace.mv.every(Number.isFinite))return null;
 const rate=trace.mv.length/trace.seconds,first=Math.ceil(qrs.start*rate),last=Math.floor(qrs.end*rate);
 const before=Math.ceil((qrs.start-.05)*rate),until=Math.floor((qrs.start-.012)*rate);
 if(before<0||until-before<3||first<0||last>=trace.mv.length||last<=first)return null;
 const ordered=trace.mv.slice(before,until+1).sort((a,b)=>a-b),mid=Math.floor(ordered.length/2);
 const baselineMv=ordered.length%2?ordered[mid]:(ordered[mid-1]+ordered[mid])/2;
 let rIndex=first,sIndex=first;
 for(let i=first;i<=last;i++){if(trace.mv[i]>trace.mv[rIndex])rIndex=i;if(trace.mv[i]<trace.mv[sIndex])sIndex=i;}
 const at=(i:number):AmplitudePoint=>({time:i/rate,mv:trace.mv[i],amplitude:trace.mv[i]-baselineMv});
 const r=at(rIndex),s=at(sIndex),stIndex=Math.round((qrs.end+.06)*rate);
 return {baselineMv,r:r.amplitude>.005?r:null,s:s.amplitude<-.005?s:null,st:stIndex<trace.mv.length?at(stIndex):null};
}
