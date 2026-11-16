import { readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { buildNotices } from './notices.mjs'

const worker = await build({
  entryPoints: ['src/research/research.worker.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  minify: true,
  target: 'es2022',
})

const { outputFiles } = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'iife',
  outfile: 'app.js',
  write: false,
  minify: true,
  jsx: 'automatic',
  target: 'es2022',
  loader: { '.ttf': 'dataurl' },
  define: {
    'import.meta.env.MODE': '"public"',
    'import.meta.env.VITE_EMBEDDED_PHOTO_WORKER': JSON.stringify(worker.outputFiles[0].text),
    'import.meta.env.VITE_APPROVED_MODEL': 'undefined',
    'import.meta.env.VITE_APPROVED_RESEARCH': '"0"',
    'process.env.NODE_ENV': '"production"',
  },
})
const javascript = outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script')
const css = outputFiles.find(file => file.path.endsWith('.css')).text
const mark = (await readFile('public/mark.svg')).toString('base64')
const notices = buildNotices().replace(/-->/g, '--&gt;')
const html = (await readFile('index.html', 'utf8'))
  .replace('<!doctype html>', () => `<!doctype html>\n<!--\n${notices}\n-->`)
  .replace('./mark.svg', `data:image/svg+xml;base64,${mark}`)
  .replace('</head>', () => `<style>${css}</style></head>`)
  .replace('<script type="module" src="/src/main.tsx"></script>', () => `<script>${javascript}</script>`)
await writeFile('Cardioscopio.html', html)
