import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
const code=buildSync({entryPoints:['src/report/report.ts'],bundle:true,write:false,format:'cjs',platform:'node',packages:'external'}).outputFiles[0].text;
const module={exports:{}};
new Function('require','module','exports',code)(createRequire(import.meta.url),module,module.exports);
const {buildReport:build,reportBytes,printableText}=module.exports;
// The expanded technical export retains full tracings and audit details.
const buildReport=(item,analysis,language,options={})=>build(item,analysis,language,{...options,detailed:true});
import {names,text,confidence,fixture} from './testFixture.mjs';
const pageText=doc=>doc.internal.pages.flat().join('\n').replace(/\\([()\\])/g,'$1');
test('PDF contains all twelve lead analyses, five measurements, manual corrections and references',()=>{
 const {item,analysis}=fixture();const doc=buildReport(item,analysis,'en'),content=pageText(doc);
 for(const lead of names)assert.ok(content.includes(`Lead ${lead}`),lead);
 for(const label of ['Heart rate: 75','PR interval: 180','QRS duration: 90','Uncorrected QT interval: 400','Frontal QRS axis: 0'])assert.ok(content.includes(label),label);
 for(const required of ['manually corrected','Clinical reference','measurement-test-1.0','25 mm/s','10 mm/mV','Alternative interpretation','P/QRS boundaries and T offset'])assert.ok(content.includes(required),required);
 assert.ok(doc.getNumberOfPages()>=5);assert.ok(!content.includes('NaN'));assert.ok(!content.includes('PATIENT-SECRET'));assert.ok(!content.includes('PRIVATE-SOURCE'));
 assert.ok(!content.includes('100%'),'uncalibrated confidence must not print a probability');
 const bytes=new Uint8Array(doc.output('arraybuffer'));assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');assert.ok(bytes.length>20000);
});
test('Spanish report localizes missing leads and preserves technical accents without app navigation',()=>{
 const {item,analysis}=fixture();delete item.traces.V6;analysis.leads.find(l=>l.lead==='V6').status='missing';
 const content=pageText(buildReport(item,analysis,'es'));
 assert.ok(content.includes('Derivación V6'));assert.ok(content.includes('Sin señal disponible para esta derivación.'));
 assert.ok(content.includes('Impresión presuntiva'));assert.ok(content.includes('Calibración impresa'));assert.ok(!content.includes('Casos de ejemplo'));assert.ok(!content.includes('Descartar caso privado'));
 assert.equal(printableText('QRS ≥ 120 ms · ≈ 75 lpm · 5 × 5 mm'),'QRS >= 120 ms · ~ 75 lpm · 5 x 5 mm');
});
test('incomplete or invalid signals still produce a valid PDF with explicit unevaluable leads',()=>{
 const {item,analysis}=fixture();item.traces={I:{mv:[0,NaN,1],seconds:1}};
 for(const lead of analysis.leads)lead.status=lead.lead==='I'?'poor-quality':'missing';
 analysis.measurements[0].value=null;analysis.measurements[0].status='not-evaluable';analysis.measurements[0].reason=text('No reliable complexes.');
 const doc=buildReport(item,analysis,'en'),content=pageText(doc);
 assert.ok(content.includes('No reliable complexes.'));assert.ok(content.includes('No signal available for this lead.'));assert.ok(!content.includes('NaN'));
 assert.equal(new TextDecoder().decode(reportBytes(item,analysis,'en').slice(0,5)),'%PDF-');
});


test('manual fiducial limits are printed exactly and rendered separately from automatic phase markers',()=>{
 const {item,analysis}=fixture();
 const pr=analysis.measurements.find(m=>m.key==='prMs');pr.value=178;pr.windows=[{lead:'II',start:.123,end:.301,source:'manual'}];
 const axis=analysis.measurements.find(m=>m.key==='axisDeg');axis.windows=[{lead:'I',start:6.72,end:6.84,source:'manual'},{lead:'aVF',start:1.024,end:1.144,source:'manual'}];
 // Keep the original automatic QRS boundaries different: the report must show both sources.
 const qrs=analysis.measurements.find(m=>m.key==='qrsMs');qrs.windows=[{lead:'II',start:.4,end:.49,source:'automatic'}];
 const doc=buildReport(item,analysis,'en'),content=pageText(doc);
 assert.ok(content.includes('PR interval: 178 ms'));
 for(const range of ['0.123 - 0.301 s','6.72 - 6.84 s','1.024 - 1.144 s','0.4 - 0.49 s'])assert.ok(content.includes(range),range);
 assert.ok(content.includes('178 ms'));assert.ok(content.includes('Purple marks: manual boundaries'));
 assert.ok(content.includes('0.43 0.18 0.59 RG'),'manual windows have their own purple chart guides');
 assert.ok(!content.includes('NaN'));assert.ok(doc.getNumberOfPages()>=5);
});

test('report shows local numeric interval brackets, morphology and optional clinical context',()=>{
 const {item,analysis}=fixture();
 item.clinicalContext={ageYears:67,sexAtBirth:'female',symptoms:['chest-pain','dyspnea'],onset:'hours',history:['hypertension'],medications:['qt-prolonging'],electrolytes:'known-abnormal',paced:'unknown',freeText:'Chest pain began two hours ago.'};
 const mv=Array(2500).fill(.2);mv[110]=1.2;mv[120]=-.3;mv[138]=.35;
 item.traces.II={mv,seconds:10,quality:.95};
 const detail=analysis.leads.find(d=>d.lead==='II');
 detail.markers=[{phase:'p',start:.18,end:.26},{phase:'qrs',start:.4,end:.49},{phase:'t',start:.62,end:.85}];
 detail.observations=[text('Predominantly positive QRS with a terminal negative deflection.')];
 const content=pageText(buildReport(item,analysis,'en',{includeFreeText:true}));
 for(const value of ['PR local 220 ms','QRS local 90 ms','QT local 450 ms','Representative complex','Local amplitudes','R 1 mV','Q/S -0.5 mV','ST(J+60) 0.15 mV','pre-QRS reference 0.2 mV','Predominantly positive QRS','Provided clinical context','Age: 67 years','Sex at birth: Female','Symptoms: Chest pain, Dyspnea','QT-prolonging drugs','Chest pain began two hours ago.'])assert.ok(content.includes(value),value);
 // The aggregate remains 400 ms while the representative local QT is 450 ms.
 assert.ok(content.includes('Uncorrected QT interval: 400 ms'));
 const spanish=pageText(buildReport(item,analysis,'es'));assert.ok(spanish.includes('Contexto clínico aportado'));assert.ok(spanish.includes('Síntomas: Dolor torácico, Disnea'));
});

test('manual representative brackets take priority, and context free text is bounded',()=>{
 const {item,analysis}=fixture();
 item.clinicalContext={freeText:'x'.repeat(1000)+'NEVER-INCLUDE-TAIL'};
 const detail=analysis.leads.find(d=>d.lead==='II');detail.markers=[{phase:'p',start:.18,end:.26},{phase:'qrs',start:.4,end:.49},{phase:'t',start:.62,end:.85}];
 analysis.measurements.find(m=>m.key==='qtMs').windows=[{lead:'II',start:.25,end:.75,source:'manual'}];
 const content=pageText(buildReport(item,analysis,'en',{includeFreeText:true}));
 assert.ok(content.includes('QT manual 500 ms'));assert.ok(!content.includes('QT local 450 ms'));assert.ok(content.includes('text truncated to 1000 characters'));assert.ok(!content.includes('NEVER-INCLUDE-TAIL'));
});

test('free notes are excluded by default and included only with explicit export options',()=>{
 const {item,analysis}=fixture();item.clinicalContext={ageYears:67,freeText:'SENTINEL-NOTE-123'};
 assert.ok(!pageText(buildReport(item,analysis,'en')).includes('SENTINEL-NOTE-123'));
 assert.ok(pageText(buildReport(item,analysis,'en',{includeFreeText:true})).includes('SENTINEL-NOTE-123'));
 assert.ok(pageText(buildReport(item,analysis,'en')).includes('Age: 67 years'));
});
test('large complexes use the same display gain across all leads without clipping',()=>{
 const {item,analysis}=fixture();item.traces={I:{mv:[0,4,0,-4,0],seconds:1},V5:{mv:[0,.8,0,-.8,0],seconds:1}};
 const text=pageText(buildReport(item,analysis,'en'));assert.ok(text.includes('common gain for every lead'));assert.ok(text.includes('10 mm/mV'));assert.ok(!text.includes('2.5 mm/mV'));assert.ok(!text.includes('5 mm/mV'));
});
test('pasted OpenEvidence content is excluded by default and attributed explicitly when exported',()=>{
 const {item,analysis}=fixture();item.externalEvidence={provider:'OpenEvidence',entryMethod:'manual-paste',text:'MANUALLY-PASTED-EVIDENCE',citationText:'https://pubmed.ncbi.nlm.nih.gov/123/ javascript:bad'};
 assert.ok(!pageText(buildReport(item,analysis,'en')).includes('MANUALLY-PASTED-EVIDENCE'));
 const text=pageText(buildReport(item,analysis,'en',{includeExternalEvidence:true}));assert.ok(text.includes('MANUALLY-PASTED-EVIDENCE'));assert.ok(text.includes('pasted by the user'));assert.ok(text.includes('https://pubmed.ncbi.nlm.nih.gov/123/'));assert.ok(!text.includes('javascript:bad'));
});
test('Wave-Maven diagnosis is a source reference, separate from the computed impression',()=>{
 const {item,analysis}=fixture();item.educationalReference={provider:'ECG Wave-Maven',caseId:1,context:{es:'Caso',en:'Case'},diagnosis:{es:'QT largo de referencia',en:'Source long QT'},sourceUrl:'https://ecg.bidmc.harvard.edu/maven/',attribution:'ECG Wave-Maven / BIDMC'};
 const text=pageText(buildReport(item,analysis,'en'));assert.ok(text.includes('Wave-Maven reference diagnosis'));assert.ok(text.includes('Source long QT'));assert.ok(text.includes('not a prediction'));assert.ok(text.includes('An interpretation requiring confirmation.'));
});

test('report preserves delta candidates and labels their limits without asserting a clinical syndrome',()=>{
 const {item,analysis}=fixture();
 const delta={status:'supported',polarity:'negative',durationMs:44,initialSlopeMvPerMs:-.005,terminalSlopeMvPerMs:-.03,repeatableBeats:3,analyzedBeats:4,windows:[{start:.4,end:.444,peak:.43,polarity:'negative'}]};
 analysis.preexcitation={status:'supported',supportingLeads:['III','V1','aVL'],limitations:['Operational unvalidated detector.'],leads:{III:delta}};
 analysis.leads.find(l=>l.lead==='III').features.deltaEvidence=delta;
 const content=pageText(buildReport(item,analysis,'en'));
 assert.ok(content.includes('Initial QRS activation and preexcitation'));
 assert.ok(content.includes('44 ms'));assert.ok(content.includes('3/4 supported beats'));
 assert.ok(content.includes('not pathway localization or syndrome confirmation'));
 assert.ok(content.includes('Operational unvalidated detector.'));
});
