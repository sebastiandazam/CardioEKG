import {clinicalText} from './presentation';
import type {PreexcitationAggregate} from './preexcitation';
import type { Lead, Measurements } from '../cases';
import type { AnalysisFinding, Localized } from './analysisTypes';
import type { ClinicalContext } from './context';
import type { LeadDetail } from './estimate';

/**
 * Systematic 12-lead reading: rhythm, rate, intervals, axis, P, QRS, hypertrophy, ST–T,
 * QT and clinical correlation, ending in one conclusion line.
 *
 * Each statement says whether published criteria are met ('meets'), only suggested
 * ('suggests'), normal, not evaluable, or clinical context. The conclusion names the
 * diagnoses whose criteria are met and lists exactly what could not be evaluated: it is
 * conclusive where the measured data allow it and explicit where they do not.
 * Rule-based and not clinically validated: thresholds are adult criteria from the cited
 * statements and are only as good as the digitized signal and the declared gain.
 */
export type ReadingStatus = 'meets' | 'suggests' | 'normal' | 'not-evaluable' | 'context';
export type ReadingStatement = { text: Localized; status: ReadingStatus; criterion?: Localized; leads?: Lead[]; referenceIds?: string[]; urgent?: boolean };
export type ReadingSectionId = 'rhythm' | 'rate' | 'intervals' | 'axis' | 'p' | 'qrs' | 'hypertrophy' | 'st-t' | 'clinical';
export type ReadingSection = { id: ReadingSectionId; title: Localized; statements: ReadingStatement[] };
export type SystematicReading = {
  sections: ReadingSection[];
  /** One-paragraph conclusion: diagnoses meeting criteria, then probable findings, then what is missing. */
  conclusion: Localized;
  level: 'complete' | 'partial' | 'insufficient';
  diagnoses: Localized[];
  notEvaluable: Localized[];
  qtcMs: number | null;
};

export type ReadingInput = {
  preexcitation?:PreexcitationAggregate;
  /** Explicit override (including null) for Python-authoritative calculations. */
  qtcMsOverride?:number|null;
  pPresent?:boolean|null;
  values: Measurements;
  details: Partial<Record<Lead, LeadDetail>>;
  rhythm: { rrCv: number | null; beatCount: number } | null;
  findings: AnalysisFinding[];
  context: ClinicalContext;
  evaluatedLeads: Lead[];
};

const L = (es: string, en: string): Localized => ({ es:clinicalText(es), en:clinicalText(en) });
const mv = (v: number) => `${v.toFixed(2)} mV`;
const groups: { name: Localized; leads: Lead[] }[] = [
  { name: L('inferior', 'inferior'), leads: ['II', 'III', 'aVF'] },
  { name: L('lateral alta', 'high lateral'), leads: ['I', 'aVL'] },
  { name: L('lateral baja', 'low lateral'), leads: ['V5', 'V6'] },
  { name: L('anterior', 'anterior'), leads: ['V3', 'V4'] },
  { name: L('septal', 'septal'), leads: ['V1', 'V2'] },
];

export function systematicReading(input: ReadingInput): SystematicReading {
  const { values, details: d, context, findings } = input;
  const has = (id: string) => findings.some(f => f.id === id);
  const adult = context.ageYears === undefined || context.ageYears >= 18;
  const paced = context.paced === 'yes';
  const preexcited=input.preexcitation?.status==='supported'&&!paced;
  const male = context.sexAtBirth === 'male', female = context.sexAtBirth === 'female';
  const meds = context.medications ?? [], history = context.history ?? [], symptoms = context.symptoms ?? [];
  const qrs = values.qrsMs, wide = qrs !== null && qrs >= 120;
  const sections: ReadingSection[] = [];
  const diagnoses: Localized[] = [], probable: Localized[] = [], notEvaluable: Localized[] = [];
  const section = (id: ReadingSectionId, title: Localized) => { const s: ReadingSection = { id, title, statements: [] }; sections.push(s); return s; };
  const state = (s: ReadingSection, statement: ReadingStatement, short?: Localized) => {
    s.statements.push(statement);
    if (statement.status === 'meets' && short) diagnoses.push(short);
    if (statement.status === 'suggests' && short) probable.push(short);
    if (statement.status === 'not-evaluable' && short) notEvaluable.push(short);
  };
  const lead = (name: Lead) => d[name];
  const noisy = (name: Lead) => (lead(name)?.noiseMv ?? 1) >= .03;

  // ---------- Rhythm ----------
  const rhythm = section('rhythm', L('Ritmo', 'Rhythm'));
  const cv = input.rhythm?.rrCv ?? null, beats = input.rhythm?.beatCount ?? 0;
  const regular = cv !== null && cv <= .10 && beats >= 4;
  const irregular = cv !== null && cv > .10 && beats >= 6;
  const pII = lead('II')?.pMv ?? null, pAVR = lead('aVR')?.pMv ?? null, pV1 = lead('V1')?.pMv ?? null;
  const rate = values.rateBpm;
  let rhythmName: Localized | null = null;
  if (paced) {
    state(rhythm, { text: L('Marcapasos declarado: el ritmo puede ser estimulado. Las espigas finas pueden perderse al digitalizar; confirmar en el original.', 'Pacemaker declared: rhythm may be paced. Thin spikes can be lost in digitization; confirm on the original.'), status: 'context' });
  }
  if (regular && values.prMs !== null && pII !== null && pII > 0 && (pAVR === null || pAVR < 0)) {
    rhythmName = rate !== null && rate < 50 ? L('Bradicardia sinusal', 'Sinus bradycardia') : rate !== null && rate > 100 ? L('Taquicardia sinusal', 'Sinus tachycardia') : L('Ritmo sinusal', 'Sinus rhythm');
    state(rhythm, { text: rhythmName, status: 'meets', criterion: L('RR regulares, P positiva en II y negativa en aVR, cada QRS precedido de P con PR estable.', 'Regular RR, P upright in II and negative in aVR, each QRS preceded by P with stable PR.'), leads: ['II', 'aVR'], referenceIds: ['aha-tech'] });
  } else if (regular && values.prMs !== null && pII !== null && pII < 0) {
    rhythmName = L('Ritmo auricular no sinusal (P negativa en II)', 'Non-sinus atrial rhythm (negative P in II)');
    state(rhythm, { text: rhythmName, status: 'suggests', criterion: L('P reproducible pero invertida en II: origen auricular bajo o de la unión con conducción retrógrada.', 'Repeatable P inverted in II: low atrial or junctional origin with retrograde conduction.'), leads: ['II'] });
  } else if (irregular && values.prMs === null && !noisy('II')) {
    const strong = cv! > .15 && beats >= 8 && input.pPresent===false;
    rhythmName = strong?L('Fibrilación auricular', 'Atrial fibrillation'):L('Fibrilación auricular probable', 'Probable atrial fibrillation');
    state(rhythm, { text: strong ? rhythmName : L('Fibrilación auricular probable', 'Probable atrial fibrillation'), status: strong ? 'meets' : 'suggests',
      criterion: L(`RR irregularmente irregulares (CV ${cv!.toFixed(2)}, ${beats} latidos) sin ondas P reproducibles en II${pV1 === null ? ' ni V1' : ''}.`, `Irregularly irregular RR (CV ${cv!.toFixed(2)}, ${beats} beats) without repeatable P waves in II${pV1 === null ? ' or V1' : ''}.`),
      leads: ['II', 'V1'], referenceIds: ['acc-af'] }, strong ? undefined : L(rate !== null && rate > 100 ? 'fibrilación auricular con respuesta ventricular rápida' : 'fibrilación auricular', rate !== null && rate > 100 ? 'atrial fibrillation with rapid ventricular response' : 'atrial fibrillation'));
    if (strong) diagnoses.push(rate !== null && rate > 100 ? L('fibrilación auricular con respuesta ventricular rápida', 'atrial fibrillation with rapid ventricular response') : L('fibrilación auricular', 'atrial fibrillation'));
  } else if (regular && values.prMs === null && rate !== null && rate > 100 && !wide) {
    rhythmName = L('Taquicardia regular de QRS estrecho sin P visible', 'Regular narrow-complex tachycardia without visible P');
    state(rhythm, { text: rhythmName, status: 'meets', criterion: L('Probable taquicardia supraventricular; descartar flutter con conducción 2:1 (frecuencia cercana a 150 lpm) y taquicardia sinusal con P oculta.', 'Probable supraventricular tachycardia; exclude flutter with 2:1 conduction (rate near 150 bpm) and sinus tachycardia with hidden P.'), referenceIds: ['esc-svt'], urgent: true });
  } else if (rate !== null && rate > 100 && wide) {
    rhythmName = L('Taquicardia de QRS ancho', 'Wide-complex tachycardia');
    state(rhythm, { text: rhythmName, status: 'meets', criterion: L('QRS ≥ 120 ms y frecuencia > 100 lpm: considerar taquicardia ventricular hasta demostrar lo contrario.', 'QRS ≥ 120 ms and rate > 100 bpm: consider ventricular tachycardia until proven otherwise.'), referenceIds: ['esc-va'], urgent: true });
  } else if (regular && values.prMs === null && rate !== null && rate >= 35 && rate <= 60 && !wide && !paced) {
    rhythmName = L('Ritmo de la unión probable', 'Probable junctional rhythm');
    state(rhythm, { text: rhythmName, status: 'suggests', criterion: L('Ritmo regular lento de QRS estrecho sin P reproducible antes del QRS.', 'Slow regular narrow-QRS rhythm without repeatable P before QRS.') });
  } else {
    state(rhythm, { text: L(`Mecanismo del ritmo no determinable: ${cv === null ? 'no hay suficientes latidos' : values.prMs === null ? 'no se delimitó una P reproducible' : 'regularidad intermedia'}.`, `Rhythm mechanism not determinable: ${cv === null ? 'not enough beats' : values.prMs === null ? 'no repeatable P wave' : 'intermediate regularity'}.`), status: 'not-evaluable' }, L('mecanismo del ritmo', 'rhythm mechanism'));
  }
  if (rhythmName && !diagnoses.length && rhythm.statements.some(s => s.status === 'meets')) diagnoses.unshift(L(rhythmName.es.toLowerCase(), rhythmName.en.toLowerCase()));
  else if (rhythmName && rhythm.statements.some(s => s.status === 'suggests') && !probable.length) probable.push(L(rhythmName.es.toLowerCase(), rhythmName.en.toLowerCase()));

  // ---------- Rate ----------
  const rateSection = section('rate', L('Frecuencia', 'Rate'));
  if (rate === null) state(rateSection, { text: L('Frecuencia no medible.', 'Rate not measurable.'), status: 'not-evaluable' }, L('frecuencia', 'rate'));
  else state(rateSection, {
    text: L(`${rate} lpm${rate < 50 ? ': bradicardia' : rate < 60 ? ': límite bajo, habitual en reposo o con entrenamiento' : rate > 100 ? ': taquicardia' : ': normal'}.`, `${rate} bpm${rate < 50 ? ': bradycardia' : rate < 60 ? ': low-normal, common at rest or in athletes' : rate > 100 ? ': tachycardia' : ': normal'}.`),
    status: rate < 50 || rate > 100 ? 'meets' : 'normal', referenceIds: ['acc-brady'],
  }, (rate < 50 || rate > 100) && !/taqui|bradi|rápida/i.test(rhythmName?.es ?? '') && ![...probable, ...diagnoses].some(p => /rápida|taqui|bradi/i.test(p.es)) ? L(rate < 50 ? `bradicardia (${rate} lpm)` : `frecuencia ventricular rápida (${rate} lpm)`, rate < 50 ? `bradycardia (${rate} bpm)` : `rapid ventricular rate (${rate} bpm)`) : undefined);

  // ---------- Intervals ----------
  const intervals = section('intervals', L('Intervalos', 'Intervals'));
  const pr = values.prMs;
  if (pr === null) state(intervals, { text: L('PR no medible (sin P reproducible).', 'PR not measurable (no repeatable P).'), status: 'not-evaluable' });
  else if (pr > 200) state(intervals, { text: L(`PR ${pr} ms: bloqueo AV de primer grado${meds.includes('av-nodal') || meds.includes('digoxin') ? ' (valorar efecto de fármacos que enlentecen el nodo AV)' : ''}.`, `PR ${pr} ms: first-degree AV block${meds.includes('av-nodal') || meds.includes('digoxin') ? ' (consider AV-nodal drug effect)' : ''}.`), status: 'meets', referenceIds: ['acc-brady'] }, L('bloqueo AV de primer grado', 'first-degree AV block'));
  else if (pr < 120) state(intervals, { text: L(`PR ${pr} ms: corto. Buscar onda delta (preexcitación) o ritmo auricular bajo.`, `PR ${pr} ms: short. Look for a delta wave (pre-excitation) or low atrial rhythm.`), status: 'suggests' }, L('PR corto', 'short PR'));
  else state(intervals, { text: L(`PR ${pr} ms: normal.`, `PR ${pr} ms: normal.`), status: 'normal' });
  if (qrs === null) state(intervals, { text: L('QRS no medible.', 'QRS not measurable.'), status: 'not-evaluable' }, L('duración del QRS', 'QRS duration'));
  else state(intervals, { text: L(`QRS ${qrs} ms: ${qrs >= 120 ? 'ancho' : qrs >= 110 ? 'retraso de conducción leve' : 'normal'}.`, `QRS ${qrs} ms: ${qrs >= 120 ? 'wide' : qrs >= 110 ? 'mild conduction delay' : 'normal'}.`), status: qrs >= 110 ? 'meets' : 'normal', referenceIds: ['aha-conduction'] });
  let qtc: number | null = null;
  if (values.qtMs !== null && rate !== null && regular && !wide && !paced && !preexcited && (input.qtcMsOverride===undefined||input.qtcMsOverride!==null)) {
    qtc = input.qtcMsOverride===undefined?Math.round(values.qtMs / Math.cbrt(60 / rate)):Math.round(input.qtcMsOverride!);
    // Same scale as the rule engine: borderline from 450 (men) / 460 ms; prolonged from 470 (men) / 480 ms; >= 500 high risk.
    const borderline = male ? 450 : 460, prolonged = male ? 470 : 480;
    const status: ReadingStatus = qtc >= prolonged || qtc <= 340 ? 'meets' : qtc >= borderline ? 'suggests' : 'normal';
    const label = qtc >= 500 ? L('marcadamente prolongado (≥ 500 ms)', 'markedly prolonged (≥ 500 ms)') : qtc >= prolonged ? L('prolongado', 'prolonged') : qtc >= borderline ? L('limítrofe', 'borderline') : qtc <= 340 ? L('corto (≤ 340 ms)', 'short (≤ 340 ms)') : L('normal', 'normal');
    state(intervals, { text: L(`QT ${values.qtMs} ms; QTc (Fridericia) ${qtc} ms: ${label.es}${!male && !female ? ' (sexo no indicado: se usan los umbrales femeninos)' : ''}.`, `QT ${values.qtMs} ms; QTc (Fridericia) ${qtc} ms: ${label.en}${!male && !female ? ' (sex not given: female thresholds used)' : ''}.`),
      status, criterion: L('Limítrofe desde 450 ms (hombres) o 460 ms (mujeres); prolongado desde 470/480 ms; ≥ 500 ms alto riesgo; corto ≤ 340 ms.', 'Borderline from 450 ms (men) or 460 ms (women); prolonged from 470/480 ms; ≥ 500 ms high risk; short ≤ 340 ms.'), referenceIds: ['aha-qt', 'aha-tdp', 'esc-va'], urgent: qtc >= 500 },
      status !== 'normal' ? L(`QTc ${label.es} (${qtc} ms)`, `${label.en} QTc (${qtc} ms)`) : undefined);
  } else if (preexcited && values.qtMs !== null) {
    const numeric=input.qtcMsOverride;
    state(intervals,{text:L(`QT ${values.qtMs} ms${numeric!=null?'; QTc Fridericia numérico '+Math.round(numeric)+' ms':''}: interpretación limitada por preexcitación; revisar activación, JT y ECG sin preexcitación si está disponible. No atribuye por sí solo un síndrome de QT.`,`QT ${values.qtMs} ms${numeric!=null?'; numeric Fridericia QTc '+Math.round(numeric)+' ms':''}: interpretation limited by preexcitation; review activation, JT and a non-preexcited ECG when available. Does not by itself establish a QT syndrome.`),status:'context',referenceIds:['aha-qt']});
  } else if (values.qtMs !== null) {
    state(intervals, { text: L(`QT ${values.qtMs} ms; QTc no se corrige de forma fiable${wide ? ' con QRS ancho (usar JT)' : paced ? ' con estimulación' : !regular ? ' con RR irregulares' : ''}.`, `QT ${values.qtMs} ms; QTc not reliably corrected${wide ? ' with wide QRS (use JT)' : paced ? ' with pacing' : !regular ? ' with irregular RR' : ''}.`), status: 'not-evaluable' });
  } else state(intervals, { text: L('QT no medible (final de T incierto).', 'QT not measurable (uncertain T end).'), status: 'not-evaluable' }, L('QT', 'QT'));

  // ---------- Axis ----------
  const axisSection = section('axis', L('Eje eléctrico', 'Electrical axis'));
  const axis = values.axisDeg;
  const isQR = (name: Lead) => { const x = lead(name); return !!x && x.morphology.qMv !== null && !x.morphology.qsComplex && (x.rMv ?? 0) > Math.abs(x.sMv ?? 0); };
  const isRS = (name: Lead) => { const x = lead(name); return !!x && (x.rMv ?? 0) > 0 && Math.abs(x.sMv ?? 0) > (x.rMv ?? 0); };
  if (axis === null) state(axisSection, { text: L('Eje no calculable (I y aVF no comparables o isoeléctricos).', 'Axis not computable (I and aVF not comparable or isoelectric).'), status: 'not-evaluable' }, L('eje', 'axis'));
  else if (!adult) state(axisSection, { text: L(`Eje ${axis}°. En menores de 18 años los rangos normales dependen de la edad; no se clasifica con criterios de adulto.`, `Axis ${axis}°. Under 18 years normal ranges depend on age; adult categories are not applied.`), status: 'context' });
  else {
    const category = axis >= -30 && axis <= 90 ? 'normal' : axis < -30 && axis >= -90 ? 'left' : axis > 90 && axis <= 180 ? 'right' : 'extreme';
    const text = { normal: L('normal', 'normal'), left: L('desviación izquierda', 'left axis deviation'), right: L('desviación derecha', 'right axis deviation'), extreme: L('desviación extrema (noroeste)', 'extreme (northwest) axis') }[category];
    state(axisSection, { text: L(`Eje ${axis > 0 ? '+' : ''}${axis}°: ${text.es}.`, `Axis ${axis > 0 ? '+' : ''}${axis}°: ${text.en}.`), status: category === 'normal' ? 'normal' : 'meets', criterion: L('Normal −30° a +90°; izquierda −30° a −90°; derecha +90° a +180°.', 'Normal −30° to +90°; left −30° to −90°; right +90° to +180°.'), leads: ['I', 'aVF'], referenceIds: ['aha-conduction'] },
      category === 'normal' ? undefined : L(`${text.es} del eje (${axis}°)`, `${text.en} (${axis}°)`));
    if (axis <= -45 && !preexcited && !wide && isQR('aVL') && isRS('II') && isRS('III') && isRS('aVF'))
      state(axisSection, { text: L('Hemibloqueo (bloqueo fascicular) anterior izquierdo.', 'Left anterior fascicular block.'), status: 'meets', criterion: L('Eje −45° a −90°, qR en aVL, rS en II, III y aVF, QRS < 120 ms.', 'Axis −45° to −90°, qR in aVL, rS in II, III and aVF, QRS < 120 ms.'), leads: ['aVL', 'II', 'III', 'aVF'], referenceIds: ['aha-conduction'] }, L('hemibloqueo anterior izquierdo', 'left anterior fascicular block'));
    if (axis >= 90 && axis <= 180 && !preexcited && !wide && isRS('I') && isRS('aVL') && isQR('III') && isQR('aVF'))
      state(axisSection, { text: L('Patrón de hemibloqueo posterior izquierdo; exige excluir crecimiento ventricular derecho y hábito longilíneo.', 'Left posterior fascicular block pattern; requires excluding right ventricular hypertrophy and body habitus.'), status: 'suggests', leads: ['I', 'aVL', 'III', 'aVF'], referenceIds: ['aha-conduction'] }, L('hemibloqueo posterior izquierdo posible', 'possible left posterior fascicular block'));
  }

  // ---------- P wave ----------
  const pSection = section('p', L('Onda P y aurículas', 'P wave and atria'));
  const p2 = lead('II'), v1 = lead('V1');
  if (pII === null && pV1 === null) state(pSection, { text: L('Onda P no evaluable.', 'P wave not evaluable.'), status: 'not-evaluable' });
  else {
    let abnormal = false;
    if (pII !== null && pII > .25) { abnormal = true; state(pSection, { text: L(`P en II de ${mv(pII)} (> 0,25 mV): sugiere crecimiento auricular derecho.`, `P in II ${mv(pII)} (> 0.25 mV): suggests right atrial enlargement.`), status: 'suggests', leads: ['II'] }, L('crecimiento auricular derecho', 'right atrial enlargement')); }
    const tMv = v1?.morphology.pTerminalMv ?? null, tMs = v1?.morphology.pTerminalMs ?? null;
    if ((p2?.morphology.pMs ?? 0) >= 120 || (tMv !== null && tMs !== null && tMv <= -.1 && tMs >= 40)) {
      abnormal = true;
      state(pSection, { text: L(`P ancha${(p2?.morphology.pMs ?? 0) >= 120 ? ` en II (${Math.round(p2!.morphology.pMs!)} ms)` : ''}${tMv !== null && tMv <= -.1 ? ` y componente terminal negativo en V1 (${mv(tMv)}, ${Math.round(tMs!)} ms)` : ''}: sugiere crecimiento auricular izquierdo.`, `Broad P${(p2?.morphology.pMs ?? 0) >= 120 ? ` in II (${Math.round(p2!.morphology.pMs!)} ms)` : ''}${tMv !== null && tMv <= -.1 ? ` and terminal negative V1 component (${mv(tMv)}, ${Math.round(tMs!)} ms)` : ''}: suggests left atrial enlargement.`), status: 'suggests', leads: ['II', 'V1'] }, L('crecimiento auricular izquierdo', 'left atrial enlargement'));
    }
    if (!abnormal) state(pSection, { text: L('Morfología de P sin criterios de crecimiento auricular.', 'P morphology without atrial enlargement criteria.'), status: 'normal' });
  }

  // ---------- QRS morphology / conduction ----------
  const qrsSection = section('qrs', L('QRS: conducción y morfología', 'QRS: conduction and morphology'));
  const rbbb = has('rbbb-morphology') || (wide && (lead('V1')?.morphology.rPrime || lead('V2')?.morphology.rPrime) && ['I', 'V6'].every(n => Math.abs(lead(n as Lead)?.sMv ?? 0) > .05));
  const lbbb = has('lbbb-morphology') || (wide && ['V1'].every(n => lead(n as Lead)?.morphology.qsComplex || isRS(n as Lead)) && ['I', 'V6'].every(n => { const x = lead(n as Lead); return !!x && x.morphology.qMv === null && (x.morphology.rPeakMs ?? 0) >= 60; }));
  if (paced && wide) state(qrsSection, { text: L('QRS ancho con marcapasos declarado: compatible con ritmo estimulado; no se aplican criterios de bloqueo de rama ni de hipertrofia.', 'Wide QRS with declared pacemaker: consistent with paced rhythm; bundle-branch and hypertrophy criteria not applied.'), status: 'context' });
  else if (!preexcited && lbbb) state(qrsSection, { text: L('Bloqueo completo de rama izquierda.', 'Complete left bundle branch block.'), status: 'meets', criterion: L('QRS ≥ 120 ms, QS o rS en V1, R ancha/mellada con tiempo al pico ≥ 60 ms y sin q en I y V6.', 'QRS ≥ 120 ms, QS or rS in V1, broad/notched R with peak time ≥ 60 ms and no q in I and V6.'), leads: ['V1', 'I', 'V6'], referenceIds: ['aha-conduction'] }, L('bloqueo completo de rama izquierda', 'complete left bundle branch block'));
  else if (!preexcited && rbbb) state(qrsSection, { text: L('Bloqueo completo de rama derecha.', 'Complete right bundle branch block.'), status: 'meets', criterion: L('QRS ≥ 120 ms, rsR′ en V1–V2 y S terminal en I y V6.', 'QRS ≥ 120 ms, rsR′ in V1–V2 and terminal S in I and V6.'), leads: ['V1', 'V2', 'I', 'V6'], referenceIds: ['aha-conduction'] }, L('bloqueo completo de rama derecha', 'complete right bundle branch block'));
  else if (!preexcited && qrs !== null && qrs >= 110 && qrs < 120 && (lead('V1')?.morphology.rPrime || lead('V2')?.morphology.rPrime)) state(qrsSection, { text: L(`Bloqueo incompleto de rama derecha (QRS ${qrs} ms con rsR′ en V1–V2).`, `Incomplete right bundle branch block (QRS ${qrs} ms with rsR′ in V1–V2).`), status: 'meets', leads: ['V1', 'V2'], referenceIds: ['aha-conduction'] }, L('bloqueo incompleto de rama derecha', 'incomplete right bundle branch block'));
  else if (!preexcited && wide) state(qrsSection, { text: L(`Trastorno inespecífico de la conducción intraventricular (QRS ${qrs} ms sin morfología de bloqueo de rama).`, `Nonspecific intraventricular conduction delay (QRS ${qrs} ms without bundle-branch morphology).`), status: 'meets', referenceIds: ['aha-conduction'] }, L('trastorno inespecífico de la conducción intraventricular', 'nonspecific intraventricular conduction delay'));
  // Pathological Q waves (stricter than 30 ms because of digitization): ≥ 40 ms, ≥ 0.1 mV and ≥ 25 % of R, two contiguous leads.
  if (!wide && !paced && !preexcited) for (const g of groups.filter(g => g.leads[0] !== 'V1')) {
    const withQ = g.leads.filter(n => { const x = lead(n); const m = x?.morphology; return !!m && m.qMv !== null && m.qMs !== null && m.qMs >= 40 && Math.abs(m.qMv) >= .1 && (m.qsComplex || Math.abs(m.qMv) >= .25 * (x!.rMv ?? 0)) && !noisy(n); });
    if (withQ.length >= 2) state(qrsSection, { text: L(`Ondas Q patológicas en cara ${g.name.es} (${withQ.join(', ')}): compatibles con infarto de miocardio previo${history.includes('cardiac') ? ', coherente con la cardiopatía conocida' : ''}.`, `Pathological Q waves in ${g.name.en} leads (${withQ.join(', ')}): consistent with prior myocardial infarction${history.includes('cardiac') ? ', in keeping with known heart disease' : ''}.`), status: 'suggests', criterion: L('Q ≥ 40 ms y ≥ 0,1 mV (o QS) en dos derivaciones contiguas.', 'Q ≥ 40 ms and ≥ 0.1 mV (or QS) in two contiguous leads.'), leads: withQ, referenceIds: ['universal-mi'] }, L(`ondas Q en cara ${g.name.es}`, `${g.name.en} Q waves`));
  }
  const rV = (['V1', 'V2', 'V3', 'V4'] as Lead[]).map(n => lead(n)?.rMv ?? null);
  if (!wide && rV.every(v => v !== null) && rV[2]! < .3 && rV[3]! < .3 * 2 && rV[2]! <= rV[1]! + .05) state(qrsSection, { text: L(`Pobre progresión de R en precordiales (R en V3 ${mv(rV[2]!)}).`, `Poor R-wave progression (R in V3 ${mv(rV[2]!)}).`), status: 'suggests', criterion: L('R en V3 < 0,3 mV sin aumento de V1 a V3; causas: infarto anterior antiguo, colocación de electrodos, HVI, EPOC.', 'R in V3 < 0.3 mV without rise from V1 to V3; causes: old anterior MI, lead placement, LVH, COPD.'), leads: ['V1', 'V2', 'V3'] }, L('pobre progresión de R', 'poor R-wave progression'));
  const span = (n: Lead) => { const x = lead(n); return x && x.rMv !== null && x.sMv !== null ? x.rMv - x.sMv : null; };
  const limb = (['I', 'II', 'III', 'aVR', 'aVL', 'aVF'] as Lead[]).map(span), precordial = (['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as Lead[]).map(span);
  if (limb.every(v => v !== null) && limb.every(v => v! < .5)) state(qrsSection, { text: L('Bajo voltaje en derivaciones de miembros (todas < 0,5 mV): confirmar la ganancia; causas: derrame pericárdico, obesidad, EPOC, infiltración.', 'Low voltage in limb leads (all < 0.5 mV): confirm gain; causes: pericardial effusion, obesity, COPD, infiltration.'), status: 'meets', referenceIds: ['aha-tech'] }, L('bajo voltaje en miembros', 'low limb-lead voltage'));
  if (precordial.every(v => v !== null) && precordial.every(v => v! < 1)) state(qrsSection, { text: L('Bajo voltaje en precordiales (todas < 1,0 mV): confirmar la ganancia.', 'Low precordial voltage (all < 1.0 mV): confirm gain.'), status: 'meets' }, L('bajo voltaje precordial', 'low precordial voltage'));
  if (!qrsSection.statements.length && !preexcited) state(qrsSection, { text: qrs === null ? L('Morfología del QRS no evaluable.', 'QRS morphology not evaluable.') : L('Sin bloqueo de rama, hemibloqueo, ondas Q patológicas ni alteraciones de voltaje detectadas.', 'No bundle-branch block, fascicular block, pathological Q waves or voltage abnormality detected.'), status: qrs === null ? 'not-evaluable' : 'normal' });

  if(preexcited){const supported=pr!==null&&pr<120;state(qrsSection,{text:L(supported?'Patrón de preexcitación ventricular (WPW): PR corto y activación inicial lenta reproducible.':'Candidatos delta reproducibles: preexcitación en el diferencial; PR no confirma el patrón.',supported?'Ventricular preexcitation pattern (WPW): short PR and repeatable slow initial activation.':'Repeatable delta candidates: preexcitation in the differential; PR does not confirm the pattern.'),status:supported?'meets':'suggests',leads:input.preexcitation!.supportingLeads,referenceIds:['aha-conduction','esc-svt']},supported?L('patrón de preexcitación ventricular (WPW)','ventricular preexcitation pattern (WPW)'):L('posible preexcitación','possible preexcitation'));state(qrsSection,{text:L('La preexcitación puede imitar bloqueo de rama, ondas Q y cambios secundarios de ST–T. No establece infarto, hipertrofia ni localización de vía por sí sola.','Preexcitation can mimic bundle block, Q waves and secondary ST–T changes. It does not by itself establish infarction, hypertrophy or pathway location.'),status:'context'});}

  // ---------- Hypertrophy ----------
  const lvh = section('hypertrophy', L('Hipertrofia ventricular', 'Ventricular hypertrophy'));
  const sV1 = Math.abs(lead('V1')?.sMv ?? NaN), rV5 = lead('V5')?.rMv ?? NaN, rV6 = lead('V6')?.rMv ?? NaN, rAVL = lead('aVL')?.rMv ?? NaN, sV3 = Math.abs(lead('V3')?.sMv ?? NaN);
  const sokolow = sV1 + Math.max(rV5, rV6), cornell = rAVL + sV3, cornellLimit = female ? 2.0 : 2.8;
  if (paced || wide || preexcited) state(lvh, { text: L('Criterios de voltaje no aplicables con QRS ancho, estimulación o preexcitación.', 'Voltage criteria not applicable with wide QRS, pacing or preexcitation.'), status: 'context' });
  else if (!adult) state(lvh, { text: L('Criterios de voltaje de adulto no aplicables en menores de 18 años.', 'Adult voltage criteria not applicable under 18 years.'), status: 'context' });
  else if (!Number.isFinite(sokolow) && !Number.isFinite(cornell)) state(lvh, { text: L('Voltajes precordiales no disponibles.', 'Precordial voltages unavailable.'), status: 'not-evaluable' });
  else {
    const meetsSok = Number.isFinite(sokolow) && sokolow >= 3.5, meetsCor = Number.isFinite(cornell) && cornell > cornellLimit;
    const young = context.ageYears !== undefined && context.ageYears < 35;
    if (meetsSok || meetsCor) {
      const lateralRepol = findings.some(f => f.category === 'repolarization' && f.sourceLeads.some(l => ['I', 'aVL', 'V5', 'V6'].includes(l)));
      state(lvh, { text: L(`Criterios de voltaje de hipertrofia ventricular izquierda (${[meetsSok ? `Sokolow-Lyon ${sokolow.toFixed(2)} mV ≥ 3,5` : '', meetsCor ? `Cornell ${cornell.toFixed(2)} mV > ${cornellLimit}${!male && !female ? ' (umbral masculino: sexo no indicado)' : ''}` : ''].filter(Boolean).join('; ')})${lateralRepol ? ' con alteración de la repolarización lateral (patrón de sobrecarga)' : ''}${young ? '. En menores de 35 años el voltaje aislado tiene baja especificidad' : ''}${history.includes('hypertension') ? '. Coherente con el antecedente de hipertensión' : ''}.`,
        `Left ventricular hypertrophy voltage criteria (${[meetsSok ? `Sokolow-Lyon ${sokolow.toFixed(2)} mV ≥ 3.5` : '', meetsCor ? `Cornell ${cornell.toFixed(2)} mV > ${cornellLimit}${!male && !female ? ' (male threshold: sex not given)' : ''}` : ''].filter(Boolean).join('; ')})${lateralRepol ? ' with lateral repolarization abnormality (strain pattern)' : ''}${young ? '. Under 35 years isolated voltage has low specificity' : ''}${history.includes('hypertension') ? '. Consistent with history of hypertension' : ''}.`),
        status: young ? 'suggests' : 'meets', criterion: L('Sokolow-Lyon: S V1 + R V5/V6 ≥ 3,5 mV. Cornell: R aVL + S V3 > 2,8 mV (hombres) o > 2,0 mV (mujeres). Requiere ganancia verificada.', 'Sokolow-Lyon: S V1 + R V5/V6 ≥ 3.5 mV. Cornell: R aVL + S V3 > 2.8 mV (men) or > 2.0 mV (women). Requires verified gain.'), leads: ['V1', 'V3', 'V5', 'V6', 'aVL'], referenceIds: ['aha-tech'] },
        L(lateralRepol ? 'hipertrofia ventricular izquierda con sobrecarga' : 'criterios de voltaje de hipertrofia ventricular izquierda', lateralRepol ? 'left ventricular hypertrophy with strain' : 'left ventricular hypertrophy voltage criteria'));
    }
    const rv1 = lead('V1')?.rMv ?? 0, sv1 = Math.abs(lead('V1')?.sMv ?? 0);
    if (rv1 >= .7 && rv1 > sv1 && axis !== null && axis > 90) state(lvh, { text: L(`R dominante en V1 (${mv(rv1)}) con desviación derecha del eje: sugiere hipertrofia ventricular derecha.`, `Dominant R in V1 (${mv(rv1)}) with right axis deviation: suggests right ventricular hypertrophy.`), status: 'suggests', leads: ['V1'] }, L('hipertrofia ventricular derecha', 'right ventricular hypertrophy'));
    if (!lvh.statements.length) state(lvh, { text: L(`Sin criterios de voltaje de hipertrofia (Sokolow-Lyon ${Number.isFinite(sokolow) ? sokolow.toFixed(2) + ' mV' : 'n/d'}; Cornell ${Number.isFinite(cornell) ? cornell.toFixed(2) + ' mV' : 'n/d'}).`, `No hypertrophy voltage criteria (Sokolow-Lyon ${Number.isFinite(sokolow) ? sokolow.toFixed(2) + ' mV' : 'n/a'}; Cornell ${Number.isFinite(cornell) ? cornell.toFixed(2) + ' mV' : 'n/a'}).`), status: 'normal' });
  }

  // ---------- ST–T ----------
  const stt = section('st-t', L('Segmento ST y onda T', 'ST segment and T wave'));
  const repol = findings.filter(f => f.category === 'repolarization' && !f.id.startsWith('qtc'));
  for (const f of repol) {
    // With wide QRS or pacing, ST–T changes are expected (secondary); urgency from the finding is kept.
    const secondary = f.id.includes('secondary') || wide || paced || preexcited;
    state(stt, { text: preexcited?L(`${f.label.es} — puede corresponder a repolarización secundaria por preexcitación. Valorar clínica, ECG seriados o sin preexcitación cuando estén disponibles y biomarcadores según indicación; no aplicar Sgarbossa a este patrón.`,`${f.label.en} — may reflect secondary repolarization from preexcitation. Assess the clinical picture, serial or non-preexcited ECGs when available and biomarkers as indicated; do not apply Sgarbossa to this pattern.`):secondary && !f.id.includes('secondary') ? L(`${f.label.es} — esperable como repolarización secundaria al trastorno de conducción; la isquemia requiere criterios específicos (p. ej., Sgarbossa).`, `${f.label.en} — expected as repolarization secondary to the conduction disorder; ischaemia requires specific criteria (e.g., Sgarbossa).`) : f.label,
      status: secondary ? 'context' : 'meets', leads: f.sourceLeads, referenceIds: f.referenceIds, urgent: f.urgent }, secondary ? undefined : L(f.label.es.charAt(0).toLowerCase() + f.label.es.slice(1), f.label.en.charAt(0).toLowerCase() + f.label.en.slice(1)));
  }
  if (!preexcited && (lbbb || (paced && wide)) && !(rbbb && !lbbb)) {
    const positive = sgarbossa(d);
    if (positive.leads.length) state(stt, { text: L(`Criterios de Sgarbossa/Smith presentes (${positive.criteria.map(c => c.es).join('; ')}): con bloqueo de rama izquierda o estimulación sugieren isquemia aguda${symptoms.includes('chest-pain') ? '; con dolor torácico, activar valoración inmediata' : ''}. Medidos sobre la señal digitalizada: confirmar en el original.`, `Sgarbossa/Smith criteria present (${positive.criteria.map(c => c.en).join('; ')}): with left bundle branch block or pacing they suggest acute ischaemia${symptoms.includes('chest-pain') ? '; with chest pain, start immediate assessment' : ''}. Measured on the digitized signal: confirm on the original.`),
      status: 'suggests', criterion: L('Elevación ST concordante ≥ 0,1 mV; descenso ST concordante ≥ 0,1 mV en V1–V3; o elevación discordante con ST/S ≥ 0,25.', 'Concordant ST elevation ≥ 0.1 mV; concordant ST depression ≥ 0.1 mV in V1–V3; or discordant elevation with ST/S ≥ 0.25.'), leads: positive.leads, referenceIds: ['esc-acs'], urgent: true }, L('criterios de Sgarbossa positivos', 'positive Sgarbossa criteria'));
  }
  const peaked = (['V2', 'V3', 'V4'] as Lead[]).filter(n => (lead(n)?.tMv ?? 0) >= 1.0 && (lead(n)?.tMv ?? 0) >= .75 * (lead(n)?.rMv ?? Infinity));
  if (peaked.length >= 2) state(stt, { text: L(`T altas y picudas en ${peaked.join(', ')}${context.electrolytes === 'known-abnormal' || context.potassium === 'high' ? ': con potasio o electrolitos alterados, descartar hiperpotasemia con urgencia' : ': valorar hiperpotasemia o repolarización precoz'}.`, `Tall peaked T waves in ${peaked.join(', ')}${context.electrolytes === 'known-abnormal' || context.potassium === 'high' ? ': with abnormal potassium or electrolytes, urgently exclude hyperkalaemia' : ': consider hyperkalaemia or early repolarization'}.`), status: 'suggests', leads: peaked, urgent: context.electrolytes === 'known-abnormal' || context.potassium === 'high' }, L('T picudas', 'peaked T waves'));
  if (!stt.statements.length) {
    const measured = Object.values(d).filter(x => x?.stMv !== null && x?.tMv !== null).length;
    state(stt, measured >= 6 ? { text: L('Sin desviaciones del ST ni inversiones de T significativas.', 'No significant ST deviation or T-wave inversion.'), status: 'normal' } : { text: L('ST–T no evaluable en suficientes derivaciones.', 'ST–T not evaluable in enough leads.'), status: 'not-evaluable' }, measured >= 6 ? undefined : L('ST–T', 'ST–T'));
  }

  // ---------- Clinical correlation ----------
  const clinical = section('clinical', L('Correlación con la historia clínica', 'Clinical correlation'));
  const urgentEcg = sections.some(s => s.statements.some(x => x.urgent));
  if (symptoms.includes('chest-pain')) state(clinical, { text: repol.some(f => !f.id.includes('secondary') && f.urgent)
    ? L('Dolor torácico con alteraciones ST–T primarias: evaluación inmediata de síndrome coronario agudo (ECG seriados, troponina).', 'Chest pain with primary ST–T changes: immediate acute coronary syndrome evaluation (serial ECGs, troponin).')
    : L('Dolor torácico: un ECG sin cambios agudos no excluye síndrome coronario agudo; repetir ECG y medir troponina.', 'Chest pain: an ECG without acute changes does not exclude acute coronary syndrome; repeat ECG and measure troponin.'), status: 'context', referenceIds: ['chest-pain', 'esc-acs'], urgent: true });
  if (symptoms.includes('syncope')) {
    const arrhythmic = (rate !== null && rate < 40) || wide || (qtc !== null && qtc >= 470) || (pr !== null && pr > 200 && wide);
    state(clinical, { text: arrhythmic ? L('Síncope con hallazgos que sugieren causa arrítmica (bradicardia marcada, QRS ancho o QTc prolongado): valoración prioritaria y monitorización.', 'Syncope with findings suggesting an arrhythmic cause (marked bradycardia, wide QRS or prolonged QTc): priority evaluation and monitoring.')
      : L('Síncope: el ECG no muestra criterios de alto riesgo medibles aquí; no excluye arritmia intermitente.', 'Syncope: the ECG shows no high-risk criteria measurable here; intermittent arrhythmia is not excluded.'), status: 'context', referenceIds: ['acc-syncope'], urgent: arrhythmic });
  }
  if (symptoms.includes('palpitations') && pr !== null && pr < 120) state(clinical, { text: L('Palpitaciones con PR corto: buscar preexcitación (onda delta).', 'Palpitations with short PR: look for pre-excitation (delta wave).'), status: 'context', referenceIds: ['esc-svt'] });
  if (meds.includes('qt-prolonging')) state(clinical, { text: qtc !== null && qtc >= 470 ? L(`Fármacos que prolongan el QT con QTc ${qtc} ms: revisar indicación, dosis, interacciones, potasio y magnesio.`, `QT-prolonging drugs with QTc ${qtc} ms: review indication, dose, interactions, potassium and magnesium.`) : L('Fármacos que prolongan el QT: vigilar el QTc en controles.', 'QT-prolonging drugs: monitor QTc on follow-up.'), status: 'context', referenceIds: ['aha-tdp'], urgent: qtc !== null && qtc >= 500 });
  if (meds.includes('digoxin')) state(clinical, { text: L('Digoxina: la depresión ST en cubeta puede ser efecto digitálico; con bradicardia, bloqueo AV o arritmias, valorar toxicidad y potasio.', 'Digoxin: sagging ST depression may be a digitalis effect; with bradycardia, AV block or arrhythmias, assess toxicity and potassium.'), status: 'context' });
  if (meds.includes('av-nodal') && ((rate !== null && rate < 50) || (pr !== null && pr > 200))) state(clinical, { text: L('Bradicardia o PR largo con fármacos que enlentecen el nodo AV: considerar efecto farmacológico antes de enfermedad de conducción.', 'Bradycardia or long PR on AV-nodal drugs: consider drug effect before conduction disease.'), status: 'context', referenceIds: ['acc-brady'] });
  if (context.potassium === 'high') state(clinical, { text: peaked.length ? L('Potasio alto con T picudas: hiperpotasemia con traducción electrocardiográfica; tratamiento y monitorización urgentes.', 'High potassium with peaked T waves: hyperkalaemia with ECG changes; urgent treatment and monitoring.') : L(`Potasio alto: vigilar T picudas, ensanchamiento del QRS, PR largo y bradicardia${wide ? ' (QRS ancho presente)' : ''}.`, `High potassium: watch for peaked T, QRS widening, long PR and bradycardia${wide ? ' (wide QRS present)' : ''}.`), status: 'context', urgent: peaked.length > 0 || wide });
  if (context.potassium === 'low') state(clinical, { text: L(`Potasio bajo: aplana T, añade ondas U y prolonga el QT aparente${qtc !== null && qtc >= 460 ? ` (QTc ${qtc} ms)` : ''}; corregir antes de fármacos que prolongan el QT.`, `Low potassium: flattens T, adds U waves and prolongs apparent QT${qtc !== null && qtc >= 460 ? ` (QTc ${qtc} ms)` : ''}; correct before QT-prolonging drugs.`), status: 'context', referenceIds: ['aha-tdp'] });
  if (context.electrolytes === 'known-abnormal') state(clinical, { text: L('Electrolitos alterados: el potasio, el calcio y el magnesio modifican T, U y QT; correlacionar con valores de laboratorio.', 'Abnormal electrolytes: potassium, calcium and magnesium alter T, U and QT; correlate with laboratory values.'), status: 'context' });
  if (history.includes('family-sudden-death')) state(clinical, { text: L('Antecedente familiar de muerte súbita: revisar QTc, patrón tipo Brugada en V1–V2, preexcitación y voltajes; un ECG normal no lo excluye.', 'Family history of sudden death: review QTc, Brugada-type pattern in V1–V2, pre-excitation and voltages; a normal ECG does not exclude it.'), status: 'context', referenceIds: ['esc-va'] });
  if (!adult) state(clinical, { text: L('Paciente menor de 18 años: frecuencia, eje y voltajes normales dependen de la edad; los criterios de adulto se aplicaron solo a intervalos.', 'Patient under 18 years: normal rate, axis and voltages depend on age; adult criteria applied only to intervals.'), status: 'context' });
  if (!clinical.statements.length) state(clinical, { text: L('Sin historia clínica registrada: la lectura es solo electrocardiográfica. Añadir síntomas, medicación y electrolitos mejora la interpretación.', 'No clinical history recorded: the reading is electrocardiographic only. Adding symptoms, medication and electrolytes improves interpretation.'), status: 'context' });

  // ---------- Conclusion ----------
  const unique = (items: Localized[]) => items.filter((x, i) => items.findIndex(y => y.es === x.es) === i);
  const dx = unique(diagnoses), pb = unique(probable).filter(p => !dx.some(x => x.es === p.es)), ne = unique(notEvaluable);
  const evaluated = input.evaluatedLeads.length;
  const level: SystematicReading['level'] = evaluated < 3 || (rate === null && qrs === null) ? 'insufficient' : ne.length ? 'partial' : 'complete';
  const abnormalElsewhere = sections.filter(s => s.id !== 'rhythm' && s.id !== 'clinical').some(s => s.statements.some(x => x.status === 'meets' || x.status === 'suggests'));
  const allNormal = level === 'complete' && rhythmName?.es === 'Ritmo sinusal' && !abnormalElsewhere && !pb.length && evaluated === 12;
  const join = (items: Localized[], lang: 'es' | 'en') => items.map(x => x[lang]).join('; ');
  const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const measuredLine = (lang: 'es' | 'en') => [rate !== null ? (lang === 'es' ? `FC ${rate} lpm` : `HR ${rate} bpm`) : '', pr !== null ? `PR ${pr} ms` : '', qrs !== null ? `QRS ${qrs} ms` : '', qtc !== null ? `QTc ${qtc} ms` : '', axis !== null ? (lang === 'es' ? `eje ${axis}°` : `axis ${axis}°`) : ''].filter(Boolean).join(', ');
  const urgentLine = urgentEcg || clinical.statements.some(s => s.urgent);
  const conclusion = level === 'insufficient'
    ? L('Lectura insuficiente: no hay derivaciones con señal suficiente para concluir. Revisar los recortes, la calibración y la calidad de la imagen.', 'Insufficient reading: not enough leads with adequate signal to conclude. Review crops, calibration and image quality.')
    : L(
      `${allNormal ? 'ECG dentro de límites normales: ritmo sinusal' : dx.length ? cap(join(dx, 'es')) : pb.length ? `Probable ${join(pb, 'es')}` : 'Sin diagnósticos que cumplan criterios'}${measuredLine('es') ? ` (${measuredLine('es')})` : ''}.${pb.length && dx.length ? ` Probable: ${join(pb, 'es')}.` : ''}${ne.length ? ` No evaluable: ${join(ne, 'es')}.` : ''}${urgentLine ? ' Requiere valoración clínica prioritaria.' : ''}`,
      `${allNormal ? 'ECG within normal limits: sinus rhythm' : dx.length ? cap(join(dx, 'en')) : pb.length ? `Probable ${join(pb, 'en')}` : 'No diagnoses meeting criteria'}${measuredLine('en') ? ` (${measuredLine('en')})` : ''}.${pb.length && dx.length ? ` Probable: ${join(pb, 'en')}.` : ''}${ne.length ? ` Not evaluable: ${join(ne, 'en')}.` : ''}${urgentLine ? ' Requires priority clinical assessment.' : ''}`);
  return { sections, conclusion, level, diagnoses: dx, notEvaluable: ne, qtcMs: qtc };
}

/**
 * Sgarbossa criteria with the Smith modification, for LBBB or ventricular pacing.
 * Uses the J-point level and the dominant QRS direction of each lead's median beat.
 */
export function sgarbossa(details: Partial<Record<Lead, Pick<LeadDetail, 'jMv' | 'rMv' | 'sMv' | 'noiseMv'>>>) {
  const leads: Lead[] = [], criteria: Localized[] = [];
  const add = (lead: Lead, text: Localized) => { if (!leads.includes(lead)) leads.push(lead); if (!criteria.some(c => c.es === text.es)) criteria.push(text); };
  for (const [name, x] of Object.entries(details) as [Lead, Pick<LeadDetail, 'jMv' | 'rMv' | 'sMv' | 'noiseMv'>][]) {
    if (!x || x.jMv === null || x.rMv === null || x.sMv === null || x.noiseMv >= .03) continue;
    const r = x.rMv, sDepth = Math.abs(x.sMv), upright = r > sDepth;
    if (upright && x.jMv >= .1) add(name, L('elevación ST concordante', 'concordant ST elevation'));
    if (!upright && x.jMv <= -.1 && ['V1', 'V2', 'V3'].includes(name)) add(name, L('descenso ST concordante en V1–V3', 'concordant ST depression in V1–V3'));
    if (!upright && x.jMv >= .1 && sDepth > 0 && x.jMv / sDepth >= .25) add(name, L('elevación ST discordante excesiva (ST/S ≥ 0,25)', 'excessively discordant ST elevation (ST/S ≥ 0.25)'));
  }
  return { leads, criteria };
}
