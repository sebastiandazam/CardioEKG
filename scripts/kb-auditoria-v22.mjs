// YA APLICADO a src/ecg/knowledge/kb (v22). Se conserva como registro trazable de la auditoría clínica;
// no es idempotente: solo debe ejecutarse sobre la base original sin auditar.
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const kbs = Object.fromEntries(files.map(f => [f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const byId = {}; for (const kb of Object.values(kbs)) for (const e of kb.entities) byId[e.id] = e;
const log = [];
const T = (es, en) => ({ es, en });
const crit = (id, c) => byId[id].criteria.find(x => x.id === c);
const addExclusion = (id, cid, predicate, es, en, note) => {
  const e = byId[id]; if (!e || e.criteria.some(c => c.id === cid)) return;
  e.criteria.push({ id: cid, role: 'exclusion', text: T(es, en), predicate, note }); log.push(`${id}: exclusión ${cid}`);
};
const WIDE = { feature: 'qrsMs', op: '>=', value: 120 };
const RBBB = { all: [WIDE, { any: [{ feature: 'lead.V1.rPrime', op: '==', value: true }, { feature: 'lead.V2.rPrime', op: '==', value: true }] }] };
const PACED = { context: 'paced', op: '==', value: 'yes' };
const PREEXCITED = { all: [{ feature: 'prMs', op: '<', value: 120 }, { countLeads: ['I', 'II', 'aVL', 'V4', 'V5', 'V6'], where: { field: 'deltaSlurMs', op: '>=', value: 30 }, op: '>=', value: 2 }] };

// 1. Groups: alternative criteria sets for the same finding are shown once (best supported).
for (const [group, ids] of Object.entries({
  'atrial-fibrillation': ['atrial-fibrillation', 'atrial-fibrillation-rvr', 'atrial-fibrillation-slow-response'],
  lbbb: ['lbbb-complete-aha', 'lbbb-strauss'],
  'bifascicular-block': ['bifascicular-rbbb-lafb', 'bifascicular-rbbb-lpfb'],
  'qt-prolongation': ['long-qt-congenital', 'drug-induced-qt-prolongation'],
  'stemi-anterior': ['anterior-stemi', 'subtle-anterior-stemi-smith'],
  'brugada': ['brugada-type1', 'brugada-type2'],
  'digoxin': ['digoxin-effect', 'digoxin-toxicity'],
  'ischemic-st-t': ['nste-ischemia', 'ischemic-t-inversion', 'nonspecific-st-t-changes'],
})) for (const id of ids) if (byId[id] && byId[id].group !== group) { byId[id].group = group; log.push(`${id}: grupo ${group}`); }

// 2. PE: ECG signs are nonspecific (ESC 2019). Require ≥ 2 independent signs, T inversion ≥ 0.1 mV in V2–V4
//    with a narrow QRS (T inversion in V1 is normal and secondary T changes accompany RBBB), and never with LBBB/paced.
{
  const pe = byId['acute-pe-rv-strain'];
  pe.requiredLogic = 'atLeast:2';
  const twi = crit('acute-pe-rv-strain', 'pe-twi');
  twi.predicate = { all: [{ countLeads: ['V2', 'V3', 'V4'], where: { field: 'tMv', op: '<=', value: -0.1 }, op: '>=', value: 2 }, { feature: 'qrsMs', op: '<', value: 120 }] };
  twi.text = T('T negativa ≥ 0,1 mV en ≥ 2 de V2–V4 con QRS < 120 ms', 'T inversion ≥ 0.1 mV in ≥ 2 of V2–V4 with QRS < 120 ms');
  twi.note += ' Auditoría v22: se exige ≥ 0,1 mV, se omite V1 (T negativa normal en V1) y QRS estrecho (con BRD la T negativa en V1–V3 es secundaria).';
  for (const c of pe.criteria) if (c.predicate && JSON.stringify(c.predicate).includes('"tMv","op":"<","value":0')) c.predicate = JSON.parse(JSON.stringify(c.predicate).replaceAll('"tMv","op":"<","value":0', '"tMv","op":"<=","value":-0.1'));
  crit('acute-pe-rv-strain', 'pe-s1q3t3').predicate.all[2] = { feature: 'lead.III.tMv', op: '<=', value: -0.1 };
  addExclusion('acute-pe-rv-strain', 'pe-excl-lbbb-paced', { any: [PACED, { all: [WIDE, { feature: 'lead.V1.rPrime', op: '==', value: false }, { feature: 'lead.V2.rPrime', op: '==', value: false }] }] },
    'BRI, otro trastorno de conducción con QRS ancho sin rSR′ o marcapasos (los signos de repolarización no son valorables)', 'LBBB, other wide QRS without rSR′, or pacing (repolarisation signs not assessable)',
    'Auditoría v22: con QRS ancho no derecho las alteraciones ST-T son secundarias.');
  pe.limitations = { es: (pe.limitations?.es ?? '') + ' Los signos ECG del TEP son inespecíficos y poco sensibles: un ECG compatible solo orienta; el diagnóstico exige probabilidad clínica, dímero D o angio-TC (ESC 2019).', en: (pe.limitations?.en ?? '') + ' ECG signs of PE are nonspecific and insensitive: a compatible ECG only orients; diagnosis requires clinical probability, D-dimer or CT angiography (ESC 2019).' };
  log.push('acute-pe-rv-strain: atLeast:2, T ≥ 0,1 mV en V2–V4 con QRS estrecho, excluye BRI/marcapasos');
}

// 3. RVH: AHA 2009 part V — voltage criteria lose accuracy with RBBB; not diagnosed with LBBB, pre-excitation, pacing.
addExclusion('right-ventricular-hypertrophy', 'rvh-excl-bbb', { any: [RBBB, PACED, PREEXCITED, { all: [WIDE, { feature: 'lead.V1.rPrime', op: '==', value: false }] }] },
  'QRS ≥ 120 ms (BRD/BRI), preexcitación o marcapasos: los criterios de voltaje de HVD no son aplicables', 'QRS ≥ 120 ms (RBBB/LBBB), pre-excitation or pacing: RVH voltage criteria not applicable',
  'Hancock 2009 (AHA parte V): los criterios de HVD pierden exactitud con BRD; no se aplican con BRI ni marcapasos. Auditoría v22.');
addExclusion('bifascicular-rbbb-lpfb', 'bif-p-excl-rvh-context', { any: [{ context: 'history', op: 'contains', value: 'copd' }, { context: 'history', op: 'contains', value: 'pulmonary-hypertension' }] },
  'EPOC o hipertensión pulmonar conocidas (el eje derecho se explica sin bloqueo fascicular)', 'Known COPD or pulmonary hypertension (right axis explained without fascicular block)',
  'AHA 2009 parte III: el HFPI exige descartar otras causas de eje derecho (HVD, enfisema, infarto lateral). Auditoría v22.');

// 4. LVH voltage: not interpretable with QRS ≥ 120 ms (LBBB), pre-excitation or pacing.
for (const id of ['lvh-sokolow-lyon', 'lvh-cornell', 'lvh-cornell-product', 'lvh-peguero', 'lvh-romhilt-estes', 'lvh-strain', 'hypertrophic-cardiomyopathy'])
  addExclusion(id, 'lvh-excl-wide', { any: [{ all: [WIDE, { feature: 'lead.V1.rPrime', op: '==', value: false }, { feature: 'lead.V2.rPrime', op: '==', value: false }] }, PACED, PREEXCITED] },
    'BRI u otro QRS ≥ 120 ms sin rSR′, preexcitación o marcapasos: voltaje y ST-T no valorables para HVI', 'LBBB or other QRS ≥ 120 ms without rSR′, pre-excitation or pacing: voltage and ST-T not valid for LVH',
    'Hancock 2009 (AHA parte V): con BRI los criterios de HVI no son fiables y las alteraciones ST-T son secundarias. Auditoría v22.');

// 5. Q waves and ST: secondary with LBBB/pre-excitation/pacing (ST in LBBB → Sgarbossa entities).
addExclusion('old-mi-q-waves', 'q-excl-preexc-paced', { any: [PACED, PREEXCITED] }, 'Preexcitación o marcapasos (seudo-ondas Q)', 'Pre-excitation or pacing (pseudo-Q waves)', 'Thygesen 2018 (4.ª DUIM): las ondas Q no son valorables con preexcitación ni estimulación. Auditoría v22.');
for (const id of ['anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'subtle-anterior-stemi-smith', 'de-winter-pattern', 'wellens-pattern', 'early-repolarization', 'acute-pericarditis', 'nste-ischemia', 'ischemic-t-inversion', 'nonspecific-st-t-changes', 'left-main-multivessel'])
  addExclusion(id, 'st-excl-lbbb-paced', { any: [PACED, PREEXCITED, { all: [WIDE, { feature: 'lead.V1.rPrime', op: '==', value: false }, { feature: 'lead.V2.rPrime', op: '==', value: false }] }] },
    'BRI, marcapasos o preexcitación: ST-T secundario (usar criterios de Sgarbossa)', 'LBBB, pacing or pre-excitation: secondary ST-T (use Sgarbossa criteria)', 'Thygesen 2018 y Sgarbossa 1996. Auditoría v22.');
// QTc with QRS ≥ 120 ms overestimates repolarisation.
for (const id of ['long-qt-congenital', 'drug-induced-qt-prolongation'])
  if (byId[id]) { byId[id].limitations = { es: (byId[id].limitations?.es ?? '') + ' Con QRS ≥ 120 ms el QTc sobrestima la repolarización (valorar JT o QT ajustado al QRS).', en: (byId[id].limitations?.en ?? '') + ' With QRS ≥ 120 ms QTc overestimates repolarisation (consider JT or QRS-adjusted QT).' }; }

// 6. Hyperkalaemia: the ECG is insensitive and nonspecific — require the laboratory context plus ≥ 1 ECG sign.
{
  const k = byId.hyperkalemia;
  k.requiredLogic = 'all';
  const conduction = crit('hyperkalemia', 'ecg-conduction-pattern');
  conduction.id = 'ecg-any-sign';
  conduction.text = T('Al menos un signo ECG: T alta y picuda en V2–V4, QRS > 110 ms, PR > 200 ms o FC < 50/min', 'At least one ECG sign: tall peaked T in V2–V4, QRS > 110 ms, PR > 200 ms or HR < 50/min');
  conduction.predicate = { any: [crit('hyperkalemia', 'tall-t-precordial').predicate, { feature: 'qrsMs', op: '>', value: 110 }, { feature: 'prMs', op: '>', value: 200 }, { feature: 'rateBpm', op: '<', value: 50 }] };
  conduction.note = (conduction.note ?? '') + ' Auditoría v22: la hiperpotasemia se confirma por laboratorio; el ECG aislado no la diagnostica (sensibilidad baja). Se exige K⁺ alto informado y ≥ 1 signo ECG.';
  log.push('hyperkalemia: requiere K⁺ alto + ≥ 1 signo ECG');
}

// 7. Remove prognostic or derived 1.0 performance figures (kept only diagnostic sens/spec/LR from the source).
for (const e of Object.values(byId)) for (const c of e.criteria) for (const key of ['sensitivity', 'specificity'])
  if (c[key] === 1 || c[key] === 0) { log.push(`${e.id}/${c.id}: retirado ${key}=${c[key]} (muestra extrema)`); delete c[key]; delete c.lrPositive; delete c.lrNegative; }

// 7b. Bifascicular RBBB + LPFB: AHA 2009 part III requires rS in I/aVL and qR in III/aVF, not the axis alone.
for (const c of byId['bifascicular-rbbb-lpfb'].criteria) if (['bif-p-rs', 'bif-p-qr'].includes(c.id) && c.role !== 'required') { c.role = 'required'; log.push(`bifascicular-rbbb-lpfb/${c.id}: requerido (AHA 2009)`); }

// 7c. Q in V2–V3 (4th UDMI: any Q ≥ 20 ms). Measurement guard: a q shallower than 0.05 mV (half a small square) is below
//     what a digitised paper tracing resolves reliably, so it is not counted (resolution limit, not a literature threshold).
{
  const c = crit('old-mi-q-waves', 'q-v2v3');
  c.predicate = JSON.parse(JSON.stringify(c.predicate).replace(/\{"feature":"lead\.(V[23])\.qMs","op":">","value":20\}/g, '{"all":[{"feature":"lead.$1.qMs","op":">","value":20},{"feature":"lead.$1.qMv","op":"<=","value":-0.05}]}'));
  c.note = (c.note ?? '') + ' Auditoría v22: se exige además |q| ≥ 0,05 mV como límite de resolución de la digitalización (no es un umbral de la DUIM).';
  log.push('old-mi-q-waves/q-v2v3: |q| ≥ 0,05 mV (resolución)');
}

// 8. Mimics: remap ids to existing entities; the rest are clinical conditions kept in a glossary (index.ts).
const remap = { 'long-qt-acquired': 'drug-induced-qt-prolongation', 'frequent-pacs-pvcs-bigeminy': 'premature-ventricular-complexes', 'accelerated-idioventricular-rhythm': 'ventricular-escape-rhythm', 'trifascicular-pattern': 'bifascicular-rbbb-lafb' };
for (const e of Object.values(byId)) if (e.mimics) {
  const next = [...new Set(e.mimics.map(m => remap[m] ?? m))].filter(m => m !== e.id);
  if (JSON.stringify(next) !== JSON.stringify(e.mimics)) { e.mimics = next; log.push(`${e.id}: mimics remapeados`); }
}

for (const [f, kb] of Object.entries(kbs)) fs.writeFileSync(path.join(dir, f), JSON.stringify(kb, null, 2) + '\n');
console.log(log.length + ' cambios'); console.log(log.join('\n'));
