import {validEngineResult} from './measureEngine';
import type {EngineResult} from './measureEngine';
import type {LocalMeasureOptions,LocalMeasurePhase,LocalMeasureResponse} from './localMeasureProtocol';
/** Only runtime packages are downloaded. ECG pixels enter a local worker, never a network request. */
export class LocalMeasureClient{
 private worker:Worker|null=null;private sequence=0;private cancel:(()=>void)|null=null;
 dispose(){this.cancel?.();this.cancel=null;this.worker?.terminate();this.worker=null;}
 async measure(file:File,options:LocalMeasureOptions,signal:AbortSignal,onProgress:(phase:LocalMeasurePhase)=>void):Promise<EngineResult>{
  if(this.cancel)throw new Error('busy');if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const bitmap=await createImageBitmap(file);let blob:Blob|null=null;
  try{if(bitmap.width<40||bitmap.height<40)throw new Error('invalid-image');const scale=Math.min(1,1800/bitmap.width,2600/bitmap.height,Math.sqrt(3_000_000/(bitmap.width*bitmap.height)));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d');if(!context)throw new Error('canvas');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));}finally{bitmap.close();}
  if(!blob||signal.aborted)throw new DOMException('Aborted','AbortError');
  const image=await blob.arrayBuffer();if(signal.aborted)throw new DOMException('Aborted','AbortError');
  this.worker??=new Worker(new URL('./localMeasure.worker.ts',import.meta.url),{type:'module'});const worker=this.worker,id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const clear=()=>{worker.removeEventListener('message',message);worker.removeEventListener('error',failed);signal.removeEventListener('abort',abort);clearTimeout(timeout);this.cancel=null;};
   const abort=()=>{clear();worker.terminate();this.worker=null;reject(new DOMException('Aborted','AbortError'));};
   const failed=()=>{clear();worker.terminate();this.worker=null;reject(new Error('runtime'));};
   const message=(event:MessageEvent<LocalMeasureResponse>)=>{const value=event.data;if(value.id!==id)return;if(value.kind==='progress'){onProgress(value.phase);return;}clear();if(value.kind==='result'&&validEngineResult(value.result))resolve(value.result);else reject(new Error(value.kind==='error'?value.message:'shape'));};
   const timeout=setTimeout(()=>{clear();worker.terminate();this.worker=null;reject(new Error('timeout'));},180000);
   this.cancel=abort;signal.addEventListener('abort',abort,{once:true});worker.addEventListener('message',message);worker.addEventListener('error',failed);worker.postMessage({id,image,options},[image]);
  });
 }
}
