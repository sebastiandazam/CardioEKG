"""Local QA fixture; user screenshot stays ignored and is never a training input."""
import argparse,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--screenshot',type=Path);a=p.parse_args()
root=Path('data/paper-region');root.mkdir(parents=True,exist_ok=True)
im=Image.new('RGB',(600,1050),'black');d=ImageDraw.Draw(im);d.rectangle((30,470,570,910),fill='white')
for x in range(35,570,6):d.line((x,475,x,905),fill=(248,213,213))
for y in range(475,910,6):d.line((35,y,565,y),fill=(248,213,213))
for row,y in enumerate([560,650,740,830]):
 cols=4 if row<3 else 1
 for col in range(cols):
  start=45+col*(510//cols);end=45+(col+1)*(510//cols)-8
  points=[]
  for x in range(start,end):
   phase=(x-start)%35;points.append((x,y-15*max(0,1-abs(phase-12)/3)+3*np.sin(x/8)))
  d.line(points,fill=(20,20,20),width=2)
im=im.convert('RGBA');im.save(root/'synthetic.png');(root/'synthetic.rgba').write_bytes(np.array(im).tobytes())
manifest=[{'name':'synthetic-black-padding','file':str((root/'synthetic.rgba').resolve()),'width':600,'height':1050,'paper':{'left':5,'right':95,'top':470/1050*100,'bottom':910/1050*100},'expected_trace_rows':[560,650,740,830]}]
blank=Image.new('RGB',(600,1050),'black');draw=ImageDraw.Draw(blank);draw.rectangle((30,470,570,910),fill='white')
for x in range(35,570,6):draw.line((x,475,x,905),fill=(248,213,213))
for y in range(475,910,6):draw.line((35,y,565,y),fill=(248,213,213))
blank=blank.convert('RGBA');blank.save(root/'blank-paper.png');(root/'blank-paper.rgba').write_bytes(np.array(blank).tobytes())
manifest.append(dict(manifest[0],name='blank-paper-black-padding',file=str((root/'blank-paper.rgba').resolve()),expected_trace_rows=[]))
if a.screenshot:
 im=Image.open(a.screenshot).convert('RGBA').crop((43,270,563,1194));im.save(root/'user-roi.png');(root/'user-roi.rgba').write_bytes(np.array(im).tobytes())
 manifest.append({'name':'user-screenshot-roi','file':str((root/'user-roi.rgba').resolve()),'width':520,'height':924,'roi_in_screenshot':{'x':43,'y':270,'width':520,'height':924},'paper':{'left':0,'right':100,'top':393/924*100,'bottom':740/924*100},'expected_trace_rows':[437,523,609,694]})
(root/'manifest.json').write_text(json.dumps(manifest))
