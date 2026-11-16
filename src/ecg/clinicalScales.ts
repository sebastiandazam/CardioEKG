import { clinicalText } from './presentation';
import type { Lead, Measurements } from '../cases';
import type { AnalysisFinding, AnalysisReference, Localized } from './analysisTypes';
import type { ClinicalContext } from './context';
import type { GlobalFeatures, LeadDetail } from './estimate';
import type { PresumptiveSummary } from './knowledge/index';

export type ScreeningTriageLevel = 'emergent' | 'urgent' | 'routine' | 'normal';

export type ScreeningTriage = {
  level: ScreeningTriageLevel;
  label: Localized;
  rationale: Localized;
  redFlags: Localized[];
  immediateActions: Localized[];
  sourceIds: string[];
};

export type ComparisonStatus = 'normal' | 'borderline' | 'abnormal' | 'not-evaluable';

export type LiteratureComparisonItem = {
  parameter: 'rate' | 'rhythm' | 'pr' | 'qrs' | 'qt-qtc' | 'axis' | 'st-t' | 'dynamics';
  label: Localized;
  observed: Localized;
  guidelineCutoff: Localized;
  status: ComparisonStatus;
  interpretation: Localized;
  referenceId: string;
  citation: string;
};

export type ScaleCriterionBreakdown = {
  label: Localized;
  points?: number;
  status: 'met' | 'not-met' | 'unknown';
  detail?: Localized;
};

export type ClinicalScaleResult = {
  id:
    | 'tisdale-qtc'
    | 'cha2ds2-va'
    | 'smith-sgarbossa'
    | 'wct-brugada-vereckei-pava'
    | 'omi-territorial-screen'
    | 'av-conduction-syncope';
  name: Localized;
  applicability: 'indicated' | 'conditional' | 'not-indicated';
  score: number | null;
  maxScore: number | null;
  riskLevel: 'high' | 'moderate' | 'low' | 'positive' | 'negative' | 'indeterminate';
  riskLabel: Localized;
  criteriaBreakdown: ScaleCriterionBreakdown[];
  missingInputs: Localized[];
  recommendation: Localized;
  referenceId: string;
  citation: string;
};

export type ClinicalScreeningReport = {
  triage: ScreeningTriage;
  articulatedComparison: LiteratureComparisonItem[];
  scales: ClinicalScaleResult[];
  references: AnalysisReference[];
};

export type ClinicalScalesInput = {
  values: Measurements;
  details: Partial<Record<Lead, LeadDetail>>;
  global?: GlobalFeatures;
  rhythm?: { rrCv: number | null; beatCount: number } | null;
  qtcMs: number | null;
  qtcBazettMs?: number | null;
  qtcBogossianMs?: number | null;
  findings: AnalysisFinding[];
  presumptive?: PresumptiveSummary;
  context: ClinicalContext;
  evaluatedLeads: Lead[];
};

const L = (es: string, en: string): Localized => ({
  es: clinicalText(es),
  en: clinicalText(en),
});

export const screeningReferences: AnalysisReference[] = [
  {
    id: 'universal-mi',
    name: 'ESC/ACC/AHA/WHF · Fourth Universal Definition of Myocardial Infarction (2018)',
    url: 'https://doi.org/10.1093/eurheartj/ehy462',
    reviewedAt: '2026-11-15',
  },
  {
    id: 'esc-acs',
    name: 'ESC · 2023 Guidelines for the management of acute coronary syndromes',
    url: 'https://doi.org/10.1093/eurheartj/ehad191',
    reviewedAt: '2026-11-15',
  },
  {
    id: 'esc-af-2024',
    name: 'ESC/EACTS · 2024 Guidelines for the management of atrial fibrillation (CHA2DS2-VA)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/39210723/',
    reviewedAt: '2026-11-15',
  },
  {
    id: 'esc-va',
    name: 'ESC · 2022 Ventricular arrhythmias and prevention of sudden cardiac death',
    url: 'https://doi.org/10.1093/eurheartj/ehac262',
    reviewedAt: '2026-11-15',
  },
  {
    id: 'esc-svt',
    name: 'ESC · 2019 Supraventricular tachycardia guideline',
    url: 'https://doi.org/10.1093/eurheartj/ehz467',
    reviewedAt: '2026-11-15',
  },
  {
    id: 'aha-tdp',
    name: 'AHA/ACCF · Prevention of Torsade de Pointes in Hospital Settings (2010)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3056123/',
    reviewedAt: '2026-11-15',
  },
  {
    id: 'smith-sgarbossa',
    name: 'Smith et al. · Diagnosis of ST-elevation MI in LBBB: Modified Sgarbossa Rule (2012)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/22939607/',
    reviewedAt: '2026-11-15',
  },
  {
    id: 'tisdale-2013',
    name: 'Tisdale et al. · Development and validation of a risk score for QT interval prolongation (2013)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/23716032/',
    reviewedAt: '2026-11-15',
  },
];

function v2v3ThresholdMv(context: ClinicalContext): { threshold: number; note: Localized } {
  if (context.sexAtBirth === 'female') {
    return { threshold: 0.15, note: L('≥ 0,15 mV en mujer (V2–V3)', '≥ 0.15 mV in women (V2–V3)') };
  }
  if (context.sexAtBirth === 'male' && context.ageYears !== undefined) {
    if (context.ageYears < 40) {
      return { threshold: 0.25, note: L('≥ 0,25 mV en hombre < 40 años (V2–V3)', '≥ 0.25 mV in men < 40y (V2–V3)') };
    }
    return { threshold: 0.2, note: L('≥ 0,20 mV en hombre ≥ 40 años (V2–V3)', '≥ 0.20 mV in men ≥ 40y (V2–V3)') };
  }
  return {
    threshold: 0.2,
    note: L('≥ 0,20 mV orientativo en V2–V3 (depende de sexo/edad)', '≥ 0.20 mV provisional in V2–V3 (sex/age dependent)'),
  };
}

function fmtNum(v: number | null | undefined, digits = 0, suffix = ''): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const r = digits === 0 ? Math.round(v) : Number(v.toFixed(digits));
  return suffix ? `${r} ${suffix}` : `${r}`;
}

function leadStInfo(details: Partial<Record<Lead, LeadDetail>>, leadsList: Lead[]) {
  return leadsList
    .map(lead => ({ lead, d: details[lead] }))
    .filter((x): x is { lead: Lead; d: LeadDetail } => !!x.d && (x.d.noiseMv ?? 1) < 0.03 && x.d.qrsMs !== null);
}

/**
 * Evaluates structured, guideline-backed clinical scales, articulated literature comparison,
 * and risk triage purely from measured ECG signals and structured clinical fields
 * (strictly ignoring freeText / source diagnosis strings).
 */
export function evaluateClinicalScreening(input: ClinicalScalesInput): ClinicalScreeningReport {
  const { values, details, global, rhythm, qtcMs, qtcBogossianMs, findings, presumptive, context, evaluatedLeads } = input;
  const symptoms = context.symptoms ?? [];
  const history = context.history ?? [];
  const medications = context.medications ?? [];
  const hasSym = (s: NonNullable<ClinicalContext['symptoms']>[number]) => symptoms.includes(s);
  const hasHist = (h: NonNullable<ClinicalContext['history']>[number]) => history.includes(h);
  const hasMed = (m: NonNullable<ClinicalContext['medications']>[number]) => medications.includes(m);
  const paced = context.paced === 'yes';
  const preexcited = global?.preexcitation?.status === 'supported' && !paced;
  const wideQrs = values.qrsMs !== null && values.qrsMs >= 120;
  const effectiveQtc = wideQrs ? (qtcBogossianMs ?? null) : qtcMs;
  const allEval = leadStInfo(details, evaluatedLeads);
  const presPrimaryId = presumptive?.primary?.id ?? null;
  const presUrgencies = [presumptive?.primary, ...(presumptive?.concurrent ?? [])]
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map(e => e.urgency);

  const lbbbPresent =
    presPrimaryId?.startsWith('lbbb-') ||
    findings.some(f => f.id === 'lbbb-morphology') ||
    (wideQrs &&
      (details.V1?.sMv !== null && details.V1?.sMv !== undefined && Math.abs(details.V1.sMv) > (details.V1?.rMv ?? 0)) &&
      (details.I?.rMv ?? 0) > 0.2 &&
      (details.V6?.rMv ?? 0) > 0.2);

  const rbbbPresent =
    presPrimaryId?.startsWith('rbbb-') ||
    presPrimaryId?.startsWith('bifascicular-rbbb') ||
    findings.some(f => f.id === 'rbbb-morphology');

  const afOrFlutter =
    presPrimaryId?.startsWith('atrial-fibrillation') ||
    presPrimaryId?.startsWith('atrial-flutter') ||
    !!global?.flutterSuspected ||
    findings.some(f => f.id === 'af-consider');

  // ---------------------------------------------------------------------------
  // 1. Articulated comparison with clinical literature cutoffs
  // ---------------------------------------------------------------------------
  const articulatedComparison: LiteratureComparisonItem[] = [];

  // Rate
  {
    const r = values.rateBpm;
    const status: ComparisonStatus =
      r === null ? 'not-evaluable' : r >= 60 && r <= 100 ? 'normal' : r < 40 || r > 150 ? 'abnormal' : r < 50 || r > 100 ? 'abnormal' : 'borderline';
    articulatedComparison.push({
      parameter: 'rate',
      label: L('Frecuencia ventricular', 'Ventricular rate'),
      observed: L(fmtNum(r, 0, 'lpm'), fmtNum(r, 0, 'bpm')),
      guidelineCutoff: L('60–100 lpm (adulto en reposo)', '60–100 bpm (resting adult)'),
      status,
      interpretation: L(
        r === null
          ? 'No fue posible estimar la frecuencia por escasez o ruido de complejos R.'
          : r < 50
            ? 'Bradicardia < 50 lpm: descartar disfunción sinusal, bloqueo AV de alto grado o efecto nodal.'
            : r < 60
              ? 'Frecuencia entre 50 y 59 lpm: puede ser fisiológica (vagotonía/entrenamiento) si hay ritmo sinusal y asintomático.'
              : r <= 100
                ? 'Dentro del rango de referencia adulto (60–100 lpm).'
                : r <= 150
                  ? 'Taquicardia > 100 lpm: diferenciar origen sinusal, auricular/flutter o ventricular según QRS y onda P.'
                  : 'Taquicardia marcada (> 150 lpm): priorizar estabilidad hemodinámica y flutter 2:1 / TSV / TV.',
        r === null
          ? 'Ventricular rate could not be estimated due to insufficient R-wave detections.'
          : r < 50
            ? 'Bradycardia < 50 bpm: exclude sinus node dysfunction, high-grade AV block, or AV-nodal drug effect.'
            : r < 60
              ? 'Heart rate 50–59 bpm: may be physiological if sinus and asymptomatic.'
              : r <= 100
                ? 'Within standard resting adult range (60–100 bpm).'
                : r <= 150
                  ? 'Tachycardia > 100 bpm: differentiate sinus, atrial/flutter, or ventricular origin by QRS width and P waves.'
                  : 'Marked tachycardia (> 150 bpm): assess hemodynamic stability and rule out 2:1 flutter, SVT, or VT.',
      ),
      referenceId: 'acc-brady',
      citation: 'Kusumoto et al. ACC/AHA/HRS Bradycardia Guideline (2018)',
    });
  }

  // Rhythm & atrial activity
  {
    const cv = rhythm?.rrCv ?? null;
    const flutter = !!global?.flutterSuspected;
    const pCond = global?.pConductedFraction ?? null;
    const obsEs = flutter
      ? `Flutter auricular sospechado (~${fmtNum(global?.atrialRateBpm, 0, 'lpm')} auricular), RR CV ${cv !== null ? cv.toFixed(2) : '—'}`
      : `RR CV ${cv !== null ? cv.toFixed(2) : '—'}, PR ${fmtNum(values.prMs, 0, 'ms')}${pCond !== null ? `, conducción P ${(pCond * 100).toFixed(0)} %` : ''}`;
    const obsEn = flutter
      ? `Suspected atrial flutter (~${fmtNum(global?.atrialRateBpm, 0, 'bpm')} atrial), RR CV ${cv !== null ? cv.toFixed(2) : '—'}`
      : `RR CV ${cv !== null ? cv.toFixed(2) : '—'}, PR ${fmtNum(values.prMs, 0, 'ms')}${pCond !== null ? `, P conduction ${(pCond * 100).toFixed(0)}%` : ''}`;
    const status: ComparisonStatus =
      cv === null && values.prMs === null
        ? 'not-evaluable'
        : flutter || (cv !== null && cv > 0.12 && values.prMs === null)
          ? 'abnormal'
          : global?.pPresent === false || (pCond !== null && pCond < 0.9)
            ? 'abnormal'
            : values.prMs !== null && cv !== null && cv <= 0.1
              ? 'normal'
              : 'borderline';
    articulatedComparison.push({
      parameter: 'rhythm',
      label: L('Ritmo y actividad auricular', 'Rhythm & atrial activity'),
      observed: L(obsEs, obsEn),
      guidelineCutoff: L('RR regulares (CV ≤ 0,10), P sinusal 1:1 (+ en II, − en aVR)', 'Regular RR (CV ≤ 0.10), 1:1 sinus P (+ II, − aVR)'),
      status,
      interpretation: L(
        flutter
          ? 'Espectro auricular periódico (3,8–5,8 Hz, 230–350 lpm): suprime falsas ondas P y exige descartar flutter auricular típico.'
          : status === 'abnormal' && cv !== null && cv > 0.12
            ? 'Irregularidad RR marcada sin ondas P reproducibles: compatible con fibrilación auricular; confirmar en tira larga II/V1.'
            : status === 'normal'
              ? 'Regularidad y relación P–QRS consistentes con origen sinusal.'
              : 'Actividad auricular o regularidad limítrofe; correlacionar con tira de ritmo y morfología de P en II y V1.',
        flutter
          ? 'Periodic atrial spectrum (3.8–5.8 Hz, 230–350 bpm): suppresses false P waves and warrants checking for typical atrial flutter.'
          : status === 'abnormal' && cv !== null && cv > 0.12
            ? 'Marked RR irregularity without repeatable P waves: consistent with atrial fibrillation; confirm on long II/V1 strip.'
            : status === 'normal'
              ? 'RR regularity and P–QRS relationship consistent with sinus origin.'
              : 'Borderline atrial activity or regularity; correlate with rhythm strip and P morphology in II/V1.',
      ),
      referenceId: 'esc-af-2024',
      citation: 'Van Gelder et al. 2024 ESC/EACTS AF Guidelines; Joung et al. arXiv:2304.06237',
    });
  }

  // PR interval
  {
    const pr = values.prMs;
    const status: ComparisonStatus =
      pr === null
        ? 'not-evaluable'
        : global?.wenckebachSuspected
          ? 'abnormal'
          : pr >= 120 && pr <= 200
            ? 'normal'
            : pr > 300 || pr < 120
              ? 'abnormal'
              : 'borderline';
    articulatedComparison.push({
      parameter: 'pr',
      label: L('Intervalo PR / Conducción AV', 'PR interval / AV conduction'),
      observed: L(
        `${fmtNum(pr, 0, 'ms')}${global?.wenckebachSuspected ? ' (alargamiento progresivo tipo Wenckebach)' : global?.prVariable ? ' (PR variable)' : ''}`,
        `${fmtNum(pr, 0, 'ms')}${global?.wenckebachSuspected ? ' (progressive Wenckebach lengthening)' : global?.prVariable ? ' (variable PR)' : ''}`,
      ),
      guidelineCutoff: L('120–200 ms constante (adultos)', 'Constant 120–200 ms (adults)'),
      status,
      interpretation: L(
        global?.wenckebachSuspected
          ? 'Alargamiento progresivo del PR latido a latido con pausa: patrón compatible con bloqueo AV de segundo grado Mobitz I (Wenckebach).'
          : pr === null
            ? 'PR no medible (ausencia de onda P reproducible, FA/flutter o unión AV).'
            : pr < 120
              ? `PR corto (< 120 ms)${preexcited ? ' con candidatos de onda delta: patrón WPW' : ': valorar origen auricular bajo o preexcitación'}.`
              : pr <= 200
                ? 'Conducción auriculoventricular dentro del intervalo fisiológico (120–200 ms).'
                : pr > 300
                  ? 'Bloqueo AV de primer grado marcado (> 300 ms): puede provocar disincronía AV y simular bloqueo funcional.'
                  : 'Bloqueo AV de primer grado (PR > 200 ms): revisar bloqueadores nodales o progresión si QRS ancho.',
        global?.wenckebachSuspected
          ? 'Progressive beat-to-beat PR prolongation preceding dropped QRS: compatible with Mobitz I (Wenckebach) second-degree AV block.'
          : pr === null
            ? 'PR not measurable (absent repeatable P wave, AF/flutter, or junctional rhythm).'
            : pr < 120
              ? `Short PR (< 120 ms)${preexcited ? ' with delta candidates: WPW pattern' : ': assess low-atrial origin or pre-excitation'}.`
              : pr <= 200
                ? 'AV conduction within normal adult range (120–200 ms).'
                : pr > 300
                  ? 'Marked first-degree AV delay (> 300 ms): assess for AV dyssynchrony and intermittent progression.'
                  : 'First-degree AV delay (PR > 200 ms): review AV-nodal agents or infranodal risk if QRS is wide.',
      ),
      referenceId: 'acc-brady',
      citation: 'Kusumoto et al. ACC/AHA/HRS Bradycardia Guideline (2018)',
    });
  }

  // QRS duration & morphology
  {
    const qrs = values.qrsMs;
    const status: ComparisonStatus =
      qrs === null ? 'not-evaluable' : qrs < 110 ? 'normal' : qrs >= 120 ? 'abnormal' : 'borderline';
    articulatedComparison.push({
      parameter: 'qrs',
      label: L('Complejo QRS (despolarización)', 'QRS complex (depolarization)'),
      observed: L(
        `${fmtNum(qrs, 0, 'ms')}${lbbbPresent ? ' (morfología tipo BRI)' : rbbbPresent ? ' (morfología tipo BRD)' : ''}`,
        `${fmtNum(qrs, 0, 'ms')}${lbbbPresent ? ' (LBBB morphology)' : rbbbPresent ? ' (RBBB morphology)' : ''}`,
      ),
      guidelineCutoff: L('< 110 ms normal; ≥ 120 ms bloqueo completo / ritmo ancho', '< 110 ms normal; ≥ 120 ms complete block / wide QRS'),
      status,
      interpretation: L(
        qrs === null
          ? 'Duración QRS no determinada.'
          : qrs < 110
            ? 'Despolarización intraventricular sincrónica (< 110 ms).'
            : qrs < 120
              ? 'Retraso intraventricular incompleto (110–119 ms): comprobar rSr′ en V1 o criterios de BRI incompleto.'
              : lbbbPresent
                ? `QRS ≥ 120 ms (${qrs} ms) con patrón tipo BRI: invalida criterios estándar de isquemia ST y exige regla de Smith-Sgarbossa.`
                : rbbbPresent
                  ? `QRS ≥ 120 ms (${qrs} ms) con patrón tipo BRD: revisar desviación extrema del eje para descartar bloqueo bifascicular.`
                  : `QRS ancho (${qrs} ms): diferenciar trastorno intraventricular inespecífico, preexcitación, toxicidad Na⁺ o ritmo ventricular.`,
        qrs === null
          ? 'QRS duration unavailable.'
          : qrs < 110
            ? 'Synchronous intraventricular depolarization (< 110 ms).'
            : qrs < 120
              ? 'Incomplete intraventricular conduction delay (110–119 ms): inspect V1 for rSr′ or incomplete bundle delay.'
              : lbbbPresent
                ? `Wide QRS (${qrs} ms) with LBBB-like pattern: standard ST-elevation rules are confounded; apply Modified Smith-Sgarbossa.`
                : rbbbPresent
                  ? `Wide QRS (${qrs} ms) with RBBB-like pattern: inspect frontal axis for associated fascicular block (bifascicular pattern).`
                  : `Wide QRS (${qrs} ms): distinguish nonspecific IVCD, pre-excitation, Na⁺-channel toxicity, or ventricular rhythm.`,
      ),
      referenceId: 'aha-conduction',
      citation: 'Surawicz et al. AHA/ACCF/HRS Intraventricular Conduction (2009)',
    });
  }

  // QT / QTc & Repolarization correction
  {
    const flagCutoff = context.sexAtBirth === 'male' ? 470 : 480;
    const status: ComparisonStatus =
      effectiveQtc === null
        ? wideQrs && values.qtMs !== null
          ? 'borderline'
          : 'not-evaluable'
        : effectiveQtc >= 500
          ? 'abnormal'
          : effectiveQtc >= flagCutoff
            ? 'abnormal'
            : effectiveQtc >= 450
              ? 'borderline'
              : 'normal';
    articulatedComparison.push({
      parameter: 'qt-qtc',
      label: L('Intervalo QT / QTc corregido', 'QT / rate-corrected QTc interval'),
      observed: L(
        wideQrs
          ? `QT ${fmtNum(values.qtMs, 0, 'ms')}${qtcBogossianMs ? ` · QTc Bogossian ${qtcBogossianMs} ms` : ' · QTc sin ajuste Bogossian disponible'}`
          : `QT ${fmtNum(values.qtMs, 0, 'ms')} · QTc Fridericia ${fmtNum(qtcMs, 0, 'ms')}`,
        wideQrs
          ? `QT ${fmtNum(values.qtMs, 0, 'ms')}${qtcBogossianMs ? ` · Bogossian QTc ${qtcBogossianMs} ms` : ' · Bogossian QTc unavailable'}`
          : `QT ${fmtNum(values.qtMs, 0, 'ms')} · Fridericia QTc ${fmtNum(qtcMs, 0, 'ms')}`,
      ),
      guidelineCutoff: L(
        wideQrs
          ? 'QRS ≥ 120 ms: usar ajuste Bogossian (QT − 0,485×QRS) o intervalo JT (< 360 ms); crítico ≥ 500 ms'
          : `Normal < 450 ms (< 460 ms mujer); elevado ≥ ${flagCutoff} ms; crítico Torsades ≥ 500 ms`,
        wideQrs
          ? 'QRS ≥ 120 ms: apply Bogossian correction (QT − 0.485×QRS) or JT interval; critical ≥ 500 ms'
          : `Normal < 450 ms (< 460 ms female); prolonged ≥ ${flagCutoff} ms; critical TdP threshold ≥ 500 ms`,
      ),
      status,
      interpretation: L(
        effectiveQtc === null
          ? 'QTc no calculable de forma fiable por ritmo irregular, preexcitación o ausencia de límites T válidos.'
          : effectiveQtc >= 500
            ? `QTc crítico (≥ 500 ms): alto riesgo de Torsades de Pointes según AHA/ACCF. Suspender fármacos QTc si procede y corregir K⁺/Mg²⁺.`
            : effectiveQtc >= flagCutoff
              ? `QTc prolongado (≥ ${flagCutoff} ms): evaluar fármacos en escala de Tisdale, bradicardia y electrolitos.`
              : effectiveQtc >= 450
                ? 'QTc limítrofe (≥ 450 ms): vigilar si se añaden fármacos prolongadores de QT o hipopotasemia.'
                : 'Repolarización QT corregida dentro de límites fisiológicos.',
        effectiveQtc === null
          ? 'Reliable QTc unavailable due to irregular rhythm, pre-excitation, or missing T-end boundaries.'
          : effectiveQtc >= 500
            ? 'Critical QTc (≥ 500 ms): elevated Torsade de Pointes risk per AHA/ACCF; review QT-prolonging drugs and K⁺/Mg²⁺.'
            : effectiveQtc >= flagCutoff
              ? `Prolonged QTc (≥ ${flagCutoff} ms): evaluate reversible contributors via Tisdale score, bradycardia, and electrolytes.`
              : effectiveQtc >= 450
                ? 'Borderline QTc (≥ 450 ms): monitor closely if QT-prolonging medications or hypokalemia coexist.'
                : 'Rate-corrected QT repolarization within normal range.',
      ),
      referenceId: 'aha-tdp',
      citation: 'Drew et al. AHA/ACCF Prevention of TdP (2010); Rautaharju AHA/QT (2009)',
    });
  }

  // Frontal axis
  {
    const a = values.axisDeg;
    const status: ComparisonStatus =
      a === null ? 'not-evaluable' : a >= -30 && a <= 90 ? 'normal' : a > -45 && a < -30 ? 'borderline' : 'abnormal';
    articulatedComparison.push({
      parameter: 'axis',
      label: L('Eje eléctrico frontal QRS', 'Frontal QRS axis'),
      observed: L(a !== null ? `${a > 0 ? '+' : ''}${a}°` : '—', a !== null ? `${a > 0 ? '+' : ''}${a}°` : '—'),
      guidelineCutoff: L('−30° a +90° (normal adulto)', '−30° to +90° (adult reference)'),
      status,
      interpretation: L(
        a === null
          ? 'Eje no comparable o derivaciones frontales insuficientes.'
          : a >= -30 && a <= 90
            ? 'Eje frontal dentro del cuadrante inferior-izquierdo normal (−30° a +90°).'
            : a < -30 && a >= -90
              ? a <= -45
                ? 'Desviación izquierda marcada (≤ −45°): evaluar hemibloqueo anterior izquierdo (qR en I/aVL, rS inferior) o necrosis inferior.'
                : 'Desviación izquierda leve (−31° a −44°): correlacionar con HVI y morfología aVL/II.'
              : a > 90 && a <= 180
                ? 'Desviación derecha (> +90°): valorar sobrecarga ventricular derecha, hemibloqueo posterior izquierdo, EPOC o mala colocación I/aVR.'
                : 'Eje en cuadrante extremo noroeste (−90° a −180°): signo de alarma para origen ventricular (TV) o inversión severa.',
        a === null
          ? 'Frontal axis not comparable or limb leads insufficient.'
          : a >= -30 && a <= 90
            ? 'Frontal QRS axis within the normal adult quadrant (−30° to +90°).'
            : a < -30 && a >= -90
              ? a <= -45
                ? 'Marked left axis deviation (≤ −45°): assess for left anterior fascicular block (qR in I/aVL, rS inferior) or prior inferior MI.'
                : 'Mild left axis deviation (−31° to −44°): correlate with LVH and limb morphology.'
              : a > 90 && a <= 180
                ? 'Right axis deviation (> +90°): assess for RV strain, LPFB, COPD, or limb-lead reversal.'
                : 'Extreme northwest axis (−90° to −180°): strong warning sign favoring ventricular origin or marked rightward shift.',
      ),
      referenceId: 'aha-tech',
      citation: 'Kligfield et al. AHA/ACCF/HRS ECG Standardization (2007)',
    });
  }

  // ST-T segment comparison
  {
    const { threshold: v2v3Thresh, note: v2v3Note } = v2v3ThresholdMv(context);
    const maxSte = allEval.reduce<{ lead: Lead; val: number } | null>(
      (best, { lead, d }) =>
        d.jMv !== null && (!best || d.jMv > best.val) ? { lead, val: d.jMv } : best,
      null,
    );
    const maxStd = allEval.reduce<{ lead: Lead; val: number } | null>(
      (best, { lead, d }) =>
        d.stMv !== null && (!best || d.stMv < best.val) ? { lead, val: d.stMv } : best,
      null,
    );
    const sigSte = allEval.filter(
      ({ lead, d }) =>
        d.jMv !== null &&
        d.jMv >= (lead === 'V2' || lead === 'V3' ? v2v3Thresh : 0.1),
    );
    const sigStd = allEval.filter(({ d }) => d.stMv !== null && d.stMv <= -0.1);
    const status: ComparisonStatus = !allEval.length
      ? 'not-evaluable'
      : sigSte.length >= 2 || sigStd.length >= 2
        ? 'abnormal'
        : sigSte.length === 1 || sigStd.length === 1
          ? 'borderline'
          : 'normal';

    articulatedComparison.push({
      parameter: 'st-t',
      label: L('Segmento ST y repolarización regional', 'ST segment & regional repolarization'),
      observed: L(
        allEval.length
          ? `Máx supradesnivel J: ${maxSte ? `${maxSte.lead} ${maxSte.val.toFixed(2)} mV` : '—'} · Máx infradesnivel ST60: ${maxStd ? `${maxStd.lead} ${maxStd.val.toFixed(2)} mV` : '—'}`
          : 'Sin derivaciones de calidad suficiente',
        allEval.length
          ? `Max J-point ST elevation: ${maxSte ? `${maxSte.lead} ${maxSte.val.toFixed(2)} mV` : '—'} · Max ST60 depression: ${maxStd ? `${maxStd.lead} ${maxStd.val.toFixed(2)} mV` : '—'}`
          : 'Insufficient clean leads',
      ),
      guidelineCutoff: L(
        `4.ª Def. Universal IAM: ≥ 0,10 mV general; ${v2v3Note.es}; infradesnivel ≥ 0,05–0,10 mV contiguo`,
        `4th UDMI: ≥ 0.10 mV general; ${v2v3Note.en}; contiguous depression ≥ 0.05–0.10 mV`,
      ),
      status,
      interpretation: L(
        sigSte.length >= 2
          ? `Supradesnivel J significativo en ${sigSte.map(x => `${x.lead} (${x.d.jMv?.toFixed(2)} mV)`).join(', ')}: ${lbbbPresent ? 'evaluar con regla de Smith-Sgarbossa por QRS tipo BRI.' : 'correlacionar con territorio coronario y síntomas agudos.'}`
          : sigStd.length >= 2
            ? `Descenso ST en ${sigStd.map(x => `${x.lead} (${x.d.stMv?.toFixed(2)} mV)`).join(', ')}: descartar isquemia subendocárdica, lesión recíproca o efecto digitálico/sobrecarga.`
            : status === 'borderline'
              ? 'Alteración ST aislada en una derivación: verificar contigüidad, línea de base PQ y ECG seriados.'
              : 'Sin desviaciones ST significativas en derivaciones evaluables (no excluye isquemia precoz o sin elevación del ST si hay síntomas).',
        sigSte.length >= 2
          ? `Significant J-point elevation in ${sigSte.map(x => `${x.lead} (${x.d.jMv?.toFixed(2)} mV)`).join(', ')}: ${lbbbPresent ? 'apply Modified Smith-Sgarbossa due to LBBB pattern.' : 'correlate with coronary territory and acute symptoms.'}`
          : sigStd.length >= 2
            ? `ST depression in ${sigStd.map(x => `${x.lead} (${x.d.stMv?.toFixed(2)} mV)`).join(', ')}: exclude subendocardial ischemia, reciprocal changes, or strain/digoxin.`
            : status === 'borderline'
              ? 'Single-lead ST shift: verify contiguous territory, PQ baseline, and serial ECGs.'
              : 'No significant ST deviations in clean leads (does not exclude early or NSTE ischemia in symptomatic patients).',
      ),
      referenceId: 'universal-mi',
      citation: 'Thygesen et al. Fourth Universal Definition of MI (2018); Byrne et al. ESC ACS (2023)',
    });
  }

  // Beat-to-beat dynamics (PVC, PAC, Alternans)
  if (
    global &&
    (global.pvcCount !== undefined ||
      global.pacCount !== undefined ||
      global.qrsAlternans !== null)
  ) {
    const pvcs = global.pvcCount ?? 0;
    const pacs = global.pacCount ?? 0;
    const alt = !!global.qrsAlternans;
    const status: ComparisonStatus =
      alt || pvcs >= 2 ? 'abnormal' : pvcs === 1 || pacs >= 2 ? 'borderline' : 'normal';
    articulatedComparison.push({
      parameter: 'dynamics',
      label: L('Dinámica latido a latido (ectopia / alternancia)', 'Beat-to-beat dynamics (ectopy / alternans)'),
      observed: L(
        `CVP detectadas: ${pvcs} · CAP detectadas: ${pacs} · Alternancia QRS: ${alt ? 'Sí' : 'No'}`,
        `PVCs detected: ${pvcs} · PACs detected: ${pacs} · QRS alternans: ${alt ? 'Yes' : 'No'}`,
      ),
      guidelineCutoff: L('Sin alternancia eléctrica; ectopias aisladas < 1–2 en 10 s', 'No electrical alternans; minimal ectopy on 10 s strip'),
      status,
      interpretation: L(
        alt
          ? 'Alternancia eléctrica de amplitud QRS (> 20 % entre latidos impares/pares): descartar derrame pericárdico grande / taponamiento o taquiarritmia de reentrada.'
          : pvcs >= 2
            ? `Se detectaron ${pvcs} complejos ventriculares prematuros (QRS ancho precoz sin P previa): valorar carga ectópica, electrolitos e isquemia.`
            : pvcs === 1 || pacs > 0
              ? 'Ectopia aislada detectada; correlacionar con palpitaciones y morfología original.'
              : 'Estabilidad morfológica latido a latido sin alternancia eléctrica ni ectopias frecuentes.',
        alt
          ? 'Electrical QRS alternans (> 20% odd/even R-amplitude ratio): rule out large pericardial effusion / tamponade or re-entrant tachycardia.'
          : pvcs >= 2
            ? `${pvcs} premature ventricular complexes detected (premature wide QRS without preceding P): evaluate ischemia, electrolytes, and PVC burden.`
            : pvcs === 1 || pacs > 0
              ? 'Isolated ectopy detected; correlate with symptoms on the original tracing.'
              : 'Stable beat-to-beat morphology without electrical alternans or frequent ectopy.',
      ),
      referenceId: 'esc-va',
      citation: 'Zeppenfeld et al. 2022 ESC Ventricular Arrhythmias Guideline',
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Clinical Scales
  // ---------------------------------------------------------------------------
  const scales: ClinicalScaleResult[] = [];

  // Scale A: Tisdale QTc Risk Score (2013)
  {
    const isIndicated =
      (effectiveQtc !== null && effectiveQtc >= 450) ||
      hasMed('qt-prolonging') ||
      context.potassium === 'low' ||
      hasSym('syncope');
    const agePt = context.ageYears === undefined ? null : context.ageYears >= 68 ? 1 : 0;
    const sexPt =
      context.sexAtBirth === 'female' ? 1 : context.sexAtBirth === 'male' ? 0 : null;
    const kPt =
      context.potassium === 'low'
        ? 2
        : context.potassium === 'normal' || context.potassium === 'high'
          ? 0
          : null;
    const qtcPt = effectiveQtc === null ? null : effectiveQtc >= 450 ? 2 : 0;
    const miFlag =
      findings.some(f => f.id.startsWith('st-elevation')) ||
      presPrimaryId?.includes('stemi') ||
      presPrimaryId === 'de-winter-pattern';
    const miPt = miFlag ? 2 : hasSym('chest-pain') ? null : 0;
    const drugPt = hasMed('qt-prolonging') ? 3 : context.medications ? 0 : null;

    const score =
      (agePt ?? 0) + (sexPt ?? 0) + (kPt ?? 0) + (qtcPt ?? 0) + (miPt ?? 0) + (drugPt ?? 0);
    const missingInputs: Localized[] = [
      L('Uso de diurético de asa (+1 pt)', 'Loop diuretic use (+1 pt)'),
      L('Insuficiencia cardíaca o sepsis activa (+3 pts)', 'Heart failure or sepsis (+3 pts)'),
      L('Número exacto de fármacos QTc (≥ 2 fármacos = +3 adicionales)', 'Exact count of QTc drugs (≥ 2 drugs = +3 extra)'),
    ];
    if (agePt === null) missingInputs.unshift(L('Edad del paciente', 'Patient age'));
    if (kPt === null) missingInputs.unshift(L('Potasio sérico exacto (K⁺ ≤ 3,5 mEq/L)', 'Serum potassium (K⁺ ≤ 3.5 mEq/L)'));

    const highTdP = effectiveQtc !== null && effectiveQtc >= 500;
    const riskLevel: ClinicalScaleResult['riskLevel'] = highTdP || score >= 11 ? 'high' : score >= 7 ? 'moderate' : 'low';
    scales.push({
      id: 'tisdale-qtc',
      name: L('Escala de Riesgo de Prolongación QTc (Tisdale, 2013)', 'Tisdale QTc Prolongation Risk Score (2013)'),
      applicability: isIndicated ? 'indicated' : 'conditional',
      score,
      maxScore: 21,
      riskLevel,
      riskLabel:
        riskLevel === 'high'
          ? L(
              highTdP ? `Riesgo ALTO (QTc crítico ${effectiveQtc} ms ≥ 500 ms; Tisdale mín. ${score}/21)` : `Riesgo ALTO (Tisdale ≥ 11 pts; score mín. ${score}/21)`,
              highTdP ? `HIGH risk (Critical QTc ${effectiveQtc} ms ≥ 500 ms; min Tisdale ${score}/21)` : `HIGH risk (Tisdale ≥ 11 pts; min score ${score}/21)`,
            )
          : riskLevel === 'moderate'
            ? L(`Riesgo MODERADO (${score}/21 pts confirmados; rango 7–10)`, `MODERATE risk (${score}/21 confirmed pts; range 7–10)`)
            : L(`Riesgo BAJO mínimo confirmado (${score}/21 pts; completar variables hospitalarias)`, `LOW minimum confirmed risk (${score}/21 pts; complete inpatient variables)`),
      criteriaBreakdown: [
        { label: L('Edad ≥ 68 años (+1)', 'Age ≥ 68 years (+1)'), points: 1, status: agePt === null ? 'unknown' : agePt > 0 ? 'met' : 'not-met' },
        { label: L('Sexo femenino (+1)', 'Female sex (+1)'), points: 1, status: sexPt === null ? 'unknown' : sexPt > 0 ? 'met' : 'not-met' },
        { label: L('Potasio sérico ≤ 3,5 mEq/L (+2)', 'Serum K⁺ ≤ 3.5 mEq/L (+2)'), points: 2, status: kPt === null ? 'unknown' : kPt > 0 ? 'met' : 'not-met' },
        { label: L('QTc inicial ≥ 450 ms (+2)', 'Baseline QTc ≥ 450 ms (+2)'), points: 2, status: qtcPt === null ? 'unknown' : qtcPt > 0 ? 'met' : 'not-met', detail: effectiveQtc !== null ? L(`${effectiveQtc} ms`, `${effectiveQtc} ms`) : undefined },
        { label: L('Infarto agudo / elevación ST (+2)', 'Acute MI / ST elevation (+2)'), points: 2, status: miPt === null ? 'unknown' : miPt > 0 ? 'met' : 'not-met' },
        { label: L('≥ 1 fármaco prolongador del QTc (+3)', '≥ 1 QTc-prolonging drug (+3)'), points: 3, status: drugPt === null ? 'unknown' : drugPt > 0 ? 'met' : 'not-met' },
      ],
      missingInputs,
      recommendation: L(
        highTdP || riskLevel === 'high'
          ? 'Monitorización continua, evitar nuevos fármacos QTc, revisar interacciones y corregir K⁺ > 4,0 mEq/L y Mg²⁺.'
          : riskLevel === 'moderate'
            ? 'Vigilar QTc seriado si recibe fármacos con riesgo conocido de Torsades de Pointes y comprobar K⁺/Mg²⁺.'
            : 'Sin elevación de riesgo en las variables recogidas; reevaluar si cambia la medicación o electrolitos.',
        highTdP || riskLevel === 'high'
          ? 'Continuous telemetry, avoid additional QTc-prolonging drugs, check interactions, and replete K⁺ > 4.0 mEq/L and Mg²⁺.'
          : riskLevel === 'moderate'
            ? 'Perform serial ECGs if QTc-prolonging therapy is used and verify normal serum K⁺/Mg²⁺.'
            : 'Low confirmed risk on captured variables; reassess if medications or electrolytes change.',
      ),
      referenceId: 'tisdale-2013',
      citation: 'Tisdale JE et al. Circ Cardiovasc Qual Outcomes 2013;6(4):479–487',
    });
  }

  // Scale B: ESC 2024 CHA2DS2-VA Score (Sex-neutral)
  {
    const age = context.ageYears;
    const age2 = age !== undefined && age >= 75;
    const age1 = age !== undefined && age >= 65 && age < 75;
    const htn = hasHist('hypertension');
    const dm = hasHist('diabetes');
    const score = (age2 ? 2 : age1 ? 1 : 0) + (htn ? 1 : 0) + (dm ? 1 : 0);
    const missingInputs: Localized[] = [
      L('C: Insuficiencia cardíaca / FEVI reducida (+1)', 'C: Heart failure / reduced LVEF (+1)'),
      L('S₂: Antecedente de ACV, AIT o embolia sistémica (+2)', 'S₂: Prior stroke, TIA, or thromboembolism (+2)'),
      L('V: Enfermedad vascular arterial / IAM previo / placa aórtica (+1)', 'V: Vascular disease / prior MI / aortic plaque (+1)'),
    ];
    if (age === undefined) missingInputs.unshift(L('Edad exacta (65–74 = +1; ≥ 75 = +2)', 'Exact age (65–74 = +1; ≥ 75 = +2)'));
    const riskLevel: ClinicalScaleResult['riskLevel'] = !afOrFlutter && score === 0 ? 'low' : score >= 2 ? 'high' : score === 1 ? 'moderate' : 'low';
    scales.push({
      id: 'cha2ds2-va',
      name: L('Escala CHA₂DS₂-VA (Guía ESC 2024, sin sexo)', 'CHA₂DS₂-VA Score (2024 ESC AF Guideline, sex-neutral)'),
      applicability: afOrFlutter ? 'indicated' : 'not-indicated',
      score,
      maxScore: 8,
      riskLevel,
      riskLabel: afOrFlutter
        ? score >= 2
          ? L(`Puntuación mínima confirmada ${score}/8: anticoagulación recomendada (ESC 2024 Clase I)`, `Minimum confirmed score ${score}/8: oral anticoagulation recommended (ESC 2024 Class I)`)
          : score === 1
            ? L(`Puntuación mínima confirmada 1/8: considerar anticoagulación (ESC 2024 Clase IIa)`, `Minimum confirmed score 1/8: consider oral anticoagulation (ESC 2024 Class IIa)`)
            : L('Puntuación mínima 0/8 en datos recogidos (completar C, S₂ y V antes de decidir)', 'Minimum 0/8 on captured fields (verify C, S₂, V before deciding)')
        : L(`No aplicable sin FA/flutter (score basal observado ${score}/8)`, `Not indicated without AF/flutter (baseline observed ${score}/8)`),
      criteriaBreakdown: [
        { label: L('Edad ≥ 75 años (+2) o 65–74 (+1)', 'Age ≥ 75y (+2) or 65–74y (+1)'), points: age2 ? 2 : 1, status: age === undefined ? 'unknown' : age >= 65 ? 'met' : 'not-met' },
        { label: L('Hipertensión arterial (+1)', 'Hypertension (+1)'), points: 1, status: context.history ? (htn ? 'met' : 'not-met') : 'unknown' },
        { label: L('Diabetes mellitus (+1)', 'Diabetes mellitus (+1)'), points: 1, status: context.history ? (dm ? 'met' : 'not-met') : 'unknown' },
        { label: L('Insuficiencia cardíaca (C, +1)', 'Congestive heart failure (C, +1)'), points: 1, status: 'unknown' },
        { label: L('ACV / AIT / embolia previa (S₂, +2)', 'Prior Stroke/TIA/TE (S₂, +2)'), points: 2, status: 'unknown' },
        { label: L('Enfermedad vascular (V, +1)', 'Vascular disease (V, +1)'), points: 1, status: 'unknown' },
      ],
      missingInputs,
      recommendation: L(
        afOrFlutter
          ? score >= 2
            ? 'Con puntuación ≥ 2 se indica anticoagulación oral salvo contraindicación mayor; valorar riesgo hemorrágico corregible.'
            : 'Completar historia de IC, ACV/AIT y enfermedad vascular para puntuación definitiva CHA₂DS₂-VA (ESC 2024).'
          : 'Escala calculada como referencia; únicamente guía anticoagulación tras confirmar fibrilación o flutter auricular.',
        afOrFlutter
          ? score >= 2
            ? 'Score ≥ 2 meets Class I indication for oral anticoagulation if bleeding contraindications are absent.'
            : 'Complete HF, prior stroke/TIA, and vascular history to finalize CHA₂DS₂-VA per ESC 2024.'
          : 'Calculated for reference; only guides anticoagulation after confirming atrial fibrillation or flutter.',
      ),
      referenceId: 'esc-af-2024',
      citation: 'Van Gelder IC et al. 2024 ESC/EACTS AF Guidelines, Eur Heart J 2024',
    });
  }

  // Scale C: Modified Smith-Sgarbossa Criteria
  {
    const applicable = lbbbPresent || paced;
    const concordantSte = allEval.filter(
      ({ d }) =>
        d.jMv !== null &&
        d.jMv >= 0.1 &&
        (d.rMv ?? 0) > Math.abs(d.sMv ?? 0),
    );
    const concordantStdV1V3 = allEval.filter(
      ({ lead, d }) =>
        (lead === 'V1' || lead === 'V2' || lead === 'V3') &&
        d.stMv !== null &&
        d.stMv <= -0.1 &&
        Math.abs(d.sMv ?? 0) >= (d.rMv ?? 0),
    );
    let worstRatioLead: Lead | null = null;
    let worstRatio = 0;
    for (const { lead, d } of allEval) {
      const sAbs = Math.abs(d.sMv ?? 0);
      if (d.jMv !== null && d.jMv >= 0.1 && sAbs >= 0.3 && sAbs > (d.rMv ?? 0)) {
        const ratio = d.jMv / sAbs;
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worstRatioLead = lead;
        }
      }
    }
    const discordantPos = worstRatio >= 0.25;
    const posCount =
      (concordantSte.length > 0 ? 1 : 0) +
      (concordantStdV1V3.length > 0 ? 1 : 0) +
      (discordantPos ? 1 : 0);

    scales.push({
      id: 'smith-sgarbossa',
      name: L('Regla de Smith-Sgarbossa Modificada (BRI / Marcapasos)', 'Modified Smith-Sgarbossa Rule (LBBB / Paced)'),
      applicability: applicable ? 'indicated' : wideQrs ? 'conditional' : 'not-indicated',
      score: posCount,
      maxScore: 3,
      riskLevel: !applicable ? 'negative' : posCount > 0 ? 'positive' : 'negative',
      riskLabel: !applicable
        ? L('No aplicable (sin patrón BRI ni marcapasos ventricular)', 'Not indicated (neither LBBB nor paced rhythm)')
        : posCount > 0
          ? L('POSITIVA para sospecha de oclusión coronaria aguda (OMI)', 'POSITIVE for suspected acute coronary occlusion (OMI)')
          : L('Negativa en medidas representativas (confirmar visualmente en el trazado)', 'Negative on representative beats (verify visually on original ECG)'),
      criteriaBreakdown: [
        {
          label: L('Elevación ST concordante ≥ 1 mm (0,1 mV) en derivación con QRS positivo', 'Concordant ST elevation ≥ 1 mm (0.1 mV) with positive QRS'),
          status: !allEval.length ? 'unknown' : concordantSte.length > 0 ? 'met' : 'not-met',
          detail: concordantSte.length ? L(concordantSte.map(x => `${x.lead}: +${x.d.jMv?.toFixed(2)} mV`).join(', '), concordantSte.map(x => `${x.lead}: +${x.d.jMv?.toFixed(2)} mV`).join(', ')) : undefined,
        },
        {
          label: L('Descenso ST concordante ≥ 1 mm en V1, V2 o V3', 'Concordant ST depression ≥ 1 mm in V1, V2, or V3'),
          status: !allEval.length ? 'unknown' : concordantStdV1V3.length > 0 ? 'met' : 'not-met',
          detail: concordantStdV1V3.length ? L(concordantStdV1V3.map(x => `${x.lead}: ${x.d.stMv?.toFixed(2)} mV`).join(', '), concordantStdV1V3.map(x => `${x.lead}: ${x.d.stMv?.toFixed(2)} mV`).join(', ')) : undefined,
        },
        {
          label: L('Discordancia excesiva ST_J / |S| ≥ 0,25 (equivalente ST/S ≤ −0,25)', 'Excessive discordance ST_J / |S| ≥ 0.25 (ST/S ≤ −0.25)'),
          status: !allEval.length ? 'unknown' : discordantPos ? 'met' : 'not-met',
          detail: worstRatioLead ? L(`${worstRatioLead}: razón ${worstRatio.toFixed(2)}`, `${worstRatioLead}: ratio ${worstRatio.toFixed(2)}`) : undefined,
        },
      ],
      missingInputs: applicable ? [] : [L('Requiere BRI completo o ritmo estimulado para aplicabilidad diagnóstica', 'Requires complete LBBB or paced ventricular rhythm')],
      recommendation: L(
        applicable && posCount > 0
          ? 'Criterio positivo con ~91 % de sensibilidad / ~90 % de especificidad (Smith 2012): activar protocolo de síndrome coronario agudo / OMI emergente si existe clínica compatible.'
          : 'Si hay dolor torácico con BRI y criterios negativos, obtener ECG seriados, troponina de alta sensibilidad y valorar Barcelona/cabecera.',
        applicable && posCount > 0
          ? 'Positive Modified Smith-Sgarbossa criterion (~91% sens / ~90% spec, Smith 2012): activate emergent ACS/OMI pathway if clinically compatible.'
          : 'With symptomatic LBBB and negative baseline rule, obtain serial ECGs and high-sensitivity troponin.',
      ),
      referenceId: 'smith-sgarbossa',
      citation: 'Smith SW et al. Ann Emerg Med 2012;60(6):766–776',
    });
  }

  // Scale D: Integrated WCT Differential (Brugada / Vereckei / Pava)
  {
    const wctActive = values.rateBpm !== null && values.rateBpm > 100 && wideQrs;
    const precordial = leadStInfo(details, ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']);
    const allPosConc = precordial.length >= 4 && precordial.every(({ d }) => (d.rMv ?? 0) > Math.abs(d.sMv ?? 0) && Math.abs(d.sMv ?? 0) < 0.08);
    const allNegConc = precordial.length >= 4 && precordial.every(({ d }) => Math.abs(d.sMv ?? 0) > (d.rMv ?? 0) && (d.rMv ?? 0) < 0.08);
    const concordancePresent = allPosConc || allNegConc;
    const avr = details.aVR;
    const avrPositiveR = avr && avr.rMv !== null && avr.sMv !== null && avr.rMv > Math.abs(avr.sMv) * 0.8 && avr.rMv >= 0.15;
    const extremeAxis = values.axisDeg !== null && (values.axisDeg < -90 || values.axisDeg > 180);
    const veryWide = values.qrsMs !== null && values.qrsMs >= 160;
    const structHist = hasHist('cardiac');
    const avDissCue = wctActive && (global?.pPresent === false || !!global?.prVariable);
    const vtCues = [concordancePresent, !!avrPositiveR, extremeAxis, veryWide, structHist, avDissCue].filter(Boolean).length;

    scales.push({
      id: 'wct-brugada-vereckei-pava',
      name: L('Diferencial Taquicardia QRS Ancho (Brugada / Vereckei / Pava)', 'Wide-Complex Tachycardia Screen (Brugada / Vereckei / Pava)'),
      applicability: wctActive ? 'indicated' : wideQrs ? 'conditional' : 'not-indicated',
      score: wctActive ? vtCues : null,
      maxScore: wctActive ? 6 : null,
      riskLevel: !wctActive ? (wideQrs ? 'indeterminate' : 'negative') : vtCues >= 2 ? 'high' : 'moderate',
      riskLabel: wctActive
        ? vtCues >= 2
          ? L(`Alta sospecha de Taquicardia Ventricular (${vtCues}/6 marcadores positivos)`, `High suspicion for Ventricular Tachycardia (${vtCues}/6 markers positive)`)
          : L('Taquicardia QRS ancho: manejar como TV hasta demostrar aberrancia', 'Wide-complex tachycardia: manage as VT until SVT aberrancy is proven')
        : wideQrs
          ? L('QRS ancho sin taquicardia > 100 lpm (uso condicional)', 'Wide QRS without rate > 100 bpm (conditional check)')
          : L('No aplicable (QRS estrecho)', 'Not indicated (narrow QRS)'),
      criteriaBreakdown: [
        { label: L('Concordancia precordial positiva o negativa (V1–V6)', 'Precordial concordance (positive or negative V1–V6)'), status: precordial.length < 4 ? 'unknown' : concordancePresent ? 'met' : 'not-met' },
        { label: L('Dominancia positiva en aVR (criterio inicial Vereckei aVR)', 'Positive R dominance in aVR (Vereckei aVR clue)'), status: !avr ? 'unknown' : avrPositiveR ? 'met' : 'not-met' },
        { label: L('Eje frontal extremo noroeste (< −90°)', 'Extreme northwest QRS axis (< −90°)'), status: values.axisDeg === null ? 'unknown' : extremeAxis ? 'met' : 'not-met' },
        { label: L('QRS muy ancho (≥ 160 ms)', 'Very wide QRS (≥ 160 ms)'), status: values.qrsMs === null ? 'unknown' : veryWide ? 'met' : 'not-met' },
        { label: L('Cardiopatía estructural conocida (alta probabilidad pre-test TV)', 'Known structural cardiac history (high pre-test VT likelihood)'), status: context.history ? (structHist ? 'met' : 'not-met') : 'unknown' },
        { label: L('Posible disociación AV / ausencia de P sinusal 1:1', 'Possible AV dissociation / absent 1:1 sinus P'), status: wctActive ? (avDissCue ? 'met' : 'not-met') : 'unknown' },
      ],
      missingInputs: [
        L('Tiempo al pico de R en II (criterio de Pava ≥ 50 ms) y cociente Vi/Vt en V1/aVR (requiere inspección del trazado)', 'Lead II R-wave peak time (Pava ≥ 50 ms) & Vi/Vt ratio (verify on raw tracing)'),
      ],
      recommendation: L(
        wctActive
          ? 'Guía ESC 2022: toda taquicardia regular de QRS ancho debe considerarse Taquicardia Ventricular hasta demostrar lo contrario; nunca administrar verapamilo/diltiazem IV ante duda.'
          : 'Sin taquicardia de QRS ancho activa en este registro.',
        wctActive
          ? '2022 ESC Guideline: treat any wide-complex tachycardia as VT until proven otherwise; avoid empirical IV calcium-channel blockers if uncertain.'
          : 'No active wide-complex tachycardia on this recording.',
      ),
      referenceId: 'esc-va',
      citation: 'Zeppenfeld K et al. 2022 ESC Ventricular Arrhythmias; Brugada 1991; Vereckei 2008',
    });
  }

  // Scale E: OMI / STEMI Territorial Matrix
  {
    const { threshold: v2v3Thresh } = v2v3ThresholdMv(context);
    const steIn = (leadList: Lead[]) =>
      leadStInfo(details, leadList).filter(
        ({ lead, d }) =>
          d.jMv !== null && d.jMv >= (lead === 'V2' || lead === 'V3' ? v2v3Thresh : 0.1),
      );
    const stdIn = (leadList: Lead[]) =>
      leadStInfo(details, leadList).filter(({ d }) => d.stMv !== null && d.stMv <= -0.05);

    const antSte = steIn(['V1', 'V2', 'V3', 'V4']);
    const infSte = steIn(['II', 'III', 'aVF']);
    const latSte = steIn(['I', 'aVL', 'V5', 'V6']);
    const postStd = stdIn(['V1', 'V2', 'V3']).filter(({ d }) => (d.stMv ?? 0) <= -0.1);
    const avrSte = details.aVR?.jMv !== null && details.aVR?.jMv !== undefined && details.aVR.jMv >= 0.1;
    const multiStd = allEval.filter(({ lead, d }) => lead !== 'aVR' && d.stMv !== null && d.stMv <= -0.1);
    const leftMainCue = !!avrSte && multiStd.length >= 6;
    const wellensCue =
      leadStInfo(details, ['V2', 'V3', 'V4']).filter(({ d }) => d.tMv !== null && d.tMv <= -0.2).length >= 2 &&
      antSte.length === 0;
    const deWinterCue =
      (details.V2?.stMv !== null && details.V2?.stMv !== undefined && details.V2.stMv <= -0.1 && (details.V2?.tMv ?? 0) >= 0.5) ||
      (details.V3?.stMv !== null && details.V3?.stMv !== undefined && details.V3.stMv <= -0.1 && (details.V3?.tMv ?? 0) >= 0.5);

    const territoriesMet = [
      antSte.length >= 2 && !lbbbPresent && !paced,
      infSte.length >= 2 && !lbbbPresent && !paced,
      latSte.length >= 2 && !lbbbPresent && !paced,
      leftMainCue,
      deWinterCue,
    ].filter(Boolean).length;

    const highSuspicion = territoriesMet > 0 || (wellensCue && hasSym('chest-pain')) || postStd.length >= 2;
    scales.push({
      id: 'omi-territorial-screen',
      name: L('Matriz Territorial OMI / STEMI y Equivalentes de Alto Riesgo', 'OMI / STEMI Territorial Matrix & High-Risk Equivalents'),
      applicability: 'indicated',
      score: territoriesMet + (wellensCue ? 1 : 0) + (postStd.length >= 2 ? 1 : 0),
      maxScore: 7,
      riskLevel: territoriesMet > 0 ? 'high' : highSuspicion ? 'moderate' : 'low',
      riskLabel:
        territoriesMet > 0
          ? L('ALTA sospecha territorial de lesión transmural / equivalente OMI', 'HIGH territorial suspicion of STEMI / OMI equivalent')
          : highSuspicion
            ? L('Moderada sospecha isquémica / equivalente posterior o Wellens', 'Moderate ischemic suspicion / posterior or Wellens pattern')
            : L('Sin criterio territorial STEMI/OMI positivo en derivaciones limpias', 'No territorial STEMI/OMI criterion met on clean leads'),
      criteriaBreakdown: [
        { label: L('Territorio Anterior (V1–V4) ≥ umbral sexo/edad en ≥ 2 contiguas', 'Anterior territory (V1–V4) ≥ sex/age threshold in ≥ 2 leads'), status: antSte.length >= 2 ? 'met' : 'not-met', detail: antSte.length ? L(antSte.map(x => `${x.lead} ${x.d.jMv?.toFixed(2)}`).join(', '), antSte.map(x => `${x.lead} ${x.d.jMv?.toFixed(2)}`).join(', ')) : undefined },
        { label: L('Territorio Inferior (II, III, aVF) ≥ 0,10 mV en ≥ 2 contiguas', 'Inferior territory (II, III, aVF) ≥ 0.10 mV in ≥ 2 leads'), status: infSte.length >= 2 ? 'met' : 'not-met', detail: infSte.length ? L(infSte.map(x => `${x.lead} ${x.d.jMv?.toFixed(2)}`).join(', '), infSte.map(x => `${x.lead} ${x.d.jMv?.toFixed(2)}`).join(', ')) : undefined },
        { label: L('Territorio Lateral (I, aVL, V5, V6) ≥ 0,10 mV en ≥ 2 contiguas', 'Lateral territory (I, aVL, V5, V6) ≥ 0.10 mV in ≥ 2 leads'), status: latSte.length >= 2 ? 'met' : 'not-met' },
        { label: L('Equivalente Tronco Izq. / Multivaso (STE aVR ≥ 0,10 mV + ≥ 6 STD)', 'Left-main / multivessel cue (aVR STE ≥ 0.10 mV + ≥ 6 STD)'), status: leftMainCue ? 'met' : 'not-met' },
        { label: L('Equivalente Posterior (STD V1–V3 ≥ 0,10 mV → confirmar V7–V9)', 'Posterior OMI cue (V1–V3 STD ≥ 0.10 mV → obtain V7–V9)'), status: postStd.length >= 2 ? 'met' : 'not-met' },
        { label: L('Equivalente de Winter (STD J + T picuda ≥ 0,5 mV V2–V3)', 'de Winter cue (J depression + peaked T ≥ 0.5 mV V2–V3)'), status: deWinterCue ? 'met' : 'not-met' },
        { label: L('Patrón tipo Wellens (inversión profunda T V2–V4 ≤ −0,20 mV)', 'Wellens-like pattern (deep T inversion V2–V4 ≤ −0.20 mV)'), status: wellensCue ? 'met' : 'not-met' },
      ],
      missingInputs: hasSym('chest-pain')
        ? [L('ECG seriados (cada 10–15 min si dolor persistente) y troponina de alta sensibilidad', 'Serial ECGs (q10–15 min if ongoing pain) & high-sensitivity troponin')]
        : [],
      recommendation: L(
        territoriesMet > 0
          ? 'Correlacionar de inmediato con dolor torácico y estado hemodinámico; activar reperfusión urgente si confirma clínica y descartar imitadores (pericarditis, BRI, repolarización precoz).'
          : highSuspicion
            ? 'Considerar derivaciones posteriores (V7–V9) o derechas (V3R–V4R), ECG seriados y troponinas.'
            : 'Un ECG basal sin elevación ST no descarta SCASEST; el manejo sigue los síntomas y biomarcadores.',
        territoriesMet > 0
          ? 'Correlate immediately with chest pain and hemodynamics; activate urgent reperfusion pathway if confirmed and rule out mimics (pericarditis, LBBB, early repolarization).'
          : highSuspicion
            ? 'Consider posterior leads (V7–V9) or right-sided leads (V3R–V4R), serial ECGs, and troponin testing.'
            : 'A single ECG without ST elevation does not exclude NSTE-ACS; triage by clinical presentation and troponin.',
      ),
      referenceId: 'esc-acs',
      citation: 'Thygesen et al. 4th UDMI (2018); Byrne et al. 2023 ESC ACS Guidelines',
    });
  }

  // Scale F: AV Conduction, Bifascicular Block & High-Risk Syncope Scale
  {
    const severeBrady = values.rateBpm !== null && values.rateBpm < 45;
    const droppedP = global?.pConductedFraction !== undefined && global.pConductedFraction !== null && global.pConductedFraction < 0.85;
    const bifascicular = !!rbbbPresent && values.axisDeg !== null && (values.axisDeg < -30 || values.axisDeg > 90);
    const trifascicularCue = bifascicular && values.prMs !== null && values.prMs > 200;
    const electricalAlt = !!global?.qrsAlternans;
    const syncopeCtx = hasSym('syncope') || hasHist('family-sudden-death');
    const mobitzOrThird =
      presPrimaryId === 'second-degree-mobitz-ii' ||
      presPrimaryId === 'third-degree-av-block' ||
      presPrimaryId === '2-to-1-av-block' ||
      (droppedP && !global?.wenckebachSuspected);

    const pts =
      (severeBrady ? 2 : values.rateBpm !== null && values.rateBpm < 50 ? 1 : 0) +
      (mobitzOrThird ? 2 : global?.wenckebachSuspected ? 1 : 0) +
      (trifascicularCue ? 2 : bifascicular ? 1 : 0) +
      (electricalAlt ? 2 : 0) +
      (syncopeCtx ? 2 : 0);

    const indicated = pts > 0 || values.prMs !== null && values.prMs > 200 || wideQrs;
    const riskLevel: ClinicalScaleResult['riskLevel'] =
      mobitzOrThird || electricalAlt || (syncopeCtx && (severeBrady || bifascicular || (effectiveQtc !== null && effectiveQtc >= 480))) || pts >= 4
        ? 'high'
        : pts >= 2
          ? 'moderate'
          : 'low';

    scales.push({
      id: 'av-conduction-syncope',
      name: L('Estratificación de Conducción AV, Bloqueo Fascicular y Síncope', 'AV Conduction, Bifascicular & Syncope Risk Screen'),
      applicability: indicated ? 'indicated' : 'not-indicated',
      score: pts,
      maxScore: 10,
      riskLevel,
      riskLabel:
        riskLevel === 'high'
          ? L(`Riesgo ALTO de trastorno arrítmico/conducción (${pts}/10 pts)`, `HIGH risk of conduction/arrhythmic event (${pts}/10 pts)`)
          : riskLevel === 'moderate'
            ? L(`Riesgo MODERADO de progresión o síncope arrítmico (${pts}/10 pts)`, `MODERATE risk (${pts}/10 pts)`)
            : L(`Riesgo BAJO en cribado de conducción (${pts}/10 pts)`, `LOW conduction screening risk (${pts}/10 pts)`),
      criteriaBreakdown: [
        { label: L('Bradicardia marcada (< 45 lpm = +2; < 50 lpm = +1)', 'Marked bradycardia (< 45 bpm = +2; < 50 bpm = +1)'), status: values.rateBpm === null ? 'unknown' : values.rateBpm < 50 ? 'met' : 'not-met' },
        { label: L('Fallo de conducción P→QRS o sospecha Mobitz II / BAV 3.º (+2)', 'Dropped P→QRS or suspected Mobitz II / 3rd-degree AVB (+2)'), status: droppedP || mobitzOrThird ? 'met' : global?.wenckebachSuspected ? 'met' : 'not-met' },
        { label: L('Patrón bifascicular (BRD + HBAI/HBPI) o + PR largo (+1 a +2)', 'Bifascicular block (RBBB + LAFB/LPFB) ± prolonged PR (+1 to +2)'), status: bifascicular ? 'met' : 'not-met' },
        { label: L('Alternancia eléctrica de amplitud QRS (+2)', 'Electrical QRS alternans (+2)'), status: global?.qrsAlternans === undefined || global?.qrsAlternans === null ? 'unknown' : electricalAlt ? 'met' : 'not-met' },
        { label: L('Síncope o historia familiar de muerte súbita (+2)', 'Syncope or family history of sudden cardiac death (+2)'), status: context.symptoms || context.history ? (syncopeCtx ? 'met' : 'not-met') : 'unknown' },
      ],
      missingInputs: hasMed('av-nodal')
        ? [L('Revisar dosis y aclaramiento de betabloqueantes, calcioantagonistas no-DHP o digoxina', 'Review dose and clearance of beta-blockers, non-DHP CCB, or digoxin')]
        : [],
      recommendation: L(
        riskLevel === 'high'
          ? 'Monitorización ECG continua, suspender fármacos frenadores AV no imprescindibles, valorar marcapasos transcutáneo/definitivo o ecocardiograma urgente (si alternancia eléctrica → descartar taponamiento).'
          : riskLevel === 'moderate'
            ? 'Valorar tira larga/Holter y causas reversibles (fármacos nodales, hiperpotasemia, isquemia inferior).'
            : 'Sin marcadores de alto riesgo en conducción AV según los parámetros disponibles.',
        riskLevel === 'high'
          ? 'Continuous ECG monitoring, withhold non-essential AV-nodal blockers, assess pacing need, or urgent bedside echo (if electrical alternans → rule out tamponade).'
          : riskLevel === 'moderate'
            ? 'Consider ambulatory monitoring and evaluate reversible causes (nodal drugs, hyperkalemia, inferior ischemia).'
            : 'No high-risk AV conduction markers identified on available parameters.',
      ),
      referenceId: 'acc-brady',
      citation: 'Kusumoto et al. 2018 ACC/AHA/HRS Bradycardia; Shen et al. 2017 Syncope',
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Global Screening Triage
  // ---------------------------------------------------------------------------
  const scaleMap = Object.fromEntries(scales.map(s => [s.id, s])) as Record<ClinicalScaleResult['id'], ClinicalScaleResult>;
  const omiHigh = scaleMap['omi-territorial-screen'].riskLevel === 'high';
  const sgarbossaPos = scaleMap['smith-sgarbossa'].riskLevel === 'positive';
  const wctHigh = scaleMap['wct-brugada-vereckei-pava'].applicability === 'indicated';
  const avHigh = scaleMap['av-conduction-syncope'].riskLevel === 'high';
  const tisdaleHigh = scaleMap['tisdale-qtc'].riskLevel === 'high';
  const severeHyperK = presPrimaryId === 'hyperkalemia';

  const redFlags: Localized[] = [];
  const immediateActions: Localized[] = [];

  if (omiHigh || sgarbossaPos) {
    redFlags.push(L('Elevación ST territorial / regla de Smith-Sgarbossa positiva compatible con OMI/STEMI.', 'Territorial ST elevation / positive Smith-Sgarbossa compatible with OMI/STEMI.'));
    immediateActions.push(L('Evaluación médica inmediata, signos vitales, ECG seriados y activación de protocolo coronario agudo si clínica compatible.', 'Immediate clinician assessment, vital signs, serial ECGs, and ACS reperfusion pathway if clinically compatible.'));
  }
  if (wctHigh) {
    redFlags.push(L('Taquicardia de QRS ancho (> 100 lpm y QRS ≥ 120 ms): descartar Taquicardia Ventricular.', 'Wide-complex tachycardia (> 100 bpm and QRS ≥ 120 ms): rule out Ventricular Tachycardia.'));
    immediateActions.push(L('Evaluar estabilidad hemodinámica de inmediato; monitorización continua y acceso a cardioversión/desfibrilación.', 'Assess hemodynamic stability immediately; continuous monitoring and readiness for synchronized cardioversion.'));
  }
  if (avHigh) {
    redFlags.push(L('Trastorno grave de conducción AV, alternancia eléctrica o síncope con bradicardia/bloqueo.', 'High-risk AV conduction abnormality, electrical alternans, or syncope with bradycardia/block.'));
    immediateActions.push(L('Monitorización continua, revisión de fármacos frenadores AV e hiperpotasemia; valorar ecocardiograma o soporte de marcapasos.', 'Continuous telemetry, review AV-nodal drugs and serum K⁺; consider urgent echocardiogram or pacing support.'));
  }
  if (tisdaleHigh) {
    redFlags.push(L('QTc crítico (≥ 500 ms) o escala de Tisdale alta: riesgo elevado de Torsades de Pointes.', 'Critical QTc (≥ 500 ms) or high Tisdale risk score: elevated Torsade de Pointes risk.'));
    immediateActions.push(L('Medir K⁺ y Mg²⁺, suspender fármacos prolongadores de QT tras revisión médica y confirmar fin de onda T.', 'Check serum K⁺/Mg²⁺, hold non-essential QT-prolonging drugs after clinical review, and verify T-wave offset.'));
  }
  if (severeHyperK) {
    redFlags.push(L('Patrón compatible con hiperpotasemia (T picudas ± QRS ancho): urgencia metabólica potencial.', 'Pattern compatible with hyperkalemia (peaked T ± wide QRS): potential metabolic emergency.'));
    immediateActions.push(L('Solicitar electrolitos urgentes y valorar estabilización de membrana según protocolo si se confirma hiperpotasemia.', 'Obtain urgent serum potassium and follow hyperkalemia emergency protocol if confirmed.'));
  }
  if ((hasSym('chest-pain') || hasSym('dyspnea')) && !omiHigh && !sgarbossaPos) {
    redFlags.push(L('Síntomas agudos (dolor torácico/disnea): un ECG basal no excluye síndrome coronario ni TEP.', 'Acute chest pain or dyspnea: a baseline ECG cannot exclude ACS or pulmonary embolism.'));
    immediateActions.push(L('Obtener ECG seriados (10–15 min), troponinas y valoración clínica urgente independiente del trazado inicial.', 'Perform serial ECGs (10–15 min), troponin testing, and urgent clinical assessment regardless of initial tracing.'));
  }

  let level: ScreeningTriageLevel = 'normal';
  if (
    presUrgencies.includes('emergent') ||
    omiHigh ||
    sgarbossaPos ||
    wctHigh ||
    severeHyperK ||
    avHigh ||
    (tisdaleHigh && (hasSym('syncope') || (effectiveQtc !== null && effectiveQtc >= 500)))
  ) {
    level = 'emergent';
  } else if (
    presUrgencies.includes('urgent') ||
    findings.some(f => f.urgent) ||
    hasSym('chest-pain') ||
    hasSym('syncope') ||
    afOrFlutter ||
    tisdaleHigh ||
    (values.rateBpm !== null && (values.rateBpm < 50 || values.rateBpm > 100)) ||
    wideQrs ||
    (effectiveQtc !== null && effectiveQtc >= (context.sexAtBirth === 'male' ? 470 : 480))
  ) {
    level = 'urgent';
  } else if (
    articulatedComparison.some(c => c.status === 'abnormal' || c.status === 'borderline') ||
    findings.some(f => !['rate-range', 'axis-normal', 'sinus-compatible'].includes(f.id))
  ) {
    level = 'routine';
  }

  if (level === 'urgent' && !immediateActions.length) {
    immediateActions.push(L('Confirmar medidas en el ECG original de 12 derivaciones, comparar con trazados previos y correlacionar con síntomas/fármacos.', 'Confirm measurements on the original 12-lead ECG, compare with prior tracings, and correlate with symptoms/medications.'));
  } else if (level === 'routine' && !immediateActions.length) {
    immediateActions.push(L('Correlacionar hallazgos menores o limítrofes en consulta y repetir o ampliar estudio según evolución clínica.', 'Correlate borderline/minor findings at clinical follow-up and repeat ECG if symptoms develop.'));
  } else if (level === 'normal') {
    immediateActions.push(L('Trazado dentro de rangos adultos orientativos; mantener criterio clínico según síntomas y antecedentes.', 'Measurements within provisional adult ranges; maintain clinical judgment based on symptoms and history.'));
  }

  const labelByLevel: Record<ScreeningTriageLevel, Localized> = {
    emergent: L('Prioridad EMERGENTE — revisión médica inmediata', 'EMERGENT priority — immediate medical review'),
    urgent: L('Prioridad URGENTE — valoración clínica pronta', 'URGENT priority — prompt clinical evaluation'),
    routine: L('Prioridad RUTINARIA — seguimiento clínico', 'ROUTINE priority — clinical follow-up'),
    normal: L('Cribado sin hallazgos de alarma en reglas evaluables', 'Screening without red flags on evaluable rules'),
  };

  const rationale =
    redFlags.length > 0
      ? redFlags[0]
      : level === 'urgent'
        ? L('Se detectan alteraciones de ritmo, conducción, repolarización o síntomas que requieren confirmación pronta.', 'Rhythm, conduction, repolarization findings, or reported symptoms require prompt confirmation.')
        : level === 'routine'
          ? L('Hallazgos limítrofes o aislados sin marcadores inmediatos de inestabilidad eléctrica.', 'Borderline or isolated findings without immediate markers of electrical instability.')
          : L('Ritmo, frecuencia, intervalos básicos y segmento ST dentro de umbrales orientativos en derivaciones evaluables.', 'Rhythm, rate, basic intervals, and ST segments within provisional limits on evaluable leads.');

  const sourceIds = Array.from(
    new Set([
      ...scales.filter(s => s.applicability === 'indicated').map(s => s.referenceId),
      ...articulatedComparison.filter(c => c.status === 'abnormal').map(c => c.referenceId),
    ]),
  );

  return {
    triage: {
      level,
      label: labelByLevel[level],
      rationale,
      redFlags,
      immediateActions,
      sourceIds: sourceIds.length ? sourceIds : ['aha-tech', 'universal-mi'],
    },
    articulatedComparison,
    scales,
    references: screeningReferences,
  };
}
