import {evidenceCitations,makeEvidenceNote} from './evidenceNote';
import type {ExternalEvidenceNote} from './evidenceNote';
export function OpenEvidencePanel({language,value,onChange}:{language:'es'|'en';value?:ExternalEvidenceNote;onChange?:(note:ExternalEvidenceNote|undefined)=>void}) {
 const es=language==='es';
 const raw=import.meta.env.VITE_OPENEVIDENCE_EMBED_URL as string|undefined;
 let official:string|null=null;
 try {const url=new URL(raw??'');if(import.meta.env.VITE_OPENEVIDENCE_EMBED_AUTHORIZED==='1'&&url.protocol==='https:'&&(url.hostname==='www.openevidence.com'||url.hostname==='partners.openevidence.com')&&!url.username&&!url.password)official=url.href;}catch{/* connection not configured */}
 return <section className="official-integration"><h3>OpenEvidence</h3>{official?<iframe src={official} title="OpenEvidence" loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"/>:<p role="status">{es?'Acceso integrado pendiente de activación técnica del proveedor. Puedes copiar la consulta, abrir OpenEvidence y pegar aquí la respuesta y sus referencias.':'Embedded access awaits provider technical activation. You can copy the question, open OpenEvidence and paste its response and references here.'}</p>}
 {onChange&&<details className="pasted-evidence" open={!!value?.text}>
 <summary>{es?'Guardar una respuesta de OpenEvidence en este caso':'Keep an OpenEvidence response with this case'}</summary>
 <p>{es?'Contenido pegado manualmente por ti, sin verificación automática de origen o exactitud. No se envía información desde este formulario y se conserva solo durante esta sesión.':'Content manually pasted by you, without automatic verification of origin or accuracy. This form sends no information and keeps the note only for this session.'}</p>
 <label>{es?'Respuesta obtenida en OpenEvidence':'Response obtained in OpenEvidence'}<textarea rows={7} maxLength={8000} value={value?.text??''} onChange={e=>onChange(makeEvidenceNote(e.target.value,value?.citationText))} placeholder={es?'Pega aquí la respuesta real que recibiste.':'Paste the actual response you received here.'}/></label>
 <label>{es?'Enlaces de las referencias (uno por línea, HTTPS)':'Reference links (one per line, HTTPS)'}<textarea rows={3} maxLength={3000} value={value?.citationText??''} onChange={e=>onChange(makeEvidenceNote(value?.text??'',e.target.value))}/></label>
 {evidenceCitations(value).length>0&&<ul>{evidenceCitations(value).map(url=><li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul>}
 <p>{es?'Su inclusión en el informe PDF se elige por separado antes de descargar. Evita datos identificables.':'Inclusion in the PDF report is selected separately before downloading. Avoid identifiable information.'}</p>
 {!!value&&<button type="button" className="button button--subtle" onClick={()=>onChange(undefined)}>{es?'Eliminar respuesta de esta sesión':'Remove response from this session'}</button>}
 </details>}
 </section>;
}
