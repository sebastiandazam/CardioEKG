import {useState} from 'react';
type SplitMetrics={macro_auroc:number|null;macro_auprc:number|null;mean_brier:number|null;mean_ece:number|null};
type Summary={
 schema_version:number;
 activation_gate_passed:boolean;
 planned_training_completed:boolean;
 diagnosis:{
  selected_candidate?:string;
  records:Record<string,{records:number;patients:number|null}>;
  trained_classes:string[];
  classes_with_insufficient_training_support:string[];
  reported_validation_performance?:Record<string,SplitMetrics|null>;
 };
 delineation:{
  annotated_training_records:number;
  augmented_training_beats:number;
  available_annotated_cohorts?:Record<string,Record<string,number>>;
 };
 blocker?:{error:string};
};
export function TrainingStatus({language}:{language:'es'|'en'}) {
 const [summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState(false),[busy,setBusy]=useState(false);const es=language==='es';
 async function load(){if(summary||busy)return;setBusy(true);try{const response=await fetch('/models/research-summary.json',{credentials:'omit'});if(!response.ok)throw new Error('summary');const data=await response.json();if(data.schema_version!==1||!data.diagnosis?.records)throw new Error('schema');setSummary(data);}catch{setError(true);}finally{setBusy(false);}}
 const fmt=(v:number|null|undefined,d=3)=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toFixed(d);
 return <details className="training-status" onToggle={e=>{if(e.currentTarget.open)void load();}}><summary>{es?'Entrenamiento realizado, calibración y validación pendiente':'Training performed, calibration and validation pending'}</summary>
 <p>{es?'Las reglas clínicas publicadas y los candidatos aprendidos son componentes distintos. Un modelo con calibración de laboratorio no sustituye la validación clínica sobre fotografías reales ni autoriza uso diagnóstico autónomo.':'Published clinical rules and learned candidates are separate components. Laboratory waveform calibration does not replace clinical validation on real photographs or authorize autonomous diagnostic use.'}</p>
 <section><h3>{es?'Experimento Wave-Maven · 547 ECG procesados':'Wave-Maven experiment · 547 ECGs processed'}</h3><p>{es?'328 ECG ajustaron los pesos; 110 se usaron para selección y 109 para prueba. Se entrenaron clasificadores de 10 categorías amplias. Los resultados fueron desiguales y los pesos permanecen inactivos.':'328 ECGs fitted weights; 110 were used for selection and 109 for testing. Classifiers were trained for 10 broad categories. Results were uneven and weights remain inactive.'}</p><p>{es?'No se conocen las identidades de los pacientes y se revisaron todas las respuestas: la prueba no es una validación clínica independiente. No se garantiza acertar los 547 diagnósticos.':'Patient identities are unknown and all answers were reviewed: testing is not independent clinical validation. Correct identification of all 547 diagnoses is not guaranteed.'}</p><a href="/models/wave-maven-experiment.json" download="CardioEKG-Wave-Maven-experiment.json">{es?'Descargar métodos y resultados del experimento':'Download experiment methods and results'}</a></section>
 <h3>{es?'Registro agregado PTB-XL / Chapman / LUDB / QTDB':'PTB-XL / Chapman / LUDB / QTDB aggregate record'}</h3>
 {busy&&<p role="status">{es?'Cargando registro…':'Loading record…'}</p>}{error&&<p>{es?'No se pudo cargar el registro agregado. No se deduce rendimiento de esa ausencia.':'The aggregate record could not be loaded. Performance cannot be inferred from its absence.'}</p>}
 {summary&&<>
  <p><strong>{summary.activation_gate_passed?(es?'Validación externa aprobada.':'External validation passed.'):(es?'Candidatos de investigación inactivos en producción; calibrados en señales digitales y pendientes de validación fotográfica clínica.':'Research candidates inactive in production; calibrated on digital waveforms and pending photographic clinical validation.')}</strong></p>
  <div className="screening-table-wrap"><table><thead><tr><th>{es?'Partición':'Partition'}</th><th>ECG</th><th>{es?'Pacientes':'Patients'}</th></tr></thead><tbody>{Object.entries(summary.diagnosis.records).map(([key,v])=><tr key={key}><td>{{fit:es?'Entrenamiento (Folds 1–7)':'Training (Folds 1–7)',selection:es?'Selección (Fold 8)':'Selection (Fold 8)',calibration:es?'Calibración Platt (Fold 9)':'Platt calibration (Fold 9)',test:es?'Prueba reservada (Fold 10)':'Held-out test (Fold 10)',external:es?'Validación externa (Chapman)':'External validation (Chapman)'}[key]??key}</td><td>{v.records}</td><td>{v.patients??(es?'Sin enlace':'Unlinked')}</td></tr>)}</tbody></table></div>
  {summary.diagnosis.reported_validation_performance&&<>
   <h4>{es?`Métricas calibradas por partición (${summary.diagnosis.selected_candidate??'candidato'})`:`Calibrated partition metrics (${summary.diagnosis.selected_candidate??'candidate'})`}</h4>
   <div className="screening-table-wrap"><table><thead><tr><th>{es?'Partición':'Split'}</th><th>AUROC</th><th>AUPRC</th><th>Brier</th><th>ECE</th></tr></thead><tbody>{Object.entries(summary.diagnosis.reported_validation_performance).map(([split,m])=>m&&<tr key={split}><td>{{selection:es?'Selección':'Selection',calibration:es?'Calibración':'Calibration',test:es?'Test interno':'Internal test',external:es?'Externo (Chapman)':'External (Chapman)'}[split]??split}</td><td>{fmt(m.macro_auroc)}</td><td>{fmt(m.macro_auprc)}</td><td>{fmt(m.mean_brier,4)}</td><td>{fmt(m.mean_ece,4)}</td></tr>)}</tbody></table></div>
  </>}
  <p>{es?'Delineador: ':'Delineator: '}{summary.delineation.annotated_training_records} {es?'registros LUDB anotados en entrenamiento, ':'LUDB training records, '}{summary.delineation.available_annotated_cohorts?.ludb?.test??0} {es?'test LUDB y ':'LUDB test and '}{summary.delineation.available_annotated_cohorts?.qt?.external??0} {es?'QTDB externos':'QTDB external'} ({summary.delineation.augmented_training_beats} {es?'latidos aumentados para ajuste':'augmented beats for fitting'}).</p>
  <p>{es?'Categorías entrenadas (no habilitadas para diagnóstico clínico autónomo): ':'Trained categories (not enabled for autonomous diagnosis): '}{summary.diagnosis.trained_classes.join(', ')}.</p>
  <p>{es?'Soporte insuficiente en este subconjunto: ':'Insufficient training support in this subset: '}{summary.diagnosis.classes_with_insufficient_training_support.join(', ')}.</p>
  {summary.blocker&&<p>{es?'Descargas pendientes por fallo de red: ':'Downloads pending due to network failure: '}{summary.blocker.error}</p>}
 </>}
 <a href="/models/research-summary.json" download="CardioEKG-training-status.json">{es?'Descargar registro agregado de investigación':'Download aggregate research record'}</a></details>;
}
