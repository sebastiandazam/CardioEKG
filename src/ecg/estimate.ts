import type {DeltaEvidence,PreexcitationAggregate} from './preexcitation';
import type {Lead,Trace,Measurements,Marker} from '../cases';
export type MeasurementKey=keyof Measurements;
export type MeasurementReason='quality'|'beats'|'short'|'pUnavailable'|'af'|'qrsUnavailable'|'tUnavailable'|'axisNotComparable'|'axisUnavailable'|'detectionUncertain';
export type MeasurementReasons=Partial<Record<MeasurementKey,MeasurementReason>>;
const messages:Record<MeasurementReason,[string,string]>={
 detectionUncertain:['Hay intervalos largos que pueden corresponder a pausas o complejos no detectados. Revisa los latidos; no se calcula frecuencia ni QTc como si la detección fuera completa.','Long intervals may reflect pauses or missed complexes. Review beat detection; rate and QTc are withheld rather than assuming complete detection.'],
 quality:['Señal ausente, no calibrada o con calidad insuficiente.','Signal missing, uncalibrated or of insufficient quality.'],
 beats:['No se identificaron suficientes complejos repetibles.','Not enough repeatable complexes could be identified.'],
 short:['Registro demasiado corto para esta estimación.','Recording too short for this estimate.'],
 pUnavailable:['No se delimitó una onda P reproducible. Usa el marcado manual.','A reproducible P wave could not be delineated. Use manual calipers.'],
 af:['PR no aplicable en el caso etiquetado como fibrilación auricular.','PR is not applicable in the case labeled as atrial fibrillation.'],
 qrsUnavailable:['No se delimitaron inicio y final del QRS con suficiente consistencia.','QRS onset and offset could not be delineated consistently.'],
 tUnavailable:['Final de T incierto o superpuesto a otro latido. Usa el marcado manual.','T-wave offset uncertain or overlapping another beat. Use manual calipers.'],
 axisNotComparable:['Confirma que I y aVF corresponden a latidos comparables y tienen la misma calibración.','Confirm that I and aVF contain comparable beats with the same calibration.'],
 axisUnavailable:['Se necesitan I y aVF con QRS delimitables y área neta suficiente.','Leads I and aVF with delineable QRS and sufficient net area are required.'],
};
export function measurementReason(reason:MeasurementReason|undefined,language:'es'|'en') {return reason?messages[reason][language==='es'?0:1]:'';}
const median=(a:number[])=>{if(!a.length)return NaN;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;};
const quantile=(a:number[],p:number)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(p*b.length))]??0;};
function average(a:number[],radius:number){const sum=[0];for(const v of a)sum.push(sum.at(-1)!+v);return a.map((_,i)=>{const lo=Math.max(0,i-radius),hi=Math.min(a.length,i+radius+1);return (sum[hi]-sum[lo])/(hi-lo);});}
const fs=250;
type Prepared={filtered:number[];smooth:number[]};
function prepare(trace:Trace|undefined):Prepared|null {
 if(!trace||trace.seconds<1.2||trace.mv.length<80||(trace.quality!==undefined&&trace.quality<.8)||!trace.mv.every(Number.isFinite))return null;
 const rate=trace.mv.length/trace.seconds;if(rate<100||rate>10000)return null;
 const values=Array.from({length:Math.floor(trace.seconds*fs)},(_,i)=>{const at=i*rate/fs,lo=Math.floor(at),hi=Math.min(trace.mv.length-1,lo+1);return trace.mv[lo]+(trace.mv[hi]-trace.mv[lo])*(at-lo);});
 const smooth=average(values,1),baseline=average(smooth,Math.round(fs*.3));
 return {filtered:smooth.map((v,i)=>v-baseline[i]),smooth};
}
function peaks(signal:number[]):number[] {
 const high=average(signal,Math.round(fs*.045));
 const band=signal.map((v,i)=>v-high[i]);
 const energy=average(band.map((v,i)=>i?Math.pow(v-band[i-1],2):0),Math.round(fs*.025));
 const floor=quantile(energy,.5),ceiling=quantile(energy,.98);
 if(ceiling<.000012||ceiling-floor<.000008)return [];
 const threshold=floor+(ceiling-floor)*.25,result:number[]=[];
 for(let i=Math.round(fs*.16);i<signal.length-fs*.16;i++) {
  if(energy[i]<threshold||energy[i]<energy[i-1]||energy[i]<=energy[i+1])continue;
  const last=result.at(-1);
  if(last===undefined||i-last>fs*.26)result.push(i);else if(energy[i]>energy[last])result[result.length-1]=i;
 }
 return result.map(at=>{let best=at;for(let j=Math.max(0,at-15);j<=Math.min(signal.length-1,at+15);j++)if(Math.abs(band[j])>Math.abs(band[best]))best=j;return best;}).filter((v,i,a)=>!i||v-a[i-1]>fs*.24);
}
/** Whole-recording features beyond the five headline measurements (null when not measurable). */
export type GlobalFeatures={preexcitation?:PreexcitationAggregate;pAxisDeg:number|null;tAxisDeg:number|null;prVariable:boolean|null;pConductedFraction:number|null;pRateBpm?:number|null;pQrsRatio?:number|null;groupedBeating?:boolean|null;qrsAlternans:boolean|null;pPresent?:boolean|null;flutterSuspected?:boolean;atrialRateBpm?:number|null;wenckebachSuspected?:boolean;pvcCount?:number;pacCount?:number};
export type LeadDetail={/** Beat-by-beat R amplitude (mV) in this lead. */beatRMv:number[];peaksSeconds:number[];qrsMs:number|null;pOnsetOffsetMs:number|null;tOnsetOffsetMs?:number|null;tEndOffsetMs:number|null;qrsOnsetOffsetMs:number|null;qrsEndOffsetMs:number|null;netQrsMvMs:number|null;jMv:number|null;stMv:number|null;rMv:number|null;sMv:number|null;tMv:number|null;pMv:number|null;noiseMv:number;rrCv:number|null;beatCount:number;completeBeatCount:number;morphology:Morphology};
/** Waveform morphology of the median beat in one lead (mV relative to the PR baseline, ms). */
export type Morphology={deltaEvidence?:DeltaEvidence;stSlope:'up'|'flat'|'down'|null;prSegMv:number|null;tQrsRatio:number|null;deltaSlurMs:number|null;qMv:number|null;qMs:number|null;qsComplex:boolean;rPeakMs:number|null;rPrime:boolean|null;notched:boolean|null;pMs:number|null;pTerminalMv:number|null;pTerminalMs:number|null;pBiphasic:boolean|null};
const noMorphology:Morphology={stSlope:null,prSegMv:null,tQrsRatio:null,deltaSlurMs:null,qMv:null,qMs:null,qsComplex:false,rPeakMs:null,rPrime:false,notched:false,pMs:null,pTerminalMv:null,pTerminalMs:null,pBiphasic:false};
type Delineation={morphology:Morphology;raw:number[];before:number;pTemplate:number[]|null;signal:number[];peaks:number[];qrs:[number,number]|null;p:number|null;t:number|null;area:number|null;noise:number;completeBeatCount:number;jMv:number|null;stMv:number|null;rMv:number|null;sMv:number|null;tMv:number|null;pMv:number|null;tAmbiguous:boolean};
function delineate(signal:number[],detected:number[],skipP:boolean,raw:number[]=signal):Delineation {
 const intervals=detected.slice(1).map((v,i)=>v-detected[i]);
 const rr=intervals.length?median(intervals):fs*.8;
 const before=Math.round(Math.min(.36,rr/fs*.45)*fs),after=Math.round(Math.min(.6,rr/fs*.72)*fs);
 const usable=detected.filter(r=>r>=before&&r+after<signal.length);
 const empty={morphology:noMorphology,raw,before:0,pTemplate:null as number[]|null,signal,peaks:detected,qrs:null,p:null,t:null,area:null,noise:0,completeBeatCount:usable.length,jMv:null,stMv:null,rMv:null,sMv:null,tMv:null,pMv:null,tAmbiguous:false};
 // One complete complex may support QRS area/duration, never PR/QT reproducibility.
 if(!usable.length)return empty;
 const beats=usable.map(r=>{const b=raw.slice(r-before,r+after+1),base=median(b.slice(Math.max(0,before-30),before-18));return b.map(v=>v-base);});
 const template=Array.from({length:before+after+1},(_,i)=>median(beats.map(b=>b[i])));
 const derivative=template.map((v,i)=>i?Math.abs(v-template[i-1]):0),env=average(derivative,2);
 const noise=Math.max(.0015,median(signal.slice(1).map((v,i)=>Math.abs(v-signal[i])))*.7);
 const start=Math.max(3,before-35),end=Math.min(env.length-3,before+45);
 let emax=0,at=before;for(let i=start;i<=end;i++)if(env[i]>emax){emax=env[i];at=i;}
 if(emax<noise*2.5)return {...empty,noise};
 const threshold=Math.max(noise*1.7,emax*.085),quiet=4;
 let left=at,right=at,run=0;
 for(let i=at;i>=start;i--){if(env[i]<threshold)run++;else run=0;if(run>=quiet){left=i+quiet;break;}left=i;}
 run=0;for(let i=at;i<=end;i++){if(env[i]<threshold)run++;else run=0;if(run>=quiet){right=i-quiet;break;}right=i;}
 const qrs:[number,number]=[left-before,right-before],duration=(right-left)/fs;
 if(duration<.036||duration>.3||left<=start||right>=end)return {...empty,noise};
 // Recenter at the PR segment after finding QRS; the P peak is not a baseline.
 const localBase=median(template.slice(Math.max(0,left-8),Math.max(1,left-2)));
 for(let i=0;i<template.length;i++)template[i]-=localBase;
 for(const beat of beats){const base=median(beat.slice(Math.max(0,left-8),Math.max(1,left-2)));for(let i=0;i<beat.length;i++)beat[i]-=base;}
 let p:number|null=null,t:number|null=null,pMv:number|null=null,tAmbiguous=false;
 let pShape:Pick<Morphology,'pMs'|'pTerminalMv'|'pTerminalMs'|'pBiphasic'>={pMs:null,pTerminalMv:null,pTerminalMs:null,pBiphasic:false};
 const wave=(lo:number,hi:number)=>{let index=lo;for(let i=lo;i<=hi;i++)if(Math.abs(template[i])>Math.abs(template[index]))index=i;return index;};
 if(!skipP&&usable.length>=2) {
  const plo=Math.max(3,before-Math.round(fs*.32)),phi=left-Math.round(fs*.035);
  if(phi>plo+5){const peak=wave(plo,phi);
   // TP baseline can differ from the PR baseline because of drift or the preceding T.
   // A P onset must return to its *local* pre-wave baseline, not an arbitrary zero.
   const baselineEnd=Math.max(plo+1,peak-Math.round(fs*.055));
   const pBase=median(template.slice(plo,baselineEnd)),amp=Math.abs(template[peak]-pBase);
   const repeatable=beats.filter(b=>{const base=median(b.slice(plo,baselineEnd));let k=Math.max(plo,peak-10);for(let i=k;i<=Math.min(phi,peak+10);i++)if(Math.abs(b[i]-base)>Math.abs(b[k]-base))k=i;return Math.sign(b[k]-base)===Math.sign(template[peak]-pBase)&&Math.abs(k-peak)<=8&&Math.abs(b[k]-base)>amp*.35;}).length/beats.length;
   if(amp>Math.max(.025,noise*5)&&repeatable>=.75){let onset=peak;const tolerance=Math.max(noise*2,amp*.12);
    while(onset>plo&&Math.abs(template[onset]-pBase)>tolerance)onset--;
    const quietBefore=template.slice(Math.max(plo,onset-4),onset+1).filter(v=>Math.abs(v-pBase)<=tolerance*1.5).length>=3;
    if(onset>plo&&peak-onset>=3&&peak-onset<=fs*.12&&quietBefore&&(left-onset)/fs>=.08){p=onset-before;pMv=template[peak]-pBase;
     // P duration: last sample still clearly off the baseline before the PR segment; terminal opposite phase (V1).
     const stop=left-Math.round(fs*.02);let last=peak,termMin=0,termCount=0;
     for(let i=peak;i<stop;i++){const v=template[i]-pBase;if(Math.abs(v)>tolerance)last=i;if(Math.sign(v)===-Math.sign(pMv)&&Math.abs(v)>tolerance){termCount++;if(Math.abs(v)>Math.abs(termMin))termMin=v;}}
     pShape={pMs:(last-onset)*1000/fs,pTerminalMv:termCount?termMin:null,pTerminalMs:termCount?termCount*1000/fs:null,pBiphasic:termCount*1000/fs>=20};}
   }
  }
 }
 const tlo=right+Math.round(fs*.045),thi=template.length-5;
 if(usable.length>=2&&thi>tlo+8){const peak=wave(tlo,thi),amp=Math.abs(template[peak]);
  if(amp>Math.max(.035,noise*6)&&peak>tlo&&peak<thi-4){let offset=peak,quietRun=0;for(let i=peak+1;i<=thi;i++){
   if(Math.abs(template[i])<Math.max(noise*2,amp*.12))quietRun++;else quietRun=0;
   if(quietRun>=5){offset=i-4;break;}
  }// Tangent to the steepest terminal T slope avoids measuring residual baseline drift as T.
   let steep=0,tangent:number|null=null;const sign=Math.sign(template[peak]);
   for(let i=peak+3;i<Math.min(thi-3,peak+Math.round(fs*.18));i++){
    const slope=(template[i+3]-template[i-3])/6;
    if(-sign*slope>steep){steep=-sign*slope;const cross=i-template[i]/slope;if(cross>peak+4&&cross<=thi)tangent=cross;}
   }
   if(tangent!==null&&steep>noise*.8)offset=Math.round(tangent);
   // Do not collapse a substantial biphasic second component into a falsely short QT.
   let opposite=template.slice(peak+4,Math.min(thi+1,peak+Math.round(fs*.22))).some(v=>v*sign<-Math.max(amp*.25,noise*5));
   for(let i=tlo+10;i<peak-10;i++){
    const local=Math.abs(template[i]),flanks=Math.max(Math.abs(template[i-10]),Math.abs(template[i+10]));
    if(template[i]*sign<-Math.max(amp*.25,noise*5)&&local-flanks>Math.max(amp*.12,noise*4))opposite=true;
   }
   const endSettles=offset>peak+4&&offset<=thi&&Math.abs(template[Math.min(thi,offset+3)])<Math.max(amp*.3,noise*4);
   // A later separate deflection (possible U/next P) must not define T end.
   let firstBaseline:number|null=null;
   for(let i=tlo+4;i<peak-4;i++)if(template.slice(i,i+4).every(v=>Math.abs(v)<Math.max(noise*2,amp*.1)))firstBaseline=i;
   // A quiet ST segment before a delayed T is not evidence of a preceding T/U pair.
   // Require a distinct earlier lobe with prominence on both sides before rejecting the later wave.
   let precedingLobe=false;
   if(firstBaseline!==null)for(let i=tlo+10;i<firstBaseline-10;i++){
    const local=Math.abs(template[i]),flanks=Math.max(Math.abs(template[i-10]),Math.abs(template[i+10]));
    if(local>Math.max(amp*.25,noise*5)&&local-flanks>Math.max(amp*.2,noise*4))precedingLobe=true;
   }
   const separatedLatePeak=firstBaseline!==null&&precedingLobe&&peak-firstBaseline>fs*.02&&peak-tlo>fs*.18;
   tAmbiguous=opposite||separatedLatePeak;
   if(!opposite&&!separatedLatePeak&&endSettles&&(offset-left)/fs>=.18&&(offset-left)/fs<=.65)t=offset-before;}
 }
 const baseline=median(template.slice(Math.max(0,left-10),Math.max(1,left-2)));
 const area=template.slice(left,right+1).reduce((sum,v)=>sum+v-baseline,0)/fs;
 const qrsValues=template.slice(left,right+1).map(v=>v-baseline);
 const stAt=right+Math.round(fs*.06),stMv=stAt+2<template.length?median(template.slice(stAt-2,stAt+3))-baseline:null;
 const tPeak=tlo<template.length?wave(tlo,Math.min(thi,template.length-1)):null;
 // QRS morphology on the median beat: initial Q, R-peak time, R' / notching.
 const deflection=Math.max(.03,noise*3),rMax=Math.max(0,...qrsValues);
 let rIndex=0;qrsValues.forEach((v,i)=>{if(v>qrsValues[rIndex])rIndex=i;});
 // A q wave is the negative deflection BEFORE the R wave. When a small r (above 0.02 mV) precedes the
 // deepest negative deflection, that deflection is an S wave (rS), not a Q wave (QS) — even if r is below
 // the noise-scaled threshold.
 let firstPositive=qrsValues.findIndex(v=>v>deflection);if(firstPositive<0)firstPositive=qrsValues.length;
 const smallR=qrsValues.findIndex(v=>v>.02);
 if(smallR>=0&&smallR<firstPositive&&smallR<qrsValues.indexOf(Math.min(...qrsValues)))firstPositive=smallR;
 const initial=qrsValues.slice(0,firstPositive),qMin=initial.length?Math.min(...initial):0;
 let qMv:number|null=null,qMs:number|null=null;
 if(qMin<-deflection){qMv=qMin;let end=firstPositive;for(let i=initial.indexOf(qMin);i<qrsValues.length;i++)if(qrsValues[i]>=0){end=i;break;}qMs=end*1000/fs;}
 const positivePeaks:number[]=[];
 for(let i=1;i<qrsValues.length-1;i++)if(qrsValues[i]>=qrsValues[i-1]&&qrsValues[i]>qrsValues[i+1]&&qrsValues[i]>Math.max(.08,rMax*.2))positivePeaks.push(i);
 let rPrime=false,notched=false;
 for(let k=1;k<positivePeaks.length;k++){const a=positivePeaks[k-1],b=positivePeaks[k],dip=Math.min(...qrsValues.slice(a,b+1)),smaller=Math.min(qrsValues[a],qrsValues[b]);
  if(smaller-dip>=Math.max(.05,smaller*.25)){if(dip<0)rPrime=true;else notched=true;}}
 // ST shape: change from J to J+80 ms. PR segment against the TP segment at the start of the window (needs room before P).
 const j80=right+Math.round(fs*.08),jLevel=template[Math.min(template.length-1,right)]-baseline;
 const stSlope:Morphology['stSlope']=j80<template.length?(template[j80]-baseline-jLevel>.05?'up':template[j80]-baseline-jLevel<-.05?'down':'flat'):null;
 let prSegMv:number|null=null;
 if(p!==null){const onsetIdx=p+before,tp=template.slice(0,Math.min(10,onsetIdx-2));if(onsetIdx>=6&&tp.length>=4){const pr=template.slice(Math.max(onsetIdx+1,left-Math.round(fs*.04)),left-1);if(pr.length>=3)prSegMv=median(pr)-median(tp);}}
 // Initial QRS slurring: time from onset until the slope first reaches 40 % of its maximum (a delta wave lengthens it).
 const slopes=template.slice(left,right+1).map((v,i,a)=>i?Math.abs(v-a[i-1]):0),maxSlope=Math.max(...slopes);
 const steep=slopes.findIndex(v=>v>=maxSlope*.4);
 const deltaSlurMs=maxSlope>0&&steep>=0?steep*1000/fs:null;
 const peakToPeak=Math.max(0,...qrsValues)-Math.min(0,...qrsValues);
 const tQrsRatio=tPeak!==null&&peakToPeak>.05?Math.abs(template[tPeak]-baseline)/peakToPeak:null;
 const morphology:Morphology={stSlope,prSegMv,tQrsRatio,deltaSlurMs,qMv,qMs,qsComplex:firstPositive===qrsValues.length&&qMin<-deflection,rPeakMs:rMax>Math.max(.05,noise*4)?rIndex*1000/fs:null,rPrime,notched,...pShape};
 return {morphology,raw,before,pTemplate:p!==null?template.slice(p+before,left):null,signal,peaks:detected,qrs,p,t,area,noise,completeBeatCount:usable.length,jMv:median(template.slice(Math.max(0,right-1),right+2))-baseline,stMv,
   rMv:Math.max(0,...qrsValues),sMv:Math.min(0,...qrsValues),tMv:tPeak!==null?template[tPeak]-baseline:null,pMv,tAmbiguous};
}
export function estimateECG(traces:Partial<Record<Lead,Trace>>,options:{pattern?:string;axisComparable?:boolean;simultaneous?:boolean}={}) {
 const measurements:Measurements={rateBpm:null,prMs:null,qrsMs:null,qtMs:null,axisDeg:null},reasons:MeasurementReasons={},markersByLead:Partial<Record<Lead,Marker[]>>={};
 const details=new Map<Lead,Delineation>();
 for(const lead of Object.keys(traces) as Lead[]){const signal=prepare(traces[lead]);if(signal)details.set(lead,delineate(signal.filtered,peaks(signal.filtered),false,signal.smooth));}
 const preferred=details.get('II');
 const rhythmEntry=preferred?.qrs&&preferred.peaks.length>=3?['II',preferred] as const:[...details.entries()].filter(([,d])=>d.qrs).sort(([,a],[,b])=>b.peaks.length-a.peaks.length)[0];
 const rhythm=rhythmEntry?.[1];
 if(rhythm&&rhythm.peaks.length>=3){const rr=rhythm.peaks.slice(1).map((r,i)=>(r-rhythm.peaks[i])/fs);if(rr.some(v=>v>median(rr)*1.65)){reasons.rateBpm='detectionUncertain';}else if(rr.every(v=>v>=.25&&v<=2.5))measurements.rateBpm=Math.round(60/(rr.reduce((s,v)=>s+v,0)/rr.length));}
 const stable=(values:number[],tolerance:number)=>values.length&&quantile(values,.8)-quantile(values,.2)<=tolerance?Math.round(median(values)):null;
 const entries=[...details.values()].filter(d=>d.qrs);
 // Multilead consensus when available; a single calibrated lead remains an estimate.
 // Sequential windows support a maximum local duration, never a global simultaneous QRS.
 let qrsMethod:'global-simultaneous'|'maximum-supported-local'|'not-evaluable'='not-evaluable';
 const supported=entries.filter(d=>d.completeBeatCount>=1&&d.noise<.03);
 measurements.qrsMs=supported.length?Math.round(Math.max(...supported.map(d=>(d.qrs![1]-d.qrs![0])*1000/fs))):null;
 if(supported.length)qrsMethod='maximum-supported-local';
 if(options.simultaneous&&rhythm?.qrs){
  const global:number[]=[];
  for(const anchor of rhythm.peaks){
   const boundaries=supported.flatMap(d=>{const p=d.peaks.reduce((a,b)=>Math.abs(b-anchor)<Math.abs(a-anchor)?b:a,Infinity);return Number.isFinite(p)&&Math.abs(p-anchor)<=fs*.14?[[p+d.qrs![0],p+d.qrs![1]]]:[];});
   if(boundaries.length>=2){const duration=(Math.max(...boundaries.map(b=>b[1]))-Math.min(...boundaries.map(b=>b[0])))*1000/fs;if(duration>=36&&duration<=300)global.push(duration);}
  }
  if(global.length>=2){measurements.qrsMs=Math.round(median(global));qrsMethod='global-simultaneous';}
 }
 const pLeadName=(['II','V1','I','aVF','V4'] as Lead[]).find(lead=>{const d=details.get(lead);return d?.qrs&&d.p!==null;});
 const pLead=pLeadName?details.get(pLeadName):undefined;
 measurements.prMs=!pLead?null:Math.round((pLead.qrs![0]-pLead.p!)*1000/fs);
 // Repeated multilead evidence of T/U or biphasic ambiguity vetoes an isolated late peak.
 // Otherwise the lowest-amplitude leads could overrule clearer morphology in II/V5.
 const ambiguousT=entries.filter(d=>d.tAmbiguous).length;
 if(ambiguousT>=2&&ambiguousT/entries.length>=.25)for(const d of entries)d.t=null;
 measurements.qtMs=stable(entries.filter(d=>d.t!==null).map(d=>(d.t!-d.qrs![0])*1000/fs),70);
 const I=details.get('I'),avf=details.get('aVF');
 if(options.axisComparable&&I?.area!==null&&I?.area!==undefined&&avf?.area!==null&&avf?.area!==undefined&&Math.hypot(I.area,avf.area)>.004)measurements.axisDeg=Math.round(Math.atan2(avf.area*2/Math.sqrt(3),I.area)*180/Math.PI);
 for(const [lead,d] of details)if(d.qrs){markersByLead[lead]=d.peaks.flatMap(r=>{
  const markers:Marker[]=[{start:(r+d.qrs![0])/fs,end:(r+d.qrs![1])/fs,phase:'qrs'}];
  if(d.p!==null)markers.push({start:(r+d.p)/fs,end:(r+d.qrs![0]-8)/fs,phase:'p'});
  if(d.t!==null)markers.push({start:(r+d.qrs![1]+10)/fs,end:(r+d.t)/fs,phase:'t'});
  return markers.filter(m=>m.start>=0&&m.end>m.start&&m.end<=traces[lead]!.seconds);
 }).sort((a,b)=>a.start-b.start);}
 if(measurements.rateBpm===null&&!reasons.rateBpm)reasons.rateBpm=details.size?'beats':'quality';
 if(measurements.qrsMs===null)reasons.qrsMs=details.size?'qrsUnavailable':'quality';
 if(measurements.prMs===null)reasons.prMs=details.size?'pUnavailable':'quality';
 if(measurements.qtMs===null)reasons.qtMs=details.size?'tUnavailable':'quality';
 if(measurements.axisDeg===null)reasons.axisDeg=options.axisComparable?'axisUnavailable':'axisNotComparable';
 // Global features used by the diagnostic knowledge base.
 const frontal=(i:number|null|undefined,f:number|null|undefined,min:number)=>i!=null&&f!=null&&Math.hypot(i,f)>min?Math.round(Math.atan2(f*2/Math.sqrt(3),i)*180/Math.PI):null;
 const dI=details.get('I'),dF=details.get('aVF');
 const comparable=!!options.axisComparable;
 const global:GlobalFeatures={pAxisDeg:comparable?frontal(dI?.pMv,dF?.pMv,.03):null,tAxisDeg:comparable?frontal(dI?.tMv,dF?.tMv,.05):null,prVariable:null,pConductedFraction:null,qrsAlternans:null};
 if(rhythm?.pTemplate&&rhythm.pTemplate.length>=5&&rhythm.p!==null&&rhythm.qrs){
  // Locate the P wave before every beat by correlation with the median P; PR variability and dropped P waves follow.
  const tpl=rhythm.pTemplate,mean=tpl.reduce((a,v)=>a+v,0)/tpl.length,norm=Math.sqrt(tpl.reduce((a,v)=>a+(v-mean)**2,0));
  const expected=rhythm.p,prs:number[]=[];let found=0,tested=0;
  for(const r of rhythm.peaks){
   const from=r+expected-Math.round(fs*.12),to=r+expected+Math.round(fs*.12);if(from<0||to+tpl.length>=rhythm.raw.length)continue;tested++;
   let best=-1,bestAt=0;
   for(let at=from;at<=to;at++){const seg=rhythm.raw.slice(at,at+tpl.length),m=seg.reduce((a,v)=>a+v,0)/seg.length;let num=0,den=0;for(let k=0;k<tpl.length;k++){num+=(seg[k]-m)*(tpl[k]-mean);den+=(seg[k]-m)**2;}const c=den>0&&norm>0?num/Math.sqrt(den)/norm:0;if(c>best){best=c;bestAt=at;}}
   if(best>=.7){found++;prs.push((r+rhythm.qrs[0]-bestAt)*1000/fs);}
  }
  if(tested>=4){global.pConductedFraction=found/tested;if(prs.length>=4)global.prVariable=Math.max(...prs)-Math.min(...prs)>40;}
 }
 if(rhythm&&rhythm.peaks.length>=6){
  const amps=rhythm.peaks.map(r=>{const w=rhythm.raw.slice(Math.max(0,r-Math.round(fs*.1)),r-Math.round(fs*.06));return w.length?rhythm.raw[r]-median(w):0;});
  const diffs=amps.slice(1).map((v,i)=>v-amps[i]),alternating=diffs.slice(1).filter((v,i)=>Math.sign(v)!==Math.sign(diffs[i])&&v!==0).length;
  const meanAmp=amps.reduce((a,v)=>a+Math.abs(v),0)/amps.length,step=median(diffs.map(Math.abs));
  global.qrsAlternans=alternating>=(diffs.length-1)*.8&&step>=.1&&step>=meanAmp*.1;
 }
 const leadDetails:Partial<Record<Lead,LeadDetail>>={};
 for(const [lead,d] of details){
  const rr=d.peaks.slice(1).map((r,i)=>(r-d.peaks[i])/fs),mean=rr.length?rr.reduce((sum,v)=>sum+v,0)/rr.length:0;
  leadDetails[lead]={beatRMv:d.peaks.map(r=>{const w=d.raw.slice(Math.max(0,r-Math.round(fs*.1)),r-Math.round(fs*.06));return w.length?d.raw[r]-median(w):0;}),peaksSeconds:d.peaks.map(r=>r/fs),qrsMs:d.qrs?(d.qrs[1]-d.qrs[0])*1000/fs:null,
    pOnsetOffsetMs:d.p===null?null:d.p*1000/fs,tEndOffsetMs:d.t===null?null:d.t*1000/fs,
    qrsOnsetOffsetMs:d.qrs?d.qrs[0]*1000/fs:null,qrsEndOffsetMs:d.qrs?d.qrs[1]*1000/fs:null,
    netQrsMvMs:d.area===null?null:d.area*1000,jMv:d.jMv,stMv:d.stMv,rMv:d.rMv,sMv:d.sMv,tMv:d.tMv,pMv:d.pMv,noiseMv:d.noise,
    rrCv:rr.length&&mean>0?Math.sqrt(rr.reduce((sum,v)=>sum+(v-mean)**2,0)/rr.length)/mean:null,beatCount:d.peaks.length,completeBeatCount:d.completeBeatCount,morphology:d.morphology};
 }
 const measurementLeads:Partial<Record<MeasurementKey,Lead[]>>={};
 if(measurements.rateBpm!==null&&rhythmEntry)measurementLeads.rateBpm=[rhythmEntry[0]];
 if(measurements.prMs!==null&&pLeadName)measurementLeads.prMs=[pLeadName];
 if(measurements.qrsMs!==null)measurementLeads.qrsMs=[...details].filter(([,d])=>supported.includes(d)).map(([lead])=>lead);
 if(measurements.qtMs!==null)measurementLeads.qtMs=[...details].filter(([,d])=>d.qrs&&d.t!==null).map(([lead])=>lead);
 if(measurements.axisDeg!==null)measurementLeads.axisDeg=['I','aVF'];
 return {measurements,reasons,markersByLead,leadDetails,measurementLeads,qrsMethod,global};
}

/** Manual caliper values override automatic estimates, including an axis of exactly zero. */
export function withManualMeasurements(automatic:Measurements,manual:Partial<Measurements>) {
 const measurements={...automatic},origins:Partial<Record<MeasurementKey,'automatic'|'caliper'>>={};
 for(const key of Object.keys(measurements) as MeasurementKey[]) {
  const override=manual[key];
  if(override!==null&&override!==undefined&&Number.isFinite(override)){measurements[key]=override;origins[key]='caliper';}
  else if(measurements[key]!==null)origins[key]='automatic';
 }
 return {measurements,origins};
}
