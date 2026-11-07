import {parse,sameValues,type Node,type Path} from './document';

// Voyage can omit these optional maps when empty. Keep this rule confined to
// canonical GameState fields: an empty authored/unknown field is not disposable.
function optionalEmptyCollection(node:Node,path:Path){
 return path.length===3&&path[0]==='world'&&path[1]==='initialGameState'&&
  ['unassignedAreas','worldVoices'].includes(String(path[2]))&&node.kind==='object'&&node.children.length===0;
}

export function serverAdditions(submitted:string,remote:string){
 const paths:Path[]=[];let total=0,safe=true;
 function added(path:Path){if(path[0]!=='world'||path.length<2||path.length===2&&path[1]==='shortId')safe=false;total++;if(paths.length<20)paths.push(path);}
 function compare(expected:Node,actual:Node,path:Path){
  if(sameValues(submitted,remote,expected,actual))return;
  if(expected.kind==='array'&&actual.kind==='array'){
   if(actual.children.length<expected.children.length){safe=false;return;}
   expected.children.forEach((child,index)=>compare(child.node,actual.children[index].node,path.concat(index)));actual.children.slice(expected.children.length).forEach(child=>added(path.concat(child.key)));return;
  }
  if(expected.kind!=='object'||actual.kind!=='object'){safe=false;return;}
  const previous:Record<string,Node>=Object.create(null),next:Record<string,Node>=Object.create(null);
  expected.children.forEach(child=>previous[String(child.key)]=child.node);actual.children.forEach(child=>next[String(child.key)]=child.node);
  expected.children.forEach(child=>{const found=next[String(child.key)];if(found)compare(child.node,found,path.concat(child.key));else if(!optionalEmptyCollection(child.node,path.concat(child.key)))safe=false;});
  actual.children.forEach(child=>{if(!previous[String(child.key)])added(path.concat(child.key));});
 }
 compare(parse(submitted),parse(remote),[]);
 return {safe:safe&&total>0,total,paths,truncated:total>paths.length};
}

export function voyageRevision(etag:string):string {
  let revision=etag.trim();
  if(revision.startsWith('W/'))revision=revision.slice(2);
  if(revision.startsWith('"')&&revision.endsWith('"'))revision=revision.slice(1,-1);
  if(!revision||revision==='*'||!/^[\x21\x23-\x7e]+$/.test(revision)||/[\\,]/.test(revision))throw new Error('Voyage returned an invalid world revision. Download the world again before saving.');
  return '"'+revision+'"';
}
export function invalidRevisionFailure(detail:string):boolean {
  return typeof detail==='string'&&detail.startsWith('Voyage HTTP 400 (invalid_revision):');
}
function numericValue(source:string):string {
  const parts=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source)!;
  let digits=(parts[2]+(parts[3]||'')).replace(/^0+/,'');
  if(!digits)return '0';
  const trimmed=digits.replace(/0+$/,'');
  const rawExponent=Number(parts[4]||0);
  if(!Number.isSafeInteger(rawExponent))return source;
  const exponent=rawExponent-(parts[3]||'').length+digits.length-trimmed.length;
  if(!Number.isSafeInteger(exponent))return source;
  digits=trimmed;
  return parts[1]+digits+'e'+exponent;
}
export function compareRemoteWorlds(submitted:string,remote:string){
  const paths:Path[]=[],optionalEmptyCollections:Path[]=[];let total=0;
  function difference(path:Path){total++;if(paths.length<20)paths.push(path);}
  function missing(node:Node,path:Path){if(optionalEmptyCollection(node,path))optionalEmptyCollections.push(path);else difference(path);}
  function compare(expected:Node,actual:Node,path:Path){
    if(expected.kind!==actual.kind){difference(path);return;}
    if(expected.kind==='object'){
      const expectedFields:Record<string,Node>=Object.create(null),actualFields:Record<string,Node>=Object.create(null);
      expected.children.forEach(child=>expectedFields[String(child.key)]=child.node);actual.children.forEach(child=>actualFields[String(child.key)]=child.node);
      expected.children.forEach(child=>{const found=actualFields[String(child.key)];if(found)compare(child.node,found,path.concat(child.key));else missing(child.node,path.concat(child.key));});
      actual.children.forEach(child=>{if(!expectedFields[String(child.key)])missing(child.node,path.concat(child.key));});
    }else if(expected.kind==='array'){
      if(expected.children.length!==actual.children.length){difference(path);return;}
      expected.children.forEach((child,index)=>compare(child.node,actual.children[index].node,path.concat(index)));
    }else if(expected.kind==='number'){
      if(numericValue(submitted.slice(expected.start,expected.end))!==numericValue(remote.slice(actual.start,actual.end)))difference(path);
    }else if(expected.value!==actual.value)difference(path);
  }
  compare(parse(submitted),parse(remote),[]);
  return {matches:total===0,total,paths,truncated:total>paths.length,optionalEmptyCollections};
}
export function voyageSaveFeedback(operation:any){
  if(!operation)return null;
  if(operation.state==='ACCEPTED'&&operation.automaticAdditions)return {tone:'success',title:'Saved to Voyage · server additions adopted',detail:operation.automaticAdditions.total+' server-added field(s) or records were merged automatically. Existing submitted values were unchanged. The original submission and a local checkpoint are retained; no extra write was sent.'};
  if(operation.state==='ACCEPTED')return {tone:'success',title:'Voyage draft accepted after review',detail:'You adopted the downloaded Voyage changes. The original submission remains in save history; this was not an exact read-back confirmation and no write was resent.'};
  if(operation.state==='CONFIRMED')return {tone:'success',title:'Saved to Voyage',detail:'The remote draft was confirmed by read-back.'+(operation.comparison?.optionalEmptyCollections?.length?' Voyage omitted or supplied empty optional collections; these contain no world content. Your local JSON was preserved.':'')+' Your local project remains saved on this device.'};
  if(operation.state==='REJECTED')return {tone:'error',title:'Voyage save rejected',detail:(operation.detail||'Voyage rejected this save.')+' Your local project is unchanged. Resolve the error before starting another save.'};
  if(operation.state==='UNKNOWN'){
    const schemaMismatch=(operation.comparison?.paths||[]).some((path:Path)=>path.length===3&&path[0]==='world'&&path[1]==='initialGameState'&&['heroesVersion','compatibilityRevision'].includes(String(path[2])));
    return {tone:'warning',title:'Voyage save not confirmed',detail:(operation.detail||'The result of the remote save is uncertain.')+(schemaMismatch?' Voyage returned different schema-version fields. Download the current Alpha world into a separate project and merge your edited JSON there; linked imports protect these fields. This mismatch is not treated as a successful save.':'')+' Your local project is safe. Use Reconcile save to check the remote draft; do not resend automatically.'};
  }
  return {tone:'pending',title:'Voyage save awaiting confirmation',detail:'A save was prepared or sent but has not been confirmed. Your local project is safe. Use Reconcile save before trying another save.'};
}
