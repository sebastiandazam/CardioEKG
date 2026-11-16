import {PreexcitationPanel} from './ecg/PreexcitationPanel';
import {ClinicalDisclaimer} from './ClinicalDisclaimer';
import { PresumptivePanel } from './ecg/knowledge/PresumptivePanel';
import {initialSession,sessionReducer,pageFromHash} from './navigation/session';
import type {Page} from './navigation/session';
import {ClinicalContextForm} from './ecg/ClinicalContextForm';
import type {ClinicalContext} from './ecg/context';
import {makeAnalysisPrompt} from './ecg/evidencePrompt';
import {TrainingStatus} from './ecg/TrainingStatus';
import {assessComparability} from './ecg/provenance';
import {analyzeCase} from './ecg/analyze';
import {AnalysisPanel,ConfidenceBadge} from './ecg/AnalysisPanel';
import type {ExternalEvidenceNote} from './integrations/evidenceNote';
import type {WaveMavenSample} from './integrations/waveMaven';
import {BioDigitalPanel} from './integrations/BioDigital';
import {OpenEvidencePanel} from './integrations/OpenEvidence';
import {RemoteAnalysis} from './integrations/RemoteAnalysis';
import {usePythonAnalysis,measureCase} from './ecg/usePythonAnalysis';
import {PythonStatus} from './ecg/PythonStatus';
import type {CaseAnalysis} from './ecg/analysisTypes';
import {measurementReason} from './ecg/estimate';
import {teachingCycle} from './anatomy/activation';
import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getEvidence, getManagement, openEvidenceUrl, type FindingId } from './evidence'
import { LanguageContext, strings, useLanguage, type Language } from './locale'
import { leads, simulations, type Lead, type Marker, type Phase, type ViewerCase } from './cases'
import { clinicalCases } from './clinical'
import { GitHubMark, Icon, type IconName } from './icons'
import { Landing } from './landing/Landing'
import { Intake, SafetyReminder, type IntakeAnswers } from './intake/Intake'
import { Terms, TermsEnabled } from './terms/context'
import { Spark, Trace } from './Trace'
import type { ResearchCase } from './research/ResearchCapture'
import './style.css'
import './redesign.css'
import './brand.css'
import { BrandLogo } from './BrandLogo'

const researchEnabled = import.meta.env.MODE === 'research' && import.meta.env.VITE_APPROVED_RESEARCH === '1'
const Capture = lazy(() => import('./research/install').then(module => ({
  default: (props: Omit<Parameters<typeof module.ResearchCapture>[0], 'approvedModel'>) =>
    <module.ResearchCapture {...props} approvedModel={researchEnabled ? module.approvedModel : undefined}/>,
})))
const WaveMavenLibrary=lazy(()=>import('./integrations/WaveMaven.tsx').then(module=>({default:module.WaveMavenLibrary})));
const DiagnosticAI=lazy(()=>import('./integrations/diagnosticAI/DiagnosticAI').then(module=>({default:module.DiagnosticAI})));
const Heart3D = lazy(() => import('./anatomy/Heart3D').then(module => ({ default: module.Heart3D })))
type ViewerSnapshot={externalEvidence?:ExternalEvidenceNote;longSelected?:boolean;lead:Lead;cursor:number;context:ClinicalContext}
const ui = {
  es: {
    start: 'Nuevo ECG', examples: 'Casos de ejemplo', terms: 'Definiciones', heart: 'Anatomía cardíaca 3D',
    reference: 'Modelo de referencia', loadingModel: 'Cargando modelo 3D…', review: 'Revisión del ECG',
    practice: 'ECG revisado', caseContext: 'Contexto del trazado',
    indications: { rhythm: 'Palpitaciones o sospecha de arritmia', symptoms: 'Otros síntomas', followUp: 'Control o seguimiento', other: 'Motivo sin especificar' },
    settings: { outpatient: 'Consulta ambulatoria', hospital: 'Urgencias u hospitalización', unknown: 'Entorno sin especificar' },
  },
  en: {
    start: 'New ECG', examples: 'Sample cases', terms: 'Definitions', heart: '3D Cardiac Anatomy',
    reference: 'Reference anatomy', loadingModel: 'Loading the 3D model…', review: 'ECG Review',
    practice: 'Reviewed ECG', caseContext: 'Recording context',
    indications: { rhythm: 'Palpitations or suspected arrhythmia', symptoms: 'Other symptoms', followUp: 'Routine check or follow-up', other: 'Reason unspecified' },
    settings: { outpatient: 'Outpatient clinic', hospital: 'Emergency or inpatient care', unknown: 'Setting unspecified' },
  },
}
const catalog = [...clinicalCases, ...simulations]
const labels = ['0', '1', '2', '3', '4', '5']
const phases: Phase[] = ['p', 'qrs', 't']

function Origin({ item }: { item: ViewerCase }) {
  const { copy, language } = useLanguage()
  if (item.origin === 'clinical') return <span className="tag tag--green"><span/> {copy.clinical}</span>
  if (item.origin === 'research') return <span className="tag tag--green"><span/> {researchEnabled ? copy.privateCase : ui[language].practice}</span>
  return <span className="tag"><span/> {copy.simulation}</span>
}

function SourceLinks({ ids }: { ids: readonly string[] }) {
  const { language } = useLanguage()
  const { sources } = getEvidence(language)
  return <div className="source-links">{ids.map(id => {
    const source = sources.find(entry => entry.id === id)
    return source && <a key={id} href={source.url} target="_blank" rel="noreferrer">{source.id === "liquid-glass" && <GitHubMark/>}{source.name}<Icon name="external"/></a>
  })}</div>
}

function Evidence({ pattern,analysis,context,recordingContext,externalEvidence,onExternalEvidence }: {externalEvidence?:ExternalEvidenceNote;onExternalEvidence:(value:ExternalEvidenceNote|undefined)=>void; pattern: FindingId;analysis:CaseAnalysis;context?:ClinicalContext;recordingContext?:string }) {
  const { language, copy } = useLanguage()
  const { findings } = getEvidence(language)
  const [copied, setCopied] = useState<'success' | 'fallback' | null>(null)
  const [show, setShow] = useState(true)
  const prompt = makeAnalysisPrompt(analysis, language,context,recordingContext)
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied('success')
    } catch {
      setCopied('fallback')
    }
  }
  return <section className="card evidence">
    <div className="section-title"><span className="heading-icon"><Icon name="book"/></span><div><h2>{copy.evidence}</h2><p>{copy.references}</p></div></div>
    <div className="evidence-body">
      <SourceLinks ids={findings[pattern].sourceIds}/>
      {show && <label className="prompt">{copy.suggestedQuestion}<textarea readOnly value={prompt} rows={4} onFocus={event => event.currentTarget.select()}/></label>}
      <div className="evidence-actions">
        {show
          ? <button className="button button--subtle" onClick={copyPrompt}><Icon name={copied === 'success' ? 'check' : 'copy'}/> {copied === 'success' ? copy.questionCopied : copy.copyQuestion}</button>
          : <button className="button button--subtle" onClick={() => setShow(true)}><Icon name="copy"/> {copy.showQuestion}</button>}
        <a className="button button--subtle" href={openEvidenceUrl} target="_blank" rel="noopener noreferrer">OpenEvidence <Icon name="external"/></a>
        <p className="prompt-sharing-note">{language==='es'?'Copia el prompt y pégalo en OpenEvidence. Abrir el enlace no envía el caso; el contexto y la nota clínica se incluyen si los aportaste. Revisa el texto y elimina identificadores antes de copiar. Las imágenes y señales crudas quedan fuera.':'Copy the prompt and paste it into OpenEvidence. Opening the link does not send the case; provided clinical context and notes are included. Review the text and remove identifiers before copying. Images and raw signals are excluded.'}</p>
        <OpenEvidencePanel language={language} value={externalEvidence} onChange={onExternalEvidence}/>
      </div>
      {copied === 'fallback' && <p className="copy-fallback" role="status">{copy.copyFallback}</p>}
    </div>
  </section>
}

function Management({ item,analysis }: { item: ViewerCase;analysis:CaseAnalysis }) {
  const { language, copy } = useLanguage()
  const observed:FindingId=analysis.findings.some(f=>f.id==='rbbb-morphology')?'rbbb':analysis.findings.some(f=>f.id==='lbbb-morphology')?'lbbb':analysis.findings.some(f=>f.id==='sinus-compatible')?'sinus':'indeterminate'
  const guidance = getManagement(observed, language)
  const screening = analysis.screening
  const primary = analysis.presumptive?.primary
  const rawSteps = [
    ...(primary?.nextSteps ? [primary.nextSteps[language]] : []),
    ...(screening?.triage.immediateActions.map(a => a[language]) ?? []),
    ...(screening?.scales.filter(s => s.applicability === 'indicated' && (s.riskLevel === 'high' || s.riskLevel === 'positive' || s.riskLevel === 'moderate')).map(s => s.recommendation[language]) ?? []),
  ]
  const steps = rawSteps.filter((s, i, all) => !!s && all.indexOf(s) === i)
  const displaySteps = steps.length ? steps : guidance.initialSteps
  const urgentText = screening?.triage.redFlags.length
    ? screening.triage.redFlags.map(r => r[language]).join(' ')
    : screening?.triage.level === 'emergent' || screening?.triage.level === 'urgent'
      ? `${screening.triage.rationale[language]} ${guidance.urgent}`
      : guidance.urgent
  const sourceIds = Array.from(new Set([
    ...guidance.sourceIds,
    ...(screening?.triage.sourceIds ?? []),
    ...(screening?.scales.filter(s => s.applicability === 'indicated').map(s => s.referenceId) ?? []),
  ]))
  return <section id="presumptive-diagnosis" className="card management" aria-labelledby="management-heading" tabIndex={-1}>
    <div className="management-top">
      <span className="heading-icon"><Icon name="info"/></span>
      <div><h2 id="management-heading">{language==='es'?'Conducta sugerida':'Suggested next steps'}</h2>
        {screening&&<p className="management-scope"><strong>{screening.triage.label[language]}</strong></p>}
        <p className="management-scope">{item.origin === 'research' && researchEnabled ? copy.researchScope : copy.diagnosisScope}</p>
      </div>
    </div>
    <div className="management-grid">
      <div><h3>{copy.initialManagement}</h3><ul>{displaySteps.map(step => <li key={step}><Terms>{step}</Terms></li>)}</ul></div>
      <div className="urgent-care"><h3>{copy.urgentEvaluation}</h3><p><Terms>{urgentText}</Terms></p></div>
    </div>
    <details className="management-sources"><summary>{copy.clinicalEvidence}</summary><SourceLinks ids={sourceIds}/></details>
  </section>
}

function Viewer({ item, openLibrary, intake,snapshot,onSnapshot }: { item: ViewerCase; openLibrary: () => void; intake: IntakeAnswers | null;snapshot?:ViewerSnapshot;onSnapshot?:(value:ViewerSnapshot)=>void }) {
  const { language, copy } = useLanguage()
  const [context,setContext]=useState<ClinicalContext>(snapshot?.context??item.clinicalContext??{})
  const [axisConfirmed,setAxisConfirmed]=useState(item.captureProvenance?.userConfirmedComparable??false)
  const engineItem=useMemo(()=>({...item,...(axisConfirmed?{pythonAnalysis:undefined,captureProvenance:{commonRecording:true,commonCalibration:true,timing:'unknown' as const,...item.captureProvenance,userConfirmedComparable:true}}:{})}),[item,axisConfirmed])
  const pythonState=usePythonAnalysis(engineItem)
  const analysisItem=useMemo(()=>({...engineItem,measurementEngine:'python' as const,pythonAnalysis:pythonState.result,clinicalContext:context}),[engineItem,pythonState.result,context])
  const comparison=useMemo(()=>assessComparability(analysisItem.traces,analysisItem.captureProvenance,analysisItem.synchronized,pythonState.result?.estimate.leadDetails??null),[analysisItem])
  const analysis=useMemo(()=>analyzeCase(analysisItem),[analysisItem])
  const recordingContext=intake?`${ui[language].indications[intake.indication]}; ${ui[language].settings[intake.setting]}; ${language==='es'?'signos de alarma declarados':'reported warning signs'}: ${intake.safety==='clear'?'no':intake.safety==='urgent'?(language==='es'?'sí':'yes'):(language==='es'?'no se sabe':'unknown')}`:undefined
  const resolved={...item.measurements,...Object.fromEntries(analysis.measurements.map(m=>[m.key,m.value]))}
  const [externalEvidence,setExternalEvidence]=useState<ExternalEvidenceNote|undefined>(snapshot?.externalEvidence??item.externalEvidence);
  const [includeExternalEvidence,setIncludeExternalEvidence]=useState(false);
  useEffect(()=>setIncludeExternalEvidence(false),[externalEvidence]);
  const [includeReportNote,setIncludeReportNote]=useState(false);
  const [detailedReport,setDetailedReport]=useState(false);
  useEffect(()=>setIncludeReportNote(false),[context.freeText]);
  const [reportBusy,setReportBusy]=useState(false),[reportError,setReportError]=useState('')
  async function download(){if(reportBusy||pythonState.status!=='ready')return;setReportBusy(true);setReportError('');try{const module=await import('./report/report');await module.downloadReport({...analysisItem,measurements:resolved,externalEvidence},analysis,language,{detailed:detailedReport,includeFreeText:includeReportNote,includeExternalEvidence});setIncludeReportNote(false);setIncludeExternalEvidence(false);}catch{setReportError(language==='es'?'No se pudo generar el informe en este dispositivo. Conserva el caso y vuelve a intentar.':'Could not generate the report on this device. Keep the case and retry.');}finally{setReportBusy(false);}}
  const finding = getEvidence(language).findings[item.pattern]
  const [longSelected,setLongSelected]=useState(snapshot?.longSelected??!!item.rhythmTrace);
  const [lead, setLead] = useState<Lead>(snapshot?.lead??item.rhythmLead??'I')
  const [cursor, setCursor] = useState(() => {
    if(snapshot)return snapshot.cursor
    const qrs = item.markers?.find(marker => marker.phase === 'qrs')
    return qrs ? (qrs.start + qrs.end) / 2 : 0
  })
  const [playing, setPlaying] = useState(false)
  const [teachingEnabled,setTeachingEnabled]=useState(false)
  const [teachingPattern,setTeachingPattern]=useState<string>('unassigned')
  const [expanded, setExpanded] = useState(false)
  const [showBounds,setShowBounds]=useState(true)
  const [manualPhase, setManualPhase] = useState<Phase | null>(null)
  const [speed, setSpeed] = useState(1)
  const trace = longSelected?item.rhythmTrace:item.traces[lead]
  const duration = trace?.seconds ?? 0
  const annotated = longSelected?analysis.rhythmAnalysis?.markers:analysis.leads.find(l=>l.lead===lead)?.markers ?? item.markersByLead?.[lead] ?? item.markers
  const markers = annotated && (playing || item.synchronized) ? annotated : undefined
  const active: Marker | null = markers?.find(marker => marker.start <= cursor && marker.end >= cursor) ?? null
  const windowLength = duration > 0 ? Math.min(duration, 5) : 5
  const from = Math.max(0, Math.min(Math.floor(cursor / windowLength) * windowLength, duration - windowLength))
  const teaching=teachingCycle(cursor,resolved.rateBpm,teachingPattern)
  const teachingPlayback=teachingEnabled
  const activePhase = teachingPlayback ? teaching.phase : markers ? active?.phase ?? null : manualPhase
  const phaseProgress = teachingPlayback ? teaching.progress : active ? (cursor - active.start) / (active.end - active.start) : 0.73
  useEffect(()=>{onSnapshot?.({lead,cursor,context,longSelected,externalEvidence})},[lead,cursor,context,longSelected,externalEvidence,onSnapshot])
  const timeline = useRef(cursor)
  useEffect(() => { timeline.current = cursor }, [cursor])
  useEffect(() => {
    if (!playing || !duration) return
    let frame = 0
    let previous = 0
    const render = (now: number) => {
      if (previous) {
        timeline.current = (timeline.current + Math.min((now - previous) / 1000, 0.1) * speed) % duration
        setCursor(timeline.current)
      }
      previous = now
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [duration, playing, speed])
  function seek(value: number) {
    setCursor(Math.max(0, Math.min(duration, value)))
  }
  function changeLead(value: Lead) {
    setLead(value)
    setCursor(0)
    setPlaying(false)
  }
  function selectPhase(phase: Phase) {
    setTeachingEnabled(false)
    setPlaying(false)
    setManualPhase(phase)
    const marker = annotated?.find(entry => entry.phase === phase && entry.start >= from) ?? annotated?.find(entry => entry.phase === phase)
    if (marker) seek(marker.start + (marker.end - marker.start) * 0.73)
  }
  function step() {
    setTeachingEnabled(false)
    setPlaying(false)
    if (markers) {
      const next = markers.find(marker => marker.start > cursor + 0.01) ?? markers[0]
      if (next) seek(next.start + (next.end - next.start) * 0.7)
    } else {
      const available = item.pattern === 'af' ? phases.slice(1) : phases
      const current = manualPhase ? available.indexOf(manualPhase) : -1
      setManualPhase(available[(current + 1) % available.length])
    }
  }
  const measurements: { key: keyof ViewerCase['measurements']; label: string; value: number | null; unit: string; icon: IconName }[] = [
    { key: 'rateBpm', label: copy.rate, value: resolved.rateBpm, unit: copy.beatsPerMinute, icon: 'heart' },
    { key: 'prMs', label: copy.pr, value: resolved.prMs, unit: 'ms', icon: 'clock' },
    { key: 'qrsMs', label: copy.qrs, value: resolved.qrsMs, unit: 'ms', icon: 'pulse' },
    { key: 'qtMs', label: copy.qt, value: resolved.qtMs, unit: 'ms', icon: 'wave' },
    { key: 'axisDeg', label: copy.axis, value: resolved.axisDeg, unit: '°', icon: 'axis' },
  ]
  return <>
    <div className="page-heading"><div><h1>{ui[language].review}</h1><p>{copy.viewerIntro}</p></div>
      <div className="viewer-heading-actions"><button type="button" className="button button--primary" disabled={reportBusy||pythonState.status!=='ready'} onClick={download}>{reportBusy?(language==='es'?'Generando PDF…':'Generating PDF…'):(language==='es'?'Descargar informe PDF':'Download PDF report')}</button><button className="button button--subtle" onClick={openLibrary}><Icon name="grid"/> {copy.explore} <Icon name="arrow"/></button></div>
    </div>
    <div className="case-bar"><div className="case-label"><span className="case-icon"><Icon name="pulse"/></span><div><span>{item.origin === 'research' ? copy.reviewedFinding : copy.selectedCase}</span><strong><Terms>{item.title?.[language]??analysis.findings.find(f=>f.id!=='rate-range'&&f.id!=='axis-normal')?.label[language]??(language==='es'?'Impresión del ECG':'ECG impression')}</Terms></strong></div></div><div className="case-actions"><Origin item={item}/><a className="case-management-link" href="#presumptive-diagnosis" onClick={event => {
      event.preventDefault()
      document.getElementById('presumptive-diagnosis')?.focus()
    }}>{copy.diagnosisLink} <Icon name="arrow"/></a></div></div>
    {intake && <p className="case-context"><strong>{ui[language].caseContext}</strong> · {ui[language].indications[intake.indication]} · {ui[language].settings[intake.setting]}</p>}
    {item.educationalReference&&<section className="card educational-reference"><h2>{language==='es'?'Referencia docente de Wave-Maven':'Wave-Maven teaching reference'} · {item.educationalReference.caseId}</h2><p><strong>{item.educationalReference.diagnosis[language]}</strong></p><p>{language==='es'?'Diagnóstico publicado por la fuente. Se muestra separado de las medidas y de la impresión calculadas por CardioEKG.':'Diagnosis published by the source. Displayed separately from CardioEKG measurements and computed impression.'}</p><a href={item.educationalReference.sourceUrl} target="_blank" rel="noreferrer">{item.educationalReference.attribution}</a></section>}
    <ClinicalDisclaimer language={language}/>
    <PythonStatus state={pythonState} language={language}/>
    {/* 1 · Resumen: conclusión y medidas, lo primero que se lee */}
    <section className="review-summary" aria-label={language==='es'?'Resumen del ECG':'ECG summary'}>
      <div className="review-conclusion card">
        <span className="review-eyebrow">{language==='es'?'Conclusión de la lectura':'Reading conclusion'}</span>
        <p><Terms>{pythonState.status==='ready'?(analysis.systematic&&analysis.systematic.level!=='insufficient'?analysis.systematic.conclusion:analysis.impression)[language]:(language==='es'?'El motor está calculando las medidas. La interpretación aparecerá al completar el análisis.':'The engine is calculating measurements. Interpretation will appear when analysis completes.')}</Terms></p>
        <div className="review-conclusion-meta"><ConfidenceBadge value={analysis.confidence} language={language}/>{analysis.systematic?.level==='partial'&&<span className="review-partial">{language==='es'?'Lectura parcial: revisa lo no evaluable':'Partial reading: check what was not evaluable'}</span>}</div>
      </div>
      <div className="measurements" aria-label={copy.measurements}>{measurements.map(metric=>{const detail=analysis.measurements.find(m=>m.key===metric.key)!;return <div key={metric.key} className="card measure"><span className="measure-icon"><Icon name={metric.icon}/></span><div><span><Terms>{metric.label}</Terms></span><strong>{detail.status==='estimated'&&metric.value!==null?'≈ ':''}{detail.status==='not-applicable'?(language==='es'?'No aplicable':'Not applicable'):metric.value===null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(metric.value)} <small>{metric.value===null?'':metric.unit}</small></strong><span>{detail.status==='manual'?copy.calipers:detail.status==='source'?(language==='es'?'Valor del caso':'Case value'):detail.status==='estimated'?copy.estimate:''}</span><span className="measure-reason">{detail.reason[language]}</span><details><summary>{language==='es'?'Método':'Method'}</summary><p>{detail.method[language]}</p><ConfidenceBadge value={detail.confidence} language={language}/><p>{detail.sourceLeads.join(', ')}</p></details></div></div>})}</div>
        {resolved.axisDeg===null&&comparison.requiresConfirmation&&(!item.captureProvenance||item.captureProvenance.commonCalibration)&&<div className="axis-comparison"><p>{comparison.reason[language]}</p><label><input type="checkbox" checked={axisConfirmed} onChange={e=>setAxisConfirmed(e.target.checked)}/>{language==='es'?'Confirmo que I y aVF pertenecen al mismo ECG, tienen la misma calibración y contienen latidos comparables.':'I confirm that I and aVF belong to the same ECG, have the same calibration and contain comparable beats.'}</label></div>}
    </section>
    {pythonState.status==='ready'&&analysis.preexcitation?.status==='supported'&&<PreexcitationPanel review={analysis.preexcitation} prMs={resolved.prMs} language={language}/>}
    {pythonState.status==='ready'&&analysis.presumptive&&<PresumptivePanel result={analysis.presumptive} language={language}/>}
    {/* 2 · Trazado + lectura sistemática a la izquierda; anatomía + historia clínica a la derecha */}
    <div className={`review-layout ${expanded ? 'review-layout--expanded' : ''}`}>
      <div className="review-main">
      <section className="card waveform-card" aria-label={copy.waveform}>
        <div className="card-head"><div className="section-title"><span className="heading-icon"><Icon name="wave"/></span><div><h2>{copy.waveform}</h2><p>{item.synchronized ? copy.simultaneous : lead === 'II' ? (longSelected ? copy.rhythmLong : copy.rhythmShort) : copy.leadSegment}</p></div></div>
          <button className="icon-button expand-button" aria-label={expanded ? copy.shrink : copy.enlarge} onClick={() => setExpanded(value => !value)}><Icon name={expanded ? 'minimize' : 'maximize'}/></button>
        </div>
        <div className="lead-controls" aria-label={copy.selectedLead}>{leads.map(value => <button key={value} className={!longSelected&&lead === value ? 'selected' : ''} disabled={!item.traces[value]} aria-pressed={lead === value} onClick={() => {setLongSelected(false);changeLead(value)}}>{value}</button>)}{item.rhythmTrace&&<button className={longSelected?'selected':''} aria-pressed={longSelected} onClick={()=>{changeLead('II');setLongSelected(true)}}>{language==='es'?'Tira larga de II':'Long II strip'}</button>}</div>
        <div className="plot-container">
          <Trace deltaWindows={showBounds?(longSelected?analysis.rhythmAnalysis?.features.deltaEvidence?.windows:analysis.preexcitation?.leads[lead]?.windows):undefined} measurementWindows={showBounds?analysis.measurements.flatMap(m=>(m.windows??[]).filter(w=>w.lead===lead&&(w.captureLead??w.lead)===(longSelected?'II-long':lead)).map(w=>({...w,label:m.key}))):undefined} boundaries={showBounds?(longSelected?analysis.rhythmAnalysis?.markers:analysis.leads.find(l=>l.lead===lead)?.markers):undefined} trace={trace} lead={lead} from={from} length={windowLength} cursor={cursor} active={active} onSeek={seek}/>
          <div className="ticks" aria-hidden="true">{labels.map((n, index) => <span key={n}>{Number((from + index * windowLength / 5).toFixed(2)).toLocaleString(copy.locale)} s</span>)}</div>
        </div>
        <label className="boundary-toggle"><input type="checkbox" checked={showBounds} onChange={e=>setShowBounds(e.target.checked)}/>{language==='es'?'Mostrar límites: P verde, QRS rojo, T azul; candidatos delta violetas y correcciones manuales moradas.':'Show boundaries: P green, QRS red, T blue; delta candidates violet and manual corrections purple.'}</label>
        <div className="playback">
          <button className="play-button" aria-label={playing ? copy.pause : copy.play} onClick={() => setPlaying(value => !value)} disabled={!trace}><Icon name={playing ? 'pause' : 'play'}/></button>
          <span className="play-time">{cursor.toLocaleString(copy.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s</span>
          <input aria-label={copy.position} type="range" min={0} max={duration || 1} step={0.01} value={cursor} onChange={event => seek(event.currentTarget.valueAsNumber)} disabled={!trace}/>
          <label className="speed"><span className="sr-only">{copy.speed}</span><select value={speed} onChange={event => setSpeed(Number(event.currentTarget.value))}><option value={0.5}>{(0.5).toLocaleString(copy.locale)}×</option><option value={1}>1×</option><option value={2}>2×</option></select></label>
        </div>
      </section>
        {pythonState.status==='ready'&&<AnalysisPanel analysis={analysis} language={language} showConclusion={false}/>}
      </div>
      <aside className="review-side">
      <section className="heart-card" aria-label={copy.conductionModel}>
        <div className="heart-head"><div className="section-title"><div><h2>{ui[language].heart}</h2><p>{ui[language].reference}</p></div></div></div>
        <Suspense fallback={<p className="anatomy-loading" role="status">{ui[language].loadingModel}</p>}>
          <Heart3D language={language} phase={activePhase} progress={phaseProgress} activation={teachingPlayback?teaching:undefined} finding={teachingEnabled?teachingPattern:item.pattern} playing={playing} axisDeg={resolved.axisDeg} allowRemote={!researchEnabled && item.origin !== 'research'}/>
        </Suspense>
        <div className="heart-footer"><div className="phase-controls" aria-label={copy.phase}>{phases.map(phase => <button key={phase} disabled={item.pattern === 'af' && phase === 'p'} aria-pressed={activePhase === phase} onClick={() => selectPhase(phase)}>{copy.phaseLabels[phase]}</button>)}</div><button className="icon-button heart-step" aria-label={copy.nextPhase} onClick={step}><Icon name="step"/></button></div>
        {<label className="heart3d-teaching-toggle"><input type="checkbox" checked={teachingEnabled} onChange={e=>setTeachingEnabled(e.target.checked)}/>{language==='es'?'Secuencia docente continua al recorrer el ECG':'Continuous teaching sequence while moving through the ECG'}</label>}
        {teachingEnabled&&<label className="teaching-scenario">{language==='es'?'Mecanismo docente (no diagnóstico del registro)':'Teaching mechanism (not a diagnosis of the recording)'}<select value={teachingPattern} onChange={e=>setTeachingPattern(e.target.value)}>{[['unassigned','Elegir mecanismo','Choose mechanism'],['sinus','Sinusal','Sinus'],['af','Fibrilación auricular','Atrial fibrillation'],['rbbb','Bloqueo de rama derecha','Right bundle branch block'],['lbbb','Bloqueo de rama izquierda','Left bundle branch block'],['avblock1','Retraso AV','AV delay'],['avblock2','Bloqueo AV de segundo grado','Second-degree AV block'],['avblock3','Bloqueo AV completo','Complete AV block'],['wpw','Vía accesoria / preexcitación','Accessory pathway / pre-excitation']].map(([value,es,en])=><option key={value} value={value}>{language==='es'?es:en}</option>)}</select></label>}
        {teachingPlayback&&<p className="heart3d-teaching" role="note">{language==='es'?'Animación docente: secuencia ilustrativa al ritmo estimado (60 lpm si no hay estimación). No identifica las ondas P, QRS o T de este ECG.':'Teaching animation: illustrative sequence at the estimated rate (60 bpm if unavailable). It does not identify this ECG’s P, QRS or T waves.'}</p>}
        {item.automaticMarkers&&!teachingPlayback&&<p className="heart-caption">{language==='es'?'Límites temporales estimados automáticamente; no son anotaciones clínicas verificadas.':'Automatically estimated temporal boundaries; these are not verified clinical annotations.'}</p>}
        <BioDigitalPanel language={language}/>
        <p className="heart-caption">{activePhase ? copy.phaseNames[activePhase] : item.pattern === 'af' ? copy.disorganized : copy.betweenPhases}{!markers && ` · ${copy.referenceDiagram}`}{playing && !item.synchronized && annotated && ` · ${copy.annotatedQrs}`}</p>
      </section>
      </aside>
    </div>
    {/* Historia clínica a todo el ancho: cambia la lectura sistemática al instante */}
    <div className="review-context"><ClinicalContextForm value={context} onChange={setContext} language={language}/></div>
    {/* 3 · Manejo y evidencia */}
    {pythonState.status==='ready'&&<Management item={item} analysis={analysis}/>}
    {pythonState.status==='ready'&&<Suspense fallback={null}><DiagnosticAI item={analysisItem} analysis={analysis} language={language} recordingContext={recordingContext}/></Suspense>}
    <div className="detail-grid">
        {pythonState.status==='ready'&&<Evidence key={item.pattern + language} pattern={item.pattern} analysis={analysis} context={context} externalEvidence={externalEvidence} onExternalEvidence={setExternalEvidence} recordingContext={recordingContext}/>}
      <section className="card interpretation review-source"><div className="section-title"><span className="heading-icon"><Icon name="target"/></span><div><h2>{language==='es'?'Fuente del registro':'Recording source'}</h2><p>{copy.findingOrigins[item.findingOrigin]}</p></div></div>
        <div className="interpretation-body">{item.pattern!=='indeterminate'&&<p><Terms>{finding.mechanism}</Terms></p>}
          {finding.leads.length > 0 && <p className="lead-hint"><Icon name="pulse"/> {copy.leadsOfInterest} · {finding.leads.join(", ")}</p>}
          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="attribution">{item.attribution?.[language]} <Icon name="external"/></a>}
          {item.licenseUrl && <div><a className="attribution" href={item.licenseUrl} target="_blank" rel="noreferrer">{copy.recordLicense} <Icon name="external"/></a></div>}
        </div>
      </section>
    </div>
    {/* 4 · Detalles técnicos plegados */}
    <details className="review-technical card">
      <summary>{language==='es'?'Detalles técnicos: método de medida, análisis remoto y entrenamiento':'Technical details: measurement method, remote analysis and training'}</summary>
    {item.origin==='research'&&item.pattern==='indeterminate'&&item.findingOrigin==='manual'&&<p className="card capture-result-note" role="status">{language==='es'?'La impresión calculada integra medidas, morfología, eje y contexto clínico opcional. Revisa sus evidencias, alternativas y confianza antes de usarla para una decisión clínica.':'The calculated impression integrates measurements, morphology, axis and optional clinical context. Review its evidence, alternatives and confidence before using it for a clinical decision.'}</p>}
    {Object.values(item.measurementOrigins??{}).includes('automatic')&&<p className="measurement-method-note">{language==='es'?'Estimaciones automáticas de la señal, sin validación clínica independiente. PR: inicio de P a inicio de QRS; QRS: duración del complejo; QT sin corrección por frecuencia: inicio de QRS a final de T por pendiente terminal. El eje usa el área neta del QRS en I y aVF. Confirma las medidas antes de usarlas clínicamente.':'Automatic signal estimates, without independent clinical validation. PR: P onset to QRS onset; QRS: complex duration; QT without rate correction: QRS onset to T end using the terminal slope. Axis uses net QRS area in I and aVF. Confirm measurements before clinical use.'}</p>}
      <RemoteAnalysis item={analysisItem} local={analysis} language={language}/>
      <TrainingStatus language={language}/>
    </details>
    {/* 5 · Informe */}
    <div className="report-download card"><label><input type="checkbox" checked={detailedReport} onChange={e=>setDetailedReport(e.target.checked)}/>{language==='es'?'Informe técnico ampliado: método, trazados completos y bibliografía completa':'Expanded technical report: methods, full tracings and complete bibliography'}</label>{externalEvidence?.text.trim()&&<label><input type="checkbox" checked={includeExternalEvidence} onChange={e=>setIncludeExternalEvidence(e.target.checked)}/>{language==='es'?'Incluir la respuesta pegada de OpenEvidence y sus referencias en esta descarga (origen no verificado).':'Include the pasted OpenEvidence response and references in this download (origin unverified).'}</label>}{context.freeText?.trim()&&<details><summary>{language==='es'?'Nota clínica en el PDF (opcional)':'Clinical note in PDF (optional)'}</summary><p>{context.freeText}</p><label><input type="checkbox" checked={includeReportNote} onChange={e=>setIncludeReportNote(e.target.checked)}/>{language==='es'?'Incluir esta nota en esta descarga. Revisa que no contenga identificadores.':'Include this note in this download. Check for identifiers.'}</label></details>}<button type="button" className="button button--primary" disabled={reportBusy||pythonState.status!=='ready'} onClick={download}>{reportBusy?(language==='es'?'Generando PDF…':'Generating PDF…'):(language==='es'?'Descargar informe PDF':'Download PDF report')}</button>{reportError&&<p role="status">{reportError}</p>}<span>{language==='es'?'PDF resumido por defecto: conclusión, medidas y ventanas representativas de las 12 derivaciones.':'Summary PDF by default: conclusion, measurements and representative windows of all 12 leads.'}</span></div>
  </>
}

function ExampleCard({item,select}:{item:ViewerCase;select:(item:ViewerCase)=>void}) {
  const {language,copy}=useLanguage()
  const analysis=useMemo(()=>analyzeCase({...item,measurementEngine:'python'}),[item])
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function report(){if(busy)return;setBusy(true);setError('');try{const measured=await measureCase(item);const result=analyzeCase(measured);const module=await import('./report/report');await module.downloadReport(measured,result,language);}catch{setError(language==='es'?'No se pudo generar el PDF. Abre el caso y vuelve a intentar.':'PDF could not be generated. Open the case and retry.');}finally{setBusy(false)}}
  return <article className="card library-case"><Origin item={item}/><Spark trace={item.traces.II}/><h2><Terms>{item.title?.[language]??analysis.findings.find(f=>f.id!=='rate-range'&&f.id!=='axis-normal')?.label[language]??(language==='es'?'ECG de ejemplo':'Sample ECG')}</Terms></h2><p>{language==='es'?'Al abrir el caso o descargar el informe, el motor Python calcula las medidas desde las señales.':'Opening the case or downloading its report calculates measurements from the signals with the Python engine.'}</p><p>{item.attribution?.[language]}</p><div className="example-actions"><button type="button" className="case-link" onClick={()=>select(item)}>{copy.viewCase} <Icon name="arrow"/></button><button type="button" className="button button--subtle" disabled={busy} onClick={report}>{busy?(language==='es'?'Generando…':'Generating…'):(language==='es'?'Descargar informe PDF':'Download PDF report')}</button></div>{error&&<p role="status">{error}</p>}</article>
}

function Library({ select,onWaveAnalyze }: { select: (item: ViewerCase) => void;onWaveAnalyze:(sample:WaveMavenSample)=>void }) {
  const { language, copy } = useLanguage()
  const { findings } = getEvidence(language)
  const [filter, setFilter] = useState<'all' | 'clinical' | 'simulation'>('all')
  const shown = catalog.filter(item => filter === 'all' || item.origin === filter)
  return <>
    <div className="page-heading"><div><h1>{ui[language].examples}</h1><p>{copy.libraryIntro}</p></div></div>
    <div className="library-toolbar"><div className="lead-controls" aria-label={copy.filter}>{(['all', 'clinical', 'simulation'] as const).map(key =>
      <button key={key} className={filter === key ? 'selected' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{copy.caseFilters[key]}</button>)}</div></div>
    <div className="library-grid">{shown.map(item=><ExampleCard key={item.id} item={item} select={select}/>)}</div>
    {!shown.length && <p className="empty">{copy.noCases}</p>}
    {filter!=='simulation'&&<Suspense fallback={<p role="status">{language==='es'?'Cargando Wave-Maven…':'Loading Wave-Maven…'}</p>}><WaveMavenLibrary language={language} onAnalyze={onWaveAnalyze}/></Suspense>}
  </>
}

const ClinicalLibrary=lazy(()=>import('./ecg/knowledge/ClinicalLibrary').then(m=>({default:m.ClinicalLibrary})))

function Sources() {
  const { language, copy } = useLanguage()
  const { sources } = getEvidence(language)
  return <><div className="page-heading"><div><h1>{copy.sources}</h1><p>{copy.sourcesIntro}</p></div></div>
    <Suspense fallback={<p>{language==='es'?'Cargando biblioteca…':'Loading library…'}</p>}><ClinicalLibrary language={language}/></Suspense>
    <div className="source-grid">{(['Medicina', 'Datos', 'Diseño', 'Consulta'] as const).map(kind => <section className="card source-card" key={kind}><h2>{copy.sourceKinds[kind]}</h2><SourceLinks ids={sources.filter(source => source.kind === kind).map(source => source.id)}/></section>)}</div>
  </>
}

function App() {
  const [language, setLanguage] = useState<Language>('es')
  const [termsEnabled, setTermsEnabled] = useState(true)
  const copy = strings[language]
  const [{page,item,intake,caseIntake,generation},dispatch]=useReducer(sessionReducer,initialSession)
  const [captureKey,setCaptureKey]=useState(0);
  const [pendingSample,setPendingSample]=useState<WaveMavenSample|null>(null),[captureSample,setCaptureSample]=useState<WaveMavenSample|null>(null);
  const viewerSnapshot=useRef<{key:string;state:ViewerSnapshot}|null>(null)
  const viewRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.documentElement.lang = language
    document.title = language === 'es' ? 'CardioEKG · Revisión guiada de ECG' : 'CardioEKG · Guided ECG Review'
    document.querySelector('meta[name="description"]')?.setAttribute('content', copy.description)
  }, [language, copy])

  function navigate(next: Page) {
    dispatch({type:'navigate',page:next})
    if(window.location.hash!==`#${next}`)window.history.pushState({cardioekg:true,page:next},'',`#${next}`)
    requestAnimationFrame(()=>{if(next!=='intake')viewRef.current?.focus({preventScroll:true});window.scrollTo(0,0)})
  }
  function openCase(selected:ViewerCase){dispatch({type:'open',item:selected});window.history.pushState({cardioekg:true,page:'viewer'},'','#viewer');window.scrollTo(0,0)}
  function discardCase(){if(!window.confirm(language==='es'?'¿Descartar el caso de esta sesión?':'Discard this session’s case?'))return;dispatch({type:'discard'});viewerSnapshot.current=null;setPendingSample(null);setCaptureSample(null);window.history.pushState({cardioekg:true,page:'home'},'','#home')}
  useEffect(()=>{
    const requested=pageFromHash(window.location.hash)
    const first=requested==='viewer'?'home':requested==='capture'?'intake':requested
    dispatch({type:'navigate',page:first})
    window.history.replaceState({cardioekg:true,page:first},'',`#${first}`)
    const back=()=>dispatch({type:'navigate',page:pageFromHash(window.location.hash)})
    window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back)
  },[])

  useEffect(()=>{if(!intake)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[intake]);
  return <LanguageContext.Provider value={language}><TermsEnabled.Provider value={termsEnabled}>
    <header className="topbar">
      <button className="brand" onClick={() => navigate('home')}><BrandLogo/></button>
      <nav className="header-nav" aria-label={copy.navigation}>
        <button type="button" aria-current={page === 'intake' || page === 'capture' ? 'step' : undefined} onClick={() => {setPendingSample(null);navigate('intake')}}>{ui[language].start}</button>
        <button type="button" aria-current={page === 'library' ? 'page' : undefined} onClick={() => navigate('library')}>{ui[language].examples}</button>
        {intake&&page!=='capture'&&<button type="button" className="resume-case" onClick={()=>navigate('capture')}>{language==='es'?'Volver a la captura':'Return to capture'}</button>}
        {item&&page!=='viewer'&&<button type="button" className="resume-case" onClick={()=>navigate('viewer')}>{language==='es'?'Volver al caso':'Return to case'}</button>}
      </nav>
      <div className="top-right">
        <button type="button" className="definition-toggle" role="switch" aria-label={ui[language].terms} aria-checked={termsEnabled} onClick={() => setTermsEnabled(value => !value)}>
          <Icon name="book"/><span>{ui[language].terms}</span><i aria-hidden="true"/>
        </button>
        <div className="language-control" role="group" aria-label={copy.language}>
          <button type="button" lang="es" aria-label="Español" aria-pressed={language === 'es'} onClick={() => setLanguage('es')}>ES</button>
          <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
        </div>
      </div>
    </header>
    <aside className="experimental-release" aria-label={language==='es'?'Estado experimental':'Experimental status'}><strong>v23.1 · Experimental</strong><span>{language==='es'?'Uso educativo. Medidas y hallazgos orientativos, sin validación clínica independiente.':'Educational use. Provisional measurements and findings, without independent clinical validation.'}</span></aside>
    <main className={page === 'home' ? 'landing-page' : 'content case-content'} ref={viewRef} tabIndex={-1}>
      {((page==='capture'&&intake&&intake.safety!=='clear')||(page==='viewer'&&item?.origin==='research'&&caseIntake&&caseIntake.safety!=='clear'))&&<SafetyReminder language={language}/>}
      {page === 'home' && <Landing clinical={researchEnabled} onStart={() => {setPendingSample(null);navigate('intake')}} onExample={() => navigate('library')}/>}
      {page==='intake'&&pendingSample&&<p className="card educational-reference">Wave-Maven · {pendingSample.reference.caseId}: {pendingSample.reference.context[language]}</p>}
      {page === 'intake' && <Intake language={language} onBack={() => navigate('home')} onComplete={answers => {if(intake&&!window.confirm(language==='es'?'¿Descartar la captura pendiente e iniciar otra?':'Discard the pending capture and start another?'))return;setCaptureSample(pendingSample);setPendingSample(null);setCaptureKey(k=>k+1);dispatch({type:'intake',value:answers}); navigate('capture') }}/>}
      {intake && <div style={{display:page==='capture'?'block':'none'}} aria-hidden={page!=='capture'}><Suspense fallback={<p role="status">{copy.loadingCapture}</p>}>
        <Capture key={captureKey} initialDocument={captureSample?.file} initialClinicalContext={captureSample?.clinicalContext} language={language} onConfirm={result => {const reference=captureSample?.reference;openCase({ ...result,id:reference?`wave-maven-${reference.caseId}-session`:'private-session',...(reference?{educationalReference:reference,title:reference.context,sourceUrl:reference.sourceUrl,attribution:{es:reference.attribution,en:reference.attribution}}:{})});setCaptureSample(null);}} onExit={() => {dispatch({type:'discard-capture'});setCaptureSample(null);setPendingSample(null);navigate('home')}}/>
      </Suspense></div>}
      {page === 'library' && <Library select={openCase} onWaveAnalyze={sample=>{setPendingSample(sample);navigate('intake')}}/>}
      {page === 'viewer' && item && <>
        {item.origin === 'research' && <button className="button button--subtle discard" onClick={discardCase}><Icon name="close"/> {language==='es'?'Descartar caso':'Discard case'}</button>}
        <Viewer key={generation + item.id} item={item} snapshot={viewerSnapshot.current?.key===`${generation}:${item.id}`?viewerSnapshot.current.state:undefined} onSnapshot={value=>{viewerSnapshot.current={key:`${generation}:${item.id}`,state:value}}} intake={caseIntake} openLibrary={() => navigate('library')}/>
      </>}
      {page === 'sources' && <Sources/>}
    </main>
    <footer className="site-footer"><BrandLogo/><button type="button" onClick={() => navigate('sources')}>{copy.sources}</button></footer>
  </TermsEnabled.Provider></LanguageContext.Provider>
}

createRoot(document.getElementById('root')!).render(<App/>)
