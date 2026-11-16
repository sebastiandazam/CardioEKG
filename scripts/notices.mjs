import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const read = path => readFileSync(path, 'utf8').trim()

export function buildNotices() {
  const packageNotices = ['react', 'react-dom', 'scheduler', 'tesseract.js', 'tesseract.js-core', 'pdfjs-dist', 'jspdf'].map(name => {
    const folder = dirname(require.resolve(`${name}/package.json`))
    return `${name}\n\n${read(join(folder, name === 'tesseract.js' ? 'LICENSE.md' : 'LICENSE'))}`
  })
  return [
    read(new URL('../LICENSE', import.meta.url)),
    read(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url)),
    read(new URL('../src/fonts/InstrumentSerif-OFL.txt', import.meta.url)),
    read(new URL('../src/fonts/InstrumentSans-OFL.txt', import.meta.url)),
    read(new URL('../src/anatomy/ATTRIBUTION.md', import.meta.url)),
    read(new URL('../src/anatomy/LICENSE-HEARTDEFORMNETS.txt', import.meta.url)),
    read(new URL('../public/anatomy/LICENSE-HRA.txt', import.meta.url)),
    read(new URL('../public/anatomy/LICENSE-CONTENT.txt', import.meta.url)),
    ...packageNotices,
  ].join('\n\n')
}
