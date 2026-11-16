"""Physically calibrated test-only renderings; no model fitting on these patients."""
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
root=Path('data/trace-pilot');rows=json.loads((root/'js-fixtures.json').read_text())[::2];manifest=[]
rng=np.random.default_rng(44)
for index,row in enumerate(rows):
 signal=np.array(row['reference']);width=640;pitch=width/62.5;scale=pitch*10;height=int(max(220,np.max(np.abs(signal))*scale*2+40));zero=height/2
 yy=zero-np.interp(np.linspace(0,1,width),np.linspace(0,1,250),signal)*scale
 for kind in ['red','gray','shadow-blur','faint-shadow','strong-shadow']:
  image=Image.new('RGB',(width,height),'white');draw=ImageDraw.Draw(image);color=(235,160,160) if kind!='gray' else (190,190,190)
  for x in np.arange(0,width,pitch):draw.line((x,0,x,height),fill=color)
  for y in np.arange(0,height,pitch):draw.line((0,y,width,y),fill=color)
  draw.line(list(zip(range(width),yy)),fill=(140,140,140) if kind=='faint-shadow' else (35,35,35),width=2)
  if kind in ['shadow-blur','faint-shadow','strong-shadow']:
   image=image.filter(ImageFilter.GaussianBlur(.6));a=np.asarray(image).astype(float);light=np.linspace(.18 if kind=='strong-shadow' else .42,1,width)[None,:,None];a=a*light+rng.normal(0,2,(height,width,1));image=Image.fromarray(np.clip(a,0,255).astype('uint8'))
  path=root/f'physical-{index}-{kind}.rgba';path.write_bytes(np.asarray(image.convert('RGBA')).tobytes())
  manifest.append(dict(row,file=str(path.resolve()),width=width,height=height,heightMm=height/pitch,zero=zero,scale=scale,kind=kind))
(root/'physical-fixtures.json').write_text(json.dumps(manifest));print(len(manifest),'fixtures')
