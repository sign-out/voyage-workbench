import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';
test('lost PUT response with expired upload URL finalizes without another allowance or PUT',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-music-expiry-')),previous=(globalThis as any).window,secrets=new Map<string,string>();
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:key=>secrets.get(key)||'',set:(key,value)=>{secrets.set(key,value);}});
 let allowances=0,puts=0,finalizations=0;
 service.voyage=async(method,endpoint)=>{if(endpoint==='/uploads/music'){allowances++;return {text:JSON.stringify({data:{uploadId:'lost-put',directUploadUrl:'https://example.com/signed',expiresAt:new Date(Date.now()+300000).toISOString()}}),etag:''};}if(endpoint==='/uploads/music/lost-put/finalize'){finalizations++;return {text:'{"data":{"musicUrl":"https://latitude-standard-pull-zone-1.b-cdn.net/recovered.mp3"}}',etag:''};}throw new Error('Unexpected endpoint');};
 (globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>{if(method==='signedUpload'){puts++;throw new Error('Lost PUT response');}return service.request(method,payload);}}};
 try{
  const assets=await import('../../apps/workbench/src/asset-library'),music=await import('../../apps/workbench/src/music-upload');
  await assets.importLocal({name:'song.wav',prompt:'Local',dataUrl:'data:audio/wav;base64,'+Buffer.from('RIFFxxxxWAVEfmt ').toString('base64')});
  const asset=(await assets.library())[0];await assert.rejects(music.uploadMusic(asset),/Lost PUT/);
  const journal=await music.musicUploads();assert.equal(journal[0].step,'bytes');journal[0].expiresAt=new Date(Date.now()-1000).toISOString();
  await service.request('featureSet',{key:'music-uploads',value:JSON.stringify(journal)});
  assert.match(await music.uploadMusic(asset,journal[0].id),/recovered.mp3/);assert.equal(allowances,1);assert.equal(puts,1);assert.equal(finalizations,1);assert.equal((await music.musicUploads())[0].state,'ready');
 }finally{(globalThis as any).window=previous;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('signed media uploads reject oversized encoded payloads before allocation or network',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-media-bound-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 let resolutions=0;service.publicUrl=async()=>{resolutions++;return new URL('https://example.com/signed');};
 const project=service.store.create('Upload binding','{}').project!;
 service.store.dispatch(project.id,{type:'remoteLink',worldId:'WORLD',environment:'alpha',etag:'"revision"',baselineHash:''});
 try{await assert.rejects(service.request('signedUpload',{projectId:project.id,environment:'alpha',worldId:'WORLD',url:'https://example.com/signed',mime:'image/png',base64:' '.repeat(4*Math.ceil(5*1024*1024/3)+1)}),/size limit/);assert.equal(resolutions,0);}finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('shared library deduplicates bytes, survives project deletion and indexes confirmed remote music',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-library-')),previous=(globalThis as any).window;
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 (globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>service.request(method,payload)}};
 try{
  const assets=await import('../../apps/workbench/src/asset-library');
  const source='{"gameplayMusicSettings":{"tracks":{"song":{"variants":[{"url":"https://latitude-standard-pull-zone-1.b-cdn.net/song.mp3"}]}}}}';
  const project=(await service.request('create',{name:'One',source})).project;
  const dataUrl='data:audio/wav;base64,'+Buffer.from('RIFFxxxxWAVEfmt ').toString('base64');
  const first=await assets.importLocal({name:'first.wav',prompt:'Local import',dataUrl}),second=await assets.importLocal({name:'second.wav',prompt:'Local import',dataUrl});
  assert.equal(first.id,second.id);assert.equal((await assets.library()).length,1);assert.deepEqual(await service.request('assetKeys'),[first.id]);
  await assets.indexProjectAssets(project);assert.equal((await assets.library()).length,2);
  await assets.registerRemote('https://latitude-standard-pull-zone-1.b-cdn.net/new.mp3','audio','New music',{state:'reserved',expiresAt:123},first.id);
  await assets.indexProjectAssets({...project,activeSource:source.replace('song.mp3','new.mp3')});assert.equal((await assets.library()).find(item=>item.storageId===first.id)!.remote[0].state,'reserved');
  await assets.indexProjectAssets({...project,remote:{...project.remote,envelopeSource:source.replace('song.mp3','new.mp3')}});assert.equal((await assets.library()).find(item=>item.storageId===first.id)!.remote[0].state,'durable');
  await assets.indexProjectAssets({...project,activeSource:'{"custom":{"hiddenAsset":"https://latitude-standard-pull-zone-1.b-cdn.net/custom.wav"}}'});assert.ok((await assets.library()).some(item=>item.remote.some(remote=>remote.url.endsWith('/custom.wav'))));
  await service.request('command',{id:project.id,command:{type:'projectStatus',status:'trashed'}});
  await service.request('deleteProject',{id:project.id});
  assert.equal((await assets.library()).length,3);assert.equal((await assets.assetData((await assets.library()).find(item=>item.storageId===first.id)!)).dataUrl,dataUrl);
  await assert.rejects(service.request('featureSet',{key:'asset-library',value:'[]',expected:'stale'}),/changed/);
 }finally{(globalThis as any).window=previous;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('existing hosted images skip the allowance, dimensions and byte upload on reuse',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-image-reuse-')),previous=(globalThis as any).window;
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 (globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>service.request(method,payload)}};
 try{
  const assets=await import('../../apps/workbench/src/asset-library'),features=await import('../../apps/workbench/src/features-api');
  const asset=await assets.importLocal({name:'portrait.png',prompt:'Local',dataUrl:'data:image/png;base64,'+Buffer.from('\x89PNG\r\n\x1a\n','binary').toString('base64')});
  const url='https://latitude-standard-pull-zone-1.b-cdn.net/portrait.png';await assets.registerRemote(url,'image','Portrait',{target:'NPC_PORTRAIT',state:'existing'},asset.id);
  const created=(await service.request('create',{name:'One',source:'{}'})).project;
  const project=service.store.dispatch(created.id,{type:'remoteLink',worldId:'world',etag:'e1',baselineHash:'',environment:'alpha'}).project!;
  let calls=0;service.voyage=async()=>{calls++;throw new Error('Unexpected upload');};
  const operation=await features.prepareUpload(project,'NPC_PORTRAIT',asset);assert.equal(operation.state,'ready');assert.equal(operation.imageUrl,url);assert.equal((await features.sendUpload(project,operation.id)).imageUrl,url);assert.equal(calls,0);
 }finally{(globalThis as any).window=previous;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('music upload finalization resumes exactly without another allowance or PUT',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-music-')),previous=(globalThis as any).window;
 const secrets=new Map<string,string>();
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:key=>secrets.get(key)||'',set:(key,value)=>{secrets.set(key,value);}});
 const calls:{method:string;endpoint:string;body?:string;id?:string}[]=[];let fail=true,puts=0;
 service.voyage=async(method,endpoint,body,etag,id)=>{calls.push({method,endpoint,body,id});if(endpoint==='/uploads/music')return {text:JSON.stringify({data:{uploadId:'upload',directUploadUrl:'https://example.com/signed',expiresAt:new Date(Date.now()+300000).toISOString()}}),etag:''};if(endpoint==='/uploads/music/upload/finalize'){if(fail){fail=false;throw new Error('Voyage HTTP 409 (request_in_progress): Finalization is still pending');}return {text:'{"data":{"musicUrl":"https://latitude-standard-pull-zone-1.b-cdn.net/music.mp3"}}',etag:''};}throw new Error('Unexpected endpoint');};
 (globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>{if(method==='signedUpload'){puts++;return {ok:true};}return service.request(method,payload);}}};
 try{
  const assets=await import('../../apps/workbench/src/asset-library'),music=await import('../../apps/workbench/src/music-upload');
  await assets.importLocal({name:'song.wav',prompt:'Local',dataUrl:'data:audio/wav;base64,'+Buffer.from('RIFFxxxxWAVEfmt ').toString('base64')});
  const asset=(await assets.library())[0];await assert.rejects(music.uploadMusic(asset),/request_in_progress/);
  const operation=(await music.musicUploads())[0];assert.equal(operation.state,'unknown');assert.equal(operation.step,'finalize');assert.equal(operation.leaseUntil,0);
  assert.equal(JSON.stringify(operation).includes('example.com/signed'),false);assert.equal(operation.directUploadUrl,undefined);
  await assert.rejects(music.uploadMusic(asset),/Resume the recorded/);
  const url=await music.uploadMusic(asset,operation.id);assert.match(url,/music.mp3/);assert.equal(puts,1);assert.equal(calls.filter(call=>call.endpoint==='/uploads/music').length,1);
  const finalize=calls.filter(call=>call.endpoint.endsWith('/finalize'));assert.equal(finalize.length,2);assert.equal(finalize[0].id,finalize[1].id);assert.equal((await music.musicUploads())[0].state,'ready');
  const count=calls.length;assert.equal(await music.uploadMusic((await assets.library())[0]),url);assert.equal(calls.length,count);
  assert.equal((await assets.library())[0].remote[0].state,'reserved');
  assert.equal((await service.request('hasUploadUrl',{id:operation.id})).available,false);
 }finally{(globalThis as any).window=previous;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
