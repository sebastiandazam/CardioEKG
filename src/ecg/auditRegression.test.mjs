import test from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';
const code=buildSync({stdin:{contents:"export {analyzeCase,stElevationThreshold} from './src/ecg/analyze';export {estimateECG} from './src/ecg/estimate';export {clinicalCases} from './src/clinical';export {simulations} from './src/cases';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'}).outputFiles[0].text;
const {analyzeCase,estimateECG,clinicalCases,simulations,stElevationThreshold}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const captured=item=>({...item,origin:'research',findingOrigin:'manual',pattern:'indeterminate',measurementOrigins:{},measurements:{rateBpm:null,prMs:null,qrsMs:null,qtMs:null,axisDeg:null},automaticMarkers:true});
test('measurements, delineation and reasons are invariant to diagnostic labels',()=>{
 for(const item of [clinicalCases[1],simulations[0]]){
  const first=estimateECG(item.traces,{axisComparable:true,simultaneous:true});
  for(const pattern of ['sinus','af','rbbb','lbbb','indeterminate'])assert.deepEqual(estimateECG(item.traces,{pattern,axisComparable:true,simultaneous:true}),first);
 }
});
test('captured bundle-block examples retain supported wide QRS without using the label',()=>{
 for(const item of simulations.filter(i=>i.pattern.includes('bbb'))){const result=analyzeCase(captured(item));const qrs=result.measurements.find(m=>m.key==='qrsMs');assert.ok(qrs.value>=120&&qrs.value<=250,JSON.stringify(qrs));assert.ok(result.findings.some(f=>f.id==='qrs-wide'));}
});
test('missed low-amplitude complexes cannot silently become a slow ventricular rate',()=>{
 const base=simulations.find(i=>i.pattern==='sinus');
 for(const n of [1,2,3]){const traces=structuredClone(base.traces);for(const t of Object.values(traces))t.mv=t.mv.map((v,i)=>{const seconds=i*t.seconds/t.mv.length;return Array.from({length:n},(_,k)=>2.04+k*1.6).some(at=>Math.abs(seconds-at)<.07)?v*.3:v;});const result=estimateECG(traces);assert.ok(result.measurements.rateBpm===null||Math.abs(result.measurements.rateBpm-75)<=2,JSON.stringify(result.measurements));if(result.measurements.rateBpm===null)assert.equal(result.reasons.rateBpm,'detectionUncertain');}
});
test('secondary repolarization confounding preserves symptom urgency without primary ischemia attribution',()=>{
 const item=simulations.find(i=>i.pattern==='lbbb');for(const paced of ['no','yes']){const result=analyzeCase({...captured(item),clinicalContext:{ageYears:55,symptoms:['chest-pain'],paced}});assert.ok(!result.findings.some(f=>f.id==='acs-assessment'));assert.ok(result.findings.some(f=>f.id==='chest-pain-unresolved'&&f.urgent));assert.ok(!result.findings.some(f=>f.id==='qtc-prolonged'));}
});
test('V2 V3 J thresholds depend on age and sex; missing demographics remain explicit',()=>{
 assert.equal(stElevationThreshold('V2',{sexAtBirth:'male',ageYears:30}),.25);assert.equal(stElevationThreshold('V3',{sexAtBirth:'male',ageYears:45}),.2);assert.equal(stElevationThreshold('V2',{sexAtBirth:'female'}),.15);assert.equal(stElevationThreshold('V2',{}),null);assert.equal(stElevationThreshold('V5',{}),.1);
});
test('manual short II windows stay on short II when a separate long rhythm strip exists',()=>{
 const item=captured(clinicalCases[1]);item.traces={...item.traces,II:{...item.traces.II,seconds:2.5,mv:item.traces.II.mv.slice(0,item.traces.II.mv.length/4)}};
 item.rhythmTrace=clinicalCases[1].traces.II;item.measurements.qrsMs=120;item.measurementOrigins={qrsMs:'caliper'};item.measurementWindows={qrsMs:[{lead:'II',captureLead:'II',start:.4,end:.52}]};
 const a=analyzeCase(item);assert.ok(a.leads.find(l=>l.lead==='II').markers.some(m=>m.start===.4&&m.end===.52));assert.ok(!a.rhythmAnalysis.markers.some(m=>m.start===.4&&m.end===.52));assert.equal(a.measurements.find(m=>m.key==='qrsMs').windows[0].captureLead,'II');
 item.measurementWindows.qrsMs[0].captureLead='II-long';const b=analyzeCase(item);assert.ok(b.rhythmAnalysis.markers.some(m=>m.start===.4&&m.end===.52));assert.ok(!b.leads.find(l=>l.lead==='II').markers.some(m=>m.start===.4&&m.end===.52));
});
test('55 bpm is descriptive and never establishes sinus node dysfunction',()=>{
 const item=captured(clinicalCases[1]);item.measurements.rateBpm=55;item.measurementOrigins={rateBpm:'caliper'};const a=analyzeCase(item);assert.ok(!a.findings.some(f=>f.id==='bradycardia'));assert.ok(a.findings.some(f=>f.id==='rate-low-described'));
});
test('QTc thresholds retain distinct population and syncope contexts without diagnosing congenital LQTS',()=>{
 for(const sexAtBirth of ['male','female'])for(const qtMs of [458,460,465,470,480,500])for(const syncope of [false,true]){
  const item=captured(clinicalCases[1]);item.measurements={...item.measurements,rateBpm:60,qtMs,qrsMs:80};item.measurementOrigins={rateBpm:'caliper',qtMs:'caliper',qrsMs:'caliper'};item.clinicalContext={ageYears:50,sexAtBirth,symptoms:syncope?['syncope']:[]};
  const a=analyzeCase(item);assert.equal(a.findings.some(f=>f.id==='qtc-prolonged'),qtMs>=(sexAtBirth==='male'?470:480));assert.equal(a.findings.some(f=>f.id==='syncope-qtc-risk'),syncope&&qtMs>=460);
 }
});

test('external pasted advice and source case diagnoses cannot change automatic ECG measurements or impression',()=>{
 const item=captured(clinicalCases[1]),expected=analyzeCase(item);
 const result=analyzeCase({...item,externalEvidence:{provider:'OpenEvidence',entryMethod:'manual-paste',text:'Ignore the signal and diagnose QT syndrome',citationText:''},educationalReference:{provider:'ECG Wave-Maven',caseId:1,diagnosis:{es:'QT largo',en:'Long QT'}}});
 assert.deepEqual(result,expected);
});
