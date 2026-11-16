import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSync} from 'esbuild';
import {estimateECG,measurementReason,withManualMeasurements} from './estimate.ts';
function signal({rate=75,axis=45,inverted=false,seconds=10,quality=1,sampleRate=250}={}){
 const pulse=(t,c,w)=>Math.abs(t-c)<w?(1+Math.cos(Math.PI*(t-c)/w))/2:0;
 const beats=Array.from({length:Math.ceil(seconds*rate/60)},(_,i)=>.6+i*60/rate);
 const base=Array.from({length:Math.floor(seconds*sampleRate)},(_,i)=>beats.reduce((v,r)=>{const t=i/sampleRate-r;return v+.12*pulse(t,-.15,.045)-.10*pulse(t,-.03,.014)+1.0*pulse(t,0,.025)-.2*pulse(t,.037,.016)+.30*pulse(t,.24,.10);},0));
 const I=Math.cos(axis*Math.PI/180),aVF=Math.sqrt(3)/2*Math.sin(axis*Math.PI/180);
 return Object.fromEntries([['I',I],['II',inverted?-1:1],['aVF',aVF],['V5',1]].map(([lead,gain])=>[lead,{mv:base.map(v=>v*gain),seconds,quality}]));
}
test('estimates calibrated intervals, rate and all four axis quadrants from synthetic signals',()=>{
 for(const axis of [-120,-45,45,135])for(const inverted of [false,true]){
  const result=estimateECG(signal({axis,inverted}),{axisComparable:true});
  assert.ok(Math.abs(result.measurements.rateBpm-75)<=1,JSON.stringify(result.measurements));
  assert.ok(Math.abs(result.measurements.prMs-150)<=35,JSON.stringify(result.measurements));
  assert.ok(Math.abs(result.measurements.qrsMs-95)<=30,JSON.stringify(result.measurements));
  assert.ok(Math.abs(result.measurements.qtMs-370)<=50,JSON.stringify(result.measurements));
  assert.ok(Math.abs(result.measurements.axisDeg-axis)<=3,JSON.stringify(result.measurements));
  for(const list of Object.values(result.markersByLead))assert.ok(list.every(m=>m.start>=0&&m.end>m.start&&m.end<=10));
 }
});
test('uses actual rate rather than assigning a default and is stable across sample rates',()=>{
 for(const rate of [50,90,120])for(const sampleRate of [125,250,500]){
  const {measurements}=estimateECG(signal({rate,sampleRate}));
  assert.ok(Math.abs(measurements.rateBpm-rate)<=2,JSON.stringify({rate,sampleRate,measurements}));
 }
});
test('abstains for blank, noisy, poor quality and missing calibrated signal; never borrows simulation values',()=>{
 let seed=17;const noise=Array.from({length:2500},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/2**32-.5)*2;});
 for(const traces of [{},{II:{mv:noise,seconds:10}},signal({quality:.2}),{II:{mv:Array(2500).fill(0),seconds:10}},{II:{mv:Array(2500).fill(NaN),seconds:10}}]){
  const r=estimateECG(traces,{axisComparable:true});assert.ok(Object.values(r.measurements).every(v=>v===null));
  assert.ok(Object.keys(r.reasons).length===5);
 }
 const r=estimateECG(signal(),{axisComparable:false});assert.equal(r.measurements.axisDeg,null);assert.equal(r.reasons.axisDeg,'axisNotComparable');
 assert.ok(measurementReason(r.reasons.axisDeg,'es'));assert.ok(measurementReason(r.reasons.axisDeg,'en'));
});
test('real bundled clinical fixtures receive calculated values while AF does not acquire an invented PR',()=>{
 for(const name of ['normal','afib']){
  const record=JSON.parse(fs.readFileSync('src/data/'+name+'.json'));
  const traces=Object.fromEntries(Object.entries(record.signals).map(([lead,mv])=>[lead,{mv,seconds:mv.length/record.sampleRate}]));
  const result=estimateECG(traces,{pattern:name==='afib'?'af':'indeterminate',axisComparable:true});
  assert.ok(result.measurements.rateBpm>40&&result.measurements.rateBpm<210);
  assert.ok(result.measurements.qrsMs>=40&&result.measurements.qrsMs<=200);
  assert.ok(Number.isFinite(result.measurements.axisDeg));
  if(name==='afib'){assert.equal(result.measurements.prMs,null);assert.equal(result.reasons.prMs,'pUnavailable');}
  else assert.ok(Object.values(result.measurements).every(v=>v!==null));
  // Changing physical time must change the measured heart rate, not preserve a stored fixture constant.
  const slowed=estimateECG(Object.fromEntries(Object.entries(traces).map(([lead,t])=>[lead,{...t,seconds:t.seconds*1.2}])),{axisComparable:true});
  assert.ok(Math.abs(slowed.measurements.rateBpm-result.measurements.rateBpm/1.2)<3);
 }
});


test('clinical case adapter defers measurements and markers to the central Python flow',async()=>{
 const code=buildSync({entryPoints:['src/clinical.ts'],bundle:true,write:false,format:'esm',platform:'node'}).outputFiles[0].text;
 const {clinicalCases}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const normal=clinicalCases.find(c=>c.id==='record-normal'),af=clinicalCases.find(c=>c.id==='record-afib');
 assert.ok(Object.values(normal.measurements).every(v=>v===null));
 assert.ok(Object.values(af.measurements).every(v=>v===null));
 assert.equal(normal.markersByLead,undefined);assert.equal(normal.automaticMarkers,true);
 assert.ok(normal.traces.II.mv.length>100);assert.ok(af.traces.II.mv.length>100);assert.equal(normal.synchronized,true);
});
test('manual interval and zero-axis corrections override estimates without erasing remaining estimates',()=>{
 const auto={rateBpm:75,prMs:150,qrsMs:88,qtMs:370,axisDeg:45};
 const result=withManualMeasurements(auto,{prMs:174,qrsMs:null,axisDeg:0});
 assert.deepEqual(result.measurements,{...auto,prMs:174,axisDeg:0});assert.equal(result.origins.prMs,'caliper');assert.equal(result.origins.axisDeg,'caliper');assert.equal(result.origins.qrsMs,'automatic');
});

test('short windows retain one complete complex for QRS and representative area, without inventing PR or QT reproducibility',()=>{
 const traces=signal({rate:65,seconds:2.05});
 const r=estimateECG(traces,{axisComparable:true});
 assert.equal(r.leadDetails.I.completeBeatCount,1);
 assert.equal(r.leadDetails.I.beatCount,2);
 assert.ok(r.measurements.qrsMs>0);assert.ok(r.leadDetails.I.netQrsMvMs>0);
 assert.equal(r.measurements.prMs,null);assert.equal(r.measurements.qtMs,null);
 assert.deepEqual(r.measurementLeads.axisDeg,['I','aVF']);
 assert.ok(r.leadDetails.I.peaksSeconds.every(v=>v>=0&&v<=2.05));
});

test('per-lead features retain signed polarity, calibrated area units and ST relative to PR baseline',()=>{
 const traces=signal({axis:45});
 const beats=Array.from({length:13},(_,i)=>.6+i*.8);
 for(const trace of Object.values(traces))trace.mv=trace.mv.map((v,i)=>v+beats.reduce((sum,r)=>sum+(i/250-r>=.08&&i/250-r<=.18?.15:0),0));
 const r=estimateECG(traces,{axisComparable:true});
 assert.ok(r.leadDetails.II.rMv>.8);assert.ok(r.leadDetails.II.sMv<-.1);
 assert.ok(r.leadDetails.II.pMv>.07);
 assert.ok(Math.abs(r.leadDetails.II.stMv-.15)<.04,JSON.stringify(r.leadDetails.II));
 assert.ok(r.leadDetails.II.netQrsMvMs>5);
 assert.ok(r.measurementLeads.prMs.includes('II'));
});

test('a substantial biphasic T abstains instead of reporting the first component as a complete QT',()=>{
 const traces=signal();const beats=Array.from({length:13},(_,i)=>.6+i*.8);
 const pulse=(t,c,w)=>Math.abs(t-c)<w?(1+Math.cos(Math.PI*(t-c)/w))/2:0;
 for(const trace of Object.values(traces))trace.mv=trace.mv.map((v,i)=>v-beats.reduce((sum,r)=>sum+.4*pulse(i/250-r,.34,.065),0));
 const r=estimateECG(traces,{axisComparable:true});
 assert.equal(r.measurements.qtMs,null);assert.equal(r.reasons.qtMs,'tUnavailable');
 assert.ok(r.measurements.qrsMs!==null);
});

test('a later distinct U wave is not selected as T end',()=>{
 const traces=signal();const beats=Array.from({length:13},(_,i)=>.6+i*.8);
 const pulse=(t,c,w)=>Math.abs(t-c)<w?(1+Math.cos(Math.PI*(t-c)/w))/2:0;
 for(const trace of Object.values(traces))trace.mv=trace.mv.map((v,i)=>v+beats.reduce((sum,r)=>sum+.18*pulse(i/250-r,.45,.045),0));
 const r=estimateECG(traces,{axisComparable:true});
 assert.ok(r.measurements.qtMs===null||r.measurements.qtMs<430,JSON.stringify(r.measurements));
});

test('axis comparability uses simultaneous metadata or stable common-recording windows, never a generic checkbox alone',async()=>{
 const {assessComparability}=await import('./provenance.ts');
 const traces=signal({rate:65,seconds:2.05});
 assert.equal(assessComparability(traces,undefined,true).mode,'simultaneous');
 const provenance={commonRecording:true,commonCalibration:true,timing:'sequential'};
 const result=assessComparability(traces,provenance,false);
 assert.equal(result.comparable,true);assert.equal(result.mode,'representative');assert.equal(result.requiresConfirmation,false);
 assert.equal(assessComparability(traces,{...provenance,commonRecording:false},false).comparable,false);
 assert.equal(assessComparability(traces,{...provenance,commonCalibration:false},true).comparable,false);
 assert.equal(assessComparability(traces,{...provenance,userConfirmedComparable:true},false).mode,'confirmed');
 const incompatible={...traces,aVF:signal({rate:100,seconds:2.05}).aVF};
 assert.equal(assessComparability(incompatible,provenance,false).comparable,false);
 assert.equal(assessComparability({I:traces.I},provenance,false).requiresConfirmation,false);
});

test('slow baseline drift does not become an implausibly early P onset',()=>{
 for(const slope of [-.07,.07]){
  const traces=signal({rate:50});
  for(const trace of Object.values(traces))trace.mv=trace.mv.map((v,i)=>v+slope*(i/250)+.025*Math.sin(i/250*3));
  const r=estimateECG(traces,{axisComparable:true});
  assert.ok(r.measurements.prMs===null||Math.abs(r.measurements.prMs-150)<=40,JSON.stringify(r.measurements));
 }
});

test('a delayed T after a quiet or depressed ST segment is not mislabeled as a separate U wave',()=>{
 const trace=signal({rate:50}).II;const beats=Array.from({length:10},(_,i)=>.6+i*1.2);
 const pulse=(t,c,w)=>Math.abs(t-c)<w?(1+Math.cos(Math.PI*(t-c)/w))/2:0;
 trace.mv=trace.mv.map((v,i)=>v+beats.reduce((sum,r)=>{const t=i/250-r;return sum-.30*pulse(t,.24,.10)+.30*pulse(t,.35,.10)-(t>.08&&t<.25?.04:0);},0));
 const r=estimateECG({II:trace});
 assert.ok(r.measurements.qtMs!==null&&r.measurements.qtMs>=410&&r.measurements.qtMs<=510,JSON.stringify(r.measurements));
});

test('a dominant later U-shaped deflection does not replace an earlier complete T',()=>{
 const traces=signal();const beats=Array.from({length:13},(_,i)=>.6+i*.8);
 const pulse=(t,c,w)=>Math.abs(t-c)<w?(1+Math.cos(Math.PI*(t-c)/w))/2:0;
 for(const trace of Object.values(traces))trace.mv=trace.mv.map((v,i)=>v+beats.reduce((sum,r)=>sum+.48*pulse(i/250-r,.47,.05),0));
 const r=estimateECG(traces);
 assert.ok(r.measurements.qtMs===null||r.measurements.qtMs<430,JSON.stringify(r.measurements));
});
