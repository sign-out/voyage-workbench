import profiles from './voyage-compatibility.json';
import * as doc from './document';
import {sha256} from 'js-sha256';
import type {Project} from './project';

export type VoyageEnvironment=keyof typeof profiles.environments;
export const voyageEnvironments=Object.keys(profiles.environments) as VoyageEnvironment[];
export type ContractSnapshot={environment:VoyageEnvironment;version:string;hash:string;guideHash:string;checked:number;operations:string[];media:Record<string,{width:number;height:number}>};
export function isVoyageEnvironment(value:unknown):value is VoyageEnvironment {
 return typeof value==='string'&&Object.prototype.hasOwnProperty.call(profiles.environments,value);
}
export function voyageEnvironment(value:unknown):VoyageEnvironment {
 if(!isVoyageEnvironment(value))throw new Error('Unsupported Voyage API environment. Choose a configured environment in Connections.');
 return value;
}
export function voyageProfile(environment:unknown){return profiles.environments[voyageEnvironment(environment)];}
export function inspectVoyageContract(environment:unknown,text:string,guide:string,checked=Date.now()):ContractSnapshot {
 const target=voyageEnvironment(environment);
 if(text.length>1024*1024||guide.length>256*1024)throw new Error('Voyage documentation exceeds the local size limit.');
 const value=JSON.parse(text);
 if(value.info?.title!=='Voyage Creator API'||typeof value.info.version!=='string'||!value.info.version||!value.servers?.every((server:any)=>server.url==='/creator/v1')||!value.servers.length||!value.paths?.['/worlds']?.get||!value.paths?.['/validate']?.post||!guide.includes('Creator API'))throw new Error('Unexpected Voyage Creator API documentation. Previous settings are retained.');
 const media:ContractSnapshot['media']=Object.create(null),constraints=value['x-media-constraints']?.targets;
 if(!constraints?.WORLD_COVER)throw new Error('Voyage contract does not declare cover recommendations.');
 Object.keys(constraints).forEach(key=>{
  const width=constraints[key].recommendedWidth,height=constraints[key].recommendedHeight;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>64000000)throw new Error('Invalid Voyage media recommendation.');
  media[key]={width,height};
 });
 const operations:string[]=[];
 Object.keys(value.paths).sort().forEach(path=>Object.keys(value.paths[path]).sort().forEach(method=>{if(['get','post','put','patch','delete'].includes(method))operations.push(method.toUpperCase()+' '+path);}));
 return {environment:target,version:value.info.version,hash:sha256(text),guideHash:sha256(guide),checked,operations,media};
}
export function coverRecommendation(environment:unknown='alpha',snapshot?:ContractSnapshot|null){
 const target=voyageEnvironment(environment),live=snapshot?.environment===target?snapshot.media.WORLD_COVER:undefined;
 return live||voyageProfile(target).cover;
}
export function releaseAdvisories(source:string,environment:unknown,stage:'draft'|'publish'='draft'){
 const profile=voyageProfile(environment),issues:{level:'warning';path:doc.Path;message:string}[]=[];
 if(!profile.release)return issues;
 const release=profile.release;
 const add=(path:doc.Path,message:string)=>{issues.push({level:'warning',path,message:release.label+' announcement: '+message+' Advisory only; official '+stage+' validation decides acceptance.'});};
 for(const scope of doc.authoredScopes(source)){
  const world=doc.at(doc.parse(source),scope.path),items=world.children.find(child=>child.key==='itemTypes')?.node;
  if(stage==='publish'&&items?.kind==='object'){
   const estimate=source.slice(items.start,items.end).length;
   if(estimate>release.itemCatalogCharacters)add(scope.path.concat('itemTypes'),'item catalog source is '+estimate+' UTF-16 code units including JSON syntax/spacing; the announced authored cap is '+release.itemCatalogCharacters+' characters. Upstream counting is not verified.');
   items.children.forEach(item=>{
    const media=item.node.children.find(child=>child.key==='mediaContent')?.node;
    if(media?.kind==='string'&&String(media.value).length>release.itemMediaCharacters)add(scope.path.concat('itemTypes',item.key,'mediaContent'),'Media Content is '+String(media.value).length+' UTF-16 code units; the announced publish cap is '+release.itemMediaCharacters+' characters. Shorten it before publishing; existing saves must not be truncated. Upstream counting is not verified.');
   });
  }
  if(world.children.some(child=>['resourceSettings','attributeSettings'].includes(String(child.key))))release.schemaNotices.forEach(notice=>add(scope.path,notice));
 }
 return issues;
}
export function compatibilityIdentity(source:string){
 const root=doc.parse(source),world=doc.at(root,doc.statePath(root));
 const scalar=(key:string)=>{const node=world.children.find(child=>child.key===key)?.node;return node?.kind==='number'?source.slice(node.start,node.end):node?.kind==='string'?String(node.value):'Unknown';};
 return {heroesVersion:scalar('heroesVersion'),compatibilityRevision:scalar('compatibilityRevision')};
}
export type EngineVersion={heroesVersion:number;compatibilityRevision:number};
export type WorldEngineStatus={environment:VoyageEnvironment;worldId:string;checked:number;savedVersion?:EngineVersion;draftVersion?:EngineVersion;pendingVersionUpgrade?:{sourceVersion:EngineVersion;targetVersion:EngineVersion};warning:string};
export function worldEngineStatus(response:string,source:string,environment:unknown,worldId:string,checked=Date.now()):WorldEngineStatus {
 const root=doc.parse(response),target=voyageEnvironment(environment);
 const version=(value:any):EngineVersion|undefined=>{
  if(value===undefined)return undefined;
  if(!value||!Number.isSafeInteger(value.heroesVersion)||value.heroesVersion<0||!Number.isSafeInteger(value.compatibilityRevision)||value.compatibilityRevision<0)throw new Error('Voyage returned invalid engine-version metadata; compatibility is unknown.');
  return {heroesVersion:value.heroesVersion,compatibilityRevision:value.compatibilityRevision};
 };
 const data=root.children.find(child=>child.key==='data')?.node;
 const metadata=(key:string)=>{const node=data?.children.find(child=>child.key===key)?.node;return node?JSON.parse(response.slice(node.start,node.end)):undefined;};
 const savedVersion=version(metadata('savedVersion')),pending=metadata('pendingVersionUpgrade');
 const pendingVersionUpgrade=pending===undefined?undefined:{sourceVersion:version(pending?.sourceVersion)!,targetVersion:version(pending?.targetVersion)!};
 if(pendingVersionUpgrade&&(!pendingVersionUpgrade.sourceVersion||!pendingVersionUpgrade.targetVersion))throw new Error('Voyage returned incomplete engine-upgrade metadata; compatibility is unknown.');
 const fromSource=(text:string)=>{const identity=compatibilityIdentity(text);return identity.heroesVersion==='Unknown'||identity.compatibilityRevision==='Unknown'?undefined:version({heroesVersion:Number(identity.heroesVersion),compatibilityRevision:Number(identity.compatibilityRevision)});};
 const draftVersion=fromSource(response),localVersion=fromSource(source),after=pendingVersionUpgrade?.targetVersion||draftVersion;
 const isNewer=(before:EngineVersion|undefined)=>!!before&&!!after&&(after.heroesVersion>before.heroesVersion||after.heroesVersion===before.heroesVersion&&after.compatibilityRevision>before.compatibilityRevision);
 const before=pendingVersionUpgrade?.sourceVersion||(isNewer(savedVersion)?savedVersion:localVersion||savedVersion),newer=isNewer(before);
 const describe=(value:EngineVersion)=>'V'+value.heroesVersion+' / revision '+value.compatibilityRevision;
 const warning=newer?'World engine upgrade: '+describe(before!)+' → '+describe(after!)+'. Saving this upgrade may make the world unavailable in Voyage environments running an older engine.'+(pendingVersionUpgrade?' Voyage requires your approval in this environment’s Studio before editing. No upgrade has been approved by Workbench.':!savedVersion?' Voyage did not report the persisted engine version; the newer returned draft is not proof that an upgrade has been saved.':''):'';
 return {environment:target,worldId,checked,savedVersion,draftVersion,pendingVersionUpgrade,warning};
}
export function workspacePersistence(project:Project,options:{dirty?:boolean;saving?:boolean;online?:boolean}={}){
 if(options.saving)return 'Saving local changes…';
 if(options.dirty)return 'Unsaved changes · not saved locally or to Voyage';
 if(project.draft)return 'Draft saved locally · unapplied; not saved to Voyage';
 const operation=project.remote.operations[0];
 if(operation&&['UNKNOWN','SEND_ATTEMPTED'].includes(operation.state))return 'Saved locally · Voyage save outcome unconfirmed';
 if(!project.remote.worldId)return 'Saved locally · not linked to Voyage';
 if(options.online===false)return 'Saved locally · offline; Voyage not checked';
 if(project.remote.baselineHash!==sha256(project.activeSource))return 'Saved locally · changes not saved to Voyage';
 return 'Saved locally · matches last checked Voyage draft';
}
