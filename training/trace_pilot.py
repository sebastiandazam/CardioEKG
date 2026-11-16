"""Small reproducible experiment: PTB-XL real waveforms rendered as lead crops.
Not clinical-photo validation. Keeps downloaded signals outside tracked source.
"""
import argparse,csv,json,subprocess,re,hashlib,concurrent.futures
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from sklearn.linear_model import LogisticRegression
from digitize import draw_paired_crop,ink_probability,trace_pixels,interpolate,errors

BASE='https://physionet.org/files/ptb-xl/1.0.3/'
def download(path,dest):
 if not dest.exists():
  dest.parent.mkdir(parents=True,exist_ok=True)
  subprocess.run(['curl','-fsSL','--retry','2','--max-time','40',BASE+path,'-o',str(dest)],check=True)
 return dest

def features(image):
 rgb=np.asarray(image.convert('RGB'),dtype=np.float32)/255
 lo=rgb.min(axis=2);hi=rgb.max(axis=2);dark=1-hi
 # Features are portable: RGB maximum darkness, redness and 5x5 mean darkness residual.
 mean=np.pad(dark,2,mode='edge');mean=sum(mean[y:y+dark.shape[0],x:x+dark.shape[1]] for y in range(5) for x in range(5))/25
 return np.stack([dark,np.maximum(0,rgb[:,:,0]-np.maximum(rgb[:,:,1],rgb[:,:,2])),dark-mean],axis=-1)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--data',type=Path,default=Path('data/trace-pilot'));ap.add_argument('--out',type=Path,default=Path('training/trace-pilot-results'));a=ap.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 download('ptbxl_database.csv',a.data/'ptbxl_database.csv');download('LICENSE.txt',a.data/'LICENSE.txt')
 records=list(csv.DictReader((a.data/'ptbxl_database.csv').open()));selected=[];used=set()
 for split,folds,count in [('fit',range(1,8),16),('selection',[8],8),('test',[10],8)]:
  subset=[]
  for row in records:
   if int(row['strat_fold']) in folds and row['patient_id'] not in used:
    used.add(row['patient_id']);row=dict(row,split=split);subset.append(row)
    if len(subset)==count:break
  selected+=subset
 def fetch(row):
  for ext in ['hea','dat']:download(row['filename_lr']+'.'+ext,a.data/(row['filename_lr']+'.'+ext))
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:list(ex.map(fetch,selected))
 rng=np.random.default_rng(20261111);pairs={k:[] for k in ['fit','selection','test']}
 for row in selected:
  header=(a.data/(row['filename_lr']+'.hea')).read_text().splitlines();channels=int(header[0].split()[1]);n=int(header[0].split()[3]);raw=np.fromfile(a.data/(row['filename_lr']+'.dat'),dtype='<i2').reshape(n,channels)
  for lead in [0,1,6,10]:
   gain=float(header[lead+1].split()[2].split('(')[0]);signal=raw[100:350,lead]/gain
   signal=signal-np.median(signal)
   for aug in range(2):
    image,mask,zero,scale=draw_paired_crop(signal,rng)
    pairs[row['split']].append((image,mask,signal,zero,scale,row['ecg_id'],lead,aug))
 X=[];Y=[]
 for image,mask,*_ in pairs['fit']:
  f=features(image).reshape(-1,3);target=(mask.ravel()>.5);pos=np.flatnonzero(target);neg=np.flatnonzero(~target)
  ids=np.r_[rng.choice(pos,min(400,len(pos)),replace=False),rng.choice(neg,800,replace=False)]
  X.append(f[ids]);Y.append(target[ids])
 model=LogisticRegression(C=10,max_iter=300,random_state=1).fit(np.concatenate(X),np.concatenate(Y));print('fitted',model.coef_,model.intercept_,flush=True)
 weights=model.coef_[0];bias=model.intercept_[0]
 def probability(image):return 1/(1+np.exp(-(features(image)@weights+bias)))
 def measure(pair,threshold=None):
  image,mask,signal,zero,scale,*_=pair
  ink=ink_probability(image) if threshold is None else probability(image)
  path=trace_pixels(ink,.34 if threshold is None else threshold)
  estimated=interpolate((zero-path)/scale,250)
  return errors(signal,estimated)
 choices=[]
 for threshold in [.25,.4,.55,.7]:
  rows=[measure(p,threshold) for p in pairs['selection']];valid=[r['mae_mv'] for r in rows if r['mae_mv'] is not None]
  choices.append((len(valid)/len(rows),-np.median(valid) if valid else -999,threshold))
 threshold=max(choices)[2];results={}
 for split in ['selection','test']:
  result={}
  for name,t in [('classical',None),('learned',threshold)]:
   rows=[measure(p,t) for p in pairs[split]];valid=[r['mae_mv'] for r in rows if r['mae_mv'] is not None]
   result[name]={'strips':len(rows),'accepted':len(valid),'coverage':len(valid)/len(rows),'median_mae_mv':float(np.median(valid)) if valid else None}
  results[split]=result
 candidate={'features':['1-max(rgb)/255','max(0,(r-max(g,b))/255)','darkness-minus-5x5-edge-padded-mean'],'weights':weights.tolist(),'bias':float(bias),'threshold':threshold,'scope':'experimental rendered real waveforms, not clinically validated','source':'PTB-XL 1.0.3, CC BY 4.0','seed':20261111}
 (a.out/'candidate.json').write_text(json.dumps(candidate,indent=2))
 report={'dataset':'PTB-XL 1.0.3','url':BASE,'license':'CC BY 4.0','license_sha256':hashlib.sha256((a.data/'LICENSE.txt').read_bytes()).hexdigest(),'seed':20261111,'record_selection':'first unique patients in CSV order, fit folds 1-7, selection fold 8, test fold 10','records':[{k:r[k] for k in ['ecg_id','patient_id','strat_fold','split']} for r in selected],'results':results,'selection_thresholds':choices,'limitations':['Small convenience sample','Images are synthetic renderings of real ECG waveforms, not independent clinical photographs','Manual known calibration for extraction experiment','No diagnostic classifier training','Candidate not approved for patient use']}
 (a.out/'report.json').write_text(json.dumps(report,indent=2))
 # Export locked test fixture to compare actual browser digitizer through Node, never shipped to public.
 manifest=[]
 for index,p in enumerate(pairs['test']):
  image,mask,signal,zero,scale,record,lead,aug=p
  path=a.data/f'fixture-{index}.rgba';path.write_bytes(np.asarray(image.convert('RGBA')).tobytes());manifest.append({'file':str(path.resolve()),'width':image.width,'height':image.height,'widthMm':62.5,'heightMm':image.height/(scale/10),'reference':signal.tolist(),'zero':zero,'scale':scale,'record':record,'lead':lead})
 (a.data/'js-fixtures.json').write_text(json.dumps(manifest))
 print(json.dumps(results,indent=2),flush=True)
if __name__=='__main__':main()
