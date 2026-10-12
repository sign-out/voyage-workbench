import React,{useState} from 'react';
import {ArrowUp,ArrowDown} from 'lucide-react';
import {type WorkspaceTab} from './WorkbenchNavigation';
import {moveTool,normalizeNavigation,shortcutLimits,toggleShortcut,type NavigationPreferences,type Theme} from './workspace-preferences';

type Props={tabs:readonly WorkspaceTab[];theme:Theme;onThemeChange:(theme:Theme)=>void;navigation:NavigationPreferences;onNavigationChange:(navigation:NavigationPreferences)=>void;notice:string};

export function WorkspaceSettings({tabs,theme,onThemeChange,navigation,onNavigationChange,notice}:Props){
 const [limitNotice,setLimitNotice]=useState('');
 function selectShortcut(surface:'desktop'|'mobile',id:string){
  const full=!navigation[surface].includes(id)&&navigation[surface].length>=shortcutLimits[surface];
  if(full){setLimitNotice((surface==='mobile'?'Phone':'Desktop')+' panel is full ('+navigation[surface].length+'/'+shortcutLimits[surface]+'). Uncheck one selected tool before adding another. The limit keeps the navigation readable; every tool remains in All tools.');return;}
  setLimitNotice('');onNavigationChange(toggleShortcut(navigation,surface,id));
 }
 return <div className="content-page workspace-settings">
  <h2>Settings</h2><p className="muted">Preferences apply to this app on this device, not to your world files. Changes save automatically.</p>
  {notice&&<p role="status">{notice}</p>}
  <section className="connection-card"><h3>Appearance</h3><label>Color theme<select aria-label="Color theme" value={theme} onChange={event=>onThemeChange(event.target.value as Theme)}><option value="dark">Graphite</option><option value="light">Light</option><option value="system">System</option></select></label></section>
  <section className="connection-card"><h3>Tool shortcuts & order</h3><p>Choose up to {shortcutLimits.desktop} desktop shortcuts and {shortcutLimits.mobile} phone shortcuts. Uncheck a shortcut to make room for another. All tools always contains every tool, including Settings.</p><p className="muted">Move tools up or down to change their order in both shortcut bars and All tools.</p>
   <div className="settings-shortcut-status"><div aria-live="polite">{(['desktop','mobile'] as const).map(surface=><p id={'shortcut-limit-'+surface} key={surface}><strong>{surface==='desktop'?'Desktop':'Phone'}: {navigation[surface].length} / {shortcutLimits[surface]} selected</strong> · {navigation[surface].length>=shortcutLimits[surface]?'Full — uncheck one to replace it':(shortcutLimits[surface]-navigation[surface].length)+' available'}</p>)}</div><p className="muted">Limits leave room for readable labels and All tools.</p>{limitNotice&&<p role="status">{limitNotice}</p>}</div>
   <div className="settings-tool-list">{navigation.order.map((id,index)=>{const tool=tabs.find(tab=>tab[0]===id);if(!tool)return null;const [,name,Icon]=tool;return <div className="settings-tool-row" key={id}>
    <span className="settings-tool-name"><Icon size={17}/>{name}</span>
    <div className="settings-shortcuts">{(['desktop','mobile'] as const).map(surface=><label key={surface}><input type="checkbox" aria-label={name+' '+surface+' shortcut'} aria-describedby={'shortcut-limit-'+surface} checked={navigation[surface].includes(id)} aria-disabled={!navigation[surface].includes(id)&&navigation[surface].length>=shortcutLimits[surface]} onChange={()=>selectShortcut(surface,id)}/>{surface==='desktop'?'Desktop':'Phone'}</label>)}</div>
    <div className="settings-tool-order"><button aria-label={'Move '+name+' up'} disabled={index===0} onClick={()=>onNavigationChange(moveTool(navigation,id,-1))}><ArrowUp size={16}/></button><button aria-label={'Move '+name+' down'} disabled={index===navigation.order.length-1} onClick={()=>onNavigationChange(moveTool(navigation,id,1))}><ArrowDown size={16}/></button></div>
   </div>;})}</div>
   <button onClick={()=>{setLimitNotice('');onNavigationChange(normalizeNavigation(null,tabs.map(tab=>tab[0])));}}>Reset tool layout</button>
  </section>
 </div>;
}
