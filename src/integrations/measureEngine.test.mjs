import assert from 'node:assert/strict';
import test from 'node:test';
import {compareMeasurements, circularDifference, measureEndpoint, validEngineResult} from './measureEngine.ts';

test('el eje se compara de forma circular', () => {
  assert.equal(circularDifference(179, -179), 2);
  const rows = compareMeasurements({rateBpm: 72, prMs: 160, qrsMs: 90, qtMs: 380, axisDeg: 179}, {rateBpm: 73, prMs: 152, qrsMs: 92, qtMs: 349, axisDeg: -179});
  assert.equal(rows.find(r => r.key === 'axisDeg').agrees, true);
  assert.equal(rows.find(r => r.key === 'qtMs').agrees, false, 'QT 31 ms de diferencia supera la tolerancia de 30');
  assert.equal(rows.find(r => r.key === 'rateBpm').delta, 1);
});

test('una medida ausente no cuenta como acuerdo ni desacuerdo', () => {
  const rows = compareMeasurements({rateBpm: null, prMs: 160, qrsMs: null, qtMs: 380, axisDeg: 40}, {rateBpm: 70, prMs: null, qrsMs: 90, qtMs: 380, axisDeg: 40});
  assert.deepEqual(rows.map(r => r.agrees), [null, null, null, true, true]);
});

test('el endpoint de medida deriva del de análisis y exige https', () => {
  assert.equal(measureEndpoint('https://api.example.org/api/analyze'), 'https://api.example.org/api/measure');
  assert.equal(measureEndpoint('https://api.example.org/base/api/analyze?x=1'), 'https://api.example.org/base/api/measure');
  assert.equal(measureEndpoint('http://api.example.org/api/analyze'), null);
  assert.equal(measureEndpoint(undefined), null);
});

test('rechaza respuestas con forma o valores inválidos', () => {
  const ok = {schemaVersion: 1, ok: true, engine: 'x', measurements: {rateBpm: 70, prMs: null, qrsMs: 90, qtMs: 380, axisDeg: 40}, quality: {warnings: []}};
  assert.equal(validEngineResult(ok), true);
  assert.equal(validEngineResult({...ok, measurements: {...ok.measurements, rateBpm: Infinity}}), false);
  assert.equal(validEngineResult({...ok, schemaVersion: 2}), false);
  assert.equal(validEngineResult(null), false);
  assert.equal(validEngineResult({...ok, quality:{warnings:null}}), false);
  assert.equal(validEngineResult({...ok, ranges:{qtMs:[200,NaN]}}), false);
});
