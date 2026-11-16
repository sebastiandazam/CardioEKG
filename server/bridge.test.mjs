import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildSync} from 'esbuild';
const code=buildSync({entryPoints:['src/ecg/analyze.ts'],bundle:true,write:false,platform:'node',format:'esm'}).outputFiles[0].text;
const {analyzeCase}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('canonical server bridge matches direct browser-engine analysis for real signals and manual corrections',()=>{
 const fixture=JSON.parse(readFileSync('src/data/normal.json','utf8'));
 const item={id:'anonymous',pattern:'indeterminate',origin:'clinical',findingOrigin:'source',synchronized:true,rhythmLead:'II',
  measurements:{rateBpm:null,prMs:174,qrsMs:null,qtMs:null,axisDeg:0},measurementOrigins:{prMs:'caliper',axisDeg:'caliper'},measurementWindows:{prMs:[{lead:'II',start:.5,end:.674}]},
  clinicalContext:{ageYears:64,sexAtBirth:'female',symptoms:['chest-pain'],onset:'now',history:['hypertension'],medications:['qt-prolonging'],electrolytes:'known-abnormal',paced:'no'},
  traces:Object.fromEntries(Object.entries(fixture.signals).map(([lead,mv])=>[lead,{mv,seconds:mv.length/fixture.sampleRate}]))};
 const direct=analyzeCase(item);
 const child=spawnSync(process.execPath,['server/runtime/analyze.mjs'],{input:JSON.stringify(item),encoding:'utf8',maxBuffer:4*1024*1024,timeout:30000});
 assert.equal(child.status,0,child.stderr);
 assert.deepEqual(JSON.parse(child.stdout),JSON.parse(JSON.stringify(direct)));
 assert.equal(direct.measurements.find(m=>m.key==='prMs').value,174);
 assert.deepEqual(direct.measurements.find(m=>m.key==='prMs').windows,[{lead:'II',start:.5,end:.674,source:'manual'}]);
 assert.equal(direct.measurements.find(m=>m.key==='axisDeg').value,0);
 assert.equal(direct.leads.length,12);
});
