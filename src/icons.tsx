import type { SVGProps } from 'react'

const shapes = {
  pulse: <path d="M2 12h4l3-7 4 14 3-8 2 1h4" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  book: <><path d="M12 6C8 3 5 3 3 4v15c3-1 6-.5 9 1.5 3-2 6-2.5 9-1.5V4c-2-1-5-1-9 2Z"/><path d="M12 6v14"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
  external: <path d="M13 5h6v6m0-6-9 9m8 0v5H5V6h6"/>,
  play: <path d="m8 5 12 7-12 7Z" fill="currentColor" stroke="none"/>,
  pause: <path d="M9 5v14m6-14v14" strokeWidth="3"/>,
  step: <path d="m5 5 10 7-10 7ZM19 5v14"/>,
  wave: <path d="M2 12c3 0 3-5 6-5s3 10 6 10 4-5 8-5"/>,
  heart: <path d="M20.8 5.7a4.9 4.9 0 0 0-6.9 0L12 7.6l-1.9-1.9a4.9 4.9 0 0 0-6.9 6.9l8.8 8.2 8.8-8.2a4.9 4.9 0 0 0 0-6.9Z"/>,
  maximize: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>,
  minimize: <path d="M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5"/>,
  camera: <><path d="M4 6h4l2-3h4l2 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
  layers: <><path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5m-18 4 9 5 9-5"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  axis: <><path d="M4 4v16h16m-13-3 10-10m-5 0h5v5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
}
export type IconName = keyof typeof shapes
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name]}</svg>
}

export function GitHubMark() {
  return <svg className="github-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="#171717" d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"/></svg>
}
