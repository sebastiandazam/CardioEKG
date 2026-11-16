import {dimensionsFromReference,canUseAutomaticReference} from './sharedScale.ts';
import type {RasterDraft} from './photoRaster';
import type { Calibration, CaptureLead, Crop } from './digitize';
import type { AcceptedPhoto } from './photo';
import type { WorkerResponse, WorkerTask } from './protocol';
import type { ResearchMessage } from './locale';
export type BatchFailure = { code: ResearchMessage; photo?: AcceptedPhoto;draft?:RasterDraft };
export type BatchResult = { lead:CaptureLead; photo:AcceptedPhoto; status:'ready' } | { lead:CaptureLead; status:'failed'; failure:BatchFailure };
export interface BatchRequest { file:File; fingerprint:string; crops:Partial<Record<CaptureLead,Crop>>; speed:Calibration['speed']; gain:Calibration['gain'];reference?:Crop;automaticReference?:Crop;calibrationByLead?:Partial<Record<CaptureLead,{speed:Calibration['speed'];gain:Calibration['gain']}>> }

/** Sequential workers bound memory on mobile; unchanged successful crops are reused. */
export async function reconstructSheet(
  request:BatchRequest, previous:Partial<Record<CaptureLead,AcceptedPhoto>>, signal:AbortSignal,
  run:(task:WorkerTask,signal:AbortSignal)=>Promise<WorkerResponse>,
  emit:(result:BatchResult,done:number,total:number)=>void,
) {
  const entries=Object.entries(request.crops) as [CaptureLead,Crop][];
  const calibrationKey=request.reference?JSON.stringify(request.reference):undefined;
  let done=0;
  for(const [lead,crop] of entries) {
    if(signal.aborted)return;
    const cached=previous[lead],{speed,gain}=request.calibrationByLead?.[lead]??request;
    if(cached && cached.calibrationKey===calibrationKey && !cached.result.warning && cached.result.gridUnitEvidence!=='periodic-only' && cached.fingerprint===`${request.fingerprint}:${lead}`
      && JSON.stringify(cached.sourceCrop)===JSON.stringify(crop) && cached.result.speed===speed && cached.result.gain===gain) {
      emit({lead,status:'ready',photo:cached},++done,entries.length);continue;
    }
    try {
      let response=await run({kind:'photo',photo:request.file,crop,calibration:{speed,gain,...(request.reference?dimensionsFromReference(crop,request.reference):{widthMm:null,heightMm:null})}},signal);
      if(signal.aborted)return;
      if(!request.reference&&request.automaticReference&&response.kind==='photo-draft'&&canUseAutomaticReference(response.code)) {
        response=await run({kind:'photo',photo:request.file,crop,calibration:{speed,gain,...dimensionsFromReference(crop,request.automaticReference),source:'paper-grid'}},signal);
        if(signal.aborted)return;
      }
      if(response.kind==='photo-draft'){emit({lead,status:'failed',failure:{code:response.code,draft:response}},++done,entries.length);continue;}
      if(response.kind!=='photo') {
        emit({lead,status:'failed',failure:{code:response.kind==='error'?response.code:'reconstructFailed'}},++done,entries.length);continue;
      }
      const photo:AcceptedPhoto={calibrationKey,image:response.image,result:response.result,sourceCrop:crop,fingerprint:`${request.fingerprint}:${lead}`};
      if(response.result.gridUnitEvidence==='periodic-only') emit({lead,status:'failed',failure:{code:'gridUnitUnknown',photo}},++done,entries.length);
      else if(response.result.warning) emit({lead,status:'failed',failure:{code:response.result.warningCode??'reconstructFailed',photo}},++done,entries.length);
      else emit({lead,status:'ready',photo},++done,entries.length);
    } catch(caught) {
      if(signal.aborted)return;
      const code=caught && typeof caught==='object' && 'code' in caught && typeof caught.code==='string' ? caught.code as ResearchMessage : 'reconstructFailed';
      emit({lead,status:'failed',failure:{code}},++done,entries.length);
    }
  }
}
