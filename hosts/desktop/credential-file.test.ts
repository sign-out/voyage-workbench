import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {credentialStore,replaceEncryptedCredentials} from './credential-file';
test('encrypted credential replacement is atomic and leaves no temporary files',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-encrypted-')),file=path.join(directory,'credentials.bin');try{writeFileSync(file,Buffer.from('old ciphertext'));replaceEncryptedCredentials(file,Buffer.from('new ciphertext'));assert.equal(readFileSync(file,'utf8'),'new ciphertext');assert.deepEqual(readdirSync(directory),['credentials.bin']);}finally{rmSync(directory,{recursive:true,force:true});}
});
test('failed credential persistence cannot report an unsaved key as saved',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-secret-')),file=path.join(directory,'credentials.bin');try{writeFileSync(file,'fixture ciphertext');const store=credentialStore(file,true,()=>Buffer.from('replacement ciphertext'),()=>'{"provider-fixture":"old fixture"}',()=>{throw new Error('disk full');});assert.throws(()=>store.set('provider-fixture','new fixture'),/disk full/);assert.equal(store.get('provider-fixture'),'old fixture');assert.equal(readFileSync(file,'utf8'),'fixture ciphertext');}finally{rmSync(directory,{recursive:true,force:true});}
});
test('unavailable OS encryption keeps credentials session-only without plaintext fallback',()=>{
 const store=credentialStore('/unused/credential-fixture',false,()=>{throw new Error('Encryption unavailable');},()=>'',()=>{throw new Error('No disk writes allowed');});store.set('provider-fixture','session fixture');assert.equal(store.get('provider-fixture'),'session fixture');assert.equal(store.durable,false);
});
