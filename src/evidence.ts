export type EvidenceLanguage = 'es' | 'en';
export type FindingId = 'sinus' | 'af' | 'rbbb' | 'lbbb' | 'indeterminate';

export interface Source {
  id: string;
  name: string;
  url: string;
  kind: 'Medicina' | 'Datos' | 'Diseño' | 'Consulta';
}

export interface Finding {
  label: string;
  shortLabel: string;
  summary: string;
  mechanism: string;
  leads: string[];
  sourceIds: string[];
}

export const openEvidenceUrl = 'https://www.openevidence.com/';

export const sources: Source[] = [
  { id: 'aha-tech', name: 'AHA/ACCF/HRS · Adquisición y estandarización del ECG', url: 'https://pubmed.ncbi.nlm.nih.gov/17322457/', kind: 'Medicina' },
  { id: 'aha-conduction', name: 'AHA/ACCF/HRS · Conducción intraventricular', url: 'https://pubmed.ncbi.nlm.nih.gov/19281930/', kind: 'Medicina' },
  { id: 'aha-qt', name: 'AHA/ACCF/HRS · Onda T e intervalo QT', url: 'https://pubmed.ncbi.nlm.nih.gov/19281931/', kind: 'Medicina' },
  { id: 'acc-af', name: 'ACC/AHA/ACCP/HRS · Guía de fibrilación auricular', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11095842/', kind: 'Medicina' },
  { id: 'acc-brady', name: 'ACC/AHA/HRS · Bradicardia y trastornos de la conducción', url: 'https://www.jacc.org/doi/10.1016/j.jacc.2018.10.043', kind: 'Medicina' },
  { id: 'aha-chest-pain', name: 'AHA/ACC · Evaluación del dolor torácico', url: 'https://doi.org/10.1161/CIR.0000000000001029', kind: 'Medicina' },
  { id: 'aha-tachy', name: 'AHA · Taquiarritmia del adulto con pulso (2025)', url: 'https://www.heart.org/-/media/CPR-Files/CPR-Guidelines-Files/2025-Algorithms/Algorithm-ACLS-Tachycardia-250514.pdf', kind: 'Medicina' },
  { id: 'aha-warning-signs', name: 'AHA · Signos de alarma cardíacos y cerebrovasculares', url: 'https://www.heart.org/en/about-us/heart-attack-and-stroke-symptoms', kind: 'Medicina' },
  { id: 'universal-mi', name: 'ESC/ACC/AHA/WHF · Cuarta Definición Universal del Infarto (2018)', url: 'https://doi.org/10.1093/eurheartj/ehy462', kind: 'Medicina' },
  { id: 'esc-acs', name: 'ESC · Guía de Síndromes Coronarios Agudos (2023)', url: 'https://doi.org/10.1093/eurheartj/ehad191', kind: 'Medicina' },
  { id: 'esc-af-2024', name: 'ESC/EACTS · Guía de Fibrilación Auricular y CHA₂DS₂-VA (2024)', url: 'https://pubmed.ncbi.nlm.nih.gov/39210723/', kind: 'Medicina' },
  { id: 'esc-va', name: 'ESC · Arritmias ventriculares y muerte súbita (2022)', url: 'https://doi.org/10.1093/eurheartj/ehac262', kind: 'Medicina' },
  { id: 'esc-svt', name: 'ESC · Taquicardia supraventricular (2019)', url: 'https://doi.org/10.1093/eurheartj/ehz467', kind: 'Medicina' },
  { id: 'aha-tdp', name: 'AHA/ACCF · Prevención de Torsades de Pointes y QTc (2010)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3056123/', kind: 'Medicina' },
  { id: 'smith-sgarbossa', name: 'Smith et al. · Regla de Sgarbossa Modificada en BRI (2012)', url: 'https://pubmed.ncbi.nlm.nih.gov/22939607/', kind: 'Medicina' },
  { id: 'tisdale-2013', name: 'Tisdale et al. · Escala de Riesgo de Prolongación de QTc (2013)', url: 'https://pubmed.ncbi.nlm.nih.gov/23716032/', kind: 'Medicina' },
  { id: 'nhlbi-heart', name: 'NHLBI · Sistema eléctrico del corazón', url: 'https://www.nhlbi.nih.gov/health/heart/heart-beats', kind: 'Medicina' },
  { id: 'nhlbi-blocks', name: 'NHLBI · Trastornos de la conducción', url: 'https://www.nhlbi.nih.gov/health/conduction-disorders', kind: 'Medicina' },
  { id: 'openstax-heart', name: 'OpenStax · Actividad eléctrica cardíaca', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/19-2-cardiac-muscle-and-electrical-activity', kind: 'Medicina' },
  { id: 'maven', name: 'Beth Israel Deaconess Medical Center · ECG Wave-Maven', url: 'https://ecg.bidmc.harvard.edu/maven/mavenmain.asp', kind: 'Medicina' },
  { id: 'ptbxl', name: 'PhysioNet · PTB-XL 1.0.3', url: 'https://physionet.org/content/ptb-xl/1.0.3/', kind: 'Datos' },
  { id: 'ptbdb', name: 'PhysioNet · PTB Diagnostic ECG 1.0.0', url: 'https://physionet.org/content/ptbdb/1.0.0/', kind: 'Datos' },
  { id: 'chapman', name: 'PhysioNet · Chapman–Shaoxing–Ningbo 1.0.0', url: 'https://physionet.org/content/ecg-arrhythmia/1.0.0/', kind: 'Datos' },
  { id: 'ecg-image', name: 'Reyna y colaboradores · ECG-Image-Database', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13402943/', kind: 'Datos' },
  { id: 'challenge', name: 'PhysioNet Challenge 2024 · ECG fotografiado', url: 'https://moody-challenge.physionet.org/2024/', kind: 'Datos' },
  { id: 'heartdeform', name: 'Kong y Shadden · Malla cardíaca de referencia', url: 'https://pubmed.ncbi.nlm.nih.gov/36327186/', kind: 'Datos' },
  { id: 'heart-atlas', name: 'Heart Atlas · Anatomía 3D', url: 'https://w3lld1.github.io/heart-atlas/en/anatomy/', kind: 'Datos' },
  { id: 'shadergradient', name: 'ShaderGradient', url: 'https://github.com/ruucm/shadergradient', kind: 'Diseño' },
  { id: 'liquid-glass', name: 'Liquid Glass JS', url: 'https://github.com/dashersw/liquid-glass-js', kind: 'Diseño' },
  { id: 'openevidence', name: 'OpenEvidence', url: openEvidenceUrl, kind: 'Consulta' },
];

export const findings: Record<FindingId, Finding> = {
  sinus: {
    label: 'Ritmo sinusal',
    shortLabel: 'Ritmo sinusal',
    summary: 'Una onda P de morfología sinusal precede a cada QRS en el ejemplo.',
    mechanism: 'El impulso nace en el nodo sinusal, activa las aurículas y pasa por el nodo auriculoventricular antes de propagarse a los ventrículos.',
    leads: ['I', 'II', 'aVR'],
    sourceIds: ['nhlbi-heart', 'openstax-heart', 'aha-tech'],
  },
  af: {
    label: 'Fibrilación auricular',
    shortLabel: 'Fibrilación auricular',
    summary: 'Los intervalos RR son irregularmente irregulares y faltan ondas P repetibles en el ejemplo.',
    mechanism: 'Las aurículas se activan de forma desorganizada. El paso variable de impulsos por el nodo auriculoventricular produce una respuesta ventricular irregular.',
    leads: ['II', 'V1'],
    sourceIds: ['acc-af', 'nhlbi-heart'],
  },
  rbbb: {
    label: 'Bloqueo completo de rama derecha',
    shortLabel: 'Bloqueo de rama derecha',
    summary: 'En adultos, el patrón combina un QRS de 120 ms o más, una deflexión terminal positiva característica en V1 o V2 y una S terminal ancha en I y V6.',
    mechanism: 'El ventrículo izquierdo se activa antes. El impulso alcanza el ventrículo derecho con retraso y prolonga la parte final del QRS.',
    leads: ['V1', 'V2', 'I', 'V6'],
    sourceIds: ['aha-conduction', 'nhlbi-blocks'],
  },
  lbbb: {
    label: 'Bloqueo completo de rama izquierda',
    shortLabel: 'Bloqueo de rama izquierda',
    summary: 'En adultos, el patrón combina un QRS de 120 ms o más y una onda R ancha, a menudo mellada o empastada, en derivaciones laterales.',
    mechanism: 'La activación comienza en el lado derecho del tabique. La propagación hacia el ventrículo izquierdo se retrasa y ensancha el QRS.',
    leads: ['I', 'aVL', 'V1', 'V5', 'V6'],
    sourceIds: ['aha-conduction', 'nhlbi-blocks'],
  },
  indeterminate: {
    label: 'Resultado indeterminado',
    shortLabel: 'Indeterminado',
    summary: 'La calidad del trazado o la evidencia disponible impiden identificar un patrón con suficiente confianza.',
    mechanism: 'Revisa las derivaciones, la calibración y la duración de la tira antes de asignar un patrón.',
    leads: [],
    sourceIds: ['aha-tech', 'challenge'],
  },
};

export const glossary: { term: string; definition: string; sourceIds: string[] }[] = [
  { term: 'Electrocardiograma (ECG)', definition: 'Registro de las diferencias de potencial eléctrico cardíaco en 12 derivaciones estándar (6 frontales y 6 precordiales). En adultos se adquiere por convención a 25 mm/s (1 mm = 40 ms) y 10 mm/mV (1 mm = 0,1 mV).', sourceIds: ['aha-tech', 'universal-mi'] },
  { term: 'Derivación', definition: 'Eje espacial desde el cual se mide el vector eléctrico cardíaco: bipolares/aumentadas frontales (I, II, III, aVR, aVL, aVF) y unipolares precordiales (V1–V6). La contigüidad anatómica es esencial para localizar isquemia.', sourceIds: ['aha-tech', 'universal-mi'] },
  { term: 'Calibración', definition: 'Relación física entre la cuadrícula milimetrada del papel y las magnitudes eléctricas: la velocidad (habitualmente 25 o 50 mm/s) define el tiempo y la ganancia (5, 10 o 20 mm/mV) define el voltaje. Sin verificar el pulso de 1 mV no deben aplicarse criterios de amplitud.', sourceIds: ['aha-tech'] },
  { term: 'Nodo sinusal', definition: 'Marcapasos fisiológico situado en la unión entre la vena cava superior y la aurícula derecha; su frecuencia intrínseca en reposo adulto es de 60–100 lpm bajo control autonómico.', sourceIds: ['acc-brady', 'nhlbi-heart'] },
  { term: 'Nodo auriculoventricular', definition: 'Única vía fisiológica de paso eléctrico aurículo-ventricular; introduce un retraso decremental (PR 120–200 ms) que optimiza el llenado ventricular y protege frente a frecuencias auriculares rápidas.', sourceIds: ['acc-brady', 'esc-svt'] },
  { term: 'Despolarización', definition: 'Inversión rápida del potencial transmembrana mediada por entrada de Na⁺ (y Ca²⁺ en nodos) que dispara la contracción. En el ECG corresponde a la onda P (auricular) y al complejo QRS (ventricular).', sourceIds: ['aha-conduction', 'openstax-heart'] },
  { term: 'Repolarización', definition: 'Restitución del potencial de reposo miocárdico mediada por corrientes de salida de K⁺ (segmento ST y onda T). Su alteración primaria refleja isquemia, desequilibrios electrolíticos o fármacos bloqueadores de canales IKr.', sourceIds: ['aha-qt', 'aha-tdp'] },
  { term: 'Onda P', definition: 'Despolarización auricular; en ritmo sinusal normal es positiva en I, II y aVF, negativa en aVR, de duración < 120 ms y amplitud ≤ 0,25 mV en II. Su ausencia o morfología en sierra orienta a FA o flutter.', sourceIds: ['aha-tech', 'acc-af'] },
  { term: 'Intervalo PR', definition: 'Tiempo desde el inicio de la onda P hasta el inicio del complejo QRS (normal en adultos: 120–200 ms). Valores > 200 ms indican retraso AV de primer grado; < 120 ms con empastamiento inicial (onda delta) sugieren preexcitación.', sourceIds: ['acc-brady', 'aha-conduction'] },
  { term: 'Complejo QRS', definition: 'Despolarización ventricular sincronizada a través del sistema His-Purkinje. Su duración normal en adultos es < 110 ms; ≥ 120 ms define complejo ancho (bloqueo de rama, marcapasos, preexcitación o ritmo ventricular).', sourceIds: ['aha-conduction', 'esc-va'] },
  { term: 'Onda T', definition: 'Fase rápida de repolarización ventricular, normalmente asimétrica y concordante con el QRS en la mayoría de derivaciones. Ondas T simétricas, invertidas profundas (Wellens) o picudas simétricas (hiperagudas/hiperpotasemia) son marcadores de alto riesgo.', sourceIds: ['aha-qt', 'universal-mi'] },
  { term: 'Intervalo QT', definition: 'Tiempo desde el inicio del QRS hasta el final de la onda T, que engloba despolarización y repolarización ventricular. Debe corregirse por frecuencia cardíaca (QTc) usando preferiblemente Fridericia (QT / RR¹/³) y ajustarse cuando el QRS es ancho.', sourceIds: ['aha-qt', 'aha-tdp'] },
  { term: 'Intervalo RR', definition: 'Distancia temporal entre dos ondas R consecutivas (60 000 / RR[ms] = FC en lpm). Una irregularidad absoluta (CV > 10–12 %) sin ondas P sinusales sugiere fibrilación auricular.', sourceIds: ['esc-af-2024', 'acc-af'] },
  { term: 'Eje eléctrico frontal', definition: 'Vector medio de despolarización QRS proyectado en el plano frontal (rango normal en adultos: −30° a +90°). Desviación izquierda (< −30°) sugiere hemibloqueo anterior izquierdo o HVI; derecha (> +90°), sobrecarga derecha o hemibloqueo posterior.', sourceIds: ['aha-conduction', 'aha-tech'] },
  { term: 'Artefacto', definition: 'Señal extrínseca no cardíaca (temblor muscular, interferencia de red 50/60 Hz, mal contacto de electrodos o distorsión óptica al digitalizar) capaz de simular taquicardia ventricular, ondas f o elevaciones falsas del ST.', sourceIds: ['aha-tech', 'ecg-image'] },
];

const prompts: Record<FindingId, string> = {
  sinus: 'En un ECG estándar de 12 derivaciones de un adulto, ¿qué características de la onda P y de su relación con el QRS apoyan el origen sinusal? Explica cómo distinguirlo de un ritmo auricular ectópico.',
  af: 'En un ECG estándar de 12 derivaciones de un adulto, ¿qué hallazgos apoyan la fibrilación auricular y cómo distinguirla de extrasístoles frecuentes o artefacto? Explica el papel de una tira de ritmo suficientemente larga.',
  rbbb: '¿Qué criterios de duración y morfología en V1, V2, I y V6 caracterizan el bloqueo completo de rama derecha en un ECG de adulto? Explica los cambios esperables de activación y los principales imitadores.',
  lbbb: '¿Qué criterios de duración y morfología en V1 y en derivaciones laterales caracterizan el bloqueo completo de rama izquierda en un ECG de adulto? Explica los cambios esperables de activación y los principales imitadores.',
  indeterminate: '¿Qué criterios de calidad, calibración y duración ayudan a decidir si un ECG de 12 derivaciones en papel permite evaluar el ritmo, medir intervalos y estimar el eje frontal?',
};

const promptsEn: Record<FindingId, string> = {
  sinus: 'Which P-wave features and P–QRS relationships support sinus rhythm on an adult 12-lead ECG? Explain how to distinguish it from ectopic atrial rhythm and how symptoms affect the initial assessment.',
  af: 'Which findings support atrial fibrillation on an adult 12-lead ECG, and how can it be distinguished from frequent ectopy or artifact? Summarize the initial assessment of hemodynamic stability and the factors that guide treatment after confirmation.',
  rbbb: 'What QRS duration and morphology in V1, V2, I and V6 characterize complete right bundle branch block in adults? Explain when a new or symptomatic finding calls for further evaluation.',
  lbbb: 'What QRS duration and morphology in V1 and the lateral leads characterize complete left bundle branch block in adults? Explain the initial evaluation of newly identified left bundle branch block and how acute ischemic symptoms change urgency.',
  indeterminate: 'What recording quality, calibration and duration are needed to assess rhythm, intervals and the frontal QRS axis from a paper 12-lead ECG? When should the ECG be repeated or reviewed by a clinician?',
};

export function makeEvidencePrompt(id: FindingId, language: EvidenceLanguage = 'es'): string {
  if (language === 'en') return `${promptsEn[id]} Answer in English and link to guidelines or primary studies.`;
  return `${prompts[id]} Resume los criterios y el manejo inicial cuando corresponda. Responde en español y cita guías o estudios primarios con enlaces.`;
}

const findingsEn: Record<FindingId, Finding> = {
  sinus: {
    ...findings.sinus,
    label: 'Sinus rhythm',
    shortLabel: 'Sinus rhythm',
    summary: 'A P wave with sinus morphology precedes each QRS complex in the example.',
    mechanism: 'The impulse starts in the sinoatrial node, activates the atria, and passes through the atrioventricular node before spreading through the ventricles.',
  },
  af: {
    ...findings.af,
    label: 'Atrial fibrillation',
    shortLabel: 'Atrial fibrillation',
    summary: 'The RR intervals are irregularly irregular and there are no consistent P waves in the example.',
    mechanism: 'Atrial activation is disorganized. Variable conduction through the atrioventricular node produces an irregular ventricular response.',
  },
  rbbb: {
    ...findings.rbbb,
    label: 'Complete right bundle branch block',
    shortLabel: 'Right bundle branch block',
    summary: 'In adults, the pattern combines a QRS duration of at least 120 ms, a characteristic terminal positive deflection in V1 or V2, and a broad terminal S wave in I and V6.',
    mechanism: 'The left ventricle activates first. Delayed right ventricular activation prolongs the terminal portion of the QRS complex.',
  },
  lbbb: {
    ...findings.lbbb,
    label: 'Complete left bundle branch block',
    shortLabel: 'Left bundle branch block',
    summary: 'In adults, the pattern combines a QRS duration of at least 120 ms and a broad, often notched or slurred R wave in the lateral leads.',
    mechanism: 'Septal activation begins on the right. Delayed conduction to the left ventricle widens the QRS complex.',
  },
  indeterminate: {
    ...findings.indeterminate,
    label: 'Indeterminate result',
    shortLabel: 'Indeterminate',
    summary: 'The available tracing or evidence is insufficient to identify a pattern with confidence.',
    mechanism: 'Review the leads, calibration and rhythm-strip duration before assigning a pattern.',
  },
};

const glossaryEn: typeof glossary = [
  { term: 'Electrocardiogram (ECG)', definition: 'A 12-lead recording of cardiac voltage differences across six frontal limb leads and six precordial leads. Standard adult paper calibration uses 25 mm/s (1 mm = 40 ms) and 10 mm/mV (1 mm = 0.1 mV).', sourceIds: ['aha-tech', 'universal-mi'] },
  { term: 'Lead', definition: 'An electrical viewing axis of the heart formed by frontal limb leads (I, II, III, aVR, aVL, aVF) and horizontal precordial leads (V1–V6). Anatomic contiguity across leads is required to localize acute ischemia.', sourceIds: ['aha-tech', 'universal-mi'] },
  { term: 'Calibration', definition: 'The conversion between paper grid distance and physiological units: speed (25 or 50 mm/s) governs time, while gain (5, 10, or 20 mm/mV) governs voltage. Voltage criteria require checking the 1 mV calibration pulse.', sourceIds: ['aha-tech'] },
  { term: 'Sinoatrial (SA) node', definition: 'The physiological cardiac pacemaker at the superior vena cava–right atrial junction; its normal resting adult firing rate is 60–100 bpm under autonomic control.', sourceIds: ['acc-brady', 'nhlbi-heart'] },
  { term: 'Atrioventricular (AV) node', definition: 'The sole physiological electrical bridge between atria and ventricles, introducing a decremental delay (PR 120–200 ms) that optimizes ventricular filling and limits rapid atrial conduction.', sourceIds: ['acc-brady', 'esc-svt'] },
  { term: 'Depolarization', definition: 'Rapid transmembrane voltage reversal driven by inward Na⁺ (or Ca²⁺ in nodal tissue) currents that initiates contraction; represented by the P wave (atrial) and QRS complex (ventricular).', sourceIds: ['aha-conduction', 'openstax-heart'] },
  { term: 'Repolarization', definition: 'Electrical recovery of cardiac myocytes driven by outward K⁺ currents (ST segment and T wave). Primary changes reflect ischemia, electrolyte shifts, or IKr-blocking drugs.', sourceIds: ['aha-qt', 'aha-tdp'] },
  { term: 'P wave', definition: 'Atrial depolarization; in normal sinus rhythm it is upright in I, II, and aVF, inverted in aVR, < 120 ms wide, and ≤ 0.25 mV tall in II. Absence or sawtooth activity indicates AF or flutter.', sourceIds: ['aha-tech', 'acc-af'] },
  { term: 'PR interval', definition: 'Time from P-wave onset to QRS onset (normal adult range: 120–200 ms). Values > 200 ms define first-degree AV delay; < 120 ms with initial QRS slurring (delta wave) suggests pre-excitation.', sourceIds: ['acc-brady', 'aha-conduction'] },
  { term: 'QRS complex', definition: 'Synchronized ventricular depolarization via the His–Purkinje system. Normal adult duration is < 110 ms; ≥ 120 ms defines wide-QRS conduction (bundle branch block, pacing, pre-excitation, or ventricular rhythm).', sourceIds: ['aha-conduction', 'esc-va'] },
  { term: 'T wave', definition: 'Rapid ventricular repolarization, normally asymmetric and concordant with the QRS. Deep symmetric inversions (Wellens) or tall symmetric peaked waves (hyperacute ischemia/hyperkalemia) signify high risk.', sourceIds: ['aha-qt', 'universal-mi'] },
  { term: 'QT interval', definition: 'Time from QRS onset to T-wave offset spanning depolarization and repolarization. Rate correction (QTc) preferentially uses Fridericia (QT / RR¹/³) and requires QRS-width adjustment in bundle branch block.', sourceIds: ['aha-qt', 'aha-tdp'] },
  { term: 'RR interval', definition: 'Time between consecutive R peaks (60,000 / RR[ms] = ventricular rate in bpm). Irregularly irregular variation (CV > 10–12%) without sinus P waves supports atrial fibrillation.', sourceIds: ['esc-af-2024', 'acc-af'] },
  { term: 'Frontal QRS axis', definition: 'Mean direction of ventricular depolarization in the frontal plane (normal adult range: −30° to +90°). Left deviation (< −30°) suggests LAFB or LVH; right deviation (> +90°) suggests RV strain or LPFB.', sourceIds: ['aha-conduction', 'aha-tech'] },
  { term: 'Artifact', definition: 'Non-cardiac signal distortion (muscle tremor, 50/60 Hz mains noise, loose electrodes, or optical digitization artifacts) that can mimic ventricular tachycardia, fibrillatory waves, or ST elevation.', sourceIds: ['aha-tech', 'ecg-image'] },
];

const sourceNamesEn: Record<string, string> = {
  heartdeform: 'Kong and Shadden · Cardiac reference mesh',
  'heart-atlas': 'Heart Atlas · 3D anatomy',
  'aha-tech': 'AHA/ACCF/HRS · ECG acquisition and standardization',
  'aha-conduction': 'AHA/ACCF/HRS · Intraventricular conduction disturbances',
  'aha-qt': 'AHA/ACCF/HRS · T wave and QT interval',
  'acc-af': 'ACC/AHA/ACCP/HRS · Atrial fibrillation guideline',
  'acc-brady': 'ACC/AHA/HRS · Bradycardia and cardiac conduction delay',
  'aha-chest-pain': 'AHA/ACC · Evaluation of chest pain',
  'aha-tachy': 'AHA · Adult tachyarrhythmia with a pulse (2025)',
  'aha-warning-signs': 'AHA · Heart attack, stroke and cardiac arrest warning signs',
  'universal-mi': 'ESC/ACC/AHA/WHF · Fourth Universal Definition of Myocardial Infarction (2018)',
  'esc-acs': 'ESC · Acute Coronary Syndromes Guideline (2023)',
  'esc-af-2024': 'ESC/EACTS · Atrial Fibrillation & CHA₂DS₂-VA Guideline (2024)',
  'esc-va': 'ESC · Ventricular Arrhythmias and Sudden Cardiac Death (2022)',
  'esc-svt': 'ESC · Supraventricular Tachycardia Guideline (2019)',
  'aha-tdp': 'AHA/ACCF · Prevention of Torsade de Pointes and QTc (2010)',
  'smith-sgarbossa': 'Smith et al. · Modified Sgarbossa Rule in LBBB (2012)',
  'tisdale-2013': 'Tisdale et al. · QTc Prolongation Risk Score (2013)',
  'nhlbi-heart': 'NHLBI · Electrical system of the heart',
  'nhlbi-blocks': 'NHLBI · Conduction disorders',
  'openstax-heart': 'OpenStax · Cardiac electrical activity',
  'ecg-image': 'Reyna et al. · ECG-Image-Database',
  challenge: 'PhysioNet Challenge 2024 · Photographed ECGs',
};

const sourcesEn = sources.map(source => ({ ...source, name: sourceNamesEn[source.id] ?? source.name }));

export function getEvidence(language: EvidenceLanguage) {
  return language === 'en'
    ? { findings: findingsEn, glossary: glossaryEn, sources: sourcesEn }
    : { findings, glossary, sources };
}

export interface Management {
  impression: string;
  initialSteps: string[];
  urgent: string;
  sourceIds: string[];
}

const urgentEs = 'Si hay dolor torácico agudo, dificultad respiratoria intensa o pérdida de conciencia, llama a emergencias.';
const urgentEn = 'Call emergency services for acute chest pain, severe difficulty breathing or loss of consciousness.';

const management: Record<EvidenceLanguage, Record<FindingId, Management>> = {
  es: {
    sinus: {
      impression: 'Patrón compatible con ritmo sinusal.',
      initialSteps: [
        'Valorar síntomas, signos vitales, frecuencia y el resto del ECG.',
        'Si la persona está estable y la frecuencia es apropiada, el ritmo sinusal por sí solo no requiere tratamiento específico.',
      ],
      urgent: urgentEs,
      sourceIds: ['nhlbi-heart', 'aha-chest-pain', 'aha-warning-signs'],
    },
    af: {
      impression: 'Patrón compatible con fibrilación auricular.',
      initialSteps: [
        'Confirmar el ritmo mediante revisión clínica de un ECG legible y valorar frecuencia ventricular, signos vitales y estabilidad hemodinámica.',
        'Si hay estabilidad, el equipo clínico valora la duración del episodio, el control de frecuencia o ritmo y la indicación de anticoagulación según el riesgo de accidente cerebrovascular (ACV) y de sangrado.',
        'Si la fibrilación auricular causa inestabilidad hemodinámica, se requiere atención inmediata. El equipo de urgencias indica cardioversión eléctrica sincronizada.',
      ],
      urgent: 'Llama a emergencias si hay dolor torácico agudo, dificultad respiratoria intensa, pérdida de conciencia o signos de ACV, como debilidad súbita de un brazo o dificultad para hablar.',
      sourceIds: ['acc-af', 'aha-tachy', 'aha-warning-signs'],
    },
    rbbb: {
      impression: 'Patrón compatible con bloqueo completo de rama derecha.',
      initialSteps: [
        'Comparar con ECG previos y valorar si el hallazgo es nuevo, si hay síntomas y si coexisten otras alteraciones de la conducción.',
        'Si se sospecha cardiopatía estructural, el equipo clínico puede considerar un ecocardiograma transtorácico.',
      ],
      urgent: urgentEs,
      sourceIds: ['aha-conduction', 'acc-brady', 'aha-warning-signs'],
    },
    lbbb: {
      impression: 'Patrón compatible con bloqueo completo de rama izquierda.',
      initialSteps: [
        'Comparar con ECG previos y valorar síntomas y signos vitales. Si se identifica por primera vez, se recomienda un ecocardiograma transtorácico para evaluar cardiopatía estructural.',
        'Ante sospecha de síndrome coronario agudo, se requiere evaluación urgente con el ECG completo, trazados seriados y troponina según el protocolo local.',
      ],
      urgent: urgentEs,
      sourceIds: ['aha-conduction', 'acc-brady', 'aha-chest-pain', 'aha-warning-signs'],
    },
    indeterminate: {
      impression: 'La información disponible no permite formular un diagnóstico presuntivo.',
      initialSteps: [
        'Revisar la calidad, las 12 derivaciones y la calibración. Si la incertidumbre persiste, obtener un ECG de 12 derivaciones legible para revisión clínica.',
        'La urgencia se decide según los síntomas y signos vitales, incluso si el resultado del ECG es indeterminado.',
      ],
      urgent: urgentEs,
      sourceIds: ['aha-tech', 'aha-chest-pain', 'aha-warning-signs'],
    },
  },
  en: {
    sinus: {
      impression: 'ECG pattern consistent with sinus rhythm.',
      initialSteps: [
        'Assess symptoms, vital signs and heart rate, and review the rest of the ECG.',
        'If the person is stable and the rate is appropriate, sinus rhythm alone requires no specific treatment.',
      ],
      urgent: urgentEn,
      sourceIds: ['nhlbi-heart', 'aha-chest-pain', 'aha-warning-signs'],
    },
    af: {
      impression: 'ECG pattern consistent with atrial fibrillation.',
      initialSteps: [
        'Confirm the rhythm through clinical review of a readable ECG, and assess ventricular rate, vital signs and hemodynamic stability.',
        'If stable, the clinical team assesses episode duration, rate or rhythm control, and whether anticoagulation is indicated based on stroke and bleeding risk.',
        'Hemodynamic instability caused by atrial fibrillation requires immediate care. The emergency team performs synchronized electrical cardioversion when indicated.',
      ],
      urgent: 'Call emergency services for acute chest pain, severe difficulty breathing, loss of consciousness or signs of stroke such as sudden arm weakness or speech difficulty.',
      sourceIds: ['acc-af', 'aha-tachy', 'aha-warning-signs'],
    },
    rbbb: {
      impression: 'ECG pattern consistent with complete right bundle branch block.',
      initialSteps: [
        'Compare with prior ECGs and assess whether the finding is new, whether symptoms are present and whether other conduction abnormalities coexist.',
        'If structural heart disease is suspected, the clinical team may consider transthoracic echocardiography.',
      ],
      urgent: urgentEn,
      sourceIds: ['aha-conduction', 'acc-brady', 'aha-warning-signs'],
    },
    lbbb: {
      impression: 'ECG pattern consistent with complete left bundle branch block.',
      initialSteps: [
        'Compare with prior ECGs and assess symptoms and vital signs. For newly identified left bundle branch block, transthoracic echocardiography is recommended to assess for structural heart disease.',
        'Suspected acute coronary syndrome requires urgent assessment with the full ECG, serial tracings and troponin testing per the local protocol.',
      ],
      urgent: urgentEn,
      sourceIds: ['aha-conduction', 'acc-brady', 'aha-chest-pain', 'aha-warning-signs'],
    },
    indeterminate: {
      impression: 'The available information is insufficient to form a presumptive diagnosis.',
      initialSteps: [
        'Check tracing quality, all 12 leads and calibration. If uncertainty persists, obtain a readable 12-lead ECG for clinical review.',
        'Use symptoms and vital signs to determine urgency, including when the ECG result is indeterminate.',
      ],
      urgent: urgentEn,
      sourceIds: ['aha-tech', 'aha-chest-pain', 'aha-warning-signs'],
    },
  },
};

export function getManagement(id: FindingId, language: EvidenceLanguage): Management {
  return management[language][id];
}
