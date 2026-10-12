import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {writeExport} from './export';

test('large API-style JSON exports preserve exact bytes and replace existing files',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'voyage-export-')),destination=path.join(directory,'world.json');
 const source='{"title":"海岸","initialGameState":{"exact":9007199254740993,"text":"'+'large world '.repeat(500000)+'"}}';
 try{await writeFile(destination,'old contents');await writeExport(destination,source);assert.equal(await readFile(destination,'utf8'),source);assert.deepEqual(await readdir(directory),['world.json']);}finally{await rm(directory,{recursive:true,force:true});}
});
test('invalid or failed exports do not truncate an existing destination',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'voyage-export-')),destination=path.join(directory,'world.json');
 try{await writeFile(destination,'keep me');for(const source of ['',undefined,null])await assert.rejects(writeExport(destination,source),/Nothing to export/);assert.equal(await readFile(destination,'utf8'),'keep me');const blocked=path.join(directory,'blocked');await mkdir(blocked);await assert.rejects(writeExport(blocked,'{}'));assert.deepEqual((await readdir(directory)).sort(),['blocked','world.json']);}finally{await rm(directory,{recursive:true,force:true});}
});
