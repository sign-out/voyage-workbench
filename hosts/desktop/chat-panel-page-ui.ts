export const chatPanelPageUiScript=`(()=>{
 window.addEventListener('contextmenu',event=>{event.stopImmediatePropagation();},true);
 const hiddenControls=new WeakMap();
 const hideAskChatGPT=()=>{
  for(const control of document.querySelectorAll('button,[role="button"],[role="menuitem"]')){
   const label=(control.getAttribute('aria-label')||control.textContent||'').replace(/\\s+/g,' ').trim();
   if(label==='Ask ChatGPT'){
    if(!hiddenControls.has(control))hiddenControls.set(control,{value:control.style.getPropertyValue('display'),priority:control.style.getPropertyPriority('display')});
    control.style.setProperty('display','none','important');
   }else if(hiddenControls.has(control)){
    const previous=hiddenControls.get(control);
    if(control.style.getPropertyValue('display')==='none'&&control.style.getPropertyPriority('display')==='important'){
     if(previous.value)control.style.setProperty('display',previous.value,previous.priority);else control.style.removeProperty('display');
    }
    hiddenControls.delete(control);
   }
  }
 };
 hideAskChatGPT();
 new MutationObserver(hideAskChatGPT).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','role']});
})();`;
