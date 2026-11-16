import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {buildSync} from 'esbuild';import {createRequire} from 'node:module';
import {biodigitalViewerUrl} from './biodigitalConfig.ts';import {makeEvidenceNote,evidenceCitations} from './evidenceNote.ts';import {validWaveCases,bundledWaveImage,waveClinicalContext,waveReference,loadWaveSample} from './waveMaven.ts';
const catalog=JSON.parse(fs.readFileSync('public/wave-maven/catalog.json','utf8')),manifest=JSON.parse(fs.readFileSync('training/wave-maven/import-manifest.json','utf8'));
test('official Wave-Maven import has unique cases and six real, hash-verified source PDFs and renderings',()=>{
 const cases=validWaveCases(catalog);assert.equal(cases.length,catalog.cases.length);assert.ok(cases.length>500);assert.equal(cases.filter(c=>bundledWaveImage(c)).length,6);assert.equal(new Set(cases.map(c=>c.caseId)).size,cases.length);
 for(const record of manifest.records){const pdf=fs.readFileSync(record.pdf),png=fs.readFileSync(record.image);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(createHash('sha256').update(pdf).digest('hex'),record.pdf_sha256);assert.equal(createHash('sha256').update(png).digest('hex'),record.image_sha256);assert.equal(record.training_executed,false);assert.equal(record.patient_separation_verified,false);}
 assert.ok(manifest.records.some(r=>r.split==='held_out_case'));assert.ok(manifest.records.some(r=>r.split==='development'));assert.equal(manifest.model_training_executed,false);
});
test('case context and source diagnosis are separate; unsupported assets or source hosts cannot be loaded',()=>{
 const c=validWaveCases(catalog).find(c=>c.caseId===1),context=waveClinicalContext(c,'es');assert.equal(context.ageYears,21);assert.equal(context.sexAtBirth,'female');assert.ok(!context.freeText.includes('QT'));assert.match(waveReference(c).diagnosis.es,/QT largo/);assert.equal(bundledWaveImage({...c,image:'https://example.com/test.png'}),null);assert.deepEqual(validWaveCases({cases:[{...c,sourceUrl:'javascript:alert(1)'}]}),[]);
});
test('BioDigital requires an official identified model and a public domain key; secrets and arbitrary URLs are refused',()=>{
 for(const url of [undefined,'https://evil.test/viewer/?id=x&dk=y','http://human.biodigital.com/viewer/?id=x&dk=y','https://human.biodigital.com/viewer/?id=x','https://human.biodigital.com/viewer/?id=x&dk=y&secret=private','https://user:pass@human.biodigital.com/viewer/?id=x&dk=y'])assert.equal(biodigitalViewerUrl(url),null);
 assert.equal(biodigitalViewerUrl('https://human.biodigital.com/viewer/?id=model&dk=public-domain-key'),'https://human.biodigital.com/viewer/?id=model&dk=public-domain-key');
});
test('pasted evidence is explicit, bounded text with HTTPS references; no origin verification is invented',()=>{
 const note=makeEvidenceNote('x'.repeat(9000),'https://pubmed.ncbi.nlm.nih.gov/123/ javascript:alert(1) https://pubmed.ncbi.nlm.nih.gov/123/ http://example.com https://user:pass@example.com');assert.equal(note.text.length,8000);assert.equal(note.entryMethod,'manual-paste');assert.deepEqual(evidenceCitations(note),['https://pubmed.ncbi.nlm.nih.gov/123/']);
});
test('unconfigured provider components render actionable status and manual evidence input without blank iframes',()=>{
 const code=buildSync({stdin:{contents:"export {BioDigitalPanel} from './src/integrations/BioDigital';export {OpenEvidencePanel} from './src/integrations/OpenEvidence';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',define:{'import.meta.env':'{}'}}).outputFiles[0].text;
 const m={exports:{}};new Function('require','module','exports',code)(createRequire(import.meta.url),m,m.exports);const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 for(const Component of [m.exports.BioDigitalPanel,m.exports.OpenEvidencePanel]){const html=renderToStaticMarkup(React.createElement(Component,{language:'es',onChange:()=>{}}));assert.ok(!html.includes('<iframe'));assert.ok(!html.includes('<script'));}
 const html=renderToStaticMarkup(React.createElement(m.exports.OpenEvidencePanel,{language:'en',onChange:()=>{}}));assert.ok(html.includes('manually pasted'));assert.ok(html.includes('<textarea'));
});

test('a bundled Wave-Maven ECG enters the existing local image workflow with independent source context',async()=>{
 const c=validWaveCases(catalog).find(c=>c.caseId===1),controller=new AbortController();
 const sample=await loadWaveSample(c,'es',controller.signal,async(url,options)=>{assert.equal(url,'/wave-maven/case-1.png');assert.equal(options.credentials,'omit');assert.equal(options.signal,controller.signal);return new Response(fs.readFileSync('public/wave-maven/case-1.png'),{headers:{'Content-Type':'image/png'}});});
 assert.equal(sample.file.type,'image/png');assert.ok(sample.file.size>100000);assert.equal(sample.reference.caseId,1);assert.equal(sample.clinicalContext.ageYears,21);assert.ok(!sample.clinicalContext.freeText.includes('QT'));
 await assert.rejects(loadWaveSample(c,'en',controller.signal,async()=>new Response('<html>wrong content</html>',{headers:{'Content-Type':'image/png'}})),/signature/);
});
