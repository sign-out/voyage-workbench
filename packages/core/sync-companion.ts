import * as doc from './document';
import {planWorldImport,worldImportDiff,type ImportOptions} from './world-import';
import {compareRemoteWorlds,serverAdditions,voyageRevision} from './voyage';
import {voyageEnvironment,worldEngineStatus,type VoyageEnvironment} from './voyage-compatibility';

export interface SyncState {
 format:1;revision:number;environment:VoyageEnvironment;
 world?:{id:string;source:string;etag:string;environment:string};
 draft?:string;proposal?:{name:string;source:string;mode:ImportOptions['mode']};
 history?:{name:string;source:string}[];
 pending?:{id:string;environment:VoyageEnvironment;worldId:string;payload:string;source:string;etag:string;state:string;detail?:string;readback?:{text:string;etag:string}};
 notice?:string;
}
export type SyncInvoke=(method:string,payload?:any)=>Promise<any>;
const editable=['shortId','title','description','advancedDescription','discordThreadUrl','image','isLocked','isMod','isUnremixable','tags','visibility','initialGameState'];
export const syncSource=(state:SyncState)=>state.draft??state.world?.source??'';
export const syncPending=(state:SyncState)=>!!state.pending&&!['rejected'].includes(state.pending.state);
export function syncWorld(text:string){
 const root=doc.parse(text),state=doc.statePath(root);
 if(!state.length)throw new Error('Voyage did not return an editable world envelope. Local files can still contain bare GameState.');
 const source=doc.read(text,state.slice(0,-1)),world=doc.parse(source);
 if(!world.children.some(child=>child.key==='initialGameState'&&child.node.kind==='object'))throw new Error('Voyage returned no object GameState.');
 return source;
}
export function syncPayload(source:string,worldId:string){
 const world=syncWorld(source),root=doc.parse(world),identity=root.children.find(child=>child.key==='shortId');
 if(identity?.node.value!==worldId)throw new Error('The imported world identity differs from the chosen Voyage world.');
 return '{"world":{'+editable.filter(key=>root.children.some(child=>child.key===key)).map(key=>JSON.stringify(key)+':'+doc.read(world,[key])).join(',')+'}}';
}
export function syncImportPreview(state:SyncState){
 if(!state.proposal)return null;
 const before=syncSource(state);
 if(!before){const root=doc.parse(state.proposal.source);if(doc.at(root,doc.statePath(root)).kind!=='object')throw new Error('Import an object GameState or Voyage world, not a JSON list or scalar.');return {source:state.proposal.source,note:'Local file only. Choose a Voyage world before saving remotely.',report:null};}
 const plan=planWorldImport(before,state.proposal.source,{mode:state.proposal.mode},!!state.world);
 return {...plan,report:worldImportDiff(before,plan.source,30)};
}
export function syncTitle(source:string){
 try{const root=doc.parse(source),path=doc.statePath(root),world=doc.at(root,path.length?path.slice(0,-1):[]),title=world.children.find(child=>child.key==='title');return title?.node.kind==='string'?String(title.node.value):'World update';}catch{return 'World update';}
}
export class SyncCompanion {
 state!:SyncState;private active=false;
 constructor(public invoke:SyncInvoke,public progress:(message:string)=>void=()=>{}){}
 async load(){this.state=await this.invoke('state');return this.state;}
 private async exclusive<T>(action:()=>Promise<T>):Promise<T>{if(this.active)throw new Error('Wait for the current action to finish.');this.active=true;try{return await action();}finally{this.active=false;}}
 private async commit(next:SyncState){this.state=await this.invoke('commit',{expectedRevision:this.state.revision,state:next});return this.state;}
 private editable(){if(syncPending(this.state))throw new Error('Resolve the unfinished save first. Its original host and submitted data are preserved.');}
 async selectEnvironment(environment:string){return this.exclusive(async()=>{const target=voyageEnvironment(environment);return this.commit({...this.state,environment:target});});}
 async importFile(name:string,source:string){return this.exclusive(async()=>{this.editable();this.progress('Preparing world changes from '+name+'…');const next={...this.state,proposal:{name,source,mode:'merge' as const}};syncImportPreview(next);return this.commit(next);});}
 async importMode(mode:ImportOptions['mode']){return this.exclusive(async()=>{this.editable();if(!this.state.proposal)throw new Error('Choose a file first.');if(!['merge','replace'].includes(mode))throw new Error('Choose merge or replace.');return this.commit({...this.state,proposal:{...this.state.proposal,mode}});});}
 async acceptImport(){return this.exclusive(async()=>{this.editable();const preview=syncImportPreview(this.state);if(!preview)throw new Error('No import is ready.');const previous=syncSource(this.state),history=previous?[{name:'Before '+this.state.proposal!.name,source:previous},...(this.state.history||[])].slice(0,2):this.state.history;return this.commit({...this.state,draft:preview.source,proposal:undefined,history,notice:'World changes kept on this phone. Nothing uploaded.'});});}
 async discardImport(){return this.exclusive(()=>this.commit({...this.state,proposal:undefined}));}
 async restoreHistory(index:number){const entry=this.state.history?.[index];if(!entry)throw new Error('Local backup is missing.');return this.importFile(entry.name,entry.source);}
 async download(worldId:string,confirm:(message:string)=>boolean){return this.exclusive(async()=>{
  this.editable();if(!/^[A-Za-z0-9_-]{1,160}$/.test(worldId))throw new Error('Enter the world short ID, not its full website URL.');
  const local=syncSource(this.state),hasLocal=!!this.state.draft||!!this.state.proposal;
  if(hasLocal&&!confirm('Download this target and keep your local update as an import proposal? Nothing will be uploaded. Voyage may upgrade older worlds when opened.')){this.progress('Download cancelled. Your local update is unchanged.');return;}
  this.progress('Downloading world '+worldId+'…');const response=await this.invoke('readWorld',{worldId,environment:this.state.environment}),source=syncWorld(response.text);voyageRevision(response.etag);
  const identity=doc.parse(source).children.find(child=>child.key==='shortId');if(identity?.node.value!==worldId)throw new Error('Voyage returned a different world ID.');
  const proposal=this.state.proposal||(hasLocal?{name:'Local update',source:local,mode:'merge' as const}:undefined);
  const engine=worldEngineStatus(response.text,local||source,this.state.environment,worldId);
  return this.commit({...this.state,world:{id:worldId,source,etag:response.etag,environment:this.state.environment},draft:undefined,proposal,notice:engine.warning||'World downloaded and saved on this phone. Import your updated JSON next.'});
 });}
 async save(confirm:(message:string)=>boolean){return this.exclusive(async()=>{
  if(syncPending(this.state))throw new Error('Check the unfinished save instead of starting another write.');
  if(this.state.proposal)throw new Error('Keep or discard the proposed import first.');
  const world=this.state.world,source=syncSource(this.state);if(!world||!source)throw new Error('Choose an owned Voyage world as the update target first.');
  this.progress('Checking the latest Voyage draft and engine…');
  const remote=await this.invoke('readWorld',{worldId:world.id,environment:this.state.environment}),latest=syncWorld(remote.text);voyageRevision(remote.etag);
  const engine=worldEngineStatus(remote.text,source,this.state.environment,world.id);
  if(!compareRemoteWorlds(syncPayload(world.source,world.id),syncPayload(latest,world.id)).matches)throw new Error('The remote world changed since your download. Download latest; your local update will be kept as a proposal. Review it against that latest draft before saving.'+(engine.warning?'\n\n'+engine.warning:''));
  const payload=syncPayload(source,world.id);
  const report=worldImportDiff(latest,source,0);
  if(!report.total){await this.commit({...this.state,world:{...world,source:latest,etag:remote.etag,environment:this.state.environment},draft:undefined,notice:'No world-value changes to save. Formatting-only differences were ignored.'});return;}
  if(!confirm('Save '+report.counts.world+' world changes and '+(report.total-report.counts.world)+' other state changes to '+world.id+' using '+this.state.environment+'? This updates its draft, not its publication.'+(engine.warning?'\n\n'+engine.warning:''))){this.progress('Save cancelled. No update was uploaded.');return;}
  if(engine.pendingVersionUpgrade)throw new Error('Voyage requires engine-upgrade approval in Studio. Open selected Studio, approve only if intended, then download the updated draft and review your import again.');
  const id='save-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  await this.commit({...this.state,world:{...world,etag:remote.etag},pending:{id,environment:this.state.environment,worldId:world.id,payload,source,etag:voyageRevision(remote.etag),state:'prepared'}});
  this.progress('Validating, then saving with revision protection…');
  try{this.state=await this.invoke('sendSave',{id});}catch(error){await this.load();throw error;}
  if(this.state.pending?.state==='rejected')throw new Error(this.state.pending.detail||'Voyage rejected this update before saving.');
  await this.reconcileInternal(false,confirm);
 });}
 async reconcile(acceptDifferent:boolean,confirm:(message:string)=>boolean){return this.exclusive(()=>this.reconcileInternal(acceptDifferent,confirm));}
 private async reconcileInternal(acceptDifferent:boolean,confirm:(message:string)=>boolean){
  const pending=this.state.pending;if(!pending)throw new Error('No unfinished save needs checking.');
  if(['prepared','rejected','validating'].includes(pending.state)){this.state=await this.invoke('discardUnsent',{id:pending.id});return;}
  this.progress('Reading the save result from its original '+pending.environment+' connection…');
  this.state=await this.invoke('readback',{id:pending.id});const operation=this.state.pending!,reply=operation.readback!;
  const source=syncWorld(reply.text),payload=syncPayload(source,operation.worldId),comparison=compareRemoteWorlds(operation.payload,payload),additions=serverAdditions(operation.payload,payload);
  let resolution='confirmed';
  if(!comparison.matches&&!additions.safe){
   const report=worldImportDiff(operation.source,source,20);
   if(!acceptDifferent||!confirm('Voyage returned '+report.counts.world+' world changes and '+(report.total-report.counts.world)+' other state changes compared with your submission. Accept the downloaded result? Your submitted world stays in a local backup. This sends no write.')){
    this.progress('Save result differs. Review the returned world changes before accepting it; no write was retried.');return;
   }
   resolution='accepted';
  }else if(additions.safe&&!comparison.matches)resolution='additions';
  this.state=await this.invoke('resolveSave',{id:operation.id,resolution,source,etag:reply.etag});
  this.progress(resolution==='confirmed'?'Saved to Voyage and confirmed by read-back.':resolution==='additions'?'Saved; verified server additions were kept automatically.':'Downloaded result accepted. No write was resent.');
 }
}
