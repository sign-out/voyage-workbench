import {parse,type Node,type Path} from './document';

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
  const paths:Path[]=[];let total=0;
  function difference(path:Path){total++;if(paths.length<20)paths.push(path);}
  function compare(expected:Node,actual:Node,path:Path){
    if(expected.kind!==actual.kind){difference(path);return;}
    if(expected.kind==='object'){
      const expectedFields:Record<string,Node>=Object.create(null),actualFields:Record<string,Node>=Object.create(null);
      expected.children.forEach(child=>expectedFields[String(child.key)]=child.node);actual.children.forEach(child=>actualFields[String(child.key)]=child.node);
      expected.children.forEach(child=>{const found=actualFields[String(child.key)];if(found)compare(child.node,found,path.concat(child.key));else difference(path.concat(child.key));});
      actual.children.forEach(child=>{if(!expectedFields[String(child.key)])difference(path.concat(child.key));});
    }else if(expected.kind==='array'){
      if(expected.children.length!==actual.children.length){difference(path);return;}
      expected.children.forEach((child,index)=>compare(child.node,actual.children[index].node,path.concat(index)));
    }else if(expected.kind==='number'){
      if(numericValue(submitted.slice(expected.start,expected.end))!==numericValue(remote.slice(actual.start,actual.end)))difference(path);
    }else if(expected.value!==actual.value)difference(path);
  }
  compare(parse(submitted),parse(remote),[]);
  return {matches:total===0,total,paths,truncated:total>paths.length};
}
export function voyageSaveFeedback(operation:any){
  if(!operation)return null;
  if(operation.state==='CONFIRMED')return {tone:'success',title:'Saved to Voyage',detail:'The remote draft was confirmed by read-back. Your local project remains saved on this device.'};
  if(operation.state==='REJECTED')return {tone:'error',title:'Voyage save rejected',detail:(operation.detail||'Voyage rejected this save.')+' Your local project is unchanged. Resolve the error before starting another save.'};
  if(operation.state==='UNKNOWN'){
    const schemaMismatch=(operation.comparison?.paths||[]).some((path:Path)=>path.length===3&&path[0]==='world'&&path[1]==='initialGameState'&&['heroesVersion','compatibilityRevision'].includes(String(path[2])));
    return {tone:'warning',title:'Voyage save not confirmed',detail:(operation.detail||'The result of the remote save is uncertain.')+(schemaMismatch?' Voyage returned different schema-version fields. Download the current Alpha world into a separate project and merge your edited JSON there; linked imports protect these fields. This mismatch is not treated as a successful save.':'')+' Your local project is safe. Use Reconcile save to check the remote draft; do not resend automatically.'};
  }
  return {tone:'pending',title:'Voyage save awaiting confirmation',detail:'A save was prepared or sent but has not been confirmed. Your local project is safe. Use Reconcile save before trying another save.'};
}
