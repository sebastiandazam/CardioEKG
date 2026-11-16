import type {Measurements} from '../cases';

export type EngineMeasurements = Measurements;
export type EngineResult = {
  schemaVersion: 1; ok: true; engine: string; measurements: EngineMeasurements;
  ranges?: {qrsMs?: [number, number]; qtMs?: [number, number]};
  extra?: {qtcFridericiaMs?: number | null; qtcBazettMs?: number | null; pDurationMs?: number | null};
  quality: {mode: string; layout: string[][]; speedMmS: number; gainMmMv: number; pDetected: string; warnings: string[]};
};
export type ComparisonRow = {key: keyof Measurements; unit: string; local: number | null; engine: number | null; delta: number | null; tolerance: number; agrees: boolean | null};

/** Umbrales de comparación entre métodos; no son intervalos clínicos calibrados. */
export const tolerances: Record<keyof Measurements, number> = {rateBpm: 3, prMs: 20, qrsMs: 15, qtMs: 30, axisDeg: 15};
const units: Record<keyof Measurements, string> = {rateBpm: 'lpm', prMs: 'ms', qrsMs: 'ms', qtMs: 'ms', axisDeg: '°'};

/** El eje es circular: 179° y −179° difieren 2°, no 358°. */
export function circularDifference(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function compareMeasurements(local: Measurements, engine: Measurements): ComparisonRow[] {
  return (Object.keys(tolerances) as (keyof Measurements)[]).map(key => {
    const a = local[key], b = engine[key];
    const valid = typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b);
    const delta = valid ? (key === 'axisDeg' ? circularDifference(a, b) : Math.abs(a - b)) : null;
    return {key, unit: units[key], local: typeof a === 'number' ? a : null, engine: typeof b === 'number' && Number.isFinite(b) ? b : null,
      delta, tolerance: tolerances[key], agrees: delta === null ? null : delta <= tolerances[key]};
  });
}

/** /api/analyze → /api/measure en el mismo servidor autorizado; solo HTTPS. */
export function measureEndpoint(configured: string | undefined): string | null {
  try {
    const url = new URL(configured ?? '');
    if (url.protocol !== 'https:') return null;
    url.pathname = url.pathname.replace(/\/api\/analyze\/?$/, '') + '/api/measure';
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}

export const acceptedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
export const maxBytes = 8 * 1024 * 1024 - 4096;

export function validEngineResult(body: unknown): body is EngineResult {
  const result = body as EngineResult;
  return !!result && result.schemaVersion === 1 && result.ok === true && !!result.measurements && !!result.quality
    && typeof result.engine === 'string' && Array.isArray(result.quality.warnings) && result.quality.warnings.every(value => typeof value === 'string')
    && (!result.ranges || ['qrsMs','qtMs'].every(key => {const range=result.ranges?.[key as 'qrsMs'|'qtMs'];return range===undefined || Array.isArray(range)&&range.length===2&&range.every(Number.isFinite);}))
    && (Object.keys(tolerances) as (keyof Measurements)[]).every(key => result.measurements[key] === null || Number.isFinite(result.measurements[key]));
}
