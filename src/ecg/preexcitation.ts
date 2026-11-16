import type {Lead} from '../cases';
export type DeltaWindow={start:number;end:number;peak:number;polarity:'positive'|'negative'};
export type DeltaEvidence={status:'supported'|'not-supported'|'not-evaluable';polarity:'positive'|'negative'|'mixed'|null;durationMs:number|null;initialSlopeMvPerMs:number|null;terminalSlopeMvPerMs:number|null;repeatableBeats:number;analyzedBeats:number;windows:DeltaWindow[]};
export type PreexcitationAggregate={status:'supported'|'not-supported'|'not-evaluable';supportingLeads:Lead[];limitations:string[]};
export type PreexcitationReview=PreexcitationAggregate&{leads:Partial<Record<Lead,DeltaEvidence>>};
