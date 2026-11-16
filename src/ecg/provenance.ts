import type {LeadDetail} from './estimate';
import type {CaptureProvenance,Lead,Trace} from '../cases';
import {estimateECG} from './estimate.ts';
export type Comparability={comparable:boolean;mode:'simultaneous'|'representative'|'confirmed'|'unknown';reason:{es:string;en:string};requiresConfirmation:boolean};
const unknown=(es:string,en:string,requiresConfirmation=true):Comparability=>({comparable:false,mode:'unknown',reason:{es,en},requiresConfirmation});
/** Provenance is evidence supplied by capture/record metadata, never inferred from similar filenames. */
export function assessComparability(traces:Partial<Record<Lead,Trace>>,provenance:CaptureProvenance|undefined,synchronized:boolean,measuredDetails?:Partial<Record<Lead,LeadDetail>>|null):Comparability {
 const pair={I:traces.I,aVF:traces.aVF};
 const details=measuredDetails===undefined?estimateECG(pair).leadDetails:measuredDetails;
 if(details===null)return unknown('El motor Python debe completar la evaluación de I y aVF.','The Python engine must finish evaluating I and aVF.',false);
 const I=details.I,avf=details.aVF;
 if(!I?.qrsMs||!avf?.qrsMs||I.netQrsMvMs===null||avf.netQrsMvMs===null)return unknown('I o aVF no permiten delimitar un QRS con área neta evaluable. Revisa la señal antes de confirmar comparabilidad.','I or aVF lack a delineable QRS with an evaluable net area. Review the signal before confirming comparability.',false);
 if(provenance&&!provenance.commonCalibration)return unknown('La calibración de I y aVF no coincide o no se ha verificado.','Calibration of I and aVF differs or has not been verified.');
 if(synchronized||provenance?.timing==='simultaneous')return {comparable:true,mode:'simultaneous',requiresConfirmation:false,reason:{es:'Derivaciones simultáneas con complejos delimitables. El eje se calcula del registro, sin una casilla adicional.',en:'Simultaneous leads with delineable complexes. Axis is calculated from the recording without an additional checkbox.'}};
 if(provenance?.userConfirmedComparable)return {comparable:true,mode:'confirmed',requiresConfirmation:false,reason:{es:'Comparabilidad y calibración confirmadas por el usuario; eje de complejos representativos, no necesariamente simultáneos.',en:'Comparability and calibration confirmed by the user; axis from representative, not necessarily simultaneous, complexes.'}};
 if(!provenance?.commonRecording||!provenance.commonCalibration)return unknown('Confirma que I y aVF pertenecen al mismo ECG y tienen la misma calibración.','Confirm that I and aVF belong to the same ECG and use the same calibration.');
 const rate=(p:number[])=>p.length>=2?60/((p.at(-1)!-p[0])/(p.length-1)):null;
 const rI=rate(I.peaksSeconds),rAvf=rate(avf.peaksSeconds);
 const stable=I.beatCount>=2&&avf.beatCount>=2&&I.rrCv!==null&&avf.rrCv!==null&&I.rrCv<=.15&&avf.rrCv<=.15&&rI!==null&&rAvf!==null&&Math.abs(rI-rAvf)/Math.max(rI,rAvf)<=.15;
 if(!stable)return unknown('Las ventanas de I y aVF son sucesivas y no muestran estabilidad suficiente para asumir complejos comparables. Confirma la correspondencia o revisa el trazado.','The I and aVF windows are sequential and lack sufficient stability to assume comparable complexes. Confirm correspondence or review the tracing.');
 return {comparable:true,mode:'representative',requiresConfirmation:false,reason:{es:'Mismo ECG y calibración, con ritmo estable en I y aVF. Eje aproximado de complejos representativos en ventanas sucesivas.',en:'Same ECG and calibration, with stable rhythm in I and aVF. Approximate axis from representative complexes in sequential windows.'}};
}
