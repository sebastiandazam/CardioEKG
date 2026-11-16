export async function isPdf(file: Blob): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...header) === '%PDF-';
}

export function pdfRenderScale(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Invalid page size');
  return Math.min(3, 2600 / width, 3600 / height, Math.sqrt(8_000_000 / (width * height)));
}
