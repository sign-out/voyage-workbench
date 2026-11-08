import {build} from 'esbuild';
import {mkdirSync,readFileSync,copyFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const output=path.resolve('android/sync/build/generated/sync-assets');mkdirSync(output,{recursive:true});
const result=await build({entryPoints:['apps/sync/main.ts'],bundle:true,platform:'browser',format:'iife',target:'chrome70',minify:true,outfile:path.join(output,'sync.js'),metafile:true,sourcemap:false});
const forbidden=Object.keys(result.metafile.inputs).filter(name=>/packages\/core\/(project|providers|world-creation|agent-)|hosts\/|node_modules\/(react|electron|@capacitor)\//.test(name));
if(forbidden.length)throw new Error('Full Workbench dependencies leaked into the micro app: '+forbidden.join(', '));
for(const name of ['index.html','style.css'])copyFileSync('apps/sync/'+name,path.join(output,name));
copyFileSync('packages/core/voyage-compatibility.json',path.join(output,'voyage-profiles.json'));
writeFileSync(path.join(output,'licenses.txt'),readFileSync('LICENSE','utf8')+'\n\njs-sha256 (MIT), if present in the generated shared code:\n'+readFileSync('node_modules/js-sha256/LICENSE.txt','utf8'));
const bytes=Object.values(result.metafile.outputs).reduce((sum,entry)=>sum+entry.bytes,0);if(bytes>350*1024)throw new Error('Sync UI exceeded the 350 KiB JavaScript budget: '+bytes);
console.log('Voyage Sync UI: '+bytes+' JavaScript bytes; no Workbench, React, Capacitor or provider runtime.');
