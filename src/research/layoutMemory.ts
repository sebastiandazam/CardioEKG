import type { CaptureLead, Crop } from './digitize';
import { placementFromCrops } from './layoutDetect.ts';
import type { LearnedPlacement, SheetLayout, SheetStructure } from './layoutDetect';

/**
 * Local learning of region corrections.
 *
 * When the user confirms regions, the placement of each lead is stored relative to the
 * tracing bands that were read from the sheet (band index + fraction of the band span).
 * A later sheet with the same layout and band count starts from that placement.
 * Only geometry is stored — never pixels, labels, file names or patient data — and only
 * in this browser. `forgetLearnedLayouts()` erases it.
 */
const KEY = 'cardioekg.layoutMemory.v1';
const LIMIT = 24;

export interface LayoutMemoryEntry extends LearnedPlacement { signature: string; uses: number; updated: string }

export const layoutSignature = (structure: SheetStructure, layout: SheetLayout) => {
  const aspect = structure.width / Math.max(1, structure.height);
  const pulses = structure.bands.filter(b => b.pulse).length;
  return `${layout}|bands:${structure.bands.length}|aspect:${aspect.toFixed(1)}|pulses:${pulses > structure.bands.length / 2 ? 'yes' : 'no'}`;
};

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function readLayoutMemory(store = storage()): LayoutMemoryEntry[] {
  try {
    const parsed = JSON.parse(store?.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.signature === 'string' && e.leads) : [];
  } catch { return []; }
}

export function recallLayout(structure: SheetStructure, layout: SheetLayout, store = storage()): LearnedPlacement | null {
  const signature = layoutSignature(structure, layout);
  return readLayoutMemory(store).find(entry => entry.signature === signature) ?? null;
}

/** Store confirmed regions. Returns false when nothing could be learned (no bands, storage blocked). */
export function learnLayout(structure: SheetStructure | null | undefined, layout: SheetLayout, crops: Partial<Record<CaptureLead, Crop>>, store = storage()): boolean {
  if (!structure || !store) return false;
  const placement = placementFromCrops(structure, layout, crops);
  if (!placement || Object.keys(placement.leads).length < 6) return false;
  const signature = layoutSignature(structure, layout);
  const entries = readLayoutMemory(store);
  const previous = entries.find(e => e.signature === signature);
  const entry: LayoutMemoryEntry = { ...placement, signature, uses: (previous?.uses ?? 0) + 1, updated: new Date().toISOString().slice(0, 10) };
  const next = [entry, ...entries.filter(e => e.signature !== signature)].slice(0, LIMIT);
  try { store.setItem(KEY, JSON.stringify(next)); return true; } catch { return false; }
}

export function forgetLearnedLayouts(store = storage()) {
  try { store?.removeItem(KEY); } catch { /* storage unavailable: nothing stored */ }
}
