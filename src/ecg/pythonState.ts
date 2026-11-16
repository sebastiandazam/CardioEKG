import type {Lead,Trace,ViewerCase} from '../cases';
import type {MeasurementReasons} from './estimate';
import type {PythonAnalysis} from './pythonAnalysis';
export function emptyPythonEstimate():PythonAnalysis['estimate']{
 return {measurements:{rateBpm:null,prMs:null,qrsMs:null,qtMs:null,axisDeg:null},reasons:Object.fromEntries(['rateBpm','prMs','qrsMs','qtMs','axisDeg'].map(key=>[key,'quality'])) as MeasurementReasons,markersByLead:{},leadDetails:{},measurementLeads:{},qrsMethod:'not-evaluable',global:{pAxisDeg:null,tAxisDeg:null,prVariable:null,pConductedFraction:null,qrsAlternans:null}};
}
/** Metadata only. Signal stability and final axis acceptance belong to Python. */
export function pythonAxisEligible(traces:Partial<Record<Lead,Trace>>,provenance:ViewerCase['captureProvenance'],simultaneous:boolean){
 return !!traces.I&&!!traces.aVF&&provenance?.commonCalibration!==false&&(simultaneous||provenance?.timing==='simultaneous'||provenance?.userConfirmedComparable===true||provenance?.commonRecording===true&&provenance.commonCalibration===true);
}
