#!/usr/bin/env python3
"""Privately cache one original PDF per indexed case; no duplicate GIF renditions.

Inventory and public case pages must already be cached by review_cases.py. No
source text is used as an image feature. Max two simultaneous network requests.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import urllib.request
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[2]

def utc(): return datetime.now(timezone.utc).isoformat()
def sha(data): return hashlib.sha256(data).hexdigest()
def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,indent=2)+'\n');temp.replace(path)

def fetch(record,cache,prior):
    cid=record['case_id']; pdfs=[a for a in record['assets'] if a['extension']=='.pdf']
    if len(pdfs)!=1:
        return {'case_id':cid,'status':'failed','error':f'expected one original PDF, got {len(pdfs)}'}
    url=pdfs[0]['url']; path=cache/'pdf'/f'case-{cid}.pdf'; meta_path=cache/'asset-http'/f'case-{cid}.json'
    try:
        if path.exists() and meta_path.exists():
            data=path.read_bytes(); result=json.loads(meta_path.read_text())
            if sha(data)!=result['sha256']:raise ValueError('cached PDF hash mismatch')
            result['cache_reused']=True;result['verified_at']=utc();return result
        if cid in prior and (ROOT/prior[cid]['pdf']).exists():
            source=ROOT/prior[cid]['pdf']; data=source.read_bytes()
            if sha(data)!=prior[cid]['pdf_sha256']:raise ValueError('existing bundled PDF hash mismatch')
            result={'http_status':None,'retrieved_at':None,'reuse_basis':'verified prior local import',
                    'existing_path':prior[cid]['pdf']}
        else:
            err=None
            for attempt in range(3):
                try:
                    req=urllib.request.Request(url,headers={'User-Agent':'CardioEKG educational research cache (max 2 concurrent requests)'})
                    with urllib.request.urlopen(req,timeout=45) as response:
                        if not response.geturl().startswith('https://ecg.bidmc.harvard.edu/'):raise ValueError('unexpected source host')
                        data=response.read()
                        result={'http_status':response.status,'retrieved_at':utc(),'final_url':response.geturl(),
                                'content_type':response.headers.get('Content-Type'),
                                'last_modified':response.headers.get('Last-Modified')}
                    err=None; break
                except Exception as exc:
                    err=exc
                    if attempt<2:time.sleep(attempt+1)
            if err is not None:raise err
            time.sleep(.2)
        if not data.startswith(b'%PDF-'):raise ValueError('not a PDF')
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        result.update({'case_id':cid,'status':'ok','url':url,'path':str(path.relative_to(ROOT)),
                       'sha256':sha(data),'bytes':len(data),'cache_reused':False,'verified_at':utc()})
        save(meta_path,result);return result
    except Exception as exc:
        return {'case_id':cid,'url':url,'status':'failed','checked_at':utc(),'error':type(exc).__name__+': '+str(exc)}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cache',type=Path,default=ROOT/'artifacts/wave-maven-review')
    p.add_argument('--workers',type=int,choices=[1,2],default=2);args=p.parse_args()
    cache=args.cache.resolve()
    if ROOT/'public' in cache.parents or cache==ROOT/'public':raise ValueError('cache must be private')
    coverage=json.loads((Path(__file__).parent/'coverage.json').read_text())
    prior={r['case_id']:r for r in json.loads((ROOT/'training/wave-maven/import-manifest.json').read_text())['records']}
    records=[]
    def manifest():
        ordered=sorted(records,key=lambda r:r['case_id']);good=[r for r in ordered if r['status']=='ok']
        return {'schema_version':1,'updated_at':utc(),'source_index':coverage['source_index'],
                'expected_cases':coverage['expected_cases'],'completed_cases':len(ordered),'downloaded_or_reused_cases':len(good),
                'failed_cases':len(ordered)-len(good),'total_pdf_bytes':sum(r['bytes'] for r in good),
                'policy':'one linked original PDF per case; low/high-res GIF renditions omitted as duplicate presentations; private cache only',
                'source_labels_are_features':False,'records':ordered}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(fetch,r,cache,prior) for r in coverage['records'] if r['status']=='ok']
        for future in concurrent.futures.as_completed(futures):
            records.append(future.result())
            if len(records)%20==0 or len(records)==coverage['retrieved_cases']:
                m=manifest();save(cache/'asset-manifest.json',m)
                print(f'PDF {len(records)}/{coverage["expected_cases"]}; failures {m["failed_cases"]}; bytes {m["total_pdf_bytes"]}',flush=True)
    m=manifest();save(cache/'asset-manifest.json',m)
    public={k:v for k,v in m.items() if k!='records'}
    public['records']=[{k:v for k,v in r.items() if k not in {'path','existing_path'}} for r in m['records']]
    save(Path(__file__).parent/'asset-coverage.json',public)
    print('Private training source manifest:',cache/'asset-manifest.json',flush=True)
if __name__=='__main__':main()
