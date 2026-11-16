import { leads } from './digitize.ts';
import type { CaptureLead, Crop, Lead } from './digitize';
import type { SheetCrops } from './sheet';
export interface LabelHit { lead: Lead; confidence: number; left: number; top: number; right: number; bottom: number }
export type LabelEvidence = Partial<Record<CaptureLead, { method: 'ocr' | 'manual'; confidence?: number }>>;

type Word = { line: string; text: string; confidence: number; x: number; y: number; w: number; h: number };
const clean = (text: string) => text.trim().replace(/^[|()[\]{}:;.,'"`]+|[|()[\]{}:;.,'"`]+$/g, '');

const LEAD_CONFUSIONS: Record<string, { lead: Lead; penalty: number }> = {
  // Roman numeral leads (high-risk confusions require penalty)
  'i': { lead: 'I', penalty: 0 },
  'ii': { lead: 'II', penalty: 0 },
  'll': { lead: 'II', penalty: 12 },
  'il': { lead: 'II', penalty: 10 },
  'li': { lead: 'II', penalty: 10 },
  'iii': { lead: 'III', penalty: 0 },
  'lll': { lead: 'III', penalty: 12 },
  'iil': { lead: 'III', penalty: 10 },
  'ili': { lead: 'III', penalty: 10 },
  'lii': { lead: 'III', penalty: 10 },
  // Augmented limb leads
  'avr': { lead: 'aVR', penalty: 0 },
  'avl': { lead: 'aVL', penalty: 0 },
  'avi': { lead: 'aVL', penalty: 10 },
  'av1': { lead: 'aVL', penalty: 10 },
  'avf': { lead: 'aVF', penalty: 0 },
  // Precordial leads V1-V6
  'v1': { lead: 'V1', penalty: 0 },
  'vl': { lead: 'V1', penalty: 10 },
  'vi': { lead: 'V1', penalty: 8 },
  'v!': { lead: 'V1', penalty: 10 },
  'v2': { lead: 'V2', penalty: 0 },
  'vii': { lead: 'V2', penalty: 10 },
  'vll': { lead: 'V2', penalty: 12 },
  'v3': { lead: 'V3', penalty: 0 },
  'viii': { lead: 'V3', penalty: 10 },
  'v4': { lead: 'V4', penalty: 0 },
  'v5': { lead: 'V5', penalty: 0 },
  'vs': { lead: 'V5', penalty: 12 },
  'v6': { lead: 'V6', penalty: 0 },
  'vg': { lead: 'V6', penalty: 14 },
};

export function normalizeLeadToken(text: string): { lead: Lead; penalty: number } | undefined {
  const cleaned = clean(text);
  if (!cleaned) return undefined;
  const exact = leads.find(lead => lead.toLowerCase() === cleaned.toLowerCase());
  if (exact) return { lead: exact, penalty: 0 };
  const compact = cleaned.replace(/\s+/g, '').toLowerCase();
  return LEAD_CONFUSIONS[compact];
}

/**
 * Lead labels from Tesseract TSV. Printed labels are often letter-spaced ("aV R", "V 1")
 * or slightly degraded ("Vl", "ll", "aVl"). Neighbouring words on the same line are joined
 * when the gap is smaller than the text height, and duplicate overlapping hits are merged.
 */
export function readLeadLabels(tsv: string, width: number, height: number): LabelHit[] {
  if (width <= 0 || height <= 0) return [];
  const words: Word[] = tsv.split('\n').slice(1).flatMap(line => {
    const fields = line.split('\t');
    if (fields.length < 12 || fields[0] !== '5') return [];
    const [x, y, w, h] = fields.slice(6, 10).map(Number), confidence = Number(fields[10]);
    const text = clean(fields.slice(11).join(''));
    if (!text || !Number.isFinite(confidence) || ![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return [];
    return [{ line: fields.slice(1, 5).join('.'), text, confidence, x, y, w, h }];
  });
  const byLine = new Map<string, Word[]>();
  for (const word of words) byLine.set(word.line, [...(byLine.get(word.line) ?? []), word]);
  const rawHits: LabelHit[] = [];
  for (const line of byLine.values()) {
    const ordered = line.slice().sort((a, b) => a.x - b.x);
    for (let i = 0; i < ordered.length; i++) {
      // Longest run of up to three adjacent words that spells a lead name.
      let found: { lead: Lead; penalty: number; parts: Word[] } | null = null;
      for (let n = Math.min(3, ordered.length - i); n >= 1 && !found; n--) {
        const parts = ordered.slice(i, i + n);
        const adjacent = parts.every((part, k) => !k || (part.x - (parts[k - 1].x + parts[k - 1].w) >= -2 && part.x - (parts[k - 1].x + parts[k - 1].w) <= Math.max(part.h, parts[k - 1].h) * 1.2));
        const matched = adjacent ? normalizeLeadToken(parts.map(p => p.text).join('')) : undefined;
        if (matched) found = { lead: matched.lead, penalty: matched.penalty, parts };
      }
      if (!found) continue;
      const confidence = Math.max(0, Math.min(...found.parts.map(p => p.confidence)) - found.penalty);
      // Roman numerals are easily hallucinated from vertical strokes, so they need high confidence.
      // Other names are distinctive; low-confidence matches are still checked against band and column positions later.
      if (confidence < (found.lead.startsWith('I') ? 65 : 25)) continue;
      const left = Math.min(...found.parts.map(p => p.x)), top = Math.min(...found.parts.map(p => p.y));
      const right = Math.max(...found.parts.map(p => p.x + p.w)), bottom = Math.max(...found.parts.map(p => p.y + p.h));
      rawHits.push({ lead: found.lead, confidence, left: 100 * left / width, top: 100 * top / height, right: 100 * right / width, bottom: 100 * bottom / height });
      i += found.parts.length - 1;
    }
  }
  // Spatial non-maximum suppression: preserve line order while dropping lower-confidence duplicates of the same lead within 3%.
  return rawHits.filter((candidate, idx) => {
    const cx = (candidate.left + candidate.right) / 2;
    const cy = (candidate.top + candidate.bottom) / 2;
    return !rawHits.some((other, otherIdx) =>
      otherIdx !== idx
      && other.lead === candidate.lead
      && Math.abs((other.left + other.right) / 2 - cx) < 3
      && Math.abs((other.top + other.bottom) / 2 - cy) < 3
      && (other.confidence > candidate.confidence || (other.confidence === candidate.confidence && otherIdx < idx))
    );
  });
}

/**
 * Assign unique labels to nearby trace slots via minimum-cost bipartite matching;
 * retain explicit positional fallbacks for unmatched leads.
 */
export function applyLeadLabels(base: SheetCrops, hits: LabelHit[]): { crops: SheetCrops; evidence: LabelEvidence } {
  const slots = [...leads, 'II-long' as const];
  type Edge = { slot: CaptureLead; target: CaptureLead; hit: LabelHit; cost: number };
  const edges: Edge[] = hits.flatMap(hit => slots.flatMap(slot => {
    const box = base[slot];
    const width = Math.max(1e-3, box.right - box.left), height = Math.max(1e-3, box.bottom - box.top);
    const xDistance = Math.abs(hit.left - box.left) / width;
    const yDistance = Math.abs((hit.top + hit.bottom) / 2 - (box.top + box.bottom) / 2) / height;
    // A rhythm strip may only receive II. Do not confuse its repeated label with short II.
    if ((slot === 'II-long' && hit.lead !== 'II') || xDistance > .3 || yDistance > .85) return [];
    const target: CaptureLead = slot === 'II-long' ? 'II-long' : hit.lead;
    return [{ slot, target, hit, cost: xDistance + yDistance * .65 - hit.confidence / 1000 }];
  })).sort((a, b) => a.cost - b.cost);

  // Deduplicate edges to at most the best hit per (slot, target) pair before bipartite search.
  const bestPair = new Map<string, Edge>();
  for (const edge of edges) {
    const key = `${edge.slot}::${edge.target}`;
    const existing = bestPair.get(key);
    if (!existing || edge.cost < existing.cost) bestPair.set(key, edge);
  }
  const uniqueEdges = [...bestPair.values()].sort((a, b) => a.cost - b.cost);

  // Optimal bounded-branch matching maximizing matched count first, then minimizing total cost.
  const targets = [...new Set(uniqueEdges.map(e => e.target))];
  const edgesByTarget = new Map<CaptureLead, Edge[]>(targets.map(t => [t, uniqueEdges.filter(e => e.target === t)]));
  let bestCount = 0;
  let bestCost = Infinity;
  let bestChosen: Edge[] = [];
  const usedSlots = new Set<CaptureLead>();
  const usedHits = new Set<LabelHit>();
  const current: Edge[] = [];

  function search(idx: number, costSoFar: number) {
    if (current.length > bestCount || (current.length === bestCount && costSoFar < bestCost)) {
      bestCount = current.length;
      bestCost = costSoFar;
      bestChosen = [...current];
    }
    if (idx >= targets.length || current.length + (targets.length - idx) < bestCount) return;
    const target = targets[idx];
    for (const edge of edgesByTarget.get(target) ?? []) {
      if (usedSlots.has(edge.slot) || usedHits.has(edge.hit)) continue;
      usedSlots.add(edge.slot);
      usedHits.add(edge.hit);
      current.push(edge);
      search(idx + 1, costSoFar + edge.cost);
      current.pop();
      usedHits.delete(edge.hit);
      usedSlots.delete(edge.slot);
    }
    search(idx + 1, costSoFar);
  }
  if (targets.length <= 13) search(0, 0);

  const assigned = new Map<CaptureLead, CaptureLead>();
  const used = new Set<CaptureLead>();
  const evidence: LabelEvidence = {};
  for (const option of bestChosen) {
    if (assigned.has(option.target) || used.has(option.slot)) continue;
    assigned.set(option.target, option.slot);
    used.add(option.slot);
    evidence[option.target] = { method: 'ocr', confidence: option.hit.confidence };
  }
  for (const lead of slots) {
    if (assigned.has(lead)) continue;
    const slot = !used.has(lead) ? lead : slots.find(candidate => !used.has(candidate))!;
    assigned.set(lead, slot);
    used.add(slot);
  }
  return { crops: Object.fromEntries(slots.map(lead => [lead, base[assigned.get(lead)!]])) as SheetCrops, evidence };
}

/** Printed recording settings such as "25 mm/sec, 10 mm/mV" (OCR often spaces or corrupts letters). */
export function readPrintedCalibration(text: string): { speed?: 25 | 50; gain?: 5 | 10 | 20 } {
  // Tolerant of OCR damage such as "25mm Aec, 10mm AY" or "10mm/rnV" while preserving word boundaries between tokens.
  const normalized = text.toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
  let speed: 25 | 50 | undefined, gain: 5 | 10 | 20 | undefined;
  for (const match of normalized.matchAll(/(?<![\d.])(\d{1,2})\s*mm(?=(.{0,8}))/g)) {
    const value = Number(match[1]), after = match[2].replace(/^\s+/, '');
    const perVolt = /^\/?(?:m[vw]|rn[vw]|ay)/.test(after);
    const perSecond = !perVolt && /^\/?(?:s(?:\b|ec|\/|$)|s(?![a-z])|5(?![\d.])|.?.?ec)/.test(after);
    if (!speed && perSecond && (value === 25 || value === 50)) speed = value;
    else if (!gain && perVolt && (value === 5 || value === 10 || value === 20)) gain = value;
  }
  return { ...(speed ? { speed } : {}), ...(gain ? { gain } : {}) };
}
