import test from 'node:test';import assert from 'node:assert/strict';
import {firstReviewLead,reviewLeadOrder} from './reviewOrder.ts';
test('estimate review starts with long II when present, otherwise I',()=>{
 const withLong={I:{},II:{},V1:{},'II-long':{}};assert.equal(firstReviewLead(withLong),'II-long');assert.deepEqual(reviewLeadOrder(withLong),['II-long','I','II','V1']);
 assert.equal(firstReviewLead({I:{},II:{}}),'I');assert.equal(firstReviewLead({I:{},'II-long':undefined}),'I');assert.equal(firstReviewLead({}),'I');
});
