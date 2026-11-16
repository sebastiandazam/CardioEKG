import {buildLiteratureIndex} from './scripts/literature-index.mjs'
import { defineConfig } from 'vite'
import {readFileSync} from 'node:fs'
import { buildNotices } from './scripts/notices.mjs'
import {cloudflare} from '@cloudflare/vite-plugin'

export default defineConfig(({ mode }) => {
  return {
    base: './',
    plugins: [cloudflare({viteEnvironment:{name:'server'}}),{
      name: 'distribution-notices',
      generateBundle() {
        if(this.environment?.name==='server')return
        this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: buildNotices() })
        this.emitFile({type:'asset',fileName:'clinical-literature.json',source:JSON.stringify(buildLiteratureIndex(),null,2)})
        for(const file of ['ecg_analisis.py','run_measure.py'])this.emitFile({type:'asset',fileName:'python-engine/'+file,source:readFileSync(new URL('./server/measure/'+file,import.meta.url),'utf8')})
      },
    }],
    build: {
      outDir: mode === 'research' ? 'dist-research' : 'dist',
      rollupOptions: { output: { manualChunks: id => id.includes('/src/data/') ? 'ecg-records' : undefined } },
    },
    server: { host: '127.0.0.1', strictPort: true },
    preview: { host: '127.0.0.1', strictPort: true },
  }
})
