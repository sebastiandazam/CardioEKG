import {clinicalScope} from './clinicalScope';
export function ClinicalDisclaimer({language}:{language:'es'|'en'}){
 return <details className="clinical-disclaimer clinical-disclaimer--compact" aria-label={language==='es'?'Descargo de responsabilidad':'Disclaimer'}><summary>{language==='es'?'Uso educativo: no es un diagnóstico ni sustituye la valoración profesional o la atención urgente.':'Educational use: not a diagnosis and no substitute for professional assessment or urgent care.'}</summary><p>{clinicalScope[language]}</p></details>;
}
