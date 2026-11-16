import type {ClinicalContext} from './ecg/context';
import type {MeasurementReasons} from './ecg/estimate';
import type { FindingId } from './evidence'
import type { Language } from './locale'

export const leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const
export type Lead = (typeof leads)[number]
export type Trace = { mv: number[]; seconds: number; quality?: number;recordingCalibration?:{speed:number;gain:number;gainSource:'user-declared'|'digital'} }
export type Measurements = { rateBpm: number | null; prMs: number | null; qrsMs: number | null; qtMs: number | null; axisDeg: number | null }
export type CaptureProvenance={commonRecording:boolean;commonCalibration:boolean;speed?:number;gain?:number;layout?:string;timing:'simultaneous'|'sequential'|'unknown';userConfirmedComparable?:boolean;leadSources?:Partial<Record<Lead,string>>};
export type Phase = 'p' | 'qrs' | 't'
export type Marker = { start: number; end: number; phase: Phase }
export type ViewerCase = {
  measurementEngine?:'python'
  pythonAnalysis?:import('./ecg/pythonAnalysis').PythonAnalysis
  /** Processed capture image kept only in this browser session, never serialized for remote analysis. */
  measurementImage?:File
  externalEvidence?:import('./integrations/evidenceNote').ExternalEvidenceNote
  educationalReference?:import('./integrations/waveMaven').EducationalReference
  id: string
  title?: Record<Language, string>
  pattern: FindingId
  traces: Partial<Record<Lead, Trace>>
  algorithmFindings?:import('./research/modelDecisions').ModelLabel[];
  clinicalContext?:ClinicalContext
  captureProvenance?: CaptureProvenance
  measurementWindows?:Partial<Record<keyof Measurements,{lead:Lead;captureLead?:Lead|'II-long';start:number;end:number}[]>>
  measurementReasons?: MeasurementReasons
  automaticMarkers?: boolean
  measurements: Measurements
  origin: 'simulation' | 'clinical' | 'research'
  findingOrigin: 'manual' | 'algorithm' | 'source' | 'simulation'
  synchronized: boolean
  rhythmLead: Lead | null
  markers?: Marker[]
  markersByLead?: Partial<Record<Lead, Marker[]>>
  sourceUrl?: string
  attribution?: Record<Language, string>
  licenseUrl?: string
  rhythmTrace?:Trace;
  rhythmStrip?: 'long' | 'short'
  measurementOrigins?: Partial<Record<keyof Measurements, 'automatic' | 'caliper'>>
}

const profile = [0.72, 1, 0.34, -0.8, 0.36, 0.7, -0.48, -0.25, 0.36, 0.9, 1.08, 0.81]
const wave = (t: number, center: number, width: number) => Math.exp(-(((t - center) / width) ** 2))

function simulate(pattern: Exclude<FindingId, 'indeterminate'>): ViewerCase {
  const af = pattern === 'af'
  const wide = pattern === 'lbbb' || pattern === 'rbbb'
  const beats = af ? [0.42, 1.05, 1.92, 2.51, 3.38, 3.93, 4.66, 5.56, 6.17, 7.03, 7.56, 8.37, 9.04, 9.77]
    : Array.from({ length: 13 }, (_, i) => 0.44 + i * 0.8)
  const duration = 10
  const sampleRate = 200
  const markers: Marker[] = beats.flatMap(beat => [
    ...(af ? [] : [{ phase: 'p' as const, start: beat - 0.2, end: beat - 0.1 }]),
    { phase: 'qrs' as const, start: beat - 0.038, end: beat + (wide ? 0.11 : 0.048) },
    { phase: 't' as const, start: beat + (wide ? 0.2 : 0.145), end: beat + 0.36 },
  ]).filter(marker => marker.start < duration).map(marker => ({ ...marker, end: Math.min(duration, marker.end) }))
  const independent = ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const
  const traces = Object.fromEntries(independent.map(lead => {
    const index = leads.indexOf(lead)
    const scale = pattern === 'lbbb' && lead === 'II' ? -0.23 : profile[index]
    const mv = Array.from({ length: duration * sampleRate }, (_, sample) => {
      const t = sample / sampleRate
      let value = 0.013 * Math.sin(2.2 * t + index * 0.35)
      if (af) value += 0.015 * Math.sin(42 * t) + 0.014 * Math.sin(29 * t + 0.4)
      for (const beat of beats) {
        const offset = t - beat
        if (Math.abs(offset) > 0.46) continue
        if (!af) value += (index === 6 ? -0.035 : 0.14 * profile[index]) * wave(offset, -0.151, 0.027)
        if (pattern === 'rbbb' && (lead === 'V1' || lead === 'V2')) {
          value += 0.29 * wave(offset, 0, 0.017) - 0.39 * wave(offset, 0.031, 0.017) + 0.83 * wave(offset, 0.083, 0.019)
        } else if (pattern === 'lbbb' && (lead === 'V1' || lead === 'V2')) {
          value += 0.12 * wave(offset, -0.02, 0.022) - 1.02 * wave(offset, 0.034, 0.043)
        } else if (pattern === 'lbbb' && ['I', 'II', 'V5', 'V6'].includes(lead)) {
          value += scale * (0.81 * wave(offset, 0.006, 0.032) + 0.73 * wave(offset, 0.065, 0.025))
        } else {
          const lateralRbbb = pattern === 'rbbb' && ['I', 'V5', 'V6'].includes(lead)
          value += scale * (-0.12 * wave(offset, -0.028, 0.012) + 1.1 * wave(offset, 0, 0.014)
            - (lateralRbbb ? 0.5 : 0.21) * wave(offset, lateralRbbb ? 0.065 : 0.03, lateralRbbb ? 0.032 : 0.012))
        }
        const discordant = (pattern === 'lbbb' && ['I', 'aVL', 'V1', 'V2', 'V5', 'V6'].includes(lead)) ||
          (pattern === 'rbbb' && ['V1', 'V2'].includes(lead))
        const tAmplitude = discordant ? (lead === 'V1' || lead === 'V2' ? (pattern === 'rbbb' ? -0.2 : 0.24) : -0.24) : scale * 0.29
        value += tAmplitude * wave(offset, wide ? 0.28 : 0.235, 0.05)
      }
      return Number(value.toFixed(4))
    })
    return [lead, { mv, seconds: duration }]
  })) as Record<Lead, Trace>
  const limbLead = (derive: (i: number, ii: number) => number): Trace => ({
    seconds: duration,
    mv: traces.I.mv.map((value, index) => derive(value, traces.II.mv[index])),
  })
  traces.III = limbLead((i, ii) => ii - i)
  traces.aVR = limbLead((i, ii) => -(i + ii) / 2)
  traces.aVL = limbLead((i, ii) => i - ii / 2)
  traces.aVF = limbLead((i, ii) => ii - i / 2)
  const qrs = markers.find(marker => marker.phase === 'qrs')!
  const start = Math.round(qrs.start * sampleRate)
  const end = Math.round(qrs.end * sampleRate)
  function area(lead: 'I' | 'aVF') {
    const samples = traces[lead].mv
    const baseline = samples[start - 4]
    return samples.slice(start, end).reduce((sum, sample) => sum + sample - baseline, 0)
  }
  const axisDeg = Math.round(Math.atan2(2 * area('aVF') / Math.sqrt(3), area('I')) * 180 / Math.PI)
  return {
    id: pattern, pattern, traces, markers, origin: 'simulation', findingOrigin: 'simulation', synchronized: true, rhythmLead: 'II',
    measurements: { rateBpm: af ? Math.round(60 * (beats.length - 1) / (beats.at(-1)! - beats[0])) : 75, prMs: af ? null : 162, qrsMs: wide ? 148 : 86, qtMs: 398, axisDeg },
  }
}

export const simulations = (['sinus', 'af', 'rbbb', 'lbbb'] as const).map(simulate)
