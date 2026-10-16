import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';
import {imageTargets} from '../../packages/core/artwork';

test('every documented artwork purpose can upload, moderate and retain its hosted URL',async()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-artwork-upload-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 const previousWindow=(globalThis as any).window,previousImage=(globalThis as any).Image,previousFetch=globalThis.fetch;
 (globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>service.request(method,payload)}};
 (globalThis as any).Image=class {naturalWidth=1000;naturalHeight=1000;async decode(){}};
 try{
  const {prepareUpload,sendUpload,saveAsset,feature}=await import('../../apps/workbench/src/features-api');
  const source='{"shortId":"WORLD","initialGameState":{"exact":90071992547409931234}}';
  const original=(await service.request('create',{name:'Artwork upload',source})).project;
  service.store.dispatch(original.id,{type:'remoteLink',worldId:'WORLD',environment:'alpha',etag:'"revision"',baselineHash:hash(source)});
  const project=service.store.project(original.id);
  const asset=await saveAsset({name:'Fixture',prompt:'Fixture',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII='});
  let target='',allowances=0,moderations=0,byteUploads=0;
  service.publicUrl=async(value:string)=>new URL(value);
  globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),'https://upload.example/image');assert.equal(options?.method,'PUT');
   byteUploads++;return new Response('');
  };
  service.voyage=async(method,endpoint,body,etag,key)=>{
   assert.equal(method,'POST');assert.ok(key);
   if(endpoint==='/uploads'){
    allowances++;assert.equal(JSON.parse(body!).target,target);
    return {text:JSON.stringify({uploadId:'upload-'+target,directUploadUrl:'https://upload.example/image',expiresAt:new Date(Date.now()+60000).toISOString()}),etag:''};
   }
   assert.equal(endpoint,'/worlds/WORLD/uploads/upload-'+target+'/moderate');
   assert.equal(JSON.parse(body!).target,target);moderations++;
   return {text:JSON.stringify({imageUrl:'https://images.example/'+target+'.png'}),etag:''};
  };
  for(target of Object.keys(imageTargets)){
   const prepared=await prepareUpload(project,target,asset);
   assert.equal(prepared.state,'prepared');
   const uploaded=await sendUpload(project,prepared.id);
   assert.equal(uploaded.state,'ready');assert.equal(uploaded.imageUrl,'https://images.example/'+target+'.png');
   assert.equal((await prepareUpload(project,target,asset)).id,uploaded.id);
  }
  assert.equal(allowances,5);assert.equal(moderations,5);assert.equal(byteUploads,5);
  assert.equal((await feature<any[]>('uploads:'+project.id,[])).length,5);
  await assert.rejects(prepareUpload(project,'WORLD_COVER',asset),/Unknown upload target/);
  await assert.rejects(prepareUpload(project,'__proto__',asset),/Unknown upload target/);
  assert.equal(service.store.project(project.id).activeSource,source);
 }finally{(globalThis as any).window=previousWindow;(globalThis as any).Image=previousImage;globalThis.fetch=previousFetch;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
