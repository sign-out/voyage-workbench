import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Service} from './service';
import {hash} from '../../packages/core/project';
import {creationArtifactSpecs,creationVisualHash} from '../../packages/core/world-creation';
import {creationVisualRoute} from '../../packages/core/creation-visual';
import {defaultSettings} from '../../packages/core/providers';
import {inspectMedia} from '../../packages/core/asset-library';
import {project as fixture} from '../../tests/creation-fixture';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=';
test('desktop visual-review host sends real images on the approved route, validates reports, and rejects stale snapshots before dispatch',async()=>{
 let calls=0,invalid=false;const server=createServer(async(request,response)=>{
  let body='';for await(const chunk of request)body+=chunk;calls++;const packet=JSON.parse(body),parts=packet.messages[0].content;
  assert.ok(parts.some((part:any)=>part.type==='image_url'&&part.image_url.url===png));assert.match(parts[0].text,/The town is on a coastal island/);
  const report={assets:[{id:invalid?'wrong':'map:region',status:'pass',observations:'Visible coastline and settlement marker.',sourceFidelity:'Agrees with the supplied island source.',fix:''}],summary:'Preview inspected.'};
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{message:{content:JSON.stringify(report)}}]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const directory=mkdtempSync(path.join(tmpdir(),'voyage-visual-host-')),service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const sample=fixture(),created=service.store.create('Review',sample.activeSource).project!;
  service.store.dispatch(created.id,{type:'restoreCreation',baseHash:hash(sample.activeSource),workspace:sample.creation,creationId:'host-creation'});
  let project=service.store.project(created.id);const spec=creationArtifactSpecs(project.creation!,project.activeSource,hash)[0];
  service.store.dispatch(created.id,{type:'creationJobStart',baseHash:hash(project.activeSource),expectedRevision:project.creation!.revision,id:spec.id,specHash:spec.specHash,attempt:'host'});
  service.store.dispatch(created.id,{type:'creationJobFinish',id:spec.id,attempt:'host',state:'ready',assetId:'map-asset',assetHash:inspectMedia(png).sha256});
  project=service.store.project(created.id);
  const settings=defaultSettings();settings.profiles.push({id:'vision',name:'Vision',protocol:'openai',model:'vision',baseUrl:'http://127.0.0.1:'+(server.address() as any).port});settings.routes.building={profileId:'vision',model:'vision'};
  const stored=await service.request('saveProviderSettings',{settings}),route=creationVisualRoute(stored.settings),payload={id:created.id,route,inputHash:creationVisualHash(project.creation!,project.activeSource,hash),images:[{id:spec.id,assetHash:inspectMedia(png).sha256,dataUrl:png}]};
  const result=await service.request('creationVisualGrade',payload);assert.equal(result.report.assets[0].id,'map:region');assert.equal(result.report.official,false);assert.equal(calls,1);
  await assert.rejects(service.request('creationVisualGrade',{...payload,inputHash:hash('stale')}),/package changed/);await assert.rejects(service.request('creationVisualGrade',{...payload,route:{...route,model:'unapproved'}}),/route changed/);assert.equal(calls,1);
  invalid=true;await assert.rejects(service.request('creationVisualGrade',payload),/missing or duplicate/);assert.equal(calls,2);
 }finally{service.store.close();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(directory,{recursive:true,force:true});}
});
