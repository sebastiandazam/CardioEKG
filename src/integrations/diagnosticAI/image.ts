import {leads} from '../../cases';
import type {ViewerCase,Trace} from '../../cases';
import type {ReviewPixels} from './config';
export function reconstructionSVG(item:Pick<ViewerCase,'traces'|'rhythmTrace'|'rhythmLead'>,language:'es'|'en') {
 const all=[...Object.values(item.traces),item.rhythmTrace].filter((t):t is Trace=>!!t);
 let peak=1;for(const t of all)for(const n of t.mv)if(Number.isFinite(n))peak=Math.max(peak,Math.abs(n));
 const gain=44/peak,width=1200,height=item.rhythmTrace?1020:850;
 const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="1200" height="${height}" fill="white"/><text x="20" y="25" font-size="18" font-family="sans-serif">CardioEKG — ${language==='es'?'RECONSTRUCCIÓN · ventanas independientes desde 0 s':'RECONSTRUCTION · independent windows from 0 s'}</text>`];
 function panel(trace:Trace|undefined,label:string,x:number,y:number,w:number,h:number,seconds:number){
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="#bca7aa"/>`);
  if(!trace||trace.mv.length<2||!Number.isFinite(trace.seconds)||trace.seconds<=0){parts.push(`<text x="${x+8}" y="${y+20}" font-family="sans-serif" font-size="16">${label}: ${language==='es'?'sin señal':'missing'}</text>`);return;}
  const duration=Math.min(trace.seconds,seconds),pxPerSecond=(w-20)/duration,baseline=y+h/2+8;
  for(let t=0;t<=duration;t+=.2){const xx=x+10+t*pxPerSecond;parts.push(`<path d="M ${xx} ${y+27} V ${y+h}" stroke="#efdce0"/>`);}
  for(let mv=-peak;mv<=peak;mv+=peak/3){const yy=baseline-mv*gain;parts.push(`<path d="M ${x} ${yy} H ${x+w}" stroke="#efdce0"/>`);}
  const length=Math.min(trace.mv.length,Math.floor(duration/trace.seconds*(trace.mv.length-1))+1),points:string[]=[];
  // Preserve extrema in each horizontal bin rather than dropping narrow R/S peaks.
  const bins=Math.min(length,Math.ceil(w)*2);
  for(let b=0;b<bins;b++){
   const start=Math.floor(b*length/bins),end=Math.max(start+1,Math.floor((b+1)*length/bins));let lo=-1,hi=-1;
   for(let i=start;i<end;i++)if(Number.isFinite(trace.mv[i])){if(lo<0||trace.mv[i]<trace.mv[lo])lo=i;if(hi<0||trace.mv[i]>trace.mv[hi])hi=i;}
   for(const i of [...new Set([lo,hi])].filter(i=>i>=0).sort((a,b)=>a-b)){const xx=x+10+i/(trace.mv.length-1)*trace.seconds*pxPerSecond;points.push(`${points.length?'L':'M'}${xx.toFixed(2)},${(baseline-trace.mv[i]*gain).toFixed(2)}`);}
  }
  parts.push(`<path d="${points.join(' ')}" fill="none" stroke="#202737" stroke-width="1.4"/><text x="${x+8}" y="${y+19}" font-family="sans-serif" font-size="16">${label} · ${duration.toFixed(2)} s</text>`);
 }
 leads.forEach((lead,i)=>panel(item.traces[lead],lead,20+(i%2)*590,45+Math.floor(i/2)*130,570,125,5));
 if(item.rhythmTrace)panel(item.rhythmTrace,(item.rhythmLead??'II')+' — '+(language==='es'?'tira larga':'long strip'),20,835,1160,150,12);
 parts.push('</svg>');return parts.join('');
}
export async function pixelsFromBlob(blob:Blob):Promise<{pixels:ReviewPixels;preview:string}> {
 if(blob.size>40*1024*1024)throw new Error('file-size');
 if(blob.type==='image/svg+xml'&&!('__generated' in blob))throw new Error('image-format');
 const url=URL.createObjectURL(blob),image=new Image();
 try{
  image.src=url;await image.decode();
  if(image.naturalWidth*image.naturalHeight>60_000_000)throw new Error('image-size');
  const scale=Math.min(1,1920/image.naturalWidth,1440/image.naturalHeight),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas');
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return {pixels:{data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height},preview:canvas.toDataURL('image/jpeg',.92)};
 }finally{URL.revokeObjectURL(url);}
}
export async function reconstructedPixels(item:Pick<ViewerCase,'traces'|'rhythmTrace'|'rhythmLead'>,language:'es'|'en') {
 const blob=Object.assign(new Blob([reconstructionSVG(item,language)],{type:'image/svg+xml'}),{__generated:true});
 return pixelsFromBlob(blob);
}
