export type ReviewLevel='full-text'|'abstract'|'metadata-only'|'legacy';
export function referenceReviewLabel(level:string|undefined,language:'es'|'en',verified?:boolean){
 const es=language==='es';
 return level==='full-text'?(es?'Texto consultado':'Text consulted'):level==='abstract'?(es?'Resumen consultado':'Abstract consulted'):level==='metadata-only'?(es?'Solo registro bibliográfico':'Bibliographic record only'):verified===false?(es?'No verificada':'Unverified'):(es?'Registro previo':'Previous record');
}
