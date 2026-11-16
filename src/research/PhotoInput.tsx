import {CropControls,SelectionGuide,ZoomButtons,useImageZoom} from './CropControls';
import {dimensionsFromReference,isScaleProblem,canUseAutomaticReference} from './sharedScale';
import type {RasterDraft} from './photoRaster';
import { usePhotoUrl } from './usePhotoUrl';
import { DocumentPicker } from './DocumentPicker';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent, ReactNode } from 'react';
import type { Calibration, CaptureLead, Crop, DigitizedTrace } from './digitize';
import { moveCrop } from './crop';
import { fingerprintPhoto, runWorker, validatePhoto } from './photo';
import type { AcceptedPhoto } from './photo';
import { ResearchError, researchMessage, researchText } from './locale';
import type { ResearchLanguage, ResearchMessage } from './locale';

const wholeImage: Crop = { left: 0, top: 0, right: 100, bottom: 100 };
const decimal = {
  es: new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
};

export const leadName = (lead: CaptureLead, language: ResearchLanguage = 'es') =>
  lead === 'II-long' ? researchText[language].longStrip : lead;

export { usePhotoUrl } from './usePhotoUrl';

export function PhotoTrace({ photo, children, language = 'es' }: {
  photo: {image:Blob;result:Pick<DigitizedTrace,'width'|'height'|'points'>}; children?: ReactNode; language?: ResearchLanguage;
}) {
  const copy = researchText[language];
  const url = usePhotoUrl(photo.image);
  const { width, height, points } = photo.result;
  const path = points.map((point, index) => `${index},${point}`).join(' ');
  const [overlay, setOverlay] = useState(true);
  return (
    <>
      <div className="ecg-r-overlay" style={{ aspectRatio: `${width} / ${height}` }}>
        {url && <img src={url} alt={copy.croppedLead} />}
        {overlay && <svg viewBox={`0 0 ${width} ${height}`} aria-label={copy.signal} role="img">
          <polyline points={path} fill="none" stroke="#1853ef" strokeWidth={1.5}
            vectorEffect="non-scaling-stroke" />
        </svg>}
        {children}
      </div>
      <label className="ecg-r-check">
        <input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} />
        {copy.showSignal}
      </label>
    </>
  );
}

export function TraceScale({ trace, language = 'es' }: { trace: DigitizedTrace; language?: ResearchLanguage }) {
  const copy = researchText[language];
  const format = decimal[language];
  return <p className="ecg-r-muted">
    {format.format(trace.seconds)} s · {format.format(trace.timeMm)} × {format.format(trace.voltageMm)} mm ·{' '}
    {trace.gridUnitEvidence==='periodic-only' ? (language==='es'?'Escala sin verificar':'Unverified scale') : trace.calibration === 'grid' ? copy.grid : copy.manual}
  </p>;
}

interface Props {
  lead: CaptureLead;
  current?: AcceptedPhoto;
  initialDraft?:RasterDraft;
  fingerprints: string[];
  onAccept: (photo: AcceptedPhoto) => void;
  onRemove: () => void;
  language?: ResearchLanguage;
  sheet?: { file: File; fingerprint: string; crop: Crop; speed?:Calibration['speed']; gain?:Calibration['gain'];reference?:Crop;automaticReference?:Crop };
}

export function PhotoInput({ lead, current, fingerprints, onAccept, onRemove, sheet, initialDraft, language = 'es' }: Props) {
  const copy = researchText[language];
  const [file, setFile] = useState<File | null>(sheet && !current ? sheet.file : null);
  const [hash, setHash] = useState(sheet?.fingerprint ?? '');
  const [crop, setCrop] = useState(current?.sourceCrop ?? sheet?.crop ?? wholeImage);
  const [speed, setSpeed] = useState<Calibration['speed']>(current?.result.speed??sheet?.speed??25);
  const [gain, setGain] = useState<Calibration['gain']>(current?.result.gain??sheet?.gain??10);
  const [manual, setManual] = useState(false);
  const [widthMm, setWidthMm] = useState('');
  const [heightMm, setHeightMm] = useState('');
  const [draft,setDraft]=useState<RasterDraft|null>(initialDraft??null);
  const [preview, setPreview] = useState<AcceptedPhoto | null>(null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<ResearchMessage | null>(null);
  const [working, setWorking] = useState(false);
  const [sourceCovered, setSourceCovered] = useState(!!sheet);
  const {zoom,setZoom,scroll} = useImageZoom();
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [cropMode, setCropMode] = useState<'navigate' | 'move' | 'draw'>('navigate');
  const startPoint = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const photoUrl = usePhotoUrl(file);

  useEffect(() => () => {
    generation.current++;
    controller.current?.abort();
  }, []);

  function clearEstimate() {
    setDraft(null);
    setPreview(null);
    setVerified(false);
    setError(null);
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!selected) return;
    await openPhoto(selected);
  }

  async function openPhoto(selected: File) {
    const revision = ++generation.current;
    setWorking(true);
    setFile(null);
    clearEstimate();
    try {
      await validatePhoto(selected);
      const fingerprint = await fingerprintPhoto(selected);
      if (generation.current !== revision) return;
      if (fingerprints.includes(fingerprint)) {
        throw new ResearchError('duplicatePhoto');
      }
      setHash(fingerprint);
      setCrop(wholeImage);
      if (current) onRemove();
      setFile(selected);
    } catch (caught) {
      if (generation.current === revision) {
        setError(caught instanceof ResearchError ? caught.code : 'openImage');
      }
    } finally {
      if (generation.current === revision) setWorking(false);
    }
  }

  function changeCrop(next: Crop) {
    if(manual&&Math.abs((next.right-next.left)-(crop.right-crop.left))>.0001)setWidthMm('');
    if(manual&&Math.abs((next.bottom-next.top)-(crop.bottom-crop.top))>.0001)setHeightMm('');
    setCrop(next);
    clearEstimate();
  }

  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalize = (pixels: number, size: number) => Math.min(100, Math.max(0, 100 * pixels / size));
    return {
      x: normalize(event.clientX - rect.left, rect.width),
      y: normalize(event.clientY - rect.top, rect.height),
    };
  }

  function drawCrop(event: PointerEvent<HTMLDivElement>) {
    const start = startPoint.current;
    if (!event.isPrimary || !start) return;
    const end = point(event);
    const next = cropMode === 'move' ? moveCrop(start.crop, end.x - start.x, end.y - start.y) : {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y),
    };
    if (next.right - next.left >= .5 && next.bottom - next.top >= .5) changeCrop(next);
  }

  async function estimate() {
    if (!file || working) return;
    clearEstimate();
    if (crop.right - crop.left < 0.5 || crop.bottom - crop.top < 0.5) {
      setError('completeCrop');
      return;
    }
    const parseDecimal = (value: string) => Number(value.replace(',', '.'));
    const width = parseDecimal(widthMm);
    const height = parseDecimal(heightMm);
    if (manual && (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0)) {
      setError('cropDimensions');
      return;
    }
    setWorking(true);
    const activeController = new AbortController();
    controller.current = activeController;
    try {
      let response = await runWorker({
        kind: 'photo', photo: file, crop,
        calibration: { speed,gain,...(manual?{widthMm:width,heightMm:height}:sheet?.reference?dimensionsFromReference(crop,sheet.reference):{widthMm:null,heightMm:null}) },
      }, activeController.signal);
      if(response.kind==='photo-draft'&&!manual&&!sheet?.reference&&sheet?.automaticReference&&canUseAutomaticReference(response.code)) {
        response=await runWorker({kind:'photo',photo:file,crop,calibration:{speed,gain,...dimensionsFromReference(crop,sheet.automaticReference),source:'paper-grid'}},activeController.signal);
      }
      if(response.kind==='photo-draft'){setDraft(response);setError(response.code);return;}
      if (response.kind !== 'photo') {
        throw new ResearchError(response.kind === 'error' ? response.code : 'reconstructFailed');
      }
      setPreview({calibrationKey:sheet?.reference?JSON.stringify(sheet.reference):undefined, image: response.image, result: response.result, fingerprint: sheet&&file===sheet.file ? `${sheet.fingerprint}:${lead}` : hash, sourceCrop: crop });
    } catch (caught) {
      if (!activeController.signal.aborted) {
        setError(caught instanceof ResearchError ? caught.code : 'reconstructFailed');
      }
    } finally {
      if (!activeController.signal.aborted) setWorking(false);
      if (controller.current === activeController) controller.current = null;
    }
  }

  const draftPreview = preview ?? (!file ? current : null);

  return (
    <section className="ecg-r-photo" aria-labelledby="ecg-r-photo-title">
      <div className="ecg-r-section-heading">
        <div>
          <h2 id="ecg-r-photo-title">{leadName(lead, language)}</h2>
          <p>{lead === 'II-long' ? copy.longPhoto : copy.individualPhoto}</p>
        </div>
        <svg className="ecg-r-capture-pulse" viewBox="0 0 130 42" aria-hidden="true">
          <path d="M0 28H24C28 28 29 21 34 21S39 28 44 28H56L60 34 65 7 71 39 77 28H88C94 28 98 16 104 16S113 28 119 28H130"
            pathLength="1" />
        </svg>
      </div>
      {!sheet && <label className="ecg-r-check">
        <input type="checkbox" checked={sourceCovered} disabled={working}
          onChange={(event) => setSourceCovered(event.target.checked)} />
        {copy.covered}
      </label>}
      <div className="ecg-r-actions">
        {!sheet && <><label className={`ecg-r-upload ${!sourceCovered || working ? 'is-disabled' : ''}`}>
          {copy.takePhoto}
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
            disabled={!sourceCovered || working} onChange={selectPhoto} aria-label={copy.takePhoto} />
        </label>
        <DocumentPicker language={language} disabled={!sourceCovered || working} onPick={openPhoto}
          label={language==='es'?'Elegir imagen o PDF':'Choose image or PDF'} />
        </>}
        {current && <button className="ecg-r-quiet" type="button" disabled={working} onClick={() => {
          setFile(null);
          clearEstimate();
          onRemove();
        }}>{copy.removePhoto}</button>}
        {current && <button className="ecg-r-secondary" type="button" disabled={working} onClick={() => {
          const { result, fingerprint, image } = current;
          setHash(sheet?.fingerprint??fingerprint);
          setCrop(sheet ? current.sourceCrop ?? sheet.crop : wholeImage);
          setSpeed(result.speed);
          setGain(result.gain);
          setManual(result.calibration === 'manual');
          setWidthMm(result.timeMm.toFixed(2));
          setHeightMm(result.voltageMm.toFixed(2));
          clearEstimate();
          setFile(sheet?.file ?? new File([image], 'recorte.jpg', { type: 'image/jpeg' }));
          onRemove();
        }}>{copy.recalibrate}</button>}
      </div>

      {file && photoUrl && !preview && (
        <div className="ecg-r-crop-tools">
          <p>{sheet ? (language === 'es' ? 'Selección sugerida para ' : 'Suggested selection for ') + leadName(lead, language) + (language === 'es' ? '. Comprueba la etiqueta y conserva solo su trazado. Mueve el recuadro sin cambiar su tamaño o pulsa «Nuevo recuadro».' : '. Check the label and keep only its tracing. Move the box without resizing it or select ‘New rectangle’.') : copy.cropInstructions}</p>
          <SelectionGuide es={language==='es'}/><ZoomButtons zoom={zoom} onChange={setZoom} es={language==='es'}/>
          <div className="ecg-r-actions" role="group" aria-label={language === 'es' ? 'Herramientas del recuadro' : 'Crop tools'}>
            <button type="button" className="ecg-r-secondary" aria-pressed={cropMode==='navigate'} onClick={()=>setCropMode('navigate')}>{language==='es'?'Navegar':'Navigate'}</button>
            <button type="button" className="ecg-r-secondary" disabled={working} aria-pressed={cropMode === 'move'} onClick={() => setCropMode('move')}>
              {language === 'es' ? 'Mover recuadro' : 'Move rectangle'}
            </button>
            <button type="button" className="ecg-r-secondary" disabled={working} aria-pressed={cropMode === 'draw'} onClick={() => setCropMode('draw')}>
              {language === 'es' ? 'Nuevo recuadro' : 'New rectangle'}
            </button>
          </div>
          <p className="ecg-r-muted" aria-live="polite">{cropMode==='navigate' ? (language==='es'?'Desliza para recorrer la imagen. Usa + / − para ampliar o dos dedos para ampliar la página.':'Swipe to explore the image. Use + / − to zoom or pinch to zoom the page.') : cropMode === 'move'
            ? (language === 'es' ? 'Arrastra dentro del recuadro para moverlo. Con el área enfocada, usa las flechas del teclado (Mayús para pasos mayores).' : 'Drag inside the rectangle to move it. Focus the image and use arrow keys (Shift for larger steps).')
            : (language === 'es' ? 'Arrastra sobre la imagen para dibujar un recuadro nuevo.' : 'Drag on the image to draw a new rectangle.')}</p>
          <div ref={scroll} className="ecg-r-crop-scroll">
          <div className={`ecg-r-crop-image is-${cropMode}`} style={{ width: `${zoom}%`, cursor: cropMode === 'move' ? 'grab' : 'crosshair' }}
            tabIndex={0} role="group" aria-label={copy.photoToCrop} onKeyDown={event => {
              if (working || cropMode !== 'move' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              const step = event.shiftKey ? 2 : .5;
              changeCrop(moveCrop(crop, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
                event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
            }} onPointerDown={(event) => {
            if (!event.isPrimary || cropMode==='navigate' || working || event.button !== 0) return;
            const at = point(event);
            if (cropMode === 'move' && (at.x < crop.left || at.x > crop.right || at.y < crop.top || at.y > crop.bottom)) return;
            startPoint.current = { ...at, crop };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={drawCrop} onPointerUp={(event) => {
            if (!event.isPrimary || !startPoint.current) return;
            drawCrop(event);
            startPoint.current = null;
            setCropMode('move');
          }} onPointerCancel={() => {
            if (startPoint.current) changeCrop(startPoint.current.crop);
            startPoint.current = null;
          }}>
            <img src={photoUrl} alt={copy.photoToCrop}
              draggable={false} />
            <span style={{ left: `${crop.left}%`, top: `${crop.top}%`, width: `${crop.right - crop.left}%`,
              height: `${crop.bottom - crop.top}%` }} />
          </div>
          </div>
          <CropControls crop={crop} onChange={changeCrop} es={language==='es'} disabled={working}/>
          <details open={!!sheet}>
            <summary>{copy.cropEdges}</summary>
            <div className="ecg-r-fields">
              {([
                ['left', copy.left], ['top', copy.top], ['right', copy.right], ['bottom', copy.bottom],
              ] as const).map(([edge, label]) => (
                <label key={edge}>{label} (%)
                  <input type="number" min="0" max="100" step="0.1"
                    value={Number(crop[edge].toFixed(1))} disabled={working} onChange={(event) => {
                      const value = event.target.valueAsNumber;
                      if (Number.isFinite(value)) changeCrop({ ...crop, [edge]: Math.min(100, Math.max(0, value)) });
                    }} />
                </label>
              ))}
            </div>
            <button className="ecg-r-quiet" type="button" disabled={working}
              onClick={() => changeCrop(wholeImage)}>{copy.resetEdges}</button>
          </details>
        </div>
      )}

      {file && (
        <fieldset disabled={working || !!preview} className="ecg-r-calibration">
          <legend>{copy.printedCalibration}</legend>
          <div className="ecg-r-fields">
            <label>{copy.speed}
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as Calibration['speed'])}>
                <option value={25}>25 mm/s</option>
                <option value={50}>50 mm/s</option>
              </select>
            </label>
            <label>{copy.gain}
              <select value={gain} onChange={(event) => setGain(Number(event.target.value) as Calibration['gain'])}>
                <option value={5}>5 mm/mV</option>
                <option value={10}>10 mm/mV</option>
                <option value={20}>20 mm/mV</option>
              </select>
            </label>
          </div>
          <label className="ecg-r-check">
            <input type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} />
            {copy.manualDimensions}
          </label>
          {manual && <div className="ecg-r-fields">
            <label>{copy.width} (mm)
              <input inputMode="decimal" value={widthMm} onChange={(event) => setWidthMm(event.target.value)} />
            </label>
            <label>{copy.height} (mm)
              <input inputMode="decimal" value={heightMm} onChange={(event) => setHeightMm(event.target.value)} />
            </label>
          </div>}
          {!preview && <button className="ecg-r-primary" type="button" onClick={estimate}>
            {working ? copy.reconstructing : copy.reconstruct}
          </button>}
        </fieldset>
      )}

      {draft&&<><PhotoTrace photo={{image:draft.image,result:draft.trace}} language={language}/><p className="ecg-r-muted">{language==='es'?'Trazo provisional en píxeles; escala pendiente. No se calculan segundos ni mV.':'Provisional trace in pixels; scale pending. Seconds and mV are not calculated.'}</p></>}
      {draftPreview && <>
        <PhotoTrace photo={draftPreview} language={language} />
        <TraceScale trace={draftPreview.result} language={language} />
        {draftPreview.result.warningCode && <p className="ecg-r-error" role="status">{researchMessage(draftPreview.result.warningCode, language)}</p>}
        {preview && <>
          {preview.result.gridUnitEvidence==='periodic-only'&&<p className="ecg-r-error" role="status">{researchMessage('gridUnitUnknown',language)}</p>}
          <label className="ecg-r-check">
            <input type="checkbox" checked={verified} disabled={(!!preview.result.warning || preview.result.gridUnitEvidence==='periodic-only')}
              onChange={(event) => setVerified(event.target.checked)} />
            {copy.confirmTrace}
          </label>
          <div className="ecg-r-actions">
            <button className="ecg-r-secondary" type="button" onClick={clearEstimate}>{copy.adjust}</button>
            <button className="ecg-r-primary" type="button" disabled={!verified || (!!preview.result.warning || preview.result.gridUnitEvidence==='periodic-only')}
              onClick={() => {
                onAccept(preview);
                setFile(null);
                setHash('');
                setSourceCovered(false);
                clearEstimate();
              }}>{copy.acceptLead}</button>
          </div>
        </>}
      </>}

      {error && <div className="ecg-r-error" role="alert">{researchMessage(error, language)}
        {file && isScaleProblem(error) ? <p>{language==='es'?'El recuadro se conserva. La escala se puede verificar con una referencia de la cuadrícula; no es necesario redibujar todas las zonas.':'The crop is retained. Verify the scale with a grid reference; there is no need to redraw all regions.'}</p> : file && <p>{language === 'es' ? 'La imagen se conserva. Ajusta el recorte y vuelve a intentar. Si falla la cuadrícula, activa las dimensiones manuales e indica las medidas del recorte en el papel.' : 'Your image is retained. Adjust the crop and retry. If grid detection fails, enable manual dimensions and enter the crop dimensions on paper.'}</p>}
      </div>}
      {working && <p role="status" className="ecg-r-muted">{copy.processing}</p>}
    </section>
  );
}
