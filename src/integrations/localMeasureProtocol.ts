import type {EngineResult} from './measureEngine';
export const PYODIDE_VERSION='0.27.7';
export const PYODIDE_INDEX=`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
export type LocalMeasureOptions={layout:string;speed:number;gain:number};
export type LocalMeasurePhase='runtime'|'packages'|'engine'|'measurement';
export type LocalMeasureTask={id:number;image:ArrayBuffer;options:LocalMeasureOptions}|({id:number}&import('../ecg/pythonAnalysis').PythonInput);
export type LocalMeasureResponse={id:number;kind:'progress';phase:LocalMeasurePhase}|{id:number;kind:'result';result:EngineResult}|{id:number;kind:'error';message:string};
