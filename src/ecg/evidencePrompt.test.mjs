import test from 'node:test';import assert from 'node:assert/strict';import {makeAnalysisPrompt} from './evidencePrompt.ts';
const analysis={measurements:[{key:'rateBpm',value:75,unit:'bpm',status:'estimated'},{key:'prMs',value:null,unit:'ms',status:'not-applicable'}],findings:[{label:{es:'QRS ancho',en:'Wide QRS'}}],impression:{es:'Impresión de prueba',en:'Test impression'}};
test('evidence prompts use actual measurements and active language but include provided clinical context and notes while excluding raw signals',()=>{
 const context={ageYears:68,symptoms:['chest-pain'],freeText:'Context note for review'};
 const es=makeAnalysisPrompt(analysis,'es',context),en=makeAnalysisPrompt(analysis,'en',context);
 assert.match(es,/75 bpm/);assert.match(es,/QRS ancho/);assert.match(es,/no aplicable/);assert.match(es,/Responde en español/);
 assert.match(en,/Wide QRS/);assert.match(en,/Respond in English/);assert.match(en,/68/);
 for(const prompt of [es,en]){assert.ok(prompt.includes('Context note for review'));assert.ok(!prompt.includes('freeText'));assert.ok(!prompt.includes('mv":['));}
});

test('evidence prompt preserves delta polarity and repeatability as measured candidates',()=>{
 const delta={status:'supported',polarity:'negative',durationMs:43,repeatableBeats:3,analyzedBeats:4,windows:[]};
 const result={...analysis,preexcitation:{status:'supported',supportingLeads:['III','V1','aVL'],limitations:['Unvalidated method'],leads:{III:delta}}};
 for(const language of ['es','en']){const prompt=makeAnalysisPrompt(result,language);assert.ok(prompt.includes('III: supported, 43 ms, negative, 3/4'));assert.ok(prompt.includes('Unvalidated method'));assert.ok(!prompt.includes('mv":['));}
});
