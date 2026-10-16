export function assertSafePackageEntries(entries){
 for(const entry of entries){
  const file=entry.replace(/^\//,'');
  if(!file||['build','build/desktop','dist'].includes(file))continue;
  if(file==='package.json'||/^build\/desktop\/(main|preload)\.cjs$/.test(file))continue;
  if(!file.startsWith('dist/'))throw new Error('Unexpected application package entry: '+file);
  if(file.split('/').some(part=>['..','.git','.codex','.workbench','.workbench-next','node_modules','userdata'].includes(part.toLowerCase()))||/\.(map|tsx?|py|jks|keystore|p12|pfx|sqlite|db|zip|tgz|gz)$/i.test(file)||/(^|\/)(auth\.json|credentials\.bin|\.env(?:\..*)?)$/i.test(file))throw new Error('Private, source, or development material in application package: '+file);
 }
}

export function assertReleaseVersions(metadata,lock,android){
 if(metadata.version!==lock.version||metadata.version!==lock.packages?.['']?.version)throw new Error('Application and lockfile versions differ.');
 const androidVersion=/versionName\s+"([^"]+)"/.exec(android)?.[1];
 if(androidVersion!==metadata.version)throw new Error('Android and desktop versions differ.');
 if(metadata.main!=='build/desktop/main.cjs')throw new Error('Invalid desktop entry point.');
 if(!metadata.build?.files?.includes('!node_modules/**')||!metadata.build.files.includes('!**/*.map'))throw new Error('Packaging must exclude dependency trees and source maps.');
 if(metadata.dependencies?.['@capacitor/cli'])throw new Error('Capacitor CLI is a build dependency, not an application runtime.');
 if(!metadata.dependencies?.['js-sha256'])throw new Error('Hashing dependency must be declared for clean installs.');
 if(!metadata.scripts?.['package:windows']?.includes('package:windows:signed'))throw new Error('Default Windows packaging must use the verified signing workflow.');
 for(const config of [metadata.build,metadata.build?.win,metadata.build?.linux])for(const resource of config?.extraResources||[])if(['references','third-party'].includes(resource.to))throw new Error('Reference data and notices must use their single bundled dist copy.');
}
