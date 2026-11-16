import test from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';import {createRequire} from 'node:module';
import {fixture,names,text} from './testFixture.mjs';
const code=buildSync({stdin:{contents:`export {buildReport} from './src/report/report.ts';export {clinicalText} from './src/ecg/presentation.ts';`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',packages:'external'}).outputFiles[0].text;
const m={exports:{}};new Function('require','module','exports',code)(createRequire(import.meta.url),m,m.exports);const {buildReport,clinicalText}=m.exports;
const content=doc=>doc.internal.pages.flat().join('\n').replace(/\\([()\\])/g,'$1');
test('default report puts interpretation and measurements first, retains every lead and is shorter than the technical export',()=>{
 const {item,analysis}=fixture(),doc=buildReport(item,analysis,'en'),s=content(doc),full=buildReport(item,analysis,'en',{detailed:true});
 assert.ok(s.indexOf('Presumptive impression')<s.indexOf('Lead I'));for(const lead of names)assert.ok(s.includes(`Lead ${lead}`));
 for(const label of ['Heart rate: 75','PR interval: 180','QRS duration: 90','QT interval: 400','Frontal QRS axis: 0','Clinical reference'])assert.ok(s.includes(label),label);
 assert.ok(doc.getNumberOfPages()<full.getNumberOfPages());assert.ok(doc.getNumberOfPages()<=5);assert.ok(!s.includes('PATIENT-SECRET'));assert.ok(!s.includes('PRIVATE-SOURCE'));assert.ok(!s.includes('100%'));assert.ok(!s.includes('NaN'));
 assert.ok(!s.includes('Recorded signal boundaries.'),'long per-measurement methods belong to the technical export');
 assert.ok(s.includes('Representative windows, not the entire recording'));
});
test('concise display rounds clinical prose without changing original measurements or exact manual audit windows',()=>{
 const {item,analysis}=fixture();analysis.measurements[0].value=77.462191;analysis.measurements[4].value=-36.73598;analysis.impression=text('Rate 77.462191 bpm; axis -36.73598°.');
 analysis.measurements[1].windows=[{lead:'II',start:.123,end:.301,source:'manual'}];
 const before=structuredClone(analysis),s=content(buildReport(item,analysis,'en'));
 assert.match(s,/Heart rate: 77/);assert.match(s,/Frontal QRS axis: -37/);assert.ok(!s.includes('77.462191'));assert.ok(!s.includes('-36.73598'));assert.ok(s.includes('0.123-0.301 s'));assert.deepEqual(analysis,before);
 assert.equal(clinicalText('Rate 77.462 bpm; PR 119.876 ms; axis −36.735°; ST 0.125 mV; RR 0.812 s'),'Rate 77 bpm; PR 120 ms; axis -37°; ST 0.125 mV; RR 0.812 s');
});
test('missing measurements and leads stay explicit, not presented as normal',()=>{
 const {item,analysis}=fixture();delete item.traces.V6;analysis.leads.find(d=>d.lead==='V6').status='missing';analysis.measurements[0].value=null;analysis.measurements[0].status='not-evaluable';analysis.measurements[0].reason=text('No reliable complexes.');
 const s=content(buildReport(item,analysis,'en'));assert.ok(s.includes('Heart rate: Not evaluable'));assert.ok(s.includes('No reliable complexes.'));assert.ok(s.includes('Lead V6'));assert.ok(s.includes('No evaluable signal for this lead.'));
});
test('summarized exports preserve urgent warnings and opt-in privacy for free notes and external evidence',()=>{
 const {item,analysis}=fixture();item.clinicalContext={ageYears:67,freeText:'PRIVATE-NOTE-SENTINEL'};item.externalEvidence={provider:'OpenEvidence',entryMethod:'manual-paste',text:'EXTERNAL-EVIDENCE-SENTINEL',citationText:''};
 const s=content(buildReport(item,analysis,'en'));assert.ok(s.includes('Urgent symptoms require urgent care.'));assert.ok(s.includes('Age (years): 67'));assert.ok(!s.includes('PRIVATE-NOTE-SENTINEL'));assert.ok(!s.includes('EXTERNAL-EVIDENCE-SENTINEL'));
 const included=content(buildReport(item,analysis,'en',{includeFreeText:true,includeExternalEvidence:true}));assert.ok(included.includes('PRIVATE-NOTE-SENTINEL'));assert.ok(included.includes('EXTERNAL-EVIDENCE-SENTINEL'));
});
