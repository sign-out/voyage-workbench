import React from 'react';
import {MoreHorizontal,type LucideIcon} from 'lucide-react';
import {normalizeNavigation,type NavigationPreferences} from './workspace-preferences';
import {WorkspaceMenu} from './WorkspaceMenu';

export type WorkspaceTab = readonly [string,string,LucideIcon];
type NavigationProps = {
 tabs: readonly WorkspaceTab[];
 activeTab: string;
 proposalCount: number;
 onNavigate: (next:string)=>boolean;
 preferences?:NavigationPreferences;
};

export function WorkbenchNavigation({tabs,activeTab,proposalCount,onNavigate,preferences}:NavigationProps){
 const navigation=normalizeNavigation(preferences,tabs.map(tab=>tab[0]));
 const primaryTools=navigation.desktop,mobileTools=navigation.mobile;
 const orderedTabs=navigation.order.flatMap(id=>tabs.filter(tab=>tab[0]===id));
 return <nav className="workspace-tools" aria-label="Workspace tools">
  {orderedTabs.filter(([id])=>primaryTools.includes(id)||mobileTools.includes(id)).map(([id,name,Icon])=><button key={id} className={'tool-button '+(primaryTools.includes(id)?'desktop-primary ':'')+(mobileTools.includes(id)?'mobile-primary ':'')+(activeTab===id?'selected':'')} aria-current={activeTab===id?'page':undefined} onClick={()=>onNavigate(id)}><Icon size={17}/><span>{name}</span>{id==='review'&&proposalCount>0&&<b aria-label={proposalCount+' proposals'}>{proposalCount}</b>}</button>)}
  <WorkspaceMenu className="tools-menu">
   <summary aria-label="All tools"><MoreHorizontal size={18}/><span>All tools</span>{!primaryTools.includes(activeTab)&&<strong className="current-tool">{tabs.find(([id])=>id===activeTab)?.[1]}</strong>}</summary>
   <div className="tools-menu-items" role="group" aria-label="All workspace tools"><div className="tools-menu-heading">Workspace tools</div>{orderedTabs.map(([id,name,Icon])=><button key={id} aria-current={activeTab===id?'page':undefined} onClick={event=>{if(onNavigate(id))event.currentTarget.closest('details')?.removeAttribute('open');}}><Icon size={17}/><span>{name}</span>{id==='review'&&proposalCount>0&&<b>{proposalCount}</b>}</button>)}</div>
  </WorkspaceMenu>
 </nav>;
}
