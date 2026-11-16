import type { CaptureLead, Crop } from './digitize';

export function cropsOverlap(a: Crop, b: Crop) {
  return Math.min(a.right,b.right)-Math.max(a.left,b.left) > .01
    && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top) > .01;
}
export function conflictingRegions(crops: Partial<Record<CaptureLead,Crop>>) {
  const entries = Object.entries(crops) as [CaptureLead,Crop][];
  return entries.flatMap(([lead,box],index)=>entries.slice(index+1).filter(([,other])=>cropsOverlap(box,other)).map(([other])=>[lead,other] as const));
}
/** Broad overlap is advisory: ECG waves can extend beyond neighboring crop boxes. */
export function significantOverlaps(crops: Partial<Record<CaptureLead,Crop>>) {
  return conflictingRegions(crops).filter(([a,b])=>{
    const first=crops[a]!,second=crops[b]!;
    const intersection=(Math.min(first.right,second.right)-Math.max(first.left,second.left))*(Math.min(first.bottom,second.bottom)-Math.max(first.top,second.top));
    const area=Math.min((first.right-first.left)*(first.bottom-first.top),(second.right-second.left)*(second.bottom-second.top));
    return area>0&&intersection/area>=.6;
  });
}
