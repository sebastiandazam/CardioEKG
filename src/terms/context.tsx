import { createContext, useContext } from 'react'
import { useLanguage } from '../locale'
import { TechnicalText } from './TechnicalText'

export const TermsEnabled = createContext(true)

export function Terms({ children }: { children: string }) {
  const { language } = useLanguage()
  const enabled = useContext(TermsEnabled)
  return <TechnicalText language={language} enabled={enabled}>{children}</TechnicalText>
}
