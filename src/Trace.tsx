import type {DeltaWindow} from './ecg/preexcitation';
import { memo, useId, useMemo } from 'react'
import { useLanguage } from './locale'
import type { Marker, Trace as TraceData } from './cases'

export function tracePath(trace: TraceData, from: number, length: number, width: number, height: number, pixelsPerMv: number) {
  const sampleRate = trace.mv.length / trace.seconds
  const first = Math.max(0, Math.floor(from * sampleRate))
  const last = Math.min(trace.mv.length, Math.ceil((from + length) * sampleRate))
  const stride = Math.max(1, Math.floor((last - first) / (width * 2)))
  let path = ''
  for (let i = first; i < last; i += stride) {
    const x = (i / sampleRate - from) / length * width
    const y = height * 0.55 - trace.mv[i] * pixelsPerMv
    path += `${i === first ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return path
}

export const Spark = memo(function Spark({ trace }: { trace: TraceData | undefined }) {
  return <svg className="spark" viewBox="0 0 136 42" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 23H136" stroke="#f7e9e6" strokeDasharray="2 3"/>
    {trace && <path d={tracePath(trace, 0, Math.min(trace.seconds, 3), 136, 42, 12)} fill="none" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke"/>}
  </svg>
})

export function Trace({ trace, lead, from, length, cursor, active, onSeek, boundaries, measurementWindows,deltaWindows }: {
  deltaWindows?:DeltaWindow[];measurementWindows?:{start:number;end:number;label:string;source?:'automatic'|'manual'}[];boundaries?:Marker[];trace: TraceData | undefined; lead: string; from: number; length: number; cursor: number | null; active: Marker | null; onSeek: (time: number) => void
}) {
  const { copy } = useLanguage()
  const id = useId().replace(/:/g, '')
  const width = 720
  const height = 252
  const perMv = useMemo(() => {
    const peak = trace?.mv.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0) ?? 0
    if (peak <= 1.45) return 72
    return peak <= 2.9 ? 36 : 18
  }, [trace])
  const smallX = width * 0.04 / length
  const smallY = perMv / 10
  const path = useMemo(() => trace ? tracePath(trace, from, length, width, height, perMv) : '', [trace, from, length])
  return (
    <div className="plot">
      <div className="plot-lead"><span></span> {lead}</div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${copy.traceLabel} ${lead}`} preserveAspectRatio="none" onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        onSeek(from + (event.clientX - rect.left) / rect.width * length)
      }}>
        <defs>
          <pattern id={`${id}-small`} width={smallX} height={smallY} patternUnits="userSpaceOnUse">
            <path d={`M ${smallX} 0 L 0 0 0 ${smallY}`} fill="none" stroke="#f8eeec" strokeWidth=".8"/>
          </pattern>
          <pattern id={`${id}-big`} width={smallX * 5} height={smallY * 5} patternUnits="userSpaceOnUse">
            <rect width={smallX * 5} height={smallY * 5} fill={`url(#${id}-small)`}/>
            <path d={`M ${smallX * 5} 0 L 0 0 0 ${smallY * 5}`} fill="none" stroke="#f3e3df" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width={width} height={height} fill={`url(#${id}-big)`}/>
        {boundaries?.filter(m=>Number.isFinite(m.start)&&Number.isFinite(m.end)&&m.end>m.start&&m.start<from+length&&m.end>from).map((m,i)=><g key={`${m.phase}-${m.start}-${i}`} stroke={m.phase==='p'?'#177351':m.phase==='qrs'?'#a92b25':'#216bb1'} opacity=".5"><title>{m.phase.toUpperCase()} · {m.start.toFixed(3)}–{m.end.toFixed(3)} s</title>{[m.start,m.end].map((at,j)=><line key={j} x1={(at-from)/length*width} x2={(at-from)/length*width} y1="0" y2={height} strokeWidth=".6" strokeDasharray="2 5" vectorEffect="non-scaling-stroke"/>)}</g>)}
        {measurementWindows?.filter(w=>w.start<from+length&&w.end>from).map((w,i)=><g key={`manual-${i}`} stroke={w.source==='automatic'?'#57677d':'#531c66'}><title>{w.label}: {w.start.toFixed(3)}–{w.end.toFixed(3)} s · {w.source??'manual'}</title>{[w.start,w.end].map((at,j)=><line key={j} x1={(at-from)/length*width} x2={(at-from)/length*width} y1="0" y2={height} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}</g>)}
        {deltaWindows?.filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start&&w.start<from+length&&w.end>from).map((w,i)=><g key={`delta-${i}`}><title>{copy.locale.startsWith('es')?'Candidato de onda delta':'Delta-wave candidate'} · {((w.end-w.start)*1000).toFixed(1)} ms · {w.polarity}</title><rect x={Math.max(0,(w.start-from)/length*width)} y="0" width={(Math.min(w.end,from+length)-Math.max(w.start,from))/length*width} height={height} fill="#7d3cb5" opacity=".14"/>{[w.start,w.end].filter(at=>at>=from&&at<=from+length).map((at,j)=><line key={j} x1={(at-from)/length*width} x2={(at-from)/length*width} y1="0" y2={height} stroke="#7d3cb5" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/>)}</g>)}
        {active && <rect x={(active.start - from) / length * width} width={(active.end - active.start) / length * width} height={height} fill="#ef9e8f" opacity=".18"/>}
        <path d={path} stroke="#ba6151" strokeWidth="1.8" fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>
        {cursor !== null && cursor >= from && cursor <= from + length &&
          <path d={`M${(cursor - from) / length * width} 0V${height}`} stroke="#ce6f5e" strokeWidth="1.2" opacity=".75" strokeDasharray="5 4" vectorEffect="non-scaling-stroke"/>}
      </svg>
      <div className="plot-scale" aria-hidden="true">{copy.gridScale}</div>
    </div>
  )
}
