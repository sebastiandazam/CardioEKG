import {computeNormals,type Mesh,type Vector} from './render';
/** Authored teaching landmarks in HRA Visible Human Male GLB metres. They are
 * not a segmentation of conducting tissue. See docs/anatomy-model.md. */
const SA:Vector=[-.025,.518,.031],AV:Vector=[.004,.476,.032],HIS:Vector=[.017,.478,.044];
export const hraConductionPaths:Record<string,Vector[][]>={
 'atrial-conduction':[[SA,[-.018,.501,.035],[-.008,.487,.033],AV]],
 'bundle-of-his':[[AV,[.01,.478,.039],HIS]],
 'left-bundle-branch':[[HIS,[.028,.468,.043],[.039,.45,.053],[.052,.432,.067]]],
 'right-bundle-branch':[[HIS,[.018,.467,.054],[.02,.451,.067],[.03,.433,.078]]],
 'purkinje-left':[[[.052,.432,.067],[.068,.447,.061],[.068,.47,.036],[.052,.486,.015]],[[.052,.432,.067],[.042,.44,.084],[.035,.466,.078]]],
 'purkinje-right':[[[.03,.433,.078],[.013,.438,.075],[-.002,.456,.065],[-.01,.475,.046]],[[.03,.433,.078],[.046,.444,.083],[.048,.461,.076]]],
 'accessory-pathway':[[[.027,.49,.006],[.043,.479,.008],[.052,.468,.021]]],
};
export function schematicHraConduction():Mesh[] {
 const meshes:Mesh[]=[];
 function tube(id:string,paths:Vector[][],radius:number) {
  const positions:number[]=[],indices:number[]=[],activation:number[]=[];const sides=10;
  for(const path of paths) {
   const lengths=path.slice(1).map((p,i)=>Math.hypot(...p.map((v,j)=>v-path[i][j]))),total=lengths.reduce((a,b)=>a+b,0);let done=0;
   const offset=positions.length/3;
   path.forEach((p,i)=>{
    const before=path[Math.max(0,i-1)],after=path[Math.min(path.length-1,i+1)],d=after.map((v,j)=>v-before[j]),n=Math.hypot(...d)||1,t=d.map(v=>v/n);
    const helper=Math.abs(t[1])<.9?[0,1,0]:[1,0,0];const a=[t[1]*helper[2]-t[2]*helper[1],t[2]*helper[0]-t[0]*helper[2],t[0]*helper[1]-t[1]*helper[0]],an=Math.hypot(...a)||1;for(let j=0;j<3;j++)a[j]/=an;
    const b=[t[1]*a[2]-t[2]*a[1],t[2]*a[0]-t[0]*a[2],t[0]*a[1]-t[1]*a[0]];
    for(let side=0;side<sides;side++) {
     const angle=side/sides*Math.PI*2;positions.push(...p.map((v,j)=>v+radius*(a[j]*Math.cos(angle)+b[j]*Math.sin(angle))));activation.push(done/(total||1));
     if(i){const k=offset+(i-1)*sides+side,l=offset+(i-1)*sides+(side+1)%sides;indices.push(k,l,l+sides,k,l+sides,k+sides);}
    }
    done+=lengths[i]??0;
   });
  }
  const vertices=Float32Array.from(positions),triangles=Uint16Array.from(indices);
  meshes.push({id,positions:vertices,indices:triangles,normals:computeNormals(vertices,triangles),color:[.95,.72,.15],activation:Float32Array.from(activation)});
 }
 function node(id:string,center:Vector,radius:number) {
  const positions:number[]=[],indices:number[]=[];
  for(let j=0;j<=10;j++)for(let i=0;i<=16;i++){const lat=j/10*Math.PI,lon=i/16*Math.PI*2;positions.push(center[0]+radius*Math.sin(lat)*Math.cos(lon),center[1]+radius*Math.cos(lat),center[2]+radius*Math.sin(lat)*Math.sin(lon));if(i&&j){const k=(j-1)*17+i-1;indices.push(k,k+1,k+18,k,k+18,k+17);}}
  const vertices=Float32Array.from(positions),triangles=Uint16Array.from(indices);meshes.push({id,positions:vertices,indices:triangles,normals:computeNormals(vertices,triangles),color:[.95,.72,.15]});
 }
 node('sa-node',SA,.002);node('av-node',AV,.0018);
 for(const [id,paths]of Object.entries(hraConductionPaths))tube(id,paths,id.includes('purkinje')?.00065:.001);
 return meshes;
}
