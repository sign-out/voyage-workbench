import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const version=JSON.parse(readFileSync('package.json','utf8')).version;
const inspect=(...args)=>JSON.parse(execFileSync('python3',['tools/assemble-test-release.py','--dry-run',...args],{encoding:'utf8'}));

test('patched uuid preserves the Xcode helper CommonJS v4 API',()=>{
 const require=createRequire(import.meta.url);
 const project=require('xcode').project('/tmp/workbench-synthetic.pbxproj');
 project.hash={project:{objects:{}}};
 assert.match(project.generateUuid(),/^[A-F0-9]{24}$/);
});

test('stable release source tag, staging directory and manifest channel agree',()=>{
 const result=inspect('--channel','stable');
 assert.equal(result.version,version);
 assert.equal(result.channel,'stable');
 assert.equal(result.tag,'v'+version);
 assert.equal(result.output,path.resolve('releases',version));
 assert.equal(result.sourceUrl,'https://github.com/sign-out/voyage-workbench/tree/v'+version);
});

test('test staging remains backwards compatible and rejects unknown channels',()=>{
 const result=inspect();
 assert.equal(result.channel,'test');
 assert.equal(result.tag,'v'+version+'-test');
 assert.equal(result.output,path.resolve('releases','test-'+version));
 assert.equal(result.sourceUrl,'https://github.com/sign-out/voyage-workbench/tree/v'+version+'-test');
 assert.notEqual(spawnSync('python3',['tools/assemble-test-release.py','--dry-run','--channel','invalid']).status,0);
});
