import {execFileSync} from 'node:child_process';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root=path.resolve('.');
execFileSync(process.platform==='win32'?'gradlew.bat':'./gradlew',[':sync:assembleRelease','--console=plain'],{cwd:path.join(root,'android'),stdio:'inherit',env:{...process.env,VOYAGE_NODE:process.execPath},shell:process.platform==='win32'});
const source=path.join(root,'android/sync/build/outputs/apk/release/sync-release.apk'),directory=path.join(root,'releases/sync-0.1.0-test');mkdirSync(directory,{recursive:true});
const target=path.join(directory,'Voyage-Sync-0.1.0-test-android.apk');copyFileSync(source,target);
const bytes=statSync(target).size,sha256=createHash('sha256').update(readFileSync(target)).digest('hex');
writeFileSync(target+'.sha256',sha256+'  '+path.basename(target)+'\n');
console.log(JSON.stringify({path:target,bytes,sha256,applicationId:'dev.voyage.sync',minimumAndroid:8,nativeRuntimes:false,signing:'Local Android debug keystore; prerelease test identity, not production signing.'},null,2));
