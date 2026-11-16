import { useLanguage } from '../locale'
import { Icon } from '../icons'
import { Gradient } from './Gradient'
import { Terms } from '../terms/context'

const copyByLanguage = {
  es: {
    heading: 'Del ECG a la', emphasis: 'interpretación.',
    intro: 'Una lectura guiada del electrocardiograma de 12 derivaciones, desde la captura del trazado hasta la revisión del caso.',
    start: 'Empezar con un ECG', try: 'Explorar un caso',
    process: 'Cómo funciona', detail: 'El trazado primero.',
    privacyTitle: 'Tus imágenes se procesan aquí.',
    privacyPractice: 'Puedes revisar un ECG propio que estés autorizado a utilizar, sin identificadores, o explorar los ejemplos. Herramienta experimental: confirma los resultados con un profesional. El uso asistencial requiere validación y autorización institucional.',
    privacyClinical: 'Usa esta instalación con los registros autorizados por tu institución. La revisión del ECG y el contexto clínico siguen a cargo del profesional.',
    steps: [
      ['Responde unas preguntas', 'Sitúa el ECG en contexto. Te pediremos el motivo del estudio, el formato y si hay síntomas de alarma.'],
      ['Carga y revisa el trazado', 'Añade las imágenes de las 12 derivaciones. Comprueba la calibración y compara la reconstrucción con las fotos.'],
      ['Examina el resultado', 'Gira el corazón en 3D y relaciona la conducción y el eje disponible con el trazado. Revisa la impresión presuntiva y el manejo inicial.'],
    ],
  },
  en: {
    heading: 'From ECG to', emphasis: 'interpretation.',
    intro: 'A guided review of the 12-lead electrocardiogram, from capturing the tracing to reviewing the case.',
    start: 'Start with an ECG', try: 'Explore a sample case',
    process: 'How it works', detail: 'Start with the tracing.',
    privacyTitle: 'Your images are processed here.',
    privacyPractice: 'Review an ECG you are authorized to use, without identifiers, or explore the examples. Experimental tool: confirm results with a professional. Clinical use requires institutional validation and authorization.',
    privacyClinical: 'Use this installation for recordings authorized by your institution. The clinician remains responsible for ECG review and clinical context.',
    steps: [
      ['Answer a few questions', 'Provide context for the ECG. We ask why it was taken, what format you have, and whether there are urgent symptoms.'],
      ['Upload and review the tracing', 'Add the images for all 12 leads. Check calibration and compare the reconstructed signal with the photos.'],
      ['Review the result', 'Rotate the 3D heart and relate conduction and the available axis to the tracing. Review the presumptive impression and initial management.'],
    ],
  },
}

export function Landing({ clinical, onStart, onExample }: { clinical: boolean; onStart: () => void; onExample: () => void }) {
  const { language } = useLanguage()
  const copy = copyByLanguage[language]
  return <>
    <section className="landing-hero" aria-labelledby="landing-title">
      <Gradient/>
      <div className="hero-shade"/>
      <div className="landing-content">
        <h1 id="landing-title"><strong>{copy.heading}</strong><br/><em>{copy.emphasis}</em></h1>
        <p><Terms>{copy.intro}</Terms></p>
        <div className="landing-actions">
          <button type="button" className="landing-start" onClick={onStart}>{copy.start} <Icon name="arrow"/></button>
          <button type="button" className="landing-try" onClick={onExample}>{copy.try} <Icon name="arrow"/></button>
        </div>
      </div>
    </section>
    <section className="landing-process" aria-labelledby="process-title">
      <div className="process-title"><p>{copy.process}</p><h2 id="process-title">{copy.detail}</h2></div>
      <ol className="process-steps">{copy.steps.map(([title, explanation]) => <li key={title}><h3>{title}</h3><p><Terms>{explanation}</Terms></p></li>)}</ol>
      <p className="landing-privacy"><Icon name="lock"/> <span><strong>{copy.privacyTitle}</strong> {clinical ? copy.privacyClinical : copy.privacyPractice}</span></p>
    </section>
  </>
}
