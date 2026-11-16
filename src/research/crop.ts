import type { Crop } from './digitize';

/** Translate without changing dimensions, clamped to the image. */
export function moveCrop(crop: Crop, dx: number, dy: number): Crop {
  const x = Math.max(-crop.left, Math.min(100 - crop.right, dx));
  const y = Math.max(-crop.top, Math.min(100 - crop.bottom, dy));
  return { left: crop.left + x, right: crop.right + x, top: crop.top + y, bottom: crop.bottom + y };
}

/** Resize symmetrically; stop at the image boundary without translating the crop. */
export function resizeCrop(crop: Crop, dw: number, dh: number): Crop {
  const width = Math.max(.5, Math.min(2 * Math.min((crop.left+crop.right)/2, 100-(crop.left+crop.right)/2), crop.right-crop.left+dw));
  const height = Math.max(.5, Math.min(2 * Math.min((crop.top+crop.bottom)/2, 100-(crop.top+crop.bottom)/2), crop.bottom-crop.top+dh));
  const x=(crop.left+crop.right)/2,y=(crop.top+crop.bottom)/2;
  return {left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2};
}
