/** Presentation only: criteria and stored measurements keep their original precision. */
export function clinicalText(text:string):string {
 return text.replace(/([−-]?\d+[.,]\d+)\s*(lpm|bpm|ms|°)(?![\w/])/g,(_,raw:string,unit:string)=>{
  const n=Math.round(Number(raw.replace('−','-').replace(',','.')));
  return `${Object.is(n,-0)?0:n}${unit==='°'?'':' '}${unit}`;
 });
}
