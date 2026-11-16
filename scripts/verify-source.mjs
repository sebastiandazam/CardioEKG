/** Build from Git-tracked source with fresh dependencies; never use checkout-local fixtures. */
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
const folder=mkdtempSync(join(tmpdir(),'cardioekg-source-'));
function run(command,args,options={}){const p=spawnSync(command,args,{cwd:folder,stdio:'inherit',...options});if(p.status!==0)throw new Error(`${command} failed (${p.status})`);}
try{
 const archive=spawnSync('git',['archive','--format=tar','HEAD'],{maxBuffer:256*1024*1024});if(archive.status!==0)throw new Error('git archive failed');
 run('tar',['-xf','-'],{input:archive.stdout,stdio:['pipe','inherit','inherit']});
 for(const file of ['src/data/normal.json','src/data/afib.json','.openai/hosting.json','package-lock.json'])if(!existsSync(join(folder,file)))throw new Error(`Missing tracked file: ${file}`);
 run('npm',['ci','--no-audit','--no-fund']);run('npm',['test']);run('npm',['run','build']);
 console.log('Fresh source verification passed.');
}finally{rmSync(folder,{recursive:true,force:true});}
