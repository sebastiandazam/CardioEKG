import type {CaptureLead} from './digitize';
const order:CaptureLead[]=['II-long','I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export const reviewLeadOrder=(photos:Partial<Record<CaptureLead,unknown>>)=>order.filter(lead=>!!photos[lead]);
export const firstReviewLead=(photos:Partial<Record<CaptureLead,unknown>>):CaptureLead=>reviewLeadOrder(photos)[0]??'I';
