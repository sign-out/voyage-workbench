export interface SchemaReference {section:string;schema:any;[key:string]:any}
const primitives=['string','number','boolean','null','unknown','any','undefined'];

export function normalizeReferences(payload:unknown):SchemaReference[] {
 let nodes=0;
 function codec(value:any,depth=0):any {
  if(++nodes>250000||depth>100)throw new Error('Schema nesting or node limit exceeded.');
  if(typeof value==='string'){
   if(primitives.indexOf(value)>=0)return value;
   if(/^"(?:[^"\\]|\\.)*"(?:\s*\|\s*"(?:[^"\\]|\\.)*")+$/.test(value.trim())){
    const literals=value.match(/"(?:[^"\\]|\\.)*"/g)!;
    nodes+=literals.length;
    if(nodes>250000||depth>=100)throw new Error('Schema nesting or node limit exceeded.');
    return {_type:'union',of:literals.map(literal=>({_type:'literal',value:JSON.parse(literal)}))};
   }
   throw new Error('Unsupported schema primitive.');
  }
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected a Voyage codec definition.');
  if(value._type==='required'||value._type==='partial'){
   if(!value.fields||typeof value.fields!=='object'||Array.isArray(value.fields))throw new Error('Schema fields must be a map.');
   const fields:Record<string,any>=Object.create(null);
   Object.keys(value.fields).forEach(key=>fields[key]=codec(value.fields[key],depth+1));
   return {...value,fields};
  }else if(value._type==='array'||value._type==='record'||value._type==='refined'){
   const key=value._type==='record'?'codomain':'of';
   return {...value,[key]:codec(value[key],depth+1)};
  }
  else if(value._type==='intersection'||value._type==='union'){
   const parts=value[value._type==='intersection'?'parts':'of'];
   if(!Array.isArray(parts)||!parts.length)throw new Error('Schema combinations must contain types.');
   return {...value,[value._type==='intersection'?'parts':'of']:parts.map(part=>codec(part,depth+1))};
  }else if(value._type!=='literal'||!Object.prototype.hasOwnProperty.call(value,'value')||value.value!==null&&['string','number','boolean'].indexOf(typeof value.value)<0)throw new Error('Unsupported Voyage codec definition.');
  return {...value};
 }
 let source:any=payload;
 if(source&&typeof source==='object'&&!source._type&&!Array.isArray(source))source=source.schema?._type?source.schema:source.sections??source.schemas??source;
 let sections:SchemaReference[];
 if(source?._type){
  source=codec(source);
  const fields:Record<string,any>=Object.create(null);
  const collect=(value:any):void=>{
   if(value._type==='intersection')value.parts.forEach(collect);
   else if(value._type==='required'||value._type==='partial')Object.keys(value.fields).forEach(key=>{
    fields[key]=Object.prototype.hasOwnProperty.call(fields,key)?{_type:'intersection',parts:[fields[key],value.fields[key]]}:value.fields[key];
   });
   else throw new Error('World schema root must describe object fields.');
  };
  collect(source);
  sections=Object.keys(fields).map(section=>({section,schema:fields[section]}));
 }else if(Array.isArray(source))sections=source;
 else if(source&&typeof source==='object')sections=Object.keys(source).map(section=>({section,schema:source[section]?.schema??source[section]}));
 else throw new Error('Schema must contain a root codec or section definitions.');
 const seen:Record<string,boolean>=Object.create(null);
 if(!sections.length)throw new Error('Schema contains no usable sections.');
 return sections.map(entry=>{
  if(!entry||typeof entry.section!=='string'||!entry.section||seen[entry.section])throw new Error('Schema sections must have unique nonempty names.');
  seen[entry.section]=true;
  return {...entry,schema:codec(entry.schema)};
 });
}

export function referenceVersion(references:SchemaReference[]):number|null {
 const entry=references.filter(reference=>reference.section==='heroesVersion')[0];
 function version(schema:any):number|undefined {
  if(schema?._type==='literal'&&typeof schema.value==='number'&&Number.isSafeInteger(schema.value)&&schema.value>0)return schema.value;
  if(schema?._type==='intersection'){
   const versions=schema.parts.map(version).filter((value:number|undefined)=>value!==undefined);
   if(versions.length&&versions.every((value:number)=>value===versions[0]))return versions[0];
  }
 }
 return version(entry?.schema)??null;
}

export function mergeReferenceSets(bundled:SchemaReference[],cached:SchemaReference[]):SchemaReference[] {
 if(cached.some(entry=>Object.prototype.hasOwnProperty.call(entry,'schemaVersion'))){
  const versions=cached.map(entry=>entry.schemaVersion).filter((version,index,values)=>typeof version==='number'&&values.indexOf(version)===index);
  return versions.reduce<SchemaReference[]>((catalog,version)=>catalog.filter(entry=>entry.schemaVersion!==version).concat(cached.filter(entry=>entry.schemaVersion===version)),bundled);
 }
 const version=referenceVersion(cached);
 if(!cached.length)return bundled;
 if(version===null)return bundled.length?bundled:cached;
 return bundled.filter(entry=>entry.schemaVersion!==version).concat(cached.map(entry=>({...entry,schemaVersion:version})));
}

export function referencesForVersion(references:SchemaReference[],version:number|null):SchemaReference[] {
 const catalog=references.some(entry=>Object.prototype.hasOwnProperty.call(entry,'schemaVersion'));
 if(catalog)return references.filter(entry=>entry.schemaVersion===version&&version!==null);
 const expected=referenceVersion(references);
 return expected===null||expected===version?references:[];
}
