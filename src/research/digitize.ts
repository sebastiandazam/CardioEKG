import {hierarchicalGrid,gridLattice} from './grid-calibration.ts';
import { normalizePaper } from './illumination.ts';
import { ResearchError, researchMessage } from './locale.ts';
import type { ResearchMessage } from './locale.ts';

export const leads = [
  'I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6',
] as const;

export type Lead = (typeof leads)[number];
export type CaptureLead = Lead | 'II-long';
export type Pattern = 'sinus' | 'af' | 'rbbb' | 'lbbb' | 'indeterminate';

export interface Measurements {
  rateBpm: number | null;
  prMs: number | null;
  qrsMs: number | null;
  qtMs: number | null;
  axisDeg: number | null;
}

export const emptyMeasurements: Measurements = {
  rateBpm: null, prMs: null, qrsMs: null, qtMs: null, axisDeg: null,
};

export interface Trace {
  recordingCalibration?:{speed:number;gain:number;gainSource:'user-declared'|'digital'};
  mv: number[];
  seconds: number;
  quality: number;
}

export interface DigitizedTrace extends Trace {
  width: number;
  height: number;
  points: number[];
  pxPerMmX: number;
  pxPerMmY: number;
  timeMm: number;
  voltageMm: number;
  gaps: number;
  calibration: 'grid' | 'manual';
  // Periodicity alone cannot distinguish a1mm grid from a5mm-only grid.
  gridUnitEvidence?: 'major-minor' | 'periodic-only' | 'manual';
  speed: Calibration['speed'];
  gain: Calibration['gain'];
  warning: string | null;
  warningCode?: ResearchMessage;
}

export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Calibration {
  speed: 25 | 50;
  gain: 5 | 10 | 20;
  widthMm: number | null;
  heightMm: number | null;
  /** Set only by the worker after verifying the original-paper grid. */
  source?: 'paper-grid';
}

export function quantile(values: number[], fraction: number) {
  const ordered = values.slice().sort((a, b) => a - b);
  return ordered[Math.round((ordered.length - 1) * fraction)] ?? 0;
}

function lineSpacing(profile: Float64Array): number | null {
  // Unlike autocorrelation, spacing of observed minor lines does not prefer a
  // darker fifth line. Require many regularly spaced local peaks; never infer
  // millimetres by dividing an isolated major-line estimate by five.
  const values = Array.from(profile);
  const range = Math.max(...values) - quantile(values, .1);
  if (range < .0005) return null;
  const peaks: number[] = [];
  for (let i = 2; i < profile.length - 2; i++) {
    const value = profile[i];
    if (value < profile[i - 1] || value <= profile[i + 1]) continue;
    const base = Math.max(Math.min(profile[i - 2], profile[i - 1]), Math.min(profile[i + 1], profile[i + 2]));
    if (value - base < Math.max(.00015, range * .018)) continue;
    const curvature = 2 * value - profile[i - 1] - profile[i + 1];
    const offset = curvature > 1e-9 ? (profile[i + 1] - profile[i - 1]) / (2 * curvature) : 0;
    peaks.push(i + Math.max(-.5, Math.min(.5, offset)));
  }
  if (peaks.length < 7) return null;
  const gaps = peaks.slice(1).map((x, i) => x - peaks[i]);
  const median = quantile(gaps, .5);
  if (median < 1.8 || median > 60) return null;
  const near = gaps.filter(gap => Math.abs(gap - median) < Math.max(.65, median * .15));
  if (near.length < gaps.length * .75) return null;
  // Regress peak position on its lattice index for fractional-pixel precision.
  const indexes = [0];
  for (const gap of gaps) indexes.push(indexes[indexes.length - 1] + Math.max(1, Math.round(gap / median)));
  const meanIndex = indexes.reduce((a, b) => a + b, 0) / indexes.length;
  const meanPeak = peaks.reduce((a, b) => a + b, 0) / peaks.length;
  let numerator = 0, denominator = 0;
  peaks.forEach((peak, i) => { numerator += (indexes[i] - meanIndex) * (peak - meanPeak); denominator += (indexes[i] - meanIndex) ** 2; });
  const pitch = numerator / denominator;
  const residuals = peaks.map((peak, i) => Math.abs(peak - meanPeak - pitch * (indexes[i] - meanIndex)));
  return quantile(residuals, .85) < Math.max(.7, pitch * .12) ? pitch : null;
}

function hasMajorMinorGrid(profile: Float64Array, pitch: number) {
  const anchor = profile.indexOf(Math.max(...profile));
  const groups: number[][] = Array.from({ length: 5 }, () => []);
  const first = Math.ceil((pitch - anchor) / pitch), last = Math.floor((profile.length - pitch - anchor) / pitch);
  for (let index = first; index <= last; index++) {
    const center = anchor + index * pitch;
    let base = Infinity;
    for (let x = Math.ceil(center - pitch * .45); x <= Math.floor(center + pitch * .45); x++) {
      const value = profile[x];
      base = Math.min(base, value);
    }
    // Integrate line contrast rather than its tallest pixel: fractional pixel
    // alignment can otherwise imitate a dark every-fifth-line hierarchy.
    let contrast = 0;
    for (let x = Math.ceil(center - pitch * .4); x <= Math.floor(center + pitch * .4); x++) {
      contrast += Math.max(0, profile[x] - base);
    }
    groups[((index % 5) + 5) % 5].push(contrast);
  }
  if (groups.some(group => group.length < 2)) return false;
  const amplitudes = groups.map(group => quantile(group, .5)).sort((a, b) => b - a);
  return amplitudes[1] > .0003 && amplitudes[0] > amplitudes[1] * 1.3
    && amplitudes[4] > amplitudes[1] * .25;
}

function estimateGridPeriod(profile: Float64Array) {
  const hierarchy=hierarchicalGrid(profile);
  if(hierarchy)return hierarchy.pitch;
  const observed = lineSpacing(profile);
  if (observed !== null) return observed;
  const length = profile.length;
  const centered = new Float64Array(length);
  let totalVariance = 0;
  for (let i = 0; i < length; i++) {
    let localSum = 0;
    let localCount = 0;
    for (let j = Math.max(0, i - 16); j <= Math.min(length - 1, i + 16); j++) {
      localSum += profile[j];
      localCount++;
    }
    centered[i] = profile[i] - localSum / localCount;
    totalVariance += centered[i] ** 2;
  }
  if (totalVariance / length < 0.000025) return null;

  const maxLag = Math.min(30, Math.floor(length / 6));
  const scores = new Float64Array(maxLag + 1);
  for (let lag = 2; lag <= maxLag; lag++) {
    let dot = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let i = lag; i < length; i++) {
      dot += centered[i] * centered[i - lag];
      leftEnergy += centered[i] ** 2;
      rightEnergy += centered[i - lag] ** 2;
    }
    scores[lag] = dot / Math.max(1e-9, Math.sqrt(leftEnergy * rightEnergy));
  }

  const best = Math.max(...scores);
  const peak = scores.findIndex((score, lag) => {
    return lag >= 2 && lag < maxLag && score >= Math.max(0.38, best * 0.75)
      && score >= scores[lag - 1] && score > scores[lag + 1];
  });
  if (peak === -1) return null;

  const before = scores[peak - 1];
  const after = scores[peak + 1];
  const curvature = 2 * scores[peak] - before - after;
  return peak + (curvature > 1e-9 ? (after - before) / (2 * curvature) : 0);
}

function photoProfiles(rgba: Uint8ClampedArray, width: number, height: number) {
  const ink = new Float32Array(width * height);
  const rows = new Float64Array(height);
  const columns = new Float64Array(width);
  const grayRows = new Float64Array(height);
  const grayColumns = new Float64Array(width);
  const lightRows = new Float64Array(height);
  const lightColumns = new Float64Array(width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const red = rgba[offset];
      const green = rgba[offset + 1];
      const blue = rgba[offset + 2];
      const light = Math.max(red, green, blue);
      const redness = Math.max(0, red - Math.max(green, blue));
      const grayLine = Math.max(0, Math.min(0.45, (235 - light) / 100));
      const grid = redness / 255;
      // Preserve faint 1 mm gray lines above235: clipping them leaves only
      // the darker5 mm grid and can silently multiply the inferred scale.
      const grayGrid = light >= 105 && redness < 18 ? (255 - light) / 255 : 0;
      rows[y] += grid / width;
      columns[x] += grid / height;
      grayRows[y] += grayLine / width;
      grayColumns[x] += grayLine / height;
      lightRows[y] += grayGrid / width;
      lightColumns[x] += grayGrid / height;
      ink[y * width + x] = Math.max(0, (220 - light - 0.45 * redness) / 120);
    }
  }
  return { ink, rows, columns, grayRows, grayColumns, lightRows, lightColumns };
}

function centerStroke(ink: Float32Array, points: number[], width: number, height: number) {
  const runs = points.map((point, x) => {
    const at = (y: number) => ink[y * width + x];
    if (at(point) <= 0.24) return null;
    let low = point;
    let high = point;
    while (low > 0 && at(low - 1) > 0.24) low--;
    while (high + 1 < height && at(high + 1) > 0.24) high++;
    // Preserve long vertical QRS strokes; exclude only nearly full-height rules.
    return high - low < height * 0.92 ? { low, high, center: (low + high) / 2 } : null;
  });
  return points.map((point, x) => {
    const run = runs[x];
    if (!run) return point;
    const next = runs[x + 1];
    if (!next) return run.center;
    const low = Math.max(run.low, next.low);
    const high = Math.min(run.high, next.high);
    if (low > high) return run.center;
    const previous = runs[x - 1];
    const following = runs[x + 2];
    if (previous && following) {
      const nearLow = Math.min(previous.center, following.center);
      const nearHigh = Math.max(previous.center, following.center);
      if (low < nearLow - 3 && high <= nearLow + 3) return low + 1;
      if (high > nearHigh + 3 && low >= nearHigh - 3) return high - 1;
    }
    return (low + high) / 2;
  });
}

/** Suppress only small, detached peripheral ink islands, typically printed labels.
 * Never erase a component connected to the waveform or fill obscured samples. */
function withoutPeripheralLabels(ink:Float32Array,width:number,height:number) {
  const clean=ink.slice(),seen=new Uint8Array(ink.length),queue=new Int32Array(ink.length);
  for(let at=0;at<ink.length;at++) {
    if(seen[at]||ink[at]<=.24)continue;
    let count=1,head=0,left=width,right=0,top=height,bottom=0;queue[0]=at;seen[at]=1;
    while(head<count) {
      const index=queue[head++],x=index%width,y=Math.floor(index/width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const next=ny*width+nx;
        if(!seen[next]&&ink[next]>.24){seen[next]=1;queue[count++]=next;}
      }
    }
    const w=right-left+1,h=bottom-top+1;
    // Thin horizontal fragments may be faint waveform segments; retain them.
    if((bottom<height*.25||top>height*.8)&&w>=2&&h>=4&&w<height*.3&&h<height*.2&&count<width*.03) {
      for(let i=0;i<count;i++)clean[queue[i]]=0;
    }
  }
  return clean;
}

function extractPoints(
  ink: Float32Array,
  rowDarkness: Float64Array,
  columnDarkness: Float64Array,
  width: number,
  height: number,
) {
  ink=withoutPeripheralLabels(ink,width,height);
  let previous = new Float32Array(height);
  let next = new Float32Array(height);
  const history = new Int16Array(width * height);
  const gap = 0.036;
  const border = Math.max(1, Math.round(height * 0.015));

  for (let x = 0; x < width; x++) {
    let bestScore = -Infinity;
    let bestRow = 0;
    let aboveScore = -Infinity;
    let aboveRow = 0;
    for (let y = 0; y < height; y++) {
      if (previous[y] > bestScore) {
        bestScore = previous[y];
        bestRow = y;
      }
      if (previous[y] >= aboveScore - gap) {
        aboveScore = previous[y];
        aboveRow = y;
      } else {
        aboveScore -= gap;
      }
      next[y] = aboveScore;
      history[x * height + y] = aboveRow;
    }
    let belowScore = -Infinity;
    let belowRow = 0;
    for (let y = height - 1; y >= 0; y--) {
      if (previous[y] >= belowScore - gap) {
        belowScore = previous[y];
        belowRow = y;
      } else {
        belowScore -= gap;
      }
      if (belowScore > next[y]) {
        next[y] = belowScore;
        history[x * height + y] = belowRow;
      }
      if (bestScore - 1.35 > next[y]) {
        next[y] = bestScore - 1.35;
        history[x * height + y] = bestRow;
      }
      const edgePenalty = y < border || y >= height - border ? 0.3 : 0;
      const gridPenalty = Math.max(0, rowDarkness[y] - 0.12) * 1.7
        + Math.max(0, columnDarkness[x] - 0.14) * 1.5;
      const weight = Math.max(0, ink[y * width + x] - gridPenalty);
      next[y] += 1.35 * weight - edgePenalty;
    }
    [previous, next] = [next, previous];
  }

  let row = previous.indexOf(Math.max(...previous));
  const points = new Array<number>(width);
  let darkPoints = 0;
  let edgePoints = 0;
  let edgeRun = 0, longestEdgeRun = 0;
  let jumps = 0;
  let gapLength = 0;
  let longestGap = 0;
  for (let x = width - 1; x >= 0; x--) {
    points[x] = row;
    if (ink[row * width + x] > 0.24) {
      darkPoints++;
      gapLength = 0;
    } else {
      gapLength++;
      longestGap = Math.max(longestGap, gapLength);
    }
    // Proximity is not clipping: a tall QRS may approach the border intact.
    // Require ink at the actual raster boundary over a sustained horizontal run.
    const boundary = row <= 1 ? 0 : row >= height-2 ? height-1 : -1;
    if (boundary >= 0 && ink[boundary*width+x]>.24) {
      edgePoints++; edgeRun++; longestEdgeRun=Math.max(longestEdgeRun,edgeRun);
    } else edgeRun=0;
    const nextRow = history[x * height + row];
    if (x>0 && Math.abs(nextRow-row)>height*.25) {
      // Steep connected strokes are normal QRS complexes, not missing data.
      let supported=0;
      const low=Math.min(row,nextRow),high=Math.max(row,nextRow);
      for(let y=low;y<=high;y++) if(ink[y*width+x]>.24 || ink[y*width+x-1]>.24) supported++;
      if(supported/(high-low+1)<.8) jumps++;
    }
    row = nextRow;
  }
  return {
    points: centerStroke(ink, points, width, height),
    coverage: darkPoints / width, edges: edgePoints / width, jumps: jumps / width, longestGap, longestEdgeRun,
  };
}

export function digitize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  calibration: Calibration,
): DigitizedTrace {
  if (width < 140 || height < 48) {
    throw new ResearchError('smallCrop');
  }
  const manual = calibration.widthMm !== null && calibration.heightMm !== null;
  if ((calibration.widthMm === null) !== (calibration.heightMm === null)) {
    throw new ResearchError('manualScale');
  }

  const { ink, rows, columns, grayRows, grayColumns, lightRows, lightColumns } = photoProfiles(normalizePaper(rgba, width, height), width, height);
  const latticeX=gridLattice(columns)??gridLattice(lightColumns);
  const latticeY=gridLattice(rows)??gridLattice(lightRows);
  // A verified minor-line hierarchy in one direction can establish units for
  // the independent major lattice in the other direction, never its length.
  const sharedHierarchy=!!(latticeX&&latticeY&&(latticeX.minorVerified||latticeY.minorVerified)
    &&Math.abs(Math.log(latticeX.majorPitch/latticeY.majorPitch))<=.26);
  const pxPerMmX = manual
    ? width / calibration.widthMm!
    : sharedHierarchy ? latticeX!.pitch : estimateGridPeriod(columns) ?? estimateGridPeriod(lightColumns);
  const pxPerMmY = manual
    ? height / calibration.heightMm!
    : sharedHierarchy ? latticeY!.pitch : estimateGridPeriod(rows) ?? estimateGridPeriod(lightRows);
  if (!pxPerMmX || !pxPerMmY || pxPerMmX < 1.8 || pxPerMmY < 1.8
    || pxPerMmX > 60 || pxPerMmY > 60) {
    throw new ResearchError('gridScale');
  }
  if (!manual && Math.abs(Math.log(pxPerMmX / pxPerMmY)) > 0.26) {
    throw new ResearchError('unevenScale');
  }
  const gridUnitEvidence = manual ? (calibration.source==='paper-grid'?'major-minor':'manual') : (sharedHierarchy || hierarchicalGrid(columns) || hierarchicalGrid(rows) || hierarchicalGrid(lightColumns) || hierarchicalGrid(lightRows) || hasMajorMinorGrid(columns, pxPerMmX) || hasMajorMinorGrid(rows, pxPerMmY)
    || hasMajorMinorGrid(lightColumns, pxPerMmX) || hasMajorMinorGrid(lightRows, pxPerMmY)) ? 'major-minor' : 'periodic-only';
  const timeMm = width / pxPerMmX;
  const voltageMm = height / pxPerMmY;
  const seconds = timeMm / calibration.speed;
  if (seconds < 0.65 || seconds > 20 || voltageMm < 4 || voltageMm > 110) {
    throw new ResearchError('atypicalScale');
  }

  const { points, coverage, edges, jumps, longestGap, longestEdgeRun } = extractPoints(ink, grayRows, grayColumns, width, height);
  const baseline = quantile(points, 0.5);
  const mv = points.map((point) => (baseline - point) / (pxPerMmY * calibration.gain));
  const excursion = quantile(points, 0.98) - quantile(points, 0.02);
  const drift = Math.abs(quantile(points.slice(0, Math.floor(width / 4)), 0.5)
    - quantile(points.slice(-Math.floor(width / 4)), 0.5));
  let warningCode: ResearchMessage | undefined;
  if (longestEdgeRun >= Math.max(3,Math.ceil(width*.003))) {
    warningCode = 'clippedTrace';
  } else if (coverage < 0.85 || longestGap / width > 0.045) {
    warningCode = 'interruptedTrace';
  } else if (jumps > .012) {
    warningCode = 'uncertainTrace';
  } else if (excursion < pxPerMmY * 0.55 || drift > height * 0.28) {
    warningCode = 'flatTrace';
  }
  const quality = Math.max(0, Math.min(1, coverage - 2 * edges - 10 * jumps));

  return {
    mv, seconds, quality, points, width, height, pxPerMmX, pxPerMmY, timeMm, voltageMm,
    gaps: 1 - coverage, calibration: manual && calibration.source!=='paper-grid' ? 'manual' : 'grid', gridUnitEvidence,
    speed: calibration.speed, gain: calibration.gain, warning: warningCode ? researchMessage(warningCode) : null, warningCode,
  };
}

export function resample(trace: Trace, samples: number) {
  return Float32Array.from({ length: samples }, (_, index) => {
    const sourceIndex = index * trace.mv.length / samples;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, trace.mv.length - 1);
    return trace.mv[left] + (trace.mv[right] - trace.mv[left]) * (sourceIndex - left);
  });
}

export function estimateRate(trace: DigitizedTrace | undefined): number | null {
  if (!trace || trace.seconds < 5 || trace.warning || trace.quality < 0.8) return null;
  const signal = resample(trace, Math.round(trace.seconds * 100));
  const energy: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    const window = signal.subarray(Math.max(0, i - 4), Math.min(signal.length, i + 5));
    energy.push(Math.max(...window) - Math.min(...window));
  }
  const floor = quantile(energy, 0.55);
  const ceiling = quantile(energy, 0.94);
  if (ceiling - floor < 0.11) return null;

  const threshold = floor + (ceiling - floor) * 0.56;
  const peaks: number[] = [];
  for (let i = 12; i < energy.length - 12; i++) {
    const value = energy[i];
    if (value < threshold || value < energy[i - 1] || value <= energy[i + 1]) continue;
    const last = peaks.at(-1);
    if (last === undefined || i - last >= 26) {
      peaks.push(i);
    } else if (value > energy[last]) {
      peaks[peaks.length - 1] = i;
    }
  }
  if (peaks.length < 4) return null;

  const intervals = peaks.slice(1).map((peak, index) => (peak - peaks[index]) / 100);
  if (intervals.some((interval) => interval < 0.28 || interval > 2)) return null;
  const median = quantile(intervals, 0.5);
  if (intervals.some((interval) => Math.abs(interval - median) > median * 0.3)) return null;
  return Math.round(60 * intervals.length / intervals.reduce((sum, interval) => sum + interval, 0));
}

/** Image-space draft only; no physical scale, time, voltage or clinical measures. */
export function pixelTraceDraft(rgba:Uint8ClampedArray,width:number,height:number):{width:number;height:number;points:number[];quality:number} {
  const {ink,grayRows,grayColumns}=photoProfiles(normalizePaper(rgba,width,height),width,height);
  const {points,coverage,edges,jumps}=extractPoints(ink,grayRows,grayColumns,width,height);
  return {width,height,points,quality:Math.max(0,Math.min(1,coverage-2*edges-10*jumps))};
}

/** Call on the original-resolution paper region, before per-lead resizing.
 * Null means physical units were not independently supported by grid evidence.
 * Confidence is a contrast-support heuristic, not a calibrated probability. */
export function estimatePaperGrid(rgba:Uint8ClampedArray,width:number,height:number):{
  pxPerMmX:number;pxPerMmY:number;confidence:number;gridUnitEvidence:'major-minor';
}|null {
  const estimate=(pixels:Uint8ClampedArray,w:number,h:number)=>{
    const p=photoProfiles(normalizePaper(pixels,w,h),w,h);
    const x=gridLattice(p.columns)??gridLattice(p.lightColumns),y=gridLattice(p.rows)??gridLattice(p.lightRows);
    if(!x||!y||!(x.minorVerified||y.minorVerified)||Math.abs(Math.log(x.majorPitch/y.majorPitch))>.26
      ||x.pitch<1.8||y.pitch<1.8||x.pitch>60||y.pitch>60)return null;
    return {pxPerMmX:x.pitch,pxPerMmY:y.pitch,confidence:Math.max(x.confidence,y.confidence),gridUnitEvidence:'major-minor' as const};
  };
  const whole=estimate(rgba,width,height);if(whole)return whole;
  // Projection over a whole scan can smear faint lines under small paper warps.
  // Verify several original-resolution patches rather than inventing a scale.
  const w=Math.min(width,600),h=Math.min(height,360),seen=new Set<string>();
  const verified:NonNullable<ReturnType<typeof estimate>>[]=[];
  for(const fy of [0,.5,1])for(const fx of [0,.5,1]){
    const x=Math.round((width-w)*fx),y=Math.round((height-h)*fy),key=`${x}:${y}`;
    if(seen.has(key))continue;seen.add(key);
    const pixels=new Uint8ClampedArray(w*h*4);
    for(let row=0;row<h;row++)pixels.set(rgba.subarray(((y+row)*width+x)*4,((y+row)*width+x+w)*4),row*w*4);
    const result=estimate(pixels,w,h);if(result)verified.push(result);
  }
  if(verified.length<3)return null;
  const mx=quantile(verified.map(v=>v.pxPerMmX),.5),my=quantile(verified.map(v=>v.pxPerMmY),.5);
  const consistent=verified.filter(v=>Math.abs(Math.log(v.pxPerMmX/mx))<.12&&Math.abs(Math.log(v.pxPerMmY/my))<.12);
  if(consistent.length<3||consistent.length<verified.length*.75)return null;
  return {pxPerMmX:quantile(consistent.map(v=>v.pxPerMmX),.5),pxPerMmY:quantile(consistent.map(v=>v.pxPerMmY),.5),confidence:Math.min(...consistent.map(v=>v.confidence)),gridUnitEvidence:'major-minor'};
}
