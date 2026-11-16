/** A physical unit is inferred only when a regular major-line lattice also
 * contains phase-consistent evidence for the four intervening minor lines. */
export interface HierarchicalGrid { pitch:number;majorPitch:number;confidence:number;minorVerified:boolean }
const median=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)]??0;
export function gridLattice(profile:Float64Array):HierarchicalGrid|null {
  const values=Array.from(profile);const floor=values.slice().sort((a,b)=>a-b)[Math.floor(values.length*.1)]??0;
  const range=Math.max(...values)-floor;if(range<.003)return null;
  const peaks:number[]=[];
  for(let i=2;i<profile.length-2;i++) {
    const value=profile[i];if(value<floor+range*.3||value<profile[i-1]||value<=profile[i+1])continue;
    const curvature=2*value-profile[i-1]-profile[i+1];
    const at=i+(curvature>1e-9?Math.max(-.5,Math.min(.5,(profile[i+1]-profile[i-1])/(2*curvature))):0);
    if(peaks.length&&at-peaks[peaks.length-1]<3)continue;peaks.push(at);
  }
  if(peaks.length<4)return null;
  const gaps=peaks.slice(1).map((p,i)=>p-peaks[i]),major=median(gaps);
  if(major<9||major>300)return null;
  const intervals=gaps.flatMap((gap,i)=>Math.abs(gap-major)<=Math.max(1.5,major*.06)?[[peaks[i],peaks[i+1]]]:[]);
  if(intervals.length<3||intervals.length<gaps.length*.75)return null;
  const sample=(x:number)=>{const low=Math.floor(x),high=Math.min(profile.length-1,low+1);return profile[low]+(profile[high]-profile[low])*(x-low);};
  const folded=Array.from({length:201},(_,i)=>intervals.reduce((sum,[a,b])=>sum+sample(a+(b-a)*i/200),0)/intervals.length);
  const contrasts=[1,2,3,4].map(k=>{
    const center=k*40;const line=(folded[center-2]+folded[center]+folded[center+2])/3;
    const background=(folded[center-20]+folded[center+20])/2;
    return line-background;
  });
  const noise=Math.max(.00045,range*.002);
  const minorVerified=contrasts.filter(x=>x>noise).length>=3&&median(contrasts)>=noise*1.4;
  const majorPitch=intervals.reduce((sum,[a,b])=>sum+b-a,0)/intervals.length;
  return {pitch:majorPitch/5,majorPitch,minorVerified,confidence:Math.min(1,median(contrasts)/Math.max(noise*5,.003))};
}

export function hierarchicalGrid(profile:Float64Array):HierarchicalGrid|null {
  const lattice=gridLattice(profile);return lattice?.minorVerified?lattice:null;
}
