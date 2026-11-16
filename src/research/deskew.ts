import { isGridColour } from './layoutDetect.ts';

/**
 * Skew of a photographed or scanned ECG sheet, in degrees (positive = image rotated
 * clockwise on screen). Horizontal grid rules and trace baselines make the row projection
 * sharpest when the shear matches the tilt, so the angle with the largest projection
 * energy is chosen. Returns 0 when there is too little structure to decide.
 */
export function estimateSkew(rgba: Uint8ClampedArray, width: number, height: number, maxDegrees = 8): number {
  const xs: number[] = [], ys: number[] = [];
  const collect = (grid: boolean) => {
    xs.length = 0; ys.length = 0;
    const step = Math.max(1, Math.round(Math.sqrt(width * height / 400_000)));
    for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (rgba[i + 3] <= 128) continue;
      if (grid ? isGridColour(r, g, b) : .299 * r + .587 * g + .114 * b < 110) { xs.push(x); ys.push(y); }
    }
  };
  collect(true);
  if (xs.length < 2000) collect(false);
  if (xs.length < 500) return 0;
  const energy = (degrees: number) => {
    const slope = Math.tan(degrees * Math.PI / 180), bins = new Float64Array(height + 2 * Math.ceil(width * Math.tan(maxDegrees * Math.PI / 180)) + 4);
    const offset = (bins.length - height) / 2;
    for (let k = 0; k < xs.length; k++) bins[Math.round(ys[k] - (xs[k] - width / 2) * slope + offset)]++;
    let sum = 0; for (const v of bins) sum += v * v;
    return sum;
  };
  let best = 0, bestEnergy = energy(0);
  const flat = bestEnergy;
  for (let d = -maxDegrees; d <= maxDegrees; d += .5) { const e = energy(d); if (e > bestEnergy) { bestEnergy = e; best = d; } }
  for (let d = best - .4; d <= best + .4; d += .1) { const e = energy(d); if (e > bestEnergy) { bestEnergy = e; best = d; } }
  // Require a clear gain over the unrotated image; otherwise leave the sheet alone.
  return bestEnergy > flat * 1.08 ? Math.round(best * 10) / 10 : 0;
}

/** Rotate an RGBA buffer about its centre by `degrees` (bilinear, white fill). Same size out. */
export function rotateRgba(rgba: Uint8ClampedArray, width: number, height: number, degrees: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length).fill(255);
  const a = degrees * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a), cx = (width - 1) / 2, cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Inverse mapping: output pixel -> source position.
    const sx = cos * (x - cx) + sin * (y - cy) + cx, sy = -sin * (x - cx) + cos * (y - cy) + cy;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) continue;
    const fx = sx - x0, fy = sy - y0, o = (y * width + x) * 4, i = (y0 * width + x0) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = (rgba[i + c] * (1 - fx) + rgba[i + 4 + c] * fx) * (1 - fy) + (rgba[i + width * 4 + c] * (1 - fx) + rgba[i + width * 4 + 4 + c] * fx) * fy;
  }
  return out;
}
