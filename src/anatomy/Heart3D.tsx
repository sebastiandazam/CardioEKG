import {AnatomicalLabels} from './AnatomicalLabels';
import {defaultAnatomySource} from './labelLayout';
import {boundsFor} from './geometry';
import type {ClipPlane} from './geometry';
import type {ActivationFrame} from './activation';
import {electricalLayer} from './activation';
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Phase } from '../cases'
import { atlasUrl, myocardiumUrl, decodeAtlas } from './mesh'
import { localMeshes } from './local'
import { posterUrl } from './poster'
import { createHeartRenderer, type Vector, type Camera, type Layer, type Mesh, type Mode } from './render'
import './anatomy.css'

type Language = 'es' | 'en'
type Props = {
  language: Language
  finding: string
  activation?:ActivationFrame
  phase: Phase | null
  progress: number
  playing: boolean
  axisDeg: number | null
  allowRemote?: boolean
}
const home: Camera = { yaw: -0.08, pitch: 0.03, zoom: 1 }
const views: Mode[] = ['surface', 'inside', 'conduction', 'axis']
const structures: Record<string, [string, string]> = {
  'heart': ['Superficie cardíaca', 'Cardiac surface'],
  'right-atrium': ['Aurícula derecha', 'Right atrium'],
  'left-atrium': ['Aurícula izquierda', 'Left atrium'],
  'right-ventricle': ['Ventrículo derecho', 'Right ventricle'],
  'left-ventricle': ['Ventrículo izquierdo', 'Left ventricle'],
  'atrial-conduction':['Conducción auricular esquemática','Schematic atrial conduction'],
  'accessory-pathway':['Vía accesoria esquemática','Schematic accessory pathway'],
  'left-main-coronary-artery':['Tronco coronario izquierdo','Left main coronary artery'],
  'coronary-sinus':['Seno coronario','Coronary sinus'],
  'left-papillary-anterior':['Músculo papilar anterior izquierdo','Left anterior papillary muscle'],
  'left-papillary-anterolateral':['Músculo papilar anterolateral izquierdo','Left anterolateral papillary muscle'],
  'left-papillary-posteromedial':['Músculo papilar posteromedial izquierdo','Left posteromedial papillary muscle'],
  'right-papillary-septal':['Músculo papilar septal derecho','Right septal papillary muscle'],
  'right-papillary-posterior':['Músculo papilar posterior derecho','Right posterior papillary muscle'],
  'interventricular-septum': ['Tabique interventricular', 'Interventricular septum'],
  'ventricular-wall': ['Pared ventricular', 'Ventricular wall'],
  'tricuspid-valve': ['Válvula tricúspide', 'Tricuspid valve'],
  'mitral-valve': ['Válvula mitral', 'Mitral valve'],
  'aortic-valve': ['Válvula aórtica', 'Aortic valve'],
  'pulmonary-valve': ['Válvula pulmonar', 'Pulmonary valve'],
  'aorta': ['Aorta', 'Aorta'],
  'pulmonary-trunk': ['Tronco pulmonar', 'Pulmonary trunk'],
  'superior-vena-cava': ['Vena cava superior', 'Superior vena cava'],
  'inferior-vena-cava': ['Vena cava inferior', 'Inferior vena cava'],
  'pulmonary-veins': ['Venas pulmonares', 'Pulmonary veins'],
  'right-papillary-muscles': ['Músculos papilares derechos', 'Right papillary muscles'],
  'left-papillary-muscles': ['Músculos papilares izquierdos', 'Left papillary muscles'],
  'right-coronary-artery': ['Arteria coronaria derecha', 'Right coronary artery'],
  'left-coronary-artery': ['Arteria coronaria izquierda', 'Left coronary artery'],
  'left-anterior-descending-artery': ['Arteria descendente anterior', 'Left anterior descending artery'],
  'circumflex-artery': ['Arteria circunfleja', 'Circumflex artery'],
  'cardiac-veins': ['Venas cardíacas', 'Cardiac veins'],
  'sa-node': ['Nodo sinoauricular', 'Sinoatrial node'],
  'av-node': ['Nodo auriculoventricular', 'Atrioventricular node'],
  'bundle-of-his': ['Haz de His', 'Bundle of His'],
  'left-bundle-branch': ['Rama izquierda', 'Left bundle branch'],
  'right-bundle-branch': ['Rama derecha', 'Right bundle branch'],
  'purkinje-fibers': ['Fibras de Purkinje', 'Purkinje fibers'],
  'purkinje-left': ['Purkinje ventricular izquierdo', 'Left ventricular Purkinje fibers'],
  'purkinje-right': ['Purkinje ventricular derecho', 'Right ventricular Purkinje fibers'],
}

const phrases = {
  es: {
    modes: ['Superficie', 'Interior', 'Conducción', 'Eje QRS'],
    label: 'Modelo cardíaco 3D', layer: 'Vista del corazón', structure: 'Estructura anatómica', all: 'Todas',
    anterior: 'Vista anterior', posterior: 'Vista posterior', left: 'Vista lateral', closer: 'Acercar', farther: 'Alejar',
    hint: 'Arrastra para girar. Usa + y − para acercar o alejar.',
    basis: 'Anatomía humana de referencia. La conducción es una representación docente, no una simulación del tejido de esta persona.',
    partial: 'Vista local con estructuras de referencia. El atlas completo añade otras estructuras y capas.',
    atlas: 'Reintentar atlas anatómico', busy: 'Cargando atlas anatómico…', failure: 'No se pudo cargar el atlas ampliado. Se muestra la malla de respaldo con menos detalle.',
    static: 'Vista anatómica de referencia',
    noGraphics: 'Este navegador no ofrece la vista 3D. Puedes consultar el atlas interactivo.',
    reference: 'Fuentes y licencia de la anatomía', openAtlas: 'Abrir Heart Atlas',
    axisTitle: 'Eje eléctrico frontal del QRS', axisMissing: 'Sin estimación del eje para este caso.',
    categories: ['Eje normal en adultos', 'Desviación izquierda', 'Desviación derecha', 'Eje extremo'],
    axisNote: 'El vector representa la dirección eléctrica media en el plano frontal.',
    conductionNote: 'Nodo sinoauricular, nodo auriculoventricular, haz de His, ramas y fibras de Purkinje.',
    delayLeft: 'La rama izquierda se bloquea y la activación del ventrículo izquierdo se retrasa.',
    delayRight: 'La rama derecha se bloquea y la activación del ventrículo derecho se retrasa.',
    fibrillation: 'La activación auricular se muestra desorganizada.',
  },
  en: {
    modes: ['Surface', 'Inside', 'Conduction', 'QRS axis'],
    label: '3D heart model', layer: 'Heart view', structure: 'Anatomical structure', all: 'All structures',
    anterior: 'Anterior view', posterior: 'Posterior view', left: 'Lateral view', closer: 'Zoom in', farther: 'Zoom out',
    hint: 'Drag to orbit. Use + and − to zoom.',
    basis: 'Human reference anatomy. Conduction is a teaching illustration, not a simulation of this person’s tissue.',
    partial: 'Local view with reference structures. The full atlas adds structures and layers.',
    atlas: 'Retry anatomical atlas', busy: 'Loading anatomical atlas…', failure: 'The extended atlas could not be loaded. The fallback mesh has less detail.',
    static: 'Anatomical reference view',
    noGraphics: 'This browser cannot display the 3D view. You can open the interactive atlas.',
    reference: 'Anatomy sources and license', openAtlas: 'Open Heart Atlas',
    axisTitle: 'Frontal QRS axis', axisMissing: 'No axis estimate for this case.',
    categories: ['Normal adult axis', 'Left axis deviation', 'Right axis deviation', 'Extreme axis'],
    axisNote: 'The vector shows the mean electrical direction in the frontal plane.',
    conductionNote: 'Sinoatrial node, atrioventricular node, bundle of His, bundle branches, and Purkinje fibers.',
    delayLeft: 'The left bundle is blocked and left ventricular activation is delayed.',
    delayRight: 'The right bundle is blocked and right ventricular activation is delayed.',
    fibrillation: 'Atrial activation is shown as disorganized.',
  },
}

const isConduction = (id: string) => /node|bundle|purkinje|conduction|accessory/.test(id)
const isInternal = (id: string) => /valve|papillary|septum/.test(id)
const isBody = (id: string) => /atrium|ventric|heart|wall/.test(id)
const axisPoint = (axis: number, radius: number) => [110 + Math.cos(axis * Math.PI / 180) * radius, 100 + Math.sin(axis * Math.PI / 180) * radius] as const

export function axisCategory(degrees: number | null): number | null {
  if (degrees === null || !Number.isFinite(degrees) || degrees < -180 || degrees > 180) return null
  if (degrees >= -30 && degrees <= 90) return 0
  if (degrees >= -90 && degrees < -30) return 1
  if (degrees > 90 && degrees < 180) return 2
  return 3
}

function Axis({ degrees, language }: { degrees: number | null; language: Language }) {
  const copy = phrases[language]
  const cat = axisCategory(degrees)
  const marker = useId()
  const endpoint = cat === null ? null : axisPoint(degrees!, 62)
  const axes = [
    { name: 'I', deg: 0 }, { name: 'II', deg: 60 }, { name: 'III', deg: 120 },
    { name: 'aVR', deg: -150 }, { name: 'aVL', deg: -30 }, { name: 'aVF', deg: 90 },
  ]
  return (
    <div className="heart3d-axis">
      <svg viewBox="0 0 220 208" role="img" aria-label={copy.axisTitle}>
        <defs><marker id={marker} orient="auto" refX="8" refY="5" markerWidth="6" markerHeight="6"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>
        <circle cx="110" cy="100" r="72" fill="none" stroke="currentColor" opacity=".28"/>
        <circle cx="110" cy="100" r="57" fill="none" stroke="currentColor" opacity=".14"/>
        {axes.map(axis => {
          const [x1, y1] = axisPoint(axis.deg + 180, 72)
          const [x2, y2] = axisPoint(axis.deg, 72)
          const [x, y] = axisPoint(axis.deg, 85)
          return <g key={axis.name}><line x1={x1} x2={x2} y1={y1} y2={y2} stroke="currentColor" opacity=".20"/><text x={x} y={y + 4} textAnchor="middle" fill="currentColor" fontSize="10">{axis.name}</text></g>
        })}
        <circle cx="110" cy="100" r="3" fill="currentColor"/>
        {endpoint && <line x1="110" y1="100" x2={endpoint[0]} y2={endpoint[1]} stroke="currentColor" strokeWidth="3" markerEnd={`url(#${marker})`}/>}
      </svg>
      <div><strong>{cat === null ? copy.axisMissing : `${degrees! > 0 ? '+' : ''}${degrees}° · ${copy.categories[cat]}`}</strong><p>{copy.axisNote}</p></div>
    </div>
  )
}


export function Heart3D({ language, finding, phase, progress, playing, axisDeg,activation }: Props) {
  const copy = phrases[language]
  const labelFor = (id: string) => structures[id]?.[language === 'es' ? 0 : 1] ?? id.replace(/-/g, ' ')
  const [view, setView] = useState<Mode>('conduction')
  const [camera, setCamera] = useState(home)
  const [selected, setSelected] = useState('')
  const [anatomySource,setAnatomySource]=useState<'hra'|'atlas'>(defaultAnatomySource)
  const [isolate,setIsolate]=useState(false),[labels,setLabels]=useState(true)
  const [cutAxis,setCutAxis]=useState<'none'|'0'|'1'|'2'>('none')
  const [cutPosition,setCutPosition]=useState(50),[cutInvert,setCutInvert]=useState(false)
  const [contextOpacity,setContextOpacity]=useState(.16)
  const [meshes, setMeshes] = useState<Mesh[]>([])
  const [loading, setLoading] = useState(false)
  const [full, setFull] = useState(false)
  const [failed, setFailed] = useState(false)
  const [graphics, setGraphics] = useState(true)
  const [aspect, setAspect] = useState(1)
  const [viewport,setViewport]=useState({width:640,height:360})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null)
  const renderer = useRef<ReturnType<typeof createHeartRenderer> | null>(null)
  const abort = useRef<AbortController | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  useEffect(() => { void loadAtlas(defaultAnatomySource); return () => abort.current?.abort() }, [])
  useEffect(() => {
    const element = frame.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (height > 0) {setAspect(width / height);setViewport({width,height})}
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !meshes.length) return
    try {
      renderer.current = createHeartRenderer(canvas)
      renderer.current.setMeshes(meshes)
      setGraphics(true)
    } catch {
      setGraphics(false)
    }
    const lost = () => setGraphics(false)
    canvas.addEventListener('webglcontextlost', lost)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      renderer.current?.dispose()
      renderer.current = null
    }
  }, [meshes])

  async function loadAtlas(source=anatomySource) {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setFailed(false)
    setLoading(true)
    try {
      const response = await fetch(source==='hra'?myocardiumUrl:atlasUrl, { signal: controller.signal, referrerPolicy: 'no-referrer', credentials: 'omit' })
      if (!response.ok) throw new Error('Atlas unavailable')
      const data = await response.arrayBuffer()
      if (data.byteLength > 5 * 1024 * 1024) throw new Error('Atlas exceeds size limit')
      const reference = decodeAtlas(data,source)
      if (!reference.some(mesh => mesh.id === 'right-ventricle') || !reference.some(mesh => mesh.id === 'av-node')) throw new Error('Unexpected model')
      if (controller.signal.aborted) return
      setAnatomySource(source)
      setMeshes(reference)
      setFull(true)
      setSelected('')
      setCamera(home)
      setCutAxis('none')
    } catch {
      if (!controller.signal.aborted) {setFailed(true);setMeshes(localMeshes())}
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  const referenceMeshes=useMemo(()=>meshes.filter(mesh=>mesh.id!=='accessory-pathway'||/wpw|preexcitation|pre-excitation/.test(finding)),[meshes,finding])
  const list = useMemo(() => [...new Set(referenceMeshes.filter(mesh => {
    if (view === 'surface') return !isConduction(mesh.id) && !isInternal(mesh.id)
    if (view === 'inside') return !isConduction(mesh.id)
    return isConduction(mesh.id)
  }).map(mesh => mesh.id))], [referenceMeshes, view])
  const clip=useMemo<ClipPlane|null>(()=>{if(cutAxis==='none')return null;const axis=Number(cutAxis) as 0|1|2,[low,high]=boundsFor(meshes,axis);return {axis,position:low+(high-low)*cutPosition/100,invert:cutInvert}},[cutAxis,cutPosition,cutInvert,meshes])
  const tissue = useRef({ finding, phase, progress, playing,activation })
  tissue.current = { finding, phase, progress, playing,activation }
  function activationLayer(id:string,color:Vector){const state=tissue.current,frame=state.activation;const channel=frame?(/atrium|atrial|sa-node/.test(id)?frame.atrial:id==='av-node'?(frame.ventricular.phase?frame.ventricular:frame.atrial):frame.ventricular):state;return electricalLayer(id,color,channel.phase,channel.progress,state.finding);}

  useEffect(() => {
    if (!renderer.current || view === 'axis') return
    function layer(mesh: Mesh): Layer | null {
      const { id, color } = mesh
      if(id==='accessory-pathway'&&!/wpw|preexcitation|pre-excitation/.test(String(tissue.current.finding)))return null
      if(isolate&&selected&&id!==selected)return null
      if (view === 'surface' && (isInternal(id) || isConduction(id))) return null
      if (view === 'inside' && isConduction(id)) return null
      if (view === 'inside' && isBody(id) && selected !== id) return {...activationLayer(id,color), opacity: contextOpacity}
      if (view === 'conduction' && !isConduction(id)) return isInternal(id) ? null : {...activationLayer(id,color), opacity: contextOpacity}
      const electrical=activationLayer(id,color)
      if (view === 'conduction') return electrical
      if (selected === id) return { color: [0.96, 0.57, 0.32], emission: 0.12 }
      return electrical
    }
    renderer.current.draw(camera, layer,clip)
  }, [camera, aspect, meshes, selected, view, finding, phase, progress, playing, clip, isolate, contextOpacity])

  function rotate(yaw: number, pitch: number) {
    setCamera(current => ({
      ...current,
      yaw: (current.yaw + yaw) % (Math.PI * 2),
      pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, current.pitch + pitch)),
    }))
  }
  function zoom(change: number) {
    setCamera(current => ({ ...current, zoom: Math.min(1.75, Math.max(0.66, current.zoom + change)) }))
  }
  function key(event: KeyboardEvent<HTMLCanvasElement>) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-0.13, 0], ArrowRight: [0.13, 0], ArrowUp: [0, -0.13], ArrowDown: [0, 0.13] }
    if (directions[event.key]) rotate(...directions[event.key])
    else if (event.key === '+' || event.key === '=') zoom(0.12)
    else if (event.key === '-') zoom(-0.12)
    else if (event.key === 'Home') setCamera(home)
    else return
    event.preventDefault()
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const previous = drag.current
    if (!previous || previous.pointer !== event.pointerId) return
    rotate((event.clientX - previous.x) * 0.012, (event.clientY - previous.y) * 0.012)
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
  }
  const interactive = graphics && meshes.length > 0
  const status = view === 'conduction' && (finding === 'lbbb' ? copy.delayLeft : finding === 'rbbb' ? copy.delayRight : finding === 'af' ? copy.fibrillation : '')

  return <section className="heart3d" aria-label={copy.label}>
    <div className="heart3d-tabs" role="group" aria-label={copy.layer}>
      {views.map((mode, index) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => { setView(mode); setSelected('') }}>{copy.modes[index]}</button>)}
    </div>
    <label className="heart3d-picker">{language==='es'?'Atlas anatómico':'Anatomical atlas'}
      <select value={anatomySource} disabled={loading} onChange={e=>{void loadAtlas(e.target.value as 'hra'|'atlas')}}><option value="atlas">{language==='es'?'Heart Atlas · modelo principal':'Heart Atlas · main model'}</option><option value="hra">{language==='es'?'HRA · miocardio, tabique y válvulas':'HRA · myocardium, septum and valves'}</option></select>
    </label>
    <div className="heart3d-stage" ref={frame}>
      <canvas
        ref={canvasRef} hidden={view === 'axis' || !interactive} tabIndex={interactive && view !== 'axis' ? 0 : -1}
        aria-label={copy.label} onKeyDown={key}
        onPointerDown={event => {
          if (event.button !== 0) return
          drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={pointerMove}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onLostPointerCapture={() => { drag.current = null }}
        onWheel={event => { if (event.currentTarget === document.activeElement) zoom(event.deltaY > 0 ? -0.06 : 0.06) }}
      />
      {view !== 'axis' && !interactive && <img className="heart3d-poster" alt={copy.static} src={posterUrl}/>}
      {view !== 'axis' && interactive && labels && <AnatomicalLabels meshes={referenceMeshes} camera={camera} view={view} selected={selected} clip={clip} isolate={isolate} width={viewport.width} height={viewport.height} language={language} labelFor={labelFor} onSelect={setSelected}/>}
      {view === 'axis' && <Axis degrees={axisDeg} language={language}/>}
      {view !== 'axis' && interactive && <div className="heart3d-camera" aria-label={copy.label}>
        <button type="button" title={copy.anterior} aria-label={copy.anterior} onClick={() => setCamera(home)}>A</button>
        <button type="button" title={copy.posterior} aria-label={copy.posterior} onClick={() => setCamera({ ...home, yaw: Math.PI })}>P</button>
        <button type="button" title={copy.left} aria-label={copy.left} onClick={() => setCamera({ ...home, yaw: Math.PI / 2 })}>L</button>
        <button type="button" title={copy.farther} aria-label={copy.farther} onClick={() => zoom(-0.15)}>−</button>
        <button type="button" title={copy.closer} aria-label={copy.closer} onClick={() => zoom(0.15)}>+</button>
      </div>}
    </div>
    {view !== 'axis' && interactive && <details className="heart3d-more"><summary>{language==='es'?'Controles del modelo':'Model controls'}</summary>
      <p className="heart3d-hint">{copy.hint} {labels&&(language==='es'?'Pulsa un nombre sobre el modelo para seleccionar esa estructura. D e I señalan la derecha e izquierda anatómicas; el ápex marca la punta ventricular.':'Tap a name on the model to select that structure. R and L show anatomical right and left; the apex marks the ventricular tip.')}</p>
      <label className="heart3d-picker">{copy.structure}
        <select value={selected} onChange={event => setSelected(event.target.value)}>
          <option value="">{copy.all}</option>
          {list.map(id => <option key={id} value={id}>{labelFor(id)}</option>)}
        </select>
      </label>
      <div className="heart3d-settings">
       <label><input type="checkbox" checked={isolate} disabled={!selected} onChange={e=>setIsolate(e.target.checked)}/>{language==='es'?'Aislar estructura seleccionada':'Isolate selected structure'}</label>
       <label><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/>{language==='es'?'Referencias anatómicas visibles':'Visible anatomical references'}</label>
       <label>{language==='es'?'Opacidad del contexto':'Context opacity'} <input type="range" min=".04" max=".65" step=".01" value={contextOpacity} onChange={e=>setContextOpacity(Number(e.target.value))}/></label>
      </div>
      <fieldset className="heart3d-section"><legend>{language==='es'?'Corte anatómico':'Anatomical section'}</legend>
       <label>{language==='es'?'Plano':'Plane'} <select value={cutAxis} onChange={e=>setCutAxis(e.target.value as typeof cutAxis)}><option value="none">{language==='es'?'Sin corte':'No section'}</option><option value="2">{language==='es'?'Frontal':'Frontal'}</option><option value="0">{language==='es'?'Sagital':'Sagittal'}</option><option value="1">{language==='es'?'Transversal':'Transverse'}</option></select></label>
       {cutAxis!=='none'&&<><label>{language==='es'?'Posición del corte':'Section position'} <input type="range" min="0" max="100" step="1" value={cutPosition} onChange={e=>setCutPosition(Number(e.target.value))}/></label><label><input type="checkbox" checked={cutInvert} onChange={e=>setCutInvert(e.target.checked)}/>{language==='es'?'Invertir lado visible':'Reverse visible side'}</label><p>{language==='es'?'El plano corta la geometría real del atlas. Los bordes quedan abiertos; no se inventa tejido para cerrar el corte.':'The plane clips the atlas geometry. Edges remain open; no tissue is invented to close the section.'}</p></>}
      </fieldset>
      <p className="heart3d-detail">{anatomySource==='hra'?(language==='es'?'HRA: tabique interventricular con malla propia, paredes ventriculares, cavidades, válvulas y papilares. Los vasos y coronarias se exploran en el otro atlas.':'HRA: separate interventricular septum mesh, ventricular walls, chambers, valves and papillary muscles. Explore vessels and coronaries in the other atlas.'):(language==='es'?'Heart Atlas: cavidades, vasos, coronarias y válvulas. Las superficies ventriculares representan las cavidades; los tabiques no tienen malla propia.':'Heart Atlas: chambers, vessels, coronaries and valves. Ventricular surfaces represent cavities; septa have no separate mesh.')}</p>
    </details>}
    {view !== 'axis' && !graphics && <p>{copy.noGraphics}</p>}
    {view === 'conduction' && <p className="heart3d-detail">{copy.conductionNote} {status}</p>}
    {graphics && !full && <button className="heart3d-remote" type="button" onClick={()=>{void loadAtlas()}} disabled={loading}>{loading ? copy.busy : copy.atlas}</button>}
    {loading && <p className="heart3d-hint" role="status">{copy.busy}</p>}
    {failed && <p className="heart3d-hint" role="status">{copy.failure}</p>}
    <p className="heart3d-credit">{interactive && !full ? copy.partial : copy.basis}{' '}
      <a href={anatomySource==='hra'?'https://humanatlas.io/3d-reference-library':'https://w3lld1.github.io/heart-atlas/en/anatomy/'} target="_blank" rel="noopener noreferrer">{anatomySource==='hra'?'Human Reference Atlas':copy.openAtlas}</a>
      {' · '}<a href={anatomySource==='hra'?'/anatomy/LICENSE-HRA.txt':full || !interactive ? 'https://github.com/w3lld1/heart-atlas/blob/1b9fdd321cbc517802ffff4e0f896457a4a2b9a4/LICENSE-CONTENT' : 'https://github.com/fkong7/HeartDeformNets/tree/679c11169e100fca540855921a26c3e9f81d90dd/templates/meshes'} target="_blank" rel="noopener noreferrer">{copy.reference}</a>
      {full && anatomySource==='atlas' && <>{' · '}<a href="/anatomy/LICENSES.yaml" target="_blank" rel="noopener noreferrer">BodyParts3D · Heart Atlas · CC BY-SA 4.0</a></>}
    </p>
  </section>
}
