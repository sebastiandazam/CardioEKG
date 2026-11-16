import {AI_MODELS,MAX_PROMPT,aiInstructions} from './config';
import type {AIModel} from './config';
const catalogueUrl='https://openrouter.ai/api/v1/models';
const chatUrl='https://openrouter.ai/api/v1/chat/completions';
type CatalogueModel={id:string;pricing?:Record<string,string|number>;architecture?:{input_modalities?:string[];output_modalities?:string[]}};
export function isFreeVisionModel(value:CatalogueModel|undefined,id:AIModel) {
 return !!value&&value.id===id&&id.endsWith(':free')&&AI_MODELS.some(m=>m.id===id)&&
  value.architecture?.input_modalities?.includes('image')===true&&value.architecture?.output_modalities?.includes('text')===true&&
  value.pricing?.prompt!==undefined&&value.pricing?.completion!==undefined&&
  Object.values(value.pricing).every(v=>v!==null&&String(v).trim()!==''&&Number(v)===0);
}
export function reviewPayload(model:AIModel,prompt:string,image:string,language:'es'|'en') {
 if(!AI_MODELS.some(m=>m.id===model)||!model.endsWith(':free'))throw new Error('model-not-free');
 if(!prompt.trim()||prompt.length>MAX_PROMPT)throw new Error('prompt-size');
 if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)||image.length>6*1024*1024)throw new Error('image-size');
 return {model,stream:false,max_tokens:2400,temperature:.2,reasoning:{enabled:false},
  provider:{only:['nvidia'],allow_fallbacks:false,data_collection:'allow',max_price:{prompt:0,completion:0}},
  messages:[{role:'system',content:aiInstructions(language)},{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image}}]}]};
}
/** No request is sent until caller provides explicit per-review consent. No retry, paid fallback, files API or shared key. */
export async function requestAIReview({key,model,prompt,image,language,consent,signal}:{key:string;model:AIModel;prompt:string;image:string;language:'es'|'en';consent:boolean;signal:AbortSignal},fetcher:typeof fetch=fetch) {
 if(!consent)throw new Error('consent');
 if(key.trim().length<20||/\s/.test(key.trim()))throw new Error('key-format');
 const payload=reviewPayload(model,prompt,image,language);
 const options={credentials:'omit' as const,referrerPolicy:'no-referrer' as const,signal,redirect:'error' as const};
 // Fetch only public metadata first: if zero price/vision cannot be confirmed,
 // the ECG and clinical prompt never leave the browser.
 const metadata=await fetcher(catalogueUrl,{...options,cache:'no-store'});
 if(!metadata.ok)throw new Error('catalogue-unavailable');
 const catalogue=await metadata.json() as {data?:CatalogueModel[]};
 if(!isFreeVisionModel(catalogue.data?.find(m=>m.id===model),model))throw new Error('model-not-free');
 const response=await fetcher(chatUrl,{...options,method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key.trim()}`},body:JSON.stringify(payload)});
 if(!response.ok)throw new Error(`http-${response.status}`);
 const body=await response.json() as {error?:unknown;model?:string;provider?:string;usage?:{cost?:number};choices?:{finish_reason?:string;message?:{content?:string|{type:string;text?:string}[]}}[]};
 if(body.error)throw new Error('provider-error');
 if(body.usage?.cost!==undefined&&(!Number.isFinite(body.usage.cost)||body.usage.cost!==0))throw new Error('unexpected-cost');
 const choice=body.choices?.[0];
 if(choice?.finish_reason==='content_filter')throw new Error('blocked');
 const content=choice?.message?.content;
 const text=(typeof content==='string'?content:Array.isArray(content)?content.filter(p=>p.type==='text').map(p=>p.text??'').join('\n'):'').trim();
 if(!text)throw new Error('empty-response');
 return {text:text.slice(0,40000),model:body.model?.slice(0,200)??model,provider:body.provider?.slice(0,100)??'NVIDIA (solicitado / requested)',truncated:choice?.finish_reason==='length'||text.length>40000,generatedAt:new Date().toISOString()};
}
export async function requestHostedReview({model,prompt,image,language,consent,signal}:{model:AIModel;prompt:string;image:string;language:'es'|'en';consent:boolean;signal:AbortSignal}) {
 if(!consent)throw new Error('consent');
 reviewPayload(model,prompt,image,language);
 const response=await fetch('/api/diagnostic-ai/review',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,prompt,image,language,consent}),signal});
 const body=await response.json();
 if(!response.ok||body.error)throw new Error(typeof body.error==='string'?body.error:`http-${response.status}`);
 if(typeof body.text!=='string'||typeof body.model!=='string'||typeof body.generatedAt!=='string')throw new Error('response-shape');
 return body as Awaited<ReturnType<typeof requestAIReview>>;
}
