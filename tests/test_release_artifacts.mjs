import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertSafePackageEntries,assertReleaseVersions} from '../tools/release-checks.mjs';

const metadata=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const android=readFileSync('android/app/build.gradle','utf8');

test('release versions, entry point and packaging exclusions agree',()=>{
 assert.doesNotThrow(()=>assertReleaseVersions(metadata,lock,android));
 assert.throws(()=>assertReleaseVersions({...metadata,version:'stale'},lock,android),/versions differ/);
 assert.throws(()=>assertReleaseVersions(metadata,lock,android.replace(metadata.version,'stale')),/versions differ/);
 assert.throws(()=>assertReleaseVersions({...metadata,main:'src/main.ts'},lock,android),/entry point/);
 assert.throws(()=>assertReleaseVersions({...metadata,build:{files:[]}},lock,android),/must exclude/);
 assert.throws(()=>assertReleaseVersions({...metadata,dependencies:{}},lock,android),/must be declared/);
 assert.throws(()=>assertReleaseVersions({...metadata,scripts:{}},lock,android),/signing workflow/);
});

test('artifact allowlist permits compiled app assets and bundled runtime only',()=>{
 assert.doesNotThrow(()=>assertSafePackageEntries(['/build','/build/desktop','/build/desktop/main.cjs','/build/desktop/preload.cjs','/package.json','/dist','/dist/assets/index.js','/dist/references/blank-world.json','/dist/third-party/SOURCES.json']));
 for(const file of ['/src/main.ts','/node_modules/react/index.js','/build/desktop/main.cjs.map','/dist/assets/index.js.map','/dist/.env','/dist/.env.production','/dist/auth.json','/dist/credentials.bin','/dist/signing.jks','/dist/worlds.sqlite','/dist/application-source.zip','/dist/.git/config','/dist/../private.json'])assert.throws(()=>assertSafePackageEntries([file]),/package/);
});
