import assert from 'node:assert/strict';import test from 'node:test';import {buildSync} from 'esbuild';import {readFileSync} from 'node:fs';
import {referenceReviewLabel} from './referenceReview.ts';
const code=buildSync({stdin:{contents:"export {presumptiveFromMeasurements} from './src/ecg/knowledge/index.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'}).outputFiles[0].text;
const {presumptiveFromMeasurements}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('bibliographic verification is not promoted to full-text or diagnostic validation',()=>{
 assert.equal(referenceReviewLabel('metadata-only','es',true),'Solo registro bibliográfico');
 assert.equal(referenceReviewLabel(undefined,'es',true),'Registro previo');
 assert.equal(referenceReviewLabel('full-text','en',true),'Text consulted');
});
test('new provenance survives serialization into the actual presumptive diagnosis',()=>{
 const args=JSON.parse(readFileSync('src/ecg/knowledge/fixtures/preexcitation-measurements.json','utf8')).measurements['218'];
 const result=presumptiveFromMeasurements({...args,context:{}});assert.equal(result.primary.id,'wpw-pattern');
 const refs=JSON.parse(JSON.stringify(result)).primary.references.filter(r=>r.verificationLevel==='full-text');
 assert.ok(refs.length>0);assert.ok(refs.every(r=>r.reviewedAt&&r.locator&&r.population&&r.pmid&&r.url.startsWith('https://pubmed.ncbi.nlm.nih.gov/')));
});
