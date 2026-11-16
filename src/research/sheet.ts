import {normalizePaper} from './illumination.ts';
import {findPaperRegion,mapPaperCrop} from './paper.ts';
import type { CaptureLead, Crop } from './digitize';
import {analyzeStructure,cropsFromStructure,locateGridSquare,isGridColour} from './layoutDetect.ts';
import {estimateSkew} from './deskew.ts';
import type {LayoutChoice,LeadSource,SheetLayout,SheetStructure,LearnedPlacement} from './layoutDetect';

export type {SheetLayout,LayoutChoice} from './layoutDetect';
export type SheetCrops = Record<CaptureLead, Crop>;
export interface SheetDetection { crops:SheetCrops;rhythmDetected:boolean;paper:Crop|null;rowsDetected:boolean;
  /** Layout actually used (inferred when the user chose automatic). */
  layout:SheetLayout;
  /** Bands found in the paper image, in paper-local percent; re-used after OCR and for learning. */
  structure:SheetStructure|null;
  /** How each region was placed: printed label, learned correction, tracing ink, or fixed template. */
  sources:Record<CaptureLead,LeadSource>;
  layoutInferred:boolean;
  /** True when the sheet could be 4x3 or 2x6 and 4x3 was assumed. */
  layoutAmbiguous?:boolean;
  /** A large 5 × 5 mm grid square found on the paper (image percent), only as the starting position of the manual 5 mm box. It is coarse (preview pixels) and never used as a scale by itself. */
  gridHint?:Crop }
const rows = {
  '4x3': [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']],
  '2x6': [['I', 'V1'], ['II', 'V2'], ['III', 'V3'], ['aVR', 'V4'], ['aVL', 'V5'], ['aVF', 'V6']],
} as const;

// Local ink projection proposes row positions. Labels and lead identity are always reviewed.
function analyzePaperPixels(rgba: Uint8ClampedArray, width: number, height: number, layout: SheetLayout,headerGuard=.035) {
  const grid = rows[layout];
  const profile = Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = Math.round(width * .04); x < width * .97; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      // Reject the red grid and favor dark trace ink.
      if (rgba[i + 3] > 128 && Math.max(r, g, b) < 155 && r - Math.min(g, b) < 35) profile[y]++;
    }
  }
  // Ignore dense horizontal grid rules, then subtract constant vertical-grid ink.
  const broadGroups:number[][]=[];
  for(let y=0;y<height;y++)if(profile[y]>width*.8) {
    const last=broadGroups[broadGroups.length-1];
    if(last&&y-last[last.length-1]<=2)last.push(y);else broadGroups.push([y]);
  }
  if(broadGroups.length>grid.length+1)for(const group of broadGroups)for(const y of group)profile[y]=0;
  const floor=profile.slice().sort((a,b)=>a-b)[Math.floor(height*.35)]??0;
  for(let y=0;y<height;y++)profile[y]=Math.max(0,profile[y]-floor);
  // Find wide horizontal ink bands, ignoring header text near the top.
  // Unlike fixed page percentages this tolerates large empty paper headers.
  const smooth = profile.map((_, y) => {
    const radius = Math.max(1, Math.round(height * .003));
    let sum = 0, count = 0;
    for (let at = Math.max(0, y - radius); at <= Math.min(height - 1, y + radius); at++) { sum += profile[at]; count++; }
    return sum / count;
  });
  const candidates = smooth.map((score, y) => ({ score, y })).filter(p => p.y >= height * headerGuard && p.y < height * .96 && p.score > width * .035)
    .sort((a, b) => b.score - a.score);
  const peaks: number[] = [];
  for (const candidate of candidates) {
    if (peaks.every(y => Math.abs(y - candidate.y) > height * .08)) peaks.push(candidate.y);
    if (peaks.length === grid.length + 1) break;
  }
  const regular = (values: number[]) => {
    if (values.length < grid.length) return false;
    const gaps = values.slice(1).map((y, i) => y - values[i]);
    return Math.min(...gaps) > height * .06 && Math.max(...gaps) / Math.min(...gaps) < 1.7;
  };
  let detected = peaks.slice().sort((a, b) => a - b);
  if (!regular(detected)) detected = peaks.slice(0, grid.length).sort((a, b) => a - b);
  if (!regular(detected)) detected = [];
  const top = height * .12, bottom = height * .86;
  const rowHeight = (bottom - top) / grid.length;
  const centers = grid.map((_, row) => {
    if (detected.length) return detected[row];
    const from = Math.floor(top + row * rowHeight), to = Math.floor(from + rowHeight);
    let weight = 0, moment = 0;
    for (let y = from; y < to; y++) { weight += profile[y]; moment += profile[y] * y; }
    return weight > width * .03 ? moment / weight : from + rowHeight / 2;
  });
  const spacing = detected.length ? Math.min(...detected.slice(1).map((y, i) => y - detected[i])) : rowHeight;
  const result = {} as SheetCrops;
  grid.forEach((row, index) => row.forEach((lead, col) => {
    result[lead] = {
      left: 4 + col * 93 / row.length + 1.5,
      right: 4 + (col + 1) * 93 / row.length - .8,
      top: Math.max(0, (centers[index] - spacing * .43) / height * 100, detected.length && index>0 ? (centers[index-1]+centers[index])/2/height*100+.2 : detected.length ? 0 : (top+index*rowHeight)/height*100+.2),
      bottom: Math.min(100, (centers[index] + spacing * .43) / height * 100, detected[index+1] !== undefined ? (centers[index]+detected[index+1])/2/height*100-.2 : detected.length ? 100 : (top+(index+1)*rowHeight)/height*100-.2),
    };
  }));
  const rhythm = detected[grid.length];
  const lastBottom=Math.max(...Object.values(result).map(crop=>crop.bottom));
  result['II-long'] = { left: 5.5, right: 96, top: rhythm === undefined ? Math.min(99,lastBottom+.5) : Math.max(0, (rhythm - spacing * .43) / height * 100), bottom: rhythm === undefined ? 100 : Math.min(100, (rhythm + spacing * .43) / height * 100) };
  return {crops:result,rhythmDetected:rhythm!==undefined,rowsDetected:detected.length>=grid.length};
}

const allSources=(source:LeadSource)=>Object.fromEntries(['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6','II-long'].map(l=>[l,source])) as Record<CaptureLead,LeadSource>;

export function analyzeSheet(rgba:Uint8ClampedArray,width:number,height:number,choice:LayoutChoice,learned?:(structure:SheetStructure,layout:SheetLayout)=>LearnedPlacement|null):SheetDetection {
  const fallbackLayout:SheetLayout=choice==='auto'?'4x3':choice;
  const paper=findPaperRegion(rgba,width,height);
  if(!paper) {
    const template=analyzePaperPixels(new Uint8ClampedArray(width*height*4).fill(255),width,height,fallbackLayout);
    return {...template,paper:null,rhythmDetected:false,rowsDetected:false,layout:fallbackLayout,structure:null,sources:allSources('template'),layoutInferred:false};
  }
  // A shadow can hide the paper edge from the brightness test; the coloured grid still shows where the paper continues.
  const columnGrid=new Uint32Array(width);let gridPixels=0;
  for(let yy=Math.round(paper.top*height/100);yy<Math.round(paper.bottom*height/100);yy+=2)for(let xx=0;xx<width;xx++){const i=(yy*width+xx)*4;if(isGridColour(rgba[i],rgba[i+1],rgba[i+2])){columnGrid[xx]++;gridPixels++;}}
  if(gridPixels>width*4){
    const need=(paper.bottom-paper.top)*height/100/2*.04;let first=-1,last=-1;
    for(let xx=0;xx<width;xx++)if(columnGrid[xx]>=need){if(first<0)first=xx;last=xx;}
    if(first>=0){paper.left=Math.min(paper.left,100*first/width);paper.right=Math.max(paper.right,100*(last+1)/width);}
  }
  const x=Math.round(paper.left*width/100),y=Math.round(paper.top*height/100);
  const w=Math.round(paper.right*width/100)-x,h=Math.round(paper.bottom*height/100)-y;
  const pixels=new Uint8ClampedArray(w*h*4);
  for(let row=0;row<h;row++)pixels.set(rgba.subarray(((y+row)*width+x)*4,((y+row)*width+x+w)*4),row*w*4);
  const normalized=normalizePaper(pixels,w,h);
  // Read the sheet itself first: bands, ink extent, calibration pulse and gaps.
  const structure=analyzeStructure(normalized,w,h);
  const square=locateGridSquare(normalized,w,h);
  const gridHint=square?mapPaperCrop(square,paper):undefined;
  const provisional=choice==='auto'?structure.inferredLayout:choice;
  const prior=provisional&&learned?learned(structure,provisional):null;
  const read=cropsFromStructure(structure,choice,[],prior);
  if(read) {
    const crops=Object.fromEntries(Object.entries(read.crops).map(([lead,crop])=>[lead,mapPaperCrop(crop,paper)])) as SheetCrops;
    return {crops,paper,rhythmDetected:read.rhythmDetected,rowsDetected:true,layout:read.layout,structure,sources:read.sources,layoutInferred:choice==='auto'&&!read.layoutAmbiguous,layoutAmbiguous:read.layoutAmbiguous,gridHint};
  }
  // Too few bands found: keep the earlier projection proposal, explicitly marked as template.
  const local=analyzePaperPixels(normalized,w,h,fallbackLayout);
  const crops=Object.fromEntries(Object.entries(local.crops).map(([lead,crop])=>[lead,mapPaperCrop(crop,paper)])) as SheetCrops;
  return {...local,crops,paper,layout:fallbackLayout,structure,sources:allSources(local.rowsDetected?'ink':'template'),layoutInferred:false,gridHint};
}

/** Global image percent -> paper-local percent (inverse of mapPaperCrop). */
export function toPaperLocal(global:Crop,paper:Crop):Crop {
  const w=paper.right-paper.left,h=paper.bottom-paper.top;
  return {left:(global.left-paper.left)*100/w,right:(global.right-paper.left)*100/w,top:(global.top-paper.top)*100/h,bottom:(global.bottom-paper.top)*100/h};
}

export function suggestSheetCrops(rgba: Uint8ClampedArray,width:number,height:number,layout:LayoutChoice):SheetCrops {
  return analyzeSheet(rgba,width,height,layout).crops;
}

/** Draw `source` rotated by `degrees` about its centre on a white canvas of the same size. */
function rotatedCanvas(source:CanvasImageSource,width:number,height:number,degrees:number) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Image unavailable');
  context.fillStyle='#fff';context.fillRect(0,0,width,height);
  context.translate(width/2,height/2);context.rotate(degrees*Math.PI/180);context.drawImage(source,-width/2,-height/2,width,height);
  context.setTransform(1,0,0,1,0,0);
  return {canvas,context};
}

export async function detectSheet(file: File, layout: LayoutChoice,learned?:(structure:SheetStructure,layout:SheetLayout)=>LearnedPlacement|null): Promise<SheetDetection&{preview:Blob;paperPreview:Blob;imageWidth:number;imageHeight:number;skewDegrees:number;straightened?:File}> {
  let bitmap = await createImageBitmap(file);
  let skewDegrees=0,straightened:File|undefined;
  try {
    // Straighten a tilted photo once, up front: every later step (regions, grid, digitization) assumes level rows.
    {
      const scale=Math.min(1,1200/bitmap.width,2400/bitmap.height),w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);
      const probe=rotatedCanvas(bitmap,w,h,0);
      skewDegrees=estimateSkew(probe.context.getImageData(0,0,w,h).data,w,h);
      if(Math.abs(skewDegrees)>=.3) {
        const full=rotatedCanvas(bitmap,bitmap.width,bitmap.height,-skewDegrees).canvas;
        const blob=await new Promise<Blob|null>(resolve=>full.toBlob(resolve,'image/png'));
        if(blob){straightened=new File([blob],file.name.replace(/\.[^.]+$/,'')+'-straightened.png',{type:'image/png'});bitmap.close();bitmap=await createImageBitmap(straightened);}
        else skewDegrees=0;
      } else skewDegrees=0;
    }
    const scale = Math.min(1,1200/bitmap.width,2400/bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image unavailable');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const detection=analyzeSheet(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,layout,learned);
    const preview=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
    if(!preview)throw new Error('Cannot preview image');
    let paperPreview=preview;
    if(detection.paper) {
      const region=detection.paper,x=Math.round(region.left*canvas.width/100),y=Math.round(region.top*canvas.height/100);
      const paperCanvas=document.createElement('canvas');
      paperCanvas.width=Math.round(region.right*canvas.width/100)-x;paperCanvas.height=Math.round(region.bottom*canvas.height/100)-y;
      const paperContext=paperCanvas.getContext('2d');if(!paperContext)throw new Error('Cannot preview paper');
      paperContext.drawImage(canvas,x,y,paperCanvas.width,paperCanvas.height,0,0,paperCanvas.width,paperCanvas.height);
      paperPreview=await new Promise<Blob|null>(resolve=>paperCanvas.toBlob(resolve,'image/jpeg',.95))??preview;
    }
    return {...detection,preview,paperPreview,imageWidth:canvas.width,imageHeight:canvas.height,skewDegrees,straightened};
  } finally { bitmap.close(); }
}
