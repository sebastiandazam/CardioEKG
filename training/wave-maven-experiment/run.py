#!/usr/bin/env python3
"""Exploratory Wave-Maven image baseline. Not for clinical use."""
import hashlib, io, json, os, platform, subprocess, sys
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import PIL
from PIL import Image
import scipy
from scipy.fft import dctn
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/wave-maven-experiment'
CACHE = OUT / 'features'
SEED = 20261113
CATS = ROOT / 'training/wave-maven-review/coverage.json'
MANIFEST = ROOT / 'artifacts/wave-maven-review/asset-manifest.json'
OUT.mkdir(parents=True, exist_ok=True); CACHE.mkdir(exist_ok=True)

def feature(path, sha):
    cached = CACHE / (sha + '.npz')
    if cached.exists():
        z = np.load(cached); return z['x'], int(z['hash'].item())
    p = subprocess.run(['pdftoppm','-f','1','-l','1','-scale-to','800','-png','-singlefile',str(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=35)
    if p.returncode: raise ValueError('render failed')
    a = np.array(Image.open(io.BytesIO(p.stdout)).convert('RGB'))
    h,w = a.shape[:2]
    # Erase every extractable PDF text bounding box, including identifiers and lead labels.
    text = subprocess.run(['pdftotext','-f','1','-l','1','-bbox',str(path),'-'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    if text.returncode: raise ValueError('PDF text extraction failed')
    try:
        xml=ET.fromstring(text.stdout); page=next(x for x in xml.iter() if x.tag.endswith('page'))
        pw,ph=float(page.attrib['width']),float(page.attrib['height'])
        for word in page.iter():
            if not word.tag.endswith('word'): continue
            box=word.attrib; x0=max(0,int(float(box['xMin'])/pw*w)-3); x1=min(w,int(float(box['xMax'])/pw*w)+4)
            y0=max(0,int(float(box['yMin'])/ph*h)-3); y1=min(h,int(float(box['yMax'])/ph*h)+4)
            a[y0:y1,x0:x1]=255
    except (StopIteration, KeyError, ValueError, ET.ParseError): raise ValueError('PDF text bounding boxes unavailable')
    if w <= h: raise ValueError('unexpected page orientation')
    # Typical original sheet has a header with case ID and footer; ignore both.
    sheet = a[int(.40*h):int(.95*h), int(.035*w):int(.965*w)]
    if min(sheet.shape[:2]) < 30: raise ValueError('bad image dimensions')
    # Keep dark, neutral/blue ink, suppress red ECG grid.
    rgb = sheet.astype(np.int16)
    ink = ((rgb.min(axis=2) < 155) & (rgb[:,:,0] < rgb[:,:,1] + 25)).astype(np.uint8)*255
    # Remove positions normally occupied by lead names and calibration ticks.
    sh,sw = ink.shape
    for row in range(4):
        y0=round(row*sh/4); y1=round((row+1)*sh/4)
        ink[y0:y0+round((y1-y0)*.13),:] = 0
        for col in range(4):
            x0=round(col*sw/4); x1=round((col+1)*sw/4)
            ink[y0:y1,x0:x0+round((x1-x0)*.16)] = 0
    small=np.asarray(Image.fromarray(ink).resize((64,32),Image.Resampling.BOX),dtype=np.float32)/255
    if small.mean()<.001: raise ValueError('insufficient dark ink')
    # Perceptual hash on signal-only view to group near-duplicates before split.
    coeff=dctn(np.asarray(Image.fromarray(ink).resize((32,32)),dtype=float),norm='ortho')[:8,:8].ravel()
    bits=coeff[1:] > np.median(coeff[1:]); hv=sum(int(b)<<i for i,b in enumerate(bits))
    np.savez_compressed(cached,x=small.ravel(),hash=np.uint64(hv))
    return small.ravel(),hv

def wilson(k,n):
    if not n: return None
    z=1.96; p=k/n; d=1+z*z/n; m=(p+z*z/(2*n))/d; q=z*np.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return [round(float(m-q),4),round(float(m+q),4)]

def main():
    coverage=json.load(open(CATS)); manifest=json.load(open(MANIFEST)); print('manifest schema',type(manifest), flush=True)
    if isinstance(manifest,dict): manifest=manifest.get('records',manifest.get('assets',[]))
    assets={r['case_id']:r for r in manifest}
    def prepare(r):
        cid=r['case_id']; asset=assets.get(cid,{})
        path=ROOT / asset.get('path','')
        if not asset.get('path') or not path.is_file(): return None, {'case_id':cid,'reason':'asset unavailable'}
        if not r.get('categories'): return None, {'case_id':cid,'reason':'no mapped diagnosis category'}
        sha=hashlib.sha256(path.read_bytes()).hexdigest()
        if asset.get('sha256') and sha!=asset['sha256']: return None, {'case_id':cid,'reason':'asset hash mismatch'}
        try: x,h=feature(path,sha)
        except Exception as e: return None, {'case_id':cid,'reason':str(e)[:160]}
        return (cid,r['categories'],x,h,sha),None
    rows=[]; excluded=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i,(row,error) in enumerate(pool.map(prepare,coverage['records'])):
            if row: rows.append(row)
            if error: excluded.append(error)
            if i%50==0: print('processed',i,'usable',len(rows),flush=True)
    n=len(rows)
    if n<30: raise RuntimeError('insufficient usable data')
    # Connected components over exact file digest or pHash Hamming distance <= 4.
    parent=list(range(n))
    def find(i):
        while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
        return i
    def union(i,j):
        a,b=find(i),find(j)
        if a!=b: parent[b]=a
    for i in range(n):
        for j in range(i):
            if rows[i][4]==rows[j][4] or (rows[i][3]^rows[j][3]).bit_count()<=4: union(i,j)
    groups={}
    for i in range(n): groups.setdefault(find(i),[]).append(i)
    rng=np.random.default_rng(SEED); group_list=list(groups.values()); rng.shuffle(group_list)
    partitions={'train':[],'selection':[],'test':[]}
    for group in group_list:
        # Greedily place whole randomized groups to approximately 60/20/20.
        key=min(partitions,key=lambda k:len(partitions[k]) / {'train':.6,'selection':.2,'test':.2}[k])
        partitions[key].extend(group)
    X=np.stack([r[2] for r in rows]); scaler=StandardScaler().fit(X[partitions['train']]); X=scaler.transform(X)
    labels=sorted({c for r in rows for c in r[1]}); predictions={k:[] for k in partitions}; used=[]; metrics={}; coefficients=[]; intercepts=[]
    for label in labels:
        y=np.array([int(label in r[1]) for r in rows]); tr=partitions['train']; sel=partitions['selection']; te=partitions['test']
        # Eligibility is established on train and selection, without looking at test.
        if y[tr].sum()<12 or y[sel].sum()<3 or (1-y[tr]).sum()<12: continue
        best=None
        for c in (.001,.01,.1,1.):
            model=LogisticRegression(C=c,class_weight='balanced',max_iter=500,solver='liblinear',random_state=SEED).fit(X[tr],y[tr])
            score=average_precision_score(y[sel],model.predict_proba(X[sel])[:,1])
            if best is None or score>best[0]: best=(score,c,model)
        score,c,model=best; used.append(label); coefficients.append(model.coef_[0]); intercepts.append(model.intercept_[0])
        for k,idx in partitions.items(): predictions[k].append(model.predict_proba(X[idx])[:,1])
        p=model.predict_proba(X[te])[:,1]; pred=p>=.5; yt=y[te]; tp=int(np.sum(pred & (yt==1))); fp=int(np.sum(pred & (yt==0))); fn=int(np.sum(~pred & (yt==1)))
        metrics[label]={'train_positives':int(y[tr].sum()),'selection_positives':int(y[sel].sum()),'test_positives':int(yt.sum()),'test_size':len(te),'test_prevalence':float(yt.mean()),'selected_C':c,'selection_average_precision':float(score),'test_average_precision':float(average_precision_score(yt,p)) if yt.sum() else None,'test_roc_auc':float(roc_auc_score(yt,p)) if len(np.unique(yt))==2 else None,'threshold':.5,'tp':tp,'fp':fp,'fn':fn,'precision':tp/(tp+fp) if tp+fp else None,'precision_wilson_95':wilson(tp,tp+fp),'recall':tp/(tp+fn) if tp+fn else None,'recall_wilson_95':wilson(tp,tp+fn)}
    if not used: raise RuntimeError('no categories meet training and selection support')
    te=partitions['test']; mat=np.stack(predictions['test'],axis=1); abstain=int(np.sum(np.max(mat,axis=1)<.5))
    result={'purpose':'exploratory only; not a medical device or clinical inference model','seed':SEED,'source_cases':len(coverage['records']),'manifest_entries':len(assets),'usable_cases':n,'excluded_cases':len(excluded),'exclusion_reasons':dict(Counter(e['reason'] for e in excluded)),'eligible_categories':used,'ineligible_categories':sorted(set(labels)-set(used)),'group_count':len(groups),'groups_with_multiple_cases':sum(len(g)>1 for g in groups.values()),'largest_group':max(map(len,groups.values())),'split_sizes':{k:len(v) for k,v in partitions.items()},'test_cases_with_any_label_prediction':len(te)-abstain,'test_cases_abstained_at_0.5':abstain,'metrics':metrics,'dependencies':{'python':sys.version,'platform':platform.platform(),'numpy':np.__version__,'scipy':scipy.__version__,'pillow':PIL.__version__,'scikit_learn':sklearn.__version__},'limits':['All cases had labels reviewed before this experiment; no independent external validation.','Unknown patient IDs prevent patient-independent split.','Perceptual hash grouping reduces but cannot rule out near-duplicate leakage.','Inferred category labels are incomplete; absent labels are presumed negative.','Page cropping and masking cannot guarantee removal of all text or identifiers embedded in images.','Multiple selected categories and small samples make estimates unstable.','No probability calibration or clinical threshold validation performed.']}
    np.savez_compressed(OUT/'experimental-weights.npz', labels=np.array(used), coefficients=np.stack(coefficients), intercepts=np.array(intercepts), mean=scaler.mean_, scale=scaler.scale_)
    (OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n'); (OUT/'excluded.json').write_text(json.dumps(excluded,indent=2)+'\n')
    (OUT/'splits.json').write_text(json.dumps({k:[rows[i][0] for i in v] for k,v in partitions.items()},indent=2)+'\n')
    print(json.dumps(result,indent=2),flush=True)
if __name__=='__main__': main()
