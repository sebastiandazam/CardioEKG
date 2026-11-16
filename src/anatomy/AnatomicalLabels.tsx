import {useMemo} from 'react';
import {project,type Mesh,type Mode,type Camera,type Vector} from './render';
import type {ClipPlane} from './geometry';
import {referenceIds,referenceAnchor,layoutReferenceLabels} from './labelLayout';
export function AnatomicalLabels({meshes,camera,view,selected,clip,isolate,width,height,language,labelFor,onSelect}:{meshes:Mesh[];camera:Camera;view:Mode;selected:string;clip:ClipPlane|null;isolate:boolean;width:number;height:number;language:'es'|'en';labelFor:(id:string)=>string;onSelect:(id:string)=>void}) {
 const es=language==='es',aspect=width/height;
 const anchors=useMemo(()=>meshes.flatMap(mesh=>{const point=referenceAnchor(mesh,clip);return point?[{id:mesh.id,point}]:[]}),[meshes,clip]);
 const ids=referenceIds(view,anchors.map(a=>a.id),selected,width<500?4:6);
 const labels=layoutReferenceLabels(ids.flatMap(id=>{if(isolate&&selected!==id)return [];const anchor=anchors.find(a=>a.id===id)!;return [{id,anchor:project(anchor.point,camera,aspect)}]}),width,height);
 // These directions rotate with the model, rather than relabeling screen left as patient right.
 const origin=project([0,0,0],camera,aspect);
 const direction=(p:Vector)=>{const end=project(p,camera,aspect),dx=(end[0]-origin[0])*aspect,dy=end[1]-origin[1],length=Math.hypot(dx,dy)||1;return [46+dx/length*26,42+dy/length*26] as const};
 const right=direction([-.3,0,0]),left=direction([.3,0,0]),superior=direction([0,.3,0]);
 const apexMesh=meshes.find(mesh=>mesh.id==='left-ventricle');
 let apex:Vector|null=null;
 if(apexMesh)for(let i=0;i<apexMesh.positions.length;i+=3)if(!apex||apexMesh.positions[i+1]<apex[1])apex=[apexMesh.positions[i],apexMesh.positions[i+1],apexMesh.positions[i+2]];
 const apexPoint=apex?project(apex,camera,aspect):null;
 return <div className="heart3d-references" aria-label={es?'Referencias anatómicas del corazón':'Anatomical heart references'}>
 <svg className="heart3d-leaders" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">{labels.map(item=><g key={item.id}><path d={`M${item.anchor[0]*width/100} ${item.anchor[1]*height/100} L${item.lineX} ${item.lineY}`} fill="none" stroke={selected===item.id?'#a74419':'#806554'} strokeWidth="1.2"/><circle cx={item.anchor[0]*width/100} cy={item.anchor[1]*height/100} r={selected===item.id?3.5:2.5} fill="#8b3825" stroke="#fff9f2" strokeWidth="1"/></g>)}</svg>
 {labels.map(item=><button key={item.id} type="button" className="heart3d-reference-card" style={{left:item.left,top:item.top,width:item.width}} aria-pressed={selected===item.id} onClick={()=>onSelect(item.id)} title={labelFor(item.id)}>{labelFor(item.id)}</button>)}
 <div className="heart3d-orientation" title={es?'Direcciones anatómicas del modelo; cambian con la rotación. D: derecha. I: izquierda.':'Anatomical model directions rotate with the heart. R: right. L: left.'}>
 <svg viewBox="0 0 92 84" role="img" aria-label={es?'Orientación: derecha, izquierda y superior':'Orientation: right, left and superior'}><g stroke="#825f4a" strokeWidth="1.3"><line x1="46" y1="42" x2={right[0]} y2={right[1]}/><line x1="46" y1="42" x2={left[0]} y2={left[1]}/><line x1="46" y1="42" x2={superior[0]} y2={superior[1]}/></g><g fill="#643f2c" fontSize="11" fontWeight="700" textAnchor="middle"><text x={right[0]} y={right[1]+4}>{es?'D':'R'}</text><text x={left[0]} y={left[1]+4}>{es?'I':'L'}</text><text x={superior[0]} y={superior[1]-4}>S</text></g></svg>
 <span>{es?'S: superior':'S: superior'}</span></div>
 {apexPoint&&(!clip||!apex||(clip.invert?apex[clip.axis]<=clip.position:apex[clip.axis]>=clip.position))&&apexPoint.every(Number.isFinite)&&apexPoint[0]>=8&&apexPoint[0]<=92&&apexPoint[1]>=12&&apexPoint[1]<=88&&!isolate&&<span className="heart3d-apex" style={{left:`${apexPoint[0]}%`,top:`${apexPoint[1]}%`}}>{es?'Ápex':'Apex'}</span>}
 </div>;
}
