import {ResearchError} from './locale.ts';
import {processPhotoRaster} from './photoRaster.ts';
import {estimatePaperGrid} from './digitize.ts';
import {referenceFromGrid} from './sharedScale.ts';
import type {WorkerResponse,WorkerTask} from './protocol';

export async function digitizePhoto(task: Extract<WorkerTask, { kind: 'photo' }>): Promise<WorkerResponse> {
  const bitmap = await createImageBitmap(task.photo);
  try {
    const { left, right, top, bottom } = task.crop;
    const x = Math.round(bitmap.width * left / 100);
    const y = Math.round(bitmap.height * top / 100);
    const sourceWidth = Math.round(bitmap.width * right / 100) - x;
    const sourceHeight = Math.round(bitmap.height * bottom / 100) - y;
    if (sourceWidth <= 0 || sourceHeight <= 0 || x < 0 || y < 0
      || x + sourceWidth > bitmap.width || y + sourceHeight > bitmap.height) {
      throw new ResearchError('cropBounds');
    }
    const scale = Math.min(1, 1800 / sourceWidth, 460 / sourceHeight);
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new ResearchError('cannotReadPhoto');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, x, y, sourceWidth, sourceHeight, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height);
    const image = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return processPhotoRaster(data.data,width,height,task.calibration,image);
  } finally {
    bitmap.close();
  }
}

export async function calibratePaper(task:Extract<WorkerTask,{kind:'paper-grid'}>):Promise<WorkerResponse> {
 const bitmap=await createImageBitmap(task.photo);
 try {
  const x=Math.round(bitmap.width*task.paper.left/100),y=Math.round(bitmap.height*task.paper.top/100);
  const w=Math.round(bitmap.width*task.paper.right/100)-x,h=Math.round(bitmap.height*task.paper.bottom/100)-y;
  if(w<140||h<48)return {kind:'paper-grid',reference:null};
  const scale=Math.min(1,2200/w,2200/h),width=Math.round(w*scale),height=Math.round(h*scale);
  const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)return {kind:'paper-grid',reference:null};
  context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(bitmap,x,y,w,h,0,0,width,height);
  const data=context.getImageData(0,0,width,height),grid=estimatePaperGrid(data.data,width,height);
  return {kind:'paper-grid',reference:grid?referenceFromGrid(task.paper,width,height,grid.pxPerMmX,grid.pxPerMmY):null};
 }finally{bitmap.close();}
}

