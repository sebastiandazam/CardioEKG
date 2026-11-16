import type { Crop } from './digitize';

function longestBand(flags: boolean[], gapLimit: number) {
  // Fill short interior holes caused by text/printing, without extending edges.
  const filled=flags.slice();
  for(let i=0;i<flags.length;) {
    if(flags[i]){i++;continue;}
    const start=i;while(i<flags.length&&!flags[i])i++;
    if(start>0&&i<flags.length&&i-start<=gapLimit)for(let at=start;at<i;at++)filled[at]=true;
  }
  let start=0,bestStart=0,bestEnd=0;
  for(let i=0;i<=filled.length;i++) {
    if(i<filled.length&&filled[i])continue;
    if(i-start>bestEnd-bestStart){bestStart=start;bestEnd=i;}
    start=i+1;
  }
  return {start:bestStart,end:bestEnd};
}

/** Locate light paper, excluding dark/transparent letterboxing before ink analysis. */
export function findPaperRegion(rgba:Uint8ClampedArray,width:number,height:number):Crop|null {
  const histogram=new Uint32Array(256);let count=0;
  for(let i=0;i<rgba.length;i+=4)if(rgba[i+3]>128){histogram[Math.max(rgba[i],rgba[i+1],rgba[i+2])]++;count++;}
  if(!count)return null;
  let cumulative=0,upper=0;
  for(let value=0;value<256;value++){cumulative+=histogram[value];if(cumulative>=count*.95){upper=value;break;}}
  if(upper<50)return null;
  // Otsu split between background and paper keeps shaded paper; never stricter than the previous rule.
  let total=0,sumAll=0;for(let v=0;v<256;v++){total+=histogram[v];sumAll+=v*histogram[v];}
  let below=0,sumBelow=0,otsu=0,bestVariance=0;
  for(let v=0;v<256;v++){below+=histogram[v];if(!below||below===total)continue;sumBelow+=v*histogram[v];
    const m0=sumBelow/below,m1=(sumAll-sumBelow)/(total-below),variance=below*(total-below)*(m0-m1)*(m0-m1);
    if(variance>bestVariance){bestVariance=variance;otsu=v;}}
  const threshold=Math.min(180,Math.max(70,Math.min(upper*.65,otsu||255)));
  const light=(x:number,y:number)=>{const at=(y*width+x)*4;return rgba[at+3]>128&&Math.max(rgba[at],rgba[at+1],rgba[at+2])>=threshold;};
  const rowFlags=Array.from({length:height},(_,y)=>{
    let total=0;for(let x=0;x<width;x++)if(light(x,y))total++;
    return total>=width*.3;
  });
  const vertical=longestBand(rowFlags,Math.max(1,Math.round(height*.007)));
  if(vertical.end-vertical.start<Math.max(35,height*.025))return null;
  const columnFlags=Array.from({length:width},(_,x)=>{
    let total=0;for(let y=vertical.start;y<vertical.end;y++)if(light(x,y))total++;
    return total>=(vertical.end-vertical.start)*.5;
  });
  const horizontal=longestBand(columnFlags,Math.max(1,Math.round(width*.007)));
  if(horizontal.end-horizontal.start<Math.max(100,width*.25))return null;
  return {left:100*horizontal.start/width,right:100*horizontal.end/width,top:100*vertical.start/height,bottom:100*vertical.end/height};
}

/** Convert paper-local percentages back to percentages of the original image. */
export function mapPaperCrop(local:Crop,paper:Crop):Crop {
  return {left:paper.left+local.left*(paper.right-paper.left)/100,right:paper.left+local.right*(paper.right-paper.left)/100,
    top:paper.top+local.top*(paper.bottom-paper.top)/100,bottom:paper.top+local.bottom*(paper.bottom-paper.top)/100};
}

/** Original-frame rectangle expressed in a displayed paper viewport. */
export function cropInViewport(crop:Crop,view:Crop):Crop {
  return {left:100*(crop.left-view.left)/(view.right-view.left),right:100*(crop.right-view.left)/(view.right-view.left),
    top:100*(crop.top-view.top)/(view.bottom-view.top),bottom:100*(crop.bottom-view.top)/(view.bottom-view.top)};
}
export function pointFromViewport(x:number,y:number,view:Crop) {
  return {x:view.left+x*(view.right-view.left)/100,y:view.top+y*(view.bottom-view.top)/100};
}
