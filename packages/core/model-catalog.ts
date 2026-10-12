import type {Profile} from './providers';
export interface ModelChoice {id:string;name:string;description?:string;isDefault?:boolean;source?:'fallback'}
export function modelCatalog(value:unknown):ModelChoice[]{
 if(!Array.isArray(value))throw new Error('Provider returned an invalid model catalog.');
 const found=new Map<string,ModelChoice>();
 for(const entry of value.slice(0,2000)){
  if(entry?.hidden===true)continue;
  const id=typeof entry==='string'?entry:entry?.model||entry?.id||entry?.name?.replace(/^models\//,'');
  if(typeof id!=='string'||!id.trim()||id.length>300||found.has(id))continue;
  found.set(id,{id,name:typeof entry?.displayName==='string'?entry.displayName:typeof entry?.name==='string'&&entry.id?entry.name:id,...(typeof entry?.description==='string'?{description:entry.description.slice(0,1000)}:{}),...(entry?.isDefault===true?{isDefault:true}:{})});
 }
 return [...found.values()];
}
export const claudeModelAliases:ModelChoice[]=[{id:'sonnet',name:'Sonnet (CLI alias)'},{id:'opus',name:'Opus (CLI alias)'},{id:'haiku',name:'Haiku (CLI alias)'}];
const fallbackModels:Record<'openai'|'claude'|'grok',ModelChoice[]>={
 openai:[
  {id:'gpt-6.1-sol',name:'GPT-6.1-Sol'},
  {id:'gpt-6-astra',name:'GPT-6-Astra'},
  {id:'gpt-6-sol',name:'GPT-6-Sol'},
  {id:'gpt-6-luna',name:'GPT-6-Luna'},
  {id:'gpt-5.6-sol',name:'GPT-5.6-Sol'},
  {id:'gpt-5.6-terra',name:'GPT-5.6-Terra'},
  {id:'gpt-5.6-luna',name:'GPT-5.6-Luna'}
 ],
 claude:[
  {id:'claude-opus-5-5',name:'Claude Opus 5.5'},
  {id:'claude-sonnet-5-5',name:'Claude Sonnet 5.5'},
  {id:'claude-fable-5-1',name:'Claude Fable 5.1'},
  {id:'claude-fable-5',name:'Claude Fable 5'},
  {id:'claude-opus-5',name:'Claude Opus 5'},
  {id:'claude-opus-4-8',name:'Claude Opus 4.8'},
  {id:'claude-opus-4-7',name:'Claude Opus 4.7'},
  {id:'claude-opus-4-6',name:'Claude Opus 4.6'},
  {id:'claude-opus-4-5',name:'Claude Opus 4.5'},
  {id:'claude-sonnet-5',name:'Claude Sonnet 5'},
  {id:'claude-sonnet-4-6',name:'Claude Sonnet 4.6'},
  {id:'claude-haiku-5-5',name:'Claude Haiku 5.5'},
  {id:'claude-haiku-4-5',name:'Claude Haiku 4.5'}
 ],
 grok:[
  {id:'grok-4.7',name:'Grok 4.7'},
  {id:'grok-build',name:'Grok Build'},
  {id:'grok-4.6',name:'Grok 4.6'},
  {id:'grok-4.5',name:'Grok 4.5'}
 ]
};
export function modelChoicesForProfile(profile:Profile,discovered:ModelChoice[]=[]):ModelChoice[]{
 const aliasesOnly=profile.protocol==='claude-code'&&discovered.length>0&&discovered.every(model=>claudeModelAliases.some(alias=>alias.id===model.id));
 if(discovered.length&&!aliasesOnly)return discovered;
 let hostname='';
 try{hostname=new URL(profile.baseUrl).hostname;}catch{}
 const family=profile.protocol==='codex'?'openai':profile.protocol==='claude-code'||profile.protocol==='anthropic'?'claude':
  ['openai','openai-responses'].includes(profile.protocol)?hostname==='api.x.ai'?'grok':hostname==='api.openai.com'?'openai':undefined:undefined;
 const suggestions=family?fallbackModels[family].map(model=>({...model,source:'fallback' as const})):[];
 return profile.protocol==='claude-code'?[...suggestions,...(aliasesOnly?discovered:claudeModelAliases)]:suggestions;
}
