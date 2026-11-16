import {makeAnalysisPrompt} from '../../ecg/evidencePrompt';
import type {CaseAnalysis} from '../../ecg/analysisTypes';
import type {ClinicalContext} from '../../ecg/context';
import type {ImageKind} from './config';
export function makeDiagnosticPrompt(analysis:CaseAnalysis,language:'es'|'en',context?:ClinicalContext,recordingContext?:string) {
 const base=makeAnalysisPrompt(analysis,language,context,recordingContext)
  .replace('No hay imágenes ni señales crudas adjuntas.','Se adjunta la imagen indicada en el panel de IA; revisa su procedencia.')
  .replace('No images or raw signals are attached.','The image identified in the AI panel is attached; check its provenance.');
 const clinicalIds=new Set([analysis.presumptive?.primary,...(analysis.presumptive?.concurrent??[])].flatMap(e=>e?.references.map(r=>r.id)??[]));
 const ordered=[...analysis.references.filter(r=>clinicalIds.has(r.id)),...analysis.references.filter(r=>!clinicalIds.has(r.id))];
 const refs=ordered.slice(0,8).map(r=>`${r.id}: ${r.name} ${r.url}`).join('\n');
 const hypotheses=[analysis.presumptive?.primary,...(analysis.presumptive?.concurrent??[]),...(analysis.presumptive?.differentials??[])].filter(e=>!!e).slice(0,4);
 const evidence=hypotheses.map(e=>`${e.name[language]} (${e.status}; ${language==='es'?'fuerza heurística, no probabilidad':'heuristic strength, not probability'}):\n`+
  (language==='es'?'A favor: ':'Supporting: ')+e.met.slice(0,6).map(x=>x[language]).join('; ')+'\n'+
  (language==='es'?'En contra/confusores: ':'Against/confounders: ')+e.against.slice(0,4).map(x=>x[language]).join('; ')+'\n'+
  (language==='es'?'Falta comprobar: ':'Still needs checking: ')+e.missing.slice(0,4).map(x=>x[language]).join('; ')+'\n'+
  (e.limitations?.[language]??'')).join('\n\n');
 return base+(evidence?'\n\n'+(language==='es'?'Criterios de la base bibliográfica evaluados por el algoritmo (no validación independiente):':'Literature criteria assessed by the algorithm (not independent validation):')+'\n'+evidence:'')+'\n\n'+(language==='es'?'Referencias aportadas (no verificadas por esta IA):':'Provided references (not verified by this AI):')+'\n'+refs;
}
export function imageProvenance(kind:ImageKind,language:'es'|'en') {
 if(kind==='reconstruction')return language==='es'?'Imagen reconstruida desde las señales disponibles, no fotografía original. Cada derivación muestra su propia ventana desde 0 s; la disposición no confirma simultaneidad. Pueden existir errores de digitalización. La imagen se ha ajustado para mostrar la señal: usa las medidas aportadas y no midas píxeles de esta vista.':'Image reconstructed from available signals, not an original photograph. Each lead shows its own window starting at 0 s; the layout does not establish simultaneity. Digitization errors may exist. The image is scaled to fit the signal: use the supplied measurements and do not measure pixels in this view.';
 return language==='es'?'Imagen del ECG seleccionada en este caso, reducida para el modelo. Sus etiquetas, calibración y correspondencia con las medidas requieren comprobación; la IA no acredita que pertenezca al mismo registro.':'Selected ECG image for this case, resized for the model. Its labels, calibration and correspondence to measurements require checking; the AI does not establish that it belongs to the same recording.';
}
