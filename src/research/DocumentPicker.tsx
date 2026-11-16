import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { isPdf, pdfRenderScale } from './pdf';
import type { ResearchLanguage } from './locale';
import { usePhotoUrl } from './usePhotoUrl';

export function DocumentPicker({ language, disabled, onPick, label }: {
  language: ResearchLanguage; disabled: boolean; onPick: (file: File) => void | Promise<void>; label: string;
}) {
  const es = language === 'es';
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loaded = useRef<PDFDocumentProxy | null>(null);
  const rendering = useRef<RenderTask | null>(null);
  const loading = useRef<{ destroy: () => Promise<void> } | null>(null);
  const revision = useRef(0);
  const url = usePhotoUrl(image);
  useEffect(() => () => { revision.current++; rendering.current?.cancel(); void loading.current?.destroy(); }, []);
  function close() {
    revision.current++; rendering.current?.cancel(); void loading.current?.destroy();
    loaded.current = null; loading.current = null; setDocument(null); setImage(null); setError(''); setBusy(false);
  }
  async function render(doc: PDFDocumentProxy, number: number) {
    const id = ++revision.current;
    rendering.current?.cancel(); setBusy(true); setError(''); setImage(null);
    try {
      const pdfPage = await doc.getPage(number);
      if (id !== revision.current) return;
      const initial = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: pdfRenderScale(initial.width, initial.height) });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const task = pdfPage.render({ canvas, viewport, background: 'white' }); rendering.current = task;
      await task.promise;
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      pdfPage.cleanup();
      if (id !== revision.current) return;
      if (!blob) throw new Error('Cannot render page');
      setImage(new File([blob], `ecg-page-${number}.png`, { type: 'image/png' }));
    } catch {
      if (id === revision.current) setError(es ? 'No se pudo dibujar esta página. Prueba otra o exporta el ECG como imagen.' : 'Cannot render this page. Try another page or export the ECG as an image.');
    } finally { if (id === revision.current) setBusy(false); }
  }
  async function select(file: File) {
    close(); const id = ++revision.current; setBusy(true);
    try {
      if (file.size > 20*1024*1024 || file.size < 12) throw new Error(es ? 'El archivo debe pesar menos de 20 MB.' : 'The file must be smaller than 20 MB.');
      if (!await isPdf(file)) {
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) throw new Error(es ? 'El archivo no contiene un PDF válido.' : 'The file is not a valid PDF.');
        if (id === revision.current) { setBusy(false); await onPick(file); }
        return;
      }
      const pdf = await import('./pdfLoader');
      if (id !== revision.current) return;
      const task = pdf.loadPdf(new Uint8Array(await file.arrayBuffer())); loading.current = task;
      const doc = await task.promise;
      if (id !== revision.current) { await task.destroy(); return; }
      if (doc.numPages > 200) { await task.destroy(); throw new Error(es ? 'Elige un PDF de hasta 200 páginas.' : 'Choose a PDF with up to 200 pages.'); }
      loaded.current = doc; setDocument(doc); setPage(1); await render(doc,1);
    } catch (caught) {
      if (id === revision.current) {
        setBusy(false);
        setError(caught instanceof Error && caught.name === 'PasswordException'
          ? (es ? 'Este PDF está protegido con contraseña. Exporta una copia sin contraseña o una imagen del ECG.' : 'This PDF is password-protected. Export an unprotected copy or an ECG image.')
          : caught instanceof Error ? caught.message : (es ? 'No se pudo abrir el PDF.' : 'Cannot open PDF.'));
      }
    }
  }
  return <div className="ecg-document-picker">
    <label className={`ecg-r-upload ecg-r-secondary ${disabled || busy ? 'is-disabled' : ''}`}>{label}
      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" disabled={disabled || busy} onChange={e => {
        const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void select(file);
      }} />
    </label>
    {document && <section className="ecg-pdf-preview" aria-label={es ? 'Elegir página del PDF' : 'Choose PDF page'}>
      <h3>{es ? 'Selecciona la página con el ECG' : 'Select the ECG page'}</h3>
      <p>{es ? 'El PDF se abre en este dispositivo. Revisa que la página elegida incluya las derivaciones del mismo registro, sus etiquetas y la calibración.' : 'The PDF opens on this device. Check that the chosen page includes leads from the same recording, their labels and calibration.'}</p>
      <label>{es ? 'Página' : 'Page'} {page} / {document.numPages}
        <select value={page} disabled={busy || disabled} onChange={e => { const next=Number(e.target.value);setPage(next);void render(document,next); }}>
          {Array.from({length:document.numPages},(_,index)=><option key={index} value={index+1}>{index+1}</option>)}
        </select>
      </label>
      {url && <img src={url} alt={es ? `Vista previa de la página ${page}` : `Preview of page ${page}`} />}
      <div className="ecg-r-actions">
        <button type="button" className="ecg-r-primary" disabled={busy || disabled || !image} onClick={()=>{if(image){const selected=image;close();void onPick(selected);}}}>{es ? 'Usar esta página' : 'Use this page'}</button>
        <button type="button" className="ecg-r-quiet" onClick={close}>{es ? 'Cancelar PDF' : 'Cancel PDF'}</button>
      </div>
    </section>}
    {busy && !document && <button type="button" className="ecg-r-quiet" onClick={close}>{es?'Cancelar archivo':'Cancel file'}</button>}
    {busy && <p role="status">{es ? 'Abriendo el archivo en el dispositivo…' : 'Opening the file on this device…'}</p>}
    {error && <p className="ecg-r-error" role="alert">{error}</p>}
  </div>;
}
