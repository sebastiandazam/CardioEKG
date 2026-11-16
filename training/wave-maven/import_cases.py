"""Bounded import of official educational cases; permission reported by project owner.
No account, email, survey demographics, ECG measurements or patient identities are invented.
"""
import argparse,hashlib,html,http.cookiejar,json,re,subprocess,urllib.parse,urllib.request
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
BASE='https://ecg.bidmc.harvard.edu/'
ROOT=Path(__file__).resolve().parents[2]
def clean(s):
 s=re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>','',s,flags=re.I|re.S)
 return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s))).strip()
def fetch(opener,url):
 with opener.open(url,timeout=40) as response:
  if urllib.parse.urlparse(response.geturl()).hostname!='ecg.bidmc.harvard.edu':raise ValueError('Unexpected source host')
  return response.read(),response.geturl()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--case-ids',default='1,2,3,4,5,15');args=parser.parse_args()
 ids=[int(v) for v in args.case_ids.split(',')];assert 0<len(ids)<=12
 opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));opener.addheaders=[('User-Agent','Mozilla/5.0')]
 fetch(opener,BASE+'maven/welcome.asp?ref=displist.asp?ans=1')
 # Follow the site's public Continue route with optional identity/demographic fields blank.
 raw,_=fetch(opener,BASE+'maven/stats.asp?'+urllib.parse.urlencode({'ref':'displist.asp?ans=1','training':'','goal':'','email':''}))
 text=raw.decode('latin1');cases={}
 for href,body in re.findall(r'<a\b[^>]*href\s*=\s*[\"\']?(dispcase\.asp[^\s>\"\']+)[\"\']?[^>]*>(.*?)</a>',text,re.I|re.S):
  query=urllib.parse.parse_qs(urllib.parse.urlsplit(html.unescape(href)).query)
  if 'caseid' not in query:continue
  case_id=int(query['caseid'][0]);row=int(query.get('rownum',['0'])[0]);value=clean(body)
  case=cases.setdefault(case_id,{'caseId':case_id,'row':row,'texts':[]})
  if value and not re.fullmatch(r'\d+:?',value):case['texts'].append(value)
 if len(cases)<100:raise ValueError('Official case catalog unavailable; no fabricated catalog written')
 folder=ROOT/'public/wave-maven';folder.mkdir(exist_ok=True)
 entries=[]
 for cid,c in sorted(cases.items()):
  if len(c['texts'])<2:continue
  reference=BASE+'maven/dispcase.asp?'+urllib.parse.urlencode({'caseid':cid,'rownum':c['row'],'ans':1})
  entries.append({'caseId':cid,'context':c['texts'][0],'diagnosis':' / '.join(dict.fromkeys(c['texts'][1:])),'sourceUrl':reference,'launchUrl':BASE+'maven/welcome.asp?'+urllib.parse.urlencode({'ref':reference.removeprefix(BASE+'maven/')})})
 manifest=[]
 for cid in ids:
  entry=next(e for e in entries if e['caseId']==cid)
  page,_=fetch(opener,entry['sourceUrl']);markup=page.decode('latin1')
  if not re.search(r'Display Case\s*:?\s*'+str(cid)+r'\b',clean(markup),re.I):raise ValueError(f'Case mismatch {cid}')
  match=re.search(r'(/mavendata/images/case'+str(cid)+r'/[^\"\'\s<>]+\.pdf)',markup,re.I)
  if not match:raise ValueError(f'Official PDF unavailable for case {cid}')
  image_url=urllib.parse.urljoin(BASE,match[1]);pdf,_=fetch(opener,image_url)
  if not pdf.startswith(b'%PDF-'):raise ValueError('Not a PDF')
  pdf_path=folder/f'case-{cid}.pdf';pdf_path.write_bytes(pdf)
  subprocess.run(['pdftoppm','-f','1','-singlefile','-scale-to','2800','-png',str(pdf_path),str(folder/f'case-{cid}')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  png_path=folder/f'case-{cid}.png';entry.update({'pdf':f'/wave-maven/{pdf_path.name}','image':f'/wave-maven/{png_path.name}'})
  answer=re.search(r'Answer:</td>\s*<td[^>]*>(.*?)</td>',markup,re.I|re.S)
  entry['explanation']=clean(answer[1]) if answer else ''
  manifest.append({'case_id':cid,'source_url':entry['sourceUrl'],'source_image_url':image_url,'diagnosis_reference':entry['diagnosis'],'reference_type':'source_case_diagnosis_not_wave_boundaries','pdf':str(pdf_path.relative_to(ROOT)),'image':str(png_path.relative_to(ROOT)),'pdf_sha256':hashlib.sha256(pdf).hexdigest(),'image_sha256':hashlib.sha256(png_path.read_bytes()).hexdigest(),'group':f'wave-maven-case-{cid}','split':'development' if cid in ids[:4] else 'held_out_case','patient_id':None,'patient_separation_verified':False,'clinical_validation':False,'training_executed':False})
  print('Imported official case',cid,entry['diagnosis'],flush=True)
 payload={'schemaVersion':1,'source':BASE+'maven/mavenmain.asp','attribution':'ECG Wave-Maven · Larry A. Nathanson, Seth McClennen, Charles Safran and Ary L. Goldberger · Beth Israel Deaconess Medical Center / Harvard Medical School','permissionBasis':'permission reported by project owner; no provider-issued permission document stored','importedOn':datetime.now(ZoneInfo('America/Bogota')).date().isoformat(),'cases':entries}
 (folder/'catalog.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2))
 (ROOT/'training/wave-maven/import-manifest.json').write_text(json.dumps({'schemaVersion':1,'permissionBasis':payload['permissionBasis'],'records':manifest,'model_training_executed':False,'expert_interval_annotations_available':False,'patient_independent_validation':False},ensure_ascii=False,indent=2))
 print('Catalog:',len(entries),'cases; bundled PDFs:',len(manifest),flush=True)
if __name__=='__main__':main()
