import type {CaseAnalysis} from '../ecg/analysisTypes';
/** Numerical equality tolerance is floating-point tolerance, never clinical accuracy. */
export function compareAnalysis(local:CaseAnalysis,remote:CaseAnalysis) {
 const differences:string[]=[];
 if(remote?.schemaVersion!==local.schemaVersion||remote?.algorithmVersion!==local.algorithmVersion)return {equivalent:false,versionCompatible:false,differences:['version']};
 const keys=['rateBpm','prMs','qrsMs','qtMs','axisDeg'];
 if(!Array.isArray(remote.measurements)||remote.measurements.length!==5||new Set(remote.measurements.map(m=>m.key)).size!==5||remote.measurements.some(m=>!keys.includes(m.key)||m.value!==null&&!Number.isFinite(m.value)))return {equivalent:false,versionCompatible:true,differences:['measurement-schema']};
 function compare(a:unknown,b:unknown,path:string){
  if(typeof a==='number'&&typeof b==='number'){
   const axis=path.endsWith('axisDeg.value'),delta=axis?Math.abs(((a-b+540)%360+360)%360-180):Math.abs(a-b);
   const tolerance=path.endsWith('rateBpm.value')?1e-6:path.endsWith('.value')?1e-3:1e-6;
   if(!Number.isFinite(a)||!Number.isFinite(b)||delta>tolerance)differences.push(path);return;
  }
  if(Array.isArray(a)&&Array.isArray(b)){
   if(a.length!==b.length){differences.push(path);return;}
   const order=(v:unknown[])=>v.every(x=>typeof x==='object'&&x!==null&&('key' in x||'id' in x))?[...v].sort((x:any,y:any)=>String(x.key??x.id).localeCompare(String(y.key??y.id))):v;
   const aa=order(a),bb=order(b);aa.forEach((v:any,i)=>compare(v,bb[i],`${path}.${v?.key??v?.id??i}`));return;
  }
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
   const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;
   for(const k of new Set([...Object.keys(aa),...Object.keys(bb)])){
    if(k==='windows'&&(!aa[k]||Array.isArray(aa[k])&&!(aa[k] as unknown[]).length)&&(!bb[k]||Array.isArray(bb[k])&&!(bb[k] as unknown[]).length))continue;
    compare(aa[k],bb[k],`${path}.${k}`);
   }return;
  }
  if(a!==b)differences.push(path);
 }
 compare(local,remote,'analysis');
 return {equivalent:!differences.length,versionCompatible:true,differences:[...new Set(differences)]};
}
