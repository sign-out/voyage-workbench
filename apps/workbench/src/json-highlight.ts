import {parse,type Node} from '../../../packages/core/document';

export interface JsonToken {text:string;kind:'plain'|'key'|'string'|'number'|'literal'|'punctuation'}
export function highlightJson(text:string):JsonToken[]{
 if(text.length>262144)return [{text,kind:'plain'}];
 const tokens:JsonToken[]=[],pattern=/"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;
 let offset=0,match:RegExpExecArray|null;
 while((match=pattern.exec(text))){
  if(match.index>offset)tokens.push({text:text.slice(offset,match.index),kind:'plain'});
  const value=match[0];offset=match.index+value.length;
  const kind=value.startsWith('"')?(/^\s*:/.test(text.slice(offset))?'key':'string'):/^-?\d/.test(value)?'number':/^(true|false|null)$/.test(value)?'literal':'punctuation';
  tokens.push({text:value,kind});
 }
 if(offset<text.length)tokens.push({text:text.slice(offset),kind:'plain'});
 return tokens;
}
export function formatJson(source:string){
 function format(node:Node,depth:number):string{
  if(node.kind!=='object'&&node.kind!=='array')return source.slice(node.start,node.end);
  const object=node.kind==='object',open=object?'{':'[',close=object?'}':']';if(!node.children.length)return open+close;
  const indent='  '.repeat(depth+1),entries=node.children.map(child=>{
   const prefix=source.slice(child.keyStart,child.node.start),key=object?prefix.slice(0,prefix.lastIndexOf(':')).trim()+': ':'';
   return indent+key+format(child.node,depth+1);
  });
  return open+'\n'+entries.join(',\n')+'\n'+'  '.repeat(depth)+close;
 }
 return format(parse(source),0);
}
