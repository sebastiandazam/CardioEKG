import { memo, useEffect, useId, useRef, useState } from 'react'
import { getEvidence, type EvidenceLanguage } from '../evidence'
import { technicalSegments, type TermSegment } from './lexicon'
import './terms.css'

const copy = {
  es: { close: 'Cerrar definición', source: 'Consultar fuente' },
  en: { close: 'Close definition', source: 'View source' },
}

function Definition({ text, entry, language }: {
  text: string
  entry: NonNullable<TermSegment['entry']>
  language: EvidenceLanguage
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const linkedSources = entry.sourceIds
    .map(sourceId => getEvidence(language).sources.find(item => item.id === sourceId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  useEffect(() => {
    if (!open || !trigger.current || !panel.current) return
    const anchor = trigger.current
    const popover = panel.current
    const viewport = window.visualViewport
    function place() {
      const rect = anchor.getBoundingClientRect()
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportHeight = viewport?.height ?? window.innerHeight
      const bottom = viewportTop + viewportHeight
      const margin = 12
      const gap = 8
      const width = Math.min(320, viewportWidth - margin * 2)
      popover.style.width = `${width}px`
      popover.style.maxHeight = `${viewportHeight - margin * 2}px`
      const height = popover.getBoundingClientRect().height
      const left = Math.max(viewportLeft + margin, Math.min(rect.left, viewportLeft + viewportWidth - width - margin))
      const preferredTop = rect.bottom + gap + height <= bottom - margin ? rect.bottom + gap : rect.top - gap - height
      const top = Math.max(viewportTop + margin, Math.min(preferredTop, bottom - height - margin))
      popover.style.left = `${left}px`
      popover.style.top = `${top}px`
      popover.dataset.positioned = 'true'
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    viewport?.addEventListener('resize', place)
    viewport?.addEventListener('scroll', place)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      viewport?.removeEventListener('resize', place)
      viewport?.removeEventListener('scroll', place)
      delete popover.dataset.positioned
    }
  }, [open])

  return (
    <span className="technical-term">
      <button ref={trigger} className="technical-term-trigger" type="button"
        popoverTarget={id} aria-controls={id} aria-expanded={open}>{text}</button>
      <span ref={panel} id={id} className="technical-term-definition" role="region" popover="auto"
        aria-labelledby={`${id}-term`} onToggle={event => setOpen(event.newState === 'open')}>
        <span className="technical-term-heading">
          <strong id={`${id}-term`}>{entry.term}</strong>
          <button className="technical-term-close" type="button" popoverTarget={id} popoverTargetAction="hide"
            aria-label={copy[language].close}>&times;</button>
        </span>
        <span className="technical-term-description">{entry.definition}</span>
        {linkedSources.map(src => (
          <a key={src.id} className="technical-term-source" href={src.url} target="_blank" rel="noreferrer">{src.name} ↗</a>
        ))}
      </span>
    </span>
  )
}

export const TechnicalText = memo(function TechnicalText({ children, language, enabled = true }: {
  children: string
  language: EvidenceLanguage
  enabled?: boolean
}) {
  if (!enabled) return children
  return technicalSegments(children, language, { deduplicate: true }).map((segment, index) =>
    segment.entry
      ? <Definition key={`${language}-${index}-${segment.text}`} text={segment.text} entry={segment.entry} language={language}/>
      : segment.text,
  )
})
