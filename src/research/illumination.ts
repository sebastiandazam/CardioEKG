/** Estimate local paper brightness without treating dark tracing ink as paper. */
export function normalizePaper(rgba: Uint8ClampedArray, width: number, height: number) {
  const tile = 48;
  const columns = Math.ceil(width / tile), rows = Math.ceil(height / tile);
  const white = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const histogram = new Uint32Array(256);
    let count = 0;
    for (let y = row * tile; y < Math.min(height, (row + 1) * tile); y++) {
      for (let x = col * tile; x < Math.min(width, (col + 1) * tile); x++) {
        const i = (y * width + x) * 4;
        histogram[Math.max(rgba[i], rgba[i + 1], rgba[i + 2])]++; count++;
      }
    }
    let sum = 0, level = 255;
    for (let value = 0; value < 256; value++) {
      sum += histogram[value];
      if (sum >= count * .9) { level = value; break; }
    }
    white[row * columns + col] = Math.max(90, level);
  }
  const result = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) {
    const gy = Math.max(0, Math.min(rows - 1, y / tile - .5));
    const y0 = Math.floor(gy), y1 = Math.min(rows - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < width; x++) {
      const gx = Math.max(0, Math.min(columns - 1, x / tile - .5));
      const x0 = Math.floor(gx), x1 = Math.min(columns - 1, x0 + 1), fx = gx - x0;
      const upper = white[y0 * columns + x0] * (1 - fx) + white[y0 * columns + x1] * fx;
      const lower = white[y1 * columns + x0] * (1 - fx) + white[y1 * columns + x1] * fx;
      const gain = 255 / (upper * (1 - fy) + lower * fy);
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) result[i + c] = rgba[i + c] * gain;
      result[i + 3] = rgba[i + 3];
    }
  }
  return result;
}
