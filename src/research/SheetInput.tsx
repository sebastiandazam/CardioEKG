import { DocumentPicker } from './DocumentPicker';
import { useEffect, useRef, useState } from 'react';
import { validatePhoto, fingerprintPhoto } from './photo';
import { detectSheet, toPaperLocal } from './sheet';
import { cropsFromStructure } from './layoutDetect';
import type { LayoutChoice, LeadSource, SheetStructure } from './layoutDetect';
import { recallLayout } from './layoutMemory';
import { mapPaperCrop } from './paper';
import type { CaptureLead, Crop } from './digitize';
import { applyLeadLabels } from './labels';
import type { LabelEvidence } from './labels';
import { recognizeLeadLabels } from './labelOcr';
import type { SheetCrops, SheetLayout } from './sheet';
import { ResearchError, researchMessage } from './locale';
import type { ResearchLanguage } from './locale';

export interface SheetSource {
  file: File; preview:Blob;paperPreview:Blob; imageWidth:number;imageHeight:number;paper:Crop|null;regionsLocated:boolean;manualTemplate:boolean; fingerprint: string; crops: SheetCrops; revision: number;
  confirmed: Partial<Record<CaptureLead, boolean>>; evidence: LabelEvidence;
  gridReference?:Crop;
  automaticGrid?:Crop;
  /** Where a large grid square was seen; only positions the manual calibration box. */
  gridHint?:Crop;
  layoutAmbiguous?:boolean;
  /** Tilt corrected at load, in degrees (0 when none). */
  skewDegrees?:number;
  calibrationByLead?:Partial<Record<CaptureLead,{speed:25|50;gain:5|10|20}>>;
  speed:25|50; gain:5|10|20; layout?:SheetLayout;
  /** Tracing bands read from the sheet (paper-local percent); used after OCR and to learn corrections. */
  structure?:SheetStructure|null;
  /** How each region was placed: printed label, learned correction, tracing ink or template. */
  sources?:Record<CaptureLead,LeadSource>;
  layoutInferred?:boolean;
  /** Speed and gain read from the printed text by OCR, if any. */
  printedCalibration?:{speed?:25|50;gain?:5|10|20};
  includeLong: boolean;
  stage: 'regions' | 'capture'; ocrStatus: 'working' | 'ready' | 'failed'; ocrProgress: number;
}
export function SheetInput({ language, source, onChange,initialDocument }: {
  initialDocument?:File;language: ResearchLanguage; source: SheetSource | null; onChange: (source: SheetSource | null) => void;
}) {
  const es = language === 'es';
  const seeded=useRef<File|null>(null);
  useEffect(()=>{if(initialDocument&&!source&&seeded.current!==initialDocument){seeded.current=initialDocument;void load(initialDocument,layout);}},[initialDocument]);
  const [layout, setLayout] = useState<LayoutChoice>('auto');
  const [covered, setCovered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const currentSource = useRef(source); currentSource.current = source;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  const change = useRef(onChange); change.current = onChange;
  function emit(next: SheetSource) { currentSource.current = next; change.current(next); }
  async function load(file: File, format: LayoutChoice) {
    controller.current?.abort();
    const control = new AbortController(); controller.current = control;
    setBusy(true); setError('');
    try {
      await validatePhoto(file);
      const fingerprint = await fingerprintPhoto(file);
      const detection = await detectSheet(file, format, (structure, chosen) => recallLayout(structure, chosen));
      const crops = detection.crops;
      // From here on work on the straightened image; the fingerprint still identifies the original upload.
      if (detection.straightened) file = detection.straightened;
      if (control.signal.aborted) return;
      const previous=currentSource.current?.fingerprint===fingerprint?currentSource.current:null;
      const initial: SheetSource = { file,preview:detection.preview,paperPreview:detection.paperPreview,imageWidth:detection.imageWidth,imageHeight:detection.imageHeight,paper:detection.paper,regionsLocated:detection.rowsDetected,manualTemplate:false, fingerprint, crops, layout:detection.layout, structure:detection.structure, sources:detection.sources, layoutInferred:detection.layoutInferred, revision: ++revision.current, confirmed: {}, evidence: {}, speed:previous?.speed??25,gain:previous?.gain??10,gridReference:previous?.gridReference,automaticGrid:previous?.automaticGrid,gridHint:detection.gridHint,skewDegrees:detection.skewDegrees,layoutAmbiguous:detection.layoutAmbiguous,includeLong:detection.rhythmDetected, stage: 'regions', ocrStatus: 'working', ocrProgress: 0 };
      emit(initial);
      setBusy(false);
      if(!detection.paper){emit({...initial,ocrStatus:'failed'});return;}
      try {
        const {hits,calibration} = await recognizeLeadLabels(file, control.signal, progress => {
          if (!control.signal.aborted && currentSource.current?.fingerprint === fingerprint) emit({ ...currentSource.current, ocrProgress: progress });
        },detection.paper);
        if (control.signal.aborted || currentSource.current?.fingerprint !== fingerprint) return;
        // Labels re-anchor the regions on the bands read from the sheet; without bands, only identities are swapped.
        const paper=detection.paper;
        const structured=detection.structure&&detection.structure.bands.length?cropsFromStructure(detection.structure,format,hits.map(hit=>({...hit,...toPaperLocal(hit,paper)})),recallLayout(detection.structure,format==='auto'?detection.layout:format)):null;
        const refined = structured
          ? { crops:Object.fromEntries(Object.entries(structured.crops).map(([lead,crop])=>[lead,mapPaperCrop(crop,paper)])) as SheetCrops, evidence:structured.evidence, layout:structured.layout, sources:structured.sources, regionsLocated:true, layoutAmbiguous:structured.layoutAmbiguous, layoutInferred:format==='auto'&&!structured.layoutAmbiguous }
          : applyLeadLabels(crops,hits);
        // Printed "25 mm/s, 10 mm/mV" sets speed and gain unless the user already chose them for this file.
        emit({ ...currentSource.current, ...refined, ...(calibration.speed&&!previous?{speed:calibration.speed}:{}), ...(calibration.gain&&!previous?{gain:calibration.gain}:{}), printedCalibration:calibration, confirmed: {}, ocrStatus: 'ready', ocrProgress: 1, revision: ++revision.current });
      } catch {
        if (!control.signal.aborted && currentSource.current?.fingerprint === fingerprint) emit({ ...currentSource.current, ocrStatus: 'failed' });
      }
    } catch (caught) {
      if (control.signal.aborted) return;
      setError(caught instanceof ResearchError ? researchMessage(caught.code, language) : es ? 'No se pudo abrir la imagen. Prueba con JPG, PNG o WebP.' : 'Cannot open image. Try JPG, PNG or WebP.');
    } finally { if (controller.current === control) setBusy(false); }
  }
  return <section className="ecg-r-photo">
    <h2>{es ? 'Subir el ECG completo' : 'Upload the full ECG'}</h2>
    <p>{es ? 'Sube una imagen o elige una página PDF. La app lee la hoja en tu dispositivo: separa el trazado de la cuadrícula, encuentra cada banda de trazado, el pulso de calibración y los cortes entre derivaciones, deduce la distribución y ancla cada derivación en su etiqueta impresa cuando el OCR la lee. Si corriges una zona, la próxima hoja del mismo tipo parte de tu corrección. Confirma o corrige cada zona en el panel lateral.' : 'Upload one image or choose a PDF page. The app reads the sheet on your device: it separates tracing from grid, finds each tracing band, the calibration pulse and the breaks between leads, infers the layout and anchors each lead at its printed label when OCR reads it. If you correct a region, the next sheet of the same kind starts from your correction. Confirm or correct each region in the side panel.'}</p>
    <label className="ecg-r-check"><input type="checkbox" checked={covered} disabled={busy} onChange={e => setCovered(e.target.checked)} />
      {es ? 'El archivo o la página que usaré no contiene nombres, identificaciones ni otros datos personales.' : 'The file or page I will use contains no names, identifiers or other personal information.'}
    </label>
    <div className="ecg-r-fields"><label>{es ? 'Distribución de las derivaciones' : 'Lead layout'}
      <select value={layout} disabled={busy} onChange={e => {
        const next = e.target.value as LayoutChoice; setLayout(next);
        if (source) void load(source.file, next);
      }}>
        <option value="auto">{es ? 'Detectar automáticamente' : 'Detect automatically'}</option>
        <option value="4x3">{es ? '4 columnas × 3 filas' : '4 columns × 3 rows'} · I / aVR / V1 / V4</option>
        <option value="2x6">{es ? '2 columnas × 6 filas' : '2 columns × 6 rows'} · I / V1</option>
      </select>
    </label></div>
    <div className="ecg-r-actions"><DocumentPicker language={language} disabled={!covered || busy} onPick={file=>load(file,layout)}
      label={source ? (es ? 'Cambiar imagen o PDF' : 'Replace image or PDF') : (es ? 'Elegir imagen o PDF del ECG completo' : 'Choose full ECG image or PDF')} />
    {source && <button type="button" className="ecg-r-secondary" disabled={busy} onClick={() => { controller.current?.abort(); currentSource.current = null; onChange(null); }}>{es ? 'Usar fotos individuales' : 'Use individual photos'}</button>}
    </div>
    {source?.ocrStatus === 'working' && <button type="button" className="ecg-r-quiet" onClick={() => {
      controller.current?.abort(); emit({ ...source,ocrStatus:'failed' });
    }}>{es ? 'Continuar con las zonas por posición' : 'Continue with positional regions'}</button>}
    {busy && <p role="status">{es ? 'Buscando trazados en el dispositivo…' : 'Locating traces on your device…'}</p>}
    {error && <p role="alert" className="ecg-r-error">{error}</p>}
  </section>;
}
