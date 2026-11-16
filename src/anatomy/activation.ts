import type {Phase} from '../cases';
import type {Layer,Vector} from './render';
const avGrade=(finding:string)=>/av.?block.?3|complete.?av|third.?degree/.test(finding)?3:/av.?block.?2|mobitz|second.?degree/.test(finding)?2:/av.?block.?1|first.?degree/.test(finding)?1:0;
const preexcited=(finding:string)=>/wpw|preexcitation|pre-excitation/.test(finding);
/** A teaching cycle, never automatic P/QRS/T annotations of an uploaded ECG.
 * Optional explicit teaching pattern changes timing, not the diagnosis. */
export type ActivationFrame={phase:Phase|null;progress:number;atrial:{phase:'p'|null;progress:number};ventricular:{phase:'qrs'|'t'|null;progress:number}};
export function teachingCycle(seconds:number,rate:number|null,finding='unassigned'):ActivationFrame {
 const bpm=rate!==null&&Number.isFinite(rate)&&rate>=30&&rate<=220?rate:60;
 const empty:ActivationFrame={phase:null,progress:0,atrial:{phase:null,progress:0},ventricular:{phase:null,progress:0}};
 if(finding==='unassigned'||finding==='indeterminate')return empty;
 const rr=60/bpm,t=((seconds%rr)+rr)%rr,grade=avGrade(finding);
 const atrial:ActivationFrame['atrial']=finding!=='af'&&t<.1?{phase:'p',progress:t/.1}:{phase:null,progress:0};
 const ventricularTime=grade===3?((seconds%1.5)+1.5)%1.5:t;
 const start=grade===3?.4:preexcited(finding)?.12:grade===1?.3:.22;
 const qrsWidth=grade===3?.16:/bbb/.test(finding)?.148:.086;
 const tStart=start+qrsWidth+.06,tEnd=tStart+.21;
 let ventricular:ActivationFrame['ventricular']={phase:null,progress:0};
 const dropped=grade===2&&Math.floor(seconds/rr)%2!==0;
 // If hypothetical durations overlap the next cycle, abstain rather than compressing waves to RR.
 if(!dropped&&(grade===3||start+qrsWidth<=rr)){
  if(ventricularTime>=start&&ventricularTime<start+qrsWidth)ventricular={phase:'qrs',progress:(ventricularTime-start)/qrsWidth};
  else if((grade===3||tEnd<=rr)&&ventricularTime>=tStart&&ventricularTime<tEnd)ventricular={phase:'t',progress:(ventricularTime-tStart)/.21};
 }
 return {phase:ventricular.phase??atrial.phase,progress:ventricular.phase?ventricular.progress:atrial.progress,atrial,ventricular};
}
export function electricalLayer(id:string,color:Vector,phase:Phase|null,progress:number,finding:string):Layer {
 const conduction=/node|bundle|purkinje|conduction|accessory/.test(id),p=Math.max(0,Math.min(1,progress));
 const grade=avGrade(finding),pre=preexcited(finding);
 if(conduction) {
  const blocked=(finding==='lbbb'&&id==='left-bundle-branch')||(finding==='rbbb'&&id==='right-bundle-branch');
  let active=false,travel=p;
  if(id==='sa-node')active=phase==='p'&&finding!=='af';
  else if(id==='atrial-conduction'){active=phase==='p'&&finding!=='af';travel=p;}
  else if(id==='accessory-pathway'){active=pre&&((phase==='p'&&p>.72)||(phase==='qrs'&&p<.25));travel=phase==='p'?(p-.72)/.28:1;}
  else if(id==='av-node')active=grade!==3&&((phase==='p'&&p>(grade===1?.9:.72))||(phase==='qrs'&&p<.15));
  else if(phase==='qrs'&&!blocked&&!(grade===3&&id==='bundle-of-his')) {
   if(id==='bundle-of-his'){active=p<.3;travel=p/.3;}
   else if(id.includes('purkinje')) {
    const affected=(finding==='lbbb'&&id.includes('left'))||(finding==='rbbb'&&id.includes('right'));
    const start=affected?.72:.42;active=p>=start;travel=(p-start)/(1-start);
   } else {active=p>=.12&&p<.64;travel=(p-.12)/.52;}
  }
  return {color:blocked?[.9,.18,.1]:active?[1,.83,.25]:[.52,.36,.16],emission:active?.85:0,light:0,
    wave:active&&!/node/.test(id)?Math.max(0,Math.min(1,travel)):undefined,reverse:false};
 }
 const atrial=/atrium/.test(id),ventricular=/ventric|heart|wall|septum/.test(id);
 if(atrial&&finding==='af')return {color,wave:p,disorganized:true,waveColor:[1,.68,.18]};
 const active=(phase==='p'&&atrial)||(phase==='qrs'&&ventricular)||(phase==='t'&&ventricular);
 const affected=(finding==='lbbb'&&id==='left-ventricle')||(finding==='rbbb'&&id==='right-ventricle');
 const delayed=phase==='qrs'&&affected;
 return {color,...(active?{wave:delayed?Math.max(0,(p-.32)/.68):p,reverse:phase!=='qrs',waveColor:phase==='t'?[.3,.76,.91] as Vector:[1,.78,.27] as Vector}:{} )};
}
