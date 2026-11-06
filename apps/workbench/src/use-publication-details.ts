import {useEffect,useMemo,useState} from 'react';
import {publicationDefaults} from '../../../packages/core/features';
import type {Project} from '../../../packages/core/project';
import {parse,statePath} from '../../../packages/core/document';
import {feature} from './feature-store';

export function usePublicationDetails(project?:Project){
 const bare=useMemo(()=>!!project&&!statePath(parse(project.activeSource)).length,[project?.activeSource]);
 const [cached,setCached]=useState({id:'',source:'{}'}),[error,setError]=useState(''),[loading,setLoading]=useState(!!project),[epoch,setEpoch]=useState(0);
 useEffect(()=>{
  if(!project||!bare)return;const key='creation-details:'+project.id;let active=true,sequence=0;setError('');setLoading(true);
  async function refresh(){const attempt=++sequence;try{const source=await feature<string>(key,'{}');publicationDefaults(project!,source);if(active&&attempt===sequence){setCached({id:project!.id,source});setError('');}}catch(reason){if(active&&attempt===sequence)setError('Could not load saved publication details: '+(reason as Error).message);}finally{if(active&&attempt===sequence)setLoading(false);}}
  const changed=(event:Event)=>{if((event as CustomEvent).detail?.key===key)void refresh();};
  void refresh();window.addEventListener('voyage-feature-changed',changed);return()=>{active=false;window.removeEventListener('voyage-feature-changed',changed);};
 },[project?.id,bare,epoch]);
 const source=useMemo(()=>project?publicationDefaults(project,cached.id===project.id?cached.source:'{}'):'{}',[project?.id,project?.activeSource,project?.remote.worldId,project?.remote.envelopeSource,project?.creation?.publication,cached.id,cached.source]);
 return {source,error:bare?error:'',loading:bare&&(loading||!error&&cached.id!==project?.id),retry:()=>setEpoch(value=>value+1)};
}
