import test from 'node:test';import assert from 'node:assert/strict';import {compareAnalysis} from './compareAnalysis.ts';
const fixture=()=>({schemaVersion:1,algorithmVersion:'test',measurements:['rateBpm','prMs','qrsMs','qtMs','axisDeg'].map(key=>({key,value:100,status:'estimated',unit:key==='rateBpm'?'bpm':'ms'})),findings:[{id:'safe',urgent:false}]});
test('comparison ignores key order and floating-point noise but preserves clinical differences',()=>{
 const a=fixture(),b=structuredClone(a);b.measurements.reverse();b.measurements.find(m=>m.key==='qrsMs').value+=2.84e-14;assert.equal(compareAnalysis(a,b).equivalent,true);
 b.findings[0].urgent=true;assert.equal(compareAnalysis(a,b).equivalent,false);b.findings[0].urgent=false;b.measurements[0].status='manual';assert.equal(compareAnalysis(a,b).equivalent,false);
});
test('versions, null versus zero and incomplete measurement schemas never match',()=>{
 const a=fixture(),b=structuredClone(a);b.algorithmVersion='other';assert.equal(compareAnalysis(a,b).versionCompatible,false);b.algorithmVersion='test';b.measurements[0].value=null;assert.equal(compareAnalysis(a,b).equivalent,false);b.measurements=[];assert.equal(compareAnalysis(a,b).equivalent,false);
});
