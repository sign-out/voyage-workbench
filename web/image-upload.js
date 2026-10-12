/** Official Voyage uploads go through the local authenticated backend. */
export const IMAGE_UPLOAD_TARGETS = ['AREA_IMAGE','LOCATION_IMAGE','NPC_PORTRAIT','REGION_MAP_IMAGE'];
const labels={AREA_IMAGE:'Area image',LOCATION_IMAGE:'Location image',NPC_PORTRAIT:'NPC portrait',REGION_MAP_IMAGE:'Region map image'};
export function initImageUploads({api,node,getProject,status=()=>{}}){
 const make=node||((tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;});
 if(!document.querySelector('link[data-image-upload-style]')){const css=make('link');css.rel='stylesheet';css.href='/image-upload.css';css.dataset.imageUploadStyle='';document.head.append(css);}
 let panel=null,epoch=0,dialog=null;
 const projectKey=()=>{const p=getProject();return p?`${p.id}:${p.remote?.shortId||''}`:'';};
 const linkedKey=link=>link?`${link.shortId}:${link.environment||''}`:'';
 const endpoint=id=>`/api/projects/${encodeURIComponent(id)}/uploads`;
 function cooldown(control,seconds,label){const until=Date.now()+Math.max(0,Number(seconds)||0)*1000;if(until<=Date.now())return;const tick=()=>{if(!control.isConnected)return;const left=Math.ceil((until-Date.now())/1000);control.disabled=left>0;control.textContent=left>0?`${label} (${left}s)`:label;if(left>0)setTimeout(tick,1000);};setTimeout(tick,0);}
 const button=(text,fn)=>{const b=make('button',text);b.type='button';b.onclick=fn;return b;};
 function canonical(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
 function showUrl(host,upload){const url=canonical(upload.imageUrl);if(!url)return;const field=make('input');field.readOnly=true;field.value=url;field.setAttribute('aria-label','Canonical Voyage image URL');field.onclick=()=>field.select();const a=make('a','Open uploaded image');a.href=url;a.target='_blank';a.rel='noopener noreferrer';host.append(field,a);}
 function history(host,rows,pid,linked){const identity=projectKey();host.replaceChildren();if(!rows.length)host.append(make('p','No uploads for this local world yet.'));for(const upload of rows){const row=make('article',undefined,'iu-history-item');row.append(make('strong',`${labels[upload.target]||upload.target} · ${upload.status}`));if(upload.error)row.append(make('p',String(upload.error)));showUrl(row,upload);if(upload.canRetry){const retry=button('Retry upload',async()=>{if(identity!==projectKey())return;retry.disabled=true;const note=make('p','Checking upload…');row.append(note);try{const latest=await api(endpoint(pid));if(identity!==projectKey())return;if(linkedKey(latest.linked)!==linkedKey(linked))throw new Error('Linked world changed. Refresh upload history.');const record=(latest.uploads||[]).find(r=>r.id===upload.id);if(!record?.canRetry){await refresh();return;}note.textContent='Retrying upload and moderation…';await api(`${endpoint(pid)}/${encodeURIComponent(upload.id)}/send`,{});if(identity===projectKey())await refresh();}catch(error){if(identity===projectKey())note.textContent=error.message;}finally{retry.disabled=false;}});row.append(retry);cooldown(retry,upload.retryAfterSeconds,'Retry upload');}host.append(row);}}
 async function refresh(){if(!panel)return;const p=getProject(),generation=++epoch,key=projectKey();panel.list.replaceChildren();if(!p){panel.info.textContent='Open a local world to upload images.';panel.launch.disabled=true;return;}panel.info.textContent='Loading upload history…';try{const data=await api(endpoint(p.id));if(generation!==epoch||key!==projectKey())return;panel.launch.disabled=!data.linked;panel.info.textContent=data.linked?`Linked Voyage world: ${data.linked.shortId}. Uploading an image does not publish your world.`:'Link this local world to Voyage before uploading images.';history(panel.list,data.uploads||[],p.id,data.linked);}catch(error){if(generation===epoch){panel.info.textContent=error.message;panel.launch.disabled=true;}}}
 function createPanel(){if(panel)return panel.element;const element=make('section',undefined,'image-uploads'),info=make('p'),list=make('div',undefined,'iu-history'),launch=button('Upload image…',()=>open());element.append(make('h2','Image uploads'),info,launch,button('Refresh uploads',refresh),list);panel={element,info,list,launch};void refresh();return element;}
 async function open({target='REGION_MAP_IMAGE',assetId='',onUploaded}={}){
  if(!IMAGE_UPLOAD_TARGETS.includes(target))throw new Error('Unsupported image target.');
  const project=getProject();if(!project){status('Open a local world first.',true);return;}
  if(dialog)dialog.close();const identity=projectKey(),pid=project.id;
  const d=make('dialog',undefined,'image-upload-dialog');dialog=d;
  const msg=make('p','Loading upload options…','iu-message');msg.setAttribute('role','status');msg.setAttribute('aria-live','polite');
  const form=make('fieldset'),kind=make('select'),source=make('select'),file=make('input'),asset=make('select'),constraints=make('p',undefined,'iu-constraints'),result=make('div',undefined,'iu-result');
  for(const type of IMAGE_UPLOAD_TARGETS){const opt=make('option',labels[type]);opt.value=type;kind.append(opt);}kind.value=target;kind.setAttribute('aria-label','Image target');kind.disabled=Boolean(onUploaded);
  for(const [value,label] of [['file','Choose a local file'],['asset','Use generated artwork']]){const opt=make('option',label);opt.value=value;source.append(opt);}source.value=assetId?'asset':'file';source.setAttribute('aria-label','Image source');
  file.type='file';file.accept='image/png,image/jpeg,image/webp';file.setAttribute('aria-label','Image file');asset.setAttribute('aria-label','Generated artwork');
  const label=(text,control)=>{const wrap=make('label',text);wrap.append(control);return wrap;};
  const fileWrap=label('Local image',file),assetWrap=label('Generated artwork',asset);const sync=()=>{fileWrap.hidden=source.value!=='file';assetWrap.hidden=source.value!=='asset';};source.onchange=sync;sync();
  const send=button('Upload to Voyage',submit);send.disabled=true;const close=button('Close',()=>d.close());
  form.append(label('Target',kind),label('Source',source),fileWrap,assetWrap,constraints,send);
  d.append(make('h2','Upload image to Voyage'),make('p','The image is uploaded and checked by Voyage. A successful URL can be used in your working world; save and publish the world separately.'),form,msg,result,close);
  document.body.append(d);d.showModal();let data=null,busy=false,completed=false,preparedId=null;
  d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;});
  const current=()=>d.open&&projectKey()===identity;
  function requirements(){const c=data?.constraints||{},r=c.targets?.[kind.value]||{};constraints.textContent=`PNG, JPEG or WebP · up to ${((c.maxFileSizeBytes||5242880)/1048576).toLocaleString()} MiB · minimum ${r.minimumWidth||600} × ${r.minimumHeight||600} px`+(r.recommendedWidth?` · recommended ${r.recommendedWidth} × ${r.recommendedHeight} px`:'');}
  kind.onchange=requirements;
  try{data=await api(endpoint(pid));if(!current())return;for(const a of data.assets||[]){const opt=make('option',`${(a.prompt||a.metadata?.name||'Generated image').slice(0,90)} · ${a.id.slice(0,8)}`);opt.value=a.id;asset.append(opt);}if(assetId)asset.value=assetId;requirements();send.disabled=!data.linked;msg.textContent=data.linked?`Destination world: ${data.linked.shortId}`:'Link this local world to Voyage before uploading.';}catch(error){if(current())msg.textContent=error.message;}
  async function submit(){if(busy||completed||!current())return;busy=true;form.disabled=true;result.replaceChildren();try{
   if(!data?.linked)throw new Error('Link this local world to Voyage first.');
   const body={target:kind.value};
   if(!preparedId){
   if(source.value==='asset'){if(!asset.value)throw new Error('Choose generated artwork.');body.assetId=asset.value;}
   else{const f=file.files?.[0];if(!f)throw new Error('Choose an image file.');if(f.size>(data.constraints?.maxFileSizeBytes||5242880))throw new Error('Image exceeds the upload size limit.');if(!['image/png','image/jpeg','image/webp'].includes(f.type))throw new Error('Choose a PNG, JPEG or WebP image.');body.imageData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read image file.'));reader.readAsDataURL(f);});}
   if(!current())throw new Error('Project changed. Reopen the upload dialog.');
   msg.textContent='Preparing image locally…';const prepared=await api(endpoint(pid),body);preparedId=prepared.id;}
   if(!current())return;
   msg.textContent='Uploading to Voyage and checking the image…';const uploaded=await api(`${endpoint(pid)}/${encodeURIComponent(preparedId)}/send`,{});
   if(!current())return;
   completed=!uploaded.canRetry;showUrl(result,uploaded);if(uploaded.canRetry){send.textContent='Retry upload to Voyage';cooldown(send,uploaded.retryAfterSeconds,'Retry upload to Voyage');}
   if(uploaded.status==='ready'&&canonical(uploaded.imageUrl)){msg.textContent='Image uploaded and approved.';if(onUploaded){try{const latest=await api(endpoint(pid));if(!current())return;if(linkedKey(latest.linked)!==linkedKey(data.linked))throw new Error('The linked Voyage world changed during upload. Copy the approved URL manually if appropriate.');await onUploaded(uploaded);msg.textContent='Image uploaded and added to your working copy. Save the world separately.';}catch(error){msg.textContent=`Image uploaded, but the working copy was not changed: ${error.message}`;}}}
   else msg.textContent=`Upload ${uploaded.status||'incomplete'}. ${uploaded.error||'No approved URL is available yet. Refresh upload history to check its status.'}`;
   void refresh();
  }catch(error){if(current())msg.textContent=error.message;}finally{busy=false;if(d.open){form.disabled=completed;for(const control of [kind,source,file,asset])control.disabled=Boolean(preparedId)||(control===kind&&Boolean(onUploaded));send.disabled=completed||!data?.linked;}}}
  return d;
 }
 function projectChanged(){epoch++;if(dialog)dialog.close();return refresh();}
 return {open,createPanel,refresh,projectChanged};
}
