import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { leads, simulations } from '../src/cases.ts'
import { findings, getEvidence, getManagement, glossary, makeEvidencePrompt, sources } from '../src/evidence.ts'

test('clinical fixtures preserve 12 calibrated traces and record provenance', () => {
  for (const [name, samples] of [['afib', 2500], ['normal', 3000]]) {
    const record = JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'))
    assert.deepEqual(Object.keys(record.signals), leads)
    assert.equal(record.sampleRate, 250)
    assert.ok(record.originalChecksums && record.upstreamBlob)
    for (const trace of Object.values(record.signals)) {
      assert.equal(trace.length, samples)
      assert.ok(trace.every(Number.isFinite))
      assert.ok(Math.max(...trace) - Math.min(...trace) > 0.1)
    }
  }
})

test('simulations obey limb lead algebra and phase markers remain inside the record', () => {
  for (const item of simulations) {
    const { I, II, III, aVR } = item.traces
    assert.equal(Object.keys(item.traces).length, 12)
    assert.ok(III.mv.every((value, index) => Math.abs(I.mv[index] + value - II.mv[index]) < 1e-10))
    assert.ok(aVR.mv.every((value, index) => Math.abs(value + (I.mv[index] + II.mv[index]) / 2) < 1e-10))
    assert.ok(item.markers.every(marker => marker.start >= 0 && marker.end > marker.start && marker.end <= II.seconds))
    assert.ok(Number.isInteger(item.measurements.axisDeg))
    if (item.pattern === 'lbbb') assert.ok(item.measurements.axisDeg < -30)
    if (item.pattern === 'af') assert.ok(item.markers.every(marker => marker.phase !== 'p'))
  }
})

test('evidence links resolve to catalog entries and prompts only take a finding', () => {
  const ids = new Set(sources.map(source => source.id))
  assert.equal(ids.size, sources.length)
  for (const entry of [...Object.values(findings), ...glossary]) assert.ok(entry.sourceIds.every(id => ids.has(id)))
  for (const id of Object.keys(findings)) assert.match(makeEvidencePrompt(id), /ECG|electrocardiograma/)
})


test('every finding has localized management, urgent guidance, and resolvable citations', () => {
  for (const language of ['es', 'en']) {
    const evidence = getEvidence(language)
    const ids = new Set(evidence.sources.map(source => source.id))
    assert.deepEqual(Object.keys(evidence.findings), Object.keys(findings))
    assert.equal(evidence.glossary.length, glossary.length)
    for (const entry of [...Object.values(evidence.findings), ...evidence.glossary]) {
      assert.ok(entry.sourceIds.every(id => ids.has(id)))
    }
    for (const id of Object.keys(findings)) {
      const guidance = getManagement(id, language)
      assert.ok(guidance.impression && guidance.initialSteps.length >= 2 && guidance.urgent)
      assert.ok(guidance.sourceIds.length && guidance.sourceIds.every(source => ids.has(source)))
      assert.notEqual(makeEvidencePrompt(id, 'en'), makeEvidencePrompt(id, 'es'))
    }
    const af = getManagement('af', language)
    assert.match(af.initialSteps.join(' '), /cardiovers/)
    assert.match(af.urgent, /ACV|stroke/)
    const indeterminate = getManagement('indeterminate', language)
    assert.match(indeterminate.impression, /no permite|insufficient/)
  }
})
