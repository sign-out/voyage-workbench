import {at,edit,parse,read,type Path} from '../../../packages/core/document';

export type Schema=string|{_type?:string;fields?:Record<string,Schema>;parts?:Schema[];of?:Schema|Schema[];codomain?:Schema;value?:string|boolean|number};
export function schemaFields(schema?:Schema):Record<string,Schema>{
 if(!schema||typeof schema==='string')return {};
 return Object.assign({},...(schema.parts||[]).map(schemaFields),schema.fields||{});
}
export function childSchema(schema:Schema|undefined,key:string|number):Schema|undefined{
 if(!schema||typeof schema==='string')return undefined;
 if(schema._type==='record')return schema.codomain;
 if(schema._type==='array')return schema.of as Schema;
 return schemaFields(schema)[String(key)];
}
export function schemaAt(schema:Schema|undefined,path:Path){return path.reduce<Schema|undefined>((current,key)=>childSchema(current,key),schema);}
export function enumValues(schema?:Schema):string[]{
 if(!schema||typeof schema==='string'||schema._type!=='union'||!Array.isArray(schema.of))return [];
 return schema.of.every(item=>typeof item==='object'&&item._type==='literal'&&typeof item.value==='string')?schema.of.map(item=>String((item as Exclude<Schema,string>).value)):[];
}
export function initialValue(schema?:Schema):string{
 if(schema==='string')return '""';
 if(schema==='boolean')return 'false';
 if(schema==='number')return '0';
 const values=enumValues(schema);if(values.length)return JSON.stringify(values[0]);
 if(typeof schema==='object'&&schema._type==='array')return '[]';
 return '{}';
}
export function moveArrayItem(source:string,path:Path,index:number,direction:-1|1){
 const node=at(parse(source),path),target=index+direction;
 if(node.kind!=='array'||index<0||index>=node.children.length||target<0||target>=node.children.length)throw new Error('Cannot move this item.');
 const first=read(source,path.concat(index)),second=read(source,path.concat(target));
 return edit(edit(source,path.concat(index),second),path.concat(target),first);
}
export function fieldTitle(key:string|number){return typeof key==='number'?'Item '+(key+1):key.replace(/([a-z\d])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase());}
