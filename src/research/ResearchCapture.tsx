import {PreexcitationPanel} from '../ecg/PreexcitationPanel';
import {usePythonAnalysis} from '../ecg/usePythonAnalysis';
import {emptyPythonEstimate} from '../ecg/pythonState';
import {PythonStatus} from '../ecg/PythonStatus';
import {ClinicalDisclaimer} from '../ClinicalDisclaimer';
import {ClinicalContextForm} from '../ecg/ClinicalContextForm';
import type {ClinicalContext} from '../ecg/context';
import {firstReviewLead,reviewLeadOrder} from './reviewOrder';
import {assessComparability} from '../ecg/provenance';
import {analyzeCase} from '../ecg/analyze';
import {AnalysisPanel} from '../ecg/AnalysisPanel';
import type {CaptureProvenance} from '../cases';
import {measurementReason,withManualMeasurements} from '../ecg/estimate';
import type {MeasurementReasons} from '../ecg/estimate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { leads, quantile } from './digitize';
import type { CaptureLead, Lead, Measurements, Pattern, Trace } from './digitize';
import { PhotoInput, PhotoTrace, TraceScale, leadName } from './PhotoInput';
import { runWorker } from './photo';
import type { AcceptedPhoto } from './photo';
import type { ApprovedModel } from './protocol';
import { ResearchError, researchMessage, researchText } from './locale';
import type { ResearchLanguage, ResearchMessage } from './locale';
import type { Marker } from '../cases';
import './research.css';
import {PaperCalibration} from './PaperCalibration';
import {isScaleProblem} from './sharedScale';
import { BatchPreview } from './BatchPreview';
import { reconstructSheet } from './batch';
import type { BatchFailure } from './batch';
import { SheetReview } from './SheetReview';
import { SheetInput } from './SheetInput';
import type { SheetSource } from './SheetInput';

export interface ResearchCase {
  measurementImage?:File;
  pattern: Pattern;
  algorithmFindings?:import('./modelDecisions').ModelLabel[];
  clinicalContext?:ClinicalContext;
  captureProvenance?:CaptureProvenance;
  measurementEngine?:'python';
  pythonAnalysis?:import('../ecg/pythonAnalysis').PythonAnalysis;
  measurements: Measurements;
  traces: Partial<Record<Lead, Trace>>;
  rhythmLead: 'II' | null;
  origin: 'research';
  findingOrigin: 'manual' | 'algorithm';
  synchronized: false;
  measurementWindows?:Partial<Record<keyof Measurements,{lead:Lead;captureLead?:Lead|'II-long';start:number;end:number}[]>>;
  measurementReasons?: MeasurementReasons;
  automaticMarkers?: boolean;
  measurementOrigins: Partial<Record<keyof Measurements, 'automatic' | 'caliper'>>;
  segmentLabel: string;
  rhythmTrace?:Trace;
  rhythmStrip?: 'long' | 'short';
  markersByLead?: Partial<Record<Lead, Marker[]>>;
}

const patterns = ['sinus', 'af', 'rbbb', 'lbbb', 'indeterminate'] as const satisfies readonly Pattern[];

const sequence: CaptureLead[] = [...leads, 'II-long'];
type Photos = Partial<Record<CaptureLead, AcceptedPhoto>>;
type MarkKind = 'pr' | 'qrs' | 'qt' | 'axisI' | 'axisAvf';
type Window = { lead: CaptureLead; start: number | null; end: number | null };
type MarkState = Partial<Record<MarkKind, Window>>;

function validWindow(window: Window | undefined, photos: Photos) {
  if (!window || window.start === null || window.end === null || window.end <= window.start) return false;
  return window.start >= 0 && window.end <= (photos[window.lead]?.result.seconds ?? 0) * 1000;
}

function Calipers({
  photos, marks, setMarks, compatibleBeats, setCompatibleBeats, language, hideComparison=false,
}: {
  initialClinicalContext?:ClinicalContext;
  photos: Photos;
  marks: MarkState;
  setMarks: (value: MarkState) => void;
  hideComparison?:boolean;
  compatibleBeats: boolean;
  setCompatibleBeats: (value: boolean) => void;
  language: ResearchLanguage;
}) {
  const copy = researchText[language];
  const tools = {
    pr: { name: 'PR', instruction: copy.markPr },
    qrs: { name: 'QRS', instruction: copy.markQrs },
    qt: { name: 'QT', instruction: copy.markQt },
    axisI: { name: copy.qrsI, instruction: copy.markI },
    axisAvf: { name: copy.qrsAvf, instruction: copy.markAvf },
  };
  const [kind, setKind] = useState<MarkKind>('pr');
  const [point, setPoint] = useState<'start' | 'end'>('start');
  const defaultLead: CaptureLead = kind === 'axisI' ? 'I' : kind === 'axisAvf' ? 'aVF' : 'II';
  const current = marks[kind] ?? { lead: defaultLead, start: null, end: null };
  const photo = photos[current.lead];
  if (!photo) return null;
  const endOfTrace = Math.floor(photo.result.seconds * 1000);
  const hasIssue = current.start !== null && current.end !== null && !validWindow(current, photos);
  const marker = (mark: number | null) => mark !== null && mark <= endOfTrace && mark >= 0
    ? `${(mark / endOfTrace) * 100}%`
    : null;

  return <details className="ecg-r-calipers">
    <summary>{copy.calipers}</summary>
    <div className="ecg-r-fields">
      <label>{copy.measurement}
        <select value={kind} onChange={(event) => {
          setKind(event.target.value as MarkKind);
          setPoint('start');
        }}>
          {Object.entries(tools).map(([value, tool]) => <option value={value} key={value}>{tool.name}</option>)}
        </select>
      </label>
      <label>{copy.lead}
        <select value={current.lead} disabled={kind === 'axisI' || kind === 'axisAvf'} onChange={(event) => {
          setMarks({ ...marks, [kind]: { lead: event.target.value as CaptureLead, start: null, end: null } });
          setPoint('start');
        }}>
          {sequence.filter((lead) => photos[lead]).map((lead) =>
            <option key={lead} value={lead}>{leadName(lead, language)}</option>)}
        </select>
      </label>
    </div>
    <p>{tools[kind].instruction} {copy.enterTime}</p>
    <PhotoTrace photo={photo} language={language}>
      {(['start', 'end'] as const).map((edge) => {
        const position = marker(current[edge]);
        return position && <span aria-hidden="true" key={edge} className={`ecg-r-mark is-${edge}`}
          style={{ left: position }} />;
      })}
      <button type="button" tabIndex={-1} className="ecg-r-caliper-surface"
        aria-label={point === 'start' ? copy.markStart : copy.markEnd}
        onClick={(event) => {
          if (event.detail === 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const value = Math.round((event.clientX - rect.left) / rect.width * endOfTrace);
          setMarks({ ...marks, [kind]: { ...current, [point]: Math.max(0, Math.min(endOfTrace, value)) } });
          setPoint(point === 'start' ? 'end' : 'start');
        }} />
    </PhotoTrace>
    <div className="ecg-r-fields">
      {(['start', 'end'] as const).map((edge) =>
        <label key={edge}>{edge === 'start' ? copy.start : copy.end} (ms)
          <input type="number" min="0" max={endOfTrace} step="1" value={current[edge] ?? ''} onChange={(event) => {
            const value = event.target.valueAsNumber;
            setMarks({ ...marks, [kind]: { ...current, [edge]: Number.isFinite(value) ? value : null } });
          }} />
        </label>)}
    </div>
    {hasIssue && <p className="ecg-r-error" role="status">{copy.intervalIssue}</p>}
    {!hideComparison&&<label className="ecg-r-check">
      <input type="checkbox" checked={compatibleBeats} onChange={(event) => setCompatibleBeats(event.target.checked)} />
      {copy.verifyAxis}
    </label>}
  </details>;
}

function plainTrace({ result }: AcceptedPhoto): Trace {
  return { mv: result.mv, seconds: result.seconds, quality: result.quality,recordingCalibration:{speed:result.speed,gain:result.gain,gainSource:'user-declared'} };
}

function Review({
  photos, approvedModel, onBack, onConfirm, language, sheet,initialClinicalContext,
}: {
  sheet?:SheetSource|null;
  initialClinicalContext?:ClinicalContext;
  photos: Photos;
  approvedModel?: ApprovedModel;
  onBack: () => void;
  onConfirm: (result: ResearchCase) => void;
  language: ResearchLanguage;
}) {
  const copy = researchText[language];
  const [lead, setLead] = useState<CaptureLead>(()=>firstReviewLead(photos));
  const [context,setContext]=useState<ClinicalContext>(initialClinicalContext??{});
  const [pattern, setPattern] = useState<Pattern>('indeterminate');
  const [algorithmFindings,setAlgorithmFindings]=useState<import('./modelDecisions').ModelLabel[]>([]);
  const [origin, setOrigin] = useState<ResearchCase['findingOrigin']>('manual');
  const [marks, setMarks] = useState<MarkState>({});
  const [compatibleBeats, setCompatibleBeats] = useState(false);
  const [layoutConfirmed, setLayoutConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [modelStatus, setModelStatus] = useState<{ pattern: Pattern } | { error: ResearchMessage } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const reviewedTraces=useMemo(()=>{const traces:Partial<Record<Lead,Trace>>={};for(const name of leads)if(photos[name])traces[name]=plainTrace(photos[name]!);return traces;},[photos]);
  const provenance=useMemo<CaptureProvenance>(()=>{
    const pair=[photos.I,photos.aVF];const commonRecording=!!sheet&&pair.every((p,index)=>p?.fingerprint===`${sheet.fingerprint}:${index===0?'I':'aVF'}`);
    const speed=pair[0]?.result.speed,gain=pair[0]?.result.gain;
    return {commonRecording,commonCalibration:pair.every(p=>!!p&&p.result.speed===speed&&p.result.gain===gain),speed,gain,layout:sheet?.layout??'individual',timing:commonRecording?'sequential':'unknown',userConfirmedComparable:compatibleBeats};
  },[photos,sheet,compatibleBeats]);
  const measurementWindows=useMemo<NonNullable<ResearchCase['measurementWindows']>>(()=>{
    const windows:NonNullable<ResearchCase['measurementWindows']>={};
    for(const [kind,key] of [['pr','prMs'],['qrs','qrsMs'],['qt','qtMs'],['axisI','axisDeg'],['axisAvf','axisDeg']] as const){const w=marks[kind];if(w&&validWindow(w,photos)){const lead=w.lead==='II-long'?'II':w.lead;windows[key]=[...(windows[key]??[]),{lead,captureLead:w.lead,start:w.start!/1000,end:w.end!/1000}];}}
    return windows;
  },[marks,photos]);
  const rhythmTrace=useMemo(()=>photos['II-long']?plainTrace(photos['II-long']):undefined,[photos]);
  const pythonState=usePythonAnalysis({traces:reviewedTraces,rhythmTrace,rhythmLead:'II',synchronized:false,captureProvenance:provenance,measurementWindows});
  const automatic=useMemo(()=>{const result=structuredClone(pythonState.result?.estimate??emptyPythonEstimate());if(pythonState.result?.rhythmEstimate){result.measurements.rateBpm=pythonState.result.rhythmEstimate.measurements.rateBpm;result.reasons.rateBpm=pythonState.result.rhythmEstimate.reasons.rateBpm;}return result;},[pythonState.result]);
  const comparison=useMemo(()=>assessComparability(reviewedTraces,provenance,false,pythonState.result?.estimate.leadDetails??null),[reviewedTraces,provenance,pythonState.result]);
  const {measurements,origins:computedOrigins}=withManualMeasurements(automatic.measurements,pythonState.result?.manualMeasurements??{});
  const previewAnalysis=useMemo(()=>analyzeCase({measurementEngine:'python',pythonAnalysis:pythonState.result,rhythmTrace,traces:reviewedTraces,measurements,origin:'research',findingOrigin:origin,pattern,synchronized:false,rhythmLead:'II',clinicalContext:context,measurementOrigins:computedOrigins,measurementWindows,captureProvenance:provenance,markersByLead:automatic.markersByLead,automaticMarkers:true}),[reviewedTraces,rhythmTrace,pythonState.result,origin,pattern,provenance,context,measurementWindows]);
  const fields: [keyof Measurements, string, string][] = [
    ['rateBpm', copy.rate, copy.bpm], ['prMs', 'PR', 'ms'], ['qrsMs', 'QRS', 'ms'],
    ['qtMs', 'QT', 'ms'], ['axisDeg', copy.axis, '°'],
  ];
  const current = photos[lead];
  const rhythmPhoto = photos['II-long'];
  const modelEligible = approvedModel && rhythmPhoto?.result && rhythmPhoto.result.quality >= 0.8
    && Math.abs(rhythmPhoto.result.seconds - 10) <= 0.2
    && leads.every((item) => {
      const trace = photos[item]?.result;
      return trace && trace.quality >= 0.8 && Math.abs(trace.seconds - 2.5) <= 0.05;
    });

  async function estimatePattern() {
    if (!approvedModel || !rhythmPhoto || !modelEligible || !layoutConfirmed || working) return;
    const activeController = new AbortController();
    controller.current = activeController;
    setWorking(true);
    setModelStatus(null);
    try {
      const response = await runWorker({
        kind: 'model', model: approvedModel, leadII: plainTrace(rhythmPhoto),
        segments: leads.map((item) => plainTrace(photos[item]!)),
      }, activeController.signal);
      if (response.kind !== 'model') {
        throw new ResearchError(response.kind === 'error' ? response.code : 'modelFailed');
      }
      setPattern(response.pattern);setAlgorithmFindings(response.findings);
      setOrigin('algorithm');
      setModelStatus({ pattern: response.pattern });
    } catch (caught) {
      if (!activeController.signal.aborted) {
        setModelStatus({ error: caught instanceof ResearchError ? caught.code : 'modelFailed' });
      }
    } finally {
      if (!activeController.signal.aborted) setWorking(false);
    }
  }

  function confirm() {
    if (working || pythonState.status!=='ready') return;
    const traces: ResearchCase['traces'] = {};
    for (const item of leads) traces[item] = plainTrace(photos[item]!);

    const measurementOrigins=computedOrigins;
    const qrs = marks.qrs;
    const markersByLead: ResearchCase['markersByLead'] = {...automatic.markersByLead};
    if (qrs && validWindow(qrs, photos) && qrs.lead !== 'II-long') {
      const traceLead = qrs.lead;
      markersByLead[traceLead] = [{ start: qrs.start! / 1000, end: qrs.end! / 1000, phase: 'qrs' }];
    }
    const measurementWindows:ResearchCase['measurementWindows']={};
    for(const [kind,key] of [['pr','prMs'],['qrs','qrsMs'],['qt','qtMs'],['axisI','axisDeg'],['axisAvf','axisDeg']] as const){const w=marks[kind];if(w&&validWindow(w,photos)){const lead=w.lead==='II-long'?'II':w.lead;measurementWindows[key]=[...(measurementWindows[key]??[]),{lead,captureLead:w.lead,start:w.start!/1000,end:w.end!/1000}];}}
    onConfirm({
      measurementEngine:'python',pythonAnalysis:pythonState.result,measurementImage:sheet?.file,algorithmFindings:origin==='algorithm'?algorithmFindings:undefined,rhythmTrace:rhythmPhoto?plainTrace(rhythmPhoto):undefined,clinicalContext:context,measurementWindows,pattern, measurements, traces,captureProvenance:provenance, findingOrigin: origin, rhythmLead: 'II',
      origin: 'research', synchronized: false, measurementOrigins,measurementReasons:automatic.reasons,automaticMarkers:true,
      markersByLead, segmentLabel: rhythmPhoto ? copy.longStrip : copy.shortStrip,
      rhythmStrip: rhythmPhoto ? 'long' : 'short',
    });
  }

  return <section className="ecg-r-review" aria-labelledby="ecg-r-review-title">
    <div className="ecg-r-section-heading">
      <div>
        <h2 id="ecg-r-review-title">{copy.review}</h2>
        <p>{copy.reviewInstructions}</p>
      </div>
    </div>
    <PythonStatus state={pythonState} language={language}/>
    <label className="ecg-r-select">{copy.viewLead}
      <select value={lead} onChange={(event) => setLead(event.target.value as CaptureLead)}>
        {reviewLeadOrder(photos).map((item) =>
          <option key={item} value={item}>{leadName(item, language)}</option>)}
      </select>
    </label>
    {current && <><PhotoTrace photo={current} language={language} /><TraceScale trace={current.result} language={language} /></>}
    <dl className="ecg-r-measures">
      {fields.map(([key, label, unit]) => <div key={key}>
        <dt>{label}</dt>
        <dd>{measurements[key]===null?(key==='prMs'&&automatic.reasons.prMs==='af'?(language==='es'?'No aplicable':'Not applicable'):copy.undetermined):`${new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(measurements[key]!)} ${unit}`}<small>{measurements[key]===null?measurementReason(automatic.reasons[key],language):computedOrigins[key]==='caliper'?(language==='es'?'Medición manual':'Manual measurement'):(language==='es'?'Estimación automática · verificar':'Automatic estimate · verify')}</small></dd>
      </div>)}
    </dl>
    <p className="ecg-r-muted">{language==='es'?'El motor Python calcula las medidas desde la señal calibrada. Comprueba los límites con el compás; las correcciones se calculan con el mismo motor. La etiqueta diagnóstica no modifica las medidas.':'The Python engine calculates measurements from the calibrated signal. Check boundaries with the calipers; corrections are calculated with the same engine. Diagnostic labels do not change measurements.'}</p>
    {measurements.rateBpm === null && <p className="ecg-r-muted">
      {copy.rateInstructions}
    </p>}
    <div className="axis-comparison" role="status"><strong>{language==='es'?'Eje QRS · procedencia':'QRS axis · provenance'}</strong><p>{comparison.reason[language]}</p>{comparison.requiresConfirmation&&<label className="ecg-r-check"><input type="checkbox" checked={compatibleBeats} onChange={e=>setCompatibleBeats(e.target.checked)}/>{copy.verifyAxis}</label>}</div>
    <ClinicalContextForm value={context} onChange={setContext} language={language}/>
    {pythonState.status==='ready'&&previewAnalysis.preexcitation?.status==='supported'&&<PreexcitationPanel review={previewAnalysis.preexcitation} prMs={measurements.prMs} language={language}/>}
    {pythonState.status==='ready'&&<AnalysisPanel analysis={previewAnalysis} language={language} compact/>}
    <Calipers hideComparison={true} language={language} photos={photos} marks={marks} setMarks={setMarks}
      compatibleBeats={compatibleBeats} setCompatibleBeats={setCompatibleBeats} />

    {approvedModel && <section className="ecg-r-model" aria-label={copy.institutionalModel}>
      {modelEligible ? <>
        <label className="ecg-r-check">
          <input type="checkbox" checked={layoutConfirmed} disabled={working}
            onChange={(event) => setLayoutConfirmed(event.target.checked)} />
          {copy.confirmLayout}
        </label>
        <button className="ecg-r-secondary" type="button" disabled={!layoutConfirmed || working} onClick={estimatePattern}>
          {working ? copy.estimating : copy.estimate}
        </button>
      </> : <p className="ecg-r-muted">{copy.requiredSegments}</p>}
      {modelStatus && <p role="status">{'error' in modelStatus ? researchMessage(modelStatus.error, language)
        : modelStatus.pattern === 'indeterminate' ? copy.abstained
          : `${copy.experimental} · ${copy[modelStatus.pattern]}. ${copy.canCorrect}`}</p>}
    </section>}

    <label className="ecg-r-select">{copy.reviewedFinding}
      <select value={pattern} disabled={working} onChange={(event) => {
        setPattern(event.target.value as Pattern);
        setOrigin('manual');
        setModelStatus(null);
      }}>
        {patterns.map(value => <option key={value} value={value}>{value==='indeterminate'?(language==='es'?'Usar interpretación calculada':'Use calculated interpretation'):copy[value]}</option>)}
      </select>
    </label>
    <p className="ecg-r-muted">{origin === 'algorithm' ? copy.modelOrigin : copy.manualOrigin}</p>
    <p className="ecg-r-muted">{language==='es'?'Al confirmar, indicas que revisaste los trazados, las medidas disponibles y los hallazgos.':'By confirming, you indicate that you reviewed the tracings, available measurements and findings.'}</p>
    <div className="ecg-r-actions">
      <button className="ecg-r-secondary" type="button" disabled={working} onClick={onBack}>{copy.editPhotos}</button>
      <button className="ecg-r-primary" type="button" disabled={working || pythonState.status!=='ready'} onClick={confirm}>{language==='es'?'Confirmar revisión y abrir visor':'Confirm review and open viewer'}</button>
    </div>
  </section>;
}

export function ResearchCapture({
  onConfirm, onExit, approvedModel, initialDocument,initialClinicalContext,language = 'es',
}: {
  onConfirm: (result: ResearchCase) => void;
  onExit: () => void;
  initialDocument?:File;initialClinicalContext?:ClinicalContext;
  approvedModel?: ApprovedModel;
  language?: ResearchLanguage;
}) {
  const copy = researchText[language];
  const [photos, setPhotos] = useState<Photos>({});
  const [sheet, setSheet] = useState<SheetSource | null>(null);
  const [active, setActive] = useState<CaptureLead>('I');
  const [reviewing, setReviewing] = useState(false);
  const [batch,setBatch]=useState<{running:boolean;done:number;total:number;failures:Partial<Record<CaptureLead,BatchFailure>>}|null>(null);
  const [calibrationOpen,setCalibrationOpen]=useState(false);
  const [calibrationResume,setCalibrationResume]=useState(false);
  const [repair,setRepair]=useState<CaptureLead|null>(null);
  const repairPanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(repair){repairPanel.current?.focus({preventScroll:true});repairPanel.current?.scrollIntoView({block:'start'});}},[repair]);
  const batchController=useRef<AbortController|null>(null);
  useEffect(()=>()=>batchController.current?.abort(),[]);
  const completed = leads.filter((lead) => photos[lead]).length;
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (reviewing) heading.current?.focus();
  }, [reviewing]);

  async function startBatch(source:SheetSource) {
    batchController.current?.abort();
    const control=new AbortController();batchController.current=control;
    const selected:CaptureLead[]=source.includeLong?[...leads,'II-long']:[...leads];
    const crops=Object.fromEntries(selected.map(lead=>[lead,source.crops[lead]]));
    const retained:Photos={};
    for(const lead of selected) {
      const photo=photos[lead];
      if(photo&&JSON.stringify(photo.sourceCrop)===JSON.stringify(source.crops[lead])&&photo.result.speed===(source.calibrationByLead?.[lead]?.speed??source.speed)&&photo.result.gain===(source.calibrationByLead?.[lead]?.gain??source.gain))retained[lead]=photo;
    }
    setPhotos(retained);setSheet({...source,stage:'capture'});setRepair(null);
    setBatch({running:true,done:0,total:selected.length,failures:{}});
    let automaticGrid=source.automaticGrid;
    if(!source.gridReference&&!automaticGrid) {
      try {const response=await runWorker({kind:'paper-grid',photo:source.file,paper:source.paper??{left:0,right:100,top:0,bottom:100}},control.signal);
        if(control.signal.aborted)return;
        if(response.kind==='paper-grid'&&response.reference){automaticGrid=response.reference;setSheet(previous=>previous?{...previous,automaticGrid}:previous);}
      }catch{if(control.signal.aborted)return;}
    }
    const errors:Partial<Record<CaptureLead,BatchFailure>>={};
    await reconstructSheet({file:source.file,fingerprint:source.fingerprint,crops,speed:source.speed,gain:source.gain,calibrationByLead:source.calibrationByLead,reference:source.gridReference,automaticReference:automaticGrid},retained,control.signal,runWorker,(result,done,total)=>{
      if(control.signal.aborted)return;
      if(result.status==='failed')errors[result.lead]=result.failure;
      if(result.status==='ready')setPhotos(previous=>({...previous,[result.lead]:result.photo}));
      else setPhotos(previous=>({...previous,[result.lead]:undefined}));
      setBatch(previous=>({running:true,done,total,failures:result.status==='failed'?{...previous?.failures,[result.lead]:result.failure}:{...previous?.failures}}));
    });
    if(!control.signal.aborted){setBatch(previous=>previous?{...previous,running:false}:null);const first=selected.find(lead=>errors[lead]&&!isScaleProblem(errors[lead]!.code));if(first){setActive(first);setRepair(first);}}
  }

  function accept(photo: AcceptedPhoto) {
    if (sheet && photo.sourceCrop) {
      const changed = JSON.stringify(photo.sourceCrop) !== JSON.stringify(sheet.crops[active]);
      setSheet({ ...sheet,calibrationByLead:{...sheet.calibrationByLead,[active]:{speed:photo.result.speed,gain:photo.result.gain}},crops:{ ...sheet.crops,[active]:photo.sourceCrop },confirmed:{ ...sheet.confirmed,[active]:true },
        evidence:changed?{ ...sheet.evidence,[active]:{ method:'manual' } }:sheet.evidence,revision:sheet.revision+(changed?1:0) });
    }
    const nextPhotos = { ...photos, [active]: photo };
    setPhotos(nextPhotos);
    if(batch) {
      const failures={...batch.failures};delete failures[active];setBatch({...batch,failures});
      const next=sequence.find(lead=>failures[lead]);setRepair(next??null);if(next)setActive(next);return;
    }
    if (active === 'II-long') return;
    const nextLead = leads.find((item) => !nextPhotos[item]) ?? 'II-long';
    setActive(nextLead);
  }

  function discard() {
    if((Object.keys(photos).length||sheet)&&!window.confirm(language==='es'?'¿Descartar esta captura?':'Discard this capture?'))return;
    batchController.current?.abort();
    setPhotos({});
    onExit();
  }

  return <section className="ecg-r-shell" aria-labelledby="ecg-r-heading">
    <header className="ecg-r-header">
      <div>
        <p className="ecg-r-kicker">{language === 'es' ? 'Revisión de un ECG' : 'ECG review'}</p>
        <h1 id="ecg-r-heading" tabIndex={-1} ref={heading}>{reviewing ? copy.validateCase : batch ? (language==='es'?'Revisa todos los trazados':'Review all tracings') : sheet ? (language==='es'?'Confirma el mapa del ECG':'Confirm the ECG map') : copy.photograph}</h1>
        <p>{batch ? (language==='es'?'Los trazados correctos se conservan. Solo se solicita corregir los que fallan; después puedes revisar el caso completo.':'Successful traces are retained. Only failures need correction; then review the complete case.') : copy.captureInstructions}</p>
      </div>
      <button className="ecg-r-quiet" type="button" onClick={discard}>{copy.discard}</button>
    </header>
    <ClinicalDisclaimer language={language}/>
    {reviewing
      ? <Review initialClinicalContext={initialClinicalContext} sheet={sheet} language={language} photos={photos} approvedModel={approvedModel} onBack={() => setReviewing(false)} onConfirm={(result) => {
        setPhotos({});
        onConfirm(result);
      }} />
      : <>
        <section className="ecg-r-progress" aria-label={copy.captureProgress}>
          <div aria-live="polite"><strong>{language === 'es' ? `${completed} de 12 derivaciones` : `${completed} of 12 leads`}</strong><span>{photos['II-long'] ? copy.readyStrip : copy.optionalStrip}</span></div>
          <progress max={12} value={completed} aria-label={copy.acceptedLeads} />
        </section>
        {!batch?.running && <SheetInput initialDocument={initialDocument} language={language} source={sheet} onChange={next => {
          batchController.current?.abort();setRepair(null);
          if (!next || next.fingerprint !== sheet?.fingerprint) { setPhotos({});setBatch(null);setActive('I');setCalibrationOpen(false);setCalibrationResume(false); }
          setSheet(next);
          if (next && sheet && next.fingerprint === sheet.fingerprint) setPhotos(previous => {
            const updated = { ...previous };
            if(!next.includeLong)delete updated['II-long'];
            for (const lead of sequence) if (JSON.stringify(next.crops[lead]) !== JSON.stringify(sheet.crops[lead])) delete updated[lead];
            return updated;
          });
        }} />}
        {calibrationOpen&&sheet?<PaperCalibration key={sheet.fingerprint} source={sheet} language={language} onCancel={()=>setCalibrationOpen(false)} onSave={reference=>{const updated={...sheet,gridReference:reference};setCalibrationOpen(false);setSheet(updated);if(calibrationResume)void startBatch(updated);}}/>:sheet?.stage === 'regions' ? <SheetReview source={sheet} language={language} active={active} onSelect={setActive} onCalibrate={()=>{setCalibrationResume(false);setCalibrationOpen(true);}} onReconstruct={startBatch} onChange={next => {
          setSheet(next);
          setPhotos(previous => {
            const updated={...previous};
            if(!next.includeLong)delete updated['II-long'];
            for (const lead of sequence) if (JSON.stringify(next.crops[lead]) !== JSON.stringify(sheet.crops[lead])) delete updated[lead];
            return updated;
          });
        }} /> : <>
        {sheet && <button type="button" className="ecg-r-secondary" onClick={() => {batchController.current?.abort();setBatch(previous=>previous?{...previous,running:false}:null);setRepair(null);setSheet({...sheet,stage:'regions'});}}>{language==='es'?'Volver al mapa de derivaciones':'Back to lead map'}</button>}
        {batch&&sheet ? <>
          <BatchPreview photos={photos} failures={batch.failures} running={batch.running} done={batch.done} total={batch.total} includeLong={sheet.includeLong} language={language} onCalibrate={()=>{setRepair(null);setCalibrationResume(true);setCalibrationOpen(true);}} onEdit={lead=>{setActive(lead);setRepair(lead);}}/>
          {sheet.includeLong&&batch.failures['II-long']&&!batch.running&&<button type="button" className="ecg-r-secondary" onClick={()=>{setSheet({...sheet,includeLong:false});setPhotos(previous=>({...previous,'II-long':undefined}));setBatch({...batch,failures:{...batch.failures,'II-long':undefined}});if(repair==='II-long')setRepair(null);}}>{language==='es'?'Omitir la tira larga opcional':'Omit optional long strip'}</button>}
        </> : <nav className="ecg-r-leads" aria-label={copy.leads}>
          {sequence.map((lead) => <button key={lead} type="button" aria-pressed={active === lead}
            aria-label={`${leadName(lead, language)}${photos[lead] ? `, ${copy.accepted}` : ''}`} onClick={() => setActive(lead)}>
            {leadName(lead, language)} {photos[lead] && <span aria-hidden="true">✓</span>}
          </button>)}
        </nav>}
        {(!batch||repair)&&<div ref={repairPanel} tabIndex={-1} className="ecg-repair-panel">{batch?.failures[active]&&<p className="ecg-r-error" role="alert">{researchMessage(batch.failures[active]!.code,language)}</p>}<PhotoInput key={`${active}:${sheet?.revision ?? 0}`} sheet={sheet ? { file: sheet.file, fingerprint: sheet.fingerprint, crop: sheet.crops[active],speed:sheet.speed,gain:sheet.gain,reference:sheet.gridReference,automaticReference:sheet.automaticGrid } : undefined} language={language} initialDraft={batch?.failures[active]?.draft} lead={active} current={photos[active]}
          fingerprints={sequence.filter((item) => item !== active).flatMap((item) => photos[item]?.fingerprint ?? [])}
          onAccept={accept} onRemove={() => setPhotos({ ...photos, [active]: undefined })} /></div>}
        {repair&&<button type="button" className="ecg-r-quiet" onClick={()=>setRepair(null)}>{language==='es'?'Volver a todos los trazados':'Back to all tracings'}</button>}
        </>}
        <div className="ecg-r-actions ecg-r-footer">
          <button className="ecg-r-primary" type="button" disabled={sheet?.stage==='regions' || completed !== 12 || !!batch?.running || calibrationOpen || (!!sheet?.includeLong&&!photos['II-long'])}
            onClick={() => setReviewing(true)}>{copy.review}</button>
        </div>
      </>}
  </section>;
}
