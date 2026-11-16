import {decodeModel} from './modelDecisions';
import { ResearchError } from './locale';
import {digitizePhoto,calibratePaper} from './photoProcess';
import { resample } from './digitize';
import type { Pattern } from './digitize';
import type { WorkerResponse, WorkerTask } from './protocol';

interface RuntimeTensor {
  data: Float32Array;
}

interface Runtime {
  env: { wasm: { wasmPaths: string; numThreads: number; proxy: boolean } };
  Tensor: new (type: string, values: Float32Array, dimensions: number[]) => RuntimeTensor;
  InferenceSession: {
    create(model: Uint8Array, options: { executionProviders: string[] }): Promise<{
      run(inputs: Record<string, RuntimeTensor>): Promise<Record<string, RuntimeTensor>>;
      release(): Promise<void>;
    }>;
  };
}

function sameOriginAsset(path: string) {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/models/')
    || url.search || url.hash) {
    throw new ResearchError('modelNotLocal');
  }
  return url.href;
}

async function runModel(task: Extract<WorkerTask, { kind: 'model' }>): Promise<WorkerResponse> {
  const { segments, leadII, model } = task;
  const patterns = ['sinus', 'af', 'rbbb', 'lbbb'] as const;
  if (segments.length !== 12
    || segments.some((trace) => trace.quality < 0.8 || Math.abs(trace.seconds - 2.5) > 0.05)
    || leadII.quality < 0.8 || Math.abs(leadII.seconds - 10) > 0.2) {
    throw new ResearchError('modelNeedsStrips');
  }
  const bands = patterns.map((pattern) => model.decisionBands?.[pattern]);
  if (bands.some((band) => !band
    || !Number.isFinite(band.lower) || !Number.isFinite(band.upper)
    || (band.lower !== -1 && (band.lower < 0 || band.lower > 1))
    || (band.upper !== 2 && (band.upper < 0 || band.upper > 1))
    || band.lower > band.upper)) {
    throw new ResearchError('invalidThresholds');
  }

  const moduleUrl = sameOriginAsset(model.runtimeModule);
  const wasmUrl = sameOriginAsset(model.wasmDirectory);
  const modelUrl = sameOriginAsset(model.modelUrl);
  const response = await fetch(modelUrl, { mode: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new ResearchError('modelUnavailable');
  const modelBytes = new Uint8Array(await response.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', modelBytes));
  const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== model.sha256) throw new ResearchError('wrongModelVersion');

  const runtime: Runtime = await import(/* @vite-ignore */ moduleUrl);
  runtime.env.wasm.wasmPaths = wasmUrl.endsWith('/') ? wasmUrl : wasmUrl + '/';
  runtime.env.wasm.numThreads = 1;
  runtime.env.wasm.proxy = false;
  const session = await runtime.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });
  try {
    const segmentValues = new Float32Array(12 * 250);
    segments.forEach((trace, index) => segmentValues.set(resample(trace, 250), index * 250));
    const outputs = await session.run({
      segments: new runtime.Tensor('float32', segmentValues, [1, 12, 250]),
      leadII: new runtime.Tensor('float32', resample(leadII, 1000), [1, 1, 1000]),
    });
    const probabilities = Array.from(outputs.probabilities?.data ?? []);
    if (probabilities.length !== 4
      || probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new ResearchError('invalidModelResult');
    }
    return {kind:'model',...decodeModel(probabilities,model.decisionBands)};
  } finally {
    await session.release();
  }
}

self.addEventListener('message', async (event: MessageEvent<WorkerTask>) => {
  const task = event.data;
  try {
    const result = task.kind === 'photo' ? await digitizePhoto(task) : task.kind==='paper-grid'?await calibratePaper(task):await runModel(task);
    self.postMessage(result);
  } catch (error) {
    const code = error instanceof ResearchError ? error.code : task.kind === 'photo' ? 'reconstructFailed' : 'modelFailed';
    self.postMessage({ kind: 'error', code } satisfies WorkerResponse);
  }
});
