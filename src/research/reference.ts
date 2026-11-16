import type {Crop} from './digitize';
export const referenceCorners=['top-left','top-right','bottom-left','bottom-right'] as const;
export type ReferenceCorner=typeof referenceCorners[number];
/** Drag one corner in original-image percentages, keeping the opposite corner fixed. */
export function resizeReference(box:Crop,corner:ReferenceCorner,dx:number,dy:number,bounds:Crop):Crop {
 const next={...box};
 if(corner.endsWith('left'))next.left=Math.max(bounds.left,Math.min(box.right-.03,box.left+dx));
 else next.right=Math.min(bounds.right,Math.max(box.left+.03,box.right+dx));
 if(corner.startsWith('top'))next.top=Math.max(bounds.top,Math.min(box.bottom-.03,box.top+dy));
 else next.bottom=Math.min(bounds.bottom,Math.max(box.top+.03,box.bottom+dy));
 return next;
}
