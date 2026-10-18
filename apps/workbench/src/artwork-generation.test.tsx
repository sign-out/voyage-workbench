import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create,hash} from '../../../packages/core/project';
import type {ArtworkProposal} from '../../../packages/core/artwork-requests';
import {defaultSettings,resolveRoute} from '../../../packages/core/providers';
import {generateApprovedArtwork,type Generation} from './artwork-generation';
import {AssistantArtworkApprovals} from './AssistantArtworkApprovals';

function fixture(){
 const project=create('p','World','{"npcs":{"guide":{"name":"Guide"}}}',1);
 const proposal:ArtworkProposal={id:'proposal',taskId:'planner',destinationId:'["npcs","guide","portraitUrl"]',prompt:'Watercolor lighthouse keeper',label:'Guide',baseHash:hash(project.activeSource),created:1};
 project.artworkProposals=[proposal];
 const settings=defaultSettings();settings.profiles.push({id:'images',name:'Test images',protocol:'openai',baseUrl:'https://images.example/v1',model:'text-model',imageModel:'image-model'});settings.routes.artwork={profileId:'images',model:''};
 const route=resolveRoute(settings,'artwork'),calls:string[]=[],history:Generation[][]=[];
 let raw:string|null=null,imageError='',rejectWrite=false,projectReads=0,assetSaves=0;
 const dependencies={
  request:async(method:string,payload:any={})=>{
   calls.push(method);
   if(method==='project'){projectReads++;return {project};}
   if(method==='providerSettings')return {settings};
   if(method==='featureGet')return raw;
   if(method==='featureSet'){if(rejectWrite)throw new Error('Disk write failed');if(payload.expected!==raw)throw new Error('This feature changed');raw=payload.value;return {};}
   if(method==='imageGenerate'){assert.ok(raw);assert.equal(JSON.parse(raw!)[0].state,'generating');assert.equal(payload.prompt,proposal.prompt);if(imageError)throw new Error(imageError);return {dataUrl:'data:image/png;base64,fixture',route};}
   throw new Error('Unexpected method '+method);
  },
  saveAsset:async(data:any)=>{assetSaves++;return {...data,id:'asset',created:1};},id:()=>crypto.randomUUID(),now:()=>1
 };
 return {project,proposal,settings,route,calls,history,dependencies,onHistory:(jobs:Generation[])=>history.push(jobs),get jobs(){return JSON.parse(raw||'[]') as Generation[];},get assetSaves(){return assetSaves;},set imageError(value:string){imageError=value;},set rejectWrite(value:boolean){rejectWrite=value;},get projectReads(){return projectReads;}};
}
test('inline approval renders destination briefs and charge scope without starting provider calls',()=>{
 const {project,calls}=fixture();
 const html=renderToStaticMarkup(<AssistantArtworkApprovals project={project} blocked={false} onArtwork={()=>{throw Error('Render must not navigate');}}/>);
 for(const text of ['Approve artwork generation','Approve &amp; generate 1 image','Approve &amp; generate for Guide','Watercolor lighthouse keeper','provider charges','uploading and attachment remain separate'])assert.ok(html.includes(text),text);
 assert.deepEqual(calls,[]);
});
test('approved generation is journaled first, saved locally once, and never uploads or edits',async()=>{
 const item=fixture(),source=item.project.activeSource;
 const asset=await generateApprovedArtwork('p',item.proposal,item.route,item.onHistory,item.dependencies);
 assert.equal(asset.id,'asset');assert.equal(item.jobs[0].state,'generated');assert.equal(item.jobs[0].proposalId,item.proposal.id);assert.equal(item.jobs[0].assetId,'asset');assert.equal(item.assetSaves,1);assert.equal(item.project.activeSource,source);
 assert.equal(item.calls.filter(method=>method==='imageGenerate').length,1);
 assert.ok(item.calls.every(method=>['project','providerSettings','featureGet','featureSet','imageGenerate'].includes(method)));
 await assert.rejects(generateApprovedArtwork('p',item.proposal,item.route,item.onHistory,item.dependencies),/already has a generation attempt/);
 assert.equal(item.calls.filter(method=>method==='imageGenerate').length,1);
});
test('concurrent approvals reserve the same proposal only once',async()=>{
 const item=fixture();
 const results=await Promise.allSettled([generateApprovedArtwork('p',item.proposal,item.route,item.onHistory,item.dependencies),generateApprovedArtwork('p',item.proposal,item.route,item.onHistory,item.dependencies)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(item.calls.filter(method=>method==='imageGenerate').length,1);
});
test('failed image requests remain uncertain and are not automatically retried',async()=>{
 const item=fixture();item.imageError='Connection lost';
 await assert.rejects(generateApprovedArtwork('p',item.proposal,item.route,item.onHistory,item.dependencies),/No automatic retry/);
 assert.equal(item.jobs[0].state,'uncertain');assert.equal(item.assetSaves,0);
 await assert.rejects(generateApprovedArtwork('p',item.proposal,item.route,item.onHistory,item.dependencies),/already has a generation attempt/);
 assert.equal(item.calls.filter(method=>method==='imageGenerate').length,1);
});
test('stale, missing, changed, draft and archived proposals cannot approve generation',async()=>{
 for(const mutation of ['stale','missing','changed','draft','archived']){
  const item=fixture(),proposal={...item.proposal};
  if(mutation==='stale')item.project.activeSource='{}';
  if(mutation==='missing')item.project.artworkProposals=[];
  if(mutation==='changed')item.project.artworkProposals![0].prompt='Changed';
  if(mutation==='draft')item.project.draft={path:[],text:'{}',baseHash:item.proposal.baseHash};
  if(mutation==='archived')item.project.status='archived';
  await assert.rejects(generateApprovedArtwork('p',proposal,item.route,item.onHistory,item.dependencies),/changed/);
  assert.equal(item.calls.includes('imageGenerate'),false);assert.equal(item.calls.includes('featureSet'),false);
 }
});
test('provider drift and reservation write errors fail before any image usage',async()=>{
 for(const mutation of ['route','disk']){
  const item=fixture();if(mutation==='route')item.settings.routes.artwork.model='different-model';else item.rejectWrite=true;
  await assert.rejects(generateApprovedArtwork('p',item.proposal,item.route,item.onHistory,item.dependencies),mutation==='route'?/provider or model changed/:/Disk write failed/);
  assert.equal(item.calls.includes('imageGenerate'),false);
 }
});
test('world changes after reservation are rechecked before generation',async()=>{
 const item=fixture(),invoke=item.dependencies.request;
 item.dependencies.request=async(method,payload)=>{if(method==='project'&&item.projectReads===1)item.project.activeSource='{}';return invoke(method,payload);};
 await assert.rejects(generateApprovedArtwork('p',item.proposal,item.route,item.onHistory,item.dependencies),/No image request was sent/);
 assert.equal(item.calls.includes('imageGenerate'),false);assert.equal(item.jobs[0].state,'blocked');
});
