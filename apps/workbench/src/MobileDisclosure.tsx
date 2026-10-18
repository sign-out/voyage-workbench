import React,{useEffect,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {useCompactLayout} from './responsive-layout';

// Keep supporting controls expanded on desktop and one tap away on phones.
export function MobileDisclosure({title,children,className=''}:{title:string;children:React.ReactNode;className?:string}){
 const compact=useCompactLayout();
 const [open,setOpen]=useState(!compact);
 useEffect(()=>setOpen(!compact),[compact]);
 return <details className={'mobile-disclosure '+className} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>{title}<ChevronDown size={18}/></summary>
  <div className="mobile-disclosure-body">{children}</div>
 </details>;
}
