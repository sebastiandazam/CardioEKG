// Produces the identical analysis code used locally, with a fixed stdin bridge.
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(resolve(root,'server/runtime'),{recursive:true});
await build({stdin:{contents:`import {analyzeCase} from './src/ecg/analyze.ts';
let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>8*1024*1024)throw new Error('Input too large');}
const item=JSON.parse(text);const result=analyzeCase(item);process.stdout.write(JSON.stringify(result));`,resolveDir:root,loader:'ts'},
 bundle:true,platform:'node',format:'esm',target:'node20',outfile:resolve(root,'server/runtime/analyze.mjs')});
console.log('Canonical analysis runtime built.');
