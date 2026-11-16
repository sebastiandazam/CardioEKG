import type { CaptureLead, Crop, Lead } from './digitize';
import type { LabelEvidence, LabelHit } from './labels';

/**
 * Content-based reading of a whole 12-lead sheet.
 *
 * The previous proposal divided the page into fixed percentages. This module reads
 * the image itself: it separates tracing ink from the grid, finds every tracing band,
 * measures where each band's ink starts and ends, finds the 1 mV calibration pulse,
 * infers the lead layout and, when OCR finds printed labels, anchors each lead at its
 * label. Everything is returned in percent of the analysed image so the result can be
 * re-used after OCR without the pixels.
 */
export type SheetLayout = '4x3' | '2x6';
export type LayoutChoice = SheetLayout | 'auto';
export type SheetCrops = Record<CaptureLead, Crop>;

export interface TraceBand {
  /** Vertical extent of the band (percent of image height). */
  top: number; bottom: number;
  /** Row with the most ink: usually the isoelectric baseline. */
  core: number;
  /** Horizontal extent of continuous tracing ink (percent of image width). */
  left: number; right: number;
  /** First column after the calibration pulse, when one was found. */
  dataLeft: number;
  /** Calibration pulse, if found: horizontal span and height (percent of image). */
  pulse: { left: number; right: number; height: number } | null;
  /** Lead-change breaks found as gaps in the tracing (percent of image width). */
  gaps: number[];
  /** Straight vertical bars taller than the band's waveforms: printed lead-change markers. */
  bars: number[];
}

export interface SheetStructure {
  width: number; height: number;
  bands: TraceBand[];
  /** Layout inferred from band count, gaps and labels; null when ambiguous. */
  inferredLayout: SheetLayout | null;
}

export type LeadSource = 'label' | 'ink' | 'learned' | 'template';
export interface StructuredCrops {
  crops: SheetCrops;
  layout: SheetLayout;
  evidence: LabelEvidence;
  sources: Record<CaptureLead, LeadSource>;
  rhythmDetected: boolean;
  rowsDetected: boolean;
  layoutAmbiguous: boolean;
}

export const layoutRows: Record<SheetLayout, Lead[][]> = {
  '4x3': [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']],
  '2x6': [['I', 'V1'], ['II', 'V2'], ['III', 'V3'], ['aVR', 'V4'], ['aVL', 'V5'], ['aVF', 'V6']],
};

/** True for grid-coloured pixels: red, pink or orange paper rules. */
export const isGridColour = (r: number, g: number, b: number) => r > 110 && r - g > 45 && r - b > 35;

/**
 * Dark pixels that are not grid-coloured: printed trace and text in black, navy, blue or
 * green ink (Wave-Maven prints navy traces and blue labels/lead-change bars on a red grid).
 */
export function traceMask(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const luminance = .299 * r + .587 * g + .114 * b;
    if (rgba[i + 3] > 128 && luminance < 140 && !isGridColour(r, g, b)) mask[p] = 1;
  }
  // Remove straight rules (dark grid lines, frames). A rule is one unbroken run across most of the
  // page; a tracing baseline is broken by every complex, so it survives.
  const longestRun = (length: number, at: (k: number) => number) => {
    let best = 0, run = 0;
    for (let k = 0; k < length; k++) { if (at(k)) { run++; if (run > best) best = run; } else run = 0; }
    return best;
  };
  for (let y = 0; y < height; y++) if (longestRun(width, x => mask[y * width + x]) > width * .85) mask.fill(0, y * width, (y + 1) * width);
  for (let x = 0; x < width; x++) if (longestRun(height, y => mask[y * width + x]) > height * .85) for (let y = 0; y < height; y++) mask[y * width + x] = 0;
  return mask;
}

const smooth = (values: number[], radius: number) => values.map((_, i) => {
  let sum = 0, n = 0;
  for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) { sum += values[j]; n++; }
  return sum / n;
});

/** Longest run of consecutive columns that contain ink between rows y0..y1. */
function columnCoverage(mask: Uint8Array, width: number, y0: number, y1: number) {
  const has = new Uint8Array(width);
  for (let y = y0; y <= y1; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) has[x] = 1;
  // Bridge tiny breaks (pen gaps, lead changes) of up to 1.2 % of the width.
  const bridge = Math.max(2, Math.round(width * .012));
  let longest = 0, runStart = -1, lastInk = -1, first = -1, last = -1;
  for (let x = 0; x < width; x++) {
    if (!has[x]) continue;
    if (first < 0) first = x;
    last = x;
    if (runStart < 0 || x - lastInk > bridge) runStart = x;
    lastInk = x;
    longest = Math.max(longest, x - runStart + 1);
  }
  return { has, longest, first, last };
}

/** Vertical length of the longest ink run in one column, within a band. */
function verticalRun(mask: Uint8Array, width: number, x: number, y0: number, y1: number) {
  let best = 0, run = 0, top = -1, bestTop = -1;
  for (let y = y0; y <= y1; y++) {
    if (mask[y * width + x]) { if (!run) top = y; run++; if (run > best) { best = run; bestTop = top; } }
    else run = 0;
  }
  return { length: best, top: bestTop };
}

/** Rectangular 1 mV pulse at the start of a band: rising edge, flat top, falling edge. */
function findPulse(mask: Uint8Array, width: number, y0: number, y1: number, start: number, end: number) {
  const bandHeight = y1 - y0 + 1, minEdge = Math.max(6, bandHeight * .18);
  const limit = Math.min(end, start + Math.round((end - start) * .07));
  for (let a = start; a < limit; a++) {
    const rise = verticalRun(mask, width, a, y0, y1);
    if (rise.length < minEdge) continue;
    const maxWidth = Math.round((end - start) * .04);
    for (let b = a + 3; b <= Math.min(limit + maxWidth, a + maxWidth); b++) {
      const fall = verticalRun(mask, width, b, y0, y1);
      if (fall.length < minEdge * .8 || Math.abs(fall.length - rise.length) > rise.length * .3) continue;
      // Flat top: the topmost ink between the edges stays within a few pixels of the edge tops.
      const topRow = Math.min(rise.top, fall.top);
      let flat = 0;
      for (let x = a + 1; x < b; x++) {
        for (let y = Math.max(y0, topRow - 3); y <= Math.min(y1, topRow + 3); y++) if (mask[y * width + x]) { flat++; break; }
      }
      if (flat >= (b - a - 1) * .7) return { left: a, right: b, height: rise.length };
    }
  }
  return null;
}

/** Find every tracing band and its horizontal structure. Pure: works on any RGBA buffer. */
export function analyzeStructure(rgba: Uint8ClampedArray, width: number, height: number): SheetStructure {
  const mask = traceMask(rgba, width, height);
  const profile = Array.from({ length: height }, (_, y) => {
    let count = 0;
    for (let x = 0; x < width; x++) count += mask[y * width + x];
    return count;
  });
  const smoothed = smooth(profile, Math.max(1, Math.round(height * .004)));
  const peak = Math.max(...smoothed, 0);
  const bands: TraceBand[] = [];
  if (peak < width * .05) return { width, height, bands, inferredLayout: null };
  // 1) Cores: rows dense with ink (the baselines of each tracing).
  const coreLevel = Math.max(width * .05, peak * .22);
  const cores: { from: number; to: number; at: number }[] = [];
  for (let y = 0; y < height; y++) {
    if (smoothed[y] < coreLevel) continue;
    const last = cores[cores.length - 1];
    if (last && y - last.to <= Math.max(2, height * .015)) { last.to = y; if (smoothed[y] > smoothed[last.at]) last.at = y; }
    else cores.push({ from: y, to: y, at: y });
  }
  // 2) Expand each core while rows still carry waveform ink, never past the midpoint to a neighbour.
  const floor = Math.max(1, width * .002);
  const candidates = cores.map((core, index) => {
    const upperLimit = index ? Math.round((cores[index - 1].at + core.at) / 2) : 0;
    const lowerLimit = index < cores.length - 1 ? Math.round((core.at + cores[index + 1].at) / 2) : height - 1;
    let top = core.from, bottom = core.to;
    while (top - 1 > upperLimit && profile[top - 1] >= floor) top--;
    while (bottom + 1 < lowerLimit && profile[bottom + 1] >= floor) bottom++;
    return { ...core, top, bottom };
  });
  // 3) Keep tracings, reject text: a tracing is one long continuous line; text breaks at every word.
  for (const candidate of candidates) {
    const coverage = columnCoverage(mask, width, candidate.top, candidate.bottom);
    if (coverage.longest < width * .3) continue;
    const pulse = findPulse(mask, width, candidate.top, candidate.bottom, coverage.first, coverage.last);
    const dataLeft = pulse ? Math.min(coverage.last, pulse.right + Math.max(2, Math.round(width * .004))) : coverage.first;
    // Lead-change gaps: empty column runs inside the tracing, longer than a pen gap.
    const gaps: number[] = [];
    let runStart = -1;
    for (let x = dataLeft; x <= coverage.last; x++) {
      if (!coverage.has[x]) { if (runStart < 0) runStart = x; }
      else if (runStart >= 0) {
        if (x - runStart >= Math.max(3, width * .004)) gaps.push((runStart + x - 1) / 2);
        runStart = -1;
      }
    }
    // Lead-change bars: straight vertical strokes spanning most of the band, often into the next band.
    const bars: number[] = [];
    const bandHeight = candidate.bottom - candidate.top + 1;
    for (let x = Math.round(dataLeft + width * .02); x < coverage.last - width * .02; x++) {
      const run = verticalRun(mask, width, x, Math.max(0, candidate.top - Math.round(bandHeight * .3)), Math.min(height - 1, candidate.bottom + Math.round(bandHeight * .3)));
      if (run.length >= bandHeight * .9 && (!bars.length || x - bars[bars.length - 1] > width * .02)) bars.push(x);
    }
    const pct = (v: number, total: number) => 100 * v / total;
    bands.push({
      top: pct(candidate.top, height), bottom: pct(candidate.bottom + 1, height), core: pct(candidate.at, height),
      left: pct(coverage.first, width), right: pct(coverage.last + 1, width), dataLeft: pct(dataLeft, width),
      pulse: pulse ? { left: pct(pulse.left, width), right: pct(pulse.right, width), height: pct(pulse.height, height) } : null,
      gaps: gaps.map(g => pct(g, width)),
      bars: bars.map(x => pct(x, width)),
    });
  }
  return { width, height, bands, inferredLayout: inferLayout(bands) };
}

/** Gaps near 1/4, 2/4, 3/4 of the data span mean four columns; near 1/2 alone means two. */
function columnsFromGaps(band: TraceBand): 4 | 2 | null {
  const span = band.right - band.dataLeft;
  const near = (fraction: number) => [...band.gaps, ...band.bars].some(g => Math.abs((g - band.dataLeft) / span - fraction) < .04);
  if (near(.25) && near(.75)) return 4;
  if (near(.5) && !near(.25) && !near(.75)) return 2;
  return null;
}

export function inferLayout(bands: TraceBand[], hits: LabelHit[] = []): SheetLayout | null {
  // Printed labels decide first: aVR on the same band as I means 4x3; V1 there means 2x6.
  const bandOf = (hit: LabelHit) => bandIndexForLabel(bands, hit);
  const row = (lead: Lead) => { const hit = hits.find(h => h.lead === lead); return hit ? bandOf(hit) : -1; };
  if (row('I') >= 0) {
    if (row('aVR') === row('I') || row('V4') === row('I')) return '4x3';
    if (row('V1') === row('I') && row('aVR') !== row('I')) return '2x6';
  }
  const votes = bands.slice(0, 3).map(columnsFromGaps).filter(Boolean);
  if (votes.length && votes.every(v => v === 4)) return '4x3';
  if (votes.length && votes.every(v => v === 2) && bands.length >= 6) return '2x6';
  if (bands.length >= 3 && bands.length <= 5) return '4x3';
  if (bands.length >= 7) return '2x6';
  return null; // 6 bands: 4x3 with three rhythm strips or 2x6 — needs labels or the user.
}

function bandIndexForLabel(bands: TraceBand[], hit: LabelHit) {
  const y = (hit.top + hit.bottom) / 2;
  let best = -1, distance = Infinity;
  bands.forEach((band, index) => {
    // Labels are printed above or at the level of their tracing's baseline, never below it:
    // a label just under one band's excursions belongs to the next band.
    const inside = y >= band.top - (band.bottom - band.top) * .35 && y <= band.core + (band.bottom - band.top) * .1;
    const d = Math.abs(y - band.core);
    if (inside && d < distance) { best = index; distance = d; }
  });
  return best;
}

/** Previously learned placement for this kind of sheet (see layoutMemory.ts). */
export interface LearnedPlacement {
  layout: SheetLayout;
  bandCount: number;
  /** Per lead: band index and fractions of that band's data span. */
  leads: Partial<Record<CaptureLead, { band: number; from: number; to: number }>>;
}

/**
 * Build the 13 capture regions from the detected structure.
 * Priority per lead: printed label > learned correction for this sheet type > ink structure > template.
 */
export function cropsFromStructure(structure: SheetStructure, requested: LayoutChoice, hits: LabelHit[] = [], learned?: LearnedPlacement | null): StructuredCrops | null {
  const { bands } = structure;
  const inferred = requested === 'auto' ? (inferLayout(bands, hits) ?? learned?.layout ?? null) : requested;
  // Six unlabelled bands can be 4x3 with three rhythm strips or 2x6: assume the commoner 4x3 and say so.
  const layoutAmbiguous = inferred === null;
  const layout: SheetLayout = inferred ?? '4x3';
  const grid = layoutRows[layout];
  if (bands.length < grid.length) return null;
  const crops = {} as SheetCrops;
  const sources = {} as Record<CaptureLead, LeadSource>;
  const evidence: LabelEvidence = {};
  const margin = .25;
  const box = (band: TraceBand, from: number, to: number): Crop => ({
    left: Math.max(0, from + margin), right: Math.min(100, to - margin),
    top: Math.max(0, band.top - .3), bottom: Math.min(100, band.bottom + .3),
  });
  // Main rows are the first bands; extra bands below are rhythm strips.
  const main = bands.slice(0, grid.length), rhythm = bands.slice(grid.length);
  const useLearned = learned && learned.layout === layout && learned.bandCount === bands.length ? learned : null;
  main.forEach((band, rowIndex) => {
    const row = grid[rowIndex], span = band.right - band.dataLeft;
    // Column starts: printed label positions on this band, then gaps, then an even split of the measured ink span.
    const starts = row.map((_, col) => band.dataLeft + span * col / row.length);
    const labelled = new Set<Lead>();
    row.forEach((lead, col) => {
      const hit = hits.find(h => h.lead === lead && bandIndexForLabel(bands, h) === rowIndex);
      if (hit && Math.abs(hit.left - starts[col]) < span / row.length * .45) {
        // The label sits just after the lead change; a printed bar right before it is the exact boundary.
        const bar = band.bars.filter(x => x <= hit.left + .3 && hit.left - x < span * .04).pop();
        starts[col] = col ? bar ?? hit.left : Math.max(band.dataLeft, Math.min(hit.left, starts[col]));
        labelled.add(lead);
      }
      else if (col) {
        const gap = band.gaps.find(g => Math.abs(g - starts[col]) < span * .04);
        const bar = band.bars.reduce<number | undefined>((best, x) => Math.abs(x - starts[col]) < span * .05 && (best === undefined || Math.abs(x - starts[col]) < Math.abs(best - starts[col])) ? x : best, undefined);
        if (bar !== undefined) starts[col] = bar; else if (gap !== undefined) starts[col] = gap;
      }
    });
    row.forEach((lead, col) => {
      const from = starts[col], to = col < row.length - 1 ? starts[col + 1] : band.right;
      const memory = useLearned?.leads[lead];
      if (labelled.has(lead)) {
        crops[lead] = box(band, from, to); sources[lead] = 'label';
        evidence[lead] = { method: 'ocr', confidence: hits.find(h => h.lead === lead)?.confidence };
      } else if (memory && memory.band === rowIndex) {
        crops[lead] = box(band, band.dataLeft + span * memory.from, band.dataLeft + span * memory.to); sources[lead] = 'learned';
      } else {
        crops[lead] = box(band, from, to); sources[lead] = 'ink';
      }
    });
  });
  // Rhythm strip for II: the rhythm band labelled II, else the learned one, else the first rhythm band.
  const labelledRhythm = rhythm.findIndex((_, index) => hits.some(h => h.lead === 'II' && bandIndexForLabel(bands, h) === grid.length + index));
  const learnedRhythm = useLearned?.leads['II-long'] ? useLearned.leads['II-long'].band - grid.length : -1;
  const rhythmIndex = labelledRhythm >= 0 ? labelledRhythm : learnedRhythm >= 0 && learnedRhythm < rhythm.length ? learnedRhythm : rhythm.length ? 0 : -1;
  if (rhythmIndex >= 0) {
    const band = rhythm[rhythmIndex];
    crops['II-long'] = box(band, band.dataLeft, band.right);
    sources['II-long'] = labelledRhythm >= 0 ? 'label' : learnedRhythm >= 0 ? 'learned' : 'ink';
    if (labelledRhythm >= 0) evidence['II-long'] = { method: 'ocr' };
  } else {
    const last = main[main.length - 1];
    crops['II-long'] = { left: last.dataLeft, right: last.right, top: Math.min(99, last.bottom + .5), bottom: 100 };
    sources['II-long'] = 'template';
  }
  return { crops, layout, evidence, sources, rhythmDetected: rhythmIndex >= 0, rowsDetected: true, layoutAmbiguous };
}

/** Express user-confirmed crops relative to the structure, so the same sheet type can be re-used later. */
export function placementFromCrops(structure: SheetStructure, layout: SheetLayout, crops: Partial<Record<CaptureLead, Crop>>): LearnedPlacement | null {
  if (!structure.bands.length) return null;
  const leads: LearnedPlacement['leads'] = {};
  for (const [lead, crop] of Object.entries(crops) as [CaptureLead, Crop][]) {
    const center = (crop.top + crop.bottom) / 2;
    let band = -1, distance = Infinity;
    structure.bands.forEach((b, index) => { const d = Math.abs(b.core - center); if (d < distance) { distance = d; band = index; } });
    const b = structure.bands[band], span = b.right - b.dataLeft;
    if (band < 0 || span <= 0 || distance > (b.bottom - b.top)) continue;
    leads[lead] = { band, from: (crop.left - b.dataLeft) / span, to: (crop.right - b.dataLeft) / span };
  }
  return { layout, bandCount: structure.bands.length, leads };
}

/**
 * Height of the detected calibration pulses in millimetres = printed gain in mm/mV.
 * Needs the confirmed 5 × 5 mm grid reference (image percent) and the paper region.
 * Returns the median over bands with a pulse, or null.
 */
export function pulseGainMm(structure: SheetStructure | null | undefined, paper: Crop | null, gridReference: Crop | undefined): number | null {
  if (!structure || !paper || !gridReference) return null;
  const mmPerImagePercent = 5 / Math.max(1e-6, gridReference.bottom - gridReference.top);
  const heights = structure.bands.flatMap(b => b.pulse ? [b.pulse.height * (paper.bottom - paper.top) / 100 * mmPerImagePercent] : []).sort((a, b) => a - b);
  return heights.length ? Math.round(heights[Math.floor(heights.length / 2)] * 10) / 10 : null;
}

/** Peaks of a line profile that reach `level` of its maximum, merged when closer than 3 px. */
function linePeaks(profile: number[], level: number) {
  const max = Math.max(...profile, 0), peaks: number[] = [];
  for (let i = 1; i < profile.length - 1; i++) {
    if (profile[i] < max * level || profile[i] < profile[i - 1] || profile[i] < profile[i + 1]) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < 3) { if (profile[i] > profile[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i; continue; }
    peaks.push(i);
  }
  return peaks;
}

/** Major-line positions with a regular pitch; null when the lattice is not regular. */
function majorLines(profile: number[]) {
  for (const level of [.6, .45, .3]) {
    const peaks = linePeaks(profile, level);
    if (peaks.length < 4) continue;
    const gaps = peaks.slice(1).map((p, i) => p - peaks[i]).sort((a, b) => a - b);
    const pitch = gaps[Math.floor(gaps.length / 2)];
    if (pitch < 8) continue;
    const regular = gaps.filter(g => Math.abs(g - pitch) <= Math.max(2, pitch * .1)).length;
    if (regular >= gaps.length * .6 && regular >= 3) return { peaks, pitch };
  }
  return null;
}

/**
 * Place the 5 × 5 mm reference on a real large grid square: find the red/pink major
 * grid lines, check that horizontal and vertical pitches agree, and choose the square
 * with the least tracing ink near the top-left of the grid. Returns image percent.
 */
export function locateGridSquare(rgba: Uint8ClampedArray, width: number, height: number): Crop | null {
  const grid = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < grid.length; p++, i += 4) if (isGridColour(rgba[i], rgba[i + 1], rgba[i + 2])) grid[p] = 1;
  const columns = Array.from({ length: width }, (_, x) => { let n = 0; for (let y = 0; y < height; y++) n += grid[y * width + x]; return n; });
  const rows = Array.from({ length: height }, (_, y) => { let n = 0; for (let x = 0; x < width; x++) n += grid[y * width + x]; return n; });
  const vertical = majorLines(columns), horizontal = majorLines(rows);
  if (!vertical || !horizontal) return null;
  if (Math.abs(vertical.pitch - horizontal.pitch) > Math.max(2, vertical.pitch * .08)) return null;
  const ink = traceMask(rgba, width, height);
  let best: { score: number; box: Crop } | null = null;
  const isMajor = (peaks: number[], a: number, pitch: number) => peaks.some(p => Math.abs(p - a - pitch) <= Math.max(2, pitch * .1));
  vertical.peaks.forEach((x0, i) => {
    if (!isMajor(vertical.peaks, x0, vertical.pitch)) return;
    const x1 = vertical.peaks.find(p => Math.abs(p - x0 - vertical.pitch) <= Math.max(2, vertical.pitch * .1))!;
    horizontal.peaks.forEach((y0, j) => {
      if (!isMajor(horizontal.peaks, y0, horizontal.pitch)) return;
      const y1 = horizontal.peaks.find(p => Math.abs(p - y0 - horizontal.pitch) <= Math.max(2, horizontal.pitch * .1))!;
      let inked = 0;
      for (let y = y0 + 2; y < y1 - 1; y++) for (let x = x0 + 2; x < x1 - 1; x++) inked += ink[y * width + x];
      // Clean squares first, then prefer the upper-left part of the grid where users look first.
      const score = inked * 1000 + i + j;
      if (!best || score < best.score) best = { score, box: { left: 100 * x0 / width, right: 100 * x1 / width, top: 100 * y0 / height, bottom: 100 * y1 / height } };
    });
  });
  return best ? (best as { box: Crop }).box : null;
}
