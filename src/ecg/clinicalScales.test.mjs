import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';

const code = buildSync({
  entryPoints: ['src/ecg/analyze.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
}).outputFiles[0].text;
const m = { exports: {} };
new Function('require', 'module', 'exports', code)(createRequire(import.meta.url), m, m.exports);
const { analyzeCase } = m.exports;

const scCode = buildSync({
  entryPoints: ['src/ecg/clinicalScales.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
}).outputFiles[0].text;
const scMod = { exports: {} };
new Function('require', 'module', 'exports', scCode)(createRequire(import.meta.url), scMod, scMod.exports);
const { evaluateClinicalScreening } = scMod.exports;

function makeLeadDetail(overrides = {}) {
  return {
    beatRMv: [1.0, 1.0, 1.0, 1.0],
    peaksSeconds: [0.4, 1.2, 2.0, 2.8],
    qrsMs: 90,
    pOnsetOffsetMs: -160,
    tOnsetOffsetMs: 140,
    tEndOffsetMs: 380,
    qrsOnsetOffsetMs: -40,
    qrsEndOffsetMs: 50,
    netQrsMvMs: 10,
    jMv: 0.0,
    stMv: 0.0,
    rMv: 1.0,
    sMv: -0.2,
    tMv: 0.25,
    pMv: 0.12,
    noiseMv: 0.01,
    rrCv: 0.02,
    beatCount: 4,
    completeBeatCount: 4,
    morphology: {},
    ...overrides,
  };
}

test('Modified Smith-Sgarbossa Rule triggers on excessive ST/S discordance <= -0.25 in LBBB', () => {
  const details = {
    I: makeLeadDetail({ qrsMs: 148, rMv: 0.8, sMv: -0.1, jMv: 0.02, stMv: 0.02 }),
    V1: makeLeadDetail({ qrsMs: 148, rMv: 0.1, sMv: -1.2, jMv: 0.35, stMv: 0.32 }),
    V2: makeLeadDetail({ qrsMs: 148, rMv: 0.1, sMv: -1.0, jMv: 0.3, stMv: 0.28 }),
    V6: makeLeadDetail({ qrsMs: 148, rMv: 0.9, sMv: -0.1, jMv: 0.0, stMv: 0.0 }),
  };
  const report = evaluateClinicalScreening({
    values: { rateBpm: 82, prMs: 170, qrsMs: 148, qtMs: 440, axisDeg: -10 },
    details,
    global: { pAxisDeg: 50, tAxisDeg: 20, prVariable: false, pConductedFraction: 1, qrsAlternans: false, pPresent: true },
    rhythm: { rrCv: 0.02, beatCount: 8 },
    qtcMs: null,
    qtcBogossianMs: 430,
    findings: [{ id: 'lbbb-morphology', label: { es: 'BRI', en: 'LBBB' }, evidence: [], limitations: [], confidence: { level: 'low', calibrated: false, explanation: { es: '', en: '' } }, sourceLeads: ['V1', 'V6'], referenceIds: ['aha-conduction'], category: 'conduction', urgent: false }],
    context: { ageYears: 66, sexAtBirth: 'male', symptoms: ['chest-pain'] },
    evaluatedLeads: ['I', 'V1', 'V2', 'V6'],
  });
  const sgarbossa = report.scales.find(s => s.id === 'smith-sgarbossa');
  assert.equal(sgarbossa.applicability, 'indicated');
  assert.equal(sgarbossa.riskLevel, 'positive');
  assert.equal(report.triage.level, 'emergent');
  assert.ok(report.articulatedComparison.some(c => c.parameter === 'qt-qtc' && c.observed.es.includes('430')));
});

test('ESC 2024 CHA2DS2-VA is sex-neutral and Tisdale QTc flags high arrhythmia risk >= 500 ms', () => {
  const details = {
    II: makeLeadDetail({ pMv: null }),
    V1: makeLeadDetail({ pMv: null }),
  };
  const female = evaluateClinicalScreening({
    values: { rateBpm: 118, prMs: null, qrsMs: 92, qtMs: 440, axisDeg: 40 },
    details,
    global: { pAxisDeg: null, tAxisDeg: 45, prVariable: null, pConductedFraction: null, qrsAlternans: false, pPresent: false, flutterSuspected: true, atrialRateBpm: 280 },
    rhythm: { rrCv: 0.22, beatCount: 10 },
    qtcMs: 515,
    findings: [{ id: 'af-consider', label: { es: 'FA', en: 'AF' }, evidence: [], limitations: [], confidence: { level: 'low', calibrated: false, explanation: { es: '', en: '' } }, sourceLeads: ['II'], referenceIds: ['acc-af'], category: 'rhythm', urgent: false }],
    context: { ageYears: 76, sexAtBirth: 'female', history: ['hypertension', 'diabetes'], medications: ['qt-prolonging'], potassium: 'low', symptoms: ['syncope'] },
    evaluatedLeads: ['II', 'V1'],
  });
  const male = evaluateClinicalScreening({
    values: { rateBpm: 118, prMs: null, qrsMs: 92, qtMs: 440, axisDeg: 40 },
    details,
    global: { pAxisDeg: null, tAxisDeg: 45, prVariable: null, pConductedFraction: null, qrsAlternans: false, pPresent: false, flutterSuspected: true, atrialRateBpm: 280 },
    rhythm: { rrCv: 0.22, beatCount: 10 },
    qtcMs: 515,
    findings: [{ id: 'af-consider', label: { es: 'FA', en: 'AF' }, evidence: [], limitations: [], confidence: { level: 'low', calibrated: false, explanation: { es: '', en: '' } }, sourceLeads: ['II'], referenceIds: ['acc-af'], category: 'rhythm', urgent: false }],
    context: { ageYears: 76, sexAtBirth: 'male', history: ['hypertension', 'diabetes'], medications: ['qt-prolonging'], potassium: 'low', symptoms: ['syncope'] },
    evaluatedLeads: ['II', 'V1'],
  });

  const chF = female.scales.find(s => s.id === 'cha2ds2-va');
  const chM = male.scales.find(s => s.id === 'cha2ds2-va');
  assert.equal(chF.applicability, 'indicated');
  assert.equal(chF.score, 4); // Age >=75 (+2) + HTN (+1) + DM (+1), zero sex points!
  assert.equal(chM.score, 4);

  const tisdale = female.scales.find(s => s.id === 'tisdale-qtc');
  assert.equal(tisdale.applicability, 'indicated');
  assert.equal(tisdale.riskLevel, 'high');
  assert.ok(tisdale.score >= 9);
  assert.equal(female.triage.level, 'emergent');
});

test('Wide-complex tachycardia, Wenckebach, and freeText isolation invariant in analyzeCase', () => {
  const details = {
    I: makeLeadDetail({ qrsMs: 168 }),
    II: makeLeadDetail({ qrsMs: 168 }),
    aVR: makeLeadDetail({ qrsMs: 168, rMv: 0.9, sMv: -0.2 }),
    V1: makeLeadDetail({ qrsMs: 168, rMv: 1.0, sMv: -0.04 }),
    V2: makeLeadDetail({ qrsMs: 168, rMv: 1.1, sMv: -0.02 }),
    V3: makeLeadDetail({ qrsMs: 168, rMv: 1.0, sMv: -0.02 }),
    V4: makeLeadDetail({ qrsMs: 168, rMv: 0.9, sMv: -0.02 }),
  };
  const trace = { seconds: 5, mv: Array.from({ length: 1000 }, (_, i) => Math.sin(i / 15)) };
  const py = {
    schemaVersion: 1,
    ok: true,
    engine: 'python-test',
    estimate: {
      measurements: { rateBpm: 162, prMs: null, qrsMs: 168, qtMs: 360, axisDeg: -120 },
      reasons: {},
      markersByLead: {},
      leadDetails: details,
      measurementLeads: { rateBpm: ['II'], qrsMs: ['I', 'II', 'V1'] },
      qrsMethod: 'robust-local-consensus',
      global: {
        pAxisDeg: null,
        tAxisDeg: 40,
        prVariable: true,
        pConductedFraction: 0.5,
        qrsAlternans: true,
        wenckebachSuspected: true,
        pvcCount: 0,
        pacCount: 0,
        pPresent: false,
      },
    },
    rhythmEstimate: null,
    manualMeasurements: {},
    derived: { qtcFridericiaMs: null, qtcBazettMs: null, qtcBogossianMs: 458 },
    quality: { warnings: [], irregular: false, analyzedLeads: Object.keys(details), referenceLead: 'II', pDetectedLeads: 0, rrCvPct: 2 },
  };

  const baseInput = {
    measurementEngine: 'python',
    traces: Object.fromEntries(Object.keys(details).map(k => [k, trace])),
    measurements: { rateBpm: null, prMs: null, qrsMs: null, qtMs: null, axisDeg: null },
    origin: 'clinical',
    pattern: 'indeterminate',
    findingOrigin: 'source',
    synchronized: true,
    rhythmLead: 'II',
    pythonAnalysis: py,
    clinicalContext: { ageYears: 62, history: ['cardiac'], symptoms: ['syncope'] },
  };
  const a = analyzeCase(baseInput);
  const b = analyzeCase({
    ...baseInput,
    clinicalContext: { ...baseInput.clinicalContext, freeText: 'STEMI inferior sinusal normal Brugada' },
  });
  assert.deepEqual(a.screening, b.screening);
  assert.equal(a.confidence.calibrated, false);
  assert.equal(a.confidence.probability, undefined);
  assert.equal(a.screening.triage.level, 'emergent');
  const wct = a.screening.scales.find(s => s.id === 'wct-brugada-vereckei-pava');
  assert.equal(wct.applicability, 'indicated');
  assert.equal(wct.riskLevel, 'high');
  assert.ok(wct.score >= 5);
  const av = a.screening.scales.find(s => s.id === 'av-conduction-syncope');
  assert.equal(av.riskLevel, 'high');
});
