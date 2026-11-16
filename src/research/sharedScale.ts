import type {Crop} from './digitize';
export function dimensionsFromReference(crop:Crop,reference:Crop) {
  const width=reference.right-reference.left,height=reference.bottom-reference.top;
  if(width<=0||height<=0||!Number.isFinite(width+height))throw new Error('Invalid grid reference');
  return {widthMm:5*(crop.right-crop.left)/width,heightMm:5*(crop.bottom-crop.top)/height};
}
export const isScaleProblem=(code:string)=>['gridScale','unevenScale','atypicalScale','gridUnitUnknown'].includes(code);

export function referenceFromGrid(paper:Crop,width:number,height:number,pxPerMmX:number,pxPerMmY:number):Crop {
 const left=paper.left+(paper.right-paper.left)*.1,top=paper.top+(paper.bottom-paper.top)*.1;
 return {left,top,right:left+5*pxPerMmX/width*(paper.right-paper.left),bottom:top+5*pxPerMmY/height*(paper.bottom-paper.top)};
}

// Never override a locally measured anisotropy with a page average.
export const canUseAutomaticReference=(code:string)=>isScaleProblem(code)&&code!=='unevenScale';
