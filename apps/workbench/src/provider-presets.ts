import {protocols,type Profile} from '../../../packages/core/providers';

export interface ConnectionPreset {id:string;name:string;protocol:Profile['protocol'];baseUrl:string;description:string}
export const connectionPresets:ConnectionPreset[]=[
 {id:'openai',name:'OpenAI API',protocol:'openai-responses',baseUrl:'https://api.openai.com/v1',description:'API key · discover available text models.'},
 {id:'anthropic',name:'Anthropic · Claude',protocol:'anthropic',baseUrl:'https://api.anthropic.com/v1',description:'API key · Claude text models.'},
 {id:'gemini',name:'Google · Gemini',protocol:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta',description:'API key · Gemini text models.'},
 {id:'xai',name:'xAI · Grok',protocol:'openai',baseUrl:'https://api.x.ai/v1',description:'API key · Grok text and compatible image models.'},
 {id:'openrouter',name:'OpenRouter',protocol:'openai',baseUrl:'https://openrouter.ai/api/v1',description:'API key · multiple providers through one connection.'},
 {id:'local',name:'Local / custom API',protocol:'openai',baseUrl:'http://localhost:1234/v1',description:'OpenAI-compatible server · edit its endpoint after adding.'},
 ...protocols.filter(protocol=>protocol.cli).map(protocol=>({id:protocol.id,name:protocol.name,protocol:protocol.id,baseUrl:'',description:protocol.id==='codex'?'Uses the Codex sign-in managed in Connection.':protocol.id==='claude-code'?'Official CLI · native Android sign-in or installed desktop CLI.':protocol.id==='cursor'?'Official SDK on Android · installed Cursor CLI on desktop.':'Uses your installed desktop CLI and its existing sign-in.'}))
];
export function profileFromPreset(preset:ConnectionPreset,id:string):Profile{return {id,name:preset.name,protocol:preset.protocol,baseUrl:preset.baseUrl,model:'',imageModel:''};}
