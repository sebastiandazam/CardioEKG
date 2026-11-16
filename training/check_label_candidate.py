"""Check rounded-weight parity on label crops and probe background rejection."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from train_lead_labels import features,LABELS
p=Path('training/lead-label-results');candidate=json.loads((p/'candidate.json').read_text());report=json.loads((p/'report.json').read_text());manifest=json.loads(Path('data/sheet-ocr/manifest.json').read_text());w=[np.array(x) for x in candidate['weights']];b=[np.array(x) for x in candidate['bias']]
def infer(x):
 z=np.maximum(0,x@w[0]+b[0])@w[1]+b[1];z-=z.max();v=np.exp(z);return v/v.sum()
lookup={(r['record'],r['expected']):r for r in report['test_rows']};maxdifference=0;background=[];correct=0
for row in manifest:
 if row['split']!='test':continue
 with Image.open(row['file']) as image:
  for label in row['labels']:
   probability=infer(features(image,label['bbox']));ref=lookup[(row['ecg_id'],label['lead'])];maxdifference=max(maxdifference,abs(float(probability.max())-ref['confidence']));correct+=LABELS[int(probability.argmax())]==label['lead']
  for box in [(20,100,70,125),(image.width//2,100,image.width//2+50,125),(80,image.height-40,140,image.height-15),(image.width-100,image.height-60,image.width-40,image.height-35)]:
   probability=infer(features(image,box));background.append(float(probability.max()))
result={'rounded_weights_test_correct':correct,'rounded_weights_max_confidence_difference':maxdifference,'background_probe_crops':len(background),'background_false_accepts_at_locked_threshold':sum(x>=candidate['confidence_threshold'] for x in background),'background_scope':'unlabelled paper/grid crops from heldout sheets, not a new threshold selection set; no unknown class was fitted'}
(p/'export-check.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
