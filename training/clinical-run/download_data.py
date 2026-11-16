"""Download frozen public waveform/annotation subsets; no credentials or paid compute.

--full uses every eligible PTB-XL record in each official fold (about 21,800 records) and every
Chapman-Shaoxing-Ningbo record (about 45,000) instead of the 6,000 / 1,000 subset. Run
bulk_download.py first: it mirrors the datasets with resume and checksum verification, so this
script then only freezes the manifest and finds every file already on disk.
"""
import ast,csv,hashlib,json,subprocess,concurrent.futures,threading,time,sys
from pathlib import Path
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
ROOT=Path('data/clinical-run');OUT=Path('training/clinical-run');SEED=20261112
FULL='--full' in sys.argv
BASES={'ptb':'https://physionet.org/files/ptb-xl/1.0.3/','chapman':'https://physionet.org/files/ecg-arrhythmia/1.0.0/','ludb':'https://physionet.org/files/ludb/1.0.1/','qt':'https://physionet.org/files/qtdb/1.0.0/'}
S3_BASES={'ptb':'https://physionet-open.s3.amazonaws.com/ptb-xl/1.0.3/','chapman':'https://physionet-open.s3.amazonaws.com/ecg-arrhythmia/1.0.0/','ludb':'https://physionet-open.s3.amazonaws.com/ludb/1.0.1/','qt':'https://physionet-open.s3.amazonaws.com/qtdb/1.0.0/'}
_TLS=threading.local()
def _session():
 s=getattr(_TLS,'session',None)
 if s is None:
  s=requests.Session()
  retry=Retry(total=3,backoff_factor=0.4,status_forcelist=[429,500,502,503,504])
  adapter=HTTPAdapter(pool_connections=32,pool_maxsize=32,max_retries=retry)
  s.mount('https://',adapter);s.mount('http://',adapter);_TLS.session=s
 return s
def fetch(source,relative,optional=False):
 dest=ROOT/source/relative
 if dest.exists() and dest.stat().st_size>0:return dest
 # Reuse prior checked PTB waveform bytes without another request.
 prior=Path('data/trace-pilot')/relative
 if source=='ptb' and prior.exists():dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(prior.read_bytes());return dest
 dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_name(dest.name+'.partial')
 last_err=''
 for base in (S3_BASES[source],BASES[source]):
  try:
   resp=_session().get(base+relative,timeout=30)
   if resp.status_code==200 and len(resp.content)>0:
    tmp.write_bytes(resp.content);tmp.replace(dest);return dest
   last_err=f'HTTP {resp.status_code}'
  except Exception as exc:
   last_err=str(exc)
 tmp.unlink(missing_ok=True)
 if optional:return None
 raise RuntimeError(f'{source}/{relative}: {last_err}')

def main():
 ROOT.mkdir(parents=True,exist_ok=True)
 sources={}
 for source in BASES:
  qt_cached=ROOT/'qt/license-page.html'
  license_file=qt_cached if source=='qt' and qt_cached.exists() and 'Open Data Commons Attribution License v1.0' in qt_cached.read_text() else fetch(source,'LICENSE.txt',optional=True)
  if license_file is None:
   # QTDB declares ODC-By in the official metadata page rather than a LICENSE file.
   path=ROOT/source/'license-page.html';subprocess.run(['curl','-fsSL','--max-time','30','https://physionet.org/content/qtdb/1.0.0/','-o',str(path)],check=True);assert 'Open Data Commons Attribution License v1.0' in path.read_text();license_file=path
  sources[source]={'url':BASES[source],'license':'CC BY4.0' if source in ['ptb','chapman'] else 'ODC-By1.0','license_sha256':hashlib.sha256(license_file.read_bytes()).hexdigest()}
 meta=fetch('ptb','ptbxl_database.csv');fetch('ptb','scp_statements.csv');rows=list(csv.DictReader(meta.open()));assign={}
 for r in rows:
  previous=assign.setdefault(r['patient_id'],r['strat_fold']);assert previous==r['strat_fold'],'official patient folds leaked'
 excluded=set()
 old=Path('training/trace-pilot-results/report.json')
 if old.exists():excluded.update(str(x['patient_id']) for x in json.loads(old.read_text())['records'])
 # Exclude the public image's linked PTB record and therefore its patient.
 excluded.update(r['patient_id'] for r in rows if r['ecg_id']=='22')
 key=lambda r:hashlib.sha256(f"{SEED}:{r['ecg_id']}".encode()).hexdigest()
 selected=[]
 for split,folds,count in [('fit',range(1,8),4000),('selection',[8],500),('calibration',[9],500),('test',[10],1000)]:
  # Official strat_fold assignment is patient-wise, so the full cohort keeps patients separated.
  pool=sorted([r for r in rows if int(r['strat_fold']) in folds and r['patient_id'] not in excluded],key=key)
  eligible=pool if FULL else pool[:count];assert FULL or len(eligible)==count
  selected.extend(dict(r,split=split) for r in eligible)
 manifests={'ptb':selected}
 dirs=fetch('chapman','RECORDS').read_text().splitlines();chosen=dirs if FULL else [dirs[round(i*(len(dirs)-1)/19)] for i in range(20)]
 external=[]
 for folder in chosen:
  records=fetch('chapman',folder+'RECORDS').read_text().splitlines()
  records=sorted(records,key=lambda s:hashlib.sha256(f'{SEED}:{folder}{s}'.encode()).hexdigest())
  records=records if FULL else records[:50]
  external.extend({'record':folder+r,'split':'external'} for r in records)
 assert FULL or len(external)==1000;manifests['chapman']=external
 ludb=fetch('ludb','RECORDS').read_text().splitlines();ludb=sorted(ludb,key=lambda s:hashlib.sha256(f'{SEED}:{s}'.encode()).hexdigest());assert len(ludb)==200
 manifests['ludb']=[{'record':r,'split':'fit' if i<140 else 'selection' if i<160 else 'test'} for i,r in enumerate(ludb)]
 qt=fetch('qt','RECORDS').read_text().splitlines();qt=sorted(qt,key=lambda s:hashlib.sha256(f'{SEED}:{s}'.encode()).hexdigest())[:30];manifests['qt']=[{'record':r,'split':'external'} for r in qt]
 # Persist frozen selected IDs before downloading/looking at test waveforms.
 (OUT/('cohort-manifest-full.json' if FULL else 'cohort-manifest.json')).write_text(json.dumps({'full':FULL,'seed':SEED,'sources':sources,'excluded_ptb_patients':sorted(excluded),'cohorts':manifests},indent=2))
 jobs=[]
 # Annotation/reference and heldout partitions have priority after interruptions;
 # patient assignments and selected IDs never change.
 for r in manifests['ludb']:
  for ext in ['hea','dat','ii']:jobs.append(('ludb',r['record']+'.'+ext))
 for r in manifests['qt']:
  for ext in ['hea','dat','q1c']:jobs.append(('qt',r['record']+'.'+ext))
 for r in external:
  for ext in ['hea','mat']:jobs.append(('chapman',r['record']+'.'+ext))
 for split in ['calibration','test','selection','fit']:
  for r in selected:
   if r['split']==split:
    for ext in ['hea','dat']:jobs.append(('ptb',r['filename_lr']+'.'+ext))
 started=time.time();failures=[]
 def work(job):
  try:return (job,str(fetch(*job)),None)
  except Exception as e:return(job,None,str(e))
 ex=concurrent.futures.ThreadPoolExecutor(max_workers=24)
 futures=[ex.submit(work,job) for job in jobs]
 stopped=False
 try:
  for i,future in enumerate(futures):
   job,path,error=future.result()
   if error:failures.append({'job':job,'error':error})
   if len(failures)>=8 and i<40:
    stopped=True;print('Circuitbreak: persistentearlynetworkfailures',flush=True);break
   if (i+1)%500==0:print(f'downloaded/checked {i+1}/{len(jobs)} files, errors={len(failures)}, elapsed={time.time()-started:.0f}s',flush=True)
 finally:
  ex.shutdown(wait=True,cancel_futures=stopped)
 (OUT/'download-report.json').write_text(json.dumps({'files_requested':len(jobs),'failures':failures,'elapsed_seconds':time.time()-started,'stopped_early':stopped,'sources':sources},indent=2));print('DOWNLOAD COMPLETE',len(jobs),len(failures),flush=True)
 if failures:raise RuntimeError('See download-report.json for exact failed files')
if __name__=='__main__':main()
