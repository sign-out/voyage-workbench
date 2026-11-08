import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export function curlArguments(url,options={}){
 const profiles=JSON.parse(readFileSync(new URL('../packages/core/voyage-compatibility.json',import.meta.url),'utf8'));
 const allowed=[profiles.worldSchema.source,...Object.values(profiles.environments).flatMap(profile=>[profile.contractSource,profile.apiBase+'/agent-guide.md'])];
 if(!allowed.includes(url))throw new Error('Only the configured public Voyage documentation URLs are allowed');
 return ['--disable','--proto','=https','--request','GET','--fail','--silent','--show-error','--max-time','20','--max-filesize','8388608','--header','Accept: '+(options.headers?.Accept||'application/json'),url];
}
export async function curlDocumentation(url,options){
 const {stdout}=await promisify(execFile)('curl',curlArguments(url,options),{encoding:'utf8',maxBuffer:9*1024*1024,timeout:25000});
 return new Response(stdout);
}

export function contractChanges(before,after){
 const changes=[];
 function compare(left,right,path=[]){
  if(JSON.stringify(left)===JSON.stringify(right))return;
  if(left&&right&&typeof left==='object'&&typeof right==='object'&&!Array.isArray(left)&&!Array.isArray(right))for(const key of Array.from(new Set([...Object.keys(left),...Object.keys(right)])).sort())compare(left[key],right[key],path.concat(key));
  else changes.push({path,before:left??null,after:right??null});
 }
 compare(before,after);return changes;
}
export function schemaSections(root){
 const fields={};
 function collect(node){
  if(node?._type==='intersection')node.parts.forEach(collect);
  else if(['required','partial'].includes(node?._type)&&node.fields)for(const [key,value]of Object.entries(node.fields))fields[key]=fields[key]?{_type:'intersection',parts:[fields[key],value]}:value;
  else throw new Error('Unexpected community world codec; previous references must be retained.');
 }
 collect(root.schema||root);return fields;
}
export async function checkVoyageUpdates({offline=false,schema=false,fetcher=fetch}={}){
 const profiles=JSON.parse(readFileSync(new URL('../packages/core/voyage-compatibility.json',import.meta.url),'utf8'));
 if(profiles.format!==1)throw new Error('Unsupported Voyage compatibility profile format');
 const result={checked:new Date().toISOString(),offline,environments:{},differences:[],environmentDifferences:{},warnings:[],requiresReview:false};
 for(const [environment,profile] of Object.entries(profiles.environments)){
  const baseline=JSON.parse(readFileSync(new URL('../'+profile.contractBaseline,import.meta.url),'utf8'));
  let text,guide;
  if(offline){text=JSON.stringify(baseline);guide=readFileSync(new URL('../'+profile.guideBaseline,import.meta.url),'utf8');}
  else{
   const read=async filename=>{try{const response=await fetcher(profile.apiBase+'/'+filename,{headers:{Accept:filename.endsWith('.json')?'application/json':'text/markdown'},redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('HTTP '+response.status);const text=await response.text();if(text.length>1024*1024)throw new Error('Documentation exceeds 1 MiB');return text;}catch(error){throw new Error(environment+' '+filename+': '+error.message+(error.cause?.code?' ('+error.cause.code+')':''));}};
   [text,guide]=await Promise.all([read('openapi.json'),read('agent-guide.md')]);
  }
  const contract=JSON.parse(text);
  if(contract.info?.title!=='Voyage Creator API'||!contract.paths||!guide.includes('Creator API'))throw new Error('Unexpected '+environment+' documentation');
  const changes=contractChanges(baseline,contract),hash=createHash('sha256').update(text).digest('hex'),cover=contract['x-media-constraints']?.targets?.WORLD_COVER;
  const guideHash=createHash('sha256').update(guide).digest('hex'),guideChanged=guideHash!==createHash('sha256').update(readFileSync(new URL('../'+profile.guideBaseline,import.meta.url))).digest('hex');
  result.environments[environment]={source:profile.contractSource,version:contract.info.version,hash,baselineChanges:changes,contract,guideHash,guideChanged,coverRecommendation:cover?{width:cover.recommendedWidth,height:cover.recommendedHeight}:null};
  if(changes.length||guideChanged||!offline&&hash!==profile.contractHash)result.requiresReview=true;
  if(cover&&guide.includes('`WORLD_COVER`: 1000 x 1000')&&(cover.recommendedWidth!==1000||cover.recommendedHeight!==1000))result.warnings.push(environment+' guide and contract disagree about the recommended cover size; inspect x-media-constraints.');
 }
 result.differences=contractChanges(result.environments.production.contract,result.environments.alpha.contract);
 for(const environment of Object.keys(result.environments))if(environment!=='production')result.environmentDifferences[environment]=contractChanges(result.environments.production.contract,result.environments[environment].contract);
 for(const entry of Object.values(result.environments))delete entry.contract;
 if(schema){
  const source=profiles.worldSchema.source,baseline=JSON.parse(readFileSync(new URL('../'+profiles.worldSchema.baseline,import.meta.url),'utf8'));
  let text=JSON.stringify(baseline);
  if(!offline){try{const response=await fetcher(source,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('HTTP '+response.status);text=await response.text();if(text.length>8*1024*1024)throw new Error('Community schema exceeds 8 MiB');}catch(error){throw new Error('Community schema: '+error.message+(error.cause?.code?' ('+error.cause.code+')':''));}}
  const current=schemaSections(JSON.parse(text)),prior=schemaSections(baseline),version=current.heroesVersion;
  if(version?._type!=='literal'||!Number.isSafeInteger(version.value)||version.value<1)throw new Error('Community schema lacks a verified numeric authored version');
  const changedSections=Array.from(new Set([...Object.keys(prior),...Object.keys(current)])).sort().filter(section=>JSON.stringify(prior[section])!==JSON.stringify(current[section]));
  result.worldSchema={source,authority:'Community reference, not official environment compatibility',heroesVersion:version.value,hash:createHash('sha256').update(text).digest('hex'),changedSections};
  if(changedSections.length)result.requiresReview=true;
 }
 if(offline)result.warnings.push('Offline fixture inspection only; no current deployment, rollout or engine compatibility was checked.');
 result.warnings.push('API versions are not world/schema/engine versions. Review changes even when info.version is unchanged. No credentials or mutations were used; no snapshots or release rules were overwritten.');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);if(args.some(arg=>!['--offline','--check','--schema','--curl'].includes(arg)))throw new Error('Usage: npm run voyage:check -- [--offline] [--schema] [--check] [--curl]');
  const result=await checkVoyageUpdates({offline:args.includes('--offline'),schema:args.includes('--schema'),fetcher:args.includes('--curl')?curlDocumentation:fetch});result.transport=args.includes('--curl')?'curl':'node-fetch';mkdirSync('.build-tools',{recursive:true});writeFileSync('.build-tools/voyage-update-report.json',JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');if(args.includes('--check')&&result.requiresReview)process.exitCode=2;
 }catch(error){process.stderr.write('Voyage update check failed: '+error.message+'\n');process.exitCode=1;}
}
