/** The developer key in a Viewer embed is public and domain-bound. Never use a developer secret. */
export function biodigitalViewerUrl(raw:string|undefined):string|null {
 try{const u=new URL(raw??'');if(u.protocol!=='https:'||u.hostname!=='human.biodigital.com'||u.port||u.username||u.password||!/^\/(?:viewer|widget)\/?$/.test(u.pathname))return null;
 if(!u.searchParams.get('id')&&!u.searchParams.get('m'))return null;
 if(!u.searchParams.get('dk')&&!u.searchParams.get('uaid'))return null;
 if([...u.searchParams.keys()].some(k=>/secret|password|access_token/i.test(k)))return null;
 return u.href;}catch{return null;}
}
