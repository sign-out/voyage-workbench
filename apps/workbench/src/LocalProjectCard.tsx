import React from 'react';
import {ChevronRight,FolderOpen} from 'lucide-react';

type LocalProjectCardProps={
 project:{id:string;name:string;updated:number;status?:string;worldTitle?:string;shortId?:string};
 busy:boolean;
 current:boolean;
 onOpen:()=>void;
 onClose:()=>void;
 onStatus:(status:'active'|'trashed')=>void;
 onDelete:()=>void;
};

export function LocalProjectCard({project,busy,current,onOpen,onClose,onStatus,onDelete}:LocalProjectCardProps){
 const trashed=project.status==='trashed';
 return <article className="local-project-card" aria-label={project.name}>
  <button className="project-card" disabled={busy} onClick={onOpen}><FolderOpen/><div className="project-identity"><strong>{project.worldTitle||project.name}</strong>{project.shortId&&<small className="project-short-id">{project.shortId}</small>}</div><small>Edited {new Date(project.updated).toLocaleDateString()}{current?' · Open now':''}</small><span>Open workspace <ChevronRight size={15}/></span></button>
  <div className="local-project-actions">
   {current&&<button disabled={busy} onClick={onClose}>Close project</button>}
   {trashed?<><button disabled={busy} onClick={()=>onStatus('active')}>Restore project</button><button className="danger" disabled={busy} onClick={onDelete}>Delete permanently</button></>:<button disabled={busy} onClick={()=>onStatus('trashed')}>Move to trash</button>}
  </div>
 </article>;
}
