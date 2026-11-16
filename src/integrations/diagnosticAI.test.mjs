import test from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';import {createRequire} from 'node:module';
const code=buildSync({stdin:{contents:`export * from './src/integrations/diagnosticAI/config.ts';export * from './src/integrations/diagnosticAI/client.ts';export * from './src/integrations/diagnosticAI/prompt.ts';export * from './src/integrations/diagnosticAI/image.ts';`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
const m={exports:{}};new Function('require','module','exports',code)(createRequire(import.meta.url),m,m.exports);
const {AI_MODELS,MAX_PROMPT,isFreeVisionModel,reviewPayload,requestAIReview,makeDiagnosticPrompt,imageProvenance,reconstructionSVG}=m.exports;
const model=AI_MODELS[0].id,free={id:model,architecture:{input_modalities:['text','image'],output_modalities:['text']},pricing:{prompt:'0',completion:'0'}};
const options=()=>({key:'test-key-not-real-123456789',model,prompt:'Private test prompt',image:'data:image/jpeg;base64,YWJj',language:'es',consent:true,signal:new AbortController().signal});
test('only explicit allowlisted zero-price vision models can be selected',()=>{
 assert.equal(isFreeVisionModel(free,model),true);
 for(const item of [{...free,pricing:{prompt:'0',completion:'.001'}},{...free,pricing:{prompt:'0',completion:'0',image:'.01'}},{...free,pricing:{prompt:'0'}},{...free,architecture:{input_modalities:['text'],output_modalities:['text']}}])assert.equal(isFreeVisionModel(item,model),false);
 assert.throws(()=>reviewPayload('paid/model','prompt',options().image,'es'),/model-not-free/);
 assert.throws(()=>reviewPayload(model,'prompt','https://example.com/image.jpg','es'),/image-size/);
 assert.throws(()=>reviewPayload(model,'x'.repeat(MAX_PROMPT+1),options().image,'es'),/prompt-size/);
});
test('consent is required before even public metadata is requested',async()=>{
 let calls=0;await assert.rejects(requestAIReview({...options(),consent:false},async()=>{calls++}),/consent/);assert.equal(calls,0);
});
test('a failed or changed price check prevents any ECG upload',async()=>{
 const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({data:[{...free,pricing:{prompt:'1',completion:'0'}}]})}};
 await assert.rejects(requestAIReview(options(),fetcher),/model-not-free/);assert.equal(calls.length,1);assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.headers,undefined);
});
test('one explicit request sends the image and exact prompt to the fixed service with zero-price routing and no paid fallback',async()=>{
 const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});return calls.length===1?{ok:true,json:async()=>({data:[free]})}:{ok:true,json:async()=>({model,provider:'Nvidia',usage:{cost:0},choices:[{finish_reason:'length',message:{content:'<script>not executed</script> An unverified answer'}}]})}};
 const result=await requestAIReview(options(),fetcher);assert.equal(calls.length,2);assert.equal(calls[1].url,'https://openrouter.ai/api/v1/chat/completions');
 const req=JSON.parse(calls[1].init.body);assert.equal(req.model,model);assert.ok(!('models' in req));assert.deepEqual(req.provider.max_price,{prompt:0,completion:0});assert.equal(req.provider.allow_fallbacks,false);assert.deepEqual(req.provider.only,['nvidia']);
 assert.equal(req.messages[1].content[0].text,options().prompt);assert.equal(req.messages[1].content[1].image_url.url,options().image);
 assert.ok(!calls[1].url.includes(options().key));assert.equal(calls[1].init.credentials,'omit');assert.equal(calls[1].init.redirect,'error');assert.equal(result.truncated,true);assert.match(result.text,/<script>/);
});
test('quota failure is not retried and never replaced by a fabricated answer',async()=>{
 let count=0;await assert.rejects(requestAIReview(options(),async()=>++count===1?{ok:true,json:async()=>({data:[free]})}:{ok:false,status:429}),/http-429/);assert.equal(count,2);
});
test('unexpected cost and empty responses are blocked',async()=>{
 for(const body of [{usage:{cost:.1},choices:[{message:{content:'answer'}}]},{choices:[{message:{content:''}}]}]){
  let count=0;await assert.rejects(requestAIReview(options(),async()=>++count===1?{ok:true,json:async()=>({data:[free]})}:{ok:true,json:async()=>body}),/unexpected-cost|empty-response/);
 }
});
test('image prompt preserves actual context, provided sources and missing/contradictory criteria',()=>{
 const entity={name:{es:'Hipótesis provisional',en:'Provisional hypothesis'},status:'possible',met:[{es:'Criterio presente',en:'Present criterion'}],against:[{es:'Dato contradictorio',en:'Contradictory datum'}],missing:[{es:'Falta confirmar delta',en:'Delta needs confirmation'}],references:[]};
 const analysis={measurements:[{key:'rateBpm',value:75,unit:'bpm',status:'estimated'}],findings:[],impression:{es:'Datos incompletos',en:'Incomplete data'},references:[{id:'ref',name:'Known supplied reference',url:'https://pubmed.ncbi.nlm.nih.gov/19281930/'}],presumptive:{primary:entity,concurrent:[],differentials:[],summary:{es:'Hipótesis provisional',en:'Provisional hypothesis'},cannotExclude:[]}};
 for(const lang of ['es','en']){const prompt=makeDiagnosticPrompt(analysis,lang,{ageYears:54,symptoms:['syncope'],freeText:'Unverified clinical note'});assert.match(prompt,/75 bpm/);assert.match(prompt,/54/);assert.match(prompt,/Unverified clinical note/);assert.match(prompt,/Known supplied reference/);assert.match(prompt,/possible/);assert.ok(!prompt.includes('No images or raw signals are attached'));assert.ok(!prompt.includes('No hay imágenes ni señales crudas adjuntas'));assert.ok(!prompt.includes('mv":['));}
 const es=makeDiagnosticPrompt(analysis,'es');assert.match(es,/Criterio presente/);assert.match(es,/Dato contradictorio/);assert.match(es,/Falta confirmar delta/);assert.match(imageProvenance('reconstruction','en'),/not an original photograph/);
});
test('reconstruction preserves large peaks below lead labels and marks missing leads and separate windows',()=>{
 const t={mv:[0,12,-10,0],seconds:1};const svg=reconstructionSVG({traces:{I:t},rhythmTrace:t,rhythmLead:'I'},'en');assert.match(svg,/independent windows/);assert.match(svg,/II: missing/);assert.match(svg,/I — long strip/);assert.ok(svg.includes(',71.50'));assert.ok(!/NaN|Infinity|undefined|<script/.test(svg));
});
