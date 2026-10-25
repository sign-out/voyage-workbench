import React,{useEffect,useRef,useState} from 'react';
import {artworkDestinations,artworkPrompt,assignArtwork,imageTargets,type ArtworkDestination} from '../../../packages/core/artwork';
import {resolveRoute} from '../../../packages/core/providers';
import {hash,type Project} from '../../../packages/core/project';
import type {ArtworkProposal} from '../../../packages/core/artwork-requests';
import {mediaUrl} from '../../../packages/core/studio';
import {AssetPicker,ImageFileImport} from './AssetLibrary';
import {ImageInspection} from './ImageInspection';
import {feature,saveAsset,type Asset} from './features-api';
import {request} from './host';
import {saveGeneration,type Generation} from './artwork-generation';

type Assignment={source:string;destination:ArtworkDestination;assetId?:string};
type Props={project:Project;apply:(source:string,base:string)=>Promise<any>;onCover:(asset?:Asset)=>void;onDirtyChange?:(dirty:boolean)=>void;command?:(command:any)=>Promise<any>};
export async function importArtworkFile(file:File){
 if(file.size>32*1024*1024)throw new Error('Choose an image no larger than 32 MiB. Voyage uploads have a separate 5 MiB limit.');
 const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read the image file.'));reader.readAsDataURL(file);});
 return saveAsset({dataUrl,prompt:'Imported artwork',name:file.name});
}
function ArtworkPreview({url,name}:{url:string;name:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[url]);
 let safe='';try{safe=url.startsWith('data:image/')?url:mediaUrl(url);}catch{}
 return safe&&!failed?<ImageInspection url={safe} name={name}><img className="artwork-preview-image" src={safe} alt={name} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/></ImageInspection>:<div className="artwork-empty-preview">{failed?'Image preview unavailable. The reference is retained.':'No artwork attached yet'}</div>;
}
export function ArtworkWorkspace({project,apply,onCover,onDirtyChange,command}:Props){
 const [details,setDetails]=useState('{}'),[selected,setSelected]=useState(''),[category,setCategory]=useState('All artwork'),[search,setSearch]=useState('');
 const [prompt,setPrompt]=useState(''),[dirty,setDirty]=useState(false),[asset,setAsset]=useState<Asset|null>(null),[reference,setReference]=useState(false);
 const [proposalId,setProposalId]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[jobs,setJobs]=useState<Generation[]>([]),[picker,setPicker]=useState<Assignment|null>(null),[url,setUrl]=useState('');
 const latest=useRef(project);latest.current=project;
 const key='artwork-studio:'+project.id,destinations=artworkDestinations(project.activeSource,details),destination=destinations.find(item=>item.id===selected);
 const categories=['All artwork',...new Set(destinations.map(item=>item.category))];
 const visible=destinations.filter(item=>(category==='All artwork'||item.category===category)&&(item.label+' '+item.category).toLowerCase().includes(search.toLowerCase()));
 useEffect(()=>{let active=true;void Promise.all([feature<string>('creation-details:'+project.id,'{}'),feature<Generation[]>(key,[])]).then(([saved,history])=>{if(active){setDetails(saved);setJobs(history);}}).catch(reason=>{if(active)setError(reason.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[project.id]);
 useEffect(()=>{onDirtyChange?.(dirty||busy);return()=>onDirtyChange?.(false);},[dirty,busy,onDirtyChange]);
 async function act(action:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await action();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}
 function choose(item?:ArtworkDestination){
  if(dirty&&!window.confirm('Discard the unsaved artwork brief? Imported files and generated artwork remain in the library.'))return false;
  setProposalId('');
  setSelected(item?.id||'');setPrompt(item?artworkPrompt(item):'');setDirty(false);setAsset(null);setReference(false);setError('');setNotice('');setUrl('');
  return true;
 }
 function reviewArtwork(proposal:ArtworkProposal){
  const target=destinations.find(item=>item.id===proposal.destinationId);
  if(!target||!choose(target))return;
  setProposalId(proposal.id);setPrompt(proposal.prompt);setDirty(true);
  setNotice('Review the proposed brief and current destination, then choose Generate artwork locally. No image has been generated or attached.');
 }
 async function generate(){
  if(!destination||!prompt.trim())throw new Error('Select a destination and describe the artwork first.');
  const route=resolveRoute((await request('providerSettings')).settings,'artwork');
  if(!window.confirm('Generate one image using '+route.name+'? The brief'+(reference&&asset?' and selected reference image':'')+' will be sent to this provider and may incur charges. This saves artwork locally only; nothing is uploaded or attached automatically.'))return;
  const job:Generation={id:crypto.randomUUID(),created:Date.now(),destination:destination.label,destinationId:destination.id,...(proposalId?{proposalId}:{}),prompt,state:'generating'};
  setJobs(await saveGeneration(key,job));
  try{
   const result=await request('imageGenerate',{prompt,route,...(reference&&asset?{referenceDataUrl:asset.dataUrl}:{})});
   const saved=await saveAsset({dataUrl:result.dataUrl,prompt,name:destination.label+' · '+destination.category,route:result.route});
   job.assetId=saved.id;job.state='generated';setAsset(saved);setDirty(false);
   setNotice('Artwork saved to the local library. Preview it, then explicitly attach it to '+destination.label+'. Nothing was uploaded.');
  }catch(reason){job.state='uncertain';job.error='The provider may have completed this request. No automatic retry. '+(reason as Error).message;throw new Error(job.error);}
  finally{setJobs(await saveGeneration(key,job));}
 }
 async function attach(value:string,snapshot:Assignment){
  const current=latest.current;
  if(current.id!==project.id||current.activeSource!==snapshot.source||current.draft)throw new Error('The world changed. Select the destination again before attaching artwork. Your image is retained.');
  const detailKey='creation-details:'+current.id,raw=await request('featureGet',{key:detailKey}),saved=raw?JSON.parse(raw):'{}';
  const result=assignArtwork(snapshot.source,saved,snapshot.destination.id,value);
  if(snapshot.destination.path)await apply(result.source,snapshot.source);
  else{await request('featureSet',{key:detailKey,expected:raw,value:JSON.stringify(result.creationDetails)});setDetails(result.creationDetails);}
  setNotice('Artwork attached locally to '+snapshot.destination.label+'. Nothing was saved or published to Voyage.');setUrl('');
 }
 function browse(){if(destination)setPicker({source:project.activeSource,destination,assetId:asset?.id});}
 async function useSaved(job:Generation){
  const saved=await feature<Asset|null>('asset:'+job.assetId,null);if(!saved)throw new Error('Local artwork is missing. Check the asset library.');
  if(!destination){const target=destinations.find(item=>item.id===job.destinationId)||destinations.find(item=>item.label===job.destination);if(target){setSelected(target.id);setPrompt(job.prompt);setDirty(false);}}
  setAsset(saved);setNotice('Saved artwork selected. Preview it before attaching.');
 }
 return <div className={'feature-page artwork-workspace '+(destination?'artwork-has-selection':'')}>
  <header className="artwork-workspace-header"><div><h2>Artwork for your world</h2><p>Choose where the artwork belongs, then add a file, reuse the library, or generate an image. Preview before attaching; remote saving is always separate.</p></div><span>{destinations.length} destinations</span></header>
  {error&&<p className="alert" role="alert">{error}</p>}{notice&&<p className="feature-status" role="status">{notice}</p>}
  {!!project.artworkProposals?.length&&<section aria-label="Assistant artwork requests" className="connection-card"><h3>Review artwork requests · {project.artworkProposals.length}</h3><p>These are proposed briefs, not generated images. Review each destination and prompt before approving a billable generation. Uploading and attaching remain separate.</p>{project.artworkProposals.map(proposal=>{
   const target=destinations.find(item=>item.id===proposal.destinationId),generated=jobs.some(job=>job.proposalId===proposal.id&&job.state==='generated');
   return <article className="report" key={proposal.id}><strong>{proposal.label}</strong><details><summary>Proposed artwork brief</summary><p>{proposal.prompt}</p></details>{proposal.baseHash!==hash(project.activeSource)&&<p>The world changed since this request. Check the current destination and update the brief before generating.</p>}{!target&&<p>This destination no longer exists. Ask the assistant to refresh the request.</p>}{generated&&<p>Artwork generated locally. Reuse it from Generation history below; attachment is still separate.</p>}<div className="button-row"><button disabled={busy||loading||!target} onClick={()=>reviewArtwork(proposal)}>{generated?'Review brief again':'Review artwork brief'}</button>{command&&<button disabled={busy} onClick={()=>void act(async()=>{await command({type:'dismissArtworkProposal',id:proposal.id});})}>Dismiss artwork request</button>}</div></article>;
  })}</section>}
  <div className="artwork-workspace-layout">
   <section className="artwork-destinations" aria-label="Artwork destinations">
    <label>Artwork type<select aria-label="Artwork type" disabled={busy} value={category} onChange={event=>setCategory(event.target.value)}>{categories.map(value=><option key={value}>{value}</option>)}</select></label>
    <label>Find a destination<input aria-label="Find artwork destination" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Character, region, location, area, item…"/></label>
    <p className="muted">{visible.length} matching destinations. Add characters, regions, locations, areas or item types in their editors to create more.</p>
    <div className="artwork-destination-list">{visible.map(item=><button key={item.id} disabled={busy||loading} aria-pressed={selected===item.id} onClick={()=>choose(item)}><span className="artwork-destination-category">{item.category}</span><strong>{item.label}</strong><small>{item.url?'Image attached':'No image yet'}</small></button>)}</div>
    {!visible.length&&<p>No matching artwork destinations.</p>}
   </section>
   <section className="artwork-destination-editor" aria-label="Artwork destination editor">
    {destination?<>
     <button className="artwork-back" disabled={busy} onClick={()=>choose()}>← All artwork destinations</button>
     <div className="eyebrow">{destination.category}</div><h3>{destination.label}</h3>
     <p>{destination.target?`${imageTargets[destination.target].label} · recommended ${imageTargets[destination.target].width} × ${imageTargets[destination.target].height} pixels. ${destination.target==='WORLD_COVER'?'Covers accept any positive dimensions':'Gameplay images require at least 600 × 600 pixels'}; at most 5 MiB per upload. Uploading and moderation do not save or publish the world.`:'This custom image field accepts a hosted HTTPS URL. No undocumented upload purpose is selected automatically.'}</p>
     <div className="artwork-preview-pair"><figure><figcaption>Currently attached</figcaption><ArtworkPreview url={destination.url} name={destination.label+' current artwork'}/></figure><figure><figcaption>{asset?'Selected local artwork · not attached yet':'Choose artwork to preview'}</figcaption><ArtworkPreview url={asset?.dataUrl||''} name={asset?.name||'Selected artwork'}/></figure></div>
     <section className="connection-card"><h4>1. Add or choose artwork</h4><ImageFileImport disabled={busy} onImported={file=>act(async()=>{const saved=await importArtworkFile(file);setAsset(saved);setNotice('Image saved locally. Preview it, then attach it explicitly. Nothing was uploaded.');})}/><div className="button-row"><button disabled={busy||!!project.draft} onClick={browse}>Browse library &amp; attach…</button>{asset&&<button disabled={busy} onClick={()=>void act(async()=>{await request('exportImage',{dataUrl:asset.dataUrl,name:(asset.name||'artwork')+'.png'});})}>Download selected artwork</button>}{destination.category==='World cover'&&<button disabled={busy} onClick={()=>onCover(asset||undefined)}>Cover crops &amp; rubric grading</button>}</div></section>
     <section className="connection-card"><h4>2. Or generate artwork</h4>{destination.category==='World cover'?<><p>Cover generation uses the dedicated Discover crop previews and your weighted rubric, with the Building vision model as the default grader.</p><button disabled={busy} onClick={()=>onCover(asset||undefined)}>Open cover generation &amp; grading</button></>:<><label>Artwork brief<textarea aria-label="Artwork brief" disabled={busy} rows={7} value={prompt} onChange={event=>{setPrompt(event.target.value);setDirty(true);}}/></label>{asset&&<label><input type="checkbox" disabled={busy} checked={reference} onChange={event=>setReference(event.target.checked)}/>Use selected artwork as a reference</label>}<p className="muted">Uses your Artwork image route from Models &amp; agents. Only this brief and an explicitly selected reference are sent—not the full world. A provider call may be billable.</p><button className="primary" disabled={busy||!prompt.trim()} onClick={()=>void act(generate)}>Generate artwork locally</button>{busy&&<p role="status">Working… your existing artwork remains unchanged.</p>}</>}</section>
     <section className="connection-card"><h4>3. Attach when ready</h4><button className="primary" disabled={busy||!asset||!!project.draft} onClick={browse}>{destination.target?'Upload & attach selected artwork…':'Choose a hosted image from the library…'}</button><p className="muted">Existing hosted URLs are reused without another upload. Local image uploads ask for confirmation and moderation before attachment.</p><label>Or paste a hosted image URL<input aria-label="Artwork hosted URL" type="url" value={url} disabled={busy} onChange={event=>setUrl(event.target.value)} placeholder="https://…"/></label><button disabled={busy||!url.trim()||!!project.draft} onClick={()=>void act(()=>attach(url.trim(),{source:project.activeSource,destination}))}>Attach hosted URL locally</button>{project.draft&&<p role="status">Apply or discard the current editor draft before attaching artwork.</p>}</section>
    </>:<div className="artwork-destination-placeholder"><h3>Start with a destination</h3><p>Select a character portrait, region map, location scene, area scene, item image, or world cover. Missing image fields are created when you attach—not when you browse.</p></div>}
   </section>
  </div>
  <details className="artwork-generation-history"><summary>Generation history · {jobs.length} requests</summary>{jobs.map(job=><article className="report" key={job.id}><strong>{job.destination} · {job.state==='generating'&&!busy?'interrupted / outcome unknown':job.state}</strong><small>{new Date(job.created).toLocaleString()}</small>{job.error&&<p>{job.error}</p>}{job.assetId&&<button disabled={busy} onClick={()=>void act(async()=>{await useSaved(job);})}>Use saved artwork</button>}<details><summary>Saved brief</summary><p>{job.prompt}</p></details></article>)}</details>
  {picker&&<AssetPicker kind="image" project={project} target={picker.destination.target} allowUpload={!!picker.destination.target} initialSelection={picker.assetId} onClose={()=>setPicker(null)} onChoose={value=>attach(value,picker)}/>}
 </div>;
}
