import {buildCompactReport} from './compactReport';
import {printableText} from './text';
import {referenceReviewLabel} from '../ecg/knowledge/referenceReview';
import {clinicalScope} from '../clinicalScope';
import {evidenceCitations} from '../integrations/evidenceNote';
import {representativeIntervals,representativeAmplitudes} from './visualMeasurements';
import type {ClinicalContext} from '../ecg/context';
import {jsPDF} from 'jspdf';
import type {ViewerCase,Lead,Trace} from '../cases';
import {leads} from '../cases';
import type {CaseAnalysis,Confidence,LeadAnalysis,Localized,MeasurementDetail} from '../ecg/analysisTypes';

type Language='es'|'en';
const labels={
 es:{title:'Informe de revisión guiada de ECG',education:'Uso educativo. No sustituye la valoración clínica.',summary:'Resumen del análisis',impression:'Impresión presuntiva',differential:'Alternativas que requieren correlación',confidence:'Confianza',reconstruction:'Reconstrucción',measurements:'Medidas y procedencia',findings:'Hallazgos',limitations:'Limitaciones',warnings:'Signos de alarma y avisos',leads:'Análisis de las 12 derivaciones',missing:'Sin señal disponible para esta derivación.',poor:'Calidad insuficiente para una interpretación fiable.',references:'Referencias clínicas y técnicas',provenance:'Registro y calibración',source:'Fuente',simultaneous:'Derivaciones simultáneas',sequential:'Ventanas sucesivas',unknown:'Temporalidad no confirmada',common:'Mismo registro',separate:'Procedencia común no confirmada',calibrated:'Calibración común confirmada',uncalibrated:'Calibración común no confirmada',recording:'Calibración impresa',display:'Escala en este informe',time:'Tiempo',duration:'Duración',boundary:'Límites de P/QRS y final de T estimados o revisados; el inicio de T puede no estar delimitado. Confirmar sobre la señal.',quality:'Calidad de reconstrucción',observations:'Observaciones',features:'Medidas de la derivación',method:'Método',reason:'Motivo',reviewed:'Revisado',version:'Versión del análisis',status:'Estado',notCalibrated:'no calibrada',notEvaluable:'no evaluable',low:'baja',moderate:'moderada',high:'alta',estimated:'estimado',manual:'corregido manualmente',notApplicable:'no aplicable',sourceValue:'valor de fuente',page:'Página',practice:clinicalScope.es,intervals:'PR / QRS / QT',rate:'Frecuencia cardíaca',pr:'Intervalo PR',qrs:'Duración del QRS',qt:'Intervalo QT sin corregir',axis:'Eje frontal del QRS',lead:'Derivación',allMissing:'No hay trazados evaluables en este informe.',axisContext:'Contexto del eje QRS',noFinding:'No se identificaron hallazgos suficientemente sustentados.',sourceLeads:'Derivaciones usadas',units:{rateBpm:'lpm',prMs:'ms',qrsMs:'ms',qtMs:'ms',axisDeg:'°'}},
 en:{title:'Guided ECG review report',education:'Educational use. Does not replace clinical assessment.',summary:'Analysis summary',impression:'Presumptive impression',differential:'Alternatives requiring clinical correlation',confidence:'Confidence',reconstruction:'Reconstruction',measurements:'Measurements and provenance',findings:'Findings',limitations:'Limitations',warnings:'Warning signs and alerts',leads:'Analysis of the 12 leads',missing:'No signal available for this lead.',poor:'Insufficient quality for reliable interpretation.',references:'Clinical and technical references',provenance:'Recording and calibration',source:'Source',simultaneous:'Simultaneous leads',sequential:'Sequential windows',unknown:'Timing not confirmed',common:'Same recording',separate:'Common recording not confirmed',calibrated:'Common calibration confirmed',uncalibrated:'Common calibration not confirmed',recording:'Printed calibration',display:'Display scale in this report',time:'Time',duration:'Duration',boundary:'Estimated or reviewed P/QRS boundaries and T offset; T onset may not be delineated. Verify on the signal.',quality:'Reconstruction quality',observations:'Observations',features:'Lead measurements',method:'Method',reason:'Reason',reviewed:'Reviewed',version:'Analysis version',status:'Status',notCalibrated:'uncalibrated',notEvaluable:'not evaluable',low:'low',moderate:'moderate',high:'high',estimated:'estimated',manual:'manually corrected',notApplicable:'not applicable',sourceValue:'source value',page:'Page',practice:clinicalScope.en,intervals:'PR / QRS / QT',rate:'Heart rate',pr:'PR interval',qrs:'QRS duration',qt:'Uncorrected QT interval',axis:'Frontal QRS axis',lead:'Lead',allMissing:'No evaluable tracings are available in this report.',axisContext:'QRS axis context',noFinding:'No sufficiently supported findings were identified.',sourceLeads:'Source leads',units:{rateBpm:'bpm',prMs:'ms',qrsMs:'ms',qtMs:'ms',axisDeg:'°'}},
};
const languageText=(value:Localized,language:Language)=>value[language];
/** Helvetica's WinAnsi encoding preserves Spanish accents; map unsupported technical glyphs explicitly. */
export {printableText} from './text';

function finite(value:number|null|undefined,digits=1){return value!==null&&value!==undefined&&Number.isFinite(value)?Number(value.toFixed(digits)).toString():'-';}
function confidenceText(confidence:Confidence,language:Language){const l=labels[language];const level=confidence.level==='not-evaluable'?l.notEvaluable:l[confidence.level];return `${level} · ${confidence.calibrated&&confidence.probability!==undefined&&Number.isFinite(confidence.probability)&&confidence.probability>=0&&confidence.probability<=1?`${Math.round(confidence.probability*100)}%` : confidence.calibrated?(language==='es'?'calibrada':'calibrated'):l.notCalibrated}`;}
const measurementName=(key:MeasurementDetail['key'],l:typeof labels[Language])=>({rateBpm:l.rate,prMs:l.pr,qrsMs:l.qrs,qtMs:l.qt,axisDeg:l.axis})[key];

export type ReportOptions={detailed?:boolean;includeFreeText?:boolean;includeExternalEvidence?:boolean};
export function buildReport(item:ViewerCase,analysis:CaseAnalysis,language:Language,options:ReportOptions={}):jsPDF {
 if(!options.detailed)return buildCompactReport(item,analysis,language,options);
 const l=labels[language],doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 doc.setProperties({title:`CardioEKG - ${l.title}`,subject:l.education,author:'CardioEKG',creator:`CardioEKG ${analysis.algorithmVersion}`,keywords:'ECG, CardioEKG, educational, analysis'});
 const margin=15,width=180,top=27,bottom=279;let y=top;
 const measurementWindows=analysis.measurements.flatMap(measurement=>(measurement.windows??[]).filter(window=>Number.isFinite(window.start)&&Number.isFinite(window.end)&&window.start>=0&&window.end>window.start).map(window=>({...window,key:measurement.key})));
 const windowText=(window:typeof measurementWindows[number])=>`${window.captureLead??window.lead}: ${finite(window.start,3)} - ${finite(window.end,3)} s (${finite((window.end-window.start)*1000,1)} ms) · ${window.source==='manual'?l.manual:l.estimated}`;
 const text=(value:string)=>printableText(value);
 function logo(){
  doc.setFont('helvetica','bold');doc.setFontSize(15);doc.setTextColor(57,28,35);doc.text('CardioE',margin,15);
  const x=margin+doc.getTextWidth('CardioE')+.2,base=8.8;
  // Same open K-QRS geometry as the public SVG identity, without image/network dependencies.
  doc.setDrawColor(173,23,55);doc.setLineWidth(.63);
  doc.line(x+.9,base+1.17,x+.9,base+6.21);
  const points=[[10,48],[20,48],[23,48],[25,42],[31,27],[38,60],[45,45],[69,15]];
  for(let i=1;i<points.length;i++)doc.line(x+points[i-1][0]*.09,base+points[i-1][1]*.09,x+points[i][0]*.09,base+points[i][1]*.09);
  doc.line(x+4.05,base+4.05,x+6.21,base+6.21);
  doc.setTextColor(57,28,35);doc.text('G',x+8,15);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(99,77,72);doc.text(text(l.title),195,14,{align:'right'});
  doc.setDrawColor(194,99,76);doc.setLineWidth(.3);doc.line(margin,20,195,20);
 }
 function ensure(height:number){if(y+height>bottom) {doc.addPage();y=top;logo();}}
 function paragraph(value:string,{size=9,bold=false,color=[65,46,42],gap=2,indent=0}:{size?:number;bold?:boolean;color?:number[];gap?:number;indent?:number}={}){
  if(!value.trim())return;
  doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(color[0],color[1],color[2]);
  const lines=doc.splitTextToSize(text(value),width-indent) as string[];
  const height=size*.3528*1.3;
  for(const line of lines){ensure(height+1);doc.text(line,margin+indent,y);y+=height;}
  y+=gap;
 }
 function heading(value:string){ensure(12);y+=3;paragraph(value,{size:12,bold:true,color:[121,40,31],gap:3});}
 function bullet(value:string){paragraph(`- ${value}`,{indent:2});}
 function confidenceBlock(title:string,confidence:Confidence){paragraph(`${title}: ${confidenceText(confidence,language)}`,{bold:true});paragraph(languageText(confidence.explanation,language),{size:8.5});}
 logo();
 paragraph(l.title,{size:19,bold:true,gap:3});
 paragraph(l.education,{size:9,bold:true,color:[145,43,31]});
 paragraph(l.practice,{size:8.5});
 paragraph(`${l.version}: ${analysis.algorithmVersion} · ${language==='es'?'Esquema':'Schema'} ${analysis.schemaVersion}`,{size:8});
 const context=(item as ViewerCase&{clinicalContext?:ClinicalContext}).clinicalContext;
 if(context&&Object.values(context).some(value=>Array.isArray(value)?value.length:typeof value==='string'?value.trim():value!==undefined)) {
  heading(language==='es'?'Contexto clínico aportado':'Provided clinical context');
  paragraph(language==='es'?'Información introducida por el usuario; no verificada automáticamente. Evita incluir identificadores de pacientes.':'User-entered information; not automatically verified. Avoid including patient identifiers.',{size:8});
  if(context.ageYears!==undefined&&Number.isFinite(context.ageYears))paragraph(`${language==='es'?'Edad':'Age'}: ${finite(context.ageYears)} ${language==='es'?'años':'years'}`,{size:8.5});
  const dictionaries={
   sexAtBirth:{female:['Femenino','Female'],male:['Masculino','Male'],other:['Otro','Other'],unspecified:['No especificado','Unspecified']},
   symptoms:{'chest-pain':['Dolor torácico','Chest pain'],dyspnea:['Disnea','Dyspnea'],syncope:['Síncope','Syncope'],palpitations:['Palpitaciones','Palpitations'],none:['Sin síntomas señalados','No symptoms indicated']},
   onset:{now:['En este momento','Current'],hours:['Horas','Hours'],days:['Días','Days'],unknown:['Desconocido','Unknown']},
   history:{cardiac:['Cardiopatía','Cardiac disease'],hypertension:['Hipertensión','Hypertension'],diabetes:['Diabetes','Diabetes'],'family-sudden-death':['Antecedente familiar de muerte súbita','Family history of sudden death'],none:['Sin antecedentes señalados','No history indicated']},
   medications:{'qt-prolonging':['Fármacos que prolongan QT','QT-prolonging drugs'],'av-nodal':['Fármacos que enlentecen conducción AV','AV-nodal slowing drugs'],digoxin:['Digoxina','Digoxin'],other:['Otros','Other'],none:['Sin fármacos señalados','No medication indicated']},
   electrolytes:{'known-abnormal':['Alteración conocida','Known abnormality'],normal:['Normales según el usuario','Normal according to user'],unknown:['Desconocidos','Unknown']},
   paced:{yes:['Sí','Yes'],no:['No','No'],unknown:['Desconocido','Unknown']},
  } as const;
  const fieldNames={sexAtBirth:['Sexo al nacer','Sex at birth'],symptoms:['Síntomas','Symptoms'],onset:['Inicio','Onset'],history:['Antecedentes','History'],medications:['Medicamentos','Medication'],electrolytes:['Electrolitos','Electrolytes'],paced:['Marcapasos','Pacemaker']} as const;
  for(const key of Object.keys(dictionaries) as (keyof typeof dictionaries)[]) {
   const value=context[key];if(value===undefined)continue;
   const dictionary=dictionaries[key] as Record<string,readonly [string,string]>,index=language==='es'?0:1;
   const values=(Array.isArray(value)?value:[value]).filter(v=>typeof v==='string'&&dictionary[v]).map(v=>dictionary[v][index]);
   if(values.length)paragraph(`${fieldNames[key][index]}: ${values.join(', ')}`,{size:8.5});
  }
  if(options.includeFreeText&&context.freeText?.trim()){
   const bounded=context.freeText.trim().slice(0,1000);
   paragraph(`${language==='es'?'Nota clínica del usuario':'User clinical note'}: ${bounded}${context.freeText.trim().length>1000?(language==='es'?' [texto truncado a 1000 caracteres]':' [text truncated to 1000 characters]'):''}`,{size:8.5});
  }
 }
 if(item.educationalReference){heading(language==='es'?'Diagnóstico de referencia de Wave-Maven':'Wave-Maven reference diagnosis');paragraph(item.educationalReference.diagnosis[language],{bold:true});paragraph(language==='es'?'Respuesta docente de la fuente; no es una predicción del algoritmo de CardioEKG.':'Source teaching answer; not a prediction from the CardioEKG algorithm.',{size:8.5});paragraph(item.educationalReference.attribution,{size:8});paragraph(item.educationalReference.sourceUrl,{size:8});}
 heading(l.impression);paragraph(languageText(analysis.impression,language),{size:11,bold:true});confidenceBlock(l.confidence,analysis.confidence);
 if(analysis.presumptive){
  // Presumptive diagnosis from the literature knowledge base, with criteria, next step and what could not be excluded.
  const es=language==='es',p=analysis.presumptive;
  heading(es?'Diagnóstico presuntivo (algoritmo basado en la literatura)':'Presumptive diagnosis (literature-based algorithm)');
  paragraph(p.summary[language],{size:10,bold:true});
  for(const e of [p.primary,...p.concurrent].filter((x):x is NonNullable<typeof x>=>!!x).slice(0,6)){
   paragraph(`${e.name[language]} · ${es?'evidencia':'evidence'} ${({strong:es?'fuerte':'strong',moderate:es?'moderada':'moderate',weak:es?'débil':'weak'})[e.strength]}`,{size:9.5,bold:true});
   for(const c of e.met.slice(0,4))bullet(c[language]);
   if(e.nextSteps)bullet(`${es?'Siguiente paso':'Next step'}: ${e.nextSteps[language]}`);
  }
  if(p.differentials.length)paragraph(`${es?'Diferencial':'Differential'}: ${p.differentials.slice(0,5).map(e=>e.name[language]).join('; ')}`,{size:9});
  if(p.cannotExclude.length)paragraph(`${es?'No descartables con estos datos':'Not excludable with these data'}: ${p.cannotExclude.slice(0,6).map(e=>e.name[language]).join('; ')}`,{size:9});
  paragraph(es?'Fuerza de la evidencia relativa, no probabilidad calibrada. Base de conocimiento '+p.knowledgeVersion+'.':'Relative evidence strength, not a calibrated probability. Knowledge base '+p.knowledgeVersion+'.',{size:8});
 }
 if(analysis.preexcitation){
  const p=analysis.preexcitation,es=language==='es';
  heading(es?'Activación inicial del QRS y preexcitación':'Initial QRS activation and preexcitation');
  paragraph(`${es?'Evidencia multiderivación':'Multilead evidence'}: ${p.status} · ${p.supportingLeads.join(', ')||'—'}`,{size:9,bold:true});
  paragraph(es?'Candidatos de onda delta, no localización de vía ni confirmación de síndrome. Evidencia cualitativa sin calibración clínica independiente.':'Delta-wave candidates, not pathway localization or syndrome confirmation. Qualitative evidence without independent clinical calibration.',{size:8.5});
  for(const [lead,d] of Object.entries(p.leads)){if(!d)continue;paragraph(`${lead}: ${d.status} · ${finite(d.durationMs,1)} ms · ${es?'polaridad':'polarity'} ${d.polarity??'—'} · ${d.repeatableBeats}/${d.analyzedBeats} ${es?'latidos con apoyo':'supported beats'}`,{size:8});}
  for(const warning of p.limitations)bullet(warning);
 }
 if(analysis.systematic&&analysis.systematic.level!=='insufficient'){
  // Systematic reading: every statement with its status, so the PDF shows what met criteria and what could not be evaluated.
  heading(language==='es'?'Lectura sistemática':'Systematic reading');
  const statusName={meets:language==='es'?'cumple criterios':'meets criteria',suggests:language==='es'?'sugiere':'suggests',normal:'normal','not-evaluable':language==='es'?'no evaluable':'not evaluable',context:language==='es'?'contexto':'context'} as const;
  for(const section of analysis.systematic.sections){paragraph(section.title[language],{size:9.5,bold:true});for(const statement of section.statements)bullet(`[${statusName[statement.status]}] ${statement.text[language]}`);}
 }
 if(analysis.differential.length){heading(l.differential);for(const value of analysis.differential)bullet(languageText(value,language));}
 if(analysis.warnings.length){heading(l.warnings);for(const value of analysis.warnings)bullet(languageText(value,language));}
 paragraph(languageText(analysis.clinicalUse,language),{size:8.5,bold:true});
 heading(l.measurements);
 for(const m of analysis.measurements){
  const status=m.status==='not-applicable'?l.notApplicable:m.status==='not-evaluable'?l.notEvaluable:m.status==='manual'?l.manual:m.status==='source'?l.sourceValue:l.estimated;
  ensure(24);paragraph(`${measurementName(m.key,l)}: ${m.value===null?status:finite(m.value,1)+' '+l.units[m.key]} · ${status}`,{size:10,bold:true});
  paragraph(`${l.confidence}: ${confidenceText(m.confidence,language)}${m.sourceLeads.length?` · ${l.sourceLeads}: ${m.sourceLeads.join(', ')}`:''}`,{size:8});
  paragraph(`${l.method}: ${languageText(m.method,language)}`,{size:8});
  if(m.uncertainty&&Number.isFinite(m.uncertainty.lower)&&Number.isFinite(m.uncertainty.upper))paragraph(`${language==='es'?'Intervalo de incertidumbre':'Uncertainty interval'}: ${finite(m.uncertainty.lower)} - ${finite(m.uncertainty.upper)} ${l.units[m.key]}`,{size:8});
  if(m.reason[language])paragraph(`${l.reason}: ${m.reason[language]}`,{size:8});
  for(const window of measurementWindows.filter(w=>w.key===m.key))paragraph(`${language==='es'?'Límites utilizados':'Boundaries used'}: ${windowText(window)}`,{size:8,color:window.source==='manual'?[110,45,151]:[90,90,90]});
 }
 paragraph(`${l.axisContext}: ${analysis.axisContext[language]}`,{size:8.5});
 heading(l.provenance);
 const p=item.captureProvenance;
 if(p){
  paragraph(`${p.commonRecording?l.common:l.separate} · ${p.commonCalibration?l.calibrated:l.uncalibrated}`,{size:8.5});
  paragraph(`${p.timing==='simultaneous'?l.simultaneous:p.timing==='sequential'?l.sequential:l.unknown}${p.layout?` · ${text(p.layout)}`:''}`,{size:8.5});
  if(p.speed||p.gain)paragraph(`${l.recording}: ${p.speed?finite(p.speed)+' mm/s':'-'} · ${p.gain?finite(p.gain)+' mm/mV':'-'}`,{size:8.5});
 } else paragraph(item.synchronized?l.simultaneous:l.unknown,{size:8.5});
 if(item.attribution?.[language])paragraph(`${l.source}: ${item.attribution[language]}`,{size:8});
 if(item.sourceUrl)paragraph(item.sourceUrl,{size:7.5});
 if(item.licenseUrl)paragraph(item.licenseUrl,{size:7.5});
 confidenceBlock(l.reconstruction,analysis.reconstructionConfidence);
 if(analysis.findings.length){heading(l.findings);for(const f of analysis.findings){ensure(22);paragraph(`${f.label[language]} · ${confidenceText(f.confidence,language)}`,{bold:true});for(const e of f.evidence)bullet(e[language]);for(const value of f.limitations)paragraph(value[language],{size:8});if(f.referenceIds.length)paragraph(`[${f.referenceIds.join(', ')}]`,{size:8});}}
 if(analysis.limitations.length){heading(l.limitations);for(const value of analysis.limitations)bullet(value[language]);}
 heading(l.leads);paragraph(l.boundary,{size:8.5});
 paragraph(language==='es'?'Las llaves PR/QRS/QT muestran medidas locales de un complejo representativo de cada tira; pueden diferir de la duración multiderivación o la máxima local. Las correcciones manuales tienen prioridad. R, S y ST se marcan respecto de un segmento pre-QRS medido, no de una línea de base supuesta.':'PR/QRS/QT brackets show local measurements of one representative complex per strip; they may differ from the multilead duration or maximum local duration. Manual corrections take priority. R, S and ST are marked relative to a measured pre-QRS segment, not an assumed baseline.',{size:8});
 if(measurementWindows.length)paragraph(language==='es'?'Marcas moradas: límites manuales de las medidas corregidas. Marcas grises: límites automáticos de medidas. Los límites exactos se detallan junto a cada derivación.':'Purple marks: manual boundaries of corrected measurements. Gray marks: automatic measurement boundaries. Exact limits are listed with each lead.',{size:8});
 const allTraces=[...Object.values(item.traces),item.rhythmTrace].filter((t):t is Trace=>!!t&&t.mv.every(Number.isFinite));
 const peak=Math.max(0,...allTraces.map(t=>t.mv.reduce((a,v)=>Math.max(a,Math.abs(v)),0)));
 let commonGain=10;while(commonGain*peak>85)commonGain/=2;
 paragraph(`${l.display}: 25 mm/s · ${commonGain} mm/mV (${language==='es'?'ganancia común para todas las derivaciones':'common gain for every lead'})`,{size:8.5});
 const phaseColors={p:[96,117,161],qrs:[170,61,39],t:[50,125,104]} as const;
 function chart(trace:Trace,detail:LeadAnalysis|undefined,lead:Lead,captureLead:Lead|'II-long'=lead){
  if(!Number.isFinite(trace.seconds)||trace.seconds<=0||trace.mv.length<2||!trace.mv.every(Number.isFinite)){paragraph(l.poor,{size:9});return;}
  if(trace.recordingCalibration)paragraph(`${l.recording}: ${trace.recordingCalibration.speed} mm/s · ${trace.recordingCalibration.gain} mm/mV · ${language==='es'?'calibración declarada, no verificada automáticamente':'declared calibration, not automatically verified'}`,{size:8});
  const sampleRate=trace.mv.length/trace.seconds,mmPerSecond=25;
  const max=trace.mv.reduce((a,v)=>Math.max(a,Math.abs(v)),0);if(max>100){paragraph(l.poor,{size:9});return;}const gain=commonGain;
  const height=Math.max(34,Math.ceil(max*gain*2+8)),windowSeconds=6.8;
  for(let from=0;from<trace.seconds-1e-6;from+=windowSeconds){
   const duration=Math.min(windowSeconds,trace.seconds-from),chartWidth=duration*mmPerSecond;
   const markers=detail?.markers??item.markersByLead?.[lead]??item.markers??[];
   const visual=representativeIntervals(markers,measurementWindows,lead,from,from+duration,captureLead);
   const amplitudes=representativeAmplitudes(trace,visual.qrs);
   const annotationHeight=visual.intervals.length?12:0;
   const previousPage=doc.getCurrentPageInfo().pageNumber;ensure(height+13+annotationHeight+7);
   if(doc.getCurrentPageInfo().pageNumber!==previousPage)paragraph(`${l.lead} ${lead} (${language==='es'?'continuación':'continued'})`,{size:10,bold:true});
   const annotationY=y+1,atY=annotationY+annotationHeight,base=atY+height/2;
   const intervalNames={prMs:'PR',qrsMs:'QRS',qtMs:'QT'};
   doc.setLineDashPattern([],0);doc.setFont('helvetica','normal');doc.setFontSize(6.2);
   for(const interval of visual.intervals){
    const lane=interval.key==='prMs'?0:interval.key==='qrsMs'?1:2,bracketY=annotationY+3+lane*3.4;
    const x1=margin+(Math.max(from,interval.start)-from)*mmPerSecond,x2=margin+(Math.min(from+duration,interval.end)-from)*mmPerSecond;
    const c=interval.source==='manual'?[110,45,151]:[55,83,115];doc.setDrawColor(c[0],c[1],c[2]);doc.setTextColor(c[0],c[1],c[2]);doc.setLineWidth(.2);
    doc.line(x1,bracketY,x2,bracketY);doc.line(x1,bracketY-1,x1,bracketY+1);doc.line(x2,bracketY-1,x2,bracketY+1);
    const value=`${intervalNames[interval.key]} ${interval.source==='manual'?'manual':'local'} ${finite((interval.end-interval.start)*1000,1)} ms`;
    const textWidth=doc.getTextWidth(value),x=Math.max(margin,Math.min(margin+chartWidth-textWidth,(x1+x2-textWidth)/2));doc.text(text(value),x,bracketY-.5);
   }
   doc.setDrawColor(243,227,221);doc.setLineWidth(.08);
   for(let x=0;x<=chartWidth+.001;x+=1)doc.line(margin+x,atY,margin+x,atY+height);
   for(let dy=0;dy<=height;dy+=1)doc.line(margin,atY+dy,margin+chartWidth,atY+dy);
   doc.setDrawColor(224,186,174);doc.setLineWidth(.15);
   for(let x=0;x<=chartWidth+.001;x+=5)doc.line(margin+x,atY,margin+x,atY+height);
   for(let dy=height/2;dy<=height;dy+=5)doc.line(margin,atY+dy,margin+chartWidth,atY+dy);
   for(let dy=height/2-5;dy>=0;dy-=5)doc.line(margin,atY+dy,margin+chartWidth,atY+dy);
   for(const marker of markers){
    if(!Number.isFinite(marker.start)||!Number.isFinite(marker.end)||marker.end<=marker.start||marker.end<from||marker.start>from+duration)continue;
    const c=phaseColors[marker.phase];doc.setDrawColor(c[0],c[1],c[2]);doc.setTextColor(c[0],c[1],c[2]);doc.setLineDashPattern([.5,.6],0);doc.setLineWidth(.15);
    for(const time of [marker.start,marker.end])if(time>=from&&time<=from+duration)doc.line(margin+(time-from)*mmPerSecond,atY+3,margin+(time-from)*mmPerSecond,atY+height-1);
    if(marker.start>=from&&marker.start<=from+duration){doc.setFontSize(5.5);doc.text(marker.phase.toUpperCase(),margin+(marker.start-from)*mmPerSecond+.2,atY+2.4);}
   }
   const delta=detail?.features.deltaEvidence;
   for(const window of delta?.windows??[]){
    if(!Number.isFinite(window.start)||!Number.isFinite(window.end)||window.end<=window.start||window.end<from||window.start>from+duration)continue;
    const left=margin+(Math.max(from,window.start)-from)*mmPerSecond,right=margin+(Math.min(from+duration,window.end)-from)*mmPerSecond;
    doc.setDrawColor(117,52,169);doc.setTextColor(117,52,169);doc.setLineWidth(.3);doc.setLineDashPattern([.4,.4],0);
    for(const x of [left,right])doc.line(x,atY+3,x,atY+height-1);
    doc.line(left,atY+3,right,atY+3);doc.setFontSize(5.5);doc.text(language==='es'?'delta candidata':'delta candidate',left+.2,atY+5.4);
   }
   // Measurement windows are independent of the automatic P/QRS/T phase markers.
   // A manual correction must remain visible even when phase annotations were not changed.
   for(const window of measurementWindows.filter(w=>w.lead===lead&&(w.captureLead??w.lead)===captureLead&&w.end>=from&&w.start<=from+duration)) {
    const color=window.source==='manual'?[110,45,151]:[100,100,100];
    doc.setDrawColor(color[0],color[1],color[2]);doc.setLineWidth(.22);doc.setLineDashPattern(window.source==='manual'?[1.2,.5]:[.3,.7],0);
    for(const time of [window.start,window.end])if(time>=from&&time<=from+duration) {
     const x=margin+(time-from)*mmPerSecond;doc.line(x,atY+1,x,atY+height-1);doc.line(x-.6,atY+1,x+.6,atY+1);doc.line(x-.6,atY+height-1,x+.6,atY+height-1);
    }
   }
   doc.setLineDashPattern([],0);doc.setDrawColor(123,42,34);doc.setLineWidth(.25);
   const first=Math.max(0,Math.floor(from*sampleRate)),last=Math.min(trace.mv.length-1,Math.ceil((from+duration)*sampleRate)),stride=Math.max(1,Math.floor((last-first)/1800));
   let prev=first;for(let i=first+stride;i<=last;i+=stride){const x1=margin+(prev/sampleRate-from)*mmPerSecond,x2=margin+(i/sampleRate-from)*mmPerSecond;doc.line(x1,base-trace.mv[prev]*gain,x2,base-trace.mv[i]*gain);prev=i;}
   if(amplitudes&&visual.qrs){
    const baselineY=base-amplitudes.baselineMv*gain,baselineFrom=Math.max(from,visual.qrs.start-.065),baselineTo=Math.min(from+duration,visual.qrs.end+.10);
    doc.setDrawColor(95,95,95);doc.setLineDashPattern([.4,.5],0);doc.setLineWidth(.12);doc.line(margin+(baselineFrom-from)*mmPerSecond,baselineY,margin+(baselineTo-from)*mmPerSecond,baselineY);doc.setLineDashPattern([],0);
    const points=[['R',amplitudes.r,detail?.features.rMv],['Q/S',amplitudes.s,detail?.features.sMv],['ST',amplitudes.st,detail?.features.stMv]] as const;
    for(const [name,point,feature] of points){
     if(!point||feature===null||feature===undefined||point.time<from||point.time>from+duration)continue;
     const x=margin+(point.time-from)*mmPerSecond,pointY=base-point.mv*gain,c=name==='ST'?[27,112,101]:[30,84,139];
     doc.setDrawColor(c[0],c[1],c[2]);doc.setFillColor(c[0],c[1],c[2]);doc.setTextColor(c[0],c[1],c[2]);doc.setLineWidth(.22);
     doc.line(x+.6,baselineY,x+.6,pointY);doc.line(x+.15,baselineY,x+1.05,baselineY);doc.line(x+.15,pointY,x+1.05,pointY);doc.circle(x,pointY,.28,'F');doc.setFontSize(6.2);doc.text(name,x+1.4,Math.max(atY+3,Math.min(atY+height-1,pointY-.7)));
    }
   }
   doc.setTextColor(90,69,63);doc.setFontSize(7);doc.text(`${finite(from,2)} s`,margin,atY+height+3);doc.text(`${finite(from+duration,2)} s`,margin+chartWidth,atY+height+3,{align:'right'});
   y=atY+height+7;
   if(visual.intervals.length)paragraph(`${language==='es'?'Complejo representativo':'Representative complex'}: ${visual.intervals.map(interval=>`${intervalNames[interval.key]} ${interval.source==='manual'?'manual':'local'} ${finite((interval.end-interval.start)*1000,1)} ms`).join(' · ')}`,{size:7.5});
   if(amplitudes){const values=[amplitudes.r&&detail?.features.rMv!=null?`R ${finite(amplitudes.r.amplitude,3)} mV`:null,amplitudes.s&&detail?.features.sMv!=null?`Q/S ${finite(amplitudes.s.amplitude,3)} mV`:null,amplitudes.st&&detail?.features.stMv!=null?`ST(J+60) ${finite(amplitudes.st.amplitude,3)} mV`:null].filter(Boolean);if(values.length)paragraph(`${language==='es'?'Amplitudes locales':'Local amplitudes'}: ${values.join(' · ')} · ${language==='es'?'referencia pre-QRS':'pre-QRS reference'} ${finite(amplitudes.baselineMv,3)} mV`,{size:7.5});}

  }
  paragraph(`${l.display}: 25 mm/s · ${finite(gain,4)} mm/mV · ${l.duration}: ${finite(trace.seconds,2)} s · ${language==='es'?'Muestreo de la señal':'Signal sampling'}: ${finite(sampleRate,2)} Hz`,{size:7.5});
 }
 for(const lead of leads){
  const detail=analysis.leads.find(d=>d.lead===lead),trace=item.traces[lead];
  const valid=trace&&trace.mv.length>1&&trace.mv.every(Number.isFinite);
  ensure(valid?62:22);heading(`${l.lead} ${lead}`);
  if(detail)paragraph(detail.summary[language],{size:8.5});
  if(!trace||detail?.status==='missing'){paragraph(l.missing,{size:9});continue;}
  if(detail?.status==='poor-quality')paragraph(l.poor,{size:9,bold:true});
  chart(trace,detail,lead);
  for(const window of measurementWindows.filter(w=>w.lead===lead))paragraph(`${measurementName(window.key,l)} · ${windowText(window)}`,{size:8,color:window.source==='manual'?[110,45,151]:[90,90,90]});
  if(detail){
   if(detail.quality!==null&&Number.isFinite(detail.quality))paragraph(`${l.quality}: ${finite(detail.quality,3)} (${language==='es'?'índice técnico, no probabilidad diagnóstica':'technical index, not a diagnostic probability'})`,{size:7.5});
   const f=detail.features;paragraph(`${l.features}: QRS ${finite(f.qrsMs)} ms · ${language==='es'?'área neta QRS':'net QRS area'} ${finite(f.netQrsMvMs,2)} mV·ms · ST ${finite(f.stMv,3)} mV · R ${finite(f.rMv,3)} mV · S ${finite(f.sMv,3)} mV · T ${finite(f.tMv,3)} mV`,{size:7.5});
   for(const value of detail.observations)paragraph(value[language],{size:8});
   paragraph(`${l.confidence}: ${confidenceText(detail.confidence,language)}. ${detail.confidence.explanation[language]}`,{size:8});
   if(detail.referenceIds.length)paragraph(`[${detail.referenceIds.join(', ')}]`,{size:7.5});
  }
 }
 if(item.rhythmTrace){heading(language==='es'?'Tira larga de II':'Long lead II strip');chart(item.rhythmTrace,analysis.rhythmAnalysis,'II','II-long');}
 if(options.includeExternalEvidence&&item.externalEvidence?.text.trim()){heading(language==='es'?'Respuesta de OpenEvidence pegada por el usuario':'OpenEvidence response pasted by the user');paragraph(language==='es'?'Origen y exactitud no verificados automáticamente. Esta sección no fue generada ni obtenida por la API de CardioEKG.':'Origin and accuracy not automatically verified. This section was not generated or fetched by a CardioEKG API.',{size:8.5,bold:true});paragraph(item.externalEvidence.text.slice(0,8000));for(const url of evidenceCitations(item.externalEvidence))paragraph(url,{size:8});}
 heading(l.references);
 for(const reference of analysis.references){ensure(16);paragraph(`[${reference.id}] ${reference.name}`,{size:8.5,bold:true});paragraph(reference.url,{size:7.5});paragraph(`${l.reviewed}: ${reference.reviewedAt} · ${referenceReviewLabel(reference.verificationLevel,language)}`,{size:7.5});if(reference.locator)paragraph(reference.locator,{size:7});if(reference.population)paragraph(`${language==='es'?'Población/alcance':'Population/scope'}: ${reference.population}`,{size:7});}
 const pages=doc.getNumberOfPages();
 for(let page=1;page<=pages;page++){
  doc.setPage(page);doc.setDrawColor(213,186,173);doc.setLineWidth(.2);doc.line(margin,284,195,284);doc.setTextColor(109,87,79);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text(text(l.education),margin,289);doc.text(`${l.page} ${page} / ${pages}`,195,289,{align:'right'});
 }
 return doc;
}

export function reportBytes(item:ViewerCase,analysis:CaseAnalysis,language:Language,options:ReportOptions={}):Uint8Array {
 return new Uint8Array(buildReport(item,analysis,language,options).output('arraybuffer'));
}

/** All content is generated locally. The file never contains the case ID or file-source hashes. */
export async function downloadReport(item:ViewerCase,analysis:CaseAnalysis,language:Language,options:ReportOptions={}):Promise<void> {
 const bytes=reportBytes(item,analysis,language,options);
 const blob=new Blob([bytes as BlobPart],{type:'application/pdf'}),url=URL.createObjectURL(blob);
 try {
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`CardioEKG-${language==='es'?'informe':'report'}${options.detailed?(language==='es'?'-tecnico':'-technical'):''}.pdf`;anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();
 } finally {setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
