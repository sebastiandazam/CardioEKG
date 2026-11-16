import {useRef,useState} from 'react';
import type {Crop} from './digitize';
import {moveCrop,resizeCrop} from './crop';
export function useImageZoom(initial=100) {
 const [zoom,setZoom]=useState(initial),scroll=useRef<HTMLDivElement>(null);
 function changeZoom(value:number) {
  const el=scroll.current,ratio=value/zoom;
  const x=el?(el.scrollLeft+el.clientWidth/2)*ratio:0,y=el?(el.scrollTop+el.clientHeight/2)*ratio:0;
  setZoom(value);
  requestAnimationFrame(()=>{if(el)el.scrollTo({left:x-el.clientWidth/2,top:y-el.clientHeight/2});});
 }
 return {zoom,setZoom:changeZoom,scroll};
}
export function ZoomButtons({zoom,onChange,es}:{zoom:number;onChange:(value:number)=>void;es:boolean}) {
 return <div className="ecg-touch-zoom" role="group" aria-label={es?'Zoom de la imagen':'Image zoom'}>
 <button type="button" disabled={zoom<=100} onClick={()=>onChange(Math.max(100,zoom-25))} aria-label={es?'Alejar':'Zoom out'}>−</button>
 <output aria-live="polite">{zoom}%</output>
 <button type="button" disabled={zoom>=400} onClick={()=>onChange(Math.min(400,zoom+25))} aria-label={es?'Acercar':'Zoom in'}>+</button>
 <button type="button" onClick={()=>onChange(100)}>{es?'Encajar':'Fit'}</button></div>;
}
export function CropControls({crop,onChange,es,disabled=false}:{crop:Crop;onChange:(crop:Crop)=>void;es:boolean;disabled?:boolean}) {
 const [fine,setFine]=useState(false),step=fine?.2:1;
 return <fieldset className="ecg-touch-controls" disabled={disabled}><legend>{es?'Ajustar sin arrastrar':'Adjust without dragging'}</legend>
 <label className="ecg-r-check"><input type="checkbox" checked={fine} onChange={e=>setFine(e.target.checked)}/>{es?'Ajuste fino':'Fine adjustment'}</label>
 <div role="group" aria-label={es?'Mover selección':'Move selection'}>{([["←",-step,0],["↑",0,-step],["↓",0,step],["→",step,0]] as const).map(([label,x,y],i)=><button type="button" key={label} aria-label={(es?['Mover a la izquierda','Mover hacia arriba','Mover hacia abajo','Mover a la derecha']:['Move left','Move up','Move down','Move right'])[i]} onClick={()=>onChange(moveCrop(crop,x,y))}>{label}</button>)}</div>
 <div><button type="button" onClick={()=>onChange(resizeCrop(crop,-step*2,0))}>{es?'Ancho −':'Width −'}</button><button type="button" onClick={()=>onChange(resizeCrop(crop,step*2,0))}>{es?'Ancho +':'Width +'}</button></div>
 <div><button type="button" onClick={()=>onChange(resizeCrop(crop,0,-step*2))}>{es?'Alto −':'Height −'}</button><button type="button" onClick={()=>onChange(resizeCrop(crop,0,step*2))}>{es?'Alto +':'Height +'}</button></div>
 </fieldset>;
}
export function SelectionGuide({es}:{es:boolean}) {
 return <details className="ecg-selection-guide"><summary>{es?'¿Cómo seleccionar una derivación?':'How do I select a lead?'}</summary>
 <p>{es?'Cada recuadro corresponde a una derivación (I, II, III, aVR, aVL, aVF o V1–V6). No estás seleccionando el eje eléctrico del corazón. Busca primero su nombre impreso.':'Each box corresponds to a lead (I, II, III, aVR, aVL, aVF or V1–V6). You are not selecting the electrical axis of the heart. Find its printed label first.'}</p>
 <svg viewBox="0 0 360 110" role="img" aria-label={es?'Ejemplo esquemático: recuadro que contiene ondas completas con margen arriba y abajo':'Schematic example: a box containing complete waves with space above and below'}><rect x="12" y="12" width="336" height="86" rx="8" fill="#fff9f2" stroke="#237458" strokeWidth="3"/><text x="24" y="35" fontSize="16" fill="#237458">II</text><path d="M24 72 L65 72 Q72 58 79 72 L95 72 L102 78 L109 37 L116 86 L123 72 L143 72 Q159 48 175 72 L205 72 Q212 58 219 72 L235 72 L242 78 L249 37 L256 86 L263 72 L283 72 Q299 48 315 72 L335 72" fill="none" stroke="#9e3026" strokeWidth="2"/></svg>
 <ol><li>{es?'Incluye el tramo continuo de esa derivación y sus ondas completas: P, QRS y T. Deja margen de cuadrícula arriba y abajo; no cortes los picos positivos ni negativos.':'Include the continuous segment of that lead and its complete P, QRS and T waves. Leave grid space above and below; do not clip positive or negative peaks.'}</li>
 <li>{es?'Evita incorporar el trazado de la fila vecina. Los recuadros pueden solaparse para conservar ondas altas; comprueba la señal que contiene cada uno. Evita texto y el pulso de calibración cuando sea posible.':'Avoid including the neighboring row’s tracing. Boxes may overlap to preserve tall waves; check the signal within each box. Avoid text and the calibration pulse where possible.'}</li>
 <li>{es?'La tira larga de II es una fila continua independiente. El pequeño recuadro de calibración se ajusta aparte a un cuadrado de 5 × 5 mm, no a las ondas.':'Long lead II is a separate continuous row. The small calibration box is adjusted separately to a 5 × 5 mm square, not to the waves.'}</li></ol>
 <p>{es?'En celular: usa Navegar para desplazar la imagen o ampliar con dos dedos. Los botones + y − amplían dentro del visor. Elige Mover recuadro para arrastrarlo, o usa las flechas y Ancho/Alto para ajustarlo sin arrastrar. Nuevo recuadro permite dibujarlo otra vez.':'On mobile: use Navigate to pan or pinch to zoom. The + and − buttons zoom inside the viewer. Choose Move rectangle to drag it, or use the arrows and Width/Height buttons to adjust without dragging. New rectangle lets you draw it again.'}</p></details>;
}
