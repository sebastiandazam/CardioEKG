import assert from 'node:assert/strict';
import test from 'node:test';
import {representativeIntervals} from './visualMeasurements.ts';

test('explicit Python QT window is shown without inventing a T-wave onset',()=>{
 const result=representativeIntervals([{phase:'qrs',start:1,end:1.14}], [{key:'qtMs',lead:'II',start:1,end:1.39,source:'automatic'}], 'II',0,3);
 assert.deepEqual(result.intervals.find(w=>w.key==='qtMs'),{key:'qtMs',start:1,end:1.39,source:'automatic'});
 assert.ok(!result.intervals.some(w=>w.key==='prMs'));
});
