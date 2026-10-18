import {compactLayoutQuery} from './responsive-layout';
import React,{useMemo,useRef,useState} from 'react';
import {Image as ImageIcon,Play} from 'lucide-react';
import {publicationInspect} from '../../../packages/core/features';
import type {Path} from '../../../packages/core/document';
import {PreviewScreen} from './PreviewScreen';
import {ImageInspection} from './ImageInspection';

function Cover({url,title}:{url:string;title:string}){
 const [failed,setFailed]=useState(false);
 return url&&!failed?<img src={url} alt={'Cover art for '+title} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className="publication-cover-placeholder"><ImageIcon size={32}/><span>{failed?'Cover could not load':'No cover available in this JSON'}</span></div>;
}

export function PublicationPreview({source,saveName,onNavigate}:{source:string;saveName:string;onNavigate?:(path:Path)=>void}){
 const world=useMemo(()=>publicationInspect(source,saveName),[source,saveName]);
 const [view,setView]=useState(()=>matchMedia(compactLayoutQuery).matches?'mobile':'desktop');
 const [previewOpen,setPreviewOpen]=useState(false);
 const previewLauncher=useRef<HTMLButtonElement|null>(null);
 function edit(field:string){onNavigate?.(world.fields.includes(field)?world.path.concat(field):world.path);}
 return <section className="publication-preview" aria-label="Public world preview">
  <div className="publication-preview-heading"><h3>Public-facing copy &amp; cover</h3><button ref={previewLauncher} onClick={()=>setPreviewOpen(true)}>Open full-screen preview</button></div>
  <p className="muted">Preview of your active local world, not a read-back of the published page. Save the active world to Voyage before publishing. These approximate Alpha layouts show centered cover crops; actual site layouts can vary.</p>
  <div className="publication-copy-grid">
   <section><div className="publication-copy-heading"><h4>Short description</h4>{onNavigate&&<button onClick={()=>edit('description')}>Edit short copy</button>}</div><p className="publication-copy" data-publication-copy="short">{world.description||'No short description set.'}</p><small>{world.description.length} characters · description</small></section>
   <section><div className="publication-copy-heading"><h4>Long description</h4>{onNavigate&&<button onClick={()=>edit('advancedDescription')}>Edit long copy</button>}</div><p className="publication-copy" data-publication-copy="long">{world.advancedDescription||'No long description set.'}</p><small>{world.advancedDescription.length} characters · advancedDescription</small></section>
  </div>
  <div className="publication-copy-heading"><h4>Cover art</h4>{onNavigate&&<button onClick={()=>edit('image')}>Open cover field</button>}</div>
  {!world.coverUrl&&<p className="muted">{world.image?'The authored cover is not a supported HTTP(S) image URL.':'An upload-backed cover may still exist on Voyage even when the API leaves image empty.'} Previewing does not change your cover.</p>}
  <details className="publication-original" open><summary>Original artwork · uncropped</summary>{world.coverUrl?<ImageInspection url={world.coverUrl} name={'Cover art for '+world.title}><div className="publication-original-cover"><Cover key={world.coverUrl} url={world.coverUrl} title={world.title}/></div></ImageInspection>:<div className="publication-original-cover"><Cover key={world.coverUrl} url={world.coverUrl} title={world.title}/></div>}</details>
  <p className="muted">Open the full-screen preview to compare cover crops at fixed phone or desktop widths. Actual size never squeezes the layout into this editor; Fit width scales it uniformly. These previews never crop or replace the saved image.</p>
  {previewOpen&&<PreviewScreen view={view} onViewChange={setView} onClose={()=>setPreviewOpen(false)} returnFocus={previewLauncher.current}><div className={'publication-site-previews '+view}>
   <section><h4>Discovery card</h4><small>8:5 landscape crop · title below artwork</small><article className="publication-discovery-card"><div className="publication-card-cover"><Cover key={world.coverUrl} url={world.coverUrl} title={world.title}/></div><strong className="publication-card-title">{world.title}</strong></article></section>
   <section className="publication-detail-preview"><h4>World page</h4><small>{view==='mobile'?'Square phone hero':'Wide desktop hero'} · title overlay</small><article className="publication-world-page"><div className="publication-detail-cover"><Cover key={world.coverUrl} url={world.coverUrl} title={world.title}/><span className="publication-details-label" aria-hidden="true">DETAILS</span><strong className="publication-hero-title">{world.title}</strong></div><div className="publication-play-panel" aria-hidden="true"><span className="publication-play-preview"><Play size={20}/>PLAY</span></div><div className="publication-detail-copy"><h3>{world.title}</h3>{world.description&&<p className="publication-copy publication-detail-short">{world.description}</p>}{world.advancedDescription&&<p className="publication-copy publication-detail-long">{world.advancedDescription}</p>}{!world.description&&!world.advancedDescription&&<p className="publication-copy">No public description set.</p>}</div></article></section>
   <section className="publication-listing-preview"><h4>Horizontal discovery listing</h4><small>Portrait-style cover crop · single-line title · three-line short copy</small><article className="publication-listing-card"><div className="publication-listing-cover"><Cover key={world.coverUrl} url={world.coverUrl} title={world.title}/></div><div className="publication-listing-copy"><strong title={world.title}>{world.title}</strong><p>{world.description||'No short description set.'}</p><span className="publication-listing-play" aria-hidden="true"><Play size={20}/></span></div></article></section>
   <section className="publication-profile-preview"><h4>Profile feed card</h4><small>7:5 cover crop · single-line title · three-line short copy</small><article className="publication-profile-card"><div className="publication-profile-cover"><Cover key={world.coverUrl} url={world.coverUrl} title={world.title}/></div><div className="publication-profile-copy"><strong title={world.title}>{world.title}</strong><p>{world.description||'No short description set.'}</p><span className="publication-profile-play" aria-hidden="true"><Play size={20}/>PLAY</span></div></article></section>
  </div></PreviewScreen>}
 </section>;
}
