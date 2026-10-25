import {Menu,type MenuItemConstructorOptions,type WebContents} from 'electron';

export function installEditContextMenu(contents:WebContents){
 contents.on('context-menu',(_event,params)=>{
  const flags=params.editFlags,password=params.formControlType==='input-password';
  const action=(label:string,method:'undo'|'redo'|'cut'|'copy'|'paste'|'selectAll',enabled:boolean):MenuItemConstructorOptions=>({label,enabled,click:()=>{if(!contents.isDestroyed()){contents.focus();contents[method]();}}});
  const items:MenuItemConstructorOptions[]=[];
  if(params.isEditable)items.push(action('Undo','undo',flags.canUndo),action('Redo','redo',flags.canRedo),{type:'separator'},action('Cut','cut',flags.canCut&&!password));
  items.push(action('Copy','copy',flags.canCopy&&!password));
  if(params.isEditable)items.push(action('Paste','paste',flags.canPaste));
  items.push({type:'separator'},action('Select All','selectAll',flags.canSelectAll));
  Menu.buildFromTemplate(items).popup({frame:params.frame??undefined});
 });
}
