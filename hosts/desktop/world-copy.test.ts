import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';

test('save as new creates an independent private world and exactly replays uncertain creation',async()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-copy-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 const previous=(globalThis as any).window;
 (globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>method==='connection'?Promise.resolve({environment:'alpha',apiBase:'https://api-alpha.aidungeon.com/creator/v1'}):service.request(method,payload)}};
 try{
  const {createWorldCopy,publicationAction,feature,saveFeature}=await import('../../apps/workbench/src/features-api');
  const source='{"shortId":"ORIGINAL","loadId":"original-load","title":"Human world title","visibility":"public","initialGameState":{"exact":90071992547409931234}}';
  const original=(await service.request('create',{name:'Original local save',source})).project;
  service.store.dispatch(original.id,{type:'remoteLink',worldId:'ORIGINAL',environment:'alpha',etag:'"revision-original"',baselineHash:hash(source)});
  const before=JSON.stringify(service.store.project(original.id));
  const artworkKey='artwork-studio:'+original.id;
  const artworkBefore=await service.request('featureGet',{key:artworkKey});
  await service.request('featureSet',{key:artworkKey,expected:artworkBefore,value:'[{"state":"generating"}]'});
  assert.equal(await service.request('featureGet',{key:artworkKey}),'[{"state":"generating"}]');
  await assert.rejects(service.request('featureSet',{key:artworkKey,expected:artworkBefore,value:'[]'}),/changed/);
  await saveFeature('creation-details:'+original.id,'{"description":"Copied metadata"}');
  const copy=await createWorldCopy(service.store.project(original.id));
  assert.notEqual(copy.project.id,original.id);
  assert.equal(copy.project.activeSource,source);
  assert.equal(copy.project.remote.worldId,'');
  assert.equal(await feature('creation-details:'+copy.project.id,''),'{"description":"Copied metadata"}');
  const calls:{method:string;endpoint:string;body?:string;key?:string}[]=[];
  let fail=true;
  service.voyage=async(method,endpoint,body,etag,key)=>{
   calls.push({method,endpoint,body,key});
   if(endpoint==='/validate')return {text:'{"data":{"valid":true,"errors":[],"warnings":[],"stage":"draft"}}',etag:''};
   if(method==='POST'&&endpoint==='/worlds'){
    assert.match(body!,/90071992547409931234/);
    const world=JSON.parse(body!).world;
    assert.equal(world.title,'Human world title');assert.equal(world.visibility,'private');
    assert.equal(world.shortId,undefined);assert.equal(world.loadId,undefined);
    if(fail){fail=false;throw new Error('Connection lost after creation');}
    return {text:'{"data":{"world":{"shortId":"NEW"}}}',etag:''};
   }
   assert.equal(method,'GET');assert.equal(endpoint,'/worlds/NEW');
   return {text:'{"shortId":"NEW","title":"Human world title","initialGameState":{"exact":90071992547409931234}}',etag:'"new-revision"'};
  };
  await assert.rejects(publicationAction(copy.project,'create'),/Connection lost/);
  const journal=await feature<any[]>('publication:'+copy.project.id,[]);
  assert.equal(journal[0].state,'UNKNOWN');
  await assert.rejects(createWorldCopy(copy.project),/recorded publication/);
  await assert.rejects(publicationAction(copy.project,'create'),/recorded/);
  await publicationAction(copy.project,'create',journal[0]);
  const posts=calls.filter(call=>call.endpoint==='/worlds');
  assert.equal(posts.length,2);assert.equal(posts[0].key,posts[1].key);assert.equal(posts[0].body,posts[1].body);
  assert.equal(calls.some(call=>call.method==='PUT'||call.endpoint.includes('ORIGINAL')),false);
  assert.equal(JSON.stringify(service.store.project(original.id)),before);
  const result=service.store.project(copy.project.id);
  assert.equal(result.remote.worldId,'NEW');
  assert.equal(result.activeSource,source);
  assert.ok(result.candidates.some(candidate=>candidate.kind==='remote'));
  assert.equal((await feature<any[]>('publication:'+copy.project.id,[]))[0].state,'CONFIRMED');
 }finally{(globalThis as any).window=previous;service.store.close();rmSync(directory,{recursive:true,force:true});}
});

test('copy refuses persisted drafts, running agents and unresolved saves before creating a project',async()=>{
 const {createWorldCopy}=await import('../../apps/workbench/src/features-api');
 const {create}=await import('../../packages/core/project');
 const previous=(globalThis as any).window;
 try{
  const current=create('original','World','{}',1);
  (globalThis as any).window={voyage:{invoke:async(method:string)=>{assert.equal(method,'project');return {project:current};}}};
  current.draft={path:[],text:'{}',baseHash:hash('{}')};
  await assert.rejects(createWorldCopy(current),/draft/);
  current.draft=null;current.tasks=[{state:'RUNNING'} as any];
  await assert.rejects(createWorldCopy(current),/agent/);
  current.tasks=[];current.remote.operations=[{state:'UNKNOWN'}];
  await assert.rejects(createWorldCopy(current),/pending save/);
 }finally{(globalThis as any).window=previous;}
});
