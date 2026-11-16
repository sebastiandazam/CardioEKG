import type { Lead, Measurements } from '../../cases';
import type { Localized } from '../analysisTypes';
import type { ClinicalContext } from '../context';
import type { GlobalFeatures, LeadDetail } from '../estimate';
import type { DeltaEvidence } from '../preexcitation';

/**
 * Literature-driven presumptive diagnosis.
 *
 * The knowledge base (`kb/*.json`) lists cardiac entities with criteria taken from guidelines
 * and peer-reviewed studies. Each criterion is a predicate over measured ECG features and the
 * declared clinical context, with its source and, when the source gives them, sensitivity,
 * specificity and likelihood ratios.
 *
 * The engine evaluates every criterion as true, false or not evaluable (missing data — never
 * treated as absent), decides whether each entity's defining criteria are met, weighs the
 * evidence (published likelihood ratios when present, otherwise an explicit heuristic weight),
 * and builds a presumptive diagnosis plus differentials and the serious entities that could not
 * be excluded. Evidence strength is relative and is NOT a calibrated probability of disease.
 */

type Op = '<' | '<=' | '>' | '>=' | '==' | '!=' | 'between';
export type Predicate =
  | { feature: string; op: Op; value: unknown }
  | { expr: string; op: Op; value: number | [number, number] }
  | { countLeads: Lead[]; where: { field: string; op: Op; value: unknown }; op: Op; value: number }
  | { contiguous: string; where: { field: string; op: Op; value: unknown }; min: number }
  | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate }
  | { context: string; op: Op | 'contains'; value: unknown };

export type Criterion = {
  id: string; role: 'required' | 'supporting' | 'exclusion'; text: Localized; predicate: Predicate | null;
  sensitivity?: number; specificity?: number; lrPositive?: number; lrNegative?: number; ref?: string; note?: string;
};
export type Entity = {
  id: string; name: Localized; category: string; urgency: 'emergent' | 'urgent' | 'routine';
  criteria: Criterion[]; requiredLogic?: string;
  contextModifiers?: { when: Predicate; effect: 'raise' | 'lower'; text: Localized; ref?: string }[];
  /** A measured confounder limits attribution; it does not exclude coexisting disease. */
  confounders?: { when: Predicate; criteria?: string[]; logic?: 'all' | 'any'; text: Localized; ref?: string }[];
  /** Alternative criteria sets for the same diagnosis (e.g. every LVH voltage criterion): shown once. */
  group?: string;
  mimics?: string[]; nextSteps?: Localized; limitations?: Localized; references?: string[]; domain?: string;
};
export type Reference = { id: string; citation: string; url?: string; doi?: string; pmid?: string; verified?: boolean; reviewedAt?:string; verificationLevel?:'full-text'|'abstract'|'metadata-only'; evidenceType?:string; population?:string; locator?:string; fullTextUrl?:string;sourceUrl?:string };
/** glossary: clinical conditions cited as mimics that are not ECG entities of their own. */
export type KnowledgeBase = { entities: Entity[]; references: Reference[]; glossary?: Record<string, Localized> };
export type Features = Record<string, unknown>;

export const leadNames: Lead[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
export const contiguousGroups: Record<string, Lead[]> = {
  inferior: ['II', 'III', 'aVF'], lateral: ['I', 'aVL', 'V5', 'V6'], anterior: ['V1', 'V2', 'V3', 'V4'],
  septal: ['V1', 'V2'], 'posterior-reciprocal': ['V1', 'V2', 'V3'],
};
/** Anatomically adjacent pairs ("two contiguous leads"): Cabrera order in the frontal plane, V1→V6 horizontally. */
const adjacent: [Lead, Lead][] = [['aVL', 'I'], ['I', 'II'], ['II', 'aVF'], ['aVF', 'III'], ['II', 'III'], ['I', 'V6'], ['V1', 'V2'], ['V2', 'V3'], ['V3', 'V4'], ['V4', 'V5'], ['V5', 'V6']];
const globalNames = ['rateBpm', 'prMs', 'qrsMs', 'qtMs', 'qtcMs', 'axisDeg', 'pAxisDeg', 'tAxisDeg', 'rrCv', 'beatCount', 'regular', 'pPresent', 'pRate', 'pQrsRatio', 'prVariable', 'qrsAlternans', 'groupedBeating', 'pacedSpikes', 'preexcitationSupported'];
const leadFields = ['pMv', 'pMs', 'pTerminalMv', 'pTerminalMs', 'qMv', 'qMs', 'qs', 'rMv', 'sMv', 'rPeakMs', 'rPrime', 'notched', 'deltaSlurMs', 'deltaSupported', 'deltaPolarity', 'deltaDurationMs', 'deltaInitialSlopeMvPerMs', 'deltaTerminalSlopeMvPerMs', 'deltaRepeatableBeats', 'deltaAnalyzedBeats', 'jMv', 'stMv', 'stSlope', 'prSegMv', 'tMv', 'tQrsRatio', 'uMv'];

/** Explicit Python detector results only: a slur duration by itself never establishes delta. */
function deltaSupport(evidence: DeltaEvidence | undefined): boolean | null {
  if (!evidence || evidence.status === 'not-evaluable' || !Number.isInteger(evidence.analyzedBeats) || evidence.analyzedBeats < 2) return null;
  if (evidence.status === 'not-supported') return false;
  if (evidence.status !== 'supported' || !['positive', 'negative', 'mixed'].includes(evidence.polarity ?? '')
    || !Number.isFinite(evidence.durationMs) || evidence.durationMs! <= 0
    || !Number.isFinite(evidence.initialSlopeMvPerMs) || !Number.isFinite(evidence.terminalSlopeMvPerMs)
    || evidence.initialSlopeMvPerMs! * evidence.terminalSlopeMvPerMs! <= 0
    || Math.abs(evidence.initialSlopeMvPerMs!) >= Math.abs(evidence.terminalSlopeMvPerMs!)
    || evidence.polarity === 'positive' && evidence.initialSlopeMvPerMs! <= 0
    || evidence.polarity === 'negative' && evidence.initialSlopeMvPerMs! >= 0
    || !Number.isInteger(evidence.repeatableBeats) || evidence.repeatableBeats < 2 || evidence.repeatableBeats > evidence.analyzedBeats
    || evidence.repeatableBeats / evidence.analyzedBeats < 2 / 3) return null;
  const windows = Array.isArray(evidence.windows) ? evidence.windows.filter(window => Number.isFinite(window.start) && Number.isFinite(window.end)
    && Number.isFinite(window.peak) && window.start >= 0 && window.start < window.end && window.end <= window.peak
    && ['positive', 'negative'].includes(window.polarity) && (evidence.polarity === 'mixed' || window.polarity === evidence.polarity)) : [];
  if (new Set(windows.map(window => window.start)).size < 2) return null;
  return true;
}

/** Build the flat feature vector the knowledge base speaks. Unknown values are null. */
export function buildFeatures(args: {
  values: Measurements; details: Partial<Record<Lead, LeadDetail>>; global?: (GlobalFeatures & { pPresent?: boolean | null }) | null;
  rhythm: { rrCv: number | null; beatCount: number } | null; qtcMs: number | null;
}): Features {
  const { values, details, global, rhythm } = args;
  const conducted = global?.pConductedFraction ?? null;
  const f: Features = {
    rateBpm: values.rateBpm, prMs: values.prMs, qrsMs: values.qrsMs, qtMs: values.qtMs, qtcMs: args.qtcMs, axisDeg: values.axisDeg,
    pAxisDeg: global?.pAxisDeg ?? null, tAxisDeg: global?.tAxisDeg ?? null,
    rrCv: rhythm?.rrCv ?? null, beatCount: rhythm?.beatCount ?? null,
    regular: rhythm?.rrCv == null || !Number.isFinite(rhythm.rrCv) || rhythm.rrCv < 0 || rhythm.beatCount < 4 ? null : rhythm.rrCv <= .10,
    // Failure to delineate P is not evidence of absent atrial activity (AF, junctional rhythm).
    // A future validated absence detector can supply an explicit result; a noisy lead cannot.
    pPresent: details.II && details.II.noiseMv >= .05 ? null
      : typeof global?.pPresent === 'boolean' ? global.pPresent
      : details.II?.pMv != null ? true : null,
    // Only one P per QRS can be confirmed (a P found before every beat); extra non-conducted P waves are not counted unless measured globally.
    pQrsRatio: typeof global?.pQrsRatio === 'number' && Number.isFinite(global.pQrsRatio) ? global.pQrsRatio : conducted !== null && conducted >= .95 ? 1 : null,
    pRate: typeof global?.pRateBpm === 'number' && Number.isFinite(global.pRateBpm) ? global.pRateBpm : null, groupedBeating: typeof global?.groupedBeating === 'boolean' ? global.groupedBeating : null, pacedSpikes: null,
    prVariable: global?.prVariable ?? null, qrsAlternans: global?.qrsAlternans ?? null, preexcitationSupported: null,
  };
  for (const lead of leadNames) {
    const d = details[lead], m = d?.morphology, noisy = !!d && d.noiseMv >= .05, delta = m?.deltaEvidence;
    const values: Record<string, unknown> = {
      // Absent ≠ unknown: a delineated QRS without an initial q has q = 0; a delineated P without a terminal phase has 0.
      pMv: d?.pMv, pMs: m?.pMs,
      pTerminalMv: d?.pMv != null ? m?.pTerminalMv ?? 0 : null, pTerminalMs: d?.pMv != null ? m?.pTerminalMs ?? 0 : null,
      qMv: d?.qrsMs != null && m ? m.qMv ?? 0 : null, qMs: d?.qrsMs != null && m ? m.qMs ?? 0 : null, qs: d?.qrsMs != null ? m?.qsComplex : null,
      rMv: d?.rMv, sMv: d?.sMv, rPeakMs: m?.rPeakMs, rPrime: m?.rPrime, notched: m?.notched, deltaSlurMs: m?.deltaSlurMs,
      deltaSupported: deltaSupport(delta), deltaPolarity: delta?.polarity, deltaDurationMs: delta?.durationMs,
      deltaInitialSlopeMvPerMs: delta?.initialSlopeMvPerMs, deltaTerminalSlopeMvPerMs: delta?.terminalSlopeMvPerMs,
      deltaRepeatableBeats: delta?.repeatableBeats, deltaAnalyzedBeats: delta?.analyzedBeats,
      jMv: d?.jMv, stMv: d?.stMv, stSlope: m?.stSlope, prSegMv: m?.prSegMv, tMv: d?.tMv, tQrsRatio: m?.tQrsRatio, uMv: null,
    };
    // An entirely negative QS cannot contain a reproducible positive R deflection.
    // Some peak classifiers call a small-r/S complex QS. Contradictory morphology,
    // including a negative Q with zero duration, is unknown rather than infarct evidence.
    const visibleR = typeof values.rMv === 'number' && values.rMv >= Math.max(.02, (d?.noiseMv ?? 0) * 4);
    const impossibleQ = typeof values.qMv === 'number' && values.qMv < 0 && values.qMs === 0;
    if (impossibleQ || values.qs === true && visibleR) {
      values.qMv = null; values.qMs = null; values.qs = null;
    }
    // A noisy lead is evidence neither for nor against anything.
    // An initial negative deflection that is also the deepest one, followed by an r < 0.1 mV, cannot be told apart from an rS
    // with a baseline offset (fibrillatory waves, wander): the q is unknown, not pathological.
    if (typeof values.qMv === 'number' && values.qMv < 0 && typeof values.sMv === 'number' && Math.abs(values.qMv - values.sMv) < Math.max(.005, (d?.noiseMv ?? 0) * 2)
      && typeof values.rMv === 'number' && values.rMv < .1 && values.qs !== true) { values.qMv = null; values.qMs = null; values.qs = null; }
    for (const field of leadFields) f[`lead.${lead}.${field}`] = d && !noisy ? values[field] ?? null : null;
  }
  // Preserve the single Python record's aggregation and corroborate it against the
  // actual per-lead evidence. Missing/inconsistent aggregate metadata is not absence.
  const aggregate = global?.preexcitation;
  const supported = leadNames.filter(lead => f[`lead.${lead}.deltaSupported`] === true);
  const evaluated = leadNames.filter(lead => typeof f[`lead.${lead}.deltaSupported`] === 'boolean');
  if (aggregate?.status === 'supported') {
    const reported = new Set(aggregate.supportingLeads);
    if ((supported.length >= 3 && reported.size >= 3 && [...reported].every(lead => supported.includes(lead)))
      || (supported.length >= 1 && reported.size >= 1 && [...reported].every(lead => supported.includes(lead))
        && typeof values.prMs === 'number' && values.prMs < 115 && typeof values.qrsMs === 'number' && values.qrsMs >= 120)) {
      f.preexcitationSupported = true;
    }
  } else if (aggregate?.status === 'not-supported' && evaluated.length >= 3 && supported.length < 3
    && aggregate.supportingLeads.every(lead => supported.includes(lead))) {
    f.preexcitationSupported = false;
  }
  return f;
}

/** Context names used in the literature files mapped onto the app's context values. */
const contextAliases: Record<string, string> = { pulmonary: 'copd', renal: 'renal-failure', 'sodium-channel-blocker': 'antiarrhythmic-class-ic', recent: 'hours', past: 'days' };

type Truth = boolean | null;
const and3 = (values: Truth[]): Truth => values.some(v => v === false) ? false : values.some(v => v === null) ? null : true;
const or3 = (values: Truth[]): Truth => values.some(v => v === true) ? true : values.some(v => v === null) ? null : false;

function compare(actual: unknown, op: Op, expected: unknown): Truth {
  if (actual === null || actual === undefined || (typeof actual === 'number' && !Number.isFinite(actual))) return null;
  if (op === '==') return actual === expected;
  if (op === '!=') return actual !== expected;
  if (typeof actual !== 'number') return null;
  if (op === 'between') { const [a, b] = expected as [number, number]; return actual >= Math.min(a, b) && actual <= Math.max(a, b); }
  const e = expected as number;
  return op === '<' ? actual < e : op === '<=' ? actual <= e : op === '>' ? actual > e : actual >= e;
}

/** Arithmetic over features: `+ - * /`, `abs`, `max`, `min`, numbers and feature names. Null if any operand is unknown. */
export function evaluateExpression(expression: string, features: Features): number | null {
  const tokens = expression.match(/[A-Za-z_][\w.]*|\d+(?:\.\d+)?|[()+\-*/,]/g) ?? [];
  let at = 0, missing = false;
  const peek = () => tokens[at], next = () => tokens[at++];
  const primary = (): number => {
    const token = next();
    if (token === undefined) throw new Error('end');
    if (token === '(') { const v = sum(); if (next() !== ')') throw new Error(')'); return v; }
    if (token === '-') return -primary();
    if (/^\d/.test(token)) return Number(token);
    if (['abs', 'max', 'min'].includes(token) && peek() === '(') {
      next(); const args = [sum()]; while (peek() === ',') { next(); args.push(sum()); }
      if (next() !== ')') throw new Error(')');
      return token === 'abs' ? Math.abs(args[0]) : token === 'max' ? Math.max(...args) : Math.min(...args);
    }
    const value = features[token];
    if (typeof value !== 'number' || !Number.isFinite(value)) { missing = true; return 0; }
    return value;
  };
  const product = (): number => { let v = primary(); while (peek() === '*' || peek() === '/') { const op = next(); const r = primary(); v = op === '*' ? v * r : r === 0 ? NaN : v / r; } return v; };
  const sum = (): number => { let v = product(); while (peek() === '+' || peek() === '-') { const op = next(); const r = product(); v = op === '+' ? v + r : v - r; } return v; };
  try { const v = sum(); if (at !== tokens.length) return null; return missing || !Number.isFinite(v) ? null : v; } catch { return null; }
}

export function evaluate(predicate: Predicate | null, features: Features, context: ClinicalContext): Truth {
  if (!predicate) return null;
  if ('all' in predicate) return and3(predicate.all.map(p => evaluate(p, features, context)));
  if ('any' in predicate) return or3(predicate.any.map(p => evaluate(p, features, context)));
  if ('not' in predicate) { const v = evaluate(predicate.not, features, context); return v === null ? null : !v; }
  if ('feature' in predicate) return compare(features[predicate.feature], predicate.op, predicate.value);
  if ('expr' in predicate) return compare(evaluateExpression(predicate.expr, features), predicate.op, predicate.value);
  if ('countLeads' in predicate) {
    const results = predicate.countLeads.map(lead => compare(features[`lead.${lead}.${predicate.where.field}`], predicate.where.op, predicate.where.value));
    const yes = results.filter(r => r === true).length, unknown = results.filter(r => r === null).length;
    // Equality, inequality and ranges are not monotone: equal endpoint results do not
    // imply equal results in between (e.g. 0..2 unknown positives with target == 1).
    const possibilities = Array.from({ length: unknown + 1 }, (_, n) => compare(yes + n, predicate.op, predicate.value));
    return possibilities.every(value => value === possibilities[0]) ? possibilities[0] : null;
  }
  if ('contiguous' in predicate) {
    const group = contiguousGroups[predicate.contiguous];
    if (!group) return null;
    const truth = new Map(group.map(lead => [lead, compare(features[`lead.${lead}.${predicate.where.field}`], predicate.where.op, predicate.where.value)]));
    if (predicate.min <= 1) return or3([...truth.values()]);
    const connected = (includeUnknown: boolean) => {
      const remaining = new Set(group.filter(lead => includeUnknown ? truth.get(lead) !== false : truth.get(lead) === true));
      while (remaining.size) {
        const stack = [remaining.values().next().value!]; let size = 0;
        while (stack.length) {
          const lead = stack.pop()!; if (!remaining.delete(lead)) continue; size++;
          for (const [a, b] of adjacent) { if (a === lead && remaining.has(b)) stack.push(b); if (b === lead && remaining.has(a)) stack.push(a); }
        }
        if (size >= predicate.min) return true;
      }
      return false;
    };
    if (connected(false)) return true;
    if (connected(true)) return null;
    return false;
  }
  if ('context' in predicate) {
    const actual = context[predicate.context as keyof ClinicalContext];
    const wanted = contextAliases[String(predicate.value)] ?? predicate.value;
    if (actual === undefined || actual === null || (Array.isArray(actual) && !actual.length)) return null;
    if (predicate.op === 'contains') return Array.isArray(actual) ? (actual as unknown[]).includes(wanted) : null;
    return compare(actual, predicate.op as Op, wanted);
  }
  return null;
}

export type CriterionResult = Criterion & { result: Truth };
export type EntityStatus = 'met' | 'possible' | 'not-evaluable' | 'not-met' | 'excluded';
export type EntityResult = {
  entity: Entity; status: EntityStatus; criteria: CriterionResult[];
  /** log10 of the product of the likelihood ratios applied (published or heuristic). */
  weight: number; evidence: 'published' | 'heuristic' | 'mixed'; strength: 'strong' | 'moderate' | 'weak';
  missing: CriterionResult[]; contextNotes: Localized[]; confoundingNotes: Localized[]; observations: Localized[];
};

/** Heuristic factors used only when a source gives no likelihood ratio; reported as heuristic. */
export const HEURISTIC = { requiredMet: 3, supportingMet: 1.5, supportingAbsent: .8, contextRaise: 2, contextLower: .5 };

function requiredSatisfied(logic: string | undefined, results: Truth[]): Truth {
  if (!results.length) return null;
  const at = /^atLeast:(\d+)$/.exec(logic ?? '');
  if (at) {
    const n = Number(at[1]), yes = results.filter(r => r === true).length, unknown = results.filter(r => r === null).length;
    return yes >= n ? true : yes + unknown < n ? false : null;
  }
  return logic === 'any' ? or3(results) : and3(results);
}

const lrPlus = (c: Criterion) => c.lrPositive ?? (c.sensitivity !== undefined && c.specificity !== undefined && c.specificity < 1 ? c.sensitivity / (1 - c.specificity) : undefined);
const lrMinus = (c: Criterion) => c.lrNegative ?? (c.sensitivity !== undefined && c.specificity !== undefined && c.specificity > 0 ? (1 - c.sensitivity) / c.specificity : undefined);

export function evaluateEntity(entity: Entity, features: Features, context: ClinicalContext): EntityResult {
  const criteria = entity.criteria.map(c => ({ ...c, result: evaluate(c.predicate, features, context) }));
  const required = criteria.filter(c => c.role === 'required'), supporting = criteria.filter(c => c.role === 'supporting');
  const excluded = criteria.some(c => c.role === 'exclusion' && c.result === true);
  const satisfied = requiredSatisfied(entity.requiredLogic, required.map(c => c.result));
  const anyRequiredTrue = required.some(c => c.result === true);
  const confoundingNotes = (entity.confounders ?? []).filter(c => evaluate(c.when, features, context) === true
    && (!c.criteria || requiredSatisfied(c.logic, c.criteria.map(id => criteria.find(result => result.id === id)?.result ?? null)) === true)).map(c => c.text);
  const status: EntityStatus = confoundingNotes.length ? 'possible' : excluded ? 'excluded'
    : satisfied === true ? 'met'
    : satisfied === false ? 'not-met'
    : anyRequiredTrue ? 'possible' : 'not-evaluable';
  let weight = 0, published = 0, heuristic = 0;
  const apply = (factor: number | undefined, isPublished: boolean) => { if (factor && factor > 0 && Number.isFinite(factor)) { weight += Math.log10(factor); isPublished ? published++ : heuristic++; } };
  for (const c of [...required, ...supporting]) {
    if (c.result === true) { const lr = confoundingNotes.length ? undefined : lrPlus(c); lr !== undefined ? apply(lr, true) : apply(c.role === 'required' ? HEURISTIC.requiredMet : HEURISTIC.supportingMet, false); }
    else if (c.result === false) { const lr = confoundingNotes.length ? undefined : lrMinus(c); if (lr !== undefined) apply(lr, true); else if (c.role === 'supporting') apply(HEURISTIC.supportingAbsent, false); }
  }
  const contextNotes: Localized[] = [];
  for (const m of entity.contextModifiers ?? []) if (evaluate(m.when, features, context) === true) { contextNotes.push(m.text); apply(m.effect === 'raise' ? HEURISTIC.contextRaise : HEURISTIC.contextLower, false); }
  const observations: Localized[] = entity.id === 'wpw-pattern' ? leadNames.flatMap(lead => {
    if (features[`lead.${lead}.deltaSupported`] !== true) return [];
    const polarity = features[`lead.${lead}.deltaPolarity`], duration = features[`lead.${lead}.deltaDurationMs`];
    const repeatable = features[`lead.${lead}.deltaRepeatableBeats`], analyzed = features[`lead.${lead}.deltaAnalyzedBeats`];
    const initial = features[`lead.${lead}.deltaInitialSlopeMvPerMs`], terminal = features[`lead.${lead}.deltaTerminalSlopeMvPerMs`];
    const number = (value: unknown, digits: number) => typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : '?';
    return [{
      es: `${lead}: delta ${polarity === 'negative' ? 'negativa' : polarity === 'positive' ? 'positiva' : 'de polaridad variable'}, candidata ${number(duration, 1)} ms; reproducible en ${repeatable}/${analyzed} latidos; pendientes inicial/terminal ${number(initial, 4)}/${number(terminal, 4)} mV/ms.`,
      en: `${lead}: ${polarity === 'negative' ? 'negative' : polarity === 'positive' ? 'positive' : 'variable-polarity'} delta, candidate ${number(duration, 1)} ms; repeatable in ${repeatable}/${analyzed} beats; initial/terminal slopes ${number(initial, 4)}/${number(terminal, 4)} mV/ms.`,
    }];
  }) : [];
  return {
    entity, status, criteria, weight, strength: confoundingNotes.length ? 'weak' : weight >= 1.3 ? 'strong' : weight >= .6 ? 'moderate' : 'weak',
    evidence: published && heuristic ? 'mixed' : published ? 'published' : 'heuristic',
    missing: criteria.filter(c => c.result === null && c.role !== 'exclusion'), contextNotes, confoundingNotes, observations,
  };
}

export type PresumptiveDiagnosis = {
  /** Highest-priority abnormal entity whose defining criteria are met (or the normal one if nothing else is). */
  primary: EntityResult | null;
  /** Other entities whose criteria are met and coexist with the primary one. */
  concurrent: EntityResult[];
  /** Partially met entities and mimics of the met ones that the data do not exclude. */
  differentials: EntityResult[];
  /** Emergent or urgent entities the data could not evaluate: not excluded. */
  cannotExclude: EntityResult[];
  all: EntityResult[];
  summary: Localized;
};

const urgencyRank = { emergent: 0, urgent: 1, routine: 2 } as const;
const categoryRank: Record<string, number> = { ischemia: 0, rhythm: 1, conduction: 2, 'metabolic-drug': 3, 'structural-systemic': 4, chamber: 5, repolarization: 6, technical: 7 };
const isNormal = (r: EntityResult) => /(^|-)normal(-|$)/.test(r.entity.id) && r.entity.urgency === 'routine';

export function presumptiveDiagnosis(kb: KnowledgeBase, features: Features, context: ClinicalContext): PresumptiveDiagnosis {
  const all = kb.entities.map(e => evaluateEntity(e, features, context));
  const byId = new Map(all.map(r => [r.entity.id, r]));
  const rank = (a: EntityResult, b: EntityResult) =>
    urgencyRank[a.entity.urgency] - urgencyRank[b.entity.urgency] || b.weight - a.weight
    || (categoryRank[a.entity.category] ?? 9) - (categoryRank[b.entity.category] ?? 9);
  const strengthRank = { strong: 0, moderate: 1, weak: 2 } as const;
  // Within a group of alternative criteria (e.g. LVH by Sokolow, Cornell, Peguero) keep only the best-supported one.
  const familyOf = (r: EntityResult) => r.entity.group ?? r.entity.id;
  const metAll = all.filter(r => r.status === 'met').sort(rank);
  /** Within a family the most urgent, then best-supported, alternative is shown. */
  const beats = (o: EntityResult, r: EntityResult) => urgencyRank[o.entity.urgency] - urgencyRank[r.entity.urgency] || r.weight - o.weight || metAll.indexOf(o) - metAll.indexOf(r);
  const met = metAll.filter(r => !metAll.some(o => o !== r && familyOf(o) === familyOf(r) && beats(o, r) < 0));
  // Do not let several correlated, routine criteria bury an emergent measured pattern.
  // Technical LA-RA reversal or mirror-image dextrocardia invalidates extremity-lead ST/axis attribution when a territorial STEMI is only weak.
  // Widespread ST elevation meeting acute-pericarditis (moderate/strong) precedes weak single-territory STEMI without reciprocal ST depression.
  const hasTechnicalInversion = met.some(r => r.entity.id === 'limb-lead-reversal-la-ra' || r.entity.id === 'dextrocardia');
  const hasPericarditis = met.some(r => r.entity.id === 'acute-pericarditis' && r.strength !== 'weak');
  const reciprocalFalse = (r: EntityResult) => r.criteria.every(c => !/^recip-/.test(c.id) || c.result !== true);
  const effectiveUrgency = (r: EntityResult) => {
    if (hasTechnicalInversion && r.strength === 'weak' && ['anterior-stemi', 'inferior-stemi', 'lateral-stemi'].includes(r.entity.id)) return 3;
    if (hasPericarditis && r.strength === 'weak' && ['anterior-stemi', 'inferior-stemi', 'lateral-stemi'].includes(r.entity.id) && reciprocalFalse(r)) return 2;
    return urgencyRank[r.entity.urgency];
  };
  // Evidence ranks candidates within the same urgency; the score is not a probability.
  const primary = [...met].filter(r => !isNormal(r)).sort((a, b) => effectiveUrgency(a) - effectiveUrgency(b)
    || strengthRank[a.strength] - strengthRank[b.strength] || rank(a, b))[0] ?? met[0] ?? null;
  // A normal finding is never reported alongside an abnormal one in the same category.
  const concurrent = met.filter(r => r !== primary && !(isNormal(r) && met.some(o => !isNormal(o) && o.entity.category === r.entity.category)));
  const mimicIds = new Set(met.flatMap(r => r.entity.mimics ?? []).filter(id => !metAll.some(m => m.entity.id === id)));
  const differentials = all.filter(r => !metAll.includes(r) && (r.status === 'possible' || (mimicIds.has(r.entity.id) && r.status === 'not-evaluable'))
    && r.criteria.some(c => c.result === true)
    && !(r.entity.id === 'paced-mi-sgarbossa' && context.paced !== 'yes')).sort(rank).slice(0, 8);
  // "Cannot exclude" is reserved for serious entities the tracing itself leaves open: some ECG criterion supports them, or an
  // ECG measurement they need is missing. Entities whose only unknown is a clinical datum (temperature, a drug, a laboratory
  // value) or a sign this digitisation cannot measure are not listed on an otherwise unremarkable tracing.
  const readsTracing = (p: Predicate | null) => !!p && /"(feature|expr|countLeads|contiguous)"/.test(JSON.stringify(p));
  // Features this digitisation never measures (U wave, independent atrial rate, grouped beating, pacing spikes): a criterion
  // that is unknown only because of them is not a gap in this tracing.
  const unmeasured: Features = { ...features, pRate: 0, groupedBeating: false, pacedSpikes: false };
  for (const key of Object.keys(features)) if (key.endsWith('.uMv')) unmeasured[key] = 0;
  const leftOpenByTracing = (r: EntityResult) => r.criteria.some(c => c.role !== 'exclusion' && c.result === true && readsTracing(c.predicate))
    || r.criteria.some(c => c.role === 'required' && c.result === null && readsTracing(c.predicate) && evaluate(c.predicate, unmeasured, {}) === null);
  const cannotExclude = all.filter(r => r.status === 'not-evaluable' && r.entity.urgency !== 'routine' && !differentials.includes(r) && leftOpenByTracing(r) && !(r.entity.id === 'paced-mi-sgarbossa' && context.paced !== 'yes')).sort(rank);
  for (const id of mimicIds) { const r = byId.get(id); if (r && r.status === 'not-evaluable' && leftOpenByTracing(r) && !cannotExclude.includes(r) && !differentials.includes(r)) cannotExclude.push(r); }
  const lower = (r: EntityResult, lang: 'es' | 'en') => { const n = r.entity.name[lang]; return n.charAt(0).toLowerCase() + n.slice(1); };
  const list = (items: EntityResult[], lang: 'es' | 'en') => items.map(r => lower(r, lang)).join('; ');
  const summary: Localized = primary
    ? {
      es: `Diagnóstico presuntivo: ${primary.entity.name.es}${concurrent.length ? `; además, ${list(concurrent.slice(0, 5), 'es')}` : ''}.${differentials.length ? ` Diferencial: ${list(differentials.slice(0, 4), 'es')}.` : ''}`,
      en: `Presumptive diagnosis: ${primary.entity.name.en}${concurrent.length ? `; also ${list(concurrent.slice(0, 5), 'en')}` : ''}.${differentials.length ? ` Differential: ${list(differentials.slice(0, 4), 'en')}.` : ''}`,
    }
    : { es: 'Ninguna entidad de la base cumple sus criterios definitorios con los datos medidos.', en: 'No entity in the knowledge base meets its defining criteria with the measured data.' };
  return { primary, concurrent, differentials, cannotExclude: cannotExclude.slice(0, 8), all, summary };
}

/** Structural checks of a knowledge base (unknown features, references, groups, duplicate ids). */
export function validateKnowledgeBase(kb: KnowledgeBase): string[] {
  const problems: string[] = [], refs = new Set(kb.references.map(r => r.id)), ids = new Set<string>();
  const known = (name: string) => globalNames.includes(name) || new RegExp(`^lead\\.(${leadNames.join('|')})\\.(${leadFields.join('|')})$`).test(name);
  const walk = (p: Predicate | null, where: string) => {
    if (!p) return;
    if ('all' in p) p.all.forEach(x => walk(x, where)); else if ('any' in p) p.any.forEach(x => walk(x, where)); else if ('not' in p) walk(p.not, where);
    else if ('feature' in p) { if (!known(p.feature)) problems.push(`${where}: unknown feature ${p.feature}`); }
    else if ('expr' in p) { for (const name of p.expr.match(/[A-Za-z_][\w.]*/g) ?? []) if (!['abs', 'max', 'min'].includes(name) && !known(name)) problems.push(`${where}: unknown feature ${name}`); if (evaluateExpression(p.expr, {}) === null && !/[A-Za-z]/.test(p.expr)) problems.push(`${where}: bad expression`); }
    else if ('countLeads' in p) { if (!leadFields.includes(p.where.field)) problems.push(`${where}: unknown field ${p.where.field}`); }
    else if ('contiguous' in p) { if (!contiguousGroups[p.contiguous]) problems.push(`${where}: unknown group ${p.contiguous}`); if (!leadFields.includes(p.where.field)) problems.push(`${where}: unknown field ${p.where.field}`); }
  };
  for (const e of kb.entities) {
    if (ids.has(e.id)) problems.push(`duplicate entity ${e.id}`); ids.add(e.id);
    if (!e.criteria.some(c => c.role === 'required')) problems.push(`${e.id}: no required criterion`);
    for (const c of e.criteria) { walk(c.predicate, `${e.id}/${c.id}`); if (c.ref && !refs.has(c.ref)) problems.push(`${e.id}/${c.id}: unknown reference ${c.ref}`); }
    for (const c of e.confounders ?? []) {
      walk(c.when, `${e.id}/confounder`); if (c.ref && !refs.has(c.ref)) problems.push(`${e.id}/confounder: unknown reference ${c.ref}`);
      for (const id of c.criteria ?? []) if (!e.criteria.some(criterion => criterion.id === id)) problems.push(`${e.id}/confounder: unknown criterion ${id}`);
    }
    for (const m of e.mimics ?? []) if (!kb.entities.some(o => o.id === m) && !kb.glossary?.[m]) problems.push(`${e.id}: unknown mimic ${m}`);
  }
  return problems;
}
