import type {Path} from '../../../packages/core/document';

export const workspaceSessionKey='voyage-workspace-session-v1';
export type WorkspaceSession={projectId:string;tab:string;lastEditorScreen:string;path:Path;mobileEditor:boolean;editorView:'form'|'json';showProjects:boolean};

export function readWorkspaceSession(storage:Pick<Storage,'getItem'>,projectId:string,toolIds:readonly string[]):WorkspaceSession|null{
 try{
  const value=JSON.parse(storage.getItem(workspaceSessionKey)||'null');
  if(!value||value.projectId!==projectId)return null;
  const validPath=Array.isArray(value.path)&&value.path.every((key:unknown)=>typeof key==='string'||typeof key==='number'&&Number.isSafeInteger(key)&&key>=0);
  return {projectId,tab:toolIds.includes(value.tab)?value.tab:'editor',lastEditorScreen:toolIds.includes(value.lastEditorScreen)&&value.lastEditorScreen!=='plan'?value.lastEditorScreen:'editor',path:validPath?value.path:[],mobileEditor:value.mobileEditor===true,editorView:value.editorView==='json'?'json':'form',showProjects:value.showProjects===true};
 }catch{return null;}
}

export function watchWorkspaceLifecycle(resume:()=>void,pause:()=>void,surface:{window:EventTarget;document:EventTarget&{visibilityState:string}}={window,document}){
 const visibility=()=>{if(surface.document.visibilityState==='hidden')pause();else resume();};
 surface.window.addEventListener('voyage-resume',resume);
 surface.window.addEventListener('voyage-pause',pause);
 surface.window.addEventListener('pageshow',resume);
 surface.document.addEventListener('visibilitychange',visibility);
 return()=>{surface.window.removeEventListener('voyage-resume',resume);surface.window.removeEventListener('voyage-pause',pause);surface.window.removeEventListener('pageshow',resume);surface.document.removeEventListener('visibilitychange',visibility);};
}
