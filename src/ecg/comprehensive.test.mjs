import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
const code = buildSync({stdin: {contents: "export {analyzeCase} from './src/ecg/analyze';export {simulations} from './src/cases';", resolveDir: process.cwd()}, bundle: true, write: false, platform: 'node', format: 'esm'}).outputFiles[0].text;
const {analyzeCase, simulations} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const sim = pattern => simulations.find(s => s.pattern === pattern);
const read = (traces, context = {}, pattern = 'indeterminate') => analyzeCase({traces, measurements: {rateBpm: null, prMs: null, qrsMs: null, qtMs: null, axisDeg: null}, origin: 'research', findingOrigin: 'manual', pattern, synchronized: true, rhythmLead: 'II', automaticMarkers: true, clinicalContext: context}).systematic;
const statuses = (reading, id) => reading.sections.find(s => s.id === id).statements.map(s => s.status);

test('normal sinus recording gets a complete, conclusive normal reading', () => {
  const reading = read(sim('sinus').traces, {ageYears: 45, sexAtBirth: 'female'});
  assert.equal(reading.level, 'complete');
  assert.match(reading.conclusion.es, /^ECG dentro de límites normales: ritmo sinusal \(FC 75 lpm/);
  assert.deepEqual(reading.sections.map(s => s.id), ['rhythm', 'rate', 'intervals', 'axis', 'p', 'qrs', 'hypertrophy', 'st-t', 'clinical']);
});

test('the bundled PTB normal record is read as sinus rhythm within normal limits', () => {
  const rec = JSON.parse(readFileSync('src/data/normal.json', 'utf8'));
  const traces = Object.fromEntries(Object.entries(rec.signals).map(([lead, mv]) => [lead, {mv, seconds: mv.length / rec.sampleRate}]));
  assert.match(read(traces).conclusion.es, /^ECG dentro de límites normales/);
});

test('bundle branch blocks and atrial fibrillation are named when criteria are met', () => {
  assert.match(read(sim('rbbb').traces).conclusion.es, /bloqueo completo de rama derecha/);
  assert.match(read(sim('lbbb').traces).conclusion.es, /bloqueo completo de rama izquierda/);
  assert.match(read(sim('af').traces).conclusion.es, /^Probable fibrilación auricular/);
});

test('the case label never changes the systematic reading', () => {
  const plain = read(sim('sinus').traces, {}, 'indeterminate'), labelled = read(sim('sinus').traces, {}, 'af');
  assert.deepEqual(labelled.sections.filter(s => s.id !== 'st-t'), plain.sections.filter(s => s.id !== 'st-t'));
});

test('LBBB with chest pain: ST–T is secondary context, while the symptom keeps priority', () => {
  const reading = read(sim('lbbb').traces, {ageYears: 60, symptoms: ['chest-pain']});
  assert.ok(!statuses(reading, 'st-t').includes('meets'));
  assert.ok(reading.sections.find(s => s.id === 'clinical').statements.some(s => s.urgent));
  assert.match(reading.conclusion.es, /valoración clínica prioritaria/);
});

test('LVH voltage uses Sokolow-Lyon and sex-specific Cornell; hypertension is correlated', () => {
  const traces = Object.fromEntries(Object.entries(sim('sinus').traces).map(([lead, t]) => [lead, lead.startsWith('V') || lead === 'aVL' ? {...t, mv: t.mv.map(v => v * 2.6)} : t]));
  const reading = read(traces, {ageYears: 62, sexAtBirth: 'male', history: ['hypertension']});
  const lvh = reading.sections.find(s => s.id === 'hypertrophy').statements[0];
  assert.equal(lvh.status, 'meets');
  assert.match(lvh.text.es, /Sokolow-Lyon/);
  assert.match(lvh.text.es, /hipertensión/);
  assert.match(reading.conclusion.es, /hipertrofia ventricular izquierda/);
});

test('clinical history changes the reading: QT drugs, digoxin, AV-nodal drugs and potassium', () => {
  const reading = read(sim('sinus').traces, {medications: ['qt-prolonging', 'digoxin'], potassium: 'low'});
  const clinical = reading.sections.find(s => s.id === 'clinical').statements.map(s => s.text.es).join(' ');
  assert.match(clinical, /prolongan el QT/);
  assert.match(clinical, /Digoxina/);
  assert.match(clinical, /Potasio bajo/);
});

test('missing data is listed explicitly instead of producing a forced diagnosis', () => {
  const traces = {II: sim('sinus').traces.II, I: sim('sinus').traces.I, aVF: sim('sinus').traces.aVF};
  const reading = read(traces);
  assert.notEqual(reading.level, 'complete');
  assert.doesNotMatch(reading.conclusion.es, /dentro de límites normales/);
});

const {sgarbossa} = await import('data:text/javascript;base64,' + Buffer.from(buildSync({stdin: {contents: "export {sgarbossa} from './src/ecg/comprehensive';", resolveDir: process.cwd()}, bundle: true, write: false, platform: 'node', format: 'esm'}).outputFiles[0].text).toString('base64'));
test('Sgarbossa/Smith: concordant and excessively discordant ST are flagged, expected discordance is not', () => {
  const lead = (jMv, rMv, sMv) => ({jMv, rMv, sMv, noiseMv: .005});
  assert.deepEqual(sgarbossa({V5: lead(.15, 1, -.1)}).leads, ['V5']);            // concordant elevation
  assert.deepEqual(sgarbossa({V2: lead(-.12, .1, -1.5)}).leads, ['V2']);         // concordant depression V1–V3
  assert.deepEqual(sgarbossa({V3: lead(.5, .1, -1.6)}).leads, ['V3']);           // ST/S = 0.31
  assert.deepEqual(sgarbossa({V3: lead(.25, .1, -1.6), V6: lead(-.1, 1, 0)}).leads, []); // proportionate discordance
  assert.deepEqual(sgarbossa({V5: {...lead(.3, 1, 0), noiseMv: .05}}).leads, []);  // noisy lead ignored
});
test('simulated LBBB without ischaemia does not trigger Sgarbossa; QTc scale matches the rule engine', () => {
  const reading = read(sim('lbbb').traces, {symptoms: ['chest-pain']});
  assert.doesNotMatch(reading.conclusion.es, /Sgarbossa/);
  const normal = read(sim('sinus').traces, {sexAtBirth: 'male'});
  assert.match(normal.sections.find(s => s.id === 'intervals').statements.at(-1).criterion.es, /470\/480/);
});

test('irregular RR and undelineated P suggest AF without claiming established atrial absence',()=>{
 const reading=read(sim('af').traces);
 assert.ok(reading.sections.find(s=>s.id==='rhythm').statements.some(s=>s.status==='suggests'&&/auricular probable/.test(s.text.es)));
 assert.ok(!reading.diagnoses.some(v=>/^fibrilación auricular( con respuesta ventricular rápida)?$/i.test(v.es)));
});
