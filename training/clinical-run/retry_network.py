"""Bounded recovery probes; resume the same frozen IDs, never redraw a cohort."""
from pathlib import Path
import json,subprocess,time,datetime,os
PYTHON='/workspace/training-venv/bin/python';report=[]
for attempt in range(4):
 r=subprocess.run(['curl','-fsSL','--max-time','12','https://physionet.org/files/ludb/1.0.1/data/2.hea'],capture_output=True)
 entry={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attempt':attempt+1,'returncode':r.returncode,'error':r.stderr.decode()[-300:]};report.append(entry);Path('training/clinical-run/recovery-probes.json').write_text(json.dumps(report,indent=2));print('recovery probe',entry,flush=True)
 if r.returncode==0:
  downloaded=subprocess.run([PYTHON,'training/clinical-run/download_data.py'])
  if downloaded.returncode==0:
   env=os.environ.copy();env.update(OPENBLAS_NUM_THREADS='2',OMP_NUM_THREADS='2')
   subprocess.run([PYTHON,'training/clinical-run/diagnosis.py'],env=env);subprocess.run([PYTHON,'training/clinical-run/delineation.py'],env=env);break
 if attempt<3:time.sleep(45)
