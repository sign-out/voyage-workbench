import React,{useEffect,useRef,useState} from 'react';
import {ImagePlus,Map as MapIcon,RefreshCw} from 'lucide-react';
import {AssetPicker,MediaPreview} from './AssetLibrary';
import {library,type LibraryAsset} from './asset-library';
import {mapInspect,mapEdit} from '../../../packages/core/features';
import {mediaUrl} from '../../../packages/core/studio';
import {ImageInspection} from './ImageInspection';
import type {Project} from '../../../packages/core/project';

function RegionPreview({url,name}:{url:string;name:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[url]);
 let safe='';try{safe=mediaUrl(url);}catch{}
 return safe&&!failed?<ImageInspection url={safe} name={name}><img src={safe} alt={name} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/></ImageInspection>:<div className="region-artwork-empty"><MapIcon size={28} aria-hidden="true"/><span>{url?'Preview unavailable':'No artwork yet'}</span></div>;
}

export function RegionImageAssignment({project,apply,sidebar=false}:{project:Project;apply:(source:string,base:string)=>Promise<any>;sidebar?:boolean}){
 const [selected,setSelected]=useState(''),[assets,setAssets]=useState<LibraryAsset[]>([]),[search,setSearch]=useState(''),[limit,setLimit]=useState(12),[loading,setLoading]=useState(true),[snapshot,setSnapshot]=useState<{projectId:string;source:string;region:string;assetId?:string}|null>(null),[message,setMessage]=useState(''),[error,setError]=useState('');
 const latest=useRef(project);latest.current=project;
 useEffect(()=>{let active=true;setLoading(true);setAssets([]);setSelected('');setSearch('');setLimit(12);setMessage('');setError('');void library().then(rows=>{if(active)setAssets(rows.filter(asset=>asset.kind==='image'));}).catch(reason=>{if(active)setError(reason.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[project.id]);
 async function refresh(){setLoading(true);setError('');try{setAssets((await library()).filter(asset=>asset.kind==='image'));}catch(reason){setError((reason as Error).message);}finally{setLoading(false);}}
 let regions:{key:string;name:string;realm:string;imageUrl:string}[]=[];
 try{regions=mapInspect(project.activeSource).regions;}catch{return <section className="connection-card"><h3>Region artwork</h3><p role="alert">Repair the world's region records in World or JSON view before assigning artwork.</p></section>;}
 const region=regions.find(item=>item.key===selected),matching=assets.filter(asset=>(asset.name+' '+asset.tags.join(' ')).toLowerCase().includes(search.toLowerCase())),visible=matching.slice(0,limit),locked=!!project.draft||!!snapshot;
 function choose(regionKey:string,chosenAsset?:string){if(locked)return;setSelected(regionKey);setSnapshot({projectId:project.id,source:project.activeSource,region:regionKey,assetId:chosenAsset});}
 return <section className={'connection-card region-image-assignment'+(sidebar?' region-image-sidebar':'')}>
  <h3>Region artwork</h3><p>Choose a region, then add or replace its image.</p>
  {error&&<p className="alert" role="alert">{error}</p>}{message&&<p className="feature-status" role="status">{message}</p>}
  <div className="region-image-workspace">
   <div className="region-image-target">
    <label><span className="region-artwork-step">1. Choose a region</span><select aria-label="Artwork region" value={region?.key||''} disabled={!!snapshot||!regions.length} onChange={event=>{setSelected(event.target.value);setMessage('');}}><option value="">Select a region</option>{regions.map(item=><option key={item.key} value={item.key}>{item.name||item.key}{item.realm?' · '+item.realm:''}{item.imageUrl?' · image attached':''}</option>)}</select></label>
    {region?<>
     <div className="region-artwork-current" aria-label={'Assign image to '+(region.name||region.key)} onDragOver={event=>{if(!locked&&event.dataTransfer.types.includes('application/x-voyage-asset')){event.preventDefault();event.dataTransfer.dropEffect='copy';}}} onDrop={event=>{event.preventDefault();const id=event.dataTransfer.getData('application/x-voyage-asset');if(assets.some(asset=>asset.id===id))choose(region.key,id);}}>
      <RegionPreview url={region.imageUrl} name={(region.name||region.key)+' current artwork'}/>
      <div className="region-artwork-caption"><strong>{region.name||region.key}</strong><small>{region.imageUrl?'Currently attached':'Ready for an image'}{region.realm?' · '+region.realm:''}</small></div>
     </div>
     <div className="region-artwork-next"><span className="region-artwork-step">2. Choose an image</span><button className="primary" disabled={locked} onClick={()=>choose(region.key)}><ImagePlus size={18} aria-hidden="true"/>{region.imageUrl?'Replace image':'Choose image'}</button><small>Add a file or pick from the library. Review before attaching.</small></div>
    </>:<div className="region-artwork-empty region-artwork-start"><MapIcon size={28} aria-hidden="true"/><span>{regions.length?'Select a region to see its current artwork.':'Add a region in World map or Content first.'}</span></div>}
    {project.draft&&<p role="status">Apply or discard the current editor draft before assigning an image.</p>}
    {region&&<p className="region-artwork-upload-note">Local files need an upload before attachment. Hosted images can be reused.</p>}
   </div>
   {(region||sidebar)&&<aside className="region-image-library" aria-label="Region image library">
    <div className="region-image-library-heading"><h4>{sidebar?'Image library':'Or use a library image'}</h4><button aria-label="Refresh images" title="Refresh images" disabled={!!snapshot||loading} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden="true"/></button></div>
    {!!assets.length&&<label className="region-image-search">Search images<input type="search" value={search} disabled={!!snapshot} placeholder="Find an image…" onChange={event=>{setSearch(event.target.value);setLimit(12);}}/></label>}
    {loading?<p role="status">Loading images…</p>:<>
     {!assets.length&&<p className="region-image-library-empty">Your image library is empty. {region?'Choose image to add a file.':'Choose a region to add an image.'}</p>}
     {!!assets.length&&!matching.length&&<p role="status">No images match your search.</p>}
     <div className="region-image-thumbnails">{visible.map(asset=><button key={asset.id} className="region-image-tile" disabled={locked} draggable={!locked} onDragStart={event=>{event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-voyage-asset',asset.id);}} aria-label={'Use '+asset.name+(region?' for '+(region.name||region.key):'')} onClick={()=>region&&choose(region.key,asset.id)}><div className="region-image-tile-preview"><MediaPreview asset={asset} inspect={false}/></div><strong>{asset.name}</strong><small>{asset.remote.length?'Hosted image':'Local file · upload needed'}</small></button>)}</div>
     {matching.length>limit&&<button className="region-image-more" disabled={!!snapshot} onClick={()=>setLimit(limit+12)}>Show more images · {matching.length-limit} remaining</button>}
    </>}
   </aside>}
  </div>
  {snapshot&&<AssetPicker kind="image" project={project} initialSelection={snapshot.assetId} target="REGION_MAP_IMAGE" onClose={()=>{setSnapshot(null);void refresh();}} onChoose={async url=>{
   if(latest.current.id!==snapshot.projectId||latest.current.activeSource!==snapshot.source||latest.current.draft)throw new Error('The project changed. Reopen the region assignment before attaching this image.');
   await apply(mapEdit(snapshot.source,'set-field',{kind:'region',key:snapshot.region,field:'imageUrl',value:url}),snapshot.source);
   setMessage('Image attached to '+(regions.find(item=>item.key===snapshot.region)?.name||snapshot.region)+'. Save or sync the world when ready.');
  }}/>}
 </section>;
}
