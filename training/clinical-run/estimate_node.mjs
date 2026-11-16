/** Compare current repository estimator on real calibrated waveform fixtures. */
import {readFileSync,writeFileSync} from 'node:fs';
import {estimateECG} from '../../src/ecg/estimate.ts';
const rows=JSON.parse(readFileSync(process.argv[2],'utf8'));
const output=rows.map(r=>({record:r.record,source:r.source,split:r.split,estimate:estimateECG({II:{mv:r.signal,seconds:r.seconds,quality:1}})}));
writeFileSync(process.argv[3],JSON.stringify(output));
