import {ReferenceLoupe} from './ReferenceLoupe';
import {referenceCorners,resizeReference} from './reference';
import type {ReferenceCorner} from './reference';
import {CropControls,ZoomButtons,useImageZoom} from './CropControls';
import {useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import type {Crop} from './digitize';
import type {SheetSource} from './SheetInput';
import type {ResearchLanguage} from './locale';
import {usePhotoUrl} from './usePhotoUrl';
import {cropInViewport,pointFromViewport} from './paper';
import {moveCrop} from './crop';

export function PaperCalibration({source,language,onSave,onCancel}:{source:SheetSource;language:ResearchLanguage;onSave:(reference:Crop)=>void;onCancel:()=>void}) {
 const es=language==='es',view=source.paper??{left:0,right:100,top:0,bottom:100};
 const w=view.right-view.left,h=view.bottom-view.top;
 const [box,setBox]=useState<Crop>(source.gridReference??source.automaticGrid??source.gridHint??(source.regionsLocated?{left:source.crops.I.left,right:source.crops.I.left+w*.025,top:source.crops.I.top,bottom:source.crops.I.top+w*.025*source.imageWidth/source.imageHeight}:{left:view.left+w*.1,right:view.left+w*.125,top:view.top+h*.15,bottom:view.top+h*.2}));
 const [confirmed,setConfirmed]=useState(false);
 const {zoom,setZoom,scroll}=useImageZoom(200);
 const [navigate,setNavigate]=useState(true);
 const [corner,setCorner]=useState<ReferenceCorner>('bottom-right');
 const [floatingSide,setFloatingSide]=useState<'left'|'right'|null>(null);
 const drag=useRef<{x:number;y:number;box:Crop;mode:'move'|ReferenceCorner}|null>(null);
 const frame=useRef<HTMLDivElement>(null);
 const url=usePhotoUrl(source.paperPreview);
 const display=cropInViewport(box,view);
 const widthPx=(box.right-box.left)*source.imageWidth/100,heightPx=(box.bottom-box.top)*source.imageHeight/100;
 const valid=widthPx>=6&&heightPx>=6;
 function change(next:Crop){setBox(next);setConfirmed(false);}
 function point(event:PointerEvent){const r=frame.current!.getBoundingClientRect();return pointFromViewport(Math.max(0,Math.min(100,100*(event.clientX-r.left)/r.width)),Math.max(0,Math.min(100,100*(event.clientY-r.top)/r.height)),view);}
 function start(event:PointerEvent,mode:'move'|ReferenceCorner) {
  if(!event.isPrimary||navigate||event.button!==0)return;event.preventDefault();setFloatingSide(event.clientX<window.innerWidth/2?'right':'left');if(mode!=='move')setCorner(mode);const p=point(event);drag.current={...p,box,mode};frame.current?.setPointerCapture(event.pointerId);
 }
 function motion(event:PointerEvent){
  const from=drag.current;if(!event.isPrimary||!from)return;const p=point(event);
  if(from.mode==='move')change(moveCrop(from.box,Math.max(view.left-from.box.left,Math.min(view.right-from.box.right,p.x-from.x)),Math.max(view.top-from.box.top,Math.min(view.bottom-from.box.bottom,p.y-from.y))));
  else change(resizeReference(from.box,from.mode,p.x-from.x,p.y-from.y,view));
 }
 return <section className="ecg-paper-calibration ecg-r-photo" aria-label={es?'Calibrar todo el papel una vez':'Calibrate the paper once'}>
  <h2>{es?'Una referencia para todas las derivaciones':'One reference for all leads'}</h2>
  <p>{es?'No redibujes las 13 zonas. Encaja el recuadro azul en un cuadro grande de la cuadrícula: 5 × 5 mm (cinco cuadros pequeños por lado). Arrastra el interior para moverlo y cualquiera de las cuatro esquinas para cambiar su tamaño.':'Do not redraw all 13 regions. Fit the blue box to one large grid square: 5 × 5 mm (five small squares per side). Drag inside to move it and any of its four corners to resize it.'}</p>
  <p className="ecg-r-muted">{es?'Usa la cuadrícula, no la altura de una onda. El papel debe verse plano, sin perspectiva marcada. La referencia se aplicará a todos los recortes del mismo archivo.':'Use the grid, not the height of a waveform. The paper should be flat, without marked perspective. This reference will apply to all crops from the same file.'}</p>
  <ZoomButtons zoom={zoom} onChange={setZoom} es={es}/>
  <div className="ecg-r-actions"><button type="button" aria-pressed={navigate} onClick={()=>setNavigate(true)}>{es?'Navegar':'Navigate'}</button><button type="button" aria-pressed={!navigate} onClick={()=>setNavigate(false)}>{es?'Ajustar referencia':'Adjust reference'}</button></div>
  <p>{navigate?(es?'Desliza para recorrer el papel. Usa + / − para ampliar o dos dedos para ampliar la página.':'Swipe to explore the paper. Use + / − to zoom or pinch to zoom the page.'):(es?'Arrastra el interior o una esquina azul. La lupa debajo muestra la esquina que estás ajustando; también puedes elegirla con sus botones.':'Drag inside or use a blue corner. The magnifier below shows the corner you are adjusting; you can also choose it using its buttons.')}</p>
  <div ref={scroll} className="ecg-sheet-scroll"><div ref={frame} className={`ecg-grid-ruler-frame ${navigate?'is-navigate':''}`} style={{width:`${zoom}%`,aspectRatio:`${source.imageWidth*w}/${source.imageHeight*h}`}}
   onPointerMove={motion} onPointerUp={event=>{if(!event.isPrimary)return;motion(event);drag.current=null;setFloatingSide(null);}} onPointerCancel={()=>{drag.current=null;setFloatingSide(null);}}>
   {url&&<img src={url} alt={es?'Papel del ECG para medir un cuadro de 5 mm':'ECG paper for measuring a 5 mm square'} draggable={false}/>}
   <div className="ecg-grid-ruler" style={{left:`${display.left}%`,top:`${display.top}%`,width:`${display.right-display.left}%`,height:`${display.bottom-display.top}%`}}>
    <button className="ecg-grid-ruler-move" type="button" aria-label={es?'Mover referencia de 5 mm':'Move 5 mm reference'} onPointerDown={e=>start(e,'move')}/>
    <span>5 × 5 mm</span>
    {referenceCorners.map((item,index)=><button key={item} className={`ecg-grid-ruler-corner is-${item}`} type="button" aria-label={(es?['Ajustar esquina superior izquierda','Ajustar esquina superior derecha','Ajustar esquina inferior izquierda','Ajustar esquina inferior derecha']:['Adjust top left corner','Adjust top right corner','Adjust bottom left corner','Adjust bottom right corner'])[index]} onPointerDown={e=>start(e,item)} onFocus={()=>setCorner(item)}><i aria-hidden="true"/></button>)}
   </div>
  </div></div>
  <ReferenceLoupe floatingSide={floatingSide} url={url} box={display} width={source.imageWidth*w/100} height={source.imageHeight*h/100} corner={corner} onCorner={setCorner} es={es}/>
  <CropControls crop={box} onChange={change} es={es}/>
  <details><summary>{es?'Ajuste preciso con teclado':'Precise keyboard adjustment'}</summary><div className="ecg-r-fields">{(['left','top','right','bottom'] as const).map((edge,index)=><label key={edge}>{(es?['Izquierda','Arriba','Derecha','Abajo']:['Left','Top','Right','Bottom'])[index]} (%)<input type="number" step=".01" value={Number(box[edge].toFixed(3))} onChange={e=>{const value=e.target.valueAsNumber;if(!Number.isFinite(value))return;const next={...box,[edge]:Math.max(0,Math.min(100,value))};if(next.right>next.left&&next.bottom>next.top)change(next);}}/></label>)}</div></details>
  {!valid&&<p role="status">{es?'Amplía la referencia hasta un cuadro grande completo.':'Expand the reference to one complete large square.'}</p>}
  <label className="ecg-r-check"><input type="checkbox" disabled={!valid} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{es?'Confirmo que el recuadro azul cubre exactamente 5 × 5 mm de la cuadrícula.':'I confirm that the blue box covers exactly 5 × 5 mm of the grid.'}</label>
  <div className="ecg-r-actions"><button type="button" className="ecg-r-primary" disabled={!confirmed||!valid} onClick={()=>onSave(box)}>{es?'Aplicar a todas las derivaciones':'Apply to all leads'}</button><button type="button" className="ecg-r-secondary" onClick={onCancel}>{es?'Volver sin cambiar la escala':'Go back without changing scale'}</button></div>
 </section>;
}
