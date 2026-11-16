import {CropControls,SelectionGuide,ZoomButtons,useImageZoom} from './CropControls';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { leads } from './digitize';
import type { CaptureLead, Crop } from './digitize';
import { usePhotoUrl, leadName } from './PhotoInput';
import { moveCrop } from './crop';
import {cropInViewport,pointFromViewport} from './paper';
import {significantOverlaps} from './regions';
import type { SheetSource } from './SheetInput';
import type { ResearchLanguage } from './locale';
import { pulseGainMm } from './layoutDetect';
import { forgetLearnedLayouts, learnLayout } from './layoutMemory';

const sequence: CaptureLead[] = [...leads,'II-long'];
const palette = ['#c2410c','#0369a1','#15803d','#7e22ce','#be123c','#0e7490','#a16207','#4338ca','#047857','#a21caf','#b45309','#1d4ed8','#475569'];
export function SheetReview({ source, onChange, language, active, onSelect, onReconstruct,onCalibrate }: {
  source: SheetSource; onChange: (source: SheetSource) => void; language: ResearchLanguage;
  active: CaptureLead; onSelect: (lead: CaptureLead) => void; onReconstruct:(source:SheetSource)=>void;onCalibrate:()=>void;
}) {
  const es = language === 'es';
  const regionsVisible=source.regionsLocated||source.manualTemplate;
  const visible:CaptureLead[] = !regionsVisible?[]:source.includeLong?sequence:[...leads];
  const [bulkConfirmation,setBulkConfirmation]=useState(true);
  const [forgotten,setForgotten]=useState(false);
  const conflicts=significantOverlaps(Object.fromEntries(visible.map(lead=>[lead,source.crops[lead]])));
  const [fullImage,setFullImage]=useState(false);
  useEffect(()=>setFullImage(false),[source.fingerprint]);
  const view=fullImage||!source.paper?{left:0,right:100,top:0,bottom:100}:source.paper;
  const viewWidth=source.imageWidth*(view.right-view.left)/100,viewHeight=source.imageHeight*(view.bottom-view.top)/100;
  const url = usePhotoUrl(fullImage?source.preview:source.paperPreview);
  const {zoom,setZoom,scroll} = useImageZoom();
  const [mode,setMode] = useState<'navigate'|'move'|'draw'>('navigate');
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const imageArea = useRef<HTMLDivElement>(null);
  const confirmed = leads.filter(lead => source.confirmed[lead]).length;
  const crop = source.crops[active];
  const color = palette[sequence.indexOf(active)];
  const pulseMm = pulseGainMm(source.structure, source.paper, source.gridReference);
  const pulseMismatch = pulseMm !== null && Math.abs(pulseMm - source.gain) > source.gain * .15;
  const placedBy = source.sources?.[active];
  const placedText = !placedBy ? '' : es
    ? ({label:'ubicada por su etiqueta impresa',learned:'ubicada según tus correcciones anteriores',ink:'ubicada sobre el trazado detectado',template:'posición estándar: no se detectó el trazado; ajústala'} as const)[placedBy]
    : ({label:'placed by its printed label',learned:'placed from your previous corrections',ink:'placed on the detected tracing',template:'standard position: tracing not detected; adjust it'} as const)[placedBy];
  function reconstruct(next: SheetSource) {
    // Learn the confirmed geometry for this sheet type (local to this browser, geometry only).
    if (next.layout) learnLayout(next.structure, next.layout, Object.fromEntries(visible.map(lead => [lead, next.crops[lead]])));
    onReconstruct(next);
  }
  function updateCrop(next: Crop) {
    if (source.ocrStatus==='working'||!regionsVisible) return;
    onChange({ ...source, crops: { ...source.crops,[active]: next }, confirmed: { ...source.confirmed,[active]: false },
      evidence: { ...source.evidence,[active]: { method: 'manual' } }, revision: source.revision+1 });
  }
  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return pointFromViewport(Math.max(0,Math.min(100,100*(event.clientX-rect.left)/rect.width)),Math.max(0,Math.min(100,100*(event.clientY-rect.top)/rect.height)),view);
  }
  function movement(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || !drag.current) return;
    const start = drag.current, end = point(event);
    const next = mode === 'move' ? moveCrop(start.crop,end.x-start.x,end.y-start.y) : {
      left: Math.min(start.x,end.x),right:Math.max(start.x,end.x),top:Math.min(start.y,end.y),bottom:Math.max(start.y,end.y),
    };
    if (next.right-next.left > .5 && next.bottom-next.top > .5) updateCrop(next);
  }
  function confirm() {
    onChange({ ...source, confirmed: { ...source.confirmed,[active]: true } });
    onSelect(leads.find(lead => lead !== active && !source.confirmed[lead]) ?? active);
    setMode('move');
  }
  return <section className="ecg-sheet-review" aria-label={es ? 'Revisar las derivaciones sobre el ECG' : 'Review leads on the ECG'}>
    <div className="ecg-sheet-main">
      <div className="ecg-sheet-toolbar">
        <div><h2>{es ? 'Ubica y confirma las derivaciones' : 'Locate and confirm the leads'}</h2>
          <p>{es ? 'Selecciona un color en la imagen o una derivación en el panel. Comprueba su etiqueta y que el recuadro incluya todo su trazado.' : 'Select a colored box or a lead in the panel. Check its printed label and that the box contains its full tracing.'}</p></div>
        <SelectionGuide es={es}/><ZoomButtons zoom={zoom} onChange={setZoom} es={es}/>
        <div className="ecg-r-actions">
          <button type="button" className="ecg-r-secondary" aria-pressed={mode==='navigate'} onClick={()=>setMode('navigate')}>{es?'Navegar':'Navigate'}</button>
          {source.paper&&<button type="button" className="ecg-r-secondary" onClick={()=>setFullImage(value=>!value)}>{fullImage?(es?'Centrar en el ECG':'Focus ECG'):(es?'Ver imagen completa':'View full image')}</button>}
          <button type="button" className="ecg-r-secondary" disabled={source.ocrStatus==='working'||!regionsVisible} aria-pressed={mode==='move'} onClick={()=>setMode('move')}>{es ? 'Mover recuadro' : 'Move rectangle'}</button>
          <button type="button" className="ecg-r-secondary" disabled={source.ocrStatus==='working'||!regionsVisible} aria-pressed={mode==='draw'} onClick={()=>setMode('draw')}>{es ? 'Nuevo recuadro' : 'New rectangle'}</button>
        </div>
      </div>
      <p className="ecg-r-muted" aria-live="polite">{mode==='navigate' ? (es?'Desliza para recorrer el ECG. Usa + / − para ampliar, o dos dedos para ampliar la página. Selecciona Mover recuadro para editar.':'Swipe to explore the ECG. Use + / − to zoom, or pinch to zoom the page. Select Move rectangle to edit.') : mode==='draw' ? (es ? `Dibuja la nueva zona de ${leadName(active,language)} sobre la imagen.` : `Draw the new ${leadName(active,language)} region on the image.`) : (es ? 'Arrastra el recuadro activo para moverlo manteniendo el tamaño. Usa las flechas con el recuadro enfocado.' : 'Drag the active box to move it without resizing. Use arrow keys with the box focused.')}</p>
      <div ref={scroll} className="ecg-sheet-scroll">
        <div ref={imageArea} className={`ecg-sheet-image is-${mode}`} style={{ width: `${zoom}%`,aspectRatio:`${viewWidth}/${viewHeight}`,minHeight:0 }} onPointerDown={event=>{
          if (!event.isPrimary||mode==='navigate'||event.button!==0 || source.ocrStatus==='working'||!regionsVisible) return;
          const p=point(event);
          if (mode==='move' && (p.x<crop.left || p.x>crop.right || p.y<crop.top || p.y>crop.bottom)) return;
          drag.current={ ...p,crop }; event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={movement} onPointerUp={event=>{
          if (!event.isPrimary || !drag.current) return; movement(event); drag.current=null; setMode('move');
        }} onPointerCancel={()=>{ if (drag.current) updateCrop(drag.current.crop); drag.current=null; }}>
          {url && <img src={url} width={Math.round(viewWidth)} height={Math.round(viewHeight)} alt={es ? 'ECG completo con zonas de derivaciones' : 'Full ECG with lead regions'} draggable={false} />}
          {visible.map((lead)=>{
            const index=sequence.indexOf(lead);
            const box=source.crops[lead];
            const display=cropInViewport(box,view);
            return <button key={lead} type="button" className={`ecg-sheet-box ${active===lead?'is-active':''} ${source.confirmed[lead]?'is-confirmed':''}`}
              aria-label={`${leadName(lead,language)} · ${source.confirmed[lead] ? (es?'zona confirmada':'region confirmed') : (es?'por confirmar':'needs confirmation')}`}
              aria-pressed={active===lead}
              style={{ '--lead-color':palette[index],left:`${display.left}%`,top:`${display.top}%`,width:`${display.right-display.left}%`,height:`${display.bottom-display.top}%` } as CSSProperties}
              onPointerDown={event=>{ if (active!==lead && mode!=='draw') { event.stopPropagation();onSelect(lead); } }}
              onClick={()=>{if(mode!=='draw')onSelect(lead);}}
              onKeyDown={event=>{
                if (source.ocrStatus==='working'||!regionsVisible) return;
                if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
                event.preventDefault();onSelect(lead);
                const step=event.shiftKey?2:.5;
                const next=moveCrop(box,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);
                onChange({ ...source,crops:{ ...source.crops,[lead]:next },confirmed:{ ...source.confirmed,[lead]:false },evidence:{ ...source.evidence,[lead]:{method:'manual'} },revision:source.revision+1 });
              }}>
              <span>{leadName(lead,language)} {source.confirmed[lead]?'✓':''}</span>
            </button>;
          })}
        </div>
      </div>
      {regionsVisible&&<div className="ecg-mobile-adjust"><strong>{leadName(active,language)}</strong><CropControls crop={crop} onChange={updateCrop} es={es} disabled={source.ocrStatus==='working'}/></div>}
    </div>
    <aside className="ecg-sheet-sidebar" aria-label={es?'Panel de derivaciones':'Lead panel'}>
      {!regionsVisible&&<div className="ecg-r-error" role="status"><p>{es?'No se localizaron filas de trazado con suficiente evidencia. No se han colocado recuadros automáticos sobre el fondo. Puedes revisar otra imagen o colocar una plantilla manual.':'Tracing rows could not be located with sufficient evidence. No automatic boxes have been placed on the background. Try another image or place a manual template.'}</p>
        <button type="button" className="ecg-r-secondary" disabled={source.ocrStatus==='working'} onClick={()=>onChange({...source,manualTemplate:true,includeLong:false})}>{es?'Colocar plantilla manual':'Place manual template'}</button></div>}
      {source.paper&&<p className="ecg-r-muted">{es?'Área del papel localizada; márgenes oscuros excluidos del análisis.':'Paper area located; dark margins excluded from analysis.'}</p>}
      {source.manualTemplate&&!source.regionsLocated&&<p className="ecg-r-muted">{es?'Plantilla manual: estas zonas no son una detección de trazados.':'Manual template: these regions are not detected tracings.'}</p>}
      <h3>{es ? 'Derivaciones' : 'Leads'} <span>{confirmed}/12</span></h3>
      <p role="status">{source.ocrStatus==='working'
        ? (es?'Leyendo etiquetas con IA local… ':'Reading labels with local AI… ')+Math.round(source.ocrProgress*100)+'%'
        : source.ocrStatus==='failed' ? (es?'No se pudieron leer las etiquetas. Las zonas por posición siguen disponibles para editar.':'Could not read labels. Positional suggestions remain available to edit.')
        : (es?'Etiquetas leídas: ':'Labels read: ')+leads.filter(lead=>source.evidence[lead]?.method==='ocr').length+'/12'}</p>
      <nav className="ecg-sheet-list" aria-label={es?'Seleccionar derivación':'Select lead'}>
        {visible.map((lead)=><button key={lead} type="button" aria-pressed={active===lead} onClick={()=>{onSelect(lead);setMode('move');}} style={{'--lead-color':palette[sequence.indexOf(lead)]} as CSSProperties}>
          <span className="ecg-sheet-dot" /><strong>{leadName(lead,language)}</strong>
          <span>{source.confirmed[lead]?'✓':source.evidence[lead]?.method==='ocr'?'IA':source.evidence[lead]?.method==='manual'?(es?'Editada':'Edited'):(es?'Posición':'Position')}</span>
        </button>)}
      </nav>
      {regionsVisible&&<div className="ecg-sheet-editor" style={{'--lead-color':color} as CSSProperties}>
        <h3>{leadName(active,language)}</h3>
        <p>{source.evidence[active]?.method==='ocr' ? (es?'Etiqueta reconocida por OCR neuronal; confirma la ubicación.':'Label read by neural OCR; confirm its location.') : source.evidence[active]?.method==='manual' ? (es?'Zona modificada manualmente.':'Manually edited region.') : (es?'Sugerencia por posición; comprueba el nombre impreso.':'Positional suggestion; check the printed name.')}</p>
        <button type="button" className="ecg-r-primary" disabled={source.ocrStatus==='working'||!regionsVisible} onClick={confirm}>{es?'Confirmar zona':'Confirm region'} · {leadName(active,language)}</button>
        <details><summary>{es?'Ajustar bordes':'Adjust edges'}</summary>
          <div className="ecg-r-fields">{(['left','right','top','bottom'] as const).map((edge,index)=><label key={edge}>{(es?['Izquierda','Derecha','Arriba','Abajo']:['Left','Right','Top','Bottom'])[index]} (%)
            <input type="number" min="0" max="100" step=".1" disabled={source.ocrStatus==='working'||!regionsVisible} value={Number(crop[edge].toFixed(1))} onChange={e=>{
              const value=e.target.valueAsNumber;if(!Number.isFinite(value))return;
              const next={...crop,[edge]:Math.min(100,Math.max(0,value))};
              if(next.right-next.left>=.5&&next.bottom-next.top>=.5)updateCrop(next);
            }} /></label>)}</div>
        </details>
        <label>{es?'Cambiar asignación de esta zona':'Change this region’s lead'}
          <select disabled={source.ocrStatus==='working'||!regionsVisible} value={active} onChange={e=>{
            const target=e.target.value as CaptureLead;
            onChange({...source,crops:{...source.crops,[active]:source.crops[target],[target]:crop},confirmed:{...source.confirmed,[active]:false,[target]:false},evidence:{...source.evidence,[active]:{method:'manual'},[target]:{method:'manual'}},revision:source.revision+1});onSelect(target);
          }}>{visible.map(lead=><option value={lead} key={lead}>{leadName(lead,language)}</option>)}</select>
        </label>
      </div>}
      <fieldset className="ecg-r-calibration"><legend>{es?'Calibración impresa del registro':'Printed recording calibration'}</legend>
        <div className="ecg-r-fields"><label>{es?'Velocidad':'Speed'}<select value={source.speed} onChange={e=>onChange({...source,speed:Number(e.target.value) as 25|50})}><option value={25}>25 mm/s</option><option value={50}>50 mm/s</option></select></label>
        <label>{es?'Ganancia':'Gain'}<select value={source.gain} onChange={e=>onChange({...source,gain:Number(e.target.value) as 5|10|20})}>{[5,10,20].map(value=><option value={value} key={value}>{value} mm/mV</option>)}</select></label></div>
        <p>{pulseMm!==null
          ? (es?`Pulso de calibración detectado: ${pulseMm} mm de altura, es decir, ≈ ${pulseMm} mm/mV.${pulseMismatch?' No coincide con la ganancia elegida: revisa el ajuste antes de medir voltajes.':' Coincide con la ganancia elegida.'}`:`Calibration pulse detected: ${pulseMm} mm tall, i.e. ≈ ${pulseMm} mm/mV.${pulseMismatch?' It does not match the selected gain: check before measuring voltages.':' It matches the selected gain.'}`)
          : source.structure?.bands.some(b=>b.pulse)
            ? (es?'Se detectó el pulso de calibración; calibra la cuadrícula una vez para comprobar la ganancia en mm/mV.':'A calibration pulse was found; calibrate the grid once to check the gain in mm/mV.')
            : (es?'No se detectó un pulso de calibración. Comprueba la ganancia impresa. Puedes ajustar cada derivación y esos ajustes se conservan.':'No calibration pulse was found. Check the printed gain. Individual lead settings are preserved.')}</p>
        <label>{es?'Ganancia precordial (V1–V6)':'Precordial gain (V1–V6)'}<select value={source.calibrationByLead?.V1?.gain??source.gain} onChange={e=>{const gain=Number(e.target.value) as 5|10|20;onChange({...source,calibrationByLead:{...source.calibrationByLead,...Object.fromEntries(['V1','V2','V3','V4','V5','V6'].map(lead=>[lead,{speed:source.speed,gain}]))}})}}>{[5,10,20].map(value=><option value={value} key={value}>{value} mm/mV</option>)}</select></label>
      </fieldset>
      {source.printedCalibration&&(source.printedCalibration.speed||source.printedCalibration.gain)&&<p className="ecg-r-muted" role="status">{es?'Texto impreso leído':'Printed text read'}: {[source.printedCalibration.speed&&`${source.printedCalibration.speed} mm/s`,source.printedCalibration.gain&&`${source.printedCalibration.gain} mm/mV`].filter(Boolean).join(', ')}{es?'. Se aplicó a velocidad y ganancia; cámbialo si no corresponde.':'. Applied to speed and gain; change it if wrong.'}</p>}
      {placedText&&<p className="ecg-r-muted" role="status">{leadName(active,language)}: {placedText}.</p>}
      {source.layoutInferred&&source.layout&&<p className="ecg-r-muted">{es?`Distribución detectada: ${source.layout==='4x3'?'4 columnas × 3 filas':'2 columnas × 6 filas'}${source.structure?` · ${source.structure.bands.length} bandas de trazado`:''}.`:`Detected layout: ${source.layout==='4x3'?'4 columns × 3 rows':'2 columns × 6 rows'}${source.structure?` · ${source.structure.bands.length} tracing bands`:''}.`}</p>}
      {!!source.skewDegrees&&<p className="ecg-r-muted" role="status">{es?`La imagen estaba inclinada ${Math.abs(source.skewDegrees).toLocaleString('es')}° y se enderezó automáticamente.`:`The image was tilted ${Math.abs(source.skewDegrees)}° and was straightened automatically.`}</p>}
      {source.layoutAmbiguous&&<p className="ecg-r-muted" role="status">{es?'Distribución ambigua: se asumió 4 columnas × 3 filas. Si la hoja es de 2 × 6, cámbiala en «Distribución de las derivaciones».':'Ambiguous layout: 4 columns × 3 rows was assumed. If the sheet is 2 × 6, change it under “Lead layout”.'}</p>}
      <button type="button" className="ecg-r-quiet" onClick={()=>{forgetLearnedLayouts();setForgotten(true);}}>{es?'Olvidar las zonas aprendidas en este navegador':'Forget regions learned in this browser'}</button>
      {forgotten&&<p className="ecg-r-muted" role="status">{es?'Zonas aprendidas borradas.':'Learned regions erased.'}</p>}
      <button type="button" className="ecg-r-secondary" onClick={onCalibrate}>{es?'Calibrar cuadrícula una vez':'Calibrate grid once'}</button>
      {source.gridReference&&<p className="ecg-r-muted">{es?'Referencia de 5 × 5 mm confirmada para todo el registro.':'5 × 5 mm reference confirmed for the recording.'}</p>}
      <label className="ecg-r-check"><input type="checkbox" checked={source.includeLong} disabled={source.ocrStatus==='working'||!regionsVisible} onChange={e=>{onChange({...source,includeLong:e.target.checked,confirmed:{...source.confirmed,'II-long':false}});if(!e.target.checked&&active==='II-long')onSelect('I');}}/>{es?'Incluir tira larga de II (solo si existe una zona independiente)':'Include long lead II (only if a separate region exists)'}</label>
      {conflicts.length>0&&<p className="ecg-r-muted" role="status">{es?'Superposición amplia: ':'Broad overlap: '}{conflicts.map(pair=>pair.join(' / ')).join(', ')}{es?'. Puedes continuar; comprueba que cada zona siga mostrando su derivación.':'. You can continue; check that each region still shows its own lead.'}</p>}
      <p className="ecg-r-muted">{es?'Confirmar la zona no confirma la calidad de la señal. Al terminar, se dibujarán todos los trazados automáticamente. Solo se pedirán correcciones donde falle la reconstrucción o la escala sea incierta.':'Confirming a region does not confirm signal quality. All tracings will then be drawn automatically. Corrections are requested only where reconstruction fails or the scale is uncertain.'}</p>
      <details><summary>{es?'Cambiar a confirmación individual (opcional)':'Switch to individual confirmation (optional)'}</summary>
      <label className="ecg-r-check"><input type="checkbox" checked={bulkConfirmation} onChange={e=>setBulkConfirmation(e.target.checked)}/>{es?'Aceptar todas las zonas con un solo botón':'Accept all regions with one button'}</label>
      <p className="ecg-r-muted">{bulkConfirmation?(es?'Al pulsar «Aceptar todos» confirmas las etiquetas y zonas visibles del mapa. La escala y la calidad de señal se verifican durante la reconstrucción.':'Selecting “Accept all” confirms the visible labels and regions on the map. Scale and signal quality are checked during reconstruction.'):(es?'Confirma cada zona por separado antes de reconstruir.':'Confirm each region separately before reconstructing.')}</p>
      </details>
      <button type="button" className="ecg-r-primary" disabled={!regionsVisible||(!bulkConfirmation&&(confirmed!==12||(source.includeLong&&!source.confirmed['II-long'])))||source.ocrStatus==='working'} onClick={()=>reconstruct(bulkConfirmation?{...source,confirmed:Object.fromEntries(visible.map(lead=>[lead,true]))}:source)}>{bulkConfirmation?(es?'Aceptar todos y reconstruir':'Accept all and reconstruct'):(es?'Reconstruir zonas confirmadas':'Reconstruct confirmed regions')}</button>
    </aside>
  </section>;
}
