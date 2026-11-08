import React,{useEffect,useRef} from 'react';
import {useCompactLayout} from './responsive-layout';

export function ListDetail({selection,listKey='',listLabel,detailLabel,onBack,blocked=false,list,detail}:{selection:string;listKey?:string;listLabel:string;detailLabel:string;onBack:()=>void;blocked?:boolean;list:React.ReactNode;detail:React.ReactNode}){
 const compact=useCompactLayout(),listRef=useRef<HTMLElement>(null),detailRef=useRef<HTMLElement>(null),scroll=useRef(0),launcher=useRef<HTMLElement|null>(null);
 useEffect(()=>{if(listRef.current)listRef.current.scrollTop=0;scroll.current=0;},[listKey]);
 useEffect(()=>{
  if(!compact)return;
  if(selection){detailRef.current?.scrollIntoView({block:'nearest'});detailRef.current?.focus({preventScroll:true});}
  else if(listRef.current){listRef.current.scrollTop=scroll.current;if(launcher.current?.isConnected)launcher.current.focus({preventScroll:true});}
 },[selection,compact]);
 return <div className={'library-layout list-detail-layout'+(selection?' has-selection':'')}>
  <section ref={listRef} className="list-detail-list" role="region" aria-label={listLabel} tabIndex={0} onClickCapture={event=>{scroll.current=event.currentTarget.scrollTop;launcher.current=(event.target as HTMLElement).closest<HTMLElement>('.library-row');}}>{list}</section>
  <section ref={detailRef} className="list-detail-editor" role="region" aria-label={detailLabel} tabIndex={-1}><div className="list-detail-mobile-heading"><button type="button" className="list-detail-back" disabled={blocked} onClick={onBack}>← {listLabel}</button>{blocked&&<small>Save, review or discard the current edits before leaving this entry.</small>}</div>{detail}</section>
 </div>;
}
