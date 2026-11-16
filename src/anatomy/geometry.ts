import type {Mesh,Vector} from './render';
export type ClipPlane={axis:0|1|2;position:number;invert:boolean};
export function boundsFor(meshes:Mesh[],axis:0|1|2):[number,number] {
 let low=Infinity,high=-Infinity;
 for(const mesh of meshes)for(let i=axis;i<mesh.positions.length;i+=3){low=Math.min(low,mesh.positions[i]);high=Math.max(high,mesh.positions[i]);}
 return Number.isFinite(low)?[low,high]:[-1,1];
}
export function clipVector(clip:ClipPlane|null):[number,number,number,number] {
 const p:[number,number,number,number]=[0,0,0,0];if(!clip)return p;
 p[clip.axis]=clip.invert?-1:1;p[3]=-clip.position*p[clip.axis];return p;
}
/** Nearest ordered source path distance; a geometric teaching coordinate, not measured tissue timing. */
export function pathProgress(point:Vector,paths:Vector[][]):number {
 let best=Infinity,result=0;
 for(const path of paths) {
  const lengths=path.slice(1).map((p,i)=>Math.hypot(...p.map((v,j)=>v-path[i][j]))),total=lengths.reduce((a,b)=>a+b,0);let done=0;
  for(let i=0;i<lengths.length;i++) {
   const a=path[i],b=path[i+1],delta=b.map((v,j)=>v-a[j]),length=lengths[i];
   const t=Math.max(0,Math.min(1,delta.reduce((sum,v,j)=>sum+(point[j]-a[j])*v,0)/(length*length||1)));
   const distance=Math.hypot(...point.map((v,j)=>v-a[j]-delta[j]*t));
   if(distance<best){best=distance;result=(done+length*t)/(total||1);}done+=length;
  }
 }
 return result;
}
