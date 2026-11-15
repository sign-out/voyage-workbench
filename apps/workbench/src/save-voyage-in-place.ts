import type {Project} from '../../../packages/core/project';

type SaveOptions={project:Project;hasEdits:boolean;running:boolean;connection?:{environment:string;voyage:boolean}|null;current:()=>Project|null;confirm:(message:string)=>boolean;inspectEngine?:()=>Promise<{warning:string;environment?:string}>;save:()=>Promise<void>};
const saves=new Set<string>();
export async function saveVoyageInPlace(options:SaveOptions):Promise<'saved'|'cancelled'|'link'|'connection'>{
 const {project}=options,source=project.activeSource,worldId=project.remote.worldId,etag=project.remote.etag,linkedEnvironment=project.remote.environment;
 if(saves.has(project.id))return 'cancelled';
 if(options.hasEdits||project.draft)throw new Error('Apply or discard your unsaved edits before saving to Voyage. Your current screen and local work are unchanged.');
 if(options.running)throw new Error('Wait for the current model task to finish before saving to Voyage.');
 if(project.status&&project.status!=='active')throw new Error('Restore this project to active before saving to Voyage.');
 if(!project.remote.worldId)return 'link';
 const environment=options.connection?.environment;
 if(!options.connection?.voyage||!environment)return 'connection';
 saves.add(project.id);
 try{
  const engine=options.inspectEngine?await options.inspectEngine():undefined;
  if(engine?.environment&&engine.environment!==environment)throw new Error('The selected connection changed during the engine check. Save again on the current connection.');
  if(!options.confirm('Save the active local world to the selected '+environment+' Voyage draft '+project.remote.worldId+'? Local saving remains enabled; this does not publish the world.'+(engine?.warning?'\n\n'+engine.warning:'')))return 'cancelled';
  const current=options.current();
  if(!current||current.id!==project.id||current.activeSource!==source||current.draft||current.status&&current.status!=='active'||current.remote.worldId!==worldId||current.remote.environment!==linkedEnvironment||current.remote.etag!==etag)throw new Error('The world or Voyage link changed. Save again from the current world.');
  await options.save();return 'saved';
 }finally{saves.delete(project.id);}
}
