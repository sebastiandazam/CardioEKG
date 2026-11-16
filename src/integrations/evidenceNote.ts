/** User-pasted evidence stays in session memory. No provider response is synthesized. */
export type ExternalEvidenceNote={provider:'OpenEvidence';entryMethod:'manual-paste';text:string;citationText:string};
export function makeEvidenceNote(text:string,citationText=''):ExternalEvidenceNote {
 return {provider:'OpenEvidence',entryMethod:'manual-paste',text:text.slice(0,8000),citationText:citationText.slice(0,3000)};
}
export function evidenceCitations(note:ExternalEvidenceNote|undefined):string[]{
 if(!note)return [];
 const urls=note.citationText.split(/\s+/).flatMap(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?[u.href]:[];}catch{return [];}});
 return [...new Set(urls)].slice(0,12);
}
