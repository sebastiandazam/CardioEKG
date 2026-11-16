import type {Mesh,Mode,Vector} from './render';
import type {ClipPlane} from './geometry';
export const defaultAnatomySource='atlas' as const;
export type ProjectedReference={id:string;anchor:[number,number]};
export type ReferenceLabel=ProjectedReference&{left:number;top:number;width:number;lineX:number;lineY:number};
const priorities:Record<Exclude<Mode,'axis'>,string[]>={
 surface:['right-atrium','left-atrium','right-ventricle','left-ventricle','aorta','pulmonary-trunk','superior-vena-cava'],
 inside:['interventricular-septum','mitral-valve','tricuspid-valve','left-ventricle','right-ventricle','aortic-valve','pulmonary-valve','left-atrium','right-atrium'],
 conduction:['sa-node','av-node','bundle-of-his','purkinje-fibers','purkinje-left','right-bundle-branch','left-bundle-branch','purkinje-right'],
};
export function referenceIds(view:Mode,available:string[],selected:string,limit:number):string[] {
 if(view==='axis')return [];
 const candidates=[...(selected?[selected]:[]),...priorities[view]];
 return [...new Set(candidates)].filter(id=>available.includes(id)).slice(0,limit);
}
/** An anchor on retained source geometry, never an annotation for a missing structure. */
export function referenceAnchor(mesh:Mesh,clip:ClipPlane|null):Vector|null {
 const center:Vector=[0,0,0];let count=0;
 const retained=(i:number)=>!clip||(clip.invert?mesh.positions[i+clip.axis]<=clip.position:mesh.positions[i+clip.axis]>=clip.position);
 for(let i=0;i<mesh.positions.length;i+=3)if(retained(i)){for(let j=0;j<3;j++)center[j]+=mesh.positions[i+j];count++;}
 if(!count)return null;for(let j=0;j<3;j++)center[j]/=count;
 let distance=Infinity,anchor:Vector|null=null;
 for(let i=0;i<mesh.positions.length;i+=3)if(retained(i)) {
  const d=(mesh.positions[i]-center[0])**2+(mesh.positions[i+1]-center[1])**2+(mesh.positions[i+2]-center[2])**2;
  if(d<distance){distance=d;anchor=[mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]];}
 }
 return anchor;
}
/** Side cards have fixed-height slots; leaders follow the projected anatomy during rotation. */
export function layoutReferenceLabels(items:ProjectedReference[],width:number,height:number):ReferenceLabel[] {
 const labelWidth=Math.max(82,Math.min(142,width*.25)),spacing=52,minY=82,maxY=Math.max(minY,height-68);
 const visible=items.filter(item=>item.anchor.every(Number.isFinite)&&item.anchor[0]>=0&&item.anchor[0]<=100&&item.anchor[1]>=0&&item.anchor[1]<=100);
 const result:ReferenceLabel[]=[],capacity=Math.max(1,Math.floor((maxY-minY)/spacing)+1);
 const groups=[visible.filter(item=>item.anchor[0]<50),visible.filter(item=>item.anchor[0]>=50)];
 for(let side=0;side<2;side++)while(groups[side].length>capacity&&groups[1-side].length<capacity)groups[1-side].push(groups[side].pop()!);
 for(const leftSide of [true,false]) {
  const group=groups[leftSide?0:1].sort((a,b)=>a.anchor[1]-b.anchor[1]);
  const y=group.map(item=>Math.max(minY,Math.min(maxY,item.anchor[1]*height/100)));
  for(let i=1;i<y.length;i++)y[i]=Math.max(y[i],y[i-1]+spacing);
  if(y.length&&y[y.length-1]>maxY){y[y.length-1]=maxY;for(let i=y.length-2;i>=0;i--)y[i]=Math.min(y[i],y[i+1]-spacing);}
  // A narrow viewport may not have room for every reference on one side.
  // Keep readable slots instead of stacking labels outside the stage.
  group.forEach((item,i)=>{if(y[i]<minY)return;const left=leftSide?8:width-labelWidth-8;result.push({...item,left,top:y[i]-22,width:labelWidth,lineX:leftSide?left+labelWidth:left,lineY:y[i]});});
 }
 return result;
}
