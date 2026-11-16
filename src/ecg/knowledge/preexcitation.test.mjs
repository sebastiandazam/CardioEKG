import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';

const code = buildSync({ stdin: { contents: "export {knowledgeBase,presumptiveFromMeasurements} from './src/ecg/knowledge/index';export {buildFeatures,presumptiveDiagnosis} from './src/ecg/knowledge/engine';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' } }).outputFiles[0].text;
const { knowledgeBase, presumptiveFromMeasurements, buildFeatures, presumptiveDiagnosis } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/preexcitation-measurements.json', import.meta.url), 'utf8')).measurements;
const leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const run = args => presumptiveDiagnosis(knowledgeBase, buildFeatures(args), {});
const met = result => [result.primary, ...result.concurrent].filter(Boolean).map(value => value.entity.id);
const clone = value => structuredClone(value);

function measured() {
  const args = clone(fixtures.sinus);
  Object.assign(args.values, { prMs: 105, qrsMs: 108 });
  Object.assign(args.global, { pPresent: true, pConductedFraction: 1, prVariable: false });
  args.rhythm = { rrCv: .02, beatCount: 12 };
  // Complete the artificial rule fixture; the captured Python controls remain untouched.
  for (const lead of leads) {
    args.details[lead] ??= clone(args.details.I);
    args.details[lead].morphology.deltaEvidence = {
    status: 'not-supported', polarity: null, durationMs: null, initialSlopeMvPerMs: null, terminalSlopeMvPerMs: null,
    repeatableBeats: 0, analyzedBeats: 9, windows: [],
    };
  }
  return args;
}

function support(args, polarities) {
  for (const [lead, polarity] of Object.entries(polarities)) {
    args.details[lead].morphology.deltaEvidence = {
      status: 'supported', polarity, durationMs: 27,
      initialSlopeMvPerMs: polarity === 'negative' ? -.003 : .003,
      terminalSlopeMvPerMs: polarity === 'negative' ? -.03 : .03,
      repeatableBeats: 7, analyzedBeats: 9,
      windows: [0, .8].map(start => ({ start, end: start + .027, peak: start + .065, polarity })),
    };
  }
  args.global.preexcitation = { status: 'supported', supportingLeads: Object.keys(polarities), limitations: ['Development-only heuristic detector.'] };
  return args;
}

test('per-beat Python evidence reaches a WPW pattern and preserves negative delta', () => {
  const args = fixtures['218'], features = buildFeatures(args), result = run(args);
  assert.equal(features.preexcitationSupported, true);
  assert.equal(features['lead.V1.deltaPolarity'], 'negative');
  assert.equal(features['lead.III.deltaPolarity'], 'negative');
  assert.equal(result.primary?.entity.id, 'wpw-pattern');
  assert.ok(!met(result).some(id => /^(old-mi|lvh-|lbbb-|rbbb-|ivcd-)/.test(id)));
  const summary = presumptiveFromMeasurements({ ...args, context: {} });
  assert.ok(summary.primary.met.some(value => /V1: delta negativa/.test(value.es)));
  assert.ok(summary.primary.met.some(value => /III: delta negativa/.test(value.es)));
  assert.match(summary.primary.name.en, /pattern/);
  assert.doesNotMatch(summary.primary.name.en, /syndrome/i);
  const mislabeled = presumptiveFromMeasurements({ ...clone(args), caseId: 999, sourceDiagnosis: 'normal', context: { freeText: 'Answer: infarction' } });
  assert.deepEqual(mislabeled, summary);
});

test('positive and negative multilead delta support partial preexcitation with narrow QRS', () => {
  for (const polarities of [{ I: 'positive', aVL: 'positive', V5: 'positive' }, { V1: 'negative', III: 'negative', aVF: 'negative' }, { V1: 'negative', III: 'negative', aVL: 'positive' }]) {
    const args = support(measured(), polarities);
    assert.ok(args.values.qrsMs < 120);
    assert.equal(run(args).primary?.entity.id, 'wpw-pattern', JSON.stringify(polarities));
  }
});

test('short PR without delta data or with an isolated slur duration remains unresolved', () => {
  const args = measured();
  delete args.global.preexcitation;
  for (const d of Object.values(args.details)) { delete d.morphology.deltaEvidence; d.morphology.deltaSlurMs = 70; }
  const features = buildFeatures(args), result = run(args);
  assert.equal(features.preexcitationSupported, null);
  assert.ok(!met(result).includes('wpw-pattern'));
  assert.ok(!met(result).includes('short-pr-no-preexcitation'), 'unavailable delta must not become absent delta');
  assert.ok(result.differentials.some(value => value.entity.id === 'wpw-pattern'));
});

test('corroborated delta with unavailable PR stays a candidate rather than a completed WPW-pattern claim', () => {
  const args = support(measured(), { V1: 'negative', III: 'negative', aVL: 'positive' });
  args.values.prMs = null;
  const result = run(args);
  assert.ok(!met(result).includes('wpw-pattern'));
  const wpw = result.differentials.find(value => value.entity.id === 'wpw-pattern');
  assert.ok(wpw?.missing.some(value => value.id === 'wpw-pr'));
});

test('an evaluable negative detector supports short PR without demonstrated preexcitation', () => {
  const args = measured();
  assert.equal(buildFeatures(args).preexcitationSupported, false);
  assert.ok(!met(run(args)).includes('wpw-pattern'));
  assert.ok(met(run(args)).includes('short-pr-no-preexcitation'));
});

test('aggregate status alone, insufficient repeats and noisy supporting leads cannot confirm WPW', () => {
  const missing = measured();
  missing.global.preexcitation = { status: 'supported', supportingLeads: ['I', 'aVL', 'V5'], limitations: [] };
  assert.equal(buildFeatures(missing).preexcitationSupported, null);
  const insufficient = support(measured(), { I: 'positive', aVL: 'positive', V5: 'positive' });
  insufficient.details.V5.morphology.deltaEvidence.repeatableBeats = 1;
  assert.equal(buildFeatures(insufficient).preexcitationSupported, null);
  const noisy = support(measured(), { I: 'positive', aVL: 'positive', V5: 'positive' });
  noisy.details.V5.noiseMv = .08;
  assert.equal(buildFeatures(noisy).preexcitationSupported, null);
  const inconsistent = support(measured(), { I: 'positive', aVL: 'positive', V5: 'positive' });
  inconsistent.details.V5.morphology.deltaEvidence.initialSlopeMvPerMs = .3;
  assert.equal(buildFeatures(inconsistent).preexcitationSupported, null, 'a fast initial slope contradicts the slow-onset flag');
  for (const args of [missing, insufficient, noisy, inconsistent]) assert.ok(!met(run(args)).includes('wpw-pattern'));
});

test('actual normal, AF and bundle-block controls do not become preexcitation', () => {
  for (const name of ['sinus', 'af', 'rbbb', 'lbbb']) {
    const args = fixtures[name];
    assert.ok(!met(run(args)).includes('wpw-pattern'), name);
  }
  assert.equal(buildFeatures(fixtures.af).preexcitationSupported, null);
  assert.equal(fixtures.rbbb.global.preexcitation.supportingLeads.length, 1, 'isolated false delta candidate is preserved');
  assert.equal(buildFeatures(fixtures.rbbb).preexcitationSupported, null);
});

test('preexcitation makes pseudo-Q, secondary ST-T and bundle-like patterns differential without denying coexistence', () => {
  const args = support(measured(), { V1: 'negative', III: 'negative', aVL: 'positive' });
  args.values.qrsMs = 140;
  for (const lead of ['II', 'III', 'aVF']) Object.assign(args.details[lead].morphology, { qMv: -.3, qMs: 45 });
  for (const lead of ['V5', 'V6']) Object.assign(args.details[lead], { stMv: -.2, jMv: -.2, tMv: -.3 });
  for (const lead of ['V5', 'V6']) args.details[lead].morphology.stSlope = 'down';
  args.details.V1.morphology.rPrime = true;
  const result = run(args);
  assert.equal(result.primary?.entity.id, 'wpw-pattern');
  for (const id of ['old-mi-q-waves', 'nste-ischemia', 'rbbb-complete']) {
    const candidate = result.all.find(value => value.entity.id === id);
    assert.equal(candidate.status, 'possible', id);
    assert.ok(candidate.confoundingNotes.some(value => /cannot establish or exclude coexisting/.test(value.en)), id);
    assert.ok(!met(result).includes(id), id);
  }
  // Without measured preexcitation the same morphologic observations remain eligible;
  // neither a source label nor a short PR alone applies the confounder.
  args.global.preexcitation = { status: 'not-evaluable', supportingLeads: [], limitations: [] };
  assert.ok(run(args).all.find(value => value.entity.id === 'rbbb-complete').confoundingNotes.length === 0);
});

test('partial preexcitation also limits narrow-QRS voltage/strain attribution without discarding the observations', () => {
  const args = support(measured(), { V1: 'negative', III: 'negative', aVL: 'positive' });
  args.details.V1.sMv = -2.2; args.details.V5.rMv = 2;
  for (const lead of ['V5', 'V6']) {
    Object.assign(args.details[lead], { stMv: -.2, jMv: -.2, tMv: -.3 });
    args.details[lead].morphology.stSlope = 'down';
  }
  const result = run(args);
  assert.equal(result.primary?.entity.id, 'wpw-pattern');
  for (const id of ['lvh-sokolow-lyon', 'lvh-strain']) {
    const candidate = result.all.find(value => value.entity.id === id);
    assert.equal(candidate.status, 'possible');
    assert.ok(candidate.criteria.some(value => value.role === 'required' && value.result === true));
    assert.ok(candidate.confoundingNotes.length > 0);
    assert.ok(!met(result).includes(id));
  }
  const serialized = presumptiveFromMeasurements({ ...args, context: {} });
  const voltage = serialized.differentials.find(value => value.id === 'lvh-sokolow-lyon');
  assert.ok(voltage);
  assert.deepEqual(voltage.performance, [], 'published performance without the confounder is not applied');
  assert.equal(voltage.evidence, 'heuristic');
  assert.equal(voltage.strength, 'weak');
});
