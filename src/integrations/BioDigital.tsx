import {useEffect,useId,useRef,useState} from 'react';
import {biodigitalViewerUrl} from './biodigitalConfig';
type Human={on:(event:string,callback:()=>void)=>void;timeline:{play:()=>void;pause:()=>void};destroy?:()=>void};
declare global {interface Window {HumanAPI?:{Human:new(id:string)=>Human}}}
const sdk='https://human-api.biodigital.com/build/1.2.1/human-api-1.2.1.min.js';
let loading:Promise<void>|undefined;
function loadSdk(){if(window.HumanAPI)return Promise.resolve();if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=sdk;script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.onload=()=>window.HumanAPI?resolve():reject(new Error('sdk'));script.onerror=()=>{script.remove();loading=undefined;reject(new Error('sdk'));};document.head.append(script);});return loading;}
export function BioDigitalPanel({language}:{language:'es'|'en'}) {
 const es=language==='es',url=biodigitalViewerUrl(import.meta.env.VITE_BIODIGITAL_EMBED_URL as string|undefined);
 const id='biodigital-'+useId().replace(/[^a-z0-9]/gi,''),[opened,setOpened]=useState(false),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);const api=useRef<Human|null>(null);
 useEffect(()=>{if(!url||!opened)return;let cancelled=false;const timeout=setTimeout(()=>{if(!cancelled)setFailed(true);},20000);
 void loadSdk().then(()=>{if(cancelled)return;const human=new window.HumanAPI!.Human(id);api.current=human;human.on('ready',()=>{if(!cancelled){clearTimeout(timeout);setReady(true);setFailed(false);}});}).catch(()=>{if(!cancelled)setFailed(true);});
 return()=>{cancelled=true;clearTimeout(timeout);api.current?.destroy?.();api.current=null;};},[url,opened,id]);
 if(!url)return null;
 function timeline(action:'play'|'pause'){try{api.current?.timeline[action]();}catch{setFailed(true);}}
 return <details className="biodigital-integration"><summary>{es?'BioDigital Human · visor complementario':'BioDigital Human · supplementary viewer'}</summary>
 {!url?<p>{es?'Conector preparado. Para activar el modelo hace falta el enlace de publicación de BioDigital y registrar cardioscopio-ecg.dorydaza.chatgpt.site en la cuenta del proveedor. El atlas cardíaco local sigue disponible arriba.':'Connector prepared. Activating the model requires a BioDigital published viewer link and registration of cardioscopio-ecg.dorydaza.chatgpt.site with the provider. The local heart atlas remains available above.'}</p>:<><p>{es?'Visor externo de BioDigital. Abrirlo contacta al proveedor; no se le envían el ECG ni el contexto clínico. Su animación es propia del modelo, sin sincronización electrofisiológica verificada con este ECG.':'External BioDigital viewer. Opening it contacts the provider; ECG and clinical context are not sent. Its animation belongs to the model and has no verified electrophysiological synchronization with this ECG.'}</p>
 {!opened?<button type="button" className="button button--subtle" onClick={()=>setOpened(true)}>{es?'Cargar visor BioDigital':'Load BioDigital viewer'}</button>:<><iframe id={id} src={url} title="BioDigital Human" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen" allowFullScreen/><div className="evidence-actions"><button type="button" disabled={!ready} onClick={()=>timeline('play')}>{es?'Reproducir modelo':'Play model'}</button><button type="button" disabled={!ready} onClick={()=>timeline('pause')}>{es?'Pausar modelo':'Pause model'}</button><button type="button" onClick={()=>{setOpened(false);setReady(false);setFailed(false)}}>{es?'Cerrar visor externo':'Close external viewer'}</button></div>{failed&&<p role="status">{es?'No se confirmó la conexión con la API. Puedes cerrar el visor y continuar con el atlas local.':'API connection could not be confirmed. You can close this viewer and continue with the local atlas.'}</p>}</>}
 </>}
 <a href="https://developer.biodigital.com/docs/widget%2Fgetting-started%2Ffirst-widget" target="_blank" rel="noreferrer">{es?'Documentación oficial de BioDigital':'Official BioDigital documentation'}</a>
 </details>;
}
