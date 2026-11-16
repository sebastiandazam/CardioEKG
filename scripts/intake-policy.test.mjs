import test from 'node:test';
import assert from 'node:assert/strict';
import {canContinueSafety} from '../src/intake/policy.ts';
import {isPdf,pdfRenderScale} from '../src/research/pdf.ts';
test('alarm and uncertain cases can continue only after acknowledging the notice',()=>{
  for(const state of ['urgent','uncertain']) {
    assert.equal(canContinueSafety(state,false),false);
    assert.equal(canContinueSafety(state,true),true);
  }
  assert.equal(canContinueSafety('clear',false),true);
  assert.equal(canContinueSafety(null,true),false);
});
test('PDF detection uses signature rather than filename/MIME and rendering bounds page memory',async()=>{
  assert.equal(await isPdf(new Blob(['%PDF-1.7\n'])),true);
  assert.equal(await isPdf(new Blob(['not a pdf'],{type:'application/pdf'})),false);
  for(const [w,h] of [[595,842],[20000,5000],[100,100]]) {
    const scale=pdfRenderScale(w,h);
    assert.ok(w*scale<=2600.01 && h*scale<=3600.01 && w*h*scale**2<=8000001);
  }
  assert.throws(()=>pdfRenderScale(0,100));
});
