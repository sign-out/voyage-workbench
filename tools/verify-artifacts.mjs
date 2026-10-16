import {readFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {extractFile,listPackage} from '@electron/asar';
import {assertSafePackageEntries,assertReleaseVersions} from './release-checks.mjs';

const digest=data=>createHash('sha256').update(data).digest('hex');
const metadata=JSON.parse(readFileSync('package.json','utf8'));
const artifactRoot=process.env.VOYAGE_ARTIFACT_ROOT||'releases';
assertReleaseVersions(metadata,JSON.parse(readFileSync('package-lock.json','utf8')),readFileSync('android/app/build.gradle','utf8'));
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
function same(actual,source,label){if(digest(actual)!==digest(readFileSync(source)))throw new Error(label+' has stale or changed content: '+source);}
for(const platform of ['linux','win']){
 const resources=`${artifactRoot}/${platform}-unpacked/resources`,file=resources+'/app.asar';
 assertSafePackageEntries(listPackage(file));
 const packaged=JSON.parse(extractFile(file,'package.json').toString());
 if(packaged.main!==metadata.main||packaged.version!==metadata.version)throw new Error(platform+' package has stale metadata.');
 for(const source of ['build/desktop/main.cjs','build/desktop/preload.cjs',...files('dist')])same(extractFile(file,source.replaceAll(path.sep,'/')),source,platform);
 for(const group of ['references','third-party']){
  if(existsSync(path.join(resources,group)))throw new Error(platform+' contains duplicate '+group+' resources.');
  for(const source of files('apps/workbench/public/'+group))same(extractFile(file,'dist/'+group+'/'+path.relative('apps/workbench/public/'+group,source).replaceAll(path.sep,'/')),source,platform);
 }
 for(const source of files('.desktop-runtime/'+(platform==='win'?'windows':'linux')))same(readFileSync(path.join(resources,'provider',path.relative('.desktop-runtime/'+(platform==='win'?'windows':'linux'),source))),source,platform);
 const notices=JSON.parse(extractFile(file,'dist/third-party/SOURCES.json').toString());
 if(notices.workbenchVersion!==metadata.version)throw new Error(platform+' notices have a stale application version.');
 console.log(platform+' '+metadata.version+': compiled-only package, host, UI, references, notices and provider runtime verified');
}
const signer=process.env.VOYAGE_OSSLSIGNCODE||'.build-tools/signing/build/osslsigncode';
const certificate=path.join(os.homedir(),'.local/share/voyage-signing/windows-test.pem');
for(const executable of [`${artifactRoot}/win-unpacked/Voyage Workbench.exe`,`${artifactRoot}/Voyage Workbench ${metadata.version}.exe`]){
 execFileSync(signer,['verify','-CAfile',certificate,'-in',executable],{stdio:['ignore','pipe','pipe']});
 console.log(path.basename(executable)+': Windows Authenticode SHA-256 signature verified against the test certificate');
}
