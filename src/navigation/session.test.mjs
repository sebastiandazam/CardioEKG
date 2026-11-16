import test from 'node:test';import assert from 'node:assert/strict';
import {initialSession,sessionReducer,pageFromHash} from './session.ts';
const item={id:'session-example',origin:'research'};
test('home/library/source navigation and browser back retain the active case until explicit discard',()=>{
 let s=sessionReducer(initialSession,{type:'intake',value:{safety:'clear'}});
 s=sessionReducer(s,{type:'open',item});const generation=s.generation;
 for(const page of ['home','library','sources','viewer']){s=sessionReducer(s,{type:'navigate',page});assert.equal(s.item,item);assert.equal(s.generation,generation);assert.deepEqual(s.caseIntake,{safety:'clear'});}
 assert.equal(s.page,'viewer');s=sessionReducer(s,{type:'discard'});assert.equal(s.item,null);assert.equal(s.caseIntake,null);
 assert.equal(sessionReducer(s,{type:'navigate',page:'viewer'}).page,'home');
});
test('starting another intake does not overwrite the retained case context',()=>{
 let s=sessionReducer(initialSession,{type:'intake',value:{safety:'urgent'}});s=sessionReducer(s,{type:'open',item});
 s=sessionReducer(s,{type:'navigate',page:'intake'});s=sessionReducer(s,{type:'intake',value:{safety:'clear'}});
 assert.equal(s.caseIntake.safety,'urgent');assert.equal(s.intake.safety,'clear');assert.equal(s.item,item);
 const next={id:'another',origin:'clinical'};s=sessionReducer(s,{type:'open',item:next});assert.equal(s.caseIntake,null);assert.equal(s.item,next);
});
test('hash routing contains only page names, never serialized case data',()=>{
 for(const page of ['home','intake','capture','library','viewer','sources'])assert.equal(pageFromHash('#'+page),page);
 for(const invalid of ['#patient=name','#viewer?secret=x','#<script>',''])assert.equal(pageFromHash(invalid),'home');
});
test('unfinished capture survives navigation and example selection until explicitly discarded or confirmed',()=>{
 const intake={safety:'clear'};let s=sessionReducer(initialSession,{type:'intake',value:intake});
 for(const page of ['home','intake','library','sources','capture']){s=sessionReducer(s,{type:'navigate',page});assert.equal(s.intake,intake);}
 s=sessionReducer(s,{type:'open',item:{id:'example',origin:'clinical'}});assert.equal(s.intake,intake);
 s=sessionReducer(s,{type:'discard-capture'});assert.equal(s.intake,null);assert.equal(s.item.id,'example');
});
