import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { digitize } = await import(process.argv[5] ? pathToFileURL(process.argv[5]).href : '../src/research/digitize.ts');
const manifest = JSON.parse(readFileSync(process.argv[2],'utf8'));
const rows=manifest.map(f=>{
 try {
  const result=digitize(new Uint8ClampedArray(readFileSync(f.file)),f.width,f.height,{speed:25,gain:10,widthMm:process.argv[4]==='auto'?null:f.widthMm,heightMm:process.argv[4]==='auto'?null:f.heightMm});
  const n=f.reference.length;
  const reference=f.reference;
  const estimate=reference.map((_,i)=>{const x=i*(result.mv.length-1)/(n-1),left=Math.floor(x),right=Math.min(left+1,result.mv.length-1);return result.mv[left]+(result.mv[right]-result.mv[left])*(x-left)});
  const mae=estimate.reduce((v,x,i)=>v+Math.abs(x-reference[i]),0)/n;
  return {record:f.record,lead:f.lead,kind:f.kind,accepted:!result.warning,warning:result.warningCode??null,mae_mv:mae,quality:result.quality};
 } catch(e) {return {record:f.record,lead:f.lead,kind:f.kind,accepted:false,error:e.code??e.message};}
});
const valid=rows.filter(x=>x.accepted);const sorted=valid.map(x=>x.mae_mv).sort((a,b)=>a-b);
const report={strips:rows.length,accepted:valid.length,coverage:valid.length/rows.length,median_mae_mv:sorted.length?sorted[Math.floor(sorted.length/2)]:null,rows};
writeFileSync(process.argv[3],JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined}));
