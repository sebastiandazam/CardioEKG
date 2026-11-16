import type {ViewerCase} from '../cases';
import type {IntakeAnswers} from '../intake/Intake';
export type Page='home'|'intake'|'capture'|'library'|'viewer'|'sources';
export type Session={page:Page;item:ViewerCase|null;intake:IntakeAnswers|null;caseIntake:IntakeAnswers|null;generation:number};
export const initialSession:Session={page:'home',item:null,intake:null,caseIntake:null,generation:0};
export type Action={type:'navigate';page:Page}|{type:'open';item:ViewerCase}|{type:'intake';value:IntakeAnswers}|{type:'discard'}|{type:'discard-capture'};
export function sessionReducer(state:Session,action:Action):Session {
 if(action.type==='discard-capture')return {...state,intake:null};
 if(action.type==='discard')return {...initialSession,generation:state.generation+1};
 if(action.type==='intake')return {...state,intake:action.value};
 if(action.type==='open')return {...state,page:'viewer',item:action.item,caseIntake:action.item.origin==='research'?state.intake:null,intake:action.item.origin==='research'?null:state.intake,generation:state.generation+1};
 const page=action.page==='viewer'&&!state.item?'home':action.page==='capture'&&!state.intake?'intake':action.page;
 return {...state,page};
}
export function pageFromHash(hash:string):Page {const value=hash.replace(/^#/,'');return ['home','intake','capture','library','viewer','sources'].includes(value)?value as Page:'home';}
