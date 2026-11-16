// Numeric capture regression; requires pdftoppm, Pillow, Node with strip-types, and Python measurement dependencies.
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {analyzeSheet} from '../src/research/sheet.ts';
import {processPhotoRaster} from '../src/research/photoRaster.ts';
import {pdfRenderScale} from '../src/research/pdf.ts';
import {dimensionsFromReference} from '../src/research/sharedScale.ts';

const dir='artifacts/capture-preexcitation'; mkdirSync(dir,{recursive:true});
function run(bin,args,opts={}) { const p=spawnSync(bin,args,{maxBuffer:80_000_000,...opts}); if(p.status!==0) throw Error(`${bin}: ${p.stderr?.toString()}`);return p.stdout; }
const scale=pdfRenderScale(792,612);
run('pdftoppm',['-f','1','-l','1','-r',String(72*scale),'-png','-singlefile','artifacts/wave-maven-review/pdf/case-218.pdf',`${dir}/case-218`]);
// Pillow's bilinear filter approximates, but is not, the browser canvas renderer.
const py=`from PIL import Image\nimport sys\nim=Image.open(sys.argv[1]).convert('RGBA')\nx,y,r,b,w,h=map(int,sys.argv[2:])\nim=im.crop((x,y,r,b)).resize((w,h),Image.Resampling.BILINEAR)\nsys.stdout.buffer.write(im.tobytes())`;
function pixels(path,box,w,h){return new Uint8ClampedArray(run('python',['-c',py,path,...box.map(String),String(w),String(h)]));}
const W=Math.round(792*scale), H=Math.round(612*scale), path=`${dir}/case-218.png`;
const pw=1200,ph=Math.round(H*1200/W);
const detect=analyzeSheet(pixels(path,[0,0,W,H],pw,ph),pw,ph,'4x3');
const result={method:'Poppler 216 dpi; Pillow bilinear canvas approximation; explicit nominal physical PDF scale',pdfRenderScale:scale,dimensions:[W,H],detection:{paper:detect.paper,layout:detect.layout,rowsDetected:detect.rowsDetected,rhythmDetected:detect.rhythmDetected,sources:detect.sources,crops:detect.crops},leads:{}};
const traces={auto:{},manual:{}}; const rhythms={};
for(const [lead,crop] of Object.entries(detect.crops)) {
 const x=Math.round(W*crop.left/100),y=Math.round(H*crop.top/100),r=Math.round(W*crop.right/100),b=Math.round(H*crop.bottom/100);
 const sw=r-x,sh=b-y,s=Math.min(1,1800/sw,460/sh),w=Math.round(sw*s),h=Math.round(sh*s);
 const data=pixels(path,[x,y,r,b],w,h);
 const auto=processPhotoRaster(data,w,h,{speed:25,gain:10,widthMm:null,heightMm:null},new Blob());
 // An independent explicit 5 mm reference from nominal PDF physical dimensions, not an automatically detected grid.
 const pitch=72*scale/25.4, ref={left:0,top:0,right:500*pitch/W,bottom:500*pitch/H};
 const dims=dimensionsFromReference(crop,ref);
 let manual;try { manual=processPhotoRaster(data,w,h,{speed:25,gain:10,...dims},new Blob()); }catch(e){manual={kind:'error',code:e.code,message:e.message};}
 function brief(v){if(v.kind==='photo')return {kind:v.kind,seconds:v.result.seconds,scale:[v.result.pxPerMmX,v.result.pxPerMmY],quality:v.result.quality,warning:v.result.warningCode??null,gridUnitEvidence:v.result.gridUnitEvidence};return {kind:v.kind,code:v.code};}
 result.leads[lead]={pixelBox:[x,y,r,b],auto:brief(auto),manual:brief(manual)};
 for(const [method,value] of Object.entries({auto,manual})) if(value.kind==='photo'&&!value.result.warning) { const trace={mv:value.result.mv,seconds:value.result.seconds}; if(lead==='II-long')rhythms[method]=trace;else traces[method][lead]=trace; }
}
for(const method of ['auto','manual']) {
 const payload={traces:traces[method],...(rhythms[method]?{rhythmTrace:rhythms[method],rhythmLead:'II'}:{}),axisComparable:false,simultaneous:false};
 writeFileSync(`${dir}/input-${method}.json`,JSON.stringify(payload));
 if(Object.keys(payload.traces).length>=2){const code="import sys,json;sys.path.insert(0,'server/measure');from run_measure import measure_signals;print(json.dumps(measure_signals(json.load(sys.stdin)),allow_nan=False))";const out=run('python',['-c',code],{input:JSON.stringify(payload)});writeFileSync(`${dir}/measurement-${method}.json`,out);const m=JSON.parse(out);result[`${method}Measurement`]={measurements:m.estimate?.measurements,preexcitation:m.estimate?.global?.preexcitation};}
}
writeFileSync(`${dir}/summary.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
// The expected case is used only here as a post-measurement regression assertion.
if(result.autoMeasurement?.preexcitation?.status!=='supported' || result.autoMeasurement.preexcitation.supportingLeads.length<2) throw Error('Expected multi-lead waveform support was not reproduced from automatic raster capture');
if(Object.values(result.leads).some(lead=>lead.auto.kind!=='photo'||lead.auto.warning)) throw Error('Automatic capture produced a draft or quality warning');
