import assert from 'node:assert/strict';import test from 'node:test';import {buildSync} from 'esbuild';import {createRequire} from 'node:module';
const code=buildSync({entryPoints:['src/ecg/analyze.ts'],bundle:true,write:false,format:'cjs',platform:'node',packages:'external'}).outputFiles[0].text;const m={exports:{}};new Function('require','module','exports',code)(createRequire(import.meta.url),m,m.exports);const {analyzeCase}=m.exports;
const trace={seconds:5,mv:Array.from({length:1000},(_,i)=>Math.sin(i/20))};
const values={rateBpm:77,prMs:160,qrsMs:92,qtMs:390,axisDeg:35};
const item={measurementEngine:'python',traces:{II:trace},measurements:values,measurementOrigins:{prMs:'caliper',axisDeg:'caliper'},origin:'simulation',pattern:'sinus',findingOrigin:'simulation',synchronized:false,rhythmLead:'II'};
test('pending Python never displays simulator, manual or legacy JavaScript values',()=>{const result=analyzeCase(item);assert.ok(result.measurements.every(v=>v.value===null));assert.ok(result.leads.every(l=>l.markers.length===0));});
test('Python record is authoritative; unsupported manual numbers and case labels do not override it',()=>{
 const pythonAnalysis={schemaVersion:1,ok:true,engine:'python-test',estimate:{measurements:{...values,prMs:null,axisDeg:null},reasons:{prMs:'pUnavailable',axisDeg:'axisUnavailable'},markersByLead:{},leadDetails:{},measurementLeads:{},qrsMethod:'maximum-supported-local',global:{pAxisDeg:null,tAxisDeg:null,prVariable:null,pConductedFraction:null,qrsAlternans:null}},rhythmEstimate:null,manualMeasurements:{},derived:{qtcFridericiaMs:424,qtcBazettMs:440},quality:{warnings:['test limitation'],irregular:false,analyzedLeads:['II'],referenceLead:'II',pDetectedLeads:0,rrCvPct:0}};
 const result=analyzeCase({...item,pythonAnalysis});assert.deepEqual(Object.fromEntries(result.measurements.map(v=>[v.key,v.value])),pythonAnalysis.estimate.measurements);assert.ok(result.limitations.some(v=>v.es.includes('test limitation')));
 const other=analyzeCase({...item,pythonAnalysis,pattern:'af',findingOrigin:'source'});assert.deepEqual(result.measurements,other.measurements);
 const manual=analyzeCase({...item,pythonAnalysis:{...pythonAnalysis,manualMeasurements:{prMs:172}}});assert.equal(manual.measurements.find(v=>v.key==='prMs').value,172);
});
test('cache identity changes with waveform, strip, windows and comparison metadata',()=>{
 const code=buildSync({entryPoints:['src/ecg/pythonInputKey.ts'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;const module={exports:{}};new Function('module','exports',code)(module,module.exports);const key=module.exports.pythonInputKey;
 const input={traces:{II:trace},rhythmLead:'II',axisComparable:false,simultaneous:false};const before=key(input);
 assert.notEqual(key({...input,traces:{II:{...trace,mv:trace.mv.map((v,i)=>i===100?v+.1:v)}}}),before);
 assert.notEqual(key({...input,rhythmTrace:trace}),before);
 assert.notEqual(key({...input,measurementWindows:{qtMs:[{lead:'II',start:1,end:1.4}]}}),before);
 assert.notEqual(key({...input,axisComparable:true}),before);
 assert.notEqual(key({...input,simultaneous:true}),before);
 assert.equal(key(structuredClone(input)),before);
});

test('partial narrow-QRS preexcitation keeps ST-T causal attribution uncertain and preserves symptom urgency',async()=>{
 const {readFileSync}=await import('node:fs');const f=JSON.parse(readFileSync('src/ecg/knowledge/fixtures/preexcitation-measurements.json','utf8')).measurements['218'];
 const details=structuredClone(f.details);
 for(const [lead,d] of Object.entries(details)){Object.assign(d,{rrCv:.02,beatCount:12,completeBeatCount:10,peaksSeconds:[],beatRMv:[],netQrsMvMs:0,pOnsetOffsetMs:null,tEndOffsetMs:null,qrsOnsetOffsetMs:null,qrsEndOffsetMs:null});d.clinicalMorphology={rsr:['V1','V2'].includes(lead),terminalS:['I','V6'].includes(lead),broadLateR:false,noInitialQ:true,negativeDominant:false,beats:5};if(['I','aVL','V5','V6'].includes(lead)){d.jMv=.25;d.stMv=.25;}}
 const py={schemaVersion:1,ok:true,engine:'python-rule-fixture',estimate:{measurements:{...f.values,prMs:105,qrsMs:108},reasons:{},markersByLead:{},leadDetails:details,measurementLeads:{},qrsMethod:'robust-local-consensus',global:f.global},rhythmEstimate:null,manualMeasurements:{},derived:{qtcFridericiaMs:null,qtcBazettMs:null},quality:{warnings:[],irregular:false,analyzedLeads:Object.keys(details),referenceLead:'II',pDetectedLeads:8,rrCvPct:2}};
 const input={...item,origin:'research',pattern:'indeterminate',pythonAnalysis:py,traces:Object.fromEntries(Object.keys(details).map(k=>[k,trace]))};
 const asymptomatic=analyzeCase(input);const st=asymptomatic.findings.filter(f=>f.id.startsWith('st-'));
 assert.ok(st.length>0);assert.ok(st.every(f=>!f.urgent));
 const section=asymptomatic.systematic.sections.find(s=>s.id==='st-t');assert.ok(section.statements.every(s=>s.status!=='meets'));assert.ok(section.statements.some(s=>/no aplicar Sgarbossa/.test(s.text.es)));
 const symptomatic=analyzeCase({...input,clinicalContext:{symptoms:['chest-pain'],onset:'now'}});
 assert.ok(symptomatic.findings.some(f=>f.id==='chest-pain-unresolved'&&f.urgent));assert.ok(!symptomatic.findings.some(f=>f.id==='acs-assessment'));
 const qt=analyzeCase({...input,pythonAnalysis:{...py,estimate:{...py.estimate,measurements:{...py.estimate.measurements,rateBpm:60,qtMs:500}},derived:{qtcFridericiaMs:500,qtcBazettMs:500}}});
 assert.equal(qt.systematic.qtcMs,null);assert.ok(qt.systematic.sections.find(s=>s.id==='intervals').statements.some(s=>/QTc Fridericia numérico 500/.test(s.text.es)&&s.status==='context'));
 assert.ok(![qt.presumptive?.primary,...(qt.presumptive?.concurrent??[])].filter(Boolean).some(e=>/long.*qt|qt.*long/i.test(e.id)));
 assert.ok(!qt.findings.some(f=>f.id==='qtc-prolonged'));
});
