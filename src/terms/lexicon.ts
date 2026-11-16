import { getEvidence, type EvidenceLanguage } from '../evidence.ts'

type Entry = ReturnType<typeof getEvidence>['glossary'][number]
type SupplementalEntry = Entry & { aliases?: string[] }
export type TermSegment = { text: string; entry?: Entry }

const aliases: Record<EvidenceLanguage, Record<string, string[]>> = {
  es: {
    'Electrocardiograma (ECG)': ['electrocardiograma', 'electrocardiogramas', 'ECG', 'EKG'],
    'Derivación': ['derivaciones de miembros', 'derivaciones de las extremidades', 'derivaciones precordiales'],
    'Nodo sinusal': ['nódulo sinusal', 'nodo sinoauricular'],
    'Nodo auriculoventricular': ['nodo AV', 'nódulo auriculoventricular'],
    'Onda P': ['ondas P'],
    'Complejo QRS': ['complejos QRS', 'duración del QRS'],
    'Onda T': ['ondas T'],
    'Intervalo RR': ['intervalos RR'],
    'Eje eléctrico frontal': ['eje frontal', 'eje del QRS', 'eje frontal del QRS', 'eje eléctrico del QRS'],
    'Artefacto': ['artefactos'],
  },
  en: {
    'Electrocardiogram (ECG)': ['electrocardiogram', 'electrocardiograms', 'ECG', 'ECGs', 'EKG', '12-lead ECG'],
    'Lead': ['limb leads', 'precordial leads'],
    'Sinoatrial (SA) node': ['sinoatrial node', 'SA node', 'sinus node'],
    'Atrioventricular (AV) node': ['atrioventricular node', 'AV node'],
    'Depolarization': ['depolarisation'],
    'Repolarization': ['repolarisation'],
    'P wave': ['P waves', 'P-wave'],
    'QRS complex': ['QRS complexes', 'QRS duration'],
    'T wave': ['T waves', 'T-wave'],
    'RR interval': ['RR intervals', 'R–R interval'],
    'Frontal QRS axis': ['QRS axis', 'frontal axis', 'mean frontal QRS axis'],
    'Artifact': ['artifacts', 'artefact', 'artefacts'],
  },
}

const extra: Record<EvidenceLanguage, SupplementalEntry[]> = {
  es: [
    { term: 'Ritmo sinusal', definition: 'Ritmo fisiológico originado en el nodo sinusal (60–100 lpm): onda P positiva en I, II y aVF, negativa en aVR, seguida de QRS con relación 1:1 y PR estable (120–200 ms).', sourceIds: ['aha-tech', 'acc-brady'] },
    { term: 'Fibrilación auricular', definition: 'Taquiarritmia supraventricular con activación auricular caótica (ondas f a 350–600 lpm), ausencia de ondas P sinusales e intervalos RR irregularmente irregulares. El riesgo embólico se estratifica con CHA₂DS₂-VA.', sourceIds: ['esc-af-2024', 'acc-af'] },
    { term: 'Flutter auricular', aliases: ['aleteo auricular'], definition: 'Macrorreentrada auricular organizada (240–340 lpm) con ondas F en dientes de sierra (negativas en II, III, aVF; positivas en V1). Con conducción AV 2:1 produce taquicardia regular cercana a 150 lpm.', sourceIds: ['esc-svt', 'esc-af-2024'] },
    { term: 'Bloqueo de rama derecha', aliases: ['bloqueo completo de rama derecha', 'BRD', 'BCRD'], definition: 'QRS ≥ 120 ms por retraso de activación del ventrículo derecho: morfología rSR′ o R ancha en V1–V2 con onda S empastada ≥ 40 ms en I y V6, e inversión secundaria de T en V1–V3.', sourceIds: ['aha-conduction', 'acc-brady'] },
    { term: 'Bloqueo de rama izquierda', aliases: ['bloqueo completo de rama izquierda', 'BRI', 'BCRI'], definition: 'QRS ≥ 120 ms con complejo QS o rS en V1–V2, onda R ancha mellada/empastada (tiempo al pico ≥ 60 ms) y ausencia de q septal en I, aVL y V5–V6. Impide usar criterios estándar de HVI o ST-T sin regla de Sgarbossa.', sourceIds: ['aha-conduction', 'smith-sgarbossa'] },
    { term: 'Desviación del eje', aliases: ['desviación izquierda del eje', 'desviación derecha del eje', 'desviación extrema del eje', 'desviación del eje a la izquierda', 'desviación del eje a la derecha'], definition: 'Vector medio del QRS en el plano frontal fuera de −30° a +90°. Desviación izquierda (−30° a −90°) orienta a hemibloqueo anterior izquierdo o HVI; derecha (+90° a +180°) a HVD o hemibloqueo posterior; extrema (−90° a ±180°) sugiere TV o inversión de electrodos.', sourceIds: ['aha-conduction'] },
    { term: 'Sistema de conducción', aliases: ['sistema de conducción eléctrica'], definition: 'Red especializada formada por el nodo sinusal, haces internodales, nodo AV, haz de His, ramas derecha e izquierda (fascículos anterior y posterior) y red subendocárdica de Purkinje.', sourceIds: ['aha-conduction', 'nhlbi-heart'] },
    { term: 'Haz de His', aliases: ['fascículo auriculoventricular'], definition: 'Tronco de conducción rápida que conecta el nodo AV con las ramas derecha e izquierda a través del septo membranoso; el bloqueo a este nivel o inferior (infranodal) conlleva alto riesgo de progresión a bloqueo completo.', sourceIds: ['acc-brady', 'aha-conduction'] },
    { term: 'Fibras de Purkinje', aliases: ['red de Purkinje'], definition: 'Fibras ventriculares subendocárdicas de alta velocidad (~4 m/s) que garantizan la despolarización coordinada de ambos ventrículos de ápex a base.', sourceIds: ['aha-conduction', 'openstax-heart'] },
    { term: 'Cardioversión eléctrica sincronizada', aliases: ['cardioversión sincronizada'], definition: 'Descarga eléctrica sincronizada con la onda R del QRS para interrumpir taquiarritmias por reentrada (FA, flutter o TV con pulso) cuando existe inestabilidad hemodinámica o indicación electiva.', sourceIds: ['aha-tachy', 'esc-af-2024'] },
    { term: 'Anticoagulación', definition: 'Prevención tromboembólica en fibrilación o flutter auricular guiada por la escala CHA₂DS₂-VA (ESC 2024: indicada con ≥ 2 puntos, considerar con 1 punto) ponderando el riesgo hemorrágico.', sourceIds: ['esc-af-2024', 'acc-af'] },
    { term: 'Elevación del segmento ST', aliases: ['supradesnivel del ST', 'elevación ST'], definition: 'Desviación positiva del punto J en ≥ 2 derivaciones contiguas: ≥ 0,25 mV en V2–V3 (hombres < 40 a), ≥ 0,20 mV (hombres ≥ 40 a), ≥ 0,15 mV (mujeres) y ≥ 0,10 mV en el resto de derivaciones.', sourceIds: ['universal-mi', 'esc-acs'] },
    { term: 'Depresión del segmento ST', aliases: ['infradesnivel del ST', 'descenso ST'], definition: 'Desviación negativa del punto J ≥ 0,05–0,10 mV horizontal o descendente en ≥ 2 derivaciones contiguas; sugiere isquemia subendocárdica (SCASEST), lesión recíproca de IAM posterior (V1–V3) o sobrecarga ventricular.', sourceIds: ['universal-mi', 'esc-acs'] },
    { term: 'Criterios de Sgarbossa', aliases: ['Sgarbossa', 'criterios de Smith-Sgarbossa'], definition: 'Criterios para detectar oclusión coronaria aguda en BRI o marcapasos: (1) elevación ST concordante ≥ 1 mm, (2) descenso ST concordante ≥ 1 mm en V1–V3, o (3) regla modificada de Smith: relación discordante ST_J / S ≤ −0,25 (sensibilidad 91 %, especificidad 90 %).', sourceIds: ['smith-sgarbossa', 'universal-mi'] },
    { term: 'Síndrome de Wellens', aliases: ['patrón de Wellens'], definition: 'Ondas T bifásicas (Tipo A) o invertidas profundas y simétricas (Tipo B) en V2–V3 sin ondas Q ni elevación marcada del ST, tras un episodio de angina. Indica estenosis crítica proximal de la arteria descendente anterior.', sourceIds: ['esc-acs', 'universal-mi'] },
    { term: 'Patrón de de Winter', aliases: ['patrón de Winter'], definition: 'Equivalente de IAMCEST anterior por oclusión proximal de la descendente anterior: depresión ascendente del punto J > 1 mm en V1–V6 seguida de ondas T altas, picudas y simétricas, con frecuente elevación en aVR.', sourceIds: ['esc-acs', 'universal-mi'] },
    { term: 'Patrón de Brugada', aliases: ['Brugada tipo 1', 'Brugada tipo 2'], definition: 'Elevación del punto J ≥ 2 mm en V1–V2 (en posición estándar o 2.º–3.º EIC) con morfología abombada ("coved", tipo 1) e inversión de T o en silla de montar (tipo 2). Solo el tipo 1 espontáneo o inducido más clínica define el síndrome.', sourceIds: ['esc-va'] },
    { term: 'Preexcitación ventricular', aliases: ['onda delta', 'síndrome de Wolff-Parkinson-White', 'patrón WPW'], definition: 'Activación ventricular precoz por una vía accesoria auriculoventricular que esquiva el nodo AV: PR < 120 ms, empastamiento inicial del QRS (onda delta) y QRS ≥ 110–120 ms. Contraindica frenadores nodales si aparece FA rápida.', sourceIds: ['esc-svt', 'aha-conduction'] },
    { term: 'Intervalo QTc', aliases: ['QTc', 'QT corregido'], definition: 'Intervalo QT ajustado a frecuencia (Fridericia preferida en adultos: QT / RR¹/³). Normal < 450 ms (H) / < 460 ms (M); ≥ 500 ms conlleva alto riesgo de Torsades de Pointes. En QRS ≥ 120 ms usar corrección de Bogossian o JTc.', sourceIds: ['aha-qt', 'aha-tdp'] },
    { term: 'Bloqueo AV de primer grado', definition: 'Retraso de conducción nodal con intervalo PR > 200 ms y conducción 1:1 de todas las ondas P hacia los ventrículos.', sourceIds: ['acc-brady'] },
    { term: 'Fenómeno de Wenckebach', aliases: ['Mobitz I', 'bloqueo AV Mobitz I'], definition: 'Bloqueo AV de segundo grado nodal caracterizado por prolongación progresiva del PR en latidos sucesivos hasta que una onda P no conduce, con acortamiento progresivo de RR y pausa menor a 2×PP.', sourceIds: ['acc-brady'] },
    { term: 'Bloqueo AV Mobitz II', aliases: ['Mobitz II'], definition: 'Bloqueo AV de segundo grado típicamente infranodal (His-Purkinje): intervalo PR estrictamente constante antes y después de una onda P bloqueada con ritmo sinusal PP estable. Alto riesgo de progresión a bloqueo completo.', sourceIds: ['acc-brady'] },
    { term: 'Bloqueo AV completo', aliases: ['bloqueo AV de tercer grado', 'disociación AV'], definition: 'Fallo total de conducción entre aurículas y ventrículos: las ondas P (frecuencia auricular mayor) y los QRS (ritmo de escape nodal o ventricular más lento) laten de forma completamente independiente.', sourceIds: ['acc-brady'] },
    { term: 'Hemibloqueo anterior izquierdo', aliases: ['bloqueo fascicular anterior izquierdo'], definition: 'Retraso en el fascículo anterior de la rama izquierda: eje frontal izquierdo entre −45° y −90°, patrón qR en I/aVL, rS en II/III/aVF y QRS < 120 ms.', sourceIds: ['aha-conduction'] },
    { term: 'Hipertrofia ventricular izquierda', aliases: ['HVI', 'Sokolow-Lyon', 'Cornell'], definition: 'Aumento de masa ventricular izquierda evaluable solo con QRS < 120 ms: Sokolow-Lyon (S_V1 + R_V5/V6 ≥ 3,5 mV), Cornell (R_aVL + S_V3 > 2,8 mV en H o > 2,0 mV en M) o patrón de sobrecarga (strain lateral).', sourceIds: ['aha-tech', 'aha-conduction'] },
    { term: 'Taquicardia ventricular', aliases: ['TV', 'taquicardia de QRS ancho'], definition: '≥ 3 latidos ventriculares consecutivos a > 100 lpm con QRS ≥ 120 ms. Toda taquicardia regular de complejo ancho debe presumirse TV hasta demostrar lo contrario mediante criterios de Brugada/Vereckei/Pava y búsqueda de disociación AV.', sourceIds: ['esc-va', 'aha-tachy'] },
    { term: 'Alternancia eléctrica', definition: 'Variación alternante latido a latido en la amplitud o eje del complejo QRS (1:1 o 2:1); sugiere derrame pericárdico masivo con taponamiento cardíaco o taquiarritmia rápida por vía accesoria.', sourceIds: ['esc-svt', 'aha-tech'] },
    { term: 'Escala CHA₂DS₂-VA', aliases: ['CHA2DS2-VA', 'CHA2DS2-VASc'], definition: 'Escala clínica recomendada por la guía ESC 2024 de FA (sin modificador por sexo) para estimar el riesgo anual de ictus: IC (+1), HTA (+1), Edad ≥75 (+2), Diabetes (+1), Ictus/AIT (+2), Enfermedad vascular (+1), Edad 65–74 (+1).', sourceIds: ['esc-af-2024'] },
    { term: 'Escala de Tisdale', aliases: ['Tisdale'], definition: 'Puntuación validada (0–21 puntos) que predice el riesgo de prolongación de QTc ≥ 500 ms en pacientes hospitalizados: edad ≥ 68 (+1), mujer (+1), diurético de asa (+1), K⁺ ≤ 3,5 (+2), QTc basal ≥ 450 (+2), IAM (+2), ≥ 1 fármaco QT (+3), insuficiencia cardíaca/sepsis (+3).', sourceIds: ['tisdale-2013', 'aha-tdp'] },
  ],
  en: [
    { term: 'Sinus rhythm', definition: 'Physiological rhythm initiated in the SA node (60–100 bpm): upright P waves in I, II, and aVF, inverted in aVR, 1:1 AV conduction, and stable PR (120–200 ms).', sourceIds: ['aha-tech', 'acc-brady'] },
    { term: 'Atrial fibrillation', definition: 'Supraventricular tachyarrhythmia with disorganized atrial activation (f waves at 350–600 bpm), absent sinus P waves, and irregularly irregular RR intervals. Stroke risk is stratified with CHA₂DS₂-VA.', sourceIds: ['esc-af-2024', 'acc-af'] },
    { term: 'Atrial flutter', definition: 'Organized atrial macro-reentry (240–340 bpm) with sawtooth F waves (negative in II, III, aVF; positive in V1). With 2:1 AV conduction it presents as a regular narrow tachycardia near 150 bpm.', sourceIds: ['esc-svt', 'esc-af-2024'] },
    { term: 'Right bundle branch block', aliases: ['complete right bundle branch block', 'RBBB'], definition: 'QRS ≥ 120 ms from delayed right ventricular activation: rSR′ or broad R in V1–V2, wide terminal S wave ≥ 40 ms in I and V6, and secondary T inversion in V1–V3.', sourceIds: ['aha-conduction', 'acc-brady'] },
    { term: 'Left bundle branch block', aliases: ['complete left bundle branch block', 'LBBB'], definition: 'QRS ≥ 120 ms with QS or rS in V1–V2, broad notched/slurred R wave (peak time ≥ 60 ms) and absent septal q waves in I, aVL, V5–V6. Standard LVH and ST-T criteria do not apply without modified Sgarbossa.', sourceIds: ['aha-conduction', 'smith-sgarbossa'] },
    { term: 'Axis deviation', aliases: ['left axis deviation', 'right axis deviation', 'extreme axis deviation', 'leftward axis deviation', 'rightward axis deviation'], definition: 'Mean frontal QRS axis outside −30° to +90°. Left deviation (< −30°) suggests LAFB or LVH; right deviation (> +90°) suggests RVH or LPFB; extreme (−90° to ±180°) raises concern for VT or lead reversal.', sourceIds: ['aha-conduction'] },
    { term: 'Conduction system', aliases: ['cardiac conduction system'], definition: 'Specialized network comprising the SA node, internodal tracts, AV node, bundle of His, right/left bundle branches (anterior and posterior fascicles), and Purkinje fibers.', sourceIds: ['aha-conduction', 'nhlbi-heart'] },
    { term: 'Bundle of His', aliases: ['His bundle', 'atrioventricular bundle'], definition: 'Fast conduction tract connecting the AV node to the bundle branches; block at or below the His bundle (infranodal) carries a high risk of progression to complete heart block.', sourceIds: ['acc-brady', 'aha-conduction'] },
    { term: 'Purkinje fibers', aliases: ['Purkinje fibres', 'Purkinje network'], definition: 'High-velocity subendocardial ventricular fibers (~4 m/s) ensuring coordinated apex-to-base ventricular depolarization.', sourceIds: ['aha-conduction', 'openstax-heart'] },
    { term: 'Synchronized electrical cardioversion', aliases: ['synchronized cardioversion', 'synchronised cardioversion', 'synchronised electrical cardioversion'], definition: 'Electrical shock timed to the QRS R wave to terminate re-entrant tachyarrhythmias (AF, flutter, or VT with pulse) when hemodynamically unstable or electively indicated.', sourceIds: ['aha-tachy', 'esc-af-2024'] },
    { term: 'Anticoagulation', definition: 'Thromboembolic prophylaxis in atrial fibrillation or flutter guided by the CHA₂DS₂-VA score (ESC 2024: recommended for ≥ 2 points, considered for 1 point) balanced against bleeding risk.', sourceIds: ['esc-af-2024', 'acc-af'] },
    { term: 'ST-segment elevation', aliases: ['ST elevation'], definition: 'J-point elevation in ≥ 2 contiguous leads: ≥ 0.25 mV in V2–V3 (men < 40 y), ≥ 0.20 mV (men ≥ 40 y), ≥ 0.15 mV (women), and ≥ 0.10 mV in all other leads.', sourceIds: ['universal-mi', 'esc-acs'] },
    { term: 'ST-segment depression', aliases: ['ST depression'], definition: 'Horizontal or downsloping J-point depression ≥ 0.05–0.10 mV in ≥ 2 contiguous leads, indicating subendocardial ischemia (NSTE-ACS), posterior MI reciprocal change (V1–V3), or ventricular strain.', sourceIds: ['universal-mi', 'esc-acs'] },
    { term: 'Sgarbossa criteria', aliases: ['modified Sgarbossa', 'Smith-Sgarbossa'], definition: 'Criteria to identify acute coronary occlusion in LBBB or paced rhythm: (1) concordant STE ≥ 1 mm, (2) concordant STD ≥ 1 mm in V1–V3, or (3) Smith ratio ST_J / S ≤ −0.25 (sensitivity 91%, specificity 90%).', sourceIds: ['smith-sgarbossa', 'universal-mi'] },
    { term: 'Wellens syndrome', aliases: ['Wellens pattern'], definition: 'Biphasic (Type A) or deeply symmetrically inverted (Type B) T waves in V2–V3 without Q waves after anginal pain, signifying critical proximal LAD stenosis.', sourceIds: ['esc-acs', 'universal-mi'] },
    { term: 'de Winter pattern', definition: 'STEMI-equivalent pattern of proximal LAD occlusion: upsloping J-point depression > 1 mm in V1–V6 leading into tall symmetric peaked T waves, often with ST elevation in aVR.', sourceIds: ['esc-acs', 'universal-mi'] },
    { term: 'Brugada pattern', aliases: ['Brugada type 1', 'Brugada type 2'], definition: 'J-point elevation ≥ 2 mm in V1–V2 (standard or high intercostal leads) with coved ST and inverted T (Type 1) or saddleback ST (Type 2). Type 1 plus clinical/family criteria defines Brugada syndrome.', sourceIds: ['esc-va'] },
    { term: 'Ventricular pre-excitation', aliases: ['delta wave', 'WPW pattern', 'Wolff-Parkinson-White'], definition: 'Early ventricular activation via an accessory AV pathway bypassing the AV node: PR < 120 ms, initial QRS slurring (delta wave), and QRS ≥ 110–120 ms. AV-nodal blockers are contraindicated in pre-excited AF.', sourceIds: ['esc-svt', 'aha-conduction'] },
    { term: 'QTc interval', aliases: ['QTc', 'corrected QT'], definition: 'Heart-rate-corrected QT interval (Fridericia preferred: QT / RR¹/³). Normal < 450 ms (men) / < 460 ms (women); ≥ 500 ms confers high Torsades de Pointes risk. Use Bogossian or JTc adjustment when QRS ≥ 120 ms.', sourceIds: ['aha-qt', 'aha-tdp'] },
    { term: 'First-degree AV block', definition: 'Delayed AV nodal conduction with PR > 200 ms and intact 1:1 conduction of every P wave to the ventricles.', sourceIds: ['acc-brady'] },
    { term: 'Wenckebach phenomenon', aliases: ['Mobitz I', 'Mobitz type I'], definition: 'Nodal second-degree AV block with progressive PR lengthening before a non-conducted P wave, progressive RR shortening, and a pause < 2×PP.', sourceIds: ['acc-brady'] },
    { term: 'Mobitz II AV block', aliases: ['Mobitz II', 'Mobitz type II'], definition: 'Typically infranodal second-degree AV block showing strictly constant PR intervals before and after a single blocked P wave during stable sinus PP timing; high risk of complete heart block.', sourceIds: ['acc-brady'] },
    { term: 'Complete AV block', aliases: ['third-degree AV block', 'AV dissociation'], definition: 'Total failure of AV conduction: P waves and a slower junctional or ventricular escape rhythm beat independently without fixed temporal coupling.', sourceIds: ['acc-brady'] },
    { term: 'Left anterior fascicular block', aliases: ['LAFB'], definition: 'Delay in the left anterior fascicle: frontal axis between −45° and −90°, qR in I/aVL, rS in II/III/aVF, and QRS < 120 ms.', sourceIds: ['aha-conduction'] },
    { term: 'Left ventricular hypertrophy', aliases: ['LVH', 'Sokolow-Lyon', 'Cornell'], definition: 'Increased LV mass evaluated only when QRS < 120 ms: Sokolow-Lyon (S_V1 + R_V5/V6 ≥ 3.5 mV), Cornell (R_aVL + S_V3 > 2.8 mV men or > 2.0 mV women), or lateral strain pattern.', sourceIds: ['aha-tech', 'aha-conduction'] },
    { term: 'Ventricular tachycardia', aliases: ['VT', 'wide-complex tachycardia'], definition: '≥ 3 consecutive ventricular beats at > 100 bpm with QRS ≥ 120 ms. Any regular wide-complex tachycardia must be treated as VT until proven otherwise using Brugada/Vereckei/Pava criteria and AV dissociation.', sourceIds: ['esc-va', 'aha-tachy'] },
    { term: 'Electrical alternans', definition: 'Beat-to-beat alternating amplitude or axis of the QRS complex; strongly suggests large pericardial effusion with tamponade or rapid AVRT.', sourceIds: ['esc-svt', 'aha-tech'] },
    { term: 'CHA₂DS₂-VA score', aliases: ['CHA2DS2-VA', 'CHA2DS2-VASc'], definition: 'ESC 2024 sex-neutral stroke risk score in AF: CHF (+1), Hypertension (+1), Age ≥75 (+2), Diabetes (+1), Stroke/TIA (+2), Vascular disease (+1), Age 65–74 (+1).', sourceIds: ['esc-af-2024'] },
    { term: 'Tisdale score', aliases: ['Tisdale risk score'], definition: 'Validated 0–21 point score predicting QTc ≥ 500 ms in hospitalized patients: age ≥ 68 (+1), female (+1), loop diuretic (+1), K⁺ ≤ 3.5 (+2), baseline QTc ≥ 450 (+2), acute MI (+2), ≥ 1 QT-prolonging drug (+3), HF/sepsis (+3).', sourceIds: ['tisdale-2013', 'aha-tdp'] },
  ],
}

const canonical = (text: string) => text.toLowerCase().replace(/[\s\u00a0]+/gu, ' ').replace(/[-‐‑–—]/gu, '-')
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patternFor = (term: string) => term.split(/([ -])/).map(piece => {
  if (piece === ' ') return '\\s+'
  if (piece === '-') return '[-‐‑–—]'
  return escape(piece)
}).join('')

function buildMatcher(language: EvidenceLanguage) {
  const entries = new Map<string, Entry>()
  for (const entry of getEvidence(language).glossary) {
    for (const term of [entry.term, ...(aliases[language][entry.term] ?? [])]) {
      entries.set(canonical(term), entry)
    }
  }
  for (const entry of extra[language]) {
    for (const term of [entry.term, ...(entry.aliases ?? [])]) {
      entries.set(canonical(term), entry)
    }
  }
  const alternatives = [...entries.keys()].sort((a, b) => b.length - a.length).map(patternFor)
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  return { entries, pattern }
}

const matchers = { es: buildMatcher('es'), en: buildMatcher('en') }

export function technicalSegments(
  text: string,
  language: EvidenceLanguage,
  options?: { deduplicate?: boolean },
): TermSegment[] {
  const { entries, pattern } = matchers[language]
  const segments: TermSegment[] = []
  const seen = options?.deduplicate ? new Set<string>() : null
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) segments.push({ text: text.slice(offset, match.index) })
    const token = match[0]
    const entry = entries.get(canonical(token))
    if (entry && seen) {
      if (seen.has(entry.term)) {
        segments.push({ text: token })
      } else {
        seen.add(entry.term)
        segments.push({ text: token, entry })
      }
    } else {
      segments.push({ text: token, entry })
    }
    offset = match.index + token.length
  }
  if (offset < text.length) segments.push({ text: text.slice(offset) })
  return segments
}
