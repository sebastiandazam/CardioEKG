import {isScaleProblem} from './sharedScale';
import { leads } from './digitize';
import type { CaptureLead } from './digitize';
import type { AcceptedPhoto } from './photo';
import type { BatchFailure } from './batch';
import { PhotoTrace,TraceScale,leadName } from './PhotoInput';
import { researchMessage } from './locale';
import type { ResearchLanguage } from './locale';
export function BatchPreview({photos,failures,running,done,total,includeLong,language,onEdit,onCalibrate}:{
  photos:Partial<Record<CaptureLead,AcceptedPhoto>>;failures:Partial<Record<CaptureLead,BatchFailure>>;
  running:boolean;done:number;total:number;includeLong:boolean;language:ResearchLanguage;onEdit:(lead:CaptureLead)=>void;onCalibrate:()=>void;
}) {
  const es=language==='es';const sequence:CaptureLead[]=includeLong?[...leads,'II-long']:[...leads];
  const scaleErrors=sequence.filter(lead=>failures[lead]&&isScaleProblem(failures[lead]!.code));
  const errors=sequence.filter(lead=>failures[lead]);
  return <section className="ecg-batch-preview" aria-label={es?'Reconstrucción de todas las derivaciones':'All lead reconstructions'}>
    <h2>{running?(es?'Reconstruyendo todas las derivaciones…':'Reconstructing all leads…'):(es?'Trazados reconstruidos':'Reconstructed tracings')}</h2>
    <p role="status" aria-live="polite">{running?`${done}/${total}`:errors.length?(scaleErrors.length===errors.length?(es?'Las vistas previas están disponibles. Queda verificar una escala común del papel.':'Previews are available. One common paper scale still needs verification.'):(es?`${errors.length-scaleErrors.length} trazado(s) necesitan revisión de señal; los correctos se conservan.`:`${errors.length-scaleErrors.length} tracing(s) need signal review; successful traces are retained.`)):(es?'Todos los trazados están listos. Revisa el conjunto antes de confirmar el caso.':'All tracings are ready. Review the set before confirming the case.')}</p>
    {!running&&scaleErrors.length>0&&<div className="ecg-scale-notice" role="status"><h3>{es?'Hay una escala pendiente de verificar':'A scale needs verification'}</h3><p>{es?`${scaleErrors.length} trazados requieren verificar la cuadrícula. Esto no significa que los recuadros tengan dimensiones incorrectas. Puedes calibrar el papel una sola vez; no necesitas redibujar las zonas.`:`${scaleErrors.length} traces need grid verification. This does not mean the crop dimensions are incorrect. Calibrate the paper once; you do not need to redraw the regions.`}</p><button type="button" className="ecg-r-primary" onClick={onCalibrate}>{es?'Calibrar el papel una vez':'Calibrate the paper once'}</button></div>}
    {running&&<progress max={total} value={done} aria-label={es?'Progreso de reconstrucción':'Reconstruction progress'}/>}
    <div className="ecg-batch-grid">{sequence.map(lead=>{
      const failure=failures[lead],photo=photos[lead]??failure?.photo;
      return <article key={lead} className={`ecg-batch-card ${failure?'has-error':''}`}>
        <h3>{leadName(lead,language)} <span>{failure?(isScaleProblem(failure.code)?(es?'Escala pendiente':'Scale pending'):(es?'Revisar':'Review')):photos[lead]?'✓':(es?'Pendiente':'Pending')}</span></h3>
        {photo&&<><PhotoTrace photo={photo} language={language}/><TraceScale trace={photo.result} language={language}/></>}
        {failure?.draft&&<><PhotoTrace photo={{image:failure.draft.image,result:failure.draft.trace}} language={language}/><p className="ecg-r-muted">{es?'Trazo provisional en píxeles; sin segundos ni mV hasta confirmar la escala.':'Provisional pixel trace; no seconds or mV until scale is confirmed.'}</p></>}
        {failure&&!isScaleProblem(failure.code)&&<p className="ecg-r-error">{researchMessage(failure.code,language)}</p>}
        {!photo&&!failure&&<p>{es?'Se dibujará automáticamente.':'Will be drawn automatically.'}</p>}
        {!running&&<button type="button" className={failure?'ecg-r-primary':'ecg-r-quiet'} onClick={()=>onEdit(lead)}>{failure?(isScaleProblem(failure.code)?(es?'Ver este trazado':'View this tracing'):(es?'Corregir esta derivación':'Fix this lead')):(es?'Editar si es necesario':'Edit if needed')}</button>}
      </article>;
    })}</div>
  </section>;
}
