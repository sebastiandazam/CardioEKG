export function printableText(text:string):string {
 return text.replace(/[‐‑‒–—−]/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/≈/g,'~').replace(/×/g,'x').replace(/→/g,'->').replace(/←/g,'<-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/…/g,'...').replace(/[\u200b\u200c\u200d\ufeff]/g,'').replace(/[^\u0009\u000a\u000d\u0020-\u00ff]/g,'?');
}
