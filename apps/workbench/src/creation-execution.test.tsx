import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {reduce} from '../../../packages/core/project';
import {defaultSettings,resolveRoute} from '../../../packages/core/providers';
import {creationArtifactSpecs} from '../../../packages/core/world-creation';
import {hash} from '../../../packages/core/project';
import {project as fixture} from '../../../tests/creation-fixture';
import {generateCreationAssets,creationDetails} from './creation-execution';
import {WorldCreationWorkspace} from './WorldCreationWorkspace';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=';
function environment(){
 let project=fixture(),imageError='',saves=0,renders=0;
 const methods:string[]=[],settings=defaultSettings();settings.profiles.push({id:'images',name:'Images',protocol:'openai',baseUrl:'https://example.com/v1',model:'text',imageModel:'images'});settings.routes.artwork={profileId:'images',model:''};
 const route=resolveRoute(settings,'artwork');
 const dependencies={invoke:async(method:string,payload:any={})=>{methods.push(method);if(method==='project')return {project};if(method==='providerSettings')return {settings};if(method==='command'){project=reduce(project,payload.command);return {project};}if(method==='imageGenerate'){assert.equal(project.creation!.jobs.find(job=>job.state==='running')?.routeHash,hash(JSON.stringify(route)));if(imageError)throw Error(imageError);return {dataUrl:png,route};}throw new Error('Unexpected method '+method);},saveAsset:async(data:any)=>{saves++;return {...data,id:'asset-'+saves,created:1};},renderMap:async()=>{renders++;return png;},id:()=>crypto.randomUUID()};
 return {dependencies,settings,route,methods,get project(){return project;},get saves(){return saves;},get renders(){return renders;},set imageError(value:string){imageError=value;}};
}
test('approved creation batch renders maps, generates its cover and persists every completed asset without remote calls',async()=>{
 const item=environment(),result=await generateCreationAssets('project',{route:item.route,maximumImages:1},item.dependencies);
 assert.equal(result.imageRequests,1);assert.equal(item.renders,1);assert.equal(item.saves,2);assert.equal(item.project.creation!.jobs.length,2);assert.ok(item.project.creation!.jobs.every(job=>job.state==='ready'&&job.assetHash));assert.equal(item.project.activeSource,fixture().activeSource);
 assert.ok(item.methods.every(method=>['project','providerSettings','command','imageGenerate'].includes(method)));
 await generateCreationAssets('project',{route:item.route,maximumImages:1},item.dependencies);assert.equal(item.saves,2);assert.equal(item.methods.filter(method=>method==='imageGenerate').length,1);
});
test('zero paid-image permission still produces local maps but never contacts an image provider',async()=>{
 const item=environment();await generateCreationAssets('project',{maximumImages:0},item.dependencies);assert.equal(item.renders,1);assert.equal(item.saves,1);assert.ok(!item.methods.includes('imageGenerate'));assert.ok(!item.methods.includes('providerSettings'));
});
test('uncertain provider outcomes survive restart, do not auto-retry and require fresh explicit consent',async()=>{
 const item=environment();item.imageError='Lost provider response';await assert.rejects(generateCreationAssets('project',{route:item.route,maximumImages:1},item.dependencies),/may have completed.*No automatic retry/);
 assert.equal(item.project.creation!.jobs.find(job=>job.id==='cover')?.state,'uncertain');const count=item.methods.filter(method=>method==='imageGenerate').length;
 item.imageError='';await generateCreationAssets('project',{route:item.route,maximumImages:1},item.dependencies);assert.equal(item.methods.filter(method=>method==='imageGenerate').length,count);
 await generateCreationAssets('project',{route:item.route,maximumImages:1,acknowledgeRetry:true},item.dependencies);assert.equal(item.methods.filter(method=>method==='imageGenerate').length,count+1);assert.equal(item.project.creation!.jobs.find(job=>job.id==='cover')?.state,'ready');
});
test('route changes and concurrent workers cannot send unapproved duplicate image requests',async()=>{
 const changed=environment();changed.settings.routes.artwork.model='another-image-model';await assert.rejects(generateCreationAssets('project',{route:changed.route,maximumImages:1},changed.dependencies),/provider changed/);assert.ok(!changed.methods.includes('imageGenerate'));
 const item=environment(),results=await Promise.allSettled([generateCreationAssets('project',{route:item.route,maximumImages:1},item.dependencies),generateCreationAssets('project',{route:item.route,maximumImages:1},item.dependencies)]);assert.ok(results.some(result=>result.status==='rejected'));assert.equal(item.methods.filter(method=>method==='imageGenerate').length,1);
});
test('publication details keep title, blurb, tags and uploaded cover separate from bare game state',()=>{
 const project=fixture(),spec=creationArtifactSpecs(project.creation!,project.activeSource,hash).find(spec=>spec.id==='cover')!;project.creation!.jobs.push({id:'cover',attempt:'a',specHash:spec.specHash,state:'ready',assetId:'asset',assetHash:hash('image'),url:'https://example.com/cover.png',created:1});
 const details=creationDetails(project);assert.equal(details.title,'The Island Ferry');assert.equal(details.description,project.creation!.publication.blurb);assert.equal(details.image,'https://example.com/cover.png');assert.equal(JSON.parse(project.activeSource).title,undefined);
});
test('creation screen exposes complete delivery scope and no generation permissions are pre-approved',()=>{
 let sideEffects=0;const html=renderToStaticMarkup(<WorldCreationWorkspace project={fixture()} references={[]} command={async()=>{sideEffects++;}} receive={()=>{sideEffects++;}} onNew={async()=>{sideEffects++;}} onReview={()=>{sideEffects++;}} onPublish={()=>{sideEffects++;}}/>);
 for(const text of ['Create a Voyage world','New V37 creation project','planned and rendered maps','Build world, maps and publishing package','Render missing maps locally','Maximum image requests','Whole-package visual inspection report','Export world JSON','Export package with local artwork and report','Nothing here publishes automatically'])assert.ok(html.includes(text),text);
 assert.equal(sideEffects,0);assert.doesNotMatch(html,/checked=""/);
});
