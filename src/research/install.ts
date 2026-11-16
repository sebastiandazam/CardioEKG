import { readApprovedModel } from './protocol'

export { ResearchCapture } from './ResearchCapture'
export const approvedModel = import.meta.env.MODE === 'research' && import.meta.env.VITE_APPROVED_RESEARCH === '1'
  ? readApprovedModel(import.meta.env.VITE_APPROVED_MODEL)
  : undefined
