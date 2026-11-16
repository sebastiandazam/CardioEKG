import assert from 'node:assert/strict';import test from 'node:test';
import {buildLiteratureIndex,referenceIdentity} from './literature-index.mjs';
const index=buildLiteratureIndex();
test('literature catalogue maps all source identifiers to known clinical entities',()=>{
 const ids=index.references.flatMap(r=>r.ids);assert.equal(new Set(ids).size,index.counts.referenceIds);
 const entities=new Set(index.entities.map(e=>e.id));
 for(const ref of index.references){assert.ok(ref.citation);for(const id of ref.entityIds)assert.ok(entities.has(id));if(ref.verificationLevel){assert.match(ref.reviewedAt,/^\d{4}-\d{2}-\d{2}$/);assert.ok(ref.locator);assert.match(ref.url,/^https:\/\//);}}
 assert.equal(index.counts.publications,index.references.length);
});
test('the two distinct Smith 2012 studies retain independent PubMed identities',()=>{
 const a=index.references.find(r=>r.pmid==='22520989'),b=index.references.find(r=>r.pmid==='22939607');
 assert.ok(a&&b);assert.notEqual(a.key,b.key);assert.ok(a.ids.includes('smith-anterior-2012'));assert.ok(b.ids.includes('smith-modified-sgarbossa-2012'));
 assert.ok(!index.references.some(r=>r.ids.includes('smith-2012')));
 assert.equal(referenceIdentity({id:'x',doi:'10.1234/ABC'}),referenceIdentity({id:'y',url:'https://doi.org/10.1234/abc'}));
});
