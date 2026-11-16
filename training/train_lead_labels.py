"""Train a small label-identity MLP on known label boxes from rendered real ECG sheets.
Localization is an oracle here. This experiment does not validate full-sheet detection.
"""
import json,os
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import confusion_matrix

ROOT=Path('data/sheet-ocr');OUT=Path('training/lead-label-results');OUT.mkdir(parents=True,exist_ok=True)
LABELS=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];SEED=20261111
WIDTH,HEIGHT=16,24

def features(image,bbox,padding=4,dx=0,dy=0):
 x1,y1,x2,y2=bbox
 # Known text box: padding retains nearby paper, translations simulate a noisy proposal.
 box=(max(0,x1-padding+dx),max(0,y1-padding+dy),min(image.width,x2+padding+dx),min(image.height,y2+padding+dy))
 rgb=np.asarray(image.crop(box).convert('RGB'))
 # Match portable browser recipe. maxRGB attenuates red grid, then crop min/max contrast.
 gray=rgb.max(axis=2).astype(float);lo=float(np.min(gray));hi=float(np.max(gray));ink=(hi-gray)/max(1,hi-lo)
 resized=Image.fromarray(np.round(np.clip(ink,0,1)*255).astype('uint8')).resize((WIDTH,HEIGHT),Image.Resampling.BILINEAR)
 aspect=min(4,(x2-x1)/max(1,y2-y1))/4
 return np.r_[np.asarray(resized,dtype=float).ravel()/255,aspect]

def summary(truth,prob,threshold):
 predicted=prob.argmax(axis=1);conf=prob.max(axis=1);accepted=conf>=threshold;n=int(accepted.sum());correct=int(np.sum((truth==predicted)&accepted))
 return {'labels':len(truth),'threshold':threshold,'accepted':n,'coverage':n/len(truth),'correct_accepted':correct,'precision_among_accepted':correct/n if n else None,'overall_accuracy_without_abstention':float(np.mean(truth==predicted)),'abstained':int((~accepted).sum())}

def main():
 manifest=json.loads((ROOT/'manifest.json').read_text());rng=np.random.default_rng(SEED);data={k:([],[],[]) for k in ['fit','selection','test']}
 for row in manifest:
  with Image.open(row['file']) as image:
   for label in row['labels']:
    augmentations=4 if row['split']=='fit' else 1
    for aug in range(augmentations):
     pad=4 if aug==0 else int(rng.integers(2,7));dx=0 if aug==0 else int(rng.integers(-2,3));dy=0 if aug==0 else int(rng.integers(-2,3))
     x,y,ids=data[row['split']];x.append(features(image,label['bbox'],pad,dx,dy));y.append(LABELS.index(label['lead']));ids.append(row['ecg_id'])
 for k,(x,y,ids) in data.items():data[k]=(np.array(x),np.array(y),ids)
 fit,selection,test=(data[k] for k in ['fit','selection','test'])
 model=MLPClassifier(hidden_layer_sizes=(32,),activation='relu',solver='adam',alpha=.001,batch_size=128,learning_rate_init=.001,max_iter=150,tol=1e-5,n_iter_no_change=12,random_state=SEED)
 model.fit(fit[0],fit[1]);selection_probs=model.predict_proba(selection[0]);choices=[summary(selection[1],selection_probs,t) for t in [.5,.6,.7,.8,.9,.95,.98,.99]]
 eligible=[r for r in choices if r['precision_among_accepted'] is not None and r['precision_among_accepted']>=.99 and r['accepted']>=24]
 chosen=max(eligible,key=lambda r:r['coverage']) if eligible else max(choices,key=lambda r:(r['precision_among_accepted'] or 0,r['coverage']))
 threshold=chosen['threshold'];prob=model.predict_proba(test[0]);prediction=prob.argmax(axis=1)
 report={'scope':'Trained label identity MLP on renderings of real clinical ECG waveforms with oracle label boxes; not a detector or a diagnostic model. Not clinically validated.','source':'PTB-XL1.0.3 CC BY4.0','seed':SEED,'partitions':{k:{'patients':len(set(ids)),'labels_or_augmented_crops':len(y)} for k,(x,y,ids) in data.items()},'model':{'kind':'MLPClassifier','hidden':[32],'activation':'relu','iterations':int(model.n_iter_),'optimizer_converged':bool(model.n_iter_<model.max_iter),'input_features':fit[0].shape[1]},'selection_candidates':choices,'chosen_threshold':threshold,'test':summary(test[1],prob,threshold),'test_confusion_matrix':confusion_matrix(test[1],prediction,labels=list(range(12))).tolist(),'label_order':LABELS,'test_rows':[{'record':r,'expected':LABELS[int(y)],'predicted':LABELS[int(p)],'confidence':float(c.max()),'accepted':bool(c.max()>=threshold)} for r,y,p,c in zip(test[2],test[1],prediction,prob)]}
 candidate={'experimental':True,'scope':report['scope'],'labels':LABELS,'feature_spec':{'input':'known label bounding box in unrotated full image, crop with4px padding','gray':'max(r,g,b)','ink':'(max(gray)-gray)/max(1,max(gray)-min(gray))','resize':{'width':WIDTH,'height':HEIGHT,'method':'bilinear','flatten':'row-major'},'append':'min(4,unpad_bbox_width/unpad_bbox_height)/4','input_features':int(fit[0].shape[1])},'inference':'features@weights[0]+bias[0], ReLU, hidden@weights[1]+bias[1], softmax','confidence_threshold':threshold,'weights':[np.round(w,7).tolist() for w in model.coefs_],'bias':[np.round(b,7).tolist() for b in model.intercepts_]}
 (OUT/'report.json').write_text(json.dumps(report,indent=2));(OUT/'candidate.json').write_text(json.dumps(candidate,separators=(',',':')))
 print(json.dumps({k:report[k] for k in ['partitions','model','chosen_threshold','test']},indent=2))
if __name__=='__main__':main()
