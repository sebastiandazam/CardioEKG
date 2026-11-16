import { ResearchError, researchMessage } from './locale.ts';
import type { Crop, DigitizedTrace } from './digitize';
import type { WorkerResponse, WorkerTask } from './protocol';

export interface AcceptedPhoto {
  result: DigitizedTrace;
  image: Blob;
  fingerprint: string;
  sourceCrop?: Crop;
  calibrationKey?:string;
}

export async function validatePhoto(file: File) {
  if (file.size > 20 * 1024 * 1024 || file.size < 12) {
    throw new ResearchError('invalidSize');
  }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  const webp = String.fromCharCode(...header.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw new ResearchError('invalidFormat');
}

export async function fingerprintPhoto(file: Blob) {
  if (!crypto.subtle) throw new ResearchError('requireHttps');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function runWorker(task: WorkerTask, signal: AbortSignal): Promise<WorkerResponse> {
  if (signal.aborted) return Promise.reject(new DOMException(researchMessage('canceled'), 'AbortError'));
  return new Promise((resolve, reject) => {
    const script = import.meta.env.VITE_EMBEDDED_PHOTO_WORKER;
    const embeddedUrl = script ? URL.createObjectURL(new Blob([script], { type: 'text/javascript' })) : null;
    let worker: Worker;
    try {
      worker = embeddedUrl
        ? new Worker(embeddedUrl, { type: 'module' })
        : new Worker(new URL('./research.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      if (embeddedUrl) URL.revokeObjectURL(embeddedUrl);
      reject(new ResearchError('workerUnavailable'));
      return;
    }
    const timeout = setTimeout(() => {
      cleanup();
      reject(new ResearchError(task.kind === 'model' ? 'modelTimeout' : 'photoTimeout'));
    }, 30_000);
    function cleanup() {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      worker.terminate();
      if (embeddedUrl) URL.revokeObjectURL(embeddedUrl);
    }
    function abort() {
      cleanup();
      reject(new DOMException(researchMessage('canceled'), 'AbortError'));
    }
    signal.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      cleanup();
      resolve(event.data);
    }, { once: true });
    worker.addEventListener('error', () => {
      cleanup();
      reject(new ResearchError('workerUnavailable'));
    }, { once: true });
    try {
      worker.postMessage(task);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
