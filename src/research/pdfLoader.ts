import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;
export function loadPdf(data: Uint8Array) {
  const root = new URL('pdf/', document.baseURI).href;
  return getDocument({ data, disableWorkerRendering: true,
    standardFontDataUrl: root+'standard_fonts/', wasmUrl: root+'wasm/', useSystemFonts: true });
}
