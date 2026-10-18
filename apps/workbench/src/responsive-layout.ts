import {useCallback,useEffect,useState,type RefCallback} from 'react';

// Wide phones still need compact controls when landscape leaves little height.
export const compactLayoutQuery='(width < 761px), (pointer:coarse) and (height < 501px)';

export function useCompactLayout(){
 const [compact,setCompact]=useState(()=>typeof window!=='undefined'&&window.matchMedia(compactLayoutQuery).matches);
 useEffect(()=>{
  const media=window.matchMedia(compactLayoutQuery);
  const change=()=>setCompact(media.matches);
  change();media.addEventListener('change',change);
  return()=>media.removeEventListener('change',change);
 },[]);
 return compact;
}

// Menus follow the rendered bars, including text scaling and safe-area padding.
export function useMeasuredBlockSize(property:string):RefCallback<HTMLElement>{
 return useCallback(element=>{
  if(!element)return;
  const workspace=element.closest<HTMLElement>('.workspace');
  if(!workspace)return;
  const measure=()=>workspace.style.setProperty(property,element.getBoundingClientRect().height+'px');
  const observer=new ResizeObserver(measure);
  measure();observer.observe(element,{box:'border-box'});
  return()=>{observer.disconnect();workspace.style.removeProperty(property);};
 },[property]);
}

// Rotation and the keyboard can shrink a scrollport without moving its focus.
export function useVisibleEditorFocus():RefCallback<HTMLElement>{
 return useCallback(editor=>{
  if(!editor)return;
  let frame=0;
  const reveal=()=>{
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    if(!window.matchMedia(compactLayoutQuery).matches)return;
    const field=document.activeElement;
    if(!(field instanceof HTMLTextAreaElement||field instanceof HTMLInputElement)||!editor.contains(field))return;
    const bounds=editor.getBoundingClientRect(),r=field.getBoundingClientRect();
    const actions=editor.querySelector('.editor-actions')?.getBoundingClientRect();
    const bottom=Math.min(bounds.bottom,actions?.top??bounds.bottom);
    if(r.top<bounds.top||r.top+Math.min(44,r.height)>bottom)field.scrollIntoView({block:'start',inline:'nearest'});
   });
  };
  const observer=new ResizeObserver(reveal);
  observer.observe(editor);
  window.visualViewport?.addEventListener('resize',reveal);
  return()=>{observer.disconnect();cancelAnimationFrame(frame);window.visualViewport?.removeEventListener('resize',reveal);};
 },[]);
}
