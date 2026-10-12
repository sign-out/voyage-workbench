import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CodexMedia,type MediaRpc} from './codex-media';
import {defaultSettings,type TaskRoute} from '../../packages/core/providers';
import {coverCategories,coverViews} from '../../packages/core/covers';
import {Service} from './service';
const dataUrl='data:image/png;base64,'+Buffer.from('\x89PNG\r\n\x1a\n','binary').toString('base64');
const route:TaskRoute={id:'codex',name:'Codex',protocol:'codex',model:'',baseUrl:'',stage:'artwork'};
function fake(options:{account?:boolean;capable?:boolean;failed?:boolean;omitImage?:boolean;analysis?:string}={}){
 const calls:{method:string;params:any}[]=[];let closed=false;
 const rpc:MediaRpc={onEvent:()=>{},init:async()=>{},close:()=>{closed=true;},request:async(method,params)=>{
  calls.push({method,params});
  if(method==='account/read')return {account:options.account===false?null:{type:'chatgpt'}};
  if(method==='modelProvider/capabilities/read')return {imageGeneration:options.capable!==false};
  if(method==='thread/start')return {thread:{id:'media-thread'}};
  if(method==='turn/start'){
   queueMicrotask(()=>{
    rpc.onEvent('item/completed',{threadId:'another-thread',item:{type:'imageGeneration',status:'completed',result:'not-the-image'}});
    if(!options.omitImage)rpc.onEvent('item/completed',{threadId:'media-thread',item:{type:'imageGeneration',status:'completed',result:dataUrl.split(',')[1]}});
    if(options.analysis)rpc.onEvent('item/completed',{threadId:'media-thread',item:{type:'agentMessage',text:options.analysis}});
    rpc.onEvent('turn/completed',{threadId:'media-thread',turn:{status:options.failed?'failed':'completed',items:[]}});
   });return {};
  }
  throw new Error('Unexpected method '+method);
 }};
 return {rpc,calls,closed:()=>closed};
}
test('Codex media returns actual artwork and multimodal refinement with no world tools',async()=>{
 const fixture=fake(),media=new CodexMedia('/private-home','/private-store',()=>fixture.rpc);
 const result=await media.generate(route,'Draw one cover',dataUrl);assert.equal(result.dataUrl,dataUrl);assert.equal(fixture.closed(),true);assert.equal(media.busy,false);
 const thread=fixture.calls.find(call=>call.method==='thread/start')!.params;assert.equal(thread.config['features.image_generation'],true);assert.deepEqual(thread.dynamicTools,[]);
 const turn=fixture.calls.find(call=>call.method==='turn/start')!.params;assert.equal(turn.input[2].url,dataUrl);assert(!JSON.stringify(fixture.calls).includes('world_edit'));
});
test('sign-in, capability, missing image and failed turns fail closed without retries',async()=>{
 for(const options of [{account:false},{capable:false},{omitImage:true},{failed:true}]){
  const fixture=fake(options),media=new CodexMedia('/home','/store',()=>fixture.rpc);
  await assert.rejects(media.generate(route,'Create an image'));assert.equal(fixture.closed(),true);assert.equal(media.busy,false);assert(fixture.calls.filter(call=>call.method==='turn/start').length<=1);
  if(options.capable===false)assert.equal(fixture.calls.some(call=>call.method==='thread/start'),false);
 }
});
test('concurrent media requests are rejected while the original is active',async()=>{
 const fixture=fake();let release!:()=>void;fixture.rpc.init=()=>new Promise(resolve=>{release=()=>resolve({});});
 const media=new CodexMedia('/home','/store',()=>fixture.rpc),pending=media.generate(route,'First request');
 await assert.rejects(media.generate(route,'Second request'),/already running/);release();await pending;assert.equal(media.busy,false);
});
test('completed analysis messages replace partial commentary instead of corrupting JSON reports',async()=>{
 const fixture=fake({omitImage:true});
 fixture.rpc.request=async(method,params)=>{
  if(method==='account/read')return {account:{type:'chatgpt'}};if(method==='thread/start')return {thread:{id:'media-thread'}};
  if(method==='turn/start'){queueMicrotask(()=>{
   fixture.rpc.onEvent('item/agentMessage/delta',{threadId:'media-thread',delta:'Inspecting the evidence…'});
   fixture.rpc.onEvent('item/completed',{threadId:'media-thread',item:{type:'agentMessage',text:'{"report":"final"}'}});
   fixture.rpc.onEvent('turn/completed',{threadId:'media-thread',turn:{status:'completed',items:[]}});
  });return {};}
  throw new Error('Unexpected method');
 };
 const media=new CodexMedia('/home','/store',()=>fixture.rpc);assert.equal((await media.run(route,'Inspect the image',[{id:'original',dataUrl}],false)).text,'{"report":"final"}');
});
test('host generation and cover grading use Codex without provider API fallback or world mutation',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-codex-media-')),previous=globalThis.fetch;
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 globalThis.fetch=async()=>{throw new Error('No API fallback allowed');};
 try{
  const settings=defaultSettings();settings.routes.artwork={profileId:'codex',model:''};await service.request('saveProviderSettings',{settings});
  service.secrets.get=()=>{throw new Error('No API credential should be read');};
  const source='{"title":"Preserved","exact":9007199254740993}',project=(await service.request('create',{name:'World',source})).project;
  service.media.makeRpc=()=>fake().rpc;assert.equal((await service.request('imageGenerate',{prompt:'Draw one cover'})).dataUrl,dataUrl);
  const report={views:coverViews.map(view=>({id:view.id,scores:Object.fromEntries(coverCategories.map(category=>[category.id,{score:8,reason:'Observed crop'}])),criticalContentClipped:false,fix:'Keep the face centered'})),summary:'Good hierarchy',tradeoffs:'Detail vs readability',recommendations:['Refine the silhouette']};
  const fixture=fake({omitImage:true,analysis:JSON.stringify(report)});service.media.makeRpc=()=>fixture.rpc;
  const result=await service.request('coverGrade',{profileId:'codex',model:'',brief:{title:'World',premise:'Adventure',direction:'Portrait',original:true},images:['original',...coverViews.map(view=>view.id),'thumbnail','blur','grayscale'].map(id=>({id,dataUrl}))});
  assert.equal(result.report.total,80);assert.equal(fixture.calls.find(call=>call.method==='thread/start')!.params.config['features.image_generation'],false);assert.equal(fixture.calls.find(call=>call.method==='turn/start')!.params.input.filter((item:any)=>item.type==='image').length,9);assert.equal(service.store.project(project.id).activeSource,source);
 }finally{globalThis.fetch=previous;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
