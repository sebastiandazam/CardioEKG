import test from 'node:test';import assert from 'node:assert/strict';
import {findPaperRegion,mapPaperCrop} from './paper.ts';
import {analyzeSheet} from './sheet.ts';
import {conflictingRegions} from './regions.ts';

function framed({blank=false,gray=false,transparent=false}={}) {
 const w=600,h=1050,data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
  const i=(y*w+x)*4;data[i+3]=transparent?0:255;
  if(x>=30&&x<570&&y>=470&&y<910) {
   const line=(x-30)%5===0||(y-470)%5===0;
   const color=line?(gray?[145,145,145]:[250,190,190]):[255,248,245];
   data.set([...color,255],i);
  }
 }
 if(!blank)for(const center of [560,650,740,830])for(let x=50;x<550;x++) {
  const y=center+Math.round(3*Math.sin(x*.13));data.set([20,20,20,255],(y*w+x)*4);
 }
 return {data,w,h};
}
test('black or transparent bands are excluded before locating all lead and rhythm rows',()=>{
 for(const transparent of [false,true]) {
  const {data,w,h}=framed({transparent});const detection=analyzeSheet(data,w,h,'4x3');
  assert.ok(detection.rowsDetected);assert.ok(detection.rhythmDetected);
  assert.ok(Math.abs(detection.paper.top-470/h*100)<.2);
  for(const box of Object.values(detection.crops)) {
   assert.ok(box.top>=470/h*100&&box.bottom<=910/h*100);
   assert.ok(box.left>=30/w*100&&box.right<=570/w*100);
  }
  for(const [lead,y] of [['I',560],['II',650],['III',740],['II-long',830]]) {
   const box=detection.crops[lead];assert.ok(box.top/100*h<y&&box.bottom/100*h>y,`${lead} contains its actual tracing`);
  }
  assert.deepEqual(conflictingRegions(detection.crops),[]);
 }
});
test('blank paper or grid-only paper does not generate detected tracing rows',()=>{
 for(const gray of [false,true]) {
  const {data,w,h}=framed({blank:true,gray});const detection=analyzeSheet(data,w,h,'4x3');
  assert.ok(detection.paper);assert.equal(detection.rowsDetected,false);assert.equal(detection.rhythmDetected,false);
 }
 assert.equal(findPaperRegion(new Uint8ClampedArray(200*300*4),200,300),null);
});
test('paper-local labels and boxes map to the original coordinate frame, including asymmetric margins',()=>{
 const region={left:10,right:90,top:40,bottom:80};
 assert.deepEqual(mapPaperCrop({left:0,right:100,top:0,bottom:100},region),region);
 assert.deepEqual(mapPaperCrop({left:25,right:50,top:25,bottom:50},region),{left:30,right:50,top:50,bottom:60});
});

test('a tight unframed ECG does not skip a first tracing in the top 14 percent',()=>{
 const w=600,h=600,data=new Uint8ClampedArray(w*h*4).fill(255);
 for(const y of [60,198,336,474])for(let x=35;x<570;x++)data.fill(25,(y*w+x)*4,(y*w+x)*4+3);
 const result=analyzeSheet(data,w,h,'4x3');
 assert.ok(result.rowsDetected);assert.ok(result.rhythmDetected);
 for(const [lead,y] of [['I',60],['II',198],['III',336],['II-long',474]])assert.ok(result.crops[lead].top*h/100<=y&&result.crops[lead].bottom*h/100>=y,lead);
});

test('display cropping and pointer coordinates round-trip to the original image at every zoom',async()=>{
 const {cropInViewport,pointFromViewport}=await import('./paper.ts');
 const view={left:5,right:95,top:40,bottom:80},crop={left:10,right:30,top:45,bottom:55};
 const display=cropInViewport(crop,view);
 for(const zoom of [1,1.5,2.5]) {
  const rectangle={left:17,top:23,width:600*zoom,height:400*zoom};
  const clientX=rectangle.left+display.left/100*rectangle.width;
  const clientY=rectangle.top+display.top/100*rectangle.height;
  const point=pointFromViewport(100*(clientX-rectangle.left)/rectangle.width,100*(clientY-rectangle.top)/rectangle.height,view);
  assert.ok(Math.abs(point.x-crop.left)<1e-8&&Math.abs(point.y-crop.top)<1e-8);
 }
 assert.deepEqual(mapPaperCrop(display,view),crop);
});
test('a shaded half of the paper stays inside the paper region when the printed grid continues',()=>{
 const {data,w,h}=framed();
 for(let y=0;y<h;y++)for(let x=300;x<w;x++){const i=(y*w+x)*4;for(let c=0;c<3;c++)data[i+c]*=.5;}
 const detection=analyzeSheet(data,w,h,'4x3');
 assert.ok(detection.paper.right>=569/w*100-.5,'shaded right half is still paper');
});
