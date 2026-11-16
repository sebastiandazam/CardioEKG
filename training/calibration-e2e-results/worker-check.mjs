// Node adapters exercise the same crop/resize/process functions used by the browser worker.
// This is a renderer/worker-pipeline check, not an interactive Safari test.
import fs from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {analyzeSheet} from '../../src/research/sheet.ts';
import {calibratePaper,digitizePhoto} from '../../src/research/photoProcess.ts';
import {reconstructSheet} from '../../src/research/batch.ts';
globalThis.createImageBitmap=async blob=>{const image=await loadImage(Buffer.from(await blob.arrayBuffer()));image.close=()=>{};return image;};
globalThis.OffscreenCanvas=class {constructor(w,h){const canvas=createCanvas(w,h);canvas.convertToBlob=async ({type,quality})=>new Blob([canvas.toBuffer(type,Math.round((quality??.9)*100))],{type});return canvas;}};
const source=process.argv[2]??'data/trace-pilot/real-photo-original-download';
const file=new File([fs.readFileSync(source)],'public-ecg.jpg',{type:'image/jpeg'});
const image=await createImageBitmap(file),scale=Math.min(1,1200/image.width,2400/image.height),preview=createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));
const context=preview.getContext('2d');context.drawImage(image,0,0,preview.width,preview.height);
const detection=analyzeSheet(context.getImageData(0,0,preview.width,preview.height).data,preview.width,preview.height,'4x3');
const grid=await calibratePaper({kind:'paper-grid',photo:file,paper:detection.paper});
const results=[];
await reconstructSheet({file,fingerprint:'test',crops:detection.crops,speed:25,gain:10,automaticReference:grid.reference??undefined},{},new AbortController().signal,async task=>digitizePhoto(task),(entry)=>{
 results.push({lead:entry.lead,status:entry.status,code:entry.failure?.code??null,seconds:entry.photo?.result.seconds??null,unitEvidence:entry.photo?.result.gridUnitEvidence??null,draft:!!entry.failure?.draft});
});
const summary={renderer:'Node canvas adapters; shared browser-worker source functions',regions:detection.rowsDetected,gridVerified:!!grid.reference,results,calibrationFailures:results.filter(row=>['gridScale','unevenScale','atypicalScale','gridUnitUnknown'].includes(row.code)).length,traceWarnings:results.filter(row=>['interruptedTrace','clippedTrace','uncertainTrace','flatTrace'].includes(row.code)).length};
fs.writeFileSync('training/calibration-e2e-results/worker-check.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
if(!summary.regions||summary.calibrationFailures>0||results.length!==13)process.exitCode=1;
