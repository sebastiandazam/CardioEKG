import {referenceReviewLabel} from './knowledge/referenceReview';
import {useState} from 'react';
import {Terms} from '../terms/context';
import type {CaseAnalysis,Confidence,Localized} from './analysisTypes';
/** Plain-text systematic reading, for pasting into a note. */
export function readingText(analysis:CaseAnalysis,language:'es'|'en') {
 const r=analysis.systematic;if(!r)return analysis.impression[language];
 return [`${language==='es'?'Conclusión':'Conclusion'}: ${r.conclusion[language]}`,...r.sections.map(s=>`${s.title[language]}: ${s.statements.map(x=>x.text[language]).join(' ')}`),language==='es'?'Lectura automática educativa, no validada clínicamente.':'Automatic educational reading, not clinically validated.'].join('\n');
}
const text=(v:Localized,l:'es'|'en')=>v[l];
export function ConfidenceBadge({value,language}:{value:Confidence;language:'es'|'en'}) {
 const labels={es:{low:'Baja',moderate:'Moderada',high:'Alta','not-evaluable':'No evaluable'},en:{low:'Low',moderate:'Moderate',high:'High','not-evaluable':'Not evaluable'}};
 return <span className={`analysis-confidence is-${value.level}`} title={value.explanation[language]}>{language==='es'?'Confianza: ':'Confidence: '}{labels[language][value.level]} · {value.calibrated?(language==='es'?'calibrada':'calibrated'):(language==='es'?'no calibrada':'uncalibrated')}</span>;
}
export function AnalysisPanel({analysis,language,compact=false,showConclusion=true}:{analysis:CaseAnalysis;language:'es'|'en';compact?:boolean;showConclusion?:boolean}) {
 const es=language==='es';
 const [copied,setCopied]=useState<'idle'|'done'|'failed'>('idle');
 async function copy(){try{await navigator.clipboard.writeText(readingText(analysis,language));setCopied('done');}catch{setCopied('failed');}}
 const statusLabels={
  normal:es?'Normal':'Normal',
  borderline:es?'Limítrofe':'Borderline',
  abnormal:es?'Alterado':'Abnormal',
  'not-evaluable':es?'No evaluable':'Not evaluable',
 } as const;
 const screening=analysis.screening;
 const indicatedScales=screening?.scales.filter(s=>s.applicability==='indicated')??[];
 const conditionalScales=screening?.scales.filter(s=>s.applicability==='conditional')??[];
 const triageOpen=!!screening&&(screening.triage.level==='emergent'||screening.triage.level==='urgent')&&!compact;
 return <section className="case-analysis" aria-label={es?'Análisis verificable del ECG':'Traceable ECG analysis'}>
 <header><h2>{analysis.systematic?(es?'Lectura sistemática':'Systematic reading'):(es?'Análisis del ECG':'ECG analysis')}</h2>{showConclusion&&<ConfidenceBadge value={analysis.confidence} language={language}/>}{analysis.systematic&&<span className="analysis-copy"><button type="button" className="button button--subtle" onClick={copy}>{es?'Copiar lectura':'Copy reading'}</button><span role="status">{copied==='done'?(es?'Copiada':'Copied'):copied==='failed'?(es?'No se pudo copiar':'Could not copy'):''}</span></span>}</header>
 {!showConclusion?null:analysis.systematic&&analysis.systematic.level!=='insufficient'
  ? <div className={`analysis-conclusion is-${analysis.systematic.level}`}><h3>{es?'Conclusión':'Conclusion'}</h3><p><strong><Terms>{analysis.systematic.conclusion[language]}</Terms></strong></p></div>
  : <p><Terms>{analysis.impression[language]}</Terms></p>}
 {analysis.systematic&&<details className="analysis-systematic"><summary>{es?'Ver lectura por apartados':'View section-by-section reading'}</summary>
  <dl>{analysis.systematic.sections.map(section=><div key={section.id}><dt>{section.title[language]}</dt>{section.statements.map((statement,i)=><dd key={i} className={`reading-${statement.status}${statement.urgent?' is-urgent':''}`}>
   <span className="reading-status">{({meets:es?'Cumple criterios':'Meets criteria',suggests:es?'Sugiere':'Suggests',normal:'Normal','not-evaluable':es?'No evaluable':'Not evaluable',context:es?'Contexto':'Context'} as const)[statement.status]}</span> <Terms>{statement.text[language]}</Terms>
   {statement.criterion&&<small> {es?'Criterio: ':'Criterion: '}{statement.criterion[language]}</small>}</dd>)}</div>)}</dl></details>}
 {!screening&&analysis.findings.some(f=>f.urgent)&&<div className="analysis-alert" role="note"><strong>{es?'Prioridad de revisión clínica':'Clinical review priority'}</strong><ul>{analysis.warnings.map((w,i)=><li key={i}>{w[language]}</li>)}</ul></div>}
 {screening&&<details className="analysis-screening" open={triageOpen}>
  <summary>
   <span>{es?'Cribado clínico, comparación con guías y escalas':'Clinical screening, guideline comparison & scales'}</span>
   <span className={`screening-pill is-${screening.triage.level}`}>{({emergent:es?'EMERGENTE':'EMERGENT',urgent:es?'URGENTE':'URGENT',routine:es?'RUTINA':'ROUTINE',normal:es?'SIN ALARMA':'NORMAL'} as const)[screening.triage.level]}</span>
  </summary>
  <div className="screening-body">
   <div className={`screening-triage is-${screening.triage.level}`} role="note">
    <div className="screening-triage-head">
     <strong>{screening.triage.label[language]}</strong>
     <p><Terms>{screening.triage.rationale[language]}</Terms></p>
    </div>
    {screening.triage.redFlags.length>0&&<ul className="screening-flags">{screening.triage.redFlags.map((rf,i)=><li key={i}><Terms>{rf[language]}</Terms></li>)}</ul>}
   </div>
   {screening.articulatedComparison.length>0&&<div className="screening-section">
    <h3>{es?'Comparación articulada con umbrales de la literatura':'Articulated comparison against literature cutoffs'}</h3>
    <div className="screening-table-wrap">
     <table className="screening-table">
      <thead><tr>
       <th>{es?'Parámetro':'Parameter'}</th>
       <th>{es?'Observado':'Observed'}</th>
       <th>{es?'Criterio de guía':'Guideline cutoff'}</th>
       <th>{es?'Estado':'Status'}</th>
       <th>{es?'Interpretación y fuente':'Interpretation & citation'}</th>
      </tr></thead>
      <tbody>{screening.articulatedComparison.map(item=><tr key={item.parameter}>
       <th scope="row">{item.label[language]}</th>
       <td className="screening-num">{item.observed[language]}</td>
       <td>{item.guidelineCutoff[language]}</td>
       <td><span className={`status-chip is-${item.status}`}>{statusLabels[item.status]}</span></td>
       <td><Terms>{item.interpretation[language]}</Terms><small className="screening-cite">{item.citation}</small></td>
      </tr>)}</tbody>
     </table>
    </div>
   </div>}
   {indicatedScales.length>0&&<div className="screening-section">
    <h3>{es?'Escalas clínicas indicadas para este caso':'Clinical scales indicated for this case'}</h3>
    <div className="screening-scales-grid">{indicatedScales.map(scale=><article key={scale.id} className={`screening-scale-card risk-${scale.riskLevel}`}>
     <header>
      <h4><Terms>{scale.name[language]}</Terms></h4>
      <span className={`screening-risk risk-${scale.riskLevel}`}>{scale.score!==null&&scale.maxScore!==null?`${scale.score}/${scale.maxScore} · `:''}{scale.riskLabel[language]}</span>
     </header>
     <ul className="screening-criteria">{scale.criteriaBreakdown.map((c,i)=><li key={i} className={`crit-${c.status}`}>
      <span aria-hidden="true">{c.status==='met'?'✓':c.status==='not-met'?'·':'?'}</span>{' '}
      <span>{c.label[language]}{c.detail?` (${c.detail[language]})`:''}</span>
     </li>)}</ul>
     <p className="screening-rec"><Terms>{scale.recommendation[language]}</Terms></p>
     {scale.missingInputs.length>0&&<p className="screening-missing"><strong>{es?'Completar en cama: ':'Verify at bedside: '}</strong>{scale.missingInputs.map(m=>m[language]).join('; ')}</p>}
     <small className="screening-cite">{scale.citation}</small>
    </article>)}</div>
   </div>}
   {conditionalScales.length>0&&<details className="screening-conditional">
    <summary>{es?`Escalas condicionales aplicables según contexto (${conditionalScales.length})`:`Conditional context scales (${conditionalScales.length})`}</summary>
    <div className="screening-scales-grid">{conditionalScales.map(scale=><article key={scale.id} className={`screening-scale-card risk-${scale.riskLevel}`}>
     <header>
      <h4><Terms>{scale.name[language]}</Terms></h4>
      <span className={`screening-risk risk-${scale.riskLevel}`}>{scale.score!==null&&scale.maxScore!==null?`${scale.score}/${scale.maxScore} · `:''}{scale.riskLabel[language]}</span>
     </header>
     <p className="screening-rec"><Terms>{scale.recommendation[language]}</Terms></p>
     {scale.missingInputs.length>0&&<p className="screening-missing">{scale.missingInputs.map(m=>m[language]).join('; ')}</p>}
     <small className="screening-cite">{scale.citation}</small>
    </article>)}</div>
   </details>}
  </div>
 </details>}
 <details><summary>{es?'Hallazgos y evidencia':'Findings and evidence'} ({analysis.findings.length})</summary><div className="analysis-findings">{analysis.findings.map(f=><article key={f.id}><h3>{f.label[language]}</h3><ConfidenceBadge value={f.confidence} language={language}/><ul>{f.evidence.map((v,i)=><li key={i}><Terms>{v[language]}</Terms></li>)}</ul>{f.limitations.length>0&&<p className="analysis-muted">{f.limitations.map(v=>v[language]).join(' ')}</p>}<p>{f.referenceIds.map(id=>{const r=analysis.references.find(r=>r.id===id);return r&&<a key={id} href={r.url} target="_blank" rel="noreferrer">{r.name}</a>;})}</p></article>)}</div></details>
 <details><summary>{es?'Análisis de cada derivación':'Analysis of each lead'} · 12</summary><div className="analysis-leads">{analysis.leads.map(l=><article key={l.lead} className={`lead-analysis is-${l.status}`}><h3>{l.lead} <small>{l.summary[language]}</small></h3><ul>{l.observations.map((v,i)=><li key={i}>{text(v,language)}</li>)}</ul><ConfidenceBadge value={l.confidence} language={language}/></article>)}</div></details>
 <details><summary>{es?'Alternativas, incertidumbre y método':'Alternatives, uncertainty and method'}</summary><ul>{[...analysis.differential,...analysis.limitations].map((v,i)=><li key={i}>{v[language]}</li>)}</ul><p><strong>{es?'Reconstrucción: ':'Reconstruction: '}</strong>{analysis.reconstructionConfidence.explanation[language]}</p><p>{analysis.axisContext[language]}</p><p>{analysis.clinicalUse[language]}</p><p>{es?'Versión del análisis':'Analysis version'}: {analysis.algorithmVersion}</p></details>
 <details><summary>{es?'Referencias del análisis':'Analysis references'}</summary><ol className="analysis-ref-list">{analysis.references.map(r=><li key={r.id}><a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> · {referenceReviewLabel(r.verificationLevel,language)} · {es?'revisión':'reviewed'} {r.reviewedAt}</li>)}</ol></details>
 </section>;
}
