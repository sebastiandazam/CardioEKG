import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';

const code = buildSync({ stdin: { contents: "export {knowledgeBase} from './src/ecg/knowledge/index';export {buildFeatures,presumptiveDiagnosis,validateKnowledgeBase} from './src/ecg/knowledge/engine';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' } }).outputFiles[0].text;
const { knowledgeBase, buildFeatures, presumptiveDiagnosis, validateKnowledgeBase } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
/** A normal adult ECG as features; scenarios override what they change. */
function normal() {
  const base = { rateBpm: 72, prMs: 160, qrsMs: 90, qtMs: 380, qtcMs: 410, axisDeg: 50, pAxisDeg: 55, tAxisDeg: 45, rrCv: .04, beatCount: 12, regular: true, pPresent: true, pQrsRatio: 1, pRate: null, prVariable: false, qrsAlternans: false, groupedBeating: null, pacedSpikes: null, preexcitationSupported: false };
  const per = {
    I: { r: .8, s: -.15, t: .25, p: .1 }, II: { r: 1.1, s: -.15, t: .3, p: .15 }, III: { r: .5, s: -.2, t: .1, p: .05 },
    aVR: { r: .1, s: -.9, t: -.25, p: -.1 }, aVL: { r: .4, s: -.3, t: .1, p: .03 }, aVF: { r: .8, s: -.15, t: .2, p: .1 },
    V1: { r: .25, s: -.9, t: -.05, p: .05 }, V2: { r: .5, s: -1.2, t: .4, p: .08 }, V3: { r: .8, s: -.8, t: .45, p: .08 },
    V4: { r: 1.2, s: -.5, t: .4, p: .08 }, V5: { r: 1.3, s: -.3, t: .35, p: .08 }, V6: { r: 1.0, s: -.15, t: .3, p: .08 },
  };
  for (const lead of leads) {
    const x = per[lead];
    Object.assign(base, {
      [`lead.${lead}.pMv`]: x.p, [`lead.${lead}.pMs`]: 100, [`lead.${lead}.pTerminalMv`]: 0, [`lead.${lead}.pTerminalMs`]: 0,
      [`lead.${lead}.qMv`]: ['I', 'aVL', 'V5', 'V6'].includes(lead) ? -.05 : 0, [`lead.${lead}.qMs`]: ['I', 'aVL', 'V5', 'V6'].includes(lead) ? 15 : 0, [`lead.${lead}.qs`]: false,
      [`lead.${lead}.rMv`]: x.r, [`lead.${lead}.sMv`]: x.s, [`lead.${lead}.rPeakMs`]: 35, [`lead.${lead}.rPrime`]: false, [`lead.${lead}.notched`]: false,
      [`lead.${lead}.deltaSlurMs`]: 14, [`lead.${lead}.jMv`]: 0, [`lead.${lead}.stMv`]: 0, [`lead.${lead}.stSlope`]: 'flat', [`lead.${lead}.prSegMv`]: 0,
      [`lead.${lead}.tMv`]: x.t, [`lead.${lead}.tQrsRatio`]: Math.abs(x.t) / (x.r - x.s), [`lead.${lead}.uMv`]: null,
    });
  }
  return base;
}
const set = (f, lead, values) => { for (const [k, v] of Object.entries(values)) f[`lead.${lead}.${k}`] = v; return f; };
const run = (f, context = {}) => presumptiveDiagnosis(knowledgeBase, f, context);
const metIds = d => [d.primary, ...d.concurrent].filter(Boolean).map(r => r.entity.id);
const met = (d, pattern) => metIds(d).some(id => pattern.test(id));

test('knowledge base is structurally valid and every reference resolves', () => {
  assert.deepEqual(validateKnowledgeBase(knowledgeBase), []);
  assert.ok(knowledgeBase.entities.length >= 80);
});

test('a normal adult ECG yields sinus rhythm and no pathology', () => {
  const d = run(normal(), { ageYears: 45, sexAtBirth: 'female' });
  assert.match(d.primary.entity.id, /normal-sinus/);
  const abnormal = metIds(d).filter(id => !/normal-sinus/.test(id));
  assert.deepEqual(abnormal, [], `unexpected: ${abnormal.join(', ')}`);
});

test('anterior STEMI by the Fourth Universal Definition (male 55, V2–V4 elevation)', () => {
  const f = normal();
  for (const [lead, st] of [['V2', .35], ['V3', .4], ['V4', .25]]) set(f, lead, { jMv: st, stMv: st, stSlope: 'flat' });
  set(f, 'III', { jMv: -.1, stMv: -.1 }); set(f, 'aVF', { jMv: -.08, stMv: -.08 });
  const d = run(f, { ageYears: 55, sexAtBirth: 'male', symptoms: ['chest-pain'], onset: 'now' });
  assert.equal(d.primary.entity.urgency, 'emergent');
  assert.ok(met(d, /anterior-stemi/), metIds(d).join(', '));
});

test('V2–V3 elevation of 0.15 mV in a man under 40 is below the STEMI threshold', () => {
  const f = normal();
  for (const lead of ['V2', 'V3']) set(f, lead, { jMv: .15, stMv: .15 });
  const d = run(f, { ageYears: 30, sexAtBirth: 'male' });
  assert.ok(!met(d, /anterior-stemi/), metIds(d).join(', '));
});

test('complete RBBB is named; TEP and RVH are not concluded from RBBB alone', () => {
  const f = normal(); f.qrsMs = 140;
  set(f, 'V1', { rPrime: true, rMv: .6, sMv: -.3, rPeakMs: 70, tMv: -.2 }); set(f, 'V2', { rPrime: true });
  set(f, 'I', { sMv: -.4 }); set(f, 'V6', { sMv: -.4 });
  const d = run(f, {});
  assert.ok(met(d, /^rbbb-complete/), metIds(d).join(', '));
  assert.ok(!met(d, /pe-|pulmonary/), metIds(d).join(', '));
  assert.ok(!met(d, /right-ventricular-hypertrophy/), metIds(d).join(', '));
});

test('complete LBBB: named once; LVH voltage not concluded inside LBBB', () => {
  const f = normal(); f.qrsMs = 150; f.axisDeg = -20;
  set(f, 'V1', { rMv: .05, sMv: -2.2, qs: false, tMv: .4 }); set(f, 'V2', { rMv: .05, sMv: -2.6, tMv: .5 });
  for (const lead of ['I', 'aVL', 'V5', 'V6']) set(f, lead, { qMv: 0, qMs: 0, notched: true, rPeakMs: 80, rMv: 1.8, sMv: 0, tMv: -.3 });
  const d = run(f, { sexAtBirth: 'male', ageYears: 70 });
  assert.equal(metIds(d).filter(id => /lbbb-(complete|strauss)/.test(id)).length, 1, metIds(d).join(', '));
  assert.ok(!met(d, /^lvh-/), metIds(d).join(', '));
});

test('LVH by voltage in a hypertensive adult with a narrow QRS', () => {
  const f = normal();
  set(f, 'V1', { sMv: -2.2 }); set(f, 'V5', { rMv: 2.0 }); set(f, 'aVL', { rMv: 1.3 }); set(f, 'V3', { sMv: -1.8 });
  const d = run(f, { ageYears: 62, sexAtBirth: 'male', history: ['hypertension'] });
  assert.equal(metIds(d).filter(id => /^lvh-/.test(id) && id !== 'lvh-strain').length, 1, 'alternative LVH criteria are shown once');
});

test('atrial fibrillation with rapid ventricular response, shown once', () => {
  const f = normal(); Object.assign(f, { rateBpm: 128, rrCv: .22, regular: false, pPresent: false, prMs: null, pQrsRatio: null, pAxisDeg: null, beatCount: 14 });
  for (const lead of leads) set(f, lead, { pMv: null, pMs: null, pTerminalMv: null, pTerminalMs: null, prSegMv: null });
  const d = run(f, {});
  assert.equal(metIds(d).filter(id => /atrial-fibrillation/.test(id)).length, 1, metIds(d).join(', '));
  assert.ok(!met(d, /normal-sinus/));
});

test('hyperkalaemia needs the clinical context; tall T waves alone are not a diagnosis of hyperkalaemia', () => {
  const f = normal();
  for (const lead of ['V2', 'V3', 'V4']) set(f, lead, { tMv: 1.3, tQrsRatio: 1.0 });
  assert.ok(!met(run(f, {}), /hyperkal/), 'without potassium');
  const d = run(f, { potassium: 'high', history: ['renal-failure'] });
  assert.ok(met(d, /hyperkal/) || d.differentials.some(r => /hyperkal/.test(r.entity.id)), metIds(d).join(', '));
});

test('pre-excitation pattern: short PR and corroborated multilead morphology', () => {
  const f = normal(); f.prMs = 100; f.qrsMs = 130; f.preexcitationSupported = true;
  const d = run(f, {});
  assert.ok(met(d, /wpw|preexcit/), metIds(d).join(', '));
});

test('long QTc with QT-prolonging drugs is flagged; sinus bradycardia is named', () => {
  const f = normal(); Object.assign(f, { rateBpm: 46, qtMs: 560, qtcMs: 520 });
  const d = run(f, { sexAtBirth: 'female', medications: ['qt-prolonging'] });
  assert.ok(met(d, /qt/), metIds(d).join(', '));
  assert.ok(met(d, /sinus-bradycardia/), metIds(d).join(', '));
});

test('missing ST data never excludes an acute coronary occlusion', () => {
  const f = normal();
  for (const lead of leads) set(f, lead, { jMv: null, stMv: null, stSlope: null });
  const d = run(f, { symptoms: ['chest-pain'] });
  assert.ok(!met(d, /stemi/));
  assert.ok(d.cannotExclude.some(r => /stemi/.test(r.entity.id)), d.cannotExclude.map(r => r.entity.id).join(', '));
});

test('visible sinus tachycardia at 150 does not become reentry or atrial flutter', () => {
  const f = { ...normal(), rateBpm: 150 };
  const d = run(f, { symptoms: ['palpitations'] });
  assert.ok(met(d, /^sinus-tachycardia$/));
  assert.ok(!met(d, /^avnrt-avrt$/));
  assert.ok(!met(d, /^atrial-flutter-2to1-suspected$/));
});

test('a rate near 150 without atrial evidence keeps flutter in the differential', () => {
  const f = { ...normal(), rateBpm: 150, pPresent: null, pQrsRatio: null, prMs: null, prVariable: null };
  for (const lead of leads) set(f, lead, { pMv: null });
  const d = run(f);
  assert.ok(!met(d, /^atrial-flutter/));
  const flutter = d.differentials.find(r => r.entity.id === 'atrial-flutter-2to1-suspected');
  assert.ok(flutter);
  assert.ok(flutter.missing.some(c => c.id === 'f21-atrial-confirmation'));
  f.pRate = 300; f.pQrsRatio = 2;
  assert.ok(met(run(f), /^atrial-flutter/), 'measured atrial evidence can support flutter');
});

test('irregular wide-complex tachycardia identifies the syndrome without forcing AF or WPW', () => {
  const f = { ...normal(), rateBpm: 230, qrsMs: 160, regular: false, rrCv: .3, prMs: null, pPresent: null, pQrsRatio: null };
  for (const lead of leads) set(f, lead, { pMv: null, deltaSlurMs: null });
  const d = run(f, { symptoms: ['palpitations'] });
  assert.equal(d.primary.entity.id, 'irregular-wide-complex-tachycardia');
  assert.ok(!met(d, /^ventricular-tachycardia-wct$/), 'regular-WCT algorithms do not apply');
  assert.ok(!met(d, /^wpw-pattern$/));
  assert.ok(!met(d, /^atrial-fibrillation/), 'undetected P waves do not confirm AF');
  const unknownRhythm = run({ ...f, regular: null });
  assert.ok(!met(unknownRhythm, /^irregular-wide-complex/));
});

test('a regular wide-complex tachycardia retains a ventricular-versus-supraventricular differential', () => {
  const f = { ...normal(), rateBpm: 180, qrsMs: 160, prMs: null, pPresent: null, pQrsRatio: null };
  const d = run(f);
  assert.ok(met(d, /^ventricular-tachycardia-wct$/));
  assert.ok(!met(d, /^irregular-wide-complex/));
  assert.match(d.primary.entity.name.en, /VT vs SVT/);
});

test('acute anterior ST elevation with Q waves cannot establish chronic ventricular aneurysm', () => {
  const f = normal();
  for (const lead of ['V2', 'V3', 'V4']) set(f, lead, { jMv: .4, stMv: .4, qMs: 50, qMv: -.5, qs: true });
  const d = run(f, { ageYears: 55, sexAtBirth: 'male', symptoms: ['chest-pain'], onset: 'now' });
  assert.equal(d.primary.entity.id, 'anterior-stemi');
  assert.ok(!met(d, /^lv-aneurysm$/));
  assert.ok(d.differentials.some(r => r.entity.id === 'lv-aneurysm' && r.missing.some(c => c.id === 'lva-proven-persistence')));
});

test('a pacemaker history does not establish ventricular capture in an intrinsic narrow rhythm', () => {
  const d = run(normal(), { paced: 'yes' });
  assert.ok(!met(d, /^ventricular-paced-rhythm$/));
  const paced = d.differentials.find(r => r.entity.id === 'ventricular-paced-rhythm');
  assert.ok(paced?.missing.some(c => c.id === 'vpr-spikes'));
});

test('short PR with a normal small initial slope delay remains distinct from definite preexcitation', () => {
  const f = { ...normal(), prMs: 105 };
  const d = run(f);
  assert.ok(met(d, /^short-pr-no-preexcitation$/));
  assert.ok(!met(d, /^wpw-pattern$/));
});

test('nonspecific family sudden death and QTc 350 do not meet short-QT syndrome criteria', () => {
  const f = { ...normal(), qtcMs: 350 };
  const d = run(f, { history: ['family-sudden-death'] });
  assert.ok(!met(d, /^short-qt$/));
  assert.ok(met(run({ ...f, qtcMs: 315 }), /^short-qt$/), 'marked QT shortening is reported as a pattern');
});

test('PE-associated morphology and dyspnea provide an RV-strain pattern, not a confirmed embolus', () => {
  const f = { ...normal(), rateBpm: 115 };
  set(f, 'I', { sMv: -.5 }); set(f, 'III', { qMv: -.3, qMs: 35, tMv: -.3 });
  for (const lead of ['V1', 'V2', 'V3', 'V4']) set(f, lead, { tMv: -.3 });
  const d = run(f, { symptoms: ['dyspnea'], onset: 'now' });
  const strain = d.all.find(r => r.entity.id === 'acute-pe-rv-strain');
  assert.equal(strain.status, 'met');
  assert.match(strain.entity.name.en, /pattern compatible/);
  assert.match(strain.entity.limitations.en, /specific|diagnos|ECG/i);
});

test('source labels and free text do not participate in feature-based inference', () => {
  const f = normal(), base = run(f, {});
  const mislabeled = run({ ...f, sourceDiagnosis: 'ventricular tachycardia', diagnosis: 'Brugada syndrome' }, { freeText: 'Wave-Maven diagnosis: acute infarction and WPW' });
  assert.deepEqual(metIds(mislabeled), metIds(base));
  assert.deepEqual(mislabeled.summary, base.summary);
});

test('actual Python small-R/QS measurements do not declare infarction on a synthetic sinus waveform', () => {
  const measured = JSON.parse(readFileSync(new URL('./fixtures/python-small-r-qs.json', import.meta.url), 'utf8'));
  assert.equal(measured.details.V2.morphology.qsComplex, true, 'captures the measured false QS flag');
  assert.ok(measured.details.V2.rMv > .02, 'the same measurement contains a visible positive R');
  const features = buildFeatures(measured);
  assert.equal(features['lead.V2.qs'], null, 'contradictory small-R/QS morphology remains unknown');
  assert.equal(features['lead.V2.qMv'], null);
  const d = run(features);
  assert.ok(!met(d, /^old-mi-q-waves$/));
  // Also check the newer measurement output, which suppresses zero Q duration.
  measured.details.V2.morphology.qMs = null;
  assert.ok(!met(run(buildFeatures(measured)), /^old-mi-q-waves$/));
});

test('isolated anterior QS and separated precordial Q waves do not establish an infarct territory', () => {
  const isolated = normal(); set(isolated, 'V2', { qs: true, rMv: 0, sMv: -.7, qMv: -.7, qMs: 70 });
  assert.ok(!met(run(isolated), /^old-mi-q-waves$/));
  const separated = normal();
  for (const lead of ['V3', 'V6']) set(separated, lead, { qMv: -.3, qMs: 40 });
  assert.ok(!met(run(separated), /^old-mi-q-waves$/));
  set(separated, 'V5', { qMv: -.3, qMs: 40 });
  assert.ok(met(run(separated), /^old-mi-q-waves$/), 'concordant V5-V6 Q waves retain a pathological-Q pattern');
});

test('dominant anterior R with positive T is insufficient without measured R duration', () => {
  const f = normal();
  for (const lead of ['V1', 'V2']) set(f, lead, { rMv: 1, sMv: -.3, tMv: .25 });
  const d = run(f);
  assert.ok(!met(d, /^old-mi-q-waves$/));
  const oldMi = d.all.find(r => r.entity.id === 'old-mi-q-waves');
  assert.equal(oldMi.criteria.find(c => c.id === 'r-posterior').result, true);
  assert.equal(oldMi.criteria.find(c => c.id === 'r-posterior').role, 'supporting');
});

test('actual Python wide-QRS voltage/score findings defer LVH attribution without forcing a bundle block', () => {
  const measured = JSON.parse(readFileSync(new URL('./fixtures/python-wide-qrs-voltage.json', import.meta.url), 'utf8'));
  assert.equal(measured.values.qrsMs, 161);
  assert.equal(measured.details.V1.morphology.rPrime, null);
  const d = run(buildFeatures(measured));
  assert.ok(!met(d, /^lvh-/));
  const score = d.all.find(r => r.entity.id === 'lvh-romhilt-estes');
  assert.equal(score.criteria.find(c => c.id === 're-ge4').result, true, 'the unguarded score would be positive');
  assert.equal(score.criteria.find(c => c.id === 'lvh-narrow-qrs-applicability').result, false);
  assert.ok(!met(d, /^lbbb-|^rbbb-/), 'width alone does not force a particular bundle block');
});

test('unmeasured QRS duration cannot confirm LVH despite high voltage', () => {
  const f = { ...normal(), qrsMs: null };
  set(f, 'V1', { sMv: -3.5 }); set(f, 'V5', { rMv: 3.5 });
  const d = run(f, { sexAtBirth: 'male', history: ['hypertension'] });
  assert.ok(!met(d, /^lvh-/));
});
