import {jsPDF} from 'jspdf';
import {leads} from '../cases';
import type {ViewerCase,Lead,Trace} from '../cases';
import type {CaseAnalysis,LeadAnalysis} from '../ecg/analysisTypes';
import type {ReportOptions} from './report';
import {clinicalText} from '../ecg/presentation';
import {clinicalContextSummary} from '../ecg/context';
import {evidenceCitations} from '../integrations/evidenceNote';
import {representativeIntervals,representativeAmplitudes} from './visualMeasurements';
import type {MeasurementWindow} from './visualMeasurements';
import {printableText} from './text';

type Language='es'|'en';
const unique=(values:string[])=>[...new Set(values.map(s=>s.trim()).filter(Boolean))];
export function buildCompactReport(item:ViewerCase,a:CaseAnalysis,language:Language,options:ReportOptions={}) {
 const es=language==='es',doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 const tx=(s:string)=>printableText(s),n=(v:number|null|undefined,d=0)=>v!=null&&Number.isFinite(v)?new Intl.NumberFormat(language,{maximumFractionDigits:d,useGrouping:false}).format(Number(v.toFixed(d))||0):'—';
 const polarity=(value:string|null|undefined)=>es?({positive:'positiva',negative:'negativa',mixed:'mixta'} as Record<string,string>)[value??'']??'—':value??'—';
 const title=es?'Informe de resultados del ECG':'ECG results report',education=es?'Uso educativo. No sustituye la valoración clínica.':'Educational use. Does not replace clinical assessment.';
 doc.setProperties({title:`CardioEKG - ${title}`,author:'CardioEKG',creator:`CardioEKG ${a.algorithmVersion} · report-compact-1`});
 let y=29;const left=15,right=195,bottom=279;
 function header(){
  doc.setTextColor(54,29,39);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('CardioE',left,15);
  const x=left+doc.getTextWidth('CardioE')+.2,b=8.8;doc.setDrawColor(173,23,55);doc.setLineWidth(.63);doc.line(x+.9,b+1.17,x+.9,b+6.21);
  const points=[[10,48],[20,48],[23,48],[25,42],[31,27],[38,60],[45,45],[69,15]];
  for(let i=1;i<points.length;i++)doc.line(x+points[i-1][0]*.09,b+points[i-1][1]*.09,x+points[i][0]*.09,b+points[i][1]*.09);
  doc.line(x+4.05,b+4.05,x+6.21,b+6.21);doc.text('G',x+8,15);
  doc.setDrawColor(180,42,60);doc.setLineWidth(.7);doc.line(15,20,195,20);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text(tx(title),195,14,{align:'right'});
 }
 function page(){doc.addPage();header();y=29;}
 function room(h:number){if(y+h>bottom)page();}
 function lines(s:string,w=180,size=9){doc.setFontSize(size);return doc.splitTextToSize(tx(s),w) as string[];}
 function paragraph(s:string,size=9,bold=false,color=[58,43,43]){if(!s.trim())return;doc.setFont('helvetica',bold?'bold':'normal');doc.setTextColor(...color as [number,number,number]);const text=lines(s,180,size);for(const line of text){room(size*.46+1);doc.text(line,left,y);y+=size*.46;}y+=2;}
 function heading(s:string){room(14);y+=2;paragraph(s,11,true,[133,35,50]);}
 function label(s:string){paragraph(s,8,false,[100,80,80]);}
 const windows:MeasurementWindow[]=a.measurements.flatMap(m=>(m.windows??[]).filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=0&&w.end>w.start).map(w=>({...w,key:m.key})));
 header();paragraph(title,18,true);
 heading(es?'Impresión presuntiva':'Presumptive impression');
 const conclusion=clinicalText((a.systematic&&a.systematic.level!=='insufficient'?a.systematic.conclusion:a.impression)[language])
  .replace(/\s*\((?:FC|HR) [^)]*\)/g,'');
 paragraph(conclusion,10.5,true);
 const p=a.presumptive?.primary;
 const alreadyNamed=p&&(conclusion.toLowerCase().includes(p.name[language].toLowerCase())||a.systematic?.diagnoses.some(d=>p.name[language].toLowerCase().includes(d[language].toLowerCase()))||p.id==='wpw-pattern'&&/WPW/.test(conclusion));
 if(p&&!alreadyNamed)paragraph(`${es?'Hipótesis del algoritmo':'Algorithm hypothesis'}: ${p.name[language]} (${p.status==='met'?(es?'criterios cumplidos':'criteria met'):(es?'requiere confirmación':'needs confirmation')}).`,9);
 const confidence={low:es?'baja':'low',moderate:es?'moderada':'moderate',high:es?'alta':'high','not-evaluable':es?'no evaluable':'not evaluable'}[a.confidence.level];
 label(`${es?'Confianza':'Confidence'}: ${confidence} · ${a.confidence.calibrated&&a.confidence.probability!=null&&Number.isFinite(a.confidence.probability)&&a.confidence.probability>=0&&a.confidence.probability<=1?`${n(a.confidence.probability*100)}%`:(es?'no calibrada':'uncalibrated')}`);
 const limited=a.leads.filter(d=>d.status!=='evaluated').map(d=>d.lead);
 label(`${es?'Derivaciones evaluables':'Evaluable leads'}: ${a.leads.filter(d=>d.status==='evaluated').length}/12${limited.length?` · ${es?'revisar':'review'}: ${limited.join(', ')}`:''}`);
 if(item.origin==='research'&&a.reconstructionConfidence.level==='low')label(es?'Reconstrucción de baja confianza: comprobar fotografías y calibración.':'Low-confidence reconstruction: check photographs and calibration.');
 for(const warning of unique(a.warnings.map(w=>clinicalText(w[language]))))paragraph(warning,8.5,true,[145,39,35]);

 heading(es?'Medidas principales':'Key measurements');
 const names={rateBpm:es?'Frecuencia cardíaca':'Heart rate',prMs:es?'Intervalo PR':'PR interval',qrsMs:es?'Duración del QRS':'QRS duration',qtMs:es?'Intervalo QT':'QT interval',axisDeg:es?'Eje frontal del QRS':'Frontal QRS axis'};
 const units={rateBpm:es?'lpm':'bpm',prMs:'ms',qrsMs:'ms',qtMs:'ms',axisDeg:'°'};
 for(const m of a.measurements){
  const status=m.status==='manual'?(es?'Corrección manual':'Manually corrected'):m.status==='not-applicable'?(es?'No aplicable':'Not applicable'):m.status==='not-evaluable'?(es?'No evaluable':'Not evaluable'):m.status==='source'?(es?'Fuente':'Source'):(es?'Estimación':'Estimate');
  room(9);doc.setFillColor(250,244,241);doc.rect(left,y-4,180,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(58,43,43);
  doc.text(tx(`${names[m.key]}: ${m.value==null?status:n(m.value)+' '+units[m.key]}`),left+2,y+1);
  const source=m.sourceLeads.length>3?`${m.sourceLeads.length} ${es?'derivaciones':'leads'}`:m.sourceLeads.join(', ');
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(tx(`${status}${source?' · '+source:''}`),right-2,y+1,{align:'right'});y+=8;
  if(m.value==null&&m.reason[language])label(clinicalText(m.reason[language]));
  if(m.uncertainty)label(`${es?'Incertidumbre':'Uncertainty'}: ${n(m.uncertainty.lower)}–${n(m.uncertainty.upper)} ${units[m.key]}`);
 }
 if(a.systematic?.qtcMs!=null)label(`QTc (Fridericia): ${n(a.systematic.qtcMs)} ms`);
 label(es?'Valores redondeados para lectura; los criterios utilizan las medidas originales.':'Values rounded for reading; criteria use the original measurements.');
 if(!item.synchronized&&a.measurements.some(m=>m.key==='axisDeg'&&m.value!==null))label(a.axisContext[language]);
 // Exact manual fiducials are audit data, not clinical prose: retain millisecond precision once.
 for(const m of a.measurements){const manual=windows.filter(w=>w.key===m.key&&w.source==='manual');if(manual.length)label(`${names[m.key]} · ${es?'límites manuales':'manual boundaries'}: ${manual.map(w=>`${w.captureLead??w.lead} ${n(w.start,3)}–${n(w.end,3)} s`).join('; ')}`);}
 const context=clinicalContextSummary(item.clinicalContext,language).filter(s=>!/(sin indicar|unspecified|no se conoce|unknown)/i.test(s));
 if(context.length){heading(es?'Contexto clínico aportado':'Provided clinical context');paragraph(context.join(' · '),8.5);}
 if(options.includeFreeText&&item.clinicalContext?.freeText?.trim())paragraph(`${es?'Nota del usuario':'User note'}: ${item.clinicalContext.freeText.trim().slice(0,1000)}${item.clinicalContext.freeText.length>1000?' […]':''}`,8.5);
 const findings=p?.id==='normal-sinus-rhythm'?[]:p?.status==='met'?unique(p.met.slice(0,3).map(c=>clinicalText(c[language]))):unique(a.findings.filter(f=>!f.urgent&&f.category!=='quality'&&!f.id.startsWith('reviewed-')&&!['rate-range','axis-normal'].includes(f.id)).map(f=>clinicalText(f.label[language]))).filter(s=>!conclusion.toLowerCase().includes(s.toLowerCase()));
 if(findings.length){heading(es?'Hallazgos que sustentan la impresión':'Supporting findings');paragraph(findings.slice(0,3).join(' · '),9);}
 if(p?.nextSteps&&p.urgency!=='routine')paragraph(`${es?'Siguiente paso orientativo':'Provisional next step'}: ${p.nextSteps[language]}`,8.5);
 const alternatives=unique(a.differential.slice(0,2).map(d=>clinicalText(d[language])));
 if(alternatives.length){heading(es?'Alternativas y comprobaciones':'Alternatives and checks');paragraph(alternatives.join('; '),8.5);}
 paragraph(es?'Revisión experimental de ECG de adultos, sin validación clínica independiente; puede contener errores y no debe ser la única base de un tratamiento. Usa ejemplos simulados o públicos autorizados, sin identificadores. Los registros de pacientes requieren validación y autorización institucional.':'Experimental adult ECG review without independent clinical validation; errors are possible and it must not be the sole basis for treatment. Use simulated or authorized public examples without identifiers. Patient records require validation and institutional authorization.',7.5);

 page();heading(es?'Trazados y análisis por derivación':'Tracings and analysis by lead');
 paragraph(es?'Ventanas representativas, no todo el registro. P/QRS/T y llaves PR/QRS/QT: límites estimados; morado: corrección manual. Las medidas locales pueden diferir del resumen multiderivación.':'Representative windows, not the entire recording. P/QRS/T and PR/QRS/QT brackets: estimated boundaries; purple: manual correction. Local measurements may differ from the multilead summary.',8);
 const all=[...Object.values(item.traces),item.rhythmTrace].filter((t):t is Trace=>!!t&&t.seconds>0&&t.mv.length>1&&t.mv.every(v=>Number.isFinite(v)&&Math.abs(v)<=100));
 const peak=Math.max(0,...all.map(t=>t.mv.reduce((p,v)=>Math.max(p,Math.abs(v)),0)));let gain=10;while(peak*gain>70)gain/=2;
 const provenance=item.captureProvenance;
 label(`${es?'Escala común':'Common scale'}: 25 mm/s · ${n(gain,3)} mm/mV${provenance?.speed?` · ${es?'Calibración impresa':'Printed calibration'}: ${n(provenance.speed)} mm/s · ${n(provenance.gain)} mm/mV`:''}`);
 label(item.synchronized?(es?'Derivaciones simultáneas':'Simultaneous leads'):(es?'Ventanas independientes; simultaneidad no confirmada':'Independent windows; simultaneity unconfirmed'));
 const seenObservations=new Set<string>();
 function panelInfo(lead:Lead,trace:Trace|undefined,detail:LeadAnalysis|undefined,capture:Lead|'II-long'=lead,full=false){
  const valid=!!trace&&trace.seconds>0&&trace.mv.length>1&&trace.mv.every(Number.isFinite)&&trace.mv.every(v=>Math.abs(v)<=100)&&detail?.status!=='missing';
  const own=windows.filter(w=>(w.captureLead??w.lead)===capture),manual=own.find(w=>w.source==='manual'),markers=detail?.markers??item.markersByLead?.[lead]??item.markers??[];
  const anchor=manual?(manual.start+manual.end)/2:markers.find(m=>m.phase==='qrs')?.start??1.5;
  const duration=valid?Math.min(full?6.8:3.2,trace.seconds):0,from=valid?Math.max(0,Math.min(trace.seconds-duration,anchor-duration/2)):0;
  const visual=valid?representativeIntervals(markers,windows,lead,from,from+duration,capture):{intervals:[],qrs:null},amps=valid?representativeAmplitudes(trace,visual.qrs):null;
  const max=valid?trace.mv.reduce((p,v)=>Math.max(p,Math.abs(v)),0):0;
  const h=valid?Math.max(25,Math.ceil(max*gain*2+6)):0;
  const hasMeasures=[detail?.features.qrsMs,detail?.features.stMv,detail?.features.rMv,detail?.features.sMv,detail?.features.tMv].some(v=>v!=null&&Number.isFinite(v));
  const numeric=valid&&hasMeasures?`QRS ${n(detail?.features.qrsMs)} ms · ST ${n(detail?.features.stMv,2)} mV · R/S ${n(detail?.features.rMv,2)}/${n(detail?.features.sMv,2)} mV · T ${n(detail?.features.tMv,2)} mV`:'';
  const morph=detail?.observations.map(o=>clinicalText(o[language])).filter(s=>!/^QRS representativo:|^Representative QRS:|^Punto J estimado:|^Estimated J point:|^ST a 60|^ST 60|^Deflexión T representativa|^Representative .* T deflection|^Deflexión positiva máxima|^Maximum positive deflection|^Variabilidad relativa de RR|^Relative RR variability|^\d+ (complejos detectados|detected complexes)|^Activación inicial:|^Initial activation:/i.test(s)&&!seenObservations.has(s))??[];
  const delta=detail?.features.deltaEvidence??a.preexcitation?.leads[lead];
  const important=[...morph].sort((a,b)=>Number(/terminal|anch[ao]|broad|deflexiones|deflections/i.test(b))-Number(/terminal|anch[ao]|broad|deflexiones|deflections/i.test(a)));
  const chosen=unique([delta?.status==='supported'?`${es?'Delta candidata':'Delta candidate'}: ${n(delta.durationMs)} ms · ${polarity(delta.polarity)} · ${delta.repeatableBeats}/${delta.analyzedBeats}`:'',...important]).slice(0,2);for(const s of chosen)seenObservations.add(s);
  const notes=detail?.status==='poor-quality'?[chosen[0]??(es?'Calidad insuficiente: verifica el original.':'Poor quality: verify the original.')]:chosen;
  return {lead,trace,detail,valid,duration,from,visual,amps,h,numeric,notes,capture};
 }
 type Panel=ReturnType<typeof panelInfo>;
 function panelHeight(p:Panel,w:number){return p.valid?10+(p.visual.intervals.length?12:0)+p.h+7+lines(p.numeric,w,7).length*3.3+p.notes.reduce((h,s)=>h+Math.min(3,lines(s,w,7.5).length)*3.5,0)+4:25;}
 function drawPanel(p:Panel,x:number,at:number,w:number){
  const {trace,visual,from,duration,h,amps}=p;doc.setTextColor(92,31,43);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(tx(`${es?'Derivación':'Lead'} ${p.lead}${p.capture==='II-long'?(es?' · tira larga':' · long strip'):''}`),x,at+4);
  let py=at+10;doc.setFont('helvetica','normal');
  function cellText(s:string,size=7.5,maxLines=3){doc.setFontSize(size);doc.setTextColor(63,49,47);const split=lines(s,w,size);for(const [i,value] of split.slice(0,maxLines).entries()){let line=value;if(i===maxLines-1&&split.length>maxLines){while(doc.getTextWidth(line+'...')>w)line=line.slice(0,-1);line+='...';}doc.text(line,x,py);py+=size*.46;}py+=1;}
  if(!p.valid||!trace){cellText(es?'Sin señal evaluable para esta derivación.':'No evaluable signal for this lead.');return;}
  const annotation=visual.intervals.length?12:0,plotY=py+annotation,base=plotY+h/2,chartW=duration*25;
  doc.setLineDashPattern([],0);doc.setLineWidth(.1);doc.setDrawColor(238,214,208);
  for(let dx=0;dx<=chartW;dx+=1)doc.line(x+dx,plotY,x+dx,plotY+h);
  for(let dy=0;dy<=h;dy+=1)doc.line(x,plotY+dy,x+chartW,plotY+dy);
  doc.setDrawColor(216,171,164);for(let dx=0;dx<=chartW;dx+=5)doc.line(x+dx,plotY,x+dx,plotY+h);
  const fs=trace.mv.length/trace.seconds,start=Math.max(0,Math.floor(from*fs)),end=Math.min(trace.mv.length-1,Math.ceil((from+duration)*fs));
  doc.setDrawColor(104,36,42);doc.setLineWidth(.22);for(let i=start+1;i<=end;i++)doc.line(x+(i-1)/fs*25-from*25,base-trace.mv[i-1]*gain,x+i/fs*25-from*25,base-trace.mv[i]*gain);
  const phaseColor={p:[95,117,161],qrs:[170,61,39],t:[50,125,104]};
  for(const mark of p.detail?.markers??[]){if(mark.end<from||mark.start>from+duration)continue;const c=phaseColor[mark.phase];doc.setDrawColor(...c as [number,number,number]);doc.setLineDashPattern([.4,.5],0);for(const t of [mark.start,mark.end])if(t>=from&&t<=from+duration)doc.line(x+(t-from)*25,plotY+2,x+(t-from)*25,plotY+h-1);}
  for(const interval of visual.intervals){const color=interval.source==='manual'?[110,45,151]:[55,83,115],lane=interval.key==='prMs'?0:interval.key==='qrsMs'?1:2,bY=py+2+lane*3.4,x1=x+(Math.max(from,interval.start)-from)*25,x2=x+(Math.min(from+duration,interval.end)-from)*25;
   doc.setDrawColor(...color as [number,number,number]);doc.setTextColor(...color as [number,number,number]);doc.setLineDashPattern([],0);doc.line(x1,bY,x2,bY);doc.line(x1,bY-1,x1,bY+1);doc.line(x2,bY-1,x2,bY+1);doc.setFontSize(6.2);doc.text(tx(`${{prMs:'PR',qrsMs:'QRS',qtMs:'QT'}[interval.key]} ${interval.source==='manual'?'M':'local'} ${n((interval.end-interval.start)*1000)} ms`),x,bY-.4);
   if(interval.source==='manual')for(const t of [interval.start,interval.end])if(t>=from&&t<=from+duration){doc.setLineDashPattern([1,.5],0);doc.line(x+(t-from)*25,plotY+1,x+(t-from)*25,plotY+h-1);}
  }
  for(const d of (p.detail?.features.deltaEvidence??a.preexcitation?.leads[p.lead])?.windows??[]){if(d.end<from||d.start>from+duration)continue;doc.setDrawColor(117,52,169);doc.setLineDashPattern([.4,.4],0);for(const t of [d.start,d.end])if(t>=from&&t<=from+duration)doc.line(x+(t-from)*25,plotY+1,x+(t-from)*25,plotY+h-1);}
  doc.setLineDashPattern([],0);
  if(amps){for(const [name,point] of [['R',amps.r],['S',amps.s],['ST',amps.st]] as const){if(!point||point.time<from||point.time>from+duration)continue;const px=x+(point.time-from)*25,by=base-amps.baselineMv*gain,ty=base-point.mv*gain;doc.setDrawColor(32,88,140);doc.line(px,by,px,ty);doc.setTextColor(32,88,140);doc.setFontSize(6);doc.text(name,Math.min(x+w-5,px+1),Math.max(plotY+3,Math.min(plotY+h-1,ty)));}}
  doc.setTextColor(100,80,76);doc.setFontSize(6.5);doc.text(tx(`${n(from,2)}–${n(from+duration,2)} s / ${n(trace.seconds,1)} s`),x,plotY+h+3);
  py=plotY+h+7;cellText(p.numeric,7,2);for(const s of p.notes)cellText(s);
 }
 for(let i=0;i<leads.length;i+=2){const pair=leads.slice(i,i+2).map(lead=>panelInfo(lead,item.traces[lead],a.leads.find(d=>d.lead===lead)));const h=Math.max(...pair.map(p=>panelHeight(p,86)));room(h+3);const at=y;pair.forEach((p,j)=>drawPanel(p,left+j*94,at,86));y=at+h+3;}
 if(item.rhythmTrace){
  const lead=item.rhythmLead??'II',p=panelInfo(lead,item.rhythmTrace,a.rhythmAnalysis,'II-long',true);heading(es?'Tira larga de II':'Long lead II strip');
  // Keep the full rhythm recording: successive windows share the same scale.
  for(let from=0;from<item.rhythmTrace.seconds-.001;from+=6.8){const duration=Math.min(6.8,item.rhythmTrace.seconds-from),visual=representativeIntervals(a.rhythmAnalysis?.markers??[],windows,lead,from,from+duration,'II-long'),q={...p,from,duration,visual,amps:representativeAmplitudes(item.rhythmTrace,visual.qrs)};const h=panelHeight(q,180);room(h+3);drawPanel(q,left,y,180);y+=h+3;}
 }
 if(a.preexcitation&&a.preexcitation.status!=='not-supported'){heading(es?'Activación inicial del QRS y preexcitación':'Initial QRS activation and preexcitation');paragraph(`${a.preexcitation.status==='supported'?(es?'Apoyo multiderivación':'Multilead support'):(es?'No evaluable':'Not evaluable')} · ${a.preexcitation.supportingLeads.join(', ')||'—'}. ${es?'Candidatos de delta; no confirman un síndrome ni localizan una vía.':'Delta candidates; they do not confirm a syndrome or localize a pathway.'}`,8);}

 heading(es?'Fuentes y notas del registro':'Sources and recording notes');
 if(item.attribution?.[language])paragraph(item.attribution[language],8);
 if(item.sourceUrl)label(item.sourceUrl);if(item.licenseUrl)label(item.licenseUrl);
 if(item.educationalReference){paragraph(`${es?'Diagnóstico de referencia de Wave-Maven':'Wave-Maven reference diagnosis'}: ${item.educationalReference.diagnosis[language]}`,8,true);label(es?'Respuesta docente de la fuente, separada de la predicción del algoritmo.':'Source teaching answer, separate from the algorithm prediction.');label(item.educationalReference.attribution);label(item.educationalReference.sourceUrl);}
 if(options.includeExternalEvidence&&item.externalEvidence?.text.trim()){heading(es?'Respuesta de OpenEvidence pegada por el usuario':'OpenEvidence response pasted by the user');label(es?'Origen y exactitud no verificados.':'Origin and accuracy unverified.');paragraph(item.externalEvidence.text.slice(0,8000),8.5);for(const url of evidenceCitations(item.externalEvidence))label(url);}
 const ids=new Set([...a.findings.flatMap(f=>f.referenceIds),...(a.presumptive?.primary?.references.map(r=>r.id)??[]),...a.presumptive?.concurrent.flatMap(e=>e.references.map(r=>r.id))??[]]);
 const refs=a.references.filter(r=>ids.has(r.id));const selected=refs.length?refs:a.references;
 if(selected.length)heading(es?'Referencias principales':'Selected clinical references');
 for(const [i,ref] of selected.entries()){room(lines(ref.name,180,8).length*3.7+9);paragraph(`${i+1}. ${ref.name}`,8);doc.setTextColor(110,42,60);doc.setFontSize(7);let short=ref.url;try{const url=new URL(ref.url);short=url.hostname.includes('pubmed.ncbi.nlm.nih.gov')?'PubMed '+url.pathname.split('/').filter(Boolean).at(-1):url.hostname.replace(/^www\./,'');}catch{/* retain a supplied non-URL reference */}doc.textWithLink(tx(short),left,y,{url:ref.url});y+=5;}
 label(es?'Bibliografía completa, método y trazados completos: descarga el informe técnico ampliado.':'Full bibliography, methods and complete tracings: download the expanded technical report.');
 const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(112,91,87);doc.setDrawColor(215,193,186);doc.line(left,284,right,284);doc.text(tx(education),left,289);doc.text(`${i} / ${pages}`,right,289,{align:'right'});doc.setFontSize(6.5);doc.text(tx(`${a.algorithmVersion}${a.presumptive?' · '+a.presumptive.knowledgeVersion:''}`),left,293);}
 return doc;
}
