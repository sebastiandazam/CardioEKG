/** Public catalogue check only. No key, ECG or inference call.
 * NODE_USE_ENV_PROXY=1 node scripts/check-diagnostic-ai.mjs
 */
import {buildSync} from 'esbuild';import assert from 'node:assert/strict';import {writeFileSync,mkdirSync} from 'node:fs';
const code=buildSync({stdin:{contents:`export {AI_MODELS} from './src/integrations/diagnosticAI/config.ts';export {isFreeVisionModel} from './src/integrations/diagnosticAI/client.ts';`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
const m={exports:{}};new Function('module','exports',code)(m,m.exports);const {AI_MODELS,isFreeVisionModel}=m.exports;
const response=await fetch('https://openrouter.ai/api/v1/models');assert.ok(response.ok);const catalogue=await response.json();const checked=[];
for(const model of AI_MODELS){const entry=catalogue.data.find(m=>m.id===model.id);assert.ok(isFreeVisionModel(entry,model.id));const res=await fetch('https://openrouter.ai/api/v1/models/'+model.id+'/endpoints');assert.ok(res.ok);const data=await res.json();const endpoint=data.data.endpoints.find(e=>e.tag==='nvidia'&&Number(e.pricing.prompt)===0&&Number(e.pricing.completion)===0);assert.ok(endpoint);checked.push({id:model.id,input:entry.architecture.input_modalities,output:entry.architecture.output_modalities,pricing:entry.pricing,provider:endpoint.tag,endpointStatus:endpoint.status});}
const audit={checkedAt:new Date().toISOString(),source:'https://openrouter.ai/api/v1/models',models:checked,inferenceTested:false,apiKeyUsed:false,caseDataSent:false,clinicalValidation:false};
mkdirSync('evidence',{recursive:true});writeFileSync('evidence/diagnostic-ai-catalogue.json',JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit));
