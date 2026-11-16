import type {Crop} from './digitize';
import {mapPaperCrop} from './paper';
import { readLeadLabels, readPrintedCalibration } from './labels';
import { isGridColour } from './layoutDetect';
import { normalizePaper } from './illumination';
import type { LabelHit } from './labels';

export async function recognizeLeadLabels(file: File, signal: AbortSignal, progress: (fraction: number) => void,paper:Crop={left:0,top:0,right:100,bottom:100}): Promise<{hits:LabelHit[];calibration:ReturnType<typeof readPrintedCalibration>}> {
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  if (signal.aborted) throw new DOMException('Canceled','AbortError');
  const root = new URL('ocr/', document.baseURI).href;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let canceled = false;
  let rejectStop: (error: Error) => void = () => {};
  const stopped = new Promise<never>((_,reject) => { rejectStop = reject; });
  const abort = () => { canceled = true; void worker?.terminate(); rejectStop(new DOMException('Canceled or timed out','AbortError')); };
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 60_000);
  let bitmap: ImageBitmap | undefined;
  const work = async () => {
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: root+'worker.min.js', corePath: root+'tesseract-core-lstm.wasm.js', langPath: root,
      workerBlobURL: false, cacheMethod: 'none', gzip: true,
      logger: event => { if (event.status === 'recognizing text') progress(event.progress); },
    });
    if (signal.aborted || canceled) { await worker.terminate(); throw new DOMException('Canceled','AbortError'); }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300', preserve_interword_spaces: '1' });
    bitmap = await createImageBitmap(file);
    const x=Math.round(bitmap.width*paper.left/100),y=Math.round(bitmap.height*paper.top/100);
    const w=Math.round(bitmap.width*paper.right/100)-x,h=Math.round(bitmap.height*paper.bottom/100)-y;
    const scale = Math.min(3, 2200 / w, 3200 / h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w*scale); canvas.height = Math.round(h*scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Cannot read image');
    context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height);
    const pixels = context.getImageData(0,0,canvas.width,canvas.height);
    // Even out shadows first, so a dim corner of a photo is not binarized to solid black.
    pixels.data.set(normalizePaper(pixels.data,canvas.width,canvas.height));
    // Grid colour becomes paper; any other ink (black, navy, blue, green labels) becomes dark by luminance.
    const widthPx = canvas.width, heightPx = canvas.height;
    const nPix = widthPx * heightPx;
    const lum = new Float32Array(nPix);
    const hist = new Uint32Array(256);
    for (let p = 0, i = 0; p < nPix; p++, i += 4) {
      const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
      const v = isGridColour(r, g, b) ? 255 : .299 * r + .587 * g + .114 * b;
      lum[p] = v;
      hist[Math.max(0, Math.min(255, Math.round(v)))]++;
    }
    // Robust 2nd–98th percentile contrast stretch immune to dark border specks or glare.
    let acc = 0, low = 0, high = 255;
    for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= nPix * 0.02) { low = k; break; } }
    acc = 0;
    for (let k = 255; k >= 0; k--) { acc += hist[k]; if (acc >= nPix * 0.02) { high = k; break; } }
    const span = Math.max(20, high - low);
    // 2D integral image over stretched luminance for local adaptive block thresholding (31x31 window).
    const integral = new Float64Array((widthPx + 1) * (heightPx + 1));
    const stride = widthPx + 1;
    for (let y = 0; y < heightPx; y++) {
      let rowSum = 0;
      for (let x = 0; x < widthPx; x++) {
        const idx = y * widthPx + x;
        const stretched = Math.max(0, Math.min(255, 255 * (lum[idx] - low) / span));
        lum[idx] = stretched;
        rowSum += stretched;
        integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
      }
    }
    const radius = Math.max(10, Math.min(24, Math.round(Math.min(widthPx, heightPx) * 0.015)));
    for (let y = 0; y < heightPx; y++) {
      const y0 = Math.max(0, y - radius), y1 = Math.min(heightPx - 1, y + radius);
      for (let x = 0; x < widthPx; x++) {
        const x0 = Math.max(0, x - radius), x1 = Math.min(widthPx - 1, x + radius);
        const area = (y1 - y0 + 1) * (x1 - x0 + 1);
        const localMean = (integral[(y1 + 1) * stride + (x1 + 1)] - integral[y0 * stride + (x1 + 1)] - integral[(y1 + 1) * stride + x0] + integral[y0 * stride + x0]) / area;
        const v = lum[y * widthPx + x];
        const dark = v < 95 || (v < localMean - 18 && v < 205);
        const i = (y * widthPx + x) * 4;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = dark ? 0 : 255;
      }
    }
    context.putImageData(pixels,0,0);
    const result = await worker.recognize(canvas, {}, { tsv: true, text: true });
    return {hits:readLeadLabels(result.data.tsv ?? '', canvas.width, canvas.height).map(hit=>({...hit,...mapPaperCrop(hit,paper)})),calibration:readPrintedCalibration(result.data.text ?? '')};
  };
  try { return await Promise.race([work(),stopped]); } finally {
    clearTimeout(timeout); signal.removeEventListener('abort',abort); bitmap?.close(); await worker?.terminate();
  }
}
