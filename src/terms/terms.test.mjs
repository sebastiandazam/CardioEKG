import assert from 'node:assert/strict'
import test from 'node:test'
import { getEvidence } from '../evidence.ts'
import { technicalSegments } from './lexicon.ts'

test('uses the longest glossary expression and preserves the original Spanish text', () => {
  const text = 'ECG. Nodo AV, intervalo RR y desviación izquierda del eje. Eje frontal del QRS.'
  const segments = technicalSegments(text, 'es')
  assert.equal(segments.map(segment => segment.text).join(''), text)
  assert.deepEqual(segments.filter(segment => segment.entry).map(segment => segment.entry.term), [
    'Electrocardiograma (ECG)', 'Nodo auriculoventricular', 'Intervalo RR', 'Desviación del eje', 'Eje eléctrico frontal',
  ])
})

test('recognizes English variations and avoids matches within other words', () => {
  const text = '12‑lead ECG, P-wave, SA node and QRS duration. Leadership, _ECG and ECG123.'
  const segments = technicalSegments(text, 'en')
  assert.equal(segments.map(segment => segment.text).join(''), text)
  assert.deepEqual(segments.filter(segment => segment.entry).map(segment => segment.entry.term), [
    'Electrocardiogram (ECG)', 'P wave', 'Sinoatrial (SA) node', 'QRS complex',
  ])
})

test('retains the original evidence link in both languages', () => {
  for (const language of ['es', 'en']) {
    const text = language === 'es' ? 'Bloqueo completo de rama izquierda y cardioversión sincronizada' :
      'Complete left bundle branch block and synchronized cardioversion'
    const segments = technicalSegments(text, language).filter(segment => segment.entry)
    assert.equal(segments.length, 2)
    const sourceIds = new Set(getEvidence(language).sources.map(source => source.id))
    assert.ok(segments.every(segment => segment.entry.sourceIds.every(id => sourceIds.has(id))))
  }
})

test('deduplicates repeated glossary terms and suppresses out-of-context generic nouns', () => {
  const repeated = 'El ECG muestra onda P previa al QRS, luego otra onda P y otro ECG. Evaluar derivaciones inferiores y ventrículo.'
  const deduped = technicalSegments(repeated, 'es', { deduplicate: true }).filter(s => s.entry)
  assert.deepEqual(deduped.map(s => s.entry.term), ['Electrocardiograma (ECG)', 'Onda P'])
  const clinical = 'Criterios de Sgarbossa positivos, escala de Tisdale y escala CHA₂DS₂-VA.'
  const clinicalTerms = technicalSegments(clinical, 'es', { deduplicate: true }).filter(s => s.entry).map(s => s.entry.term)
  assert.deepEqual(clinicalTerms, ['Criterios de Sgarbossa', 'Escala de Tisdale', 'Escala CHA₂DS₂-VA'])
})
