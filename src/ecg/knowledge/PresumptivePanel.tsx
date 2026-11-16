import {referenceReviewLabel} from './referenceReview';
import type { PresumptiveEntity, PresumptiveSummary } from './index';

const strengthName = { es: { strong: 'fuerte', moderate: 'moderada', weak: 'débil' }, en: { strong: 'strong', moderate: 'moderate', weak: 'weak' } } as const;
const urgencyName = { es: { emergent: 'Emergente', urgent: 'Urgente', routine: 'Rutina' }, en: { emergent: 'Emergent', urgent: 'Urgent', routine: 'Routine' } } as const;
const evidenceName = { es: { published: 'razones de verosimilitud publicadas', heuristic: 'peso heurístico (sin cifras publicadas)', mixed: 'cifras publicadas y peso heurístico' }, en: { published: 'published likelihood ratios', heuristic: 'heuristic weight (no published figures)', mixed: 'published figures and heuristic weight' } } as const;

function EntityCard({ entity, language, lead = false }: { entity: PresumptiveEntity; language: 'es' | 'en'; lead?: boolean }) {
  const es = language === 'es';
  return <article className={`presumptive-entity urgency-${entity.urgency}${lead ? ' is-primary' : ''}`}>
    <header>
      <h4>{entity.name[language]}</h4>
      <span className="presumptive-tags">
        <span className={`tag urgency-${entity.urgency}`}>{urgencyName[language][entity.urgency]}</span>
        <span className="tag">{es ? 'Evidencia' : 'Evidence'} {strengthName[language][entity.strength]}</span>
      </span>
    </header>
    {entity.met.length > 0 && <div><strong>{es ? 'Criterios cumplidos' : 'Criteria met'}</strong><ul>{entity.met.map((c, i) => <li key={i}>{c[language]}</li>)}</ul></div>}
    {entity.against.length > 0 && <div><strong>{es ? 'En contra' : 'Against'}</strong><ul>{entity.against.map((c, i) => <li key={i}>{c[language]}</li>)}</ul></div>}
    {entity.missing.length > 0 && <div className="presumptive-missing"><strong>{es ? 'No evaluable con estos datos' : 'Not evaluable with these data'}</strong><ul>{entity.missing.slice(0, 4).map((c, i) => <li key={i}>{c[language]}</li>)}</ul></div>}
    {entity.context.length > 0 && <div><strong>{es ? 'Historia clínica' : 'Clinical history'}</strong><ul>{entity.context.map((c, i) => <li key={i}>{c[language]}</li>)}</ul></div>}
    {entity.mimics?.length > 0 && <p className="presumptive-mimics">{es ? 'Puede simularlo: ' : 'Can be mimicked by: '}{entity.mimics.slice(0, 6).map(m => es ? m.es : m.en).join(' · ')}</p>}
    {entity.performance.length > 0 && <p className="presumptive-performance">{es ? 'Rendimiento publicado: ' : 'Published performance: '}{entity.performance.join(' | ')}</p>}
    {entity.nextSteps && <p className="presumptive-next"><strong>{es ? 'Siguiente paso según la guía: ' : 'Next step per guideline: '}</strong>{entity.nextSteps[language]}</p>}
    <p className="presumptive-meta">{es ? 'Peso: ' : 'Weight: '}{evidenceName[language][entity.evidence]}{entity.limitations ? ` · ${entity.limitations[language]}` : ''}</p>
    {entity.references.length > 0 && <details><summary>{es ? `Referencias (${entity.references.length})` : `References (${entity.references.length})`}</summary><ol>{entity.references.map(r => <li key={r.id}>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.citation}</a> : r.citation} · {referenceReviewLabel(r.verificationLevel,language,r.verified)}{r.reviewedAt?` · ${r.reviewedAt}`:''}{r.locator&&<small> · {r.locator}</small>}</li>)}</ol></details>}
  </article>;
}

export function PresumptivePanel({ result, language }: { result: PresumptiveSummary; language: 'es' | 'en' }) {
  const es = language === 'es';
  return <section className="card presumptive-panel" aria-labelledby="presumptive-title">
    <header className="presumptive-head">
      <div><span className="review-eyebrow">{es ? 'Algoritmo basado en la literatura' : 'Literature-based algorithm'}</span><h2 id="presumptive-title">{es ? 'Diagnóstico presuntivo' : 'Presumptive diagnosis'}</h2></div>
      <p className="presumptive-note">{es ? `${result.evaluated} entidades evaluadas con criterios de guías. La fuerza de la evidencia es relativa, no una probabilidad calibrada; confirmar con el trazado original y la clínica.` : `${result.evaluated} entities evaluated with guideline criteria. Evidence strength is relative, not a calibrated probability; confirm with the original tracing and the clinical picture.`}</p>
    </header>
    {result.primary && <EntityCard entity={result.primary} language={language} lead />}
    {result.concurrent.length > 0 && <><h3>{es ? 'Hallazgos concurrentes que cumplen criterios' : 'Concurrent findings meeting criteria'}</h3><div className="presumptive-grid">{result.concurrent.map(e => <EntityCard key={e.id} entity={e} language={language} />)}</div></>}
    {result.differentials.length > 0 && <details className="presumptive-section"><summary>{es ? `Diagnóstico diferencial (${result.differentials.length})` : `Differential diagnosis (${result.differentials.length})`}</summary><div className="presumptive-grid">{result.differentials.map(e => <EntityCard key={e.id} entity={e} language={language} />)}</div></details>}
    {result.cannotExclude.length > 0 && <details className="presumptive-section" open><summary>{es ? `No se pueden descartar con estos datos (${result.cannotExclude.length})` : `Cannot be excluded with these data (${result.cannotExclude.length})`}</summary>
      <ul className="presumptive-cannot">{result.cannotExclude.map(e => <li key={e.id}><strong>{e.name[language]}</strong> — {es ? 'falta: ' : 'missing: '}{e.missing.slice(0, 3).map(m => m[language]).join('; ') || (es ? 'datos para sus criterios' : 'data for its criteria')}</li>)}</ul></details>}
  </section>;
}
