import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,reduce} from '../../../packages/core/project';
import {creationArtifactSpecs} from '../../../packages/core/world-creation';
import {creationVisualRoute} from '../../../packages/core/creation-visual';
import {defaultSettings} from '../../../packages/core/providers';
import {inspectMedia} from '../../../packages/core/asset-library';
import {project as fixture} from '../../../tests/creation-fixture';
import {reviewCreationVisuals} from './creation-visual';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=';
function environment(){
 let project=fixture(),requests=0,failAt=0,status:'pass'|'fail'|'uncertain'='pass',changeAfterRequest=false,stop=false;
 const source=JSON.parse(project.activeSource);for(let column=1;column<5;column++)source.regions['region-'+column]={...source.regions.region,x:column};project.activeSource=JSON.stringify(source);project.creation!.maps[0].columns=5;
 const specs=creationArtifactSpecs(project.creation!,project.activeSource,hash),assets=new Map<string,any>();
 project.creation!.jobs=specs.map((spec,index)=>{const assetId='asset-'+index;assets.set(assetId,{id:assetId,dataUrl:png,prompt:spec.prompt,created:1});return {id:spec.id,specHash:spec.specHash,state:'ready',attempt:'done',created:1,assetId,assetHash:inspectMedia(png).sha256};});
 const settings=defaultSettings();settings.profiles.push({id:'vision',name:'Vision',protocol:'openai',baseUrl:'https://example.com/v1',model:'vision'});settings.routes.building={profileId:'vision',model:'vision'};
 const route=creationVisualRoute(settings),methods:string[]=[];
 const dependencies={invoke:async(method:string,payload:any={})=>{
  methods.push(method);if(method==='project')return {project};if(method==='providerSettings')return {settings};if(method==='command'){project=reduce(project,payload.command);return {project};}
  if(method==='creationVisualGrade'){requests++;if(failAt===requests)throw Error('Lost reviewer response');const report={assets:payload.images.map((image:any)=>({id:image.id,status,observations:'Specific visible geography and symbols.',sourceFidelity:'Consistent with cited source; unseen details not established.',fix:status==='pass'?'':'Repair the mismatched visible symbol.'})),summary:'Actual image previews inspected.',official:false};if(changeAfterRequest)project={...project,activeSource:project.activeSource.replace('A red-haired guide','A silver-haired guide')};return {report,route};}
  throw Error('Unexpected '+method);
 },loadAsset:async(id:string)=>assets.get(id)||null,preview:async()=>png,shouldStop:()=>stop};
 return {dependencies,route,settings,assets,methods,get project(){return project;},get requests(){return requests;},set failAt(value:number){failAt=value;},set status(value:'pass'|'fail'|'uncertain'){status=value;},set changeAfterRequest(value:boolean){changeAfterRequest=value;},set stop(value:boolean){stop=value;}};
}
test('all-image review batches every saved artifact and records pixel evidence without generating, uploading or publishing',async()=>{
 const item=environment(),result=await reviewCreationVisuals('project',{route:item.route,maximumBatches:2},item.dependencies);
 assert.equal(result.outcome,'pass');assert.equal(result.requests,2);assert.equal(item.project.creation!.visualProgress!.reports.flatMap(report=>report.assets).length,6);assert.equal(item.project.creation!.visualReview!.outcome,'pass');
 assert.ok(item.methods.every(method=>['project','providerSettings','command','creationVisualGrade'].includes(method)));
 const reused=await reviewCreationVisuals('project',{route:item.route,maximumBatches:0},item.dependencies);assert.equal(reused.requests,0);assert.equal(item.requests,2);
});
test('completed review batches survive a lost response and require explicit continuation rather than automatic retry',async()=>{
 const item=environment();item.failAt=2;await assert.rejects(reviewCreationVisuals('project',{route:item.route,maximumBatches:2},item.dependencies),/No automatic retry/);
 assert.equal(item.requests,2);assert.equal(item.project.creation!.visualProgress!.reports.length,1);assert.equal(item.project.creation!.visualReview,undefined);
 item.failAt=0;const resumed=await reviewCreationVisuals('project',{route:item.route,maximumBatches:1},item.dependencies);assert.equal(resumed.requests,1);assert.equal(item.requests,3);assert.equal(item.project.creation!.visualProgress!.reports.length,2);
});
test('missing images, changed routes, insufficient approval and stopping prevent review spending',async()=>{
 const missing=environment();missing.assets.clear();await assert.rejects(reviewCreationVisuals('project',{route:missing.route,maximumBatches:2},missing.dependencies),/missing/);assert.equal(missing.requests,0);
 const changed=environment();changed.settings.routes.building.model='changed';await assert.rejects(reviewCreationVisuals('project',{route:changed.route,maximumBatches:2},changed.dependencies),/route changed/);assert.equal(changed.requests,0);
 const bounded=environment();await assert.rejects(reviewCreationVisuals('project',{route:bounded.route,maximumBatches:1},bounded.dependencies),/approved request count/);assert.equal(bounded.requests,0);
 const stopped=environment();stopped.stop=true;await assert.rejects(reviewCreationVisuals('project',{route:stopped.route,maximumBatches:2},stopped.dependencies),/stopped/);assert.equal(stopped.requests,0);
});
test('uncertainties remain blocking evidence and stale results cannot certify another package',async()=>{
 const uncertain=environment();uncertain.status='uncertain';const result=await reviewCreationVisuals('project',{route:uncertain.route,maximumBatches:2},uncertain.dependencies);assert.equal(result.outcome,'uncertain');assert.equal(uncertain.project.creation!.visualReview!.outcome,'uncertain');
 const stale=environment();stale.changeAfterRequest=true;await assert.rejects(reviewCreationVisuals('project',{route:stale.route,maximumBatches:2},stale.dependencies),/current package/);assert.equal(stale.project.creation!.visualReview,undefined);
});
