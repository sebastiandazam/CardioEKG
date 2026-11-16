import {useEffect,useMemo,useRef,useState} from 'react';
import type {ViewerCase} from '../../cases';
import type {CaseAnalysis} from '../../ecg/analysisTypes';
import {DocumentPicker} from '../../research/DocumentPicker';
import {AI_MODELS,MAX_PROMPT} from './config';
import type {AIModel,ImageKind} from './config';
import {makeDiagnosticPrompt,imageProvenance} from './prompt';
import {pixelsFromBlob,reconstructedPixels} from './image';
import {requestAIReview,requestHostedReview} from './client';
type Result=Awaited<ReturnType<typeof requestAIReview>>;
export function DiagnosticAI({item,analysis,language,recordingContext}:{item:ViewerCase;analysis:CaseAnalysis;language:'es'|'en';recordingContext?:string}) {
 const es=language==='es',base=useMemo(()=>makeDiagnosticPrompt(analysis,language,item.clinicalContext,recordingContext),[analysis,language,item.clinicalContext,recordingContext]);
 const [prompt,setPrompt]=useState(base),[kind,setKind]=useState<ImageKind>('reconstruction'),[image,setImage]=useState<string|null>(null),[imageBusy,setImageBusy]=useState(false),[imageError,setImageError]=useState(false);
 const [model,setModel]=useState<AIModel>(AI_MODELS[0].id),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const [hosted,setHosted]=useState(false),[checking,setChecking]=useState(true),[personal,setPersonal]=useState(false);
 const request=useRef(0),imageRevision=useRef(0),abort=useRef<AbortController|null>(null);
 function clear(){request.current++;abort.current?.abort();abort.current=null;setBusy(false);setResult(null);setError('');setCopied(false)}
 async function selectImage(source:ImageKind,file?:File){
  const revision=++imageRevision.current;clear();setImageBusy(true);setImageError(false);setImage(null);setKind(source);
  try{const value=file?await pixelsFromBlob(file):await reconstructedPixels(item,language);if(revision===imageRevision.current)setImage(value.preview);}
  catch{if(revision===imageRevision.current)setImageError(true);}finally{if(revision===imageRevision.current)setImageBusy(false);}
 }
 useEffect(()=>{clear();setPrompt(base)},[base]);
 useEffect(()=>{const controller=new AbortController();fetch('/api/diagnostic-ai/status',{credentials:'omit',cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(value=>setHosted(value?.configured===true)).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setChecking(false)});return()=>controller.abort()},[]);
 useEffect(()=>{void selectImage(item.measurementImage?'original':'reconstruction',item.measurementImage);return()=>{imageRevision.current++;request.current++;abort.current?.abort()}},[item.id,item.measurementImage,item.traces,item.rhythmTrace,language]);
 const inputPrompt=imageProvenance(kind,language)+'\n\n'+prompt;
 async function run(){
  if(!image||checking||busy||imageBusy||(!(hosted&&!personal)&&!key.trim())||!prompt.trim()||inputPrompt.length>MAX_PROMPT)return;
  const id=++request.current,controller=new AbortController();abort.current=controller;setBusy(true);setError('');setResult(null);setCopied(false);
  const timer=setTimeout(()=>controller.abort(),120000);
  try{const args={model,prompt:inputPrompt,image,language,consent:true,signal:controller.signal};const value=hosted&&!personal?await requestHostedReview(args):await requestAIReview({...args,key});if(request.current===id){setResult(value)}}
  catch(e){if(request.current===id){setError(e instanceof Error?(e.name==='AbortError'?'timeout':e.message):'request-failed')}}
  finally{clearTimeout(timer);if(request.current===id){setBusy(false);abort.current=null}}
 }
 const errors:Record<string,string>={
  'key-format':es?'Revisa la clave de OpenRouter. Se pega solo en este campo, no en el prompt.':'Check the OpenRouter key. Paste it only in this field, not in the prompt.',
  'catalogue-unavailable':es?'No se pudo verificar el catálogo. No se envió el ECG al proveedor de IA.':'Could not verify the catalogue. The ECG was not sent to the AI provider.',
  'model-not-free':es?'No se pudo confirmar soporte de imagen y tarifa cero. No se envió el ECG al proveedor de IA ni se eligió otro modelo.':'Could not confirm image support and zero pricing. The ECG was not sent to the AI provider and no other model was selected.',
  'rate-limit':es?'Cupo temporal compartido ocupado. Espera un minuto antes de intentar de nuevo.':'Shared temporary quota is busy. Wait a minute before trying again.',
  'not-configured':es?'El servicio del sitio no tiene clave activa. Puedes usar una clave personal.':'The site service has no active key. You can use a personal key.',
  'http-401':es?'Clave rechazada por OpenRouter. Compruébala en tu cuenta.':'OpenRouter rejected the key. Check it in your account.',
  'http-402':es?'El proveedor rechazó el acceso. Esta integración no compra créditos ni cambia a un modelo de pago.':'The provider rejected access. This integration does not buy credits or switch to a paid model.',
  'http-403':es?'El proveedor no permite esta solicitud. Revisa las condiciones y preferencias de privacidad de tu cuenta; no se cambian automáticamente.':'The provider does not permit this request. Check your account terms and privacy preferences; they are not changed automatically.',
  'http-429':es?'Cupo gratuito o capacidad temporal agotados. No se reintentó ni se cambió a un modelo de pago.':'Free quota or temporary capacity exhausted. No retry or paid model switch was made.',
  'timeout':es?'Se agotó el tiempo de espera. No hay reintentos automáticos; la solicitud podría haber llegado al proveedor.':'The request timed out. There are no automatic retries; it may have reached the provider.',
  'unexpected-cost':es?'El proveedor devolvió un coste inesperado. La respuesta se bloqueó; revisa el registro de tu cuenta antes de volver a usar la integración.':'The provider reported an unexpected cost. The response was blocked; inspect your account log before using the integration again.',
  'copy':es?'Selecciona la respuesta y cópiala manualmente.':'Select the response and copy it manually.',
 };
 return <section className="card local-ai-review" aria-labelledby="diagnostic-ai-heading">
  <div className="local-ai-heading"><h2 id="diagnostic-ai-heading">{es?'Revisión con IA':'AI review'}</h2><span className="tag">{es?'Experimental · gratuita':'Experimental · free'}</span></div>
  <p>{es?'El ECG, las medidas y el contexto clínico se preparan automáticamente. La respuesta aparecerá aquí y requiere revisión profesional.':'The ECG, measurements and clinical context are prepared automatically. The response appears here and requires professional review.'}</p>
  <p className="local-ai-provenance" id="ai-transfer-notice">{es?'Al pulsar «Enviar y revisar», confirmas que eres mayor de 18 años y autorizas enviar este ECG simulado o público autorizado, sin datos personales, y su contexto a OpenRouter/NVIDIA. NVIDIA puede conservarlos y usarlos para entrenar. No envíes registros de pacientes.':'By selecting “Send and review”, you confirm you are at least 18 and authorize sending this simulated or authorized public ECG, without personal data, and its context to OpenRouter/NVIDIA. NVIDIA may retain them and use them for training. Do not send patient records.'}</p>
  {checking&&<p role="status">{es?'Conectando con el servicio…':'Connecting to the service…'}</p>}
  {imageBusy&&<p role="status">{es?'Preparando ECG…':'Preparing ECG…'}</p>}
  {imageError&&<p role="alert">{es?'No se pudo preparar la imagen. Elige otra en las opciones.':'Could not prepare the image. Choose another in the options.'}</p>}
  {!checking&&!hosted&&!key.trim()&&<p role="status">{es?'Servicio no disponible. Puedes añadir tu clave gratuita en las opciones.':'Service unavailable. You can add your free key in the options.'}</p>}
  {inputPrompt.length>MAX_PROMPT&&<p role="alert">{es?'Acorta la consulta en las opciones antes de enviar.':'Shorten the query in the options before sending.'}</p>}
  <div className="local-ai-actions"><button type="button" className="button button--primary" aria-describedby="ai-transfer-notice" disabled={checking||busy||imageBusy||!image||(!(hosted&&!personal)&&!key.trim())||!prompt.trim()||inputPrompt.length>MAX_PROMPT} onClick={()=>void run()}>{busy?(es?'Revisando…':'Reviewing…'):(es?'Enviar y revisar con IA':'Send and review with AI')}</button>{busy&&<button type="button" onClick={()=>{request.current++;abort.current?.abort();setBusy(false);setError('cancelled')}}>{es?'Cancelar espera':'Cancel waiting'}</button>}</div>
  {busy&&<p role="status">{es?'La revisión puede tardar hasta dos minutos.':'The review may take up to two minutes.'}</p>}
  {error&&<p role="alert">{errors[error]??(error==='cancelled'?(es?'Espera cancelada. Lo ya enviado no se retira del proveedor.':'Waiting cancelled. Content already sent is not withdrawn from the provider.'):(es?'No se pudo obtener la respuesta. Inténtalo más tarde.':'Could not get a response. Try again later.'))}</p>}
  {result&&<div className="local-ai-answer"><h3>{es?'Respuesta · por verificar':'Response · verify before use'}</h3>{result.truncated&&<p role="status">{es?'La respuesta puede estar incompleta.':'The response may be incomplete.'}</p>}<pre>{result.text}</pre><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(`${result.model}\n${result.generatedAt}\n${result.text}`);setCopied(true)}catch{setError('copy')}}}>{copied?(es?'Copiada':'Copied'):(es?'Copiar respuesta':'Copy response')}</button><details><summary>{es?'Origen de la respuesta':'Response source'}</summary><p>{result.model} · {result.provider} · {result.generatedAt}</p></details></div>}
  <details className="ai-options"><summary>{es?'Ver ECG, consulta y opciones':'View ECG, query and options'}</summary>
   <div className="local-ai-inputs"><div><h3>{es?'ECG que se enviará':'ECG to send'}</h3>{image&&<img className="local-ai-preview" src={image} alt={es?'Imagen preparada para esta consulta':'Image prepared for this query'}/>}
    <div className="local-ai-actions">{item.measurementImage&&<button type="button" disabled={busy||imageBusy} aria-pressed={kind==='original'} onClick={()=>void selectImage('original',item.measurementImage)}>{es?'Imagen original':'Original image'}</button>}<button type="button" disabled={busy||imageBusy} aria-pressed={kind==='reconstruction'} onClick={()=>void selectImage('reconstruction')}>{es?'Reconstrucción':'Reconstruction'}</button></div>
    <DocumentPicker language={language} disabled={busy||imageBusy} label={es?'Otra imagen o PDF del mismo ECG':'Another image or PDF of the same ECG'} onPick={file=>selectImage('selected',file)}/><p className="local-ai-provenance">{imageProvenance(kind,language)}</p>
   </div><div><label>{es?'Consulta con contexto clínico':'Query with clinical context'}<textarea rows={7} value={prompt} disabled={busy} maxLength={MAX_PROMPT} onChange={e=>{clear();setPrompt(e.target.value)}}/></label><button type="button" disabled={busy} onClick={()=>{clear();setPrompt(base)}}>{es?'Restaurar consulta automática':'Restore automatic query'}</button></div></div>
   <div className="ai-access"><label>{es?'Modelo gratuito':'Free model'}<select value={model} disabled={busy} onChange={e=>{clear();setModel(e.target.value as AIModel)}}>{AI_MODELS.map(m=><option key={m.id} value={m.id}>{m.name} · $0</option>)}</select></label></div>
   {hosted&&<label><input type="checkbox" disabled={busy} checked={personal} onChange={e=>{clear();setPersonal(e.target.checked)}}/>{es?'Usar una clave personal (opcional)':'Use a personal key (optional)'}</label>}
   {(!hosted||personal)&&<div className="ai-access"><label>{es?'Clave personal de OpenRouter':'Personal OpenRouter key'}<input type="password" autoComplete="off" spellCheck={false} value={key} disabled={busy} placeholder="sk-or-v1-…" onChange={e=>{clear();setPersonal(true);setKey(e.target.value)}}/></label><button type="button" disabled={busy||!key} onClick={()=>{clear();setKey('')}}>{es?'Quitar clave':'Remove key'}</button><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">{es?'Crear clave gratuita':'Create a free key'}</a></div>}
   <p className="local-ai-provenance">{es?'Solo modelos gratuitos, sin cambios a modelos de pago. La cuota es compartida. La revisión es educativa, no está validada clínicamente y no cambia las medidas ni el informe. La aplicación no guarda las consultas; la clave personal permanece solo en memoria. Cancelar detiene la espera, no retira datos ya enviados.':'Free models only, with no switch to paid models. Quota is shared. This is an educational review, without clinical validation, and does not change measurements or the report. The application does not store queries; personal keys remain only in memory. Cancelling stops waiting but does not withdraw data already sent.'}</p>
   <a href="https://openrouter.ai/docs/guides/privacy/logging" target="_blank" rel="noreferrer">{es?'Privacidad del proveedor':'Provider privacy'}</a>{' · '}<a href="https://openrouter.ai/terms" target="_blank" rel="noreferrer">{es?'Condiciones':'Terms'}</a>
  </details>
 </section>;
}
