import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFeatures, evaluate, evaluateExpression, evaluateEntity, presumptiveDiagnosis, validateKnowledgeBase } from './engine.ts';

const L = t => ({ es: t, en: t });
const lead = (name, values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [`lead.${name}.${k}`, v]));

test('three-valued logic: missing data is "not evaluable", never "absent"', () => {
  assert.equal(evaluate({ feature: 'qrsMs', op: '>=', value: 120 }, { qrsMs: 130 }, {}), true);
  assert.equal(evaluate({ feature: 'qrsMs', op: '>=', value: 120 }, { qrsMs: null }, {}), null);
  assert.equal(evaluate({ not: { feature: 'qrsMs', op: '>=', value: 120 } }, { qrsMs: null }, {}), null);
  assert.equal(evaluate({ all: [{ feature: 'qrsMs', op: '>=', value: 120 }, { feature: 'rateBpm', op: '>', value: 100 }] }, { qrsMs: null, rateBpm: 80 }, {}), false);
  assert.equal(evaluate({ any: [{ feature: 'qrsMs', op: '>=', value: 120 }, { feature: 'rateBpm', op: '>', value: 100 }] }, { qrsMs: null, rateBpm: 120 }, {}), true);
  assert.equal(evaluate({ feature: 'rateBpm', op: 'between', value: [60, 100] }, { rateBpm: 100 }, {}), true);
  assert.equal(evaluate({ context: 'symptoms', op: 'contains', value: 'syncope' }, {}, {}), null, 'unrecorded history is unknown');
  assert.equal(evaluate({ context: 'history', op: 'contains', value: 'pulmonary' }, {}, { history: ['copd'] }), true, 'context aliases');
});

test('lead counting and anatomical contiguity', () => {
  const f = { ...lead('V1', { stMv: .25 }), ...lead('V2', { stMv: .3 }), ...lead('V3', { stMv: 0 }), ...lead('V4', { stMv: .2 }) };
  assert.equal(evaluate({ countLeads: ['V1', 'V2', 'V3', 'V4'], where: { field: 'stMv', op: '>=', value: .1 }, op: '>=', value: 3 }, f, {}), true);
  assert.equal(evaluate({ contiguous: 'anterior', where: { field: 'stMv', op: '>=', value: .1 }, min: 2 }, f, {}), true, 'V1–V2 are adjacent');
  const g = { ...lead('II', { stMv: .2 }), ...lead('III', { stMv: 0 }), ...lead('aVF', { stMv: null }) };
  assert.equal(evaluate({ contiguous: 'inferior', where: { field: 'stMv', op: '>=', value: .1 }, min: 2 }, g, {}), null, 'aVF unknown: cannot decide');
  assert.equal(evaluate({ countLeads: ['V5', 'V6'], where: { field: 'stMv', op: '>=', value: .1 }, op: '>=', value: 2 }, {}, {}), null);
});

test('expressions: Sokolow-Lyon arithmetic; unknown operands give null', () => {
  const f = { ...lead('V1', { sMv: -1.8 }), ...lead('V5', { rMv: 2.1 }), ...lead('V6', { rMv: 1.7 }) };
  assert.ok(Math.abs(evaluateExpression('abs(lead.V1.sMv)+max(lead.V5.rMv,lead.V6.rMv)', f) - 3.9) < 1e-9);
  assert.equal(evaluateExpression('lead.aVL.rMv+abs(lead.V3.sMv)', f), null);
  assert.equal(evaluateExpression('2*(3+4)', {}), 14);
  assert.equal(evaluateExpression('2*(3+', {}), null);
});

const entity = (over = {}) => ({ id: 'x', name: L('X'), category: 'conduction', urgency: 'routine', criteria: [], ...over });

test('entity status: required gates, exclusions veto, unknowns stay unknown', () => {
  const crit = (id, role, feature, value, extra = {}) => ({ id, role, text: L(id), predicate: { feature, op: '>=', value }, ...extra });
  const e = entity({ criteria: [crit('a', 'required', 'qrsMs', 120), crit('b', 'required', 'rMvV1', 0), crit('x', 'exclusion', 'rateBpm', 150)] });
  assert.equal(evaluateEntity(e, { qrsMs: 130, rMvV1: 1, rateBpm: 80 }, {}).status, 'met');
  assert.equal(evaluateEntity(e, { qrsMs: 130, rMvV1: null, rateBpm: 80 }, {}).status, 'possible');
  assert.equal(evaluateEntity(e, { qrsMs: null, rMvV1: null }, {}).status, 'not-evaluable');
  assert.equal(evaluateEntity(e, { qrsMs: 100, rMvV1: 1 }, {}).status, 'not-met');
  assert.equal(evaluateEntity(e, { qrsMs: 130, rMvV1: 1, rateBpm: 160 }, {}).status, 'excluded');
  const atLeast = entity({ requiredLogic: 'atLeast:2', criteria: [crit('a', 'required', 'a', 1), crit('b', 'required', 'b', 1), crit('c', 'required', 'c', 1)] });
  assert.equal(evaluateEntity(atLeast, { a: 1, b: 0, c: null }, {}).status, 'possible');
  assert.equal(evaluateEntity(atLeast, { a: 1, b: 0, c: 1 }, {}).status, 'met');
});

test('evidence weight uses published likelihood ratios when present, heuristic otherwise', () => {
  const published = entity({ criteria: [{ id: 'a', role: 'required', text: L('a'), predicate: { feature: 'a', op: '>=', value: 1 }, sensitivity: .5, specificity: .95 }] });
  const r = evaluateEntity(published, { a: 1 }, {});
  assert.equal(r.evidence, 'published');
  assert.ok(Math.abs(r.weight - Math.log10(10)) < 1e-9, 'LR+ = 0.5 / 0.05 = 10');
  const heuristic = evaluateEntity(entity({ criteria: [{ id: 'a', role: 'required', text: L('a'), predicate: { feature: 'a', op: '>=', value: 1 } }] }), { a: 1 }, {});
  assert.equal(heuristic.evidence, 'heuristic');
});

test('presumptive diagnosis: urgent abnormal first, normal never beside abnormal, serious unknowns listed', () => {
  const kb = {
    references: [],
    entities: [
      entity({ id: 'normal-sinus-rhythm', category: 'rhythm', criteria: [{ id: 'r', role: 'required', text: L('r'), predicate: { feature: 'rateBpm', op: 'between', value: [50, 100] } }] }),
      entity({ id: 'sinus-bradycardia', category: 'rhythm', criteria: [{ id: 'r', role: 'required', text: L('r'), predicate: { feature: 'rateBpm', op: '<', value: 50 } }] }),
      entity({ id: 'rbbb', criteria: [{ id: 'q', role: 'required', text: L('q'), predicate: { feature: 'qrsMs', op: '>=', value: 120 } }], mimics: ['wpw'] }),
      entity({ id: 'wpw', criteria: [{ id: 'd', role: 'required', text: L('d'), predicate: { feature: 'lead.V1.deltaSlurMs', op: '>=', value: 30 } }] }),
      entity({ id: 'stemi', category: 'ischemia', urgency: 'emergent', criteria: [{ id: 's', role: 'required', text: L('s'), predicate: { feature: 'lead.V2.stMv', op: '>=', value: .2 } }] }),
    ],
  };
  assert.deepEqual(validateKnowledgeBase(kb), []);
  const d = presumptiveDiagnosis(kb, { rateBpm: 75, qrsMs: 140 }, {});
  assert.equal(d.primary.entity.id, 'rbbb');
  assert.ok(d.cannotExclude.some(r => r.entity.id === 'stemi'), 'unmeasured ST: STEMI cannot be excluded');
  assert.ok(d.cannotExclude.some(r => r.entity.id === 'wpw') || d.differentials.some(r => r.entity.id === 'wpw'), 'mimic surfaced');
  const n = presumptiveDiagnosis(kb, { rateBpm: 75, qrsMs: 90, 'lead.V2.stMv': 0, 'lead.V1.deltaSlurMs': 10 }, {});
  assert.equal(n.primary.entity.id, 'normal-sinus-rhythm');
  assert.match(n.summary.es, /^Diagnóstico presuntivo: X/);
});

test('validator catches unknown features, references, groups and mimics', () => {
  const bad = { references: [], entities: [entity({ mimics: ['nope'], criteria: [{ id: 'a', role: 'required', text: L('a'), ref: 'r1', predicate: { all: [{ feature: 'lead.V7.stMv', op: '>', value: 0 }, { contiguous: 'apical', where: { field: 'stMv', op: '>', value: 0 }, min: 2 }] } }] })] };
  const problems = validateKnowledgeBase(bad).join('\n');
  assert.match(problems, /unknown feature lead\.V7\.stMv/);
  assert.match(problems, /unknown group apical/);
  assert.match(problems, /unknown reference r1/);
  assert.match(problems, /unknown mimic nope/);
});

test('lead counts preserve unknown intermediate counts for equality and inequality', () => {
  const predicate = { countLeads: ['V1', 'V2'], where: { field: 'qs', op: '==', value: true }, op: '==', value: 1 };
  assert.equal(evaluate(predicate, {}, {}), null, '0..2 may contain exactly one positive');
  assert.equal(evaluate({ ...predicate, op: '!=' }, {}, {}), null);
  assert.equal(evaluate({ ...predicate, op: 'between', value: [1, 1] }, {}, {}), null);
  assert.equal(evaluate(predicate, { 'lead.V1.qs': true, 'lead.V2.qs': false }, {}), true);
});

test('three contiguous leads require a connected triple, not just one adjacent pair', () => {
  const predicate = { contiguous: 'anterior', where: { field: 'stMv', op: '>=', value: .1 }, min: 3 };
  assert.equal(evaluate(predicate, { 'lead.V1.stMv': .2, 'lead.V2.stMv': .2, 'lead.V3.stMv': 0, 'lead.V4.stMv': .2 }, {}), false);
  assert.equal(evaluate(predicate, { 'lead.V1.stMv': .2, 'lead.V2.stMv': .2, 'lead.V4.stMv': 0 }, {}), null);
  assert.equal(evaluate(predicate, { 'lead.V1.stMv': .2, 'lead.V2.stMv': .2, 'lead.V3.stMv': .2, 'lead.V4.stMv': 0 }, {}), true);
});

test('undelineated or noisy P waves are unknown, not absent atrial activity', () => {
  const args = { values: { rateBpm: 130, prMs: null, qrsMs: 90, qtMs: null, axisDeg: 50 }, details: { II: { pMv: null, noiseMv: .01 } }, rhythm: { rrCv: .25, beatCount: 12 }, qtcMs: null };
  assert.equal(buildFeatures(args).pPresent, null);
  assert.equal(buildFeatures({ ...args, details: { II: { pMv: .1, noiseMv: .01 } } }).pPresent, true);
  assert.equal(buildFeatures({ ...args, details: { II: { pMv: .1, noiseMv: .08 } } }).pPresent, null);
  assert.equal(buildFeatures({ ...args, global: { pPresent: false } }).pPresent, false, 'explicit measured absence remains usable');
  assert.equal(buildFeatures({ ...args, global: { pPresent: false }, details: { II: { pMv: null, noiseMv: .08 } } }).pPresent, null);
});

test('too few beats cannot establish irregularity for the wide-complex differential', () => {
  const args = { values: { rateBpm: 180, prMs: null, qrsMs: 160, qtMs: null, axisDeg: null }, details: {}, rhythm: { rrCv: .04, beatCount: 3 }, qtcMs: null };
  assert.equal(buildFeatures(args).regular, null);
  assert.equal(buildFeatures({ ...args, rhythm: { rrCv: .3, beatCount: 3 } }).regular, null);
  assert.equal(buildFeatures({ ...args, rhythm: { rrCv: .3, beatCount: 8 } }).regular, false);
  assert.equal(buildFeatures({ ...args, rhythm: { rrCv: .04, beatCount: 8 } }).regular, true);
});

test('an emergent measured pattern precedes a routine finding with many correlated criteria', () => {
  const criterion = id => ({ id, role: 'required', text: L(id), predicate: { feature: 'present', op: '==', value: true } });
  const kb = { references: [], entities: [entity({ id: 'routine', criteria: Array.from({ length: 8 }, (_, i) => criterion(String(i))) }), entity({ id: 'emergent', urgency: 'emergent', criteria: [criterion('acute')] })] };
  const result = presumptiveDiagnosis(kb, { present: true }, {});
  assert.equal(result.primary.entity.id, 'emergent');
  assert.equal(result.concurrent[0].entity.id, 'routine');
});
