import type { ResearchMessage } from './locale';
import type { Calibration, Crop, DigitizedTrace, Pattern, Trace } from './digitize';

export interface ApprovedModel {
  runtimeModule: string;
  wasmDirectory: string;
  modelUrl: string;
  sha256: string;
  decisionBands: Record<Exclude<Pattern, 'indeterminate'>, { lower: number; upper: number }>;
}

export function readApprovedModel(raw: string | undefined): ApprovedModel | undefined {
  if (!raw) return undefined;
  try {
    const candidate: Partial<ApprovedModel> | null = JSON.parse(raw);
    if (!candidate
      || ![candidate.runtimeModule, candidate.wasmDirectory, candidate.modelUrl].every(
        (path) => typeof path === 'string' && /^\/models\/[a-z0-9/_\-.]+$/i.test(path)
          && !path.includes('..'),
      )
      || typeof candidate.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(candidate.sha256)) {
      return undefined;
    }
    const bands = candidate.decisionBands;
    if (!bands || !(['sinus', 'af', 'rbbb', 'lbbb'] as const).every((name) => {
      const band = bands[name];
      return !!band && typeof band.lower === 'number' && typeof band.upper === 'number'
        && (band.lower === -1 || (band.lower >= 0 && band.lower <= 1))
        && (band.upper === 2 || (band.upper >= 0 && band.upper <= 1))
        && band.lower <= band.upper;
    })) return undefined;
    return candidate as ApprovedModel;
  } catch {
    return undefined;
  }
}

export type WorkerTask =
  | { kind: 'photo'; photo: File; crop: Crop; calibration: Calibration }
  | {kind:'paper-grid';photo:File;paper:Crop}
  | { kind: 'model'; segments: Trace[]; leadII: Trace; model: ApprovedModel };

export type WorkerResponse =
  | { kind: 'photo'; image: Blob; result: DigitizedTrace }
  | { kind:'photo-draft';image:Blob;trace:{width:number;height:number;points:number[];quality:number};code:ResearchMessage }
  | {kind:'paper-grid';reference:Crop|null}
  | {kind:'model';schemaVersion:2;pattern:Pattern;probabilities:number[];findings:import('./modelDecisions').ModelLabel[];decisions:import('./modelDecisions').ModelDecisions}
  | { kind: 'error'; code: ResearchMessage };
