import React,{useEffect,useRef} from 'react';

export function closeWorkspaceMenus(){document.querySelectorAll<HTMLDetailsElement>('details[data-workspace-menu][open]').forEach(menu=>menu.open=false);}

export function WorkspaceMenu({className,children}:{className:string;children:React.ReactNode}){
 const ref=useRef<HTMLDetailsElement>(null);
 // The mobile backdrop is a pseudo-element of details, so its pointer target is the menu itself.
 useEffect(()=>{const dismiss=(event:PointerEvent)=>{const menu=ref.current;if(menu?.open&&(!menu.contains(event.target as Node)||event.target===menu))menu.open=false;};const escape=(event:KeyboardEvent)=>{const menu=ref.current;if(event.key==='Escape'&&menu?.open){menu.open=false;menu.querySelector('summary')?.focus();event.preventDefault();}};document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};},[]);
 return <details ref={ref} className={className} data-workspace-menu onToggle={event=>{const current=event.currentTarget;if(current.open)document.querySelectorAll<HTMLDetailsElement>('details[data-workspace-menu][open]').forEach(menu=>{if(menu!==current)menu.open=false;});}}>{children}</details>;
}
