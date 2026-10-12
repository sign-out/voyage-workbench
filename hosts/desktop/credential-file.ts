import {closeSync,existsSync,fsyncSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Secrets} from './service';
export function replaceEncryptedCredentials(file:string,encrypted:Buffer){
 const temporary=file+'.'+randomUUID()+'.tmp';let descriptor:number|undefined;
 try{descriptor=openSync(temporary,'wx',0o600);writeFileSync(descriptor,encrypted);fsyncSync(descriptor);closeSync(descriptor);descriptor=undefined;renameSync(temporary,file);}
 finally{if(descriptor!==undefined)closeSync(descriptor);if(existsSync(temporary))unlinkSync(temporary);}
}
export function credentialStore(file:string,durable:boolean,encrypt:(text:string)=>Buffer,decrypt:(encrypted:Buffer)=>string,persist=replaceEncryptedCredentials):Secrets {
 let session:Record<string,string>=Object.create(null);
 if(durable&&existsSync(file))try{const saved=JSON.parse(decrypt(readFileSync(file)));if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const key of Object.keys(saved))if(typeof saved[key]==='string')session[key]=saved[key];}catch{}
 return {durable,get:key=>session[key]||'',set:(key,value)=>{const next={...session,[key]:value};if(durable)persist(file,encrypt(JSON.stringify(next)));session=next;}};
}
