import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {defaultSettings} from '../../packages/core/providers';

test('provider credentials stay out of settings and are cleared when a connection is removed',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-secret-')),credentials:Record<string,string>={};const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:true,get:name=>credentials[name]||'',set:(name,value)=>{credentials[name]=value;}});
 try{const settings=defaultSettings();settings.profiles.push({id:'private',name:'Private',protocol:'openai',baseUrl:'https://api.x.ai/v1',model:''});await service.request('saveProviderSettings',{settings});const status=await service.request('providerKey',{profileId:'private',key:'private-test-secret'});assert.ok(status.keys.includes('private'));assert.ok(!JSON.stringify(status).includes('private-test-secret'));assert.ok(!service.store.setting('providers').includes('private-test-secret'));assert.equal(credentials['provider-private'],'private-test-secret');await assert.rejects(service.request('providerKey',{profileId:'missing',key:'secret'}),/not found/);await service.request('saveProviderSettings',{settings:defaultSettings()});assert.equal(credentials['provider-private'],'');}finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
