import React,{useMemo,useState} from 'react';
import {modConflicts,type ModSource} from '../../../packages/core/studio';
import * as doc from '../../../packages/core/document';
import {type Project} from '../../../packages/core/project';
export function modCatalog(source:string){
 const root=doc.parse(source),base:doc.Path=root.children.some(child=>child.key==='data')?['data']:[],items:any[]=[];
 for(const bucket of ['myMods','bookmarkedMods','pendingModsMetadata','remixSourceMetadata']){
  let node:doc.Node;try{node=doc.at(root,base.concat(bucket));}catch{continue;}
  for(const child of node.children){
   let path=base.concat(bucket,child.key),record=JSON.parse(doc.read(source,path));
   const wrapper=['world','mod','metadata'].find(key=>record?.[key]);if(wrapper){path=path.concat(wrapper);record=record[wrapper];}
   if(record?.shortId&&!items.some(item=>item.shortId===record.shortId))items.push({...record,exactSource:doc.read(source,path)});
  }
 }
 return items;
}
export function ModConflictReview({project,mods,catalog}:{project:Project;mods:any[];catalog:any[]}){
 const [onlyConflicts,setOnlyConflicts]=useState(true),[page,setPage]=useState(0);
 const report=useMemo(()=>{
  const sources:ModSource[]=mods.map(mod=>{
   const attached=project.attachments?.find(item=>item.id===mod.shortId),remote=catalog.find(item=>item.shortId===mod.shortId);
   if(attached)return {id:mod.shortId,version:mod.version,source:attached.source};
   if(remote?.initialGameState&&typeof remote.initialGameState==='object'&&remote.exactSource)return {id:mod.shortId,version:mod.version,verifiedVersion:remote.version,source:remote.exactSource};
   return {id:mod.shortId,version:mod.version};
  });return modConflicts(sources);
 },[JSON.stringify(mods),project.attachments,JSON.stringify(catalog)]);
 const findings=report.findings.filter(item=>!onlyConflicts||item.kind==='conflict'),offset=Math.min(page,Math.max(0,Math.floor((findings.length-1)/20)*20));
 return <section className="connection-card"><h3>Composition &amp; conflict review</h3><p>{report.findings.filter(item=>item.kind==='conflict').length} displayed conflicts · {report.findings.filter(item=>item.kind==='shared').length} shared values · {report.unknown.length} sources unknown</p><p>Exact authored-path overlaps only. This does not predict engine precedence, script behavior, or flatten mods into the base world.</p>{report.unknown.length>0&&<p role="status">Coverage unknown for: {report.unknown.join(', ')}. Attach full mod JSON to inspect it. A pinned version needs a matching verified source; an unversioned local file cannot prove that match.</p>}{report.truncated&&<p role="status">Analysis is bounded: at most 1,000 findings, 100,000 nodes and 1,000,000 comparisons. Results are incomplete—not conflict-free.</p>}{mods.length<2&&<p>Add at least two references to compare their supplied sources.</p>}<label><input type="checkbox" checked={onlyConflicts} onChange={event=>{setOnlyConflicts(event.target.checked);setPage(0);}}/>Show conflicts only</label>{findings.slice(offset,offset+20).map((finding,index)=><details className="report" key={offset+index}><summary>{finding.kind==='conflict'?'Conflicting authored values':'Shared authored value'} · {doc.label(finding.path)} · {finding.first} / {finding.second}</summary><div className="diff"><pre>{finding.first}{'\n'}{finding.before}</pre><pre>{finding.second}{'\n'}{finding.after}</pre></div></details>)}<div className="button-row"><button disabled={!offset} onClick={()=>setPage(offset-20)}>Previous overlaps</button><button disabled={offset+20>=findings.length} onClick={()=>setPage(offset+20)}>Next overlaps</button></div></section>;
}
