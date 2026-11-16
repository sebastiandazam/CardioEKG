export const modelLabels=['sinus','af','rbbb','lbbb'] as const;
export type ModelLabel=typeof modelLabels[number];
export type ModelDecisions=Record<ModelLabel,'positive'|'negative'|'indeterminate'|'unsupported'>;
/** Four independent sigmoid outputs. Rhythm and conduction may coexist. */
export function decodeModel(probabilities:number[],bands:Record<ModelLabel,{lower:number;upper:number}>) {
 if(probabilities.length!==4||probabilities.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('Invalid model output');
 const decisions=Object.fromEntries(modelLabels.map((label,i)=>{const band=bands[label];return [label,band.lower===-1&&band.upper===2?'unsupported':probabilities[i]>=band.upper?'positive':probabilities[i]<band.lower?'negative':'indeterminate'];})) as ModelDecisions;
 const findings=modelLabels.filter(label=>decisions[label]==='positive');
 const rhythms=findings.filter(label=>label==='sinus'||label==='af');
 const pattern:ModelLabel|'indeterminate'=rhythms.length===1?rhythms[0]:'indeterminate';
 return {schemaVersion:2 as const,pattern,findings,decisions,probabilities};
}
