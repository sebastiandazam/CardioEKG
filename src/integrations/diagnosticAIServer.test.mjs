import test from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';
const code=buildSync({stdin:{contents:`export {handleSite} from './src/server/site.ts';`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
const m={exports:{}};new Function('module','exports',code)(m,m.exports);const {handleSite}=m.exports;
const env={OPENROUTER_API_KEY:'dummy-server-only-key-123456789',ASSETS:{fetch:async()=>new Response('asset')}};
const url='https://cardioscopio-ecg.dorydaza.chatgpt.site';
const request=(body,ip='test',origin=url)=>new Request(url+'/api/diagnostic-ai/review',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(body)});
const body={consent:true,model:'nvidia/nemotron-3.5-super-vl:free',language:'es',prompt:'Synthetic educational ECG',image:'data:image/jpeg;base64,YWJj'};
test('public readiness returns only availability, never the server key',async()=>{
 const r=await handleSite(new Request(url+'/api/diagnostic-ai/status'),env);const t=await r.text();assert.equal(r.status,200);assert.equal(JSON.parse(t).configured,true);assert.ok(!t.includes(env.OPENROUTER_API_KEY));
});
test('assets remain accessible and unknown API routes are not served as HTML',async()=>{
 assert.equal(await (await handleSite(new Request(url+'/'),env)).text(),'asset');assert.equal((await handleSite(new Request(url+'/api/missing'),env)).status,404);
});
test('cross-origin and unconsented submissions are rejected before inference',async()=>{
 assert.equal((await handleSite(request(body,'origin','https://unrelated.example'),env)).status,403);
 assert.equal((await handleSite(request({...body,consent:false},'consent'),env)).status,400);
 assert.equal((await handleSite(request(body,'unconfigured'),{ASSETS:env.ASSETS})).status,503);
});
test('server uses its secret rather than caller credentials and returns no secret',async()=>{
 const original=globalThis.fetch;const calls=[];globalThis.fetch=async(u,o)=>{calls.push({u,o});return calls.length===1?new Response(JSON.stringify({data:[{id:body.model,architecture:{input_modalities:['image'],output_modalities:['text']},pricing:{prompt:'0',completion:'0'}}]})):new Response(JSON.stringify({model:body.model,provider:'Nvidia',usage:{cost:0},choices:[{message:{content:'Educational response'}}]}))};
 try{const r=await handleSite(request({...body,key:'caller-cannot-override-secret'},'successful'),env);const text=await r.text();assert.equal(r.status,200);assert.equal(JSON.parse(text).text,'Educational response');assert.equal(calls[1].o.headers.Authorization,'Bearer '+env.OPENROUTER_API_KEY);assert.equal(calls[0].o.redirect,'manual');assert.ok(!('cache' in calls[0].o));assert.ok(!text.includes(env.OPENROUTER_API_KEY));assert.ok(!calls[1].u.includes(env.OPENROUTER_API_KEY));}finally{globalThis.fetch=original}
});
test('redirect responses stop before any credentials or ECG reach a redirect target',async()=>{
 const original=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;return new Response(null,{status:302,headers:{Location:'https://unrelated.example'}})};
 try{const r=await handleSite(request(body,'redirect'),env);assert.equal(r.status,502);assert.equal((await r.json()).error,'upstream-redirect');assert.equal(count,1);}finally{globalThis.fetch=original}
});
test('server refuses paid model IDs without calling a provider',async()=>{
 const original=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;throw new Error('must not fetch')};
 try{const r=await handleSite(request({...body,model:'paid/model'},'paid-model'),env);assert.equal(r.status,502);assert.equal((await r.json()).error,'model-not-free');assert.equal(count,0);}finally{globalThis.fetch=original}
});
