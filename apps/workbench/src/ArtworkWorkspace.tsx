import React,{useEffect,useRef,useState} from 'react';
import {coverRecommendation,isVoyageEnvironment} from '../../../packages/core/voyage-compatibility';
import {publicationDefaults} from '../../../packages/core/features';
import {useVoyageConnection} from './CompatibilityStatus';
import {artworkDestinations,artworkPrompt,assignArtwork,imageTargets,type ArtworkDestination} from '../../../packages/core/artwork';
import {hash,type Project} from '../../../packages/core/project';
import type {ArtworkProposal} from '../../../packages/core/artwork-requests';
import {AssetPicker,ImageFileImport} from './AssetLibrary';
import {ArtworkPreview} from './ArtworkPreview';
import {ArtworkHistory} from './ArtworkHistory';
import {ArtworkProgress,type ArtworkActivity} from './ArtworkProgress';
import {feature,saveAsset,type Asset} from './features-api';
import {request} from './host';
import {generateLocalArtwork,type Generation} from './artwork-generation';

type Assignment={source:string;destination:ArtworkDestination;assetId?:string};
type Props={project:Project;apply:(source:string,base:string)=>Promise<any>;onCover:(asset?:Asset)=>void;onDirtyChange?:(dirty:boolean)=>void;command?:(command:any)=>Promise<any>;initialDestinationId?:string};
export async function importArtworkFile(file:File){
 if(file.size>32*1024*1024)throw new Error('Choose an image no larger than 32 MiB. Voyage uploads have a separate 5 MiB limit.');
 const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read the image file.'));reader.readAsDataURL(file);});
 return saveAsset({dataUrl,prompt:'Imported artwork',name:file.name});
}
export function ArtworkWorkspace({project,apply,onCover,onDirtyChange,command,initialDestinationId}:Props){
 const [connection]=useVoyageConnection(project.id);
 const environment=connection?.environment||project.remote.environment||'alpha';
 const coverSize=isVoyageEnvironment(environment)?coverRecommendation(environment,connection?.contract):null;
 const [details,setDetails]=useState('{}'),[selected,setSelected]=useState(''),[category,setCategory]=useState('All artwork'),[search,setSearch]=useState('');
 const [prompt,setPrompt]=useState(''),[dirty,setDirty]=useState(false),[asset,setAsset]=useState<Asset|null>(null),[reference,setReference]=useState(false);
 const [proposalId,setProposalId]=useState('');
 const [activity,setActivity]=useState<ArtworkActivity>(),[activeJobId,setActiveJobId]=useState('');
 const locked=useRef(false),preview=useRef<HTMLDivElement>(null),initialSelection=useRef('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[jobs,setJobs]=useState<Generation[]>([]),[picker,setPicker]=useState<Assignment|null>(null),[url,setUrl]=useState('');
 const latest=useRef(project);latest.current=project;
 const key='artwork-studio:'+project.id,destinations=artworkDestinations(project.activeSource,details),destination=destinations.find(item=>item.id===selected);
 const categories=['All artwork',...new Set(destinations.map(item=>item.category))];
 const visible=destinations.filter(item=>(category==='All artwork'||item.category===category)&&(item.label+' '+item.category).toLowerCase().includes(search.toLowerCase()));
 useEffect(()=>{let active=true;void Promise.all([feature<string>('creation-details:'+project.id,'{}'),feature<Generation[]>(key,[])]).then(([saved,history])=>{if(active){setDetails(publicationDefaults(project,saved));setJobs(history);}}).catch(reason=>{if(active)setError(reason.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[project.id]);
 useEffect(()=>{
  if(loading||!initialDestinationId||initialSelection.current===initialDestinationId)return;
  initialSelection.current=initialDestinationId;
  const target=destinations.find(item=>item.id===initialDestinationId);
  if(!target){setError('This character artwork destination no longer exists. Choose another destination.');return;}
  setSelected(target.id);setPrompt(artworkPrompt(target,coverSize?environment:undefined,connection?.contract));setNotice('Portrait brief prepared for '+target.label+'. Review it, then approve generation below. No image request has been sent.');
 },[loading,initialDestinationId,project.id]);
 const waiting=jobs.some(job=>job.state==='generating');
 useEffect(()=>{if(!dirty&&!busy&&destination&&!asset&&!proposalId)setPrompt(artworkPrompt(destination,coverSize?environment:undefined,connection?.contract));},[project.activeSource,selected,details,environment,connection?.contract]);
 useEffect(()=>{
  if(busy||!waiting)return;
  let active=true,pending=false;
  const timer=setInterval(()=>{if(pending)return;pending=true;void feature<Generation[]>(key,[]).then(history=>{if(active)setJobs(history);}).catch(reason=>{if(active)setError('Could not refresh artwork history: '+(reason as Error).message);}).finally(()=>{pending=false;});},3000);
  return()=>{active=false;clearInterval(timer);};
 },[key,busy,waiting]);
 useEffect(()=>{if(asset){preview.current?.scrollIntoView({block:'nearest'});}},[asset?.id]);
 useEffect(()=>{onDirtyChange?.(dirty||busy);return()=>onDirtyChange?.(false);},[dirty,busy,onDirtyChange]);
 async function act(action:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');try{await action();}catch(reason){setError((reason as Error).message);}finally{locked.current=false;setBusy(false);setActivity(undefined);setActiveJobId('');}}
 function choose(item?:ArtworkDestination){
  if(dirty&&!window.confirm('Discard the unsaved artwork brief? Imported files and generated artwork remain in the library.'))return false;
  setProposalId('');
  setSelected(item?.id||'');setPrompt(item?artworkPrompt(item,coverSize?environment:undefined,connection?.contract):'');setDirty(false);setAsset(null);setReference(false);setError('');setNotice('');setUrl('');
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
  const saved=await generateLocalArtwork({project,destination,prompt,...(reference&&asset?{reference:asset}:{}),proposalId,current:()=>latest.current,onActivity:setActivity,onHistory:setJobs,onJob:job=>setActiveJobId(job.id)});
  if(saved){setAsset(saved);setDirty(false);setNotice('Artwork for '+destination.label+' is ready to review below and in the gallery. Saved locally. Preview it, then explicitly attach it. Nothing was uploaded.');}
 }
 async function attach(value:string,snapshot:Assignment){
  const assertCurrent=()=>{const current=latest.current;if(current.id!==project.id||current.activeSource!==snapshot.source||current.draft)throw new Error('The world changed. Select the destination again before attaching artwork. Your image is retained.');return current;};
  const current=assertCurrent();
  const detailKey='creation-details:'+current.id,raw=await request('featureGet',{key:detailKey}),saved=raw?JSON.parse(raw):'{}';
  assertCurrent();
  const result=assignArtwork(snapshot.source,saved,snapshot.destination.id,value);
  if(snapshot.destination.path)await apply(result.source,snapshot.source);
  else{await request('featureSet',{key:detailKey,expected:raw,value:JSON.stringify(result.creationDetails)});setDetails(result.creationDetails);}
  setAsset(null);setReference(false);setNotice('Artwork saved locally to '+snapshot.destination.label+'. It stays attached when you leave this destination. Nothing was saved or published to Voyage.');setUrl('');
 }
 function browse(){if(destination)setPicker({source:project.activeSource,destination,assetId:asset?.id});}
 async function useSaved(job:Generation){
  const saved=await feature<Asset|null>('asset:'+job.assetId,null);if(!saved)throw new Error('Local artwork is missing. Check the asset library.');
  const matches=destinations.filter(item=>job.destinationId?item.id===job.destinationId:item.label===job.destination);
  if(matches.length!==1)throw new Error('The original artwork destination is missing or ambiguous. Your image remains in the gallery and library; it has not been assigned to another character.');
  if(!choose(matches[0]))return;
  setCategory('All artwork');setSearch('');setPrompt(job.prompt);setAsset(saved);setNotice('Saved artwork selected for '+matches[0].label+'. This is a preview selection only, not an attachment. Choose Upload & attach selected artwork to save its hosted URL to the destination.');
 }
 return <div className={'feature-page artwork-workspace '+(destination?'artwork-has-selection':'')}>
  <header className="artwork-workspace-header"><div><h2>Artwork for your world</h2><p>Choose where the artwork belongs, then add a file, reuse the library, or generate an image. Preview before attaching; remote saving is always separate.</p></div><span>{destinations.length} destinations</span></header>
  {error&&<p className="alert" role="alert">{error}</p>}{notice&&<p className="feature-status" role="status">{notice}</p>}
  {activity&&<ArtworkProgress activity={activity}/>}
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
     <p>{destination.target?`${imageTargets[destination.target].label} · recommended ${destination.target==='WORLD_COVER'&&coverSize?coverSize.width:imageTargets[destination.target].width} × ${destination.target==='WORLD_COVER'&&coverSize?coverSize.height:imageTargets[destination.target].height} pixels. ${destination.target==='WORLD_COVER'?'Covers accept any positive dimensions':'Gameplay images require at least 600 × 600 pixels'}; at most 5 MiB per upload. Uploading and moderation do not save or publish the world.`:'This custom image field accepts a hosted HTTPS URL. No undocumented upload purpose is selected automatically.'}</p>
     <div ref={preview} className="artwork-preview-pair" aria-label="Artwork preview"><figure><figcaption>Currently attached · saved locally</figcaption><ArtworkPreview url={destination.url} name={destination.label+' current artwork'}/></figure><figure><figcaption>{asset?'Selected local artwork · not attached yet':'Choose artwork to preview'}</figcaption><ArtworkPreview url={asset?.dataUrl||''} name={asset?.name||'Selected artwork'}/></figure></div>
     <section className="connection-card"><h4>1. Add or choose artwork</h4><ImageFileImport disabled={busy} onImported={file=>act(async()=>{const saved=await importArtworkFile(file);setAsset(saved);setNotice('Image saved locally. Preview it, then attach it explicitly. Nothing was uploaded.');})}/><div className="button-row"><button disabled={busy||!!project.draft} onClick={browse}>Browse library &amp; attach…</button>{asset&&<button disabled={busy} onClick={()=>void act(async()=>{await request('exportImage',{dataUrl:asset.dataUrl,name:(asset.name||'artwork')+'.png'});})}>Download selected artwork</button>}{destination.category==='World cover'&&<button disabled={busy} onClick={()=>onCover(asset||undefined)}>Open cover crops &amp; grading</button>}</div></section>
     <section className="connection-card"><h4>2. Or generate artwork</h4>{destination.category==='World cover'?<><p>Cover generation uses the dedicated Discover crop previews and your weighted rubric, with the Building vision model as the default grader.</p><button disabled={busy} onClick={()=>onCover(asset||undefined)}>Open cover generation &amp; grading</button></>:<><label>Artwork brief<textarea aria-label="Artwork brief" disabled={busy} rows={7} value={prompt} onChange={event=>{setPrompt(event.target.value);setDirty(true);}}/></label>{asset&&<label><input type="checkbox" disabled={busy} checked={reference} onChange={event=>setReference(event.target.checked)}/>Use selected artwork as a reference</label>}<p className="muted">Uses your Artwork image route from Models &amp; agents. Only this brief and an explicitly selected reference are sent—not the full world. A provider call may be billable.</p><button className="primary" aria-label={"Generate artwork locally for "+destination.label} disabled={busy||loading||!prompt.trim()||!!project.draft} onClick={()=>void act(generate)}>{activity?"Generating for "+destination.label+"…":"Generate artwork locally"}</button></>}</section>
     <section className="connection-card"><h4>3. Attach when ready</h4><button className="primary" disabled={busy||!asset||!!project.draft} onClick={browse}>{destination.target?'Upload & attach selected artwork…':'Choose a hosted image from the library…'}</button><p className="muted">Existing hosted URLs are reused without another upload. Local image uploads ask for confirmation and moderation before attachment.</p><label>Or paste a hosted image URL<input aria-label="Artwork hosted URL" type="url" value={url} disabled={busy} onChange={event=>setUrl(event.target.value)} placeholder="https://…"/></label><button disabled={busy||!url.trim()||!!project.draft} onClick={()=>void act(()=>attach(url.trim(),{source:project.activeSource,destination}))}>Attach hosted URL locally</button>{project.draft&&<p role="status">Apply or discard the current editor draft before attaching artwork.</p>}</section>
    </>:<div className="artwork-destination-placeholder"><h3>Start with a destination</h3><p>Select a character portrait, region map, location scene, area scene, item image, or world cover. Missing image fields are created when you attach—not when you browse.</p></div>}
   </section>
  </div>
  <ArtworkHistory jobs={jobs} busy={busy} activeJobId={activeJobId} onSelect={job=>void act(()=>useSaved(job))} onRefresh={()=>void act(async()=>{setJobs(await feature<Generation[]>(key,[]));setNotice("Artwork history refreshed. No image requests were sent.");})}/>
  {picker&&<AssetPicker kind="image" project={project} target={picker.destination.target} allowUpload={!!picker.destination.target} initialSelection={picker.assetId} onClose={()=>setPicker(null)} onChoose={value=>attach(value,picker)}/>}
 </div>;
}
