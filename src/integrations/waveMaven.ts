import type {ClinicalContext} from '../ecg/context';
export type WaveMavenCase={caseId:number;context:string;diagnosis:string;sourceUrl:string;launchUrl:string;image?:string;pdf?:string;explanation?:string};
export type EducationalReference={provider:'ECG Wave-Maven';caseId:number;context:{es:string;en:string};diagnosis:{es:string;en:string};sourceUrl:string;attribution:string};
export type WaveMavenSample={file:File;reference:EducationalReference;clinicalContext:ClinicalContext};
const spanish:Record<number,[string,string]>={1:['Mujer de 21 años con episodios descritos como convulsiones','Síndrome de QT largo'],2:['ECG preoperatorio de una persona de 18 años para cirugía de rodilla','Inversión de electrodos de los brazos'],3:['Persona de 36 años con dolor torácico','Pericarditis aguda'],4:['Mujer mayor con disminución del nivel de conciencia','Hiperpotasemia'],5:['Hombre mayor asintomático con pulso lento','Bloqueo AV de segundo grado'],15:['Mujer de mediana edad con palpitaciones y mareo','Fibrilación auricular con patrón de Wolff–Parkinson–White']};
export const waveMavenAttribution='ECG Wave-Maven · Nathanson, McClennen, Safran & Goldberger · Beth Israel Deaconess Medical Center / Harvard Medical School';
export function waveReference(c:WaveMavenCase):EducationalReference{return {provider:'ECG Wave-Maven',caseId:c.caseId,context:{es:spanish[c.caseId]?.[0]??c.context,en:c.context},diagnosis:{es:spanish[c.caseId]?.[1]??c.diagnosis,en:c.diagnosis},sourceUrl:c.sourceUrl,attribution:waveMavenAttribution};}
export function isWaveSource(url:string){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='ecg.bidmc.harvard.edu'&&!u.username&&!u.password&&!u.port;}catch{return false;}}
export function bundledWaveImage(c:WaveMavenCase):string|null{return c.image===`/wave-maven/case-${c.caseId}.png`?c.image:null;}
export function validWaveCases(raw:unknown):WaveMavenCase[]{
 if(!raw||typeof raw!=='object'||!('cases' in raw)||!Array.isArray(raw.cases))return [];
 const ids=new Set<number>();return raw.cases.filter((c:any)=>{if(!c||!Number.isInteger(c.caseId)||c.caseId<1||ids.has(c.caseId)||typeof c.context!=='string'||typeof c.diagnosis!=='string'||!isWaveSource(c.sourceUrl)||!isWaveSource(c.launchUrl))return false;ids.add(c.caseId);return true;});
}
/** Only source context enters the analysis. The reference diagnosis is kept separate. */
export function waveClinicalContext(c:WaveMavenCase,language:'es'|'en'):ClinicalContext {
 const age=/\b(\d+)-(?:year|yr)-old\b/i.exec(c.context),elderly=!age&&/\belderly\b/i.test(c.context);
 const female=/\b(female|woman)\b/i.test(c.context),male=/\b(male|man)\b/i.test(c.context);
 const symptoms:ClinicalContext['symptoms']=[];
 if(/chest pain/i.test(c.context))symptoms.push('chest-pain');
 if(/palpitations/i.test(c.context))symptoms.push('palpitations');
 if(/seizures|syncope|near syncope|obtunded|lightheadedness|dizziness/i.test(c.context))symptoms.push('syncope');
 if(/dyspnea|shortness of breath/i.test(c.context))symptoms.push('dyspnea');
 return {...(age?{ageYears:Number(age[1])}:elderly?{ageYears:72}:{}),...(female?{sexAtBirth:'female' as const}:male?{sexAtBirth:'male' as const}:{}),...(symptoms.length?{symptoms}:{}),freeText:waveReference(c).context[language]};
}

export async function loadWaveSample(c:WaveMavenCase,language:'es'|'en',signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<WaveMavenSample>{
 const image=bundledWaveImage(c);if(!image)throw new Error('Case image not bundled');
 const response=await fetcher(image,{signal,credentials:'omit'});if(!response.ok)throw new Error('Case image unavailable');
 const blob=await response.blob();if(blob.size>20*1024*1024||blob.type!=='image/png')throw new Error('Invalid case image');
 const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());if(signature.length!==8||!signature.every((v,i)=>v===[137,80,78,71,13,10,26,10][i]))throw new Error('Invalid PNG signature');
 return {file:new File([blob],`wave-maven-${c.caseId}.png`,{type:'image/png'}),reference:waveReference(c),clinicalContext:waveClinicalContext(c,language)};
}
