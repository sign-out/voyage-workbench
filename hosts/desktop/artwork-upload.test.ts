import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';
import {imageTargets} from '../../packages/core/artwork';

const imageData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII=';
async function uploadFixture(){
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-upload-safety-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 const previousWindow=(globalThis as any).window,previousImage=(globalThis as any).Image,previousFetch=globalThis.fetch;
 (globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>service.request(method,payload)}};
 (globalThis as any).Image=class {naturalWidth=1000;naturalHeight=1000;async decode(){}};
 const api=await import('../../apps/workbench/src/features-api'),assets=await import('../../apps/workbench/src/asset-library');
 const original=(await service.request('create',{name:'Safety fixture',source:'{"title":"Fixture"}'})).project;
 service.store.dispatch(original.id,{type:'remoteLink',worldId:'WORLD',environment:'alpha',etag:'"revision"',baselineHash:hash(original.activeSource)});
 const project=service.store.project(original.id),asset=await api.saveAsset({name:'Fixture',prompt:'Fixture',dataUrl:imageData});
 const binding={projectId:project.id,environment:'alpha',worldId:'WORLD'},calls={allowances:0,puts:0,moderations:0},moderationKeys:string[]=[];
 service.publicUrl=async value=>new URL(value);
 service.voyage=async(method,endpoint,body,etag,key,environment)=>{
  assert.equal(environment,'alpha');assert.equal(method,'POST');
  if(endpoint==='/uploads'){calls.allowances++;return {text:JSON.stringify({data:{uploadId:'exact-allowance',directUploadUrl:'https://upload.example/image',expiresAt:new Date(Date.now()+300000).toISOString()}}),etag:''};}
  assert.equal(endpoint,'/worlds/WORLD/uploads/exact-allowance/moderate');calls.moderations++;moderationKeys.push(key!);
  return {text:'{"data":{"imageUrl":"https://images.example/approved.png"}}',etag:''};
 };
 globalThis.fetch=async()=>{calls.puts++;return new Response('');};
 return {api,assets,service,project,asset,binding,calls,moderationKeys,close:()=>{(globalThis as any).window=previousWindow;(globalThis as any).Image=previousImage;globalThis.fetch=previousFetch;service.store.close();rmSync(directory,{recursive:true,force:true});}};
}

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

test('host rejects missing, foreign and stale image bindings before allowance, PUT or moderation',async()=>{
 const fixture=await uploadFixture();const {service,project,binding,calls}=fixture;
 try{
  const original=service.store.project(project.id);
  const production=(await service.request('create',{name:'Production',source:original.activeSource})).project;
  service.store.dispatch(production.id,{type:'remoteLink',worldId:'WORLD',environment:'production',etag:'"revision"',baselineHash:hash(production.activeSource)});
  const invalid=[{}, {...binding,projectId:production.id}, {...binding,environment:'production'}, {...binding,worldId:'OTHER'}, {...binding,projectId:'missing'}];
  for(const supplied of invalid){
   for(const endpoint of ['/uploads','/worlds/WORLD/uploads/exact-allowance/moderate'])await assert.rejects(service.request('creatorRequest',{...supplied,method:'POST',endpoint,body:'{}',idempotencyKey:'exact'}));
   await assert.rejects(service.request('signedUpload',{...supplied,url:'https://upload.example/image',mime:'image/png',base64:'aW1hZ2U='}));
  }
  await assert.rejects(service.request('creatorRequest',{...binding,method:'POST',endpoint:'/worlds/OTHER/uploads/exact-allowance/moderate',body:'{}'}),/world.*match/);
  await assert.rejects(service.request('creatorRequest',{...binding,method:'POST',endpoint:'/worlds/WORLD/uploads/exact-allowance/moderate?other=1',body:'{}'}),/Unsupported/);
  assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
  const seen:string[]=[];service.voyage=async(method,endpoint)=>{seen.push(endpoint);return {text:'{}',etag:''};};
  for(const [method,endpoint] of [['GET','/worlds'],['POST','/validate'],['POST','/uploads/music'],['POST','/uploads/music/music-id/finalize']])await service.request('creatorRequest',{method,endpoint});
  assert.equal(seen.length,4);
 }finally{fixture.close();}
});

test('prepare journals the authoritative project environment and cannot upload a production link',async()=>{
 const fixture=await uploadFixture();const {api,service,project,asset,calls}=fixture;
 try{
  service.store.dispatch(project.id,{type:'remoteLink',worldId:'WORLD',environment:'production',etag:'"revision"',baselineHash:hash(project.activeSource)});
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset);
  assert.equal(prepared.environment,'production');assert.equal(prepared.projectId,project.id);
  await assert.rejects(api.sendUpload(project,prepared.id),/linked to production/);
  assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
 }finally{fixture.close();}
});

test('lost accepted PUT response survives sleep and expiry and recovers the exact allowance through moderation',async()=>{
 const fixture=await uploadFixture();const {api,service,project,asset,calls,moderationKeys}=fixture;const previousNow=Date.now;let now=previousNow();Date.now=()=>now;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset);
  globalThis.fetch=async()=>{
   calls.puts++;const journal=await api.feature<any[]>('uploads:'+project.id,[]);
   assert.equal(journal[0].bytesAttempted,true);assert.equal(journal[0].step,'bytes');throw new Error('Accepted bytes; response lost');
  };
  await assert.rejects(api.sendUpload(project,prepared.id),/may have been accepted/);
  now+=6*60*1000;
  await assert.rejects(api.prepareUpload(project,'NPC_PORTRAIT',asset),/existing upload/);
  assert.equal((await api.sendUpload(project,prepared.id)).state,'ready');
  assert.deepEqual(calls,{allowances:1,puts:1,moderations:1});assert.equal(moderationKeys[0],'image-moderation-'+prepared.id);
  assert.equal((await api.prepareUpload(project,'NPC_PORTRAIT',asset)).id,prepared.id);
  assert.equal((await api.feature<any[]>('uploads:'+project.id,[])).length,1);
 }finally{Date.now=previousNow;fixture.close();}
});

test('unresolved accepted bytes remain blocked after expiry and exact-replay window; no replacement allowance',async()=>{
 const fixture=await uploadFixture();const {api,service,project,asset,calls,moderationKeys}=fixture;const previousNow=Date.now;let now=previousNow();Date.now=()=>now;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset),voyage=service.voyage.bind(service);
  globalThis.fetch=async()=>{calls.puts++;throw new Error('Lost PUT response');};
  await assert.rejects(api.sendUpload(project,prepared.id),/may have been accepted/);now+=6*60*1000;
  service.voyage=async(...args)=>{await voyage(...args);throw new Error('Moderation response unavailable');};
  for(let attempt=0;attempt<2;attempt++){
   await assert.rejects(api.sendUpload(project,prepared.id),/Resume this exact upload/);
   await assert.rejects(api.prepareUpload(project,'NPC_PORTRAIT',asset),/existing upload/);
  }
  assert.equal(new Set(moderationKeys).size,1);now+=24*60*60*1000;
  await assert.rejects(api.sendUpload(project,prepared.id),/replay window expired/);
  await assert.rejects(api.prepareUpload(project,'NPC_PORTRAIT',asset),/existing upload/);
  const journal=await api.feature<any[]>('uploads:'+project.id,[]);assert.equal(journal[0].state,'unknown');assert.equal(journal[0].bytesAttempted,true);
  assert.deepEqual(calls,{allowances:1,puts:1,moderations:2});
 }finally{Date.now=previousNow;fixture.close();}
});

test('ready upload repairs failed library registration on both send and prepare without duplicate work',async()=>{
 const fixture=await uploadFixture();const {api,assets,service,project,asset,calls}=fixture;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset),invoke=service.request.bind(service);let failures=2;
  (globalThis as any).window.voyage.invoke=(method:string,payload:any)=>{if(method==='featureSet'&&payload.key==='asset-library'&&failures-->0)throw new Error('Library storage unavailable');return invoke(method,payload);};
  await assert.rejects(api.sendUpload(project,prepared.id),/Library storage unavailable/);
  assert.equal((await api.feature<any[]>('uploads:'+project.id,[]))[0].state,'ready');
  assert.equal((await assets.library())[0].remote.length,0);
  await assert.rejects(api.sendUpload(project,prepared.id),/Library storage unavailable/);
  assert.equal((await api.prepareUpload(project,'NPC_PORTRAIT',asset)).id,prepared.id);
  await Promise.all([api.sendUpload(project,prepared.id),api.prepareUpload(project,'NPC_PORTRAIT',asset)]);
  assert.equal((await assets.library()).length,1);assert.equal((await assets.library())[0].remote.length,1);
  assert.equal((await api.feature<any[]>('uploads:'+project.id,[])).length,1);assert.deepEqual(calls,{allowances:1,puts:1,moderations:1});
 }finally{fixture.close();}
});

test('resume cannot retarget either the environment or world persisted with the upload',async()=>{
 const fixture=await uploadFixture();const {api,service,project,asset,calls}=fixture;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset);
  for(const [environment,worldId] of [['production','WORLD'],['alpha','OTHER']]){
   service.store.dispatch(project.id,{type:'remoteLink',worldId,environment,etag:'"revision"',baselineHash:hash(project.activeSource)});
   await assert.rejects(api.sendUpload(project,prepared.id),/binding.*changed/);
  }
  assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
 }finally{fixture.close();}
});

test('concurrent callers share one journal operation and one allowance',async()=>{
 const fixture=await uploadFixture();const {api,project,asset,calls}=fixture;
 try{
  const results=await Promise.allSettled([api.prepareUpload(project,'NPC_PORTRAIT',asset),api.prepareUpload(project,'NPC_PORTRAIT',asset)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const journal=await api.feature<any[]>('uploads:'+project.id,[]);
  await Promise.all([api.sendUpload(project,journal[0].id),api.sendUpload(project,journal[0].id)]);
  assert.deepEqual(calls,{allowances:1,puts:1,moderations:1});
 }finally{fixture.close();}
});

test('a competing journal writer prevents PUT when the send-attempt cannot be persisted',async()=>{
 const fixture=await uploadFixture();const {api,service,project,asset,calls}=fixture;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset),invoke=service.request.bind(service);let competed=false;
  (globalThis as any).window.voyage.invoke=async(method:string,payload:any)=>{
   if(!competed&&method==='featureSet'&&payload.key==='uploads:'+project.id&&JSON.parse(payload.value)[0].bytesAttempted){
    competed=true;const rows=JSON.parse(await invoke('featureGet',{key:payload.key}));rows[0].revision='competing-writer';await invoke('featureSet',{key:payload.key,value:JSON.stringify(rows)});
   }
   return invoke(method,payload);
  };
  await assert.rejects(api.sendUpload(project,prepared.id),/feature changed/);assert.equal(competed,true);
  assert.deepEqual(calls,{allowances:1,puts:0,moderations:0});
 }finally{fixture.close();}
});

test('legacy expired uploads without send-attempt evidence cannot authorize a replacement',async()=>{
 const fixture=await uploadFixture();const {api,project,asset,calls}=fixture;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset),journal=await api.feature<any[]>('uploads:'+project.id,[]);
  journal[0].state='expired';delete journal[0].bytesAttempted;delete journal[0].environment;delete journal[0].projectId;
  await api.saveFeature('uploads:'+project.id,journal);
  await assert.rejects(api.prepareUpload(project,'NPC_PORTRAIT',asset),/existing upload/);
  await assert.rejects(api.sendUpload(project,prepared.id),/binding.*missing/);
  assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
 }finally{fixture.close();}
});

test('lost allowance response retries the identical idempotency key instead of preparing another upload',async()=>{
 const fixture=await uploadFixture();const {api,service,project,asset,calls}=fixture;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset),voyage=service.voyage.bind(service),keys:string[]=[];let loseResponse=true;
  service.voyage=async(...args)=>{
   const result=await voyage(...args);
   if(args[1]==='/uploads'){keys.push(args[4]!);if(loseResponse){loseResponse=false;throw new Error('Lost allowance response');}}
   return result;
  };
  await assert.rejects(api.sendUpload(project,prepared.id),/Lost allowance response/);
  await assert.rejects(api.prepareUpload(project,'NPC_PORTRAIT',asset),/existing upload/);
  assert.equal((await api.sendUpload(project,prepared.id)).state,'ready');
  assert.deepEqual(keys,['image-allowance-'+prepared.id,'image-allowance-'+prepared.id]);
  assert.equal(calls.puts,1);assert.equal(calls.moderations,1);
 }finally{fixture.close();}
});

test('an allowance proven never sent may expire without being confused with accepted bytes',async()=>{
 const fixture=await uploadFixture();const {api,project,asset,calls}=fixture;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset),journal=await api.feature<any[]>('uploads:'+project.id,[]);
  Object.assign(journal[0],{step:'bytes',uploadId:'never-sent',directUploadUrl:'https://upload.example/image',expiresAt:new Date(Date.now()-1000).toISOString()});
  await api.saveFeature('uploads:'+project.id,journal);
  await assert.rejects(api.sendUpload(project,prepared.id),/before any bytes/);
  const replacement=await api.prepareUpload(project,'NPC_PORTRAIT',asset);assert.notEqual(replacement.id,prepared.id);
  assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
 }finally{fixture.close();}
});

test('reuse filters environments before selection and prefers explicit compatible evidence',async()=>{
 const fixture=await uploadFixture();const {api,assets,project,asset,calls}=fixture;
 try{
  const reference={target:'NPC_PORTRAIT',state:'existing' as const,created:Date.now()};
  await assets.updateLibrary(records=>records.map(record=>({...record,remote:[
   {...reference,url:'https://images.example/production.png',environment:'production'},
   {...reference,url:'https://images.example/unknown.png'},
   {...reference,url:'https://images.example/alpha.png',environment:'alpha'}
  ]})));
  (globalThis as any).Image=class {constructor(){throw new Error('Hosted reuse must not decode local bytes');}};
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset);
  assert.equal(prepared.imageUrl,'https://images.example/alpha.png');assert.equal(prepared.state,'ready');
  assert.equal((await api.sendUpload(project,prepared.id)).imageUrl,prepared.imageUrl);
  assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
 }finally{fixture.close();}
});

test('completed legacy receipts recover locally from exact compatible library evidence through prepare and send',async()=>{
 for(const operation of ['prepare','send']){
  const fixture=await uploadFixture();const {api,assets,service,project,asset,calls}=fixture;
  try{
   const receipt=await api.prepareUpload(project,'NPC_PORTRAIT',asset),url='https://images.example/legacy.png';
   Object.assign(receipt,{state:'ready',step:'done',imageUrl:url,uploadId:'legacy-upload'});delete receipt.projectId;delete receipt.environment;
   await api.saveFeature('uploads:'+project.id,[receipt]);
   await assets.registerRemote(url,'image','Legacy portrait',{target:receipt.target,state:'existing',environment:'alpha',uploadId:receipt.uploadId},asset.id);
   const invoke=service.request.bind(service);let failLibrary=true;
   (globalThis as any).window.voyage.invoke=(method:string,payload:any)=>{if(failLibrary&&method==='featureSet'&&payload.key==='asset-library'){failLibrary=false;throw new Error('Library repair unavailable');}return invoke(method,payload);};
   const recover=()=>operation==='prepare'?api.prepareUpload(project,'NPC_PORTRAIT',asset):api.sendUpload(project,receipt.id);
   await assert.rejects(recover(),/Library repair unavailable/);
   const recovered=await recover();assert.equal(recovered.id,receipt.id);assert.equal(recovered.imageUrl,url);
   assert.equal(recovered.environment,'alpha');assert.equal(recovered.projectId,project.id);assert.equal(recovered.shortId,'WORLD');
   const journal=await api.feature<any[]>('uploads:'+project.id,[]);assert.equal(journal.length,1);assert.equal(journal[0].id,receipt.id);
   assert.equal((await assets.library())[0].remote.length,1);assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
  }finally{fixture.close();}
 }
});

test('completed legacy recovery rejects missing, foreign, reserved or conflicting library bindings without network',async()=>{
 const fixture=await uploadFixture();const {api,assets,project,asset,calls}=fixture;
 try{
  const prepared=await api.prepareUpload(project,'NPC_PORTRAIT',asset),url='https://images.example/legacy.png';
  const legacy={...prepared,state:'ready',step:'done',imageUrl:url,uploadId:'legacy-upload'};delete legacy.projectId;delete legacy.environment;
  const evidence={url,target:'NPC_PORTRAIT',environment:'alpha',state:'existing' as const,created:Date.now(),uploadId:'legacy-upload'};
  const invalid:[Partial<typeof legacy>,any[]][]=[
   [{},[]],
   [{},[{...evidence,environment:'production'}]],
   [{},[{...evidence,environment:undefined}]],
   [{},[{...evidence,target:'AREA_IMAGE'}]],
   [{},[{...evidence,target:undefined}]],
   [{},[{...evidence,url:'https://images.example/different.png'}]],
   [{},[{...evidence,state:'reserved',expiresAt:Date.now()+60000}]],
   [{},[{...evidence,uploadId:'different-upload'}]],
   [{shortId:'OTHER'},[evidence]],
   [{environment:'production'},[evidence]],
   [{projectId:'different-project'},[evidence]],
   [{assetId:'different-asset'},[evidence]]
  ];
  for(const [changes,references] of invalid){
   await api.saveFeature('uploads:'+project.id,[{...legacy,...changes}]);
   await assets.updateLibrary(records=>records.map(record=>({...record,remote:references})));
   await assert.rejects(api.sendUpload(project,legacy.id),/binding.*missing|binding.*changed/);
   await assert.rejects(api.prepareUpload(project,'NPC_PORTRAIT',changes.assetId?{...asset,id:changes.assetId}:asset),/binding.*missing|binding.*changed/);
  }
  assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
 }finally{fixture.close();}
});

test('compatible library URLs never authorize unresolved legacy upload replay',async()=>{
 const fixture=await uploadFixture();const {api,assets,project,asset,calls}=fixture;
 try{
  const receipt=await api.prepareUpload(project,'NPC_PORTRAIT',asset),url='https://images.example/legacy.png';
  Object.assign(receipt,{state:'unknown',step:'moderation',imageUrl:url,uploadId:'legacy-upload',bytesAttempted:true});delete receipt.projectId;delete receipt.environment;
  await api.saveFeature('uploads:'+project.id,[receipt]);
  await assets.registerRemote(url,'image','Legacy portrait',{target:receipt.target,state:'existing',environment:'alpha',uploadId:receipt.uploadId},asset.id);
  await assert.rejects(api.sendUpload(project,receipt.id),/binding.*missing/);
  await assert.rejects(api.prepareUpload(project,'NPC_PORTRAIT',asset),/existing upload/);
  assert.deepEqual(calls,{allowances:0,puts:0,moderations:0});
 }finally{fixture.close();}
});
