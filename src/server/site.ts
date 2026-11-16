import {requestAIReview} from '../integrations/diagnosticAI/client';
type Env={ASSETS:{fetch:(request:Request)=>Promise<Response>};OPENROUTER_API_KEY?:string;CUSTOMER_OPENROUTER_API_KEY?:string};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const counters=new Map<string,{at:number;count:number}>();let active=0;
async function rateAllowed(request:Request){
 const now=Date.now();for(const [k,v] of counters)if(now-v.at>60000)counters.delete(k);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('CF-Connecting-IP')??'unknown'));
 const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const value=counters.get(key)??{at:now,count:0};value.count++;counters.set(key,value);
 return value.count<=3&&active<2&&counters.size<2000;
}
async function boundedBody(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new Error('body');
 const parts:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();throw new Error('body-size')}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function handleSite(request:Request,env:Env){
 const url=new URL(request.url),key=env.OPENROUTER_API_KEY??env.CUSTOMER_OPENROUTER_API_KEY;
 if(url.pathname==='/api/diagnostic-ai/status')return request.method==='GET'?json({configured:typeof key==='string'&&key.length>=20,sharedFreeQuota:true}):json({error:'method'},405);
 if(url.pathname!=='/api/diagnostic-ai/review')return url.pathname.startsWith('/api/')?json({error:'not-found'},404):env.ASSETS.fetch(request);
 if(request.method!=='POST')return json({error:'method'},405);
 if(![url.origin,'https://cardioscopio-ecg.dorydaza.chatgpt.site'].includes(request.headers.get('Origin')??''))return json({error:'origin'},403);
 if(!key)return json({error:'not-configured'},503);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'content-type'},415);
 if(!await rateAllowed(request))return json({error:'rate-limit'},429);
 let body;try{body=await boundedBody(request)}catch{return json({error:'invalid-body'},400)}
 if(body?.consent!==true)return json({error:'consent'},400);
 if(typeof body.prompt!=='string'||typeof body.image!=='string'||typeof body.model!=='string'||!['es','en'].includes(body.language))return json({error:'invalid-body'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),110000);active++;
 try{
  // Workers supports manual redirects; do not forward credentials to a redirect
  // target. Browser-specific cache/referrer options are not portable to workerd.
  const upstream:typeof fetch=async(input,init)=>{
   const {cache,credentials,referrerPolicy,...rest}=init??{};
   const options={...rest,redirect:'manual' as const,cf:{cacheTtl:0}};
   const response=await fetch(input,options);
   if(response.status>=300&&response.status<400)throw new Error('upstream-redirect');
   return response;
  };
  const result=await requestAIReview({key,model:body.model,prompt:body.prompt,image:body.image,language:body.language,consent:true,signal:controller.signal},upstream);
  return json(result);
 }catch(error){
  const raw=error instanceof Error?error.message:'provider-error';
  const safe=/^(http-\d{3}|model-not-free|catalogue-unavailable|prompt-size|image-size|unexpected-cost|empty-response|blocked|consent|upstream-redirect)$/.test(raw)?raw:error instanceof Error&&error.name==='AbortError'?'timeout':'provider-error';
  // Only runtime error kinds are logged. Never log inputs, headers or bodies.
  console.error('diagnostic-ai',error instanceof Error?error.name:'Error',error instanceof TypeError?raw.split(key).join('[redacted]').replace(/sk-or-v1-[a-zA-Z0-9_-]+/g,'[redacted]').slice(0,300):safe);
  return json({error:safe},safe==='http-429'?429:safe==='timeout'?504:502);
 }finally{clearTimeout(timer);active--;}
}
export default {fetch:handleSite};
