#!/usr/bin/env python3
"""Cache public Wave-Maven annotations privately; emit only derived review metadata.

Uses the ordinary optional-fields-blank Continue route, never credentials. Two
workers maximum. Images/PDFs are inventoried from links, not mass-downloaded.
Answer material never enters an inference dataset or the app's model input.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
import html
from html.parser import HTMLParser
import http.cookiejar
import json
from pathlib import Path
import re
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://ecg.bidmc.harvard.edu/'
INDEX = BASE + 'maven/displist.asp?ans=1'
LOCAL = threading.local()
CATEGORIES = {
    'ischemia_infarction': r'infarct|ischemi|ischaemi|STEMI|coronary|angina|\bMIs?\b|\bCAD\b',
    'atrial_supraventricular_rhythm': r'atrial|flutter|fibrillation|supraventricular|AV nodal|AVNRT|AVRT|junctional|wandering|sinus|\bAF\b|\bPSVT\b|\bMAT\b|\bAPC\b|Ashman',
    'av_conduction_block': r'AV block|heart block|AV heart block|Wenckebach|atrioventricular|Mobitz|\bCHB\b|SA block|AV dissociation',
    'intraventricular_conduction': r'bundle|fascicul|bifascicul|trifascicul|aberrant|\bLBBB\b|\bRBBB\b',
    'ventricular_arrhythmia_ectopy': r'ventricular (?:tachy|fibrill|bigemin|trigemin|ectop|premature)|PVC|torsade|premature ventricular|accelerated idioventricular|\bVT\b|\bAIVR\b',
    'electrolyte_metabolic': r'kalemia|kalaemia|calcemia|calcaemia|electrolyte|renal|hypotherm|hypertherm|hyperthy|hypothy',
    'qt_channelopathy': r'\bQT\b|QTc|LQTS|LTQS|Brugada|repolarization',
    'preexcitation': r'Wolff|Parkinson|WPW|pre.?excitation',
    'structural_hypertrophy_valvular': r'hypertroph|cardiomyopath|stenosis|valv|\bLVH\b|\bRVH\b|amyloid|infiltrative|enlargement|heart disease|aneurysm|\bHCM\b|Takotsubo|Yamaguchi|dysplasia|Ebstein|Transposition|mitral|aortic|ventricular overload',
    'pulmonary_right_heart': r'pulmonary|cor pulmonale|obstructive|emphysema|\bPE\b|\bPAH\b|\bCOPD\b|pneumothorax|bronchitis|asthma',
    'pericardial': r'pericard|tamponade|effusion',
    'drug_toxicity': r'digitalis|digoxin|drug|toxici|overdose|tricyclic|quinidine|amiodarone|dofetilide',
    'pacing_device': r'pacemak|pacing|paced|ICD|defibrillator|fusion beat',
    'st_t_morphology': r'T.wave (?:inversion|pattern|syndrome)|LAD.T wave|repolarization',
    'systemic_neurological_association': r'Lyme|pancreatitis|anasarca|CVA|subarachnoid|neurogenic|Duchenne|scleroderma',
    'clinical_exam_association': r'splitting of S2|Loud S2',
    'technical_anatomic_variant': r'artifact|artefact|reversal|misplacement|dextrocardia|lead placement|lead switch|normal ECG|normal variant|^Normal$|reversed chest leads',
}
THEMES = {
    'clinical_history_dependency': r'history|symptom|medication|clinical context|chest pain|syncope',
    'serial_or_comparison_tracings': r'serial|previous ECG|prior ECG|repeat ECG|follow.up ECG|subsequent ECG',
    'medication_or_toxicity': r'medication|drug|digoxin|digitalis|toxici|overdose',
    'electrolyte_or_metabolic_context': r'potassium|calcium|electrolyte|renal|hypotherm',
    'manual_confirmation_or_differential': r'differential|distinguish|mimic|confirm|measure|measurement',
}

def utc():
    return datetime.now(timezone.utc).isoformat()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def clean(value):
    value = re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>', '', value, flags=re.I|re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value))).strip()

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.current = None
    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if tag == 'a' and attr.get('href'):
            self.current = [attr['href'], []]
    def handle_data(self, data):
        if self.current is not None: self.current[1].append(data)
    def handle_endtag(self, tag):
        if tag == 'a' and self.current is not None:
            self.links.append((self.current[0], clean(' '.join(self.current[1])))); self.current = None

def opener():
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [('User-Agent', 'CardioEKG educational source review (public annotations; max 2 concurrent requests)')]
    return op

def request(op, url):
    with op.open(url, timeout=40) as response:
        final = response.geturl()
        if urllib.parse.urlsplit(final).hostname != 'ecg.bidmc.harvard.edu':
            raise ValueError('unexpected source host')
        return response.read(), {'requested_url': url, 'final_url': final, 'http_status': response.status,
                                 'retrieved_at': utc(), 'content_type': response.headers.get('Content-Type'),
                                 'last_modified': response.headers.get('Last-Modified')}

def bootstrap(op):
    request(op, BASE + 'maven/welcome.asp?ref=displist.asp?ans=1')
    return request(op, BASE + 'maven/stats.asp?' + urllib.parse.urlencode(
        {'ref':'displist.asp?ans=1', 'training':'', 'goal':'', 'email':''}))

def worker_opener():
    if not hasattr(LOCAL, 'op'):
        LOCAL.op = opener(); bootstrap(LOCAL.op)
    return LOCAL.op

def parse_index(raw):
    parser = Links(); parser.feed(raw.decode('latin1')); cases = {}
    for href, value in parser.links:
        url = urllib.parse.urljoin(INDEX, href)
        if urllib.parse.urlsplit(url).path != '/maven/dispcase.asp': continue
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        if 'caseid' not in query: continue
        cid = int(query['caseid'][0]); row = int(query.get('rownum', ['0'])[0])
        entry = cases.setdefault(cid, {'case_id':cid, 'row':row, 'texts':[], 'source_url':
            BASE+'maven/dispcase.asp?'+urllib.parse.urlencode({'caseid':cid,'rownum':row,'ans':1})})
        if value and not re.fullmatch(r'\d+:?', value): entry['texts'].append(value)
    for c in cases.values():
        c['catalog_context'] = c['texts'][0] if c['texts'] else ''
        c['catalog_diagnosis'] = ' / '.join(dict.fromkeys(c['texts'][1:]))
        del c['texts']
    if len(cases) < 100: raise ValueError('public case index unavailable; refusing fabricated coverage')
    return sorted(cases.values(), key=lambda c:c['case_id'])

def field(markup, name):
    match = re.search(r'<td\b[^>]*>\s*'+name+r':\s*</td>\s*<td\b[^>]*>(.*?)</td>', markup, re.I|re.S)
    value = match[1] if match else ''
    value = re.sub(r'<font\b[^>]*class\s*=\s*[\"\']?diff\b.*?</font>', '', value, flags=re.I|re.S)
    return clean(value).rstrip(' ;\xa0')

def parse_case(raw, case):
    markup = raw.decode('latin1'); cid = case['case_id']
    if not re.search(r'Display Case\s*:?\s*'+str(cid)+r'\b', clean(markup), re.I):
        raise ValueError('case identity not found (possible access redirect)')
    question, answer = field(markup, 'Question'), field(markup, 'Answer')
    assets = {}
    for path in re.findall(r'(/mavendata/[^\s\"\'<>\)]+)', html.unescape(markup), flags=re.I):
        path = path.rstrip(';'); url = urllib.parse.urljoin(BASE, path)
        ext = Path(urllib.parse.urlsplit(url).path).suffix.lower()
        if ext not in {'.pdf','.gif','.png','.jpg','.jpeg'}: continue
        assets[url] = {'url':url, 'extension':ext, 'availability_verified':False,
                       'metadata_source':'case_html', 'downloaded_by_review':False}
    for tag in re.findall(r'<img\b[^>]*>', markup, re.I|re.S):
        src = re.search(r'\bsrc\s*=\s*[\"\']?([^\s\"\'>]+)', tag, re.I)
        if not src: continue
        asset = assets.get(urllib.parse.urljoin(BASE, html.unescape(src[1])))
        if asset:
            for dimension in ('width','height'):
                match = re.search(r'\b'+dimension+r'\s*=\s*[\"\']?(\d+)',tag,re.I)
                if match: asset['html_display_'+dimension] = int(match[1])
    return {'case_id':cid,'history_question':question,'answer_explanation':answer,
            'catalog_context':case['catalog_context'],'reference_diagnosis':case['catalog_diagnosis'],
            'assets':list(assets.values()), 'source_url':case['source_url']}

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix+'.tmp'); temp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n'); temp.replace(path)

def review_case(case, cache, refresh):
    cid = case['case_id']; raw_path = cache/'html'/f'case-{cid}.html'; meta_path = cache/'http'/f'case-{cid}.json'
    cached = raw_path.exists() and meta_path.exists() and not refresh
    try:
        if cached:
            raw = raw_path.read_bytes(); meta = json.loads(meta_path.read_text())
            if digest(raw) != meta['sha256']: raise ValueError('cache hash mismatch')
        else:
            error = None
            for attempt in range(3):
                try:
                    raw, meta = request(worker_opener(), case['source_url']); error = None; break
                except Exception as exc:
                    error = exc
                    if attempt < 2: time.sleep(attempt+1)
            if error is not None: raise error
            parse_case(raw, case)
            meta.update({'sha256':digest(raw),'bytes':len(raw),'case_id':cid})
            raw_path.parent.mkdir(parents=True,exist_ok=True); raw_path.write_bytes(raw); atomic_json(meta_path,meta)
            time.sleep(.2)
        parsed = parse_case(raw, case); atomic_json(cache/'annotations'/f'case-{cid}.json',parsed)
        label = parsed['reference_diagnosis']
        record = {**meta,'source_url':case['source_url'],'cache_reused':cached,'status':'ok',
                  'history_present':bool(parsed['history_question']),'explanation_present':bool(parsed['answer_explanation']),
                  'history_characters':len(parsed['history_question']),'explanation_characters':len(parsed['answer_explanation']),
                  'categories':[k for k,v in CATEGORIES.items() if re.search(v,label,re.I)],
                  'annotation_themes':[k for k,v in THEMES.items() if re.search(v,parsed['history_question']+' '+parsed['answer_explanation'],re.I)],
                  'assets':parsed['assets']}
        if not record['categories']: record['categories']=['unmatched_catalog_label']
        return record
    except Exception as exc:
        return {'case_id':cid,'source_url':case['source_url'],'status':'failed','checked_at':utc(),
                'error':type(exc).__name__+': '+str(exc)}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cache',type=Path,default=ROOT/'artifacts/wave-maven-review')
    p.add_argument('--output',type=Path,default=Path(__file__).parent/'coverage.json')
    p.add_argument('--workers',type=int,choices=[1,2],default=2)
    p.add_argument('--refresh',action='store_true'); args=p.parse_args()
    cache=args.cache.resolve()
    if ROOT/'public' in cache.parents or cache == ROOT/'public': raise ValueError('research cache must not be public')
    cache.mkdir(parents=True,exist_ok=True)
    index_path=cache/'index.html'; index_meta_path=cache/'index-http.json'
    if index_path.exists() and index_meta_path.exists() and not args.refresh:
        raw=index_path.read_bytes(); meta=json.loads(index_meta_path.read_text())
        if digest(raw)!=meta['sha256']: raise ValueError('index cache hash mismatch')
    else:
        raw,meta=bootstrap(opener()); meta.update({'entry_url':INDEX,'sha256':digest(raw),'bytes':len(raw)})
        index_path.write_bytes(raw); atomic_json(index_meta_path,meta)
    cases=parse_index(raw); atomic_json(cache/'catalog.json',cases)
    old=json.loads((ROOT/'public/wave-maven/catalog.json').read_text())['cases']
    old_ids={c['caseId'] for c in old}; ids={c['case_id'] for c in cases}
    print(f'Index: {len(cases)} unique cases; existing catalog {len(old)}; workers {args.workers}',flush=True)
    records=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(review_case,c,cache,args.refresh) for c in cases]
        for future in concurrent.futures.as_completed(futures):
            records.append(future.result())
            if len(records)%25==0 or len(records)==len(cases):
                atomic_json(cache/'progress.json',{'completed':len(records),'total':len(cases),'failures':[r['case_id'] for r in records if r['status']=='failed']})
                print(f'Reviewed {len(records)}/{len(cases)}; failures {sum(r["status"]=="failed" for r in records)}',flush=True)
    records.sort(key=lambda r:r['case_id']); successful=[r for r in records if r['status']=='ok']
    categories={key:{'count':sum(key in r['categories'] for r in successful),
                       'case_ids':[r['case_id'] for r in successful if key in r['categories']]}
                for key in [*CATEGORIES,'unmatched_catalog_label']}
    themes={key:sum(key in r['annotation_themes'] for r in successful) for key in THEMES}
    manifest=json.loads((ROOT/'training/wave-maven/import-manifest.json').read_text())['records']
    inventory=[]
    for item in manifest:
        entry={'case_id':item['case_id']}
        for kind in ('pdf','image'):
            local=ROOT/item[kind]
            actual=digest(local.read_bytes()) if local.exists() else None
            entry[kind]={'path':item[kind],'exists':local.exists(),'sha256':actual,'matches_prior_manifest':actual==item[kind+'_sha256']}
        inventory.append(entry)
    report={'schema_version':1,'reviewed_at':utc(),'source_index':INDEX,'index':meta,
            'scope':'all unique case IDs linked by the public reference index; case annotations parsed, no image classifier training',
            'expected_cases':len(cases),'retrieved_cases':len(successful),'failed_cases':len(records)-len(successful),
            'history_present':sum(r['history_present'] for r in successful),'explanation_present':sum(r['explanation_present'] for r in successful),
            'catalog_comparison':{'existing_count':len(old),'added_ids':sorted(ids-old_ids),'removed_ids':sorted(old_ids-ids)},
            'asset_count':sum(len(r['assets']) for r in successful),
            'cases_with_pdf_links':sum(any(a['extension']=='.pdf' for a in r['assets']) for r in successful),
            'cases_with_image_links':sum(any(a['extension']!='.pdf' for a in r['assets']) for r in successful),
            'asset_metadata_limitation':'URLs, extensions and HTML display dimensions only; links not individually fetched or verified by this review',
            'existing_bundled_assets':{'cases':len(manifest),'case_ids':[r['case_id'] for r in manifest],
                                        'review_downloaded_new_images_or_pdfs':False,'inventory':inventory},
            'categories':categories,'category_method':'nonexclusive case-insensitive regex over reference catalog diagnosis, not expert morphology labels',
            'annotation_themes':themes,'theme_method':'literal phrase matching over full history/question and explanation; not clinical adjudication',
            'model_training_executed':False,'image_classifier_evaluation_executed':False,'expert_wave_boundary_labels_available':False,
            'patient_independence_verified':False,'reviewed_cases_eligible_as_unseen_test':False,
            'records':records}
    atomic_json(args.output,report)
    print(f'Coverage report: {args.output}; private annotations: {cache}/annotations; {len(successful)}/{len(cases)}',flush=True)

if __name__=='__main__': main()
