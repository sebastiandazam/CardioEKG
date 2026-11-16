import { leads, type ViewerCase } from './cases'
import afib from './data/afib.json'
import normal from './data/normal.json'

function fromRecord(record: typeof afib | typeof normal, details: Pick<ViewerCase, 'pattern' | 'title' | 'attribution' | 'licenseUrl'>): ViewerCase {
  const traces=Object.fromEntries(leads.map(lead=>[lead,{mv:record.signals[lead],seconds:record.signals[lead].length/record.sampleRate}]));
  return {
    ...details,
    id: `record-${record.id}`,
    origin: 'clinical',
    findingOrigin: 'source',
    synchronized: true,
    rhythmLead: 'II',
    measurements:{rateBpm:null,prMs:null,qrsMs:null,qtMs:null,axisDeg:null},
    automaticMarkers:true,
    traces,
    sourceUrl: record.url,
  }
}

export const clinicalCases: ViewerCase[] = [
  fromRecord(afib, {
    pattern: 'af',
    title: { es: 'Fibrilación auricular · PTB‑XL', en: 'Atrial fibrillation · PTB‑XL' },
    attribution: { es: 'Wagner y cols. · PTB‑XL 1.0.3 · registro 00351 · 250 Hz', en: 'Wagner et al. · PTB‑XL 1.0.3 · record 00351 · 250 Hz' },
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  }),
  fromRecord(normal, {
    pattern: 'indeterminate',
    title: { es: 'Control sano · PTB Diagnostic ECG', en: 'Healthy control · PTB Diagnostic ECG' },
    attribution: { es: 'Bousseljot, Kreiseler y Schnabel · PTB Diagnostic ECG · s0303lre · extracto a 250 Hz', en: 'Bousseljot, Kreiseler and Schnabel · PTB Diagnostic ECG · s0303lre · 250 Hz excerpt' },
    licenseUrl: 'https://physionet.org/content/ptbdb/view-license/1.0.0/',
  }),
]
