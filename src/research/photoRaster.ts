import {digitize,pixelTraceDraft} from './digitize.ts';
import type {Calibration} from './digitize';
import {ResearchError} from './locale.ts';
import type {ResearchMessage} from './locale';
import type {WorkerResponse} from './protocol';
import {isScaleProblem} from './sharedScale.ts';
export type RasterDraft=Extract<WorkerResponse,{kind:'photo-draft'}>;
/** Scale failure must not suppress the image-space reconstruction or invent mV/seconds. */
export function processPhotoRaster(rgba:Uint8ClampedArray,width:number,height:number,calibration:Calibration,image:Blob):Extract<WorkerResponse,{kind:'photo'|'photo-draft'}> {
  const draft=(code:ResearchMessage):RasterDraft=>({kind:'photo-draft',image,trace:pixelTraceDraft(rgba,width,height),code});
  try {
    const result=digitize(rgba,width,height,calibration);
    return result.gridUnitEvidence==='periodic-only'?draft('gridUnitUnknown'):{kind:'photo',image,result};
  }catch(error){if(error instanceof ResearchError&&isScaleProblem(error.code))return draft(error.code);throw error;}
}
