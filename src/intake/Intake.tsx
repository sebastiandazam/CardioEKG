import {ClinicalDisclaimer} from '../ClinicalDisclaimer';
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Language } from '../locale'
import { Terms } from '../terms/context'
import './intake.css'
import { canContinueSafety } from './policy';
import { FormatExamples } from './FormatExamples'

type Safety = 'clear' | 'urgent' | 'uncertain'
type Age = 'adult' | 'minor' | 'unknown'
type Indication = 'rhythm' | 'symptoms' | 'followUp' | 'other'
type Setting = 'outpatient' | 'hospital' | 'unknown'
type TraceFormat = 'twelve' | 'partial' | 'unknown'

export interface IntakeAnswers {
  age: 'adult'
  safety: Safety
  warningAcknowledged: boolean
  indication: Indication
  setting: Setting
  format: 'twelve'
}

const es = {
  flow: 'Preparar el ECG',
  steps: ['Seguridad', 'Contexto', 'Trazado'],
  back: 'Volver',
  next: 'Continuar',
  capture: 'Cargar imagen o PDF',
  safetyTitle: 'Antes de cargar el trazado',
  safetyIntro: 'Esta guía ayuda a revisar ECG de adultos. Si hay signos de alarma, la atención urgente tiene prioridad.',
  emergency: '¿Hay signos de alarma en una persona real?',
  emergencyExamples: 'Dolor o presión en el pecho, falta de aire intensa, pérdida reciente del conocimiento o dificultad súbita para hablar o mover un lado del cuerpo.',
  safetyOptions: { clear: 'No hay signos de alarma', urgent: 'Sí, hay signos de alarma', uncertain: 'No sé' },
  emergencyTitle: 'Busca atención de urgencia',
  emergencyMessage: 'Llama al número local de emergencias o activa el protocolo de tu institución. No esperes a completar la revisión del ECG.',
  uncertaintyTitle: 'Aclara primero los signos de alarma',
  uncertaintyMessage: 'Si sospechas una urgencia, llama al número local de emergencias. Si estás en un servicio de salud, solicita valoración clínica antes de continuar.',
  alarmSource: 'Signos de alarma · American Heart Association',
  age: '¿El ECG corresponde a una persona adulta?',
  ageOptions: { adult: '18 años o más', minor: 'Menor de 18 años', unknown: 'Edad desconocida' },
  ageBlock: 'Para continuar, confirma que el trazado corresponde a una persona adulta. La interpretación pediátrica requiere criterios específicos.',
  contextTitle: 'Ubica el ECG en su contexto',
  contextIntro: 'El contexto orienta la revisión. Estas respuestas se usan durante la sesión.',
  indication: '¿Por qué se tomó el ECG?',
  indications: { rhythm: 'Palpitaciones o sospecha de arritmia', symptoms: 'Otros síntomas', followUp: 'Control o seguimiento', other: 'Otro motivo o motivo desconocido' },
  setting: '¿Dónde se obtuvo el ECG?',
  settings: { outpatient: 'Consulta o control ambulatorio', hospital: 'Urgencias u hospitalización', unknown: 'Otro entorno o entorno desconocido' },
  traceTitle: 'Comprueba las imágenes',
  traceIntro: 'Puedes subir la hoja completa como imagen o PDF, o una imagen por derivación del mismo registro. Una tira larga de II ayuda a revisar el ritmo.',
  format: '¿Qué registro tienes disponible?',
  formats: { twelve: 'ECG de 12 derivaciones', partial: 'Tira de ritmo o ECG incompleto', unknown: 'No conozco el formato' },
  formatBlock: 'Completa las 12 derivaciones antes de cargar las imágenes. Las etiquetas del trazado deben indicar I, II, III, aVR, aVL, aVF y V1 a V6.',
  privacyHeading: 'Protege los datos del trazado',
  clinicalPrivacy: 'Confirmo que tengo autorización para revisar este ECG y que las imágenes carecen de identificadores.',
  privacyHint: 'Conserva las etiquetas y la calibración. Oculta el nombre, el documento, la fecha de nacimiento y otros datos identificativos.',
}

const copyByLanguage: Record<Language, typeof es> = {
  es,
  en: {
    flow: 'Prepare the ECG',
    steps: ['Safety', 'Context', 'Tracing'],
    back: 'Back',
    next: 'Continue',
    capture: 'Add image or PDF',
    safetyTitle: 'Before you add the tracing',
    safetyIntro: 'This guide helps review adult ECGs. Warning signs require urgent care first.',
    emergency: 'Is a real person experiencing any warning signs?',
    emergencyExamples: 'Chest pain or pressure, severe shortness of breath, recent loss of consciousness, or sudden difficulty speaking or moving one side of the body.',
    safetyOptions: { clear: 'No warning signs', urgent: 'Yes, there are warning signs', uncertain: 'Unsure' },
    emergencyTitle: 'Seek emergency care',
    emergencyMessage: 'Call your local emergency number or activate your institution’s emergency response. Get help immediately while the ECG review is pending.',
    uncertaintyTitle: 'Check for warning signs first',
    uncertaintyMessage: 'If you suspect an emergency, call your local emergency number. In a healthcare setting, request clinical assessment before continuing.',
    alarmSource: 'Warning signs · American Heart Association',
    age: 'Was the ECG recorded from an adult?',
    ageOptions: { adult: '18 years or older', minor: 'Under 18', unknown: 'Age unknown' },
    ageBlock: 'Confirm that the tracing is from an adult before continuing. Pediatric ECGs require age-specific interpretation.',
    contextTitle: 'Add clinical context',
    contextIntro: 'The context helps guide the review. Your answers are used during this session.',
    indication: 'Why was the ECG recorded?',
    indications: { rhythm: 'Palpitations or suspected arrhythmia', symptoms: 'Other symptoms', followUp: 'Routine check or follow-up', other: 'Another reason or reason unknown' },
    setting: 'Where was the ECG recorded?',
    settings: { outpatient: 'Clinic or outpatient setting', hospital: 'Emergency department or inpatient setting', unknown: 'Another setting or setting unknown' },
    traceTitle: 'Check the images',
    traceIntro: 'Upload the full sheet as an image or PDF, or one image per lead from the same recording. A long lead II strip helps with rhythm review.',
    format: 'Which tracing do you have?',
    formats: { twelve: '12-lead ECG', partial: 'Rhythm strip or incomplete ECG', unknown: 'Format unknown' },
    formatBlock: 'Gather all 12 leads before adding images. Look for the labels I, II, III, aVR, aVL, aVF and V1 to V6.',
    privacyHeading: 'Protect the information on the tracing',
    clinicalPrivacy: 'I confirm that I am authorized to review this ECG and that the images contain no identifiers.',
    privacyHint: 'Keep the lead labels and calibration visible. Cover names, IDs, birth dates and other identifying information.',
  },
}

function Choices<T extends string>({ legend, options, value, onChange, hint }: {
  legend: string
  options: Record<T, string>
  value: T | null
  onChange: (value: T) => void
  hint?: string
}) {
  const group = useId()
  return <fieldset className="intake-choices" aria-describedby={hint ? `${group}-hint` : undefined}>
    <legend><Terms>{legend}</Terms></legend>
    {hint && <p className="intake-hint" id={`${group}-hint`}>{hint}</p>}
    <div className="intake-options">
      {(Object.keys(options) as T[]).map(option => <label className="intake-option" key={option}>
        <input type="radio" name={group} value={option} checked={value === option} onChange={() => onChange(option)}/>
        <span>{options[option]}</span>
      </label>)}
    </div>
  </fieldset>
}

export function Intake({ language, onBack, onComplete }: {
  language: Language
  onBack: () => void
  onComplete: (answers: IntakeAnswers) => void
}) {
  const copy = copyByLanguage[language]
  const [step, setStep] = useState(0)
  const [safety, setSafety] = useState<Safety | null>(null)
  const [age, setAge] = useState<Age | null>(null)
  const [indication, setIndication] = useState<Indication | null>(null)
  const [setting, setSetting] = useState<Setting | null>(null)
  const [format, setFormat] = useState<TraceFormat | null>(null)
  const [consent, setConsent] = useState(false)
  const [warningAcknowledged, setWarningAcknowledged] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const warning = useRef<HTMLDivElement>(null)
  const paused = safety === 'urgent' || safety === 'uncertain'

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  useEffect(() => {
    if (paused) warning.current?.focus()
  }, [paused, safety])

  const ready = canContinueSafety(safety, warningAcknowledged) && age === 'adult'
    && (step === 0 || !!(indication && setting && (step === 1 || (format === 'twelve' && consent))))

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready) return
    if (step < 2) setStep(step + 1)
    else if (age === 'adult' && indication && setting && format === 'twelve' && consent) {
      onComplete({ age, indication, setting, format, safety: safety!, warningAcknowledged: paused && warningAcknowledged })
    }
  }

  return <section className="intake" aria-labelledby="intake-heading">
    <div className="intake-progress">
      <span>{copy.flow}</span>
      <ol aria-label={copy.flow}>
        {copy.steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}>{label}</li>)}
      </ol>
    </div>
    <form className="intake-sheet" onSubmit={submit}>
      <h1 tabIndex={-1} id="intake-heading" ref={heading}>
        {[copy.safetyTitle, copy.contextTitle, copy.traceTitle][step]}
      </h1>
      <p className="intake-intro"><Terms>{[copy.safetyIntro, copy.contextIntro, copy.traceIntro][step]}</Terms></p>

      <ClinicalDisclaimer language={language}/>

      {step === 0 && <>
        <Choices legend={copy.emergency} hint={copy.emergencyExamples} value={safety} onChange={value => { setSafety(value); setWarningAcknowledged(false) }}
          options={copy.safetyOptions}/>
        {paused && <div className="intake-warning" role="alert" tabIndex={-1} ref={warning}>
          <strong>{safety === 'urgent' ? copy.emergencyTitle : copy.uncertaintyTitle}</strong>
          <p>{safety === 'urgent' ? copy.emergencyMessage : copy.uncertaintyMessage}</p>
          <p>{language === 'es' ? 'Descargo de responsabilidad: CardioEKG es una herramienta educativa y de apoyo. No ofrece un diagnóstico definitivo, no sustituye la valoración profesional ni los servicios de urgencias y puede producir resultados erróneos o indeterminados. Continuar no significa que sea seguro esperar ni que se haya descartado una urgencia.' : 'Disclaimer: CardioEKG is an educational support tool. It does not provide a definitive diagnosis, replace professional assessment or emergency services, and may produce incorrect or indeterminate results. Continuing does not mean it is safe to wait or that an emergency has been ruled out.'}</p>
          <label className="intake-option"><input type="checkbox" checked={warningAcknowledged} onChange={event => setWarningAcknowledged(event.target.checked)}/><span>{language === 'es' ? 'He leído el aviso. Entiendo que la revisión no debe retrasar la atención urgente y deseo continuar.' : 'I have read this notice. I understand that reviewing the ECG must not delay emergency care, and I wish to continue.'}</span></label>
          <a href="https://www.heart.org/en/about-us/heart-attack-and-stroke-symptoms" target="_blank" rel="noreferrer">{copy.alarmSource}</a>
        </div>}
        {safety !== null && <>
          <Choices legend={copy.age} options={copy.ageOptions} value={age} onChange={setAge}/>
          {age && age !== 'adult' && <p className="intake-note" role="status">{copy.ageBlock}</p>}
        </>}
      </>}

      {step === 1 && <>
        <Choices legend={copy.indication} options={copy.indications} value={indication} onChange={setIndication}/>
        <Choices legend={copy.setting} options={copy.settings} value={setting} onChange={setSetting}/>
      </>}

      {step === 2 && <>
        <FormatExamples language={language} onChoose={setFormat}/>
        <Choices legend={copy.format} options={copy.formats} value={format} onChange={setFormat}/>
        {format && format !== 'twelve' && <p className="intake-note" role="status">{copy.formatBlock}</p>}
        {format === 'twelve' && <div className="intake-privacy">
          <h2>{copy.privacyHeading}</h2>
          <p>{copy.privacyHint}</p>
          <label className="intake-option"><input type="checkbox" checked={consent} onChange={event => setConsent(event.currentTarget.checked)}/><span>{copy.clinicalPrivacy}</span></label>
        </div>}
      </>}

      <div className="intake-actions">
        <button type="button" className="intake-back" onClick={() => step === 0 ? onBack() : setStep(step - 1)}>{copy.back}</button>
        <button type="submit" className="intake-next" disabled={!ready}>{step === 2 ? copy.capture : copy.next}<span aria-hidden="true">↗</span></button>
      </div>
    </form>
  </section>
}

export function SafetyReminder({language}:{language:Language}) {
  return <div className="intake-warning intake-safety-reminder" role="note">
    <strong>{language==='es'?'Signos de alarma: prioriza la atención urgente':'Warning signs: prioritize emergency care'}</strong>
    <p>{language==='es'?'No esperes al resultado de CardioEKG. Llama al número local de emergencias o activa el protocolo institucional. Esta herramienta de apoyo no sustituye la valoración profesional ni descarta una urgencia.':'Do not wait for CardioEKG’s result. Call your local emergency number or activate your institution’s response. This support tool does not replace professional assessment or rule out an emergency.'}</p>
  </div>;
}
