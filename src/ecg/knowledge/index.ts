import type { Lead, Measurements } from '../../cases';
import type { Localized } from '../analysisTypes';
import type { ClinicalContext } from '../context';
import type { GlobalFeatures, LeadDetail } from '../estimate';
import { buildFeatures, presumptiveDiagnosis } from './engine';
import type { EntityResult, KnowledgeBase,Reference } from './engine';
import rhythm from './kb/rhythm.json';
import conduction from './kb/conduction.json';
import chamber from './kb/chamber.json';
import ischemia from './kb/ischemia.json';
import repolarization from './kb/repolarization.json';

/** Literature knowledge base: one file per domain (see docs/base-de-conocimiento.md). */
const files = [rhythm, conduction, chamber, ischemia, repolarization] as unknown as (KnowledgeBase & { domain: string })[];
export const knowledgeBase: KnowledgeBase = {
  entities: files.flatMap(file => file.entities.map(e => ({ ...e, domain: file.domain }))),
  references: files.flatMap(file => file.references).filter((r, i, all) => all.findIndex(o => o.id === r.id) === i),
  glossary: {
    'athlete-heart': { es: 'Corazón de atleta (adaptación fisiológica al entrenamiento)', en: "Athlete's heart (physiological training adaptation)" },
    'dilated-cardiomyopathy-hf': { es: 'Miocardiopatía dilatada / insuficiencia cardiaca', en: 'Dilated cardiomyopathy / heart failure' },
    'copd-pattern': { es: 'Patrón de EPOC / enfisema', en: 'COPD / emphysema pattern' },
    'hyperthyroidism-ecg': { es: 'Hipertiroidismo', en: 'Hyperthyroidism' },
    'pericardial-effusion-tamponade': { es: 'Derrame pericárdico / taponamiento', en: 'Pericardial effusion / tamponade' },
    'cardiac-amyloidosis': { es: 'Amiloidosis cardiaca', en: 'Cardiac amyloidosis' },
    'hypomagnesemia': { es: 'Hipomagnesemia', en: 'Hypomagnesaemia' },
    'hyperacute-t-waves': { es: 'Ondas T hiperagudas (isquemia muy precoz)', en: 'Hyperacute T waves (very early ischaemia)' },
    'focal-atrial-tachycardia': { es: 'Taquicardia auricular focal', en: 'Focal atrial tachycardia' },
    'beta-blocker-ccb-effect': { es: 'Efecto de betabloqueantes o calcioantagonistas', en: 'Beta-blocker or calcium-channel-blocker effect' },
  },
};
export const KNOWLEDGE_VERSION = 'cardioekg-kb-1.4.0';

/** Serializable result stored in CaseAnalysis (no functions, no predicates). */
export type PresumptiveEntity = {
  id: string; name: Localized; category: string; urgency: 'emergent' | 'urgent' | 'routine';
  status: EntityResult['status']; strength: EntityResult['strength']; evidence: EntityResult['evidence'];
  met: Localized[]; against: Localized[]; missing: Localized[]; context: Localized[];
  performance: string[]; mimics: Localized[]; nextSteps?: Localized; limitations?: Localized;
  references: Reference[];
};
export type PresumptiveSummary = {
  knowledgeVersion: string; summary: Localized;
  primary: PresumptiveEntity | null; concurrent: PresumptiveEntity[]; differentials: PresumptiveEntity[]; cannotExclude: PresumptiveEntity[];
  evaluated: number;
};

const pct = (v: number) => `${Math.round(v * 100)} %`;
function toEntity(r: EntityResult): PresumptiveEntity {
  const refIds = new Set([...(r.entity.references ?? []), ...r.entity.criteria.flatMap(c => c.ref ? [c.ref] : []), ...(r.entity.confounders ?? []).flatMap(c => c.ref ? [c.ref] : [])]);
  const performance = r.criteria.filter(c => !r.confoundingNotes.length && c.result === true && (c.sensitivity !== undefined || c.specificity !== undefined || c.lrPositive !== undefined))
    .map(c => [c.text.es, c.sensitivity !== undefined ? `S ${pct(c.sensitivity)}` : '', c.specificity !== undefined ? `E ${pct(c.specificity)}` : '', c.lrPositive !== undefined ? `LR+ ${c.lrPositive}` : ''].filter(Boolean).join(' · '));
  return {
    id: r.entity.id, name: r.entity.name, category: r.entity.category, urgency: r.entity.urgency,
    status: r.status, strength: r.strength, evidence: r.evidence,
    met: [...r.criteria.filter(c => c.result === true && c.role !== 'exclusion').map(c => c.text), ...r.observations],
    against: [...r.criteria.filter(c => (c.result === false && c.role === 'required') || (c.result === true && c.role === 'exclusion')).map(c => c.text), ...r.confoundingNotes],
    missing: r.missing.map(c => c.text), context: r.contextNotes, performance,
    mimics: (r.entity.mimics ?? []).map(id => knowledgeBase.entities.find(e => e.id === id)?.name ?? knowledgeBase.glossary?.[id]).filter((n): n is Localized => !!n),
    nextSteps: r.entity.nextSteps, limitations: r.entity.limitations,
    references: knowledgeBase.references.filter(ref => refIds.has(ref.id)).map(ref=>({...ref})),
  };
}

export function presumptiveFromMeasurements(args: {
  values: Measurements; details: Partial<Record<Lead, LeadDetail>>; global?: GlobalFeatures | null;
  rhythm: { rrCv: number | null; beatCount: number } | null; qtcMs: number | null; context: ClinicalContext;
}): PresumptiveSummary {
  const features = buildFeatures(args);
  const d = presumptiveDiagnosis(knowledgeBase, features, args.context);
  return {
    knowledgeVersion: KNOWLEDGE_VERSION, summary: d.summary,
    primary: d.primary ? toEntity(d.primary) : null, concurrent: d.concurrent.map(toEntity),
    differentials: d.differentials.map(toEntity), cannotExclude: d.cannotExclude.map(toEntity),
    evaluated: d.all.filter(r => r.status !== 'not-evaluable').length,
  };
}
