import React,{useMemo,useState} from 'react';
import {highlightJson} from './json-highlight';

export function JsonEditor({text,onChange,readOnly}:{text:string;onChange:(text:string)=>void;readOnly:boolean}){
 const tokens=useMemo(()=>highlightJson(text),[text]),lineCount=useMemo(()=>1+(text.match(/\n/g)||[]).length,[text]);
 const [scroll,setScroll]=useState({top:0,left:0,height:600});
 const firstLine=Math.max(0,Math.floor(scroll.top/20)-2),visibleLines=Math.min(lineCount-firstLine,Math.ceil(scroll.height/20)+5);
 return <div className="json-editor"><div className="json-line-numbers" aria-hidden="true"><div style={{transform:`translateY(${14+firstLine*20-scroll.top}px)`}}>{Array.from({length:Math.max(0,visibleLines)},(_,index)=><div key={firstLine+index}>{firstLine+index+1}</div>)}</div></div><div className="json-code"><div className="json-highlight-layer" aria-hidden="true"><pre style={{transform:`translate(${-scroll.left}px,${-scroll.top}px)`}}>{tokens.map((token,index)=><span key={index} className={'json-token-'+token.kind}>{token.text}</span>)}{'\n'}</pre></div><textarea className="source-editor json-source-editor" aria-label="JSON source" spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" readOnly={readOnly} value={text} onChange={event=>onChange(event.target.value)} onScroll={event=>{const element=event.currentTarget;setScroll({top:element.scrollTop,left:element.scrollLeft,height:element.clientHeight});}}/></div></div>;
}
