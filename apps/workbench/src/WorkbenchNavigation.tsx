import React,{useEffect,useRef} from 'react';
import {Compass,Menu,MessageSquare,MoreHorizontal,type LucideIcon} from 'lucide-react';
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
 const shortcuts=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const list=shortcuts.current;if(!list)return;
  const reveal=()=>{const selected=list.querySelector<HTMLElement>('[aria-current="page"]');if(selected?.getClientRects().length)selected.scrollIntoView({block:'nearest',inline:'nearest'});};
  reveal();const observer=new ResizeObserver(reveal);observer.observe(list);
  return()=>observer.disconnect();
 },[activeTab,navigation.order.join(','),mobileTools.join(',')]);
 return <nav className={'workspace-tools'+(activeTab==='plan'?' chat-active':'')} aria-label="Workspace tools">
  <div ref={shortcuts} className="workspace-shortcuts">{orderedTabs.filter(([id])=>primaryTools.includes(id)||mobileTools.includes(id)).map(([id,name,Icon])=><button key={id} className={'tool-button '+(primaryTools.includes(id)?'desktop-primary ':'')+(mobileTools.includes(id)?'mobile-primary ':'')+(activeTab===id?'selected':'')} aria-current={activeTab===id?'page':undefined} onClick={()=>onNavigate(id)}><Icon size={17}/><span>{name}</span>{id==='review'&&proposalCount>0&&<b aria-label={proposalCount+' proposals'}>{proposalCount}</b>}</button>)}</div>
  <WorkspaceMenu className="tools-menu">
   <summary aria-label={proposalCount>0?'All tools, '+proposalCount+' proposals':'All tools'}><MoreHorizontal className="desktop-tools-icon" size={18}/><Menu className="mobile-tools-icon" size={20}/><span>All tools</span>{proposalCount>0&&<b className="mobile-menu-count" aria-hidden="true">{proposalCount}</b>}{!primaryTools.includes(activeTab)&&<strong className="current-tool">{tabs.find(([id])=>id===activeTab)?.[1]}</strong>}</summary>
   <div className="tools-menu-items" role="group" aria-label="All workspace tools"><div className="tools-menu-heading">Workspace tools</div>{orderedTabs.map(([id,name,Icon])=><button key={id} aria-current={activeTab===id?'page':undefined} onClick={event=>{if(onNavigate(id))event.currentTarget.closest('details')?.removeAttribute('open');}}><Icon size={17}/><span>{name}</span>{id==='review'&&proposalCount>0&&<b>{proposalCount}</b>}</button>)}</div>
  </WorkspaceMenu>
  {!mobileTools.includes(activeTab)&&activeTab!=='plan'&&<div className="mobile-tool-heading">{tabs.find(([id])=>id===activeTab)?.[1]}</div>}
 </nav>;
}

export function MobileWorkspaceMode({activeTab,editorTab,onNavigate,navRef}:{activeTab:string;editorTab:string;onNavigate:(next:string)=>boolean;navRef?:React.Ref<HTMLElement>}){
 const chat=activeTab==='plan';
 return <nav ref={navRef} className="mobile-workspace-mode" aria-label="Workspace mode">
  <button aria-pressed={chat} onClick={()=>onNavigate('plan')}><MessageSquare size={20}/>Chat</button>
  <button aria-pressed={!chat} onClick={()=>onNavigate(editorTab==='plan'?'editor':editorTab)}><Compass size={20}/>Editor</button>
 </nav>;
}
