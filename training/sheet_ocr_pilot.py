"""Evaluate pretrained Tesseract lead-label OCR on sheets rendered from real PTBXL.
This calibrates a configuration; it does not train new neural-network weights.
"""
import csv,json,re,subprocess,concurrent.futures,hashlib,io,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageOps
from trace_pilot import download

ROOT=Path('data/sheet-ocr');OUT=Path('training/sheet-ocr-results');OUT.mkdir(parents=True,exist_ok=True)
SOURCE=Path('data/trace-pilot');ROOT.mkdir(parents=True,exist_ok=True)
ROWS={'4x3':[['I','aVR','V1','V4'],['II','aVL','V2','V5'],['III','aVF','V3','V6']], '2x6':[['I','V1'],['II','V2'],['III','V3'],['aVR','V4'],['aVL','V5'],['aVF','V6']]}
LEADS=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6']
FONTS=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']

def generate(row,seed):
 rng=np.random.default_rng(seed);layout=['4x3','2x6'][seed%2];grid=ROWS[layout];width,height=(1800,1300) if layout=='4x3' else (1500,1700)
 image=Image.new('RGB',(width,height),(255,251,249));draw=ImageDraw.Draw(image)
 pitch=8
 for x in range(20,width,pitch):draw.line((x,20,x,height-20),fill=(246,211,211) if x%40 else (230,174,174))
 for y in range(20,height,pitch):draw.line((20,y,width-20,y),fill=(246,211,211) if y%40 else (230,174,174))
 font=ImageFont.truetype(FONTS[seed%len(FONTS)],int(rng.integers(22,30)))
 draw.text((60,35),'PUBLIC RESEARCH ECG | 25 mm/s | 10 mm/mV',font=font,fill=(25,25,25))
 top=int(rng.integers(140,310));left=60;cellw=(width-120)/len(grid[0]);cellh=(height-top-70)/len(grid)
 path=row['filename_lr'];h=(SOURCE/(path+'.hea')).read_text().splitlines();n=int(h[0].split()[3]);raw=np.fromfile(SOURCE/(path+'.dat'),dtype='<i2').reshape(n,12)
 labels=[]
 for ri,leads in enumerate(grid):
  for ci,lead in enumerate(leads):
   x=int(left+ci*cellw);y=int(top+ri*cellh);draw.text((x+8,y+8),lead,font=font,fill=(15,15,15));bbox=draw.textbbox((x+8,y+8),lead,font=font);labels.append({'lead':lead,'bbox':bbox})
   li=LEADS.index(lead);gain=float(h[li+1].split()[2].split('(')[0]);signal=raw[100:350,li]/gain;signal-=np.median(signal);count=int(cellw-36);xx=np.arange(count)+x+18;scale=min(35,(cellh*.3)/max(.1,np.abs(signal).max()));yy=y+cellh*.55-np.interp(np.linspace(0,1,count),np.linspace(0,1,len(signal)),signal)*scale
   draw.line(list(zip(xx,yy)),fill=(45,45,45),width=2)
 if seed%3==0:image=image.filter(ImageFilter.GaussianBlur(.45))
 if seed%4==0:
  a=np.asarray(image).astype(float);shade=np.linspace(.65,1,width)[None,:,None];image=Image.fromarray(np.clip(a*shade,0,255).astype('uint8'))
 return image,labels,layout

def normalize(s):
 s=s.strip().replace('|','I').replace('l','I').replace('!','I').replace('v','V').replace(' ','')
 return next((l for l in LEADS if l.upper()==s.upper()),None)

def run(image,expected,psm,preprocess):
 if preprocess=='max-rgb':
  a=np.asarray(image);image=ImageOps.autocontrast(Image.fromarray(a.max(axis=2)))
 data=io.BytesIO();image.save(data,format='PNG')
 cmd=['tesseract','stdin','stdout','-l','eng','--psm',str(psm),'tsv'];r=subprocess.run(cmd,input=data.getvalue(),capture_output=True,check=True,env={'PATH':'/usr/bin:/bin','OMP_THREAD_LIMIT':'1'})
 detections=[]
 for item in csv.DictReader(io.StringIO(r.stdout.decode()),delimiter='\t'):
  lead=normalize(item.get('text',''))
  if lead and float(item['conf'])>=15:
   detections.append({'lead':lead,'bbox':[int(item['left']),int(item['top']),int(item['left'])+int(item['width']),int(item['top'])+int(item['height'])],'confidence':float(item['conf'])})
 matched=set();correct=0
 for det in detections:
  box=det['bbox'];cx=(box[0]+box[2])/2;cy=(box[1]+box[3])/2
  for i,exp in enumerate(expected):
   e=exp['bbox'];ex=(e[0]+e[2])/2;ey=(e[1]+e[3])/2
   if i not in matched and det['lead']==exp['lead'] and abs(cx-ex)<45 and abs(cy-ey)<35:
    matched.add(i);correct+=1;break
 return {'true_positive':correct,'false_positive':len(detections)-correct,'false_negative':len(expected)-correct,'detections':detections}

def aggregate(rows):
 tp=sum(x['true_positive'] for x in rows);fp=sum(x['false_positive'] for x in rows);fn=sum(x['false_negative'] for x in rows)
 return {'sheets':len(rows),'tp':tp,'fp':fp,'fn':fn,'precision':tp/(tp+fp) if tp+fp else 0,'recall':tp/(tp+fn),'complete_sheets':sum(x['true_positive']==12 and x['false_positive']==0 for x in rows)}

def main():
 metadata=list(csv.DictReader((SOURCE/'ptbxl_database.csv').open()));selected=[];used=set()
 for split,folds,count in [('fit',range(1,8),192),('selection',[8],32),('test',[10],32)]:
  subset=[]
  for row in metadata:
   if int(row['strat_fold']) in folds and row['patient_id'] not in used:
    used.add(row['patient_id']);subset.append(dict(row,split=split))
    if len(subset)==count:break
  selected+=subset
 def fetch(r):
  for ext in ['hea','dat']:download(r['filename_lr']+'.'+ext,SOURCE/(r['filename_lr']+'.'+ext))
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:list(ex.map(fetch,selected))
 print('Downloaded',len(selected),'unique patient records',flush=True)
 manifest=[]
 for i,row in enumerate(selected):
  image,labels,layout=generate(row,20261111+i);file=ROOT/(row['ecg_id']+'.png');image.save(file);manifest.append({'ecg_id':row['ecg_id'],'patient_id':row['patient_id'],'split':row['split'],'layout':layout,'file':str(file),'labels':labels})
 (ROOT/'manifest.json').write_text(json.dumps(manifest))
 configs=[(11,'raw'),(11,'max-rgb'),(6,'max-rgb')];fit=[r for r in manifest if r['split']=='fit'][:16];selection=[r for r in manifest if r['split']=='selection'][:8];test=[r for r in manifest if r['split']=='test']
 config_results=[]
 def evaluate(rows,config):
  def one(row):
   with Image.open(row['file']) as image:result=run(image,row['labels'],*config)
   return dict(result,ecg_id=row['ecg_id'],layout=row['layout'])
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:return list(ex.map(one,rows))
 for config in configs:
  a=evaluate(fit,config);b=evaluate(selection,config);config_results.append({'config':config,'fit':aggregate(a),'selection':aggregate(b)});print(config,config_results[-1],flush=True)
 def f1(r):
  p=r['selection']['precision'];q=r['selection']['recall'];return 2*p*q/max(1e-9,p+q)
 best=max(config_results,key=f1);locked=evaluate(test,tuple(best['config']))
 report={'source':'PTB-XL1.0.3 CC BY4.0','source_url':'https://physionet.org/content/ptb-xl/1.0.3/','seed':20261111,'records':[{k:r[k] for k in ['ecg_id','patient_id','strat_fold','split']} for r in selected],'sheets_generated':len(manifest),'configuration_evaluation':config_results,'selected_config':best['config'],'test':aggregate(locked),'test_rows':locked,'waveform_sha256':{r['filename_lr']:hashlib.sha256((SOURCE/(r['filename_lr']+'.dat')).read_bytes()).hexdigest() for r in selected},'metadata_sha256':hashlib.sha256((SOURCE/'ptbxl_database.csv').read_bytes()).hexdigest(),'license_sha256':hashlib.sha256((SOURCE/'LICENSE.txt').read_bytes()).hexdigest(),'ocr_version':subprocess.run(['tesseract','--version'],capture_output=True,text=True).stdout.splitlines()[0],'scope':'Configuration calibration of pretrained OCR; no new neural weights trained. Generated full sheets from clinical waveform records, not clinical photographs.'}
 (OUT/'report.json').write_text(json.dumps(report,indent=2));print('TEST',report['test'],flush=True)
if __name__=='__main__':main()
